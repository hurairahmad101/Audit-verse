from typing import Optional, List, Any, Dict
from datetime import datetime, timedelta
import json
import os
import re
import logging
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session, selectinload
from pydantic import BaseModel
from openai import OpenAI

from ....models import (
    AuditCharter, CharterTemplate, CharterClause,
    CharterClauseEngagementLink, CharterClausePlanLink,
    IndependenceAttestation, AuditCommittee, AuditCommitteeApproval,
    AuditEngagement, AuditPlan, GRCUser, get_db,
)
from ....routers.auth_router import require_auth, get_user_tenants, get_user_primary_tenant

router = APIRouter(prefix="/charter", tags=["Audit - Charter"])
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# OpenAI helper
# ---------------------------------------------------------------------------

def get_openai_client() -> Optional[OpenAI]:
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    if not api_key:
        return None
    kwargs: Dict[str, Any] = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


SECTION_KEYS = ["mission", "authority", "independence_objectivity", "scope_of_work", "accountability", "standards"]


# ---------------------------------------------------------------------------
# Pydantic models
# ---------------------------------------------------------------------------

class CharterCreate(BaseModel):
    title: Optional[str] = "Internal Audit Charter"
    version: Optional[str] = "1.0"
    content: Optional[str] = None
    mission: Optional[str] = None
    authority: Optional[str] = None
    independence_objectivity: Optional[str] = None
    scope_of_work: Optional[str] = None
    accountability: Optional[str] = None
    standards: Optional[str] = None
    effective_date: Optional[datetime] = None
    review_date: Optional[datetime] = None
    next_review_due: Optional[datetime] = None
    change_reason: Optional[str] = None
    parent_charter_id: Optional[int] = None
    template_id: Optional[int] = None
    clauses: Optional[List[Dict[str, Any]]] = None


class CharterUpdate(BaseModel):
    title: Optional[str] = None
    version: Optional[str] = None
    content: Optional[str] = None
    mission: Optional[str] = None
    authority: Optional[str] = None
    independence_objectivity: Optional[str] = None
    scope_of_work: Optional[str] = None
    accountability: Optional[str] = None
    standards: Optional[str] = None
    status: Optional[str] = None
    effective_date: Optional[datetime] = None
    review_date: Optional[datetime] = None
    next_review_due: Optional[datetime] = None
    change_reason: Optional[str] = None


class CharterApprove(BaseModel):
    notes: Optional[str] = None


class CharterReject(BaseModel):
    reason: str


class CharterSubmit(BaseModel):
    committee_id: Optional[int] = None
    request_notes: Optional[str] = None


class AIGenerateCharterRequest(BaseModel):
    organization_name: Optional[str] = None
    industry: Optional[str] = None
    organization_size: Optional[str] = None
    regulatory_scope: Optional[str] = None
    reporting_to: Optional[str] = "Audit Committee"
    standards_framework: Optional[str] = "IIA Standards"
    template_id: Optional[int] = None


class ClauseUpsert(BaseModel):
    clause_code: str
    section: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    order_index: Optional[int] = 0


class ClauseLinkRequest(BaseModel):
    engagement_id: Optional[int] = None
    plan_id: Optional[int] = None


class TemplateCreate(BaseModel):
    name: str
    sector: str = "generic"
    description: Optional[str] = None
    sections: Dict[str, Any] = {}
    clauses: List[Dict[str, Any]] = []


class TemplateClone(BaseModel):
    title: Optional[str] = None
    version: Optional[str] = "1.0"
    change_reason: Optional[str] = "Cloned from template"


class AttestationCreate(BaseModel):
    period_year: int
    role_title: Optional[str] = "Chief Audit Executive"
    declarations: Dict[str, Any] = {}
    impairments_disclosed: Optional[str] = None
    digital_signature: str
    notes: Optional[str] = None
    charter_id: Optional[int] = None


# ---------------------------------------------------------------------------
# Serializers
# ---------------------------------------------------------------------------

def serialize_charter(c: AuditCharter, include_clauses: bool = False) -> dict:
    out = {
        "id": c.id,
        "tenant_id": c.tenant_id,
        "title": c.title,
        "version": c.version,
        "content": c.content,
        "mission": c.mission,
        "authority": c.authority,
        "independence_objectivity": c.independence_objectivity,
        "scope_of_work": c.scope_of_work,
        "accountability": c.accountability,
        "standards": c.standards,
        "status": c.status,
        "parent_charter_id": c.parent_charter_id,
        "change_reason": c.change_reason,
        "template_id": c.template_id,
        "next_review_due": c.next_review_due.isoformat() if c.next_review_due else None,
        "submitted_at": c.submitted_at.isoformat() if c.submitted_at else None,
        "submitted_by_id": c.submitted_by_id,
        "submitted_by_name": (c.submitted_by.display_name or c.submitted_by.username) if c.submitted_by else None,
        "submission_approval_id": c.submission_approval_id,
        "rejection_reason": c.rejection_reason,
        "approved_by_id": c.approved_by_id,
        "approved_by_name": (c.approved_by.display_name or c.approved_by.username) if c.approved_by else None,
        "approved_at": c.approved_at.isoformat() if c.approved_at else None,
        "effective_date": c.effective_date.isoformat() if c.effective_date else None,
        "review_date": c.review_date.isoformat() if c.review_date else None,
        "created_by_id": c.created_by_id,
        "created_by_name": (c.created_by.display_name or c.created_by.username) if c.created_by else None,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
    if include_clauses:
        out["clauses"] = [serialize_clause(cl) for cl in sorted(c.clauses or [], key=lambda x: (x.order_index or 0, x.id))]
    return out


def serialize_clause(cl: CharterClause) -> dict:
    return {
        "id": cl.id,
        "charter_id": cl.charter_id,
        "clause_code": cl.clause_code,
        "section": cl.section,
        "title": cl.title,
        "body": cl.body,
        "order_index": cl.order_index,
        "created_at": cl.created_at.isoformat() if cl.created_at else None,
    }


def serialize_template(t: CharterTemplate) -> dict:
    return {
        "id": t.id,
        "tenant_id": t.tenant_id,
        "sector": t.sector,
        "name": t.name,
        "description": t.description,
        "sections": t.sections or {},
        "clauses": t.clauses or [],
        "is_system": t.is_system,
        "clause_count": len(t.clauses or []),
        "created_at": t.created_at.isoformat() if t.created_at else None,
    }


def serialize_attestation(a: IndependenceAttestation) -> dict:
    return {
        "id": a.id,
        "tenant_id": a.tenant_id,
        "charter_id": a.charter_id,
        "period_year": a.period_year,
        "attested_by_id": a.attested_by_id,
        "attested_by_name": a.attested_by_name,
        "role_title": a.role_title,
        "declarations": a.declarations or {},
        "impairments_disclosed": a.impairments_disclosed,
        "digital_signature": a.digital_signature,
        "signed_at": a.signed_at.isoformat() if a.signed_at else None,
        "status": a.status,
        "notes": a.notes,
    }


# ---------------------------------------------------------------------------
# Built-in template seeding
# ---------------------------------------------------------------------------

_SYSTEM_TEMPLATES = [
    {
        "name": "BFSI Internal Audit Charter (IIA-aligned)",
        "sector": "bfsi",
        "description": "Charter aligned to IIA Standards with emphasis on regulatory expectations for banks, insurers, and capital markets firms.",
        "sections": {
            "mission": "The Internal Audit function provides independent, objective assurance and consulting services to enhance and protect organizational value, with explicit consideration of prudential, conduct, and financial-crime regulatory expectations.",
            "authority": "The Chief Audit Executive has unrestricted authority to access all records, personnel, systems, and physical premises across the bank, including outsourced and third-party operations material to its risk profile.",
            "independence_objectivity": "Internal Audit is organisationally independent from first- and second-line functions. The CAE reports functionally to the Audit Committee and administratively to the CEO. Auditors must remain objective and rotate from prior business roles per cooling-off periods.",
            "scope_of_work": "Coverage spans credit, market, liquidity, operational, conduct, AML/CFT, IT, model risk, and outsourcing risks across all business lines, branches, and legal entities, including subsidiaries and JVs.",
            "accountability": "The CAE submits an annual risk-based audit plan, periodic activity reports, and an annual opinion on the adequacy and effectiveness of governance, risk and control to the Audit Committee.",
            "standards": "All work conforms to the IIA International Standards for the Professional Practice of Internal Auditing, the Code of Ethics, and applicable supervisory guidance (e.g. Basel, local central bank IA expectations).",
        },
        "clauses": [
            {"clause_code": "1.1", "section": "mission", "title": "Purpose & Value", "body": "Provide independent assurance over the adequacy and effectiveness of governance, risk management, and internal control."},
            {"clause_code": "2.1", "section": "authority", "title": "Right of Access", "body": "Unrestricted access to records, personnel, systems and premises."},
            {"clause_code": "3.1", "section": "independence_objectivity", "title": "Reporting Lines", "body": "Functional reporting to Audit Committee; administrative to CEO."},
            {"clause_code": "3.2", "section": "independence_objectivity", "title": "Conflict & Cooling-off", "body": "Auditors recuse from areas where independence may be impaired."},
            {"clause_code": "4.1", "section": "scope_of_work", "title": "Risk-Based Coverage", "body": "Annual plan covers prudential, conduct, financial-crime, IT and model risk."},
            {"clause_code": "5.1", "section": "accountability", "title": "Annual Opinion", "body": "CAE issues an annual opinion to the Audit Committee on governance, risk and control."},
            {"clause_code": "6.1", "section": "standards", "title": "Conformance", "body": "Work conforms to IIA Standards and applicable supervisory guidance."},
        ],
    },
    {
        "name": "Healthcare Internal Audit Charter",
        "sector": "healthcare",
        "description": "Charter tailored for hospitals and health systems with patient-safety, HIPAA/HITRUST and clinical-quality emphases.",
        "sections": {
            "mission": "Internal Audit delivers independent assurance and advisory services to safeguard patient safety, protect health information, and support the integrity of clinical, operational, and financial processes.",
            "authority": "The CAE has authority to access all clinical, operational, and financial records, including PHI subject to HIPAA minimum-necessary safeguards, and to engage clinical subject-matter experts as required.",
            "independence_objectivity": "Internal Audit reports functionally to the Audit & Compliance Committee and administratively to the CEO. Auditors maintain objectivity from clinical leadership and revenue-cycle operations.",
            "scope_of_work": "Coverage includes clinical quality, patient safety, billing integrity, HIPAA/HITRUST, cybersecurity of medical devices, supply chain, and financial controls.",
            "accountability": "The CAE provides quarterly activity reports, an annual audit plan, and an annual opinion on the system of internal control to the Audit & Compliance Committee.",
            "standards": "All work conforms to the IIA International Standards and incorporates AHIA, HCCA, and HIPAA Security Rule expectations as applicable.",
        },
        "clauses": [
            {"clause_code": "1.1", "section": "mission", "title": "Patient-Safety Focus", "body": "Mission explicitly prioritises patient safety and PHI protection."},
            {"clause_code": "2.1", "section": "authority", "title": "Access to PHI", "body": "Access to PHI under HIPAA minimum-necessary controls."},
            {"clause_code": "3.1", "section": "independence_objectivity", "title": "Clinical Independence", "body": "Auditors independent of clinical operations being reviewed."},
            {"clause_code": "4.1", "section": "scope_of_work", "title": "Clinical & Compliance Coverage", "body": "Plan covers clinical quality, billing integrity, HIPAA, cyber and supply chain."},
            {"clause_code": "5.1", "section": "accountability", "title": "Committee Reporting", "body": "Quarterly reports to Audit & Compliance Committee."},
        ],
    },
    {
        "name": "Government / Public Sector Internal Audit Charter",
        "sector": "government",
        "description": "Charter for government and public-sector bodies, aligned to IIA Standards and INTOSAI principles.",
        "sections": {
            "mission": "Internal Audit provides independent and objective assurance and advice to enhance public accountability, value-for-money, and the integrity of public-sector operations.",
            "authority": "The Head of Internal Audit has authority to access all records, personnel, and premises of the entity and its delivery partners, with due regard to statutory confidentiality obligations.",
            "independence_objectivity": "Internal Audit is organisationally independent and reports functionally to the Audit Committee (or equivalent oversight body) and administratively to the Accounting Officer / Permanent Secretary.",
            "scope_of_work": "Coverage spans financial management, procurement, programme delivery, IT, fraud, and compliance with public-sector regulations and parliamentary appropriations.",
            "accountability": "An annual risk-based audit plan, activity reports, and an annual assurance statement are provided to the Audit Committee and the Accounting Officer.",
            "standards": "Work conforms to the IIA International Standards and INTOSAI Guidelines for Internal Control in the Public Sector (INTOSAI GOV 9100).",
        },
        "clauses": [
            {"clause_code": "1.1", "section": "mission", "title": "Public Accountability", "body": "Support transparency and value-for-money in public spending."},
            {"clause_code": "2.1", "section": "authority", "title": "Right of Access", "body": "Access to all records and delivery partners' information."},
            {"clause_code": "3.1", "section": "independence_objectivity", "title": "Reporting Lines", "body": "Reports functionally to Audit Committee, administratively to Accounting Officer."},
            {"clause_code": "4.1", "section": "scope_of_work", "title": "Programme & Procurement Coverage", "body": "Coverage of procurement, grants, programme delivery and fraud."},
            {"clause_code": "5.1", "section": "accountability", "title": "Annual Assurance", "body": "Annual assurance statement to Accounting Officer."},
        ],
    },
    {
        "name": "Generic Enterprise Internal Audit Charter",
        "sector": "generic",
        "description": "A baseline IIA-aligned charter suitable for most enterprises; tailor sections after cloning.",
        "sections": {
            "mission": "Internal Audit provides independent, objective assurance and consulting services designed to add value and improve the organisation's operations, risk management, and governance processes.",
            "authority": "The CAE has full and unrestricted access to all functions, records, property, and personnel relevant to the performance of engagements.",
            "independence_objectivity": "Internal auditors are independent of the activities they audit and remain objective when forming judgments about audit results.",
            "scope_of_work": "Scope encompasses financial, operational, compliance and IT audit activities across all business units and processes.",
            "accountability": "The CAE reports functionally to the Audit Committee and administratively to the CEO and provides periodic reports on plan execution and significant findings.",
            "standards": "All audit activities conform to the IIA International Standards for the Professional Practice of Internal Auditing and the IIA Code of Ethics.",
        },
        "clauses": [
            {"clause_code": "1.1", "section": "mission", "title": "Mandate", "body": "Provide independent, objective assurance and advisory services."},
            {"clause_code": "2.1", "section": "authority", "title": "Access", "body": "Full access to records, personnel and property."},
            {"clause_code": "3.1", "section": "independence_objectivity", "title": "Independence", "body": "Auditors independent of activities audited."},
            {"clause_code": "4.1", "section": "scope_of_work", "title": "Coverage", "body": "Financial, operational, compliance and IT audits."},
            {"clause_code": "5.1", "section": "accountability", "title": "Reporting", "body": "Periodic reports to Audit Committee and CEO."},
            {"clause_code": "6.1", "section": "standards", "title": "Conformance", "body": "Conforms to IIA Standards and Code of Ethics."},
        ],
    },
]


def _ensure_system_templates(db: Session) -> None:
    """Idempotently create the four built-in system templates."""
    try:
        existing = {t.name for t in db.query(CharterTemplate).filter(CharterTemplate.is_system == True).all()}
        for tpl in _SYSTEM_TEMPLATES:
            if tpl["name"] in existing:
                continue
            db.add(CharterTemplate(
                tenant_id=None,
                sector=tpl["sector"],
                name=tpl["name"],
                description=tpl["description"],
                sections=tpl["sections"],
                clauses=tpl["clauses"],
                is_system=True,
            ))
        db.commit()
    except Exception as exc:
        logger.warning(f"Could not seed system charter templates: {exc}")
        db.rollback()


# ---------------------------------------------------------------------------
# Charter CRUD
# ---------------------------------------------------------------------------

@router.get("")
def list_charters(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"charters": [], "total": 0}
    charters = db.query(AuditCharter).filter(
        AuditCharter.tenant_id.in_(user_tenants)
    ).order_by(AuditCharter.created_at.desc()).all()
    return {"charters": [serialize_charter(c) for c in charters], "total": len(charters)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_charter(
    data: CharterCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")

    parent = None
    if data.parent_charter_id:
        parent = db.query(AuditCharter).filter(
            AuditCharter.id == data.parent_charter_id,
            AuditCharter.tenant_id == tenant_id,
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent charter not found")

    payload = data.dict(exclude={"parent_charter_id", "template_id"})
    if parent:
        # Inherit sections that the caller did not override.
        for k in SECTION_KEYS + ["title"]:
            if not payload.get(k):
                payload[k] = getattr(parent, k)

    charter = AuditCharter(
        tenant_id=tenant_id,
        title=payload.get("title") or "Internal Audit Charter",
        version=payload.get("version") or "1.0",
        content=payload.get("content"),
        mission=payload.get("mission"),
        authority=payload.get("authority"),
        independence_objectivity=payload.get("independence_objectivity"),
        scope_of_work=payload.get("scope_of_work"),
        accountability=payload.get("accountability"),
        standards=payload.get("standards"),
        effective_date=payload.get("effective_date"),
        review_date=payload.get("review_date"),
        next_review_due=payload.get("next_review_due"),
        change_reason=payload.get("change_reason"),
        parent_charter_id=parent.id if parent else None,
        template_id=data.template_id,
        created_by_id=current_user.id,
    )
    db.add(charter)
    db.commit()
    db.refresh(charter)

    # Persist clauses: explicit payload wins; otherwise inherit from parent.
    if data.clauses:
        for idx, cl in enumerate(data.clauses):
            if not isinstance(cl, dict):
                continue
            db.add(CharterClause(
                charter_id=charter.id, tenant_id=tenant_id,
                clause_code=str(cl.get("clause_code") or f"{idx + 1}"),
                section=cl.get("section"),
                title=cl.get("title"),
                body=cl.get("body"),
                order_index=cl.get("order_index") if cl.get("order_index") is not None else idx,
            ))
        db.commit()
    elif parent:
        for cl in parent.clauses or []:
            db.add(CharterClause(
                charter_id=charter.id, tenant_id=tenant_id,
                clause_code=cl.clause_code, section=cl.section,
                title=cl.title, body=cl.body, order_index=cl.order_index,
            ))
        db.commit()

    db.refresh(charter)
    return serialize_charter(charter, include_clauses=True)


# Statuses where the charter (and its clauses) become immutable.
_FROZEN_CHARTER_STATUSES = {"approved", "superseded", "submitted", "under_review"}


def _ensure_charter_editable(charter: AuditCharter) -> None:
    if (charter.status or "draft") in _FROZEN_CHARTER_STATUSES:
        raise HTTPException(
            status_code=409,
            detail=f"Charter v{charter.version} is {charter.status} and cannot be modified. Create a new version instead.",
        )


@router.get("/current")
def get_current_charter(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return None
    charter = db.query(AuditCharter).filter(
        AuditCharter.tenant_id.in_(user_tenants),
        AuditCharter.status == "approved"
    ).order_by(AuditCharter.approved_at.desc()).first()
    if not charter:
        charter = db.query(AuditCharter).filter(
            AuditCharter.tenant_id.in_(user_tenants)
        ).order_by(AuditCharter.created_at.desc()).first()
    return serialize_charter(charter, include_clauses=True) if charter else None


# ---------------------------------------------------------------------------
# Templates (declared BEFORE /{charter_id} routes to avoid path conflicts)
# ---------------------------------------------------------------------------

@router.get("/templates")
def list_templates(
    sector: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    _ensure_system_templates(db)
    user_tenants = get_user_tenants(current_user, db)
    q = db.query(CharterTemplate).filter(
        (CharterTemplate.is_system == True) |
        (CharterTemplate.tenant_id.in_(user_tenants) if user_tenants else False)
    )
    if sector:
        q = q.filter(CharterTemplate.sector == sector)
    tpls = q.order_by(CharterTemplate.is_system.desc(), CharterTemplate.sector, CharterTemplate.name).all()
    return {"templates": [serialize_template(t) for t in tpls], "total": len(tpls)}


@router.post("/templates", status_code=status.HTTP_201_CREATED)
def create_template(
    data: TemplateCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    t = CharterTemplate(
        tenant_id=tenant_id, sector=data.sector, name=data.name,
        description=data.description, sections=data.sections, clauses=data.clauses,
        is_system=False,
    )
    db.add(t); db.commit(); db.refresh(t)
    return serialize_template(t)


@router.post("/templates/{template_id}/clone", status_code=status.HTTP_201_CREATED)
def clone_template(
    template_id: int,
    data: TemplateClone,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    user_tenants = get_user_tenants(current_user, db)
    t = db.query(CharterTemplate).filter(
        CharterTemplate.id == template_id,
        ((CharterTemplate.is_system == True) | (CharterTemplate.tenant_id.in_(user_tenants)))
    ).first()
    if not t:
        raise HTTPException(status_code=404, detail="Template not found")

    sections = t.sections or {}
    charter = AuditCharter(
        tenant_id=tenant_id,
        title=data.title or "Internal Audit Charter",
        version=data.version or "1.0",
        mission=sections.get("mission"),
        authority=sections.get("authority"),
        independence_objectivity=sections.get("independence_objectivity"),
        scope_of_work=sections.get("scope_of_work"),
        accountability=sections.get("accountability"),
        standards=sections.get("standards"),
        change_reason=data.change_reason or f"Cloned from template '{t.name}'",
        template_id=t.id,
        next_review_due=datetime.utcnow() + timedelta(days=365),
        created_by_id=current_user.id,
    )
    db.add(charter); db.commit(); db.refresh(charter)
    for idx, cl in enumerate(t.clauses or []):
        db.add(CharterClause(
            charter_id=charter.id, tenant_id=tenant_id,
            clause_code=cl.get("clause_code") or f"C{idx+1}",
            section=cl.get("section"), title=cl.get("title"),
            body=cl.get("body"), order_index=cl.get("order_index", idx),
        ))
    db.commit(); db.refresh(charter)
    return serialize_charter(charter, include_clauses=True)


# ---------------------------------------------------------------------------
# Diff (declared BEFORE /{charter_id} for path resolution)
# ---------------------------------------------------------------------------

@router.get("/diff")
def diff_charters(
    a: int,
    b: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    ca = db.query(AuditCharter).filter(AuditCharter.id == a, AuditCharter.tenant_id.in_(user_tenants)).first()
    cb = db.query(AuditCharter).filter(AuditCharter.id == b, AuditCharter.tenant_id.in_(user_tenants)).first()
    if not ca or not cb:
        raise HTTPException(status_code=404, detail="One or both versions not found")
    return {
        "a": serialize_charter(ca, include_clauses=True),
        "b": serialize_charter(cb, include_clauses=True),
    }


# ---------------------------------------------------------------------------
# Independence attestations (declared BEFORE /{charter_id})
# ---------------------------------------------------------------------------

@router.get("/attestations")
def list_attestations(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"attestations": [], "total": 0, "current_year_filed": False}
    rows = db.query(IndependenceAttestation).filter(
        IndependenceAttestation.tenant_id.in_(user_tenants)
    ).order_by(IndependenceAttestation.period_year.desc(), IndependenceAttestation.signed_at.desc()).all()
    current_year = datetime.utcnow().year
    filed = any(r.period_year == current_year for r in rows)
    return {
        "attestations": [serialize_attestation(r) for r in rows],
        "total": len(rows),
        "current_year": current_year,
        "current_year_filed": filed,
        "overdue": not filed,
    }


@router.get("/due-review")
def due_review_alerts(
    window_days: int = 30,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    """Charters whose next_review_due is overdue or within `window_days`."""
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"alerts": [], "total": 0}
    now = datetime.utcnow()
    horizon = now + timedelta(days=window_days)
    rows = db.query(AuditCharter).filter(
        AuditCharter.tenant_id.in_(user_tenants),
        AuditCharter.status == "approved",
        AuditCharter.next_review_due.isnot(None),
        AuditCharter.next_review_due <= horizon,
    ).order_by(AuditCharter.next_review_due.asc()).all()
    out = []
    for c in rows:
        days = (c.next_review_due - now).days if c.next_review_due else None
        out.append({
            "id": c.id, "title": c.title, "version": c.version,
            "next_review_due": c.next_review_due.isoformat() if c.next_review_due else None,
            "days_remaining": days,
            "overdue": days is not None and days < 0,
        })
    return {"alerts": out, "total": len(out), "window_days": window_days}


@router.post("/attestations", status_code=status.HTTP_201_CREATED)
def create_attestation(
    data: AttestationCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    if not (data.digital_signature or "").strip():
        raise HTTPException(status_code=422, detail="Digital signature is required")
    existing = db.query(IndependenceAttestation).filter(
        IndependenceAttestation.tenant_id == tenant_id,
        IndependenceAttestation.period_year == data.period_year,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Attestation for {data.period_year} already filed (immutable).")
    # Validate charter_id belongs to this tenant if provided.
    charter_fk: Optional[int] = None
    if data.charter_id:
        owns = db.query(AuditCharter.id).filter(
            AuditCharter.id == data.charter_id,
            AuditCharter.tenant_id == tenant_id,
        ).first()
        if not owns:
            raise HTTPException(status_code=404, detail="Charter not found in this tenant")
        charter_fk = data.charter_id
    a = IndependenceAttestation(
        tenant_id=tenant_id, charter_id=charter_fk,
        period_year=data.period_year,
        attested_by_id=current_user.id,
        attested_by_name=current_user.display_name or current_user.username,
        role_title=data.role_title,
        declarations=data.declarations,
        impairments_disclosed=data.impairments_disclosed,
        digital_signature=data.digital_signature.strip(),
        notes=data.notes,
    )
    db.add(a); db.commit(); db.refresh(a)
    return serialize_attestation(a)


# ---------------------------------------------------------------------------
# AI generate
# ---------------------------------------------------------------------------

@router.post("/ai/generate")
def ai_generate_charter(
    data: AIGenerateCharterRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    client = get_openai_client()
    context = f"Organization: {data.organization_name or 'the organization'}"
    if data.industry:
        context += f", Industry: {data.industry}"
    if data.organization_size:
        context += f", Size: {data.organization_size}"
    if data.regulatory_scope:
        context += f", Regulatory scope: {data.regulatory_scope}"

    template_seed: Dict[str, Any] = {}
    template_clauses: List[Dict[str, Any]] = []
    if data.template_id:
        user_tenants_ai = get_user_tenants(current_user, db) or []
        tpl_q = db.query(CharterTemplate).filter(
            CharterTemplate.id == data.template_id,
            ((CharterTemplate.is_system == True) | (CharterTemplate.tenant_id.in_(user_tenants_ai))),
        )
        tpl = tpl_q.first()
        if tpl:
            template_seed = tpl.sections or {}
            template_clauses = tpl.clauses or []

    default_charter = {
        "mission": template_seed.get("mission") or "The Internal Audit function provides independent, objective assurance and consulting services designed to add value and improve the organization's operations.",
        "authority": template_seed.get("authority") or "The Chief Audit Executive (CAE) has authority to access all records, personnel, and physical properties relevant to the performance of engagements.",
        "independence_objectivity": template_seed.get("independence_objectivity") or "Internal auditors are independent from the activities they audit and remain objective when forming judgments about audit areas.",
        "scope_of_work": template_seed.get("scope_of_work") or "The scope encompasses financial, operational, compliance, and IT audits across all business units and processes.",
        "accountability": template_seed.get("accountability") or "The CAE reports functionally to the Audit Committee and administratively to the CEO, ensuring independence from management.",
        "standards": template_seed.get("standards") or f"All audit activities conform to the {data.standards_framework or 'IIA International Standards for the Professional Practice of Internal Auditing'}.",
        "clauses": template_clauses,
    }
    if not client:
        return {**default_charter, "source": "template", "message": "AI not configured — returning template defaults."}

    prompt = f"""Generate a professional Internal Audit Charter for {context}.
The charter should report to {data.reporting_to or 'Audit Committee'} and comply with {data.standards_framework or 'IIA Standards'}.

Return strict JSON with keys:
  mission, authority, independence_objectivity, scope_of_work, accountability, standards,
  clauses (array of objects with clause_code, section, title, body — 5 to 10 clauses).
Each section value should be 2-4 sentences of professional, IIA-compliant language."""

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.2,
            messages=[
                {"role": "system", "content": "Return valid JSON only."},
                {"role": "user", "content": prompt},
            ],
        )
        content = (completion.choices[0].message.content or "").strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        parsed = json.loads(content) or {}
        merged = {**default_charter, **{k: v for k, v in parsed.items() if v}}
        if isinstance(parsed.get("clauses"), list) and parsed["clauses"]:
            merged["clauses"] = parsed["clauses"]
        return {**merged, "source": "ai"}
    except Exception as exc:
        logger.warning(f"AI charter generation failed: {exc}")
        return {**default_charter, "source": "template", "message": f"AI generation failed: {exc}. Returning template defaults."}


# ---------------------------------------------------------------------------
# Per-charter routes
# ---------------------------------------------------------------------------

@router.get("/{charter_id:int}")
def get_charter(
    charter_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    charter = db.query(AuditCharter).filter(
        AuditCharter.id == charter_id,
        AuditCharter.tenant_id.in_(user_tenants)
    ).first()
    if not charter:
        raise HTTPException(status_code=404, detail="Charter not found")
    return serialize_charter(charter, include_clauses=True)


@router.put("/{charter_id:int}")
def update_charter(
    charter_id: int,
    data: CharterUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    """Versioned update: never mutates the existing row. Creates and returns
    a new child charter version with the provided fields applied on top of
    the parent. Enforces the lifecycle requirement that every save produces
    a new immutable AuditCharter record."""
    user_tenants = get_user_tenants(current_user, db)
    parent = db.query(AuditCharter).filter(
        AuditCharter.id == charter_id,
        AuditCharter.tenant_id.in_(user_tenants)
    ).first()
    if not parent:
        raise HTTPException(status_code=404, detail="Charter not found")
    payload = data.dict(exclude_unset=True)
    payload.pop("status", None)  # status only via submit/committee decide

    # Build the child by inheriting parent fields then overlaying the patch.
    inherit = ["title", "content", "mission", "authority",
               "independence_objectivity", "scope_of_work", "accountability",
               "standards", "effective_date", "review_date"]
    child_kwargs = {k: getattr(parent, k) for k in inherit}
    child_kwargs.update({k: v for k, v in payload.items() if k != "version"})

    new_version = payload.get("version")
    if not new_version or new_version == parent.version:
        m = re.match(r"^(\d+)\.(\d+)$", str(parent.version or "1.0"))
        new_version = f"{m.group(1)}.{int(m.group(2)) + 1}" if m else f"{parent.version}.next"

    child = AuditCharter(
        tenant_id=parent.tenant_id,
        version=new_version,
        next_review_due=payload.get("next_review_due") or parent.next_review_due,
        change_reason=payload.get("change_reason") or f"Edit of v{parent.version}",
        parent_charter_id=parent.id,
        template_id=parent.template_id,
        created_by_id=current_user.id,
        **child_kwargs,
    )
    db.add(child); db.commit(); db.refresh(child)

    # Carry clauses forward so traceability/coverage continues on the new version.
    for cl in parent.clauses or []:
        db.add(CharterClause(
            charter_id=child.id, tenant_id=child.tenant_id,
            clause_code=cl.clause_code, section=cl.section,
            title=cl.title, body=cl.body, order_index=cl.order_index,
        ))
    db.commit(); db.refresh(child)
    return serialize_charter(child, include_clauses=True)


@router.post("/{charter_id:int}/submit-for-approval")
def submit_for_approval(
    charter_id: int,
    data: CharterSubmit,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    charter = db.query(AuditCharter).filter(
        AuditCharter.id == charter_id,
        AuditCharter.tenant_id.in_(user_tenants)
    ).first()
    if not charter:
        raise HTTPException(status_code=404, detail="Charter not found")
    # Allowed: draft (initial), rejected (resubmit after fix),
    # approved (annual re-approval when next_review_due is reached or past).
    if charter.status in ("draft", "rejected"):
        pass
    elif charter.status == "approved":
        if not charter.next_review_due or charter.next_review_due > datetime.utcnow() + timedelta(days=30):
            raise HTTPException(
                status_code=409,
                detail="Approved charter is not yet within its annual re-approval window (30 days before next_review_due).",
            )
    else:
        raise HTTPException(status_code=409, detail=f"Charter is already in status '{charter.status}'.")

    committee_q = db.query(AuditCommittee).filter(AuditCommittee.tenant_id == charter.tenant_id)
    committee = (committee_q.filter(AuditCommittee.id == data.committee_id).first()
                 if data.committee_id else committee_q.order_by(AuditCommittee.id.asc()).first())
    if not committee:
        raise HTTPException(status_code=404, detail="No Audit Committee found for this tenant. Create one first.")

    approval = AuditCommitteeApproval(
        committee_id=committee.id,
        tenant_id=charter.tenant_id,
        target_type="audit_charter",
        target_id=charter.id,
        target_label=f"{charter.title} v{charter.version}",
        request_notes=data.request_notes,
        requested_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(approval); db.flush()
    charter.status = "submitted"
    charter.submitted_at = datetime.utcnow()
    charter.submitted_by_id = current_user.id
    charter.submission_approval_id = approval.id
    charter.rejection_reason = None
    db.commit(); db.refresh(charter); db.refresh(approval)
    return {
        "charter": serialize_charter(charter, include_clauses=True),
        "approval_id": approval.id,
        "committee_id": committee.id,
    }


# NOTE: Direct /approve and /reject endpoints have been removed.
# Charter status transitions (under_review / approved / rejected) are driven
# exclusively by AuditCommitteeApproval.decide_approval() in the committee
# module, which enforces chair/vice-chair/secretary authorization and
# requires a digital signature for approvals.


# ---------- Clauses & traceability ----------

@router.get("/{charter_id:int}/clauses")
def list_clauses(
    charter_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    charter = db.query(AuditCharter).filter(
        AuditCharter.id == charter_id, AuditCharter.tenant_id.in_(user_tenants)
    ).first()
    if not charter:
        raise HTTPException(status_code=404, detail="Charter not found")
    clauses = sorted(charter.clauses or [], key=lambda x: (x.order_index or 0, x.id))
    return {"clauses": [serialize_clause(c) for c in clauses], "total": len(clauses)}


@router.post("/{charter_id:int}/clauses", status_code=status.HTTP_201_CREATED)
def create_clause(
    charter_id: int,
    data: ClauseUpsert,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    charter = db.query(AuditCharter).filter(
        AuditCharter.id == charter_id, AuditCharter.tenant_id.in_(user_tenants)
    ).first()
    if not charter:
        raise HTTPException(status_code=404, detail="Charter not found")
    _ensure_charter_editable(charter)
    cl = CharterClause(
        charter_id=charter.id, tenant_id=charter.tenant_id,
        clause_code=data.clause_code, section=data.section,
        title=data.title, body=data.body, order_index=data.order_index or 0,
    )
    db.add(cl); db.commit(); db.refresh(cl)
    return serialize_clause(cl)


@router.put("/clauses/{clause_id:int}")
def update_clause(
    clause_id: int,
    data: ClauseUpsert,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    cl = db.query(CharterClause).filter(
        CharterClause.id == clause_id, CharterClause.tenant_id.in_(user_tenants)
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Clause not found")
    _ensure_charter_editable(cl.charter)
    for f, v in data.dict(exclude_unset=True).items():
        setattr(cl, f, v)
    cl.updated_at = datetime.utcnow()
    db.commit(); db.refresh(cl)
    return serialize_clause(cl)


@router.delete("/clauses/{clause_id:int}")
def delete_clause(
    clause_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    cl = db.query(CharterClause).filter(
        CharterClause.id == clause_id, CharterClause.tenant_id.in_(user_tenants)
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Clause not found")
    _ensure_charter_editable(cl.charter)
    db.delete(cl); db.commit()
    return {"deleted": clause_id}


@router.post("/clauses/{clause_id:int}/links", status_code=status.HTTP_201_CREATED)
def link_clause(
    clause_id: int,
    data: ClauseLinkRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    cl = db.query(CharterClause).filter(
        CharterClause.id == clause_id, CharterClause.tenant_id.in_(user_tenants)
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Clause not found")
    # Note: link/unlink intentionally does NOT call _ensure_charter_editable.
    # Coverage links are traceability metadata and must remain editable on
    # approved charters so engagements/plans can be mapped throughout the
    # active charter's lifetime.
    if data.engagement_id:
        eng = db.query(AuditEngagement).filter(
            AuditEngagement.id == data.engagement_id, AuditEngagement.tenant_id == cl.tenant_id
        ).first()
        if not eng:
            raise HTTPException(status_code=404, detail="Engagement not found in this tenant")
        exists = db.query(CharterClauseEngagementLink).filter(
            CharterClauseEngagementLink.clause_id == cl.id,
            CharterClauseEngagementLink.engagement_id == eng.id,
        ).first()
        if not exists:
            db.add(CharterClauseEngagementLink(clause_id=cl.id, engagement_id=eng.id, tenant_id=cl.tenant_id))
    if data.plan_id:
        plan = db.query(AuditPlan).filter(
            AuditPlan.id == data.plan_id, AuditPlan.tenant_id == cl.tenant_id
        ).first()
        if not plan:
            raise HTTPException(status_code=404, detail="Plan not found in this tenant")
        exists = db.query(CharterClausePlanLink).filter(
            CharterClausePlanLink.clause_id == cl.id,
            CharterClausePlanLink.plan_id == plan.id,
        ).first()
        if not exists:
            db.add(CharterClausePlanLink(clause_id=cl.id, plan_id=plan.id, tenant_id=cl.tenant_id))
    db.commit()
    return {"clause_id": cl.id, "engagement_id": data.engagement_id, "plan_id": data.plan_id}


@router.delete("/clauses/{clause_id:int}/links")
def unlink_clause(
    clause_id: int,
    engagement_id: Optional[int] = None,
    plan_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    cl = db.query(CharterClause).filter(
        CharterClause.id == clause_id, CharterClause.tenant_id.in_(user_tenants)
    ).first()
    if not cl:
        raise HTTPException(status_code=404, detail="Clause not found")
    # Link/unlink stays open on approved charters (traceability metadata).
    if engagement_id:
        db.query(CharterClauseEngagementLink).filter(
            CharterClauseEngagementLink.clause_id == cl.id,
            CharterClauseEngagementLink.engagement_id == engagement_id,
        ).delete()
    if plan_id:
        db.query(CharterClausePlanLink).filter(
            CharterClausePlanLink.clause_id == cl.id,
            CharterClausePlanLink.plan_id == plan_id,
        ).delete()
    db.commit()
    return {"unlinked": True}


@router.get("/{charter_id:int}/coverage")
def charter_coverage(
    charter_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    charter = db.query(AuditCharter).options(
        selectinload(AuditCharter.clauses)
            .selectinload(CharterClause.engagement_links)
            .selectinload(CharterClauseEngagementLink.engagement),
        selectinload(AuditCharter.clauses)
            .selectinload(CharterClause.plan_links)
            .selectinload(CharterClausePlanLink.plan),
    ).filter(
        AuditCharter.id == charter_id, AuditCharter.tenant_id.in_(user_tenants)
    ).first()
    if not charter:
        raise HTTPException(status_code=404, detail="Charter not found")
    rows: List[Dict[str, Any]] = []
    covered = 0
    for cl in sorted(charter.clauses or [], key=lambda x: (x.order_index or 0, x.id)):
        engagements = []
        for link in cl.engagement_links or []:
            eng = link.engagement
            if not eng:
                continue
            engagements.append({
                "id": eng.id,
                "title": getattr(eng, "title", None) or f"Engagement #{eng.id}",
                "status": getattr(eng, "status", None),
            })
        plans = []
        for link in cl.plan_links or []:
            p = link.plan
            if not p:
                continue
            plans.append({
                "id": p.id,
                "name": getattr(p, "name", None) or f"Plan #{p.id}",
                "fiscal_year": getattr(p, "fiscal_year", None),
            })
        is_covered = bool(engagements) or bool(plans)
        if is_covered:
            covered += 1
        rows.append({
            **serialize_clause(cl),
            "engagements": engagements,
            "plans": plans,
            "covered": is_covered,
        })
    total = len(rows)
    return {
        "charter_id": charter.id,
        "total_clauses": total,
        "covered_clauses": covered,
        "coverage_percent": round((covered / total * 100), 1) if total else 0.0,
        "rows": rows,
    }
