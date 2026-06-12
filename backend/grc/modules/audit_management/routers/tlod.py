"""Three Lines of Defense (3LoD) inputs router.

Captures 1st-line self-assessments and 2nd-line risk/compliance assertions
keyed to AuditableEntity, plus a summary endpoint that powers the assurance-
gap surfacing in audit planning views. Includes per-tenant configurable
staleness thresholds, versioned audit-trail of edits, and persisted
AssuranceGap rows refreshed when inputs change.
"""
from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta
import secrets
import logging
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ....models import (
    AuditableEntity, FirstLineSelfAssessment, SecondLineAssertion,
    FirstLineSelfAssessmentRevision, SecondLineAssertionRevision,
    AssuranceGap, TlodTenantConfig, FirstLineAttestationLink,
    AuditEngagement, AuditPlanItem, GRCUser, get_db,
)

logger = logging.getLogger(__name__)
from ....routers.auth_router import (
    require_auth, get_user_tenants, get_user_primary_tenant,
)

router = APIRouter(prefix="/tlod", tags=["Audit - Three Lines of Defense"])


DEFAULT_FIRST_LINE_STALE_DAYS = 180
DEFAULT_SECOND_LINE_STALE_DAYS = 365
DEFAULT_THIRD_LINE_STALE_DAYS = 730


# ---------------------------------------------------------------------------
# Pydantic schemas
# ---------------------------------------------------------------------------

class FirstLineCreate(BaseModel):
    auditable_entity_id: int
    period_label: Optional[str] = None
    control_description: str
    design_effectiveness: str = "effective"
    operating_effectiveness: str = "effective"
    evidence_link: Optional[str] = None
    notes: Optional[str] = None
    attestation_date: Optional[datetime] = None


class FirstLineUpdate(BaseModel):
    period_label: Optional[str] = None
    control_description: Optional[str] = None
    design_effectiveness: Optional[str] = None
    operating_effectiveness: Optional[str] = None
    evidence_link: Optional[str] = None
    notes: Optional[str] = None
    attestation_date: Optional[datetime] = None


class SecondLineCreate(BaseModel):
    auditable_entity_id: int
    function_type: str = "risk"
    risk_rating: Optional[str] = None
    compliance_status: Optional[str] = None
    open_issues_count: Optional[int] = 0
    summary: Optional[str] = None
    last_review_date: Optional[datetime] = None


class SecondLineUpdate(BaseModel):
    function_type: Optional[str] = None
    risk_rating: Optional[str] = None
    compliance_status: Optional[str] = None
    open_issues_count: Optional[int] = None
    summary: Optional[str] = None
    last_review_date: Optional[datetime] = None


class TlodConfigUpdate(BaseModel):
    first_line_stale_days: Optional[int] = None
    second_line_stale_days: Optional[int] = None
    third_line_stale_days: Optional[int] = None


# ---------------------------------------------------------------------------
# Helpers: tenant config + serialization
# ---------------------------------------------------------------------------

def get_tlod_config(db: Session, tenant_id: int) -> TlodTenantConfig:
    cfg = db.query(TlodTenantConfig).filter(TlodTenantConfig.tenant_id == tenant_id).first()
    if not cfg:
        cfg = TlodTenantConfig(
            tenant_id=tenant_id,
            first_line_stale_days=DEFAULT_FIRST_LINE_STALE_DAYS,
            second_line_stale_days=DEFAULT_SECOND_LINE_STALE_DAYS,
            third_line_stale_days=DEFAULT_THIRD_LINE_STALE_DAYS,
        )
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


def _user_label(u: Optional[GRCUser]) -> Optional[str]:
    if not u:
        return None
    return u.display_name or u.username


def serialize_first_line(r: FirstLineSelfAssessment) -> Dict[str, Any]:
    user_label = _user_label(r.submitted_by)
    external_name = getattr(r, "external_submitter_name", None)
    external_email = getattr(r, "external_submitter_email", None)
    submission_source = getattr(r, "submission_source", None) or "dashboard"
    # Effective submitter label for display: prefer the linked GRCUser; fall
    # back to the external submitter name (then email) for token submissions.
    submitter_display = user_label or external_name or external_email
    return {
        "id": r.id,
        "tenant_id": r.tenant_id,
        "auditable_entity_id": r.auditable_entity_id,
        "entity_name": r.auditable_entity.name if r.auditable_entity else None,
        "period_label": r.period_label,
        "control_description": r.control_description,
        "design_effectiveness": r.design_effectiveness,
        "operating_effectiveness": r.operating_effectiveness,
        "evidence_link": r.evidence_link,
        "notes": r.notes,
        "attestation_date": r.attestation_date.isoformat() if r.attestation_date else None,
        "submitted_by_id": r.submitted_by_id,
        "submitted_by_name": submitter_display,
        "external_submitter_name": external_name,
        "external_submitter_email": external_email,
        "submission_source": submission_source,
        "attestation_link_id": getattr(r, "attestation_link_id", None),
        "updated_by_id": r.updated_by_id,
        "updated_by_name": _user_label(r.updated_by),
        "version": r.version or 1,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def serialize_second_line(r: SecondLineAssertion) -> Dict[str, Any]:
    return {
        "id": r.id,
        "tenant_id": r.tenant_id,
        "auditable_entity_id": r.auditable_entity_id,
        "entity_name": r.auditable_entity.name if r.auditable_entity else None,
        "function_type": r.function_type,
        "risk_rating": r.risk_rating,
        "compliance_status": r.compliance_status,
        "open_issues_count": r.open_issues_count or 0,
        "summary": r.summary,
        "last_review_date": r.last_review_date.isoformat() if r.last_review_date else None,
        "submitted_by_id": r.submitted_by_id,
        "submitted_by_name": _user_label(r.submitted_by),
        "updated_by_id": r.updated_by_id,
        "updated_by_name": _user_label(r.updated_by),
        "version": r.version or 1,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def serialize_revision_first(rev: FirstLineSelfAssessmentRevision) -> Dict[str, Any]:
    return {
        "id": rev.id,
        "version": rev.version,
        "snapshot": rev.snapshot,
        "changed_by_id": rev.changed_by_id,
        "changed_at": rev.changed_at.isoformat() if rev.changed_at else None,
    }


def serialize_revision_second(rev: SecondLineAssertionRevision) -> Dict[str, Any]:
    return {
        "id": rev.id,
        "version": rev.version,
        "snapshot": rev.snapshot,
        "changed_by_id": rev.changed_by_id,
        "changed_at": rev.changed_at.isoformat() if rev.changed_at else None,
    }


def _gap_status(date: Optional[datetime], stale_days: int) -> str:
    if date is None:
        return "missing"
    age = (datetime.utcnow() - date).days
    if age > stale_days:
        return "stale"
    return "current"


def _entity_in_tenant(db: Session, entity_id: int, tenants: List[int]) -> AuditableEntity:
    e = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id.in_(tenants),
    ).first()
    if not e:
        raise HTTPException(status_code=404, detail="Auditable entity not found")
    return e


# ---------------------------------------------------------------------------
# Tenant config endpoints
# ---------------------------------------------------------------------------

def _serialize_config(cfg: TlodTenantConfig) -> Dict[str, Any]:
    return {
        "tenant_id": cfg.tenant_id,
        "first_line_stale_days": cfg.first_line_stale_days,
        "second_line_stale_days": cfg.second_line_stale_days,
        "third_line_stale_days": cfg.third_line_stale_days,
        "updated_by_id": cfg.updated_by_id,
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


@router.get("/config")
def get_config(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    return _serialize_config(get_tlod_config(db, tenant_id))


@router.put("/config")
def update_config(
    data: TlodConfigUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    cfg = get_tlod_config(db, tenant_id)
    payload = data.dict(exclude_unset=True)
    for field, value in payload.items():
        if value is not None and value < 1:
            raise HTTPException(status_code=400, detail=f"{field} must be a positive integer")
        setattr(cfg, field, value if value is not None else getattr(cfg, field))
    cfg.updated_by_id = current_user.id
    db.commit()
    db.refresh(cfg)
    return _serialize_config(cfg)


# ---------------------------------------------------------------------------
# Revision helpers
# ---------------------------------------------------------------------------

def _record_first_revision(db: Session, row: FirstLineSelfAssessment, user_id: Optional[int]) -> None:
    db.add(FirstLineSelfAssessmentRevision(
        assessment_id=row.id,
        tenant_id=row.tenant_id,
        version=row.version or 1,
        snapshot=serialize_first_line(row),
        changed_by_id=user_id,
    ))


def _record_second_revision(db: Session, row: SecondLineAssertion, user_id: Optional[int]) -> None:
    db.add(SecondLineAssertionRevision(
        assertion_id=row.id,
        tenant_id=row.tenant_id,
        version=row.version or 1,
        snapshot=serialize_second_line(row),
        changed_by_id=user_id,
    ))


# ---------------------------------------------------------------------------
# 1st-line endpoints
# ---------------------------------------------------------------------------

@router.get("/first-line")
def list_first_line(
    auditable_entity_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    if not tenants:
        return {"items": [], "total": 0}
    q = db.query(FirstLineSelfAssessment).filter(
        FirstLineSelfAssessment.tenant_id.in_(tenants)
    )
    if auditable_entity_id:
        q = q.filter(FirstLineSelfAssessment.auditable_entity_id == auditable_entity_id)
    rows = q.order_by(FirstLineSelfAssessment.attestation_date.desc()).all()
    return {"items": [serialize_first_line(r) for r in rows], "total": len(rows)}


@router.post("/first-line", status_code=201)
def create_first_line(
    data: FirstLineCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    _entity_in_tenant(db, data.auditable_entity_id, [tenant_id])
    row = FirstLineSelfAssessment(
        tenant_id=tenant_id,
        auditable_entity_id=data.auditable_entity_id,
        period_label=data.period_label,
        control_description=data.control_description,
        design_effectiveness=data.design_effectiveness,
        operating_effectiveness=data.operating_effectiveness,
        evidence_link=data.evidence_link,
        notes=data.notes,
        attestation_date=data.attestation_date or datetime.utcnow(),
        submitted_by_id=current_user.id,
        version=1,
    )
    db.add(row)
    db.flush()
    _record_first_revision(db, row, current_user.id)
    db.commit()
    db.refresh(row)
    refresh_assurance_gap(db, tenant_id, data.auditable_entity_id)
    return serialize_first_line(row)


@router.put("/first-line/{row_id}")
def update_first_line(
    row_id: int,
    data: FirstLineUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    row = db.query(FirstLineSelfAssessment).filter(
        FirstLineSelfAssessment.id == row_id,
        FirstLineSelfAssessment.tenant_id.in_(tenants),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Self-assessment not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(row, field, value)
    row.version = (row.version or 1) + 1
    row.updated_by_id = current_user.id
    db.flush()
    _record_first_revision(db, row, current_user.id)
    db.commit()
    db.refresh(row)
    refresh_assurance_gap(db, row.tenant_id, row.auditable_entity_id)
    return serialize_first_line(row)


@router.delete("/first-line/{row_id}")
def delete_first_line(
    row_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    row = db.query(FirstLineSelfAssessment).filter(
        FirstLineSelfAssessment.id == row_id,
        FirstLineSelfAssessment.tenant_id.in_(tenants),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Self-assessment not found")
    tenant_id, entity_id = row.tenant_id, row.auditable_entity_id
    db.delete(row)
    db.commit()
    refresh_assurance_gap(db, tenant_id, entity_id)
    return {"deleted": True}


# ---------------------------------------------------------------------------
# 2nd-line endpoints
# ---------------------------------------------------------------------------

@router.get("/second-line")
def list_second_line(
    auditable_entity_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    if not tenants:
        return {"items": [], "total": 0}
    q = db.query(SecondLineAssertion).filter(
        SecondLineAssertion.tenant_id.in_(tenants)
    )
    if auditable_entity_id:
        q = q.filter(SecondLineAssertion.auditable_entity_id == auditable_entity_id)
    rows = q.order_by(SecondLineAssertion.last_review_date.desc()).all()
    return {"items": [serialize_second_line(r) for r in rows], "total": len(rows)}


@router.post("/second-line", status_code=201)
def create_second_line(
    data: SecondLineCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    _entity_in_tenant(db, data.auditable_entity_id, [tenant_id])
    row = SecondLineAssertion(
        tenant_id=tenant_id,
        auditable_entity_id=data.auditable_entity_id,
        function_type=data.function_type,
        risk_rating=data.risk_rating,
        compliance_status=data.compliance_status,
        open_issues_count=data.open_issues_count or 0,
        summary=data.summary,
        last_review_date=data.last_review_date or datetime.utcnow(),
        submitted_by_id=current_user.id,
        version=1,
    )
    db.add(row)
    db.flush()
    _record_second_revision(db, row, current_user.id)
    db.commit()
    db.refresh(row)
    refresh_assurance_gap(db, tenant_id, data.auditable_entity_id)
    return serialize_second_line(row)


@router.put("/second-line/{row_id}")
def update_second_line(
    row_id: int,
    data: SecondLineUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    row = db.query(SecondLineAssertion).filter(
        SecondLineAssertion.id == row_id,
        SecondLineAssertion.tenant_id.in_(tenants),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Assertion not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(row, field, value)
    row.version = (row.version or 1) + 1
    row.updated_by_id = current_user.id
    db.flush()
    _record_second_revision(db, row, current_user.id)
    db.commit()
    db.refresh(row)
    refresh_assurance_gap(db, row.tenant_id, row.auditable_entity_id)
    return serialize_second_line(row)


@router.delete("/second-line/{row_id}")
def delete_second_line(
    row_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    row = db.query(SecondLineAssertion).filter(
        SecondLineAssertion.id == row_id,
        SecondLineAssertion.tenant_id.in_(tenants),
    ).first()
    if not row:
        raise HTTPException(status_code=404, detail="Assertion not found")
    tenant_id, entity_id = row.tenant_id, row.auditable_entity_id
    db.delete(row)
    db.commit()
    refresh_assurance_gap(db, tenant_id, entity_id)
    return {"deleted": True}


# ---------------------------------------------------------------------------
# Combined summary / coverage map / gap persistence
# ---------------------------------------------------------------------------

def _latest_first_line(db: Session, entity_id: int, tenants: List[int]) -> Optional[FirstLineSelfAssessment]:
    return db.query(FirstLineSelfAssessment).filter(
        FirstLineSelfAssessment.auditable_entity_id == entity_id,
        FirstLineSelfAssessment.tenant_id.in_(tenants),
    ).order_by(FirstLineSelfAssessment.attestation_date.desc()).first()


def _latest_second_line(db: Session, entity_id: int, tenants: List[int]) -> Optional[SecondLineAssertion]:
    return db.query(SecondLineAssertion).filter(
        SecondLineAssertion.auditable_entity_id == entity_id,
        SecondLineAssertion.tenant_id.in_(tenants),
    ).order_by(SecondLineAssertion.last_review_date.desc()).first()


def _latest_audit(db: Session, entity_id: int, tenants: List[int]) -> Optional[AuditEngagement]:
    """Latest audit for the entity. Includes engagements linked directly via
    auditable_entity_id and indirectly via AuditPlanItem.auditable_entity_id."""
    direct = db.query(AuditEngagement).filter(
        AuditEngagement.auditable_entity_id == entity_id,
        AuditEngagement.tenant_id.in_(tenants),
    )
    indirect_ids = [pi.id for pi in db.query(AuditPlanItem).filter(
        AuditPlanItem.auditable_entity_id == entity_id,
        AuditPlanItem.tenant_id.in_(tenants),
    ).all()]
    indirect = db.query(AuditEngagement).filter(
        AuditEngagement.plan_item_id.in_(indirect_ids or [0]),
        AuditEngagement.tenant_id.in_(tenants),
    )
    return direct.union(indirect).order_by(
        AuditEngagement.actual_end.desc().nullslast(),
        AuditEngagement.planned_end.desc().nullslast(),
    ).first()


def _gap_severity(fl_status: str, sl_status: str, tl_status: str, risk_rating: Optional[str]) -> str:
    missing = sum(1 for s in (fl_status, sl_status, tl_status) if s == "missing")
    stale = sum(1 for s in (fl_status, sl_status, tl_status) if s == "stale")
    if missing >= 2 or (risk_rating and risk_rating.lower() in ("high", "critical") and missing >= 1):
        return "high"
    if missing == 1 or stale >= 2:
        return "medium"
    if stale == 1:
        return "low"
    return "none"


def _build_summary_row(
    db: Session, entity: AuditableEntity, tenants: List[int], cfg: TlodTenantConfig
) -> Dict[str, Any]:
    fl = _latest_first_line(db, entity.id, tenants)
    sl = _latest_second_line(db, entity.id, tenants)
    eng = _latest_audit(db, entity.id, tenants)

    fl_status = _gap_status(fl.attestation_date if fl else None, cfg.first_line_stale_days)
    sl_status = _gap_status(sl.last_review_date if sl else None, cfg.second_line_stale_days)
    third_date = (eng.actual_end or eng.planned_end) if eng else entity.last_audited_date
    tl_status = _gap_status(third_date, cfg.third_line_stale_days)

    has_gap = fl_status != "current" or sl_status != "current"
    severity = _gap_severity(fl_status, sl_status, tl_status, entity.risk_rating)

    return {
        "entity_id": entity.id,
        "entity_name": entity.name,
        "entity_type": entity.entity_type,
        "risk_rating": entity.risk_rating,
        "first_line": serialize_first_line(fl) if fl else None,
        "second_line": serialize_second_line(sl) if sl else None,
        "third_line": {
            "engagement_id": eng.id if eng else None,
            "engagement_title": eng.title if eng else None,
            "status": eng.status if eng else None,
            "opinion": eng.opinion if eng else None,
            "last_audit_date": third_date.isoformat() if third_date else None,
        } if (eng or third_date) else None,
        "first_line_status": fl_status,
        "second_line_status": sl_status,
        "third_line_status": tl_status,
        "has_assurance_gap": has_gap,
        "gap_severity": severity,
    }


def refresh_assurance_gap(db: Session, tenant_id: int, entity_id: int) -> Optional[AssuranceGap]:
    """Recompute and upsert AssuranceGap for an entity. Called whenever 3LoD inputs change."""
    entity = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id == tenant_id,
    ).first()
    if not entity:
        return None
    cfg = get_tlod_config(db, tenant_id)
    row = _build_summary_row(db, entity, [tenant_id], cfg)
    gap = db.query(AssuranceGap).filter(
        AssuranceGap.tenant_id == tenant_id,
        AssuranceGap.auditable_entity_id == entity_id,
    ).first()
    if not gap:
        gap = AssuranceGap(tenant_id=tenant_id, auditable_entity_id=entity_id)
        db.add(gap)
    gap.first_line_status = row["first_line_status"]
    gap.second_line_status = row["second_line_status"]
    gap.third_line_status = row["third_line_status"]
    gap.has_gap = row["has_assurance_gap"]
    gap.severity = row["gap_severity"]
    gap.last_evaluated_at = datetime.utcnow()
    db.commit()
    db.refresh(gap)
    return gap


@router.get("/summary")
def tlod_summary(
    only_gaps: bool = False,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    """Combined 3LoD picture across all auditable entities for the tenant."""
    tenants = get_user_tenants(current_user, db)
    if not tenants:
        return {"items": [], "total": 0, "thresholds": {
            "first_line_days": DEFAULT_FIRST_LINE_STALE_DAYS,
            "second_line_days": DEFAULT_SECOND_LINE_STALE_DAYS,
            "third_line_days": DEFAULT_THIRD_LINE_STALE_DAYS,
        }}
    # Per-entity tenant config: each entity uses its owning tenant's thresholds,
    # ensuring correct stale-status when the user has access to multiple tenants.
    cfg_cache: Dict[int, TlodTenantConfig] = {}
    def _cfg_for(t_id: int) -> TlodTenantConfig:
        if t_id not in cfg_cache:
            cfg_cache[t_id] = get_tlod_config(db, t_id)
        return cfg_cache[t_id]
    entities = db.query(AuditableEntity).filter(
        AuditableEntity.tenant_id.in_(tenants)
    ).order_by(AuditableEntity.name).all()
    rows = [_build_summary_row(db, e, tenants, _cfg_for(e.tenant_id)) for e in entities]
    primary_tenant = get_user_primary_tenant(current_user, db) or tenants[0]
    cfg = _cfg_for(primary_tenant)
    # Refresh persisted AssuranceGap rows opportunistically (cheap upsert).
    for e, row in zip(entities, rows):
        gap = db.query(AssuranceGap).filter(
            AssuranceGap.tenant_id == e.tenant_id,
            AssuranceGap.auditable_entity_id == e.id,
        ).first()
        if not gap:
            gap = AssuranceGap(tenant_id=e.tenant_id, auditable_entity_id=e.id)
            db.add(gap)
        gap.first_line_status = row["first_line_status"]
        gap.second_line_status = row["second_line_status"]
        gap.third_line_status = row["third_line_status"]
        gap.has_gap = row["has_assurance_gap"]
        gap.severity = row["gap_severity"]
        gap.last_evaluated_at = datetime.utcnow()
    db.commit()
    if only_gaps:
        rows = [r for r in rows if r["has_assurance_gap"]]
    return {
        "items": rows,
        "total": len(rows),
        "thresholds": {
            "first_line_days": cfg.first_line_stale_days,
            "second_line_days": cfg.second_line_stale_days,
            "third_line_days": cfg.third_line_stale_days,
        },
    }


@router.get("/entity/{entity_id}")
def tlod_for_entity(
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    entity = _entity_in_tenant(db, entity_id, tenants)
    cfg = get_tlod_config(db, entity.tenant_id)
    summary = _build_summary_row(db, entity, tenants, cfg)
    fl_history = db.query(FirstLineSelfAssessment).filter(
        FirstLineSelfAssessment.auditable_entity_id == entity_id,
        FirstLineSelfAssessment.tenant_id.in_(tenants),
    ).order_by(FirstLineSelfAssessment.attestation_date.desc()).all()
    sl_history = db.query(SecondLineAssertion).filter(
        SecondLineAssertion.auditable_entity_id == entity_id,
        SecondLineAssertion.tenant_id.in_(tenants),
    ).order_by(SecondLineAssertion.last_review_date.desc()).all()
    fl_revs = db.query(FirstLineSelfAssessmentRevision).filter(
        FirstLineSelfAssessmentRevision.tenant_id.in_(tenants),
        FirstLineSelfAssessmentRevision.assessment_id.in_([r.id for r in fl_history] or [0]),
    ).order_by(FirstLineSelfAssessmentRevision.changed_at.desc()).all()
    sl_revs = db.query(SecondLineAssertionRevision).filter(
        SecondLineAssertionRevision.tenant_id.in_(tenants),
        SecondLineAssertionRevision.assertion_id.in_([r.id for r in sl_history] or [0]),
    ).order_by(SecondLineAssertionRevision.changed_at.desc()).all()
    summary["first_line_history"] = [serialize_first_line(r) for r in fl_history]
    summary["second_line_history"] = [serialize_second_line(r) for r in sl_history]
    summary["first_line_revisions"] = [serialize_revision_first(r) for r in fl_revs]
    summary["second_line_revisions"] = [serialize_revision_second(r) for r in sl_revs]
    return summary


# ---------------------------------------------------------------------------
# 1st-line attestation links (token-based intake for non-admin business owners)
# ---------------------------------------------------------------------------

class AttestationLinkCreate(BaseModel):
    auditable_entity_id: int
    owner_name: Optional[str] = None
    owner_email: Optional[str] = None
    period_label: Optional[str] = None
    instructions: Optional[str] = None
    expires_days: Optional[int] = 30
    max_uses: Optional[int] = None  # None = unlimited within expiry window


class PublicAttestationSubmit(BaseModel):
    submitter_name: Optional[str] = None
    submitter_email: Optional[str] = None
    control_description: str
    design_effectiveness: str = "effective"
    operating_effectiveness: str = "effective"
    evidence_link: Optional[str] = None
    notes: Optional[str] = None


def _serialize_link(link: FirstLineAttestationLink) -> Dict[str, Any]:
    return {
        "id": link.id,
        "tenant_id": link.tenant_id,
        "auditable_entity_id": link.auditable_entity_id,
        "entity_name": link.auditable_entity.name if link.auditable_entity else None,
        "access_token": link.access_token,
        "owner_name": link.owner_name,
        "owner_email": link.owner_email,
        "period_label": link.period_label,
        "instructions": link.instructions,
        "max_uses": link.max_uses,
        "use_count": link.use_count or 0,
        "status": link.status,
        "expires_at": link.expires_at.isoformat() if link.expires_at else None,
        "last_used_at": link.last_used_at.isoformat() if link.last_used_at else None,
        "last_reminder_sent_at": link.last_reminder_sent_at.isoformat() if link.last_reminder_sent_at else None,
        "created_by_id": link.created_by_id,
        "created_at": link.created_at.isoformat() if link.created_at else None,
    }


def _link_is_usable(link: FirstLineAttestationLink) -> Optional[str]:
    """Return None if usable; otherwise an error string."""
    if link.status != "active":
        return f"Link is {link.status}"
    if link.expires_at and link.expires_at < datetime.utcnow():
        return "Link has expired"
    if link.max_uses is not None and (link.use_count or 0) >= link.max_uses:
        return "Link has reached its submission limit"
    return None


@router.get("/attestation-links")
def list_attestation_links(
    auditable_entity_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    if not tenants:
        return {"items": [], "total": 0}
    q = db.query(FirstLineAttestationLink).filter(
        FirstLineAttestationLink.tenant_id.in_(tenants)
    )
    if auditable_entity_id:
        q = q.filter(FirstLineAttestationLink.auditable_entity_id == auditable_entity_id)
    rows = q.order_by(FirstLineAttestationLink.created_at.desc()).all()
    # Auto-mark expired
    now = datetime.utcnow()
    dirty = False
    for r in rows:
        if r.status == "active" and r.expires_at and r.expires_at < now:
            r.status = "expired"
            dirty = True
    if dirty:
        db.commit()
    return {"items": [_serialize_link(r) for r in rows], "total": len(rows)}


@router.post("/attestation-links", status_code=201)
def create_attestation_link(
    data: AttestationLinkCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    _entity_in_tenant(db, data.auditable_entity_id, [tenant_id])
    expires = None
    if data.expires_days and data.expires_days > 0:
        expires = datetime.utcnow() + timedelta(days=data.expires_days)
    link = FirstLineAttestationLink(
        tenant_id=tenant_id,
        auditable_entity_id=data.auditable_entity_id,
        access_token=secrets.token_urlsafe(32),
        owner_name=data.owner_name,
        owner_email=data.owner_email,
        period_label=data.period_label,
        instructions=data.instructions,
        max_uses=data.max_uses,
        use_count=0,
        status="active",
        expires_at=expires,
        created_by_id=current_user.id,
    )
    db.add(link)
    db.commit()
    db.refresh(link)
    return _serialize_link(link)


@router.post("/attestation-links/{link_id}/revoke")
def revoke_attestation_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    link = db.query(FirstLineAttestationLink).filter(
        FirstLineAttestationLink.id == link_id,
        FirstLineAttestationLink.tenant_id.in_(tenants),
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Attestation link not found")
    link.status = "revoked"
    db.commit()
    db.refresh(link)
    return _serialize_link(link)


@router.delete("/attestation-links/{link_id}")
def delete_attestation_link(
    link_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenants = get_user_tenants(current_user, db)
    link = db.query(FirstLineAttestationLink).filter(
        FirstLineAttestationLink.id == link_id,
        FirstLineAttestationLink.tenant_id.in_(tenants),
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Attestation link not found")
    db.delete(link)
    db.commit()
    return {"deleted": True}


@router.post("/attestation-links/send-reminders")
def send_stale_reminders(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    """Find active links whose entity has no current 1st-line attestation
    (missing or older than the configured staleness window) and record a
    reminder. Email delivery is best-effort and logged when SMTP is not
    configured; the timestamp is always persisted so the same owner is not
    pinged repeatedly within 7 days."""
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    cfg = get_tlod_config(db, tenant_id)
    now = datetime.utcnow()
    stale_cutoff = now - timedelta(days=cfg.first_line_stale_days)
    cooldown = now - timedelta(days=7)

    links = db.query(FirstLineAttestationLink).filter(
        FirstLineAttestationLink.tenant_id == tenant_id,
        FirstLineAttestationLink.status == "active",
    ).all()

    reminded: List[Dict[str, Any]] = []
    skipped = 0
    for link in links:
        if link.expires_at and link.expires_at < now:
            link.status = "expired"
            continue
        if not link.owner_email:
            skipped += 1
            continue
        if link.last_reminder_sent_at and link.last_reminder_sent_at > cooldown:
            skipped += 1
            continue
        latest = _latest_first_line(db, link.auditable_entity_id, [tenant_id])
        is_stale = latest is None or (latest.attestation_date and latest.attestation_date < stale_cutoff)
        if not is_stale:
            continue
        # Best-effort log; real SMTP delivery can be wired later.
        # NOTE: never log the access_token — it grants unauthenticated submit access.
        logger.info(
            "[1st-line reminder] tenant=%s entity=%s link_id=%s to=%s",
            tenant_id, link.auditable_entity_id, link.id, link.owner_email,
        )
        link.last_reminder_sent_at = now
        reminded.append({
            "link_id": link.id,
            "entity_id": link.auditable_entity_id,
            "entity_name": link.auditable_entity.name if link.auditable_entity else None,
            "owner_email": link.owner_email,
            "owner_name": link.owner_name,
        })
    db.commit()
    return {
        "reminded": reminded,
        "reminded_count": len(reminded),
        "skipped_count": skipped,
        "stale_threshold_days": cfg.first_line_stale_days,
    }


# --- Public (no auth) token endpoints --------------------------------------

@router.get("/attest/{token}")
def public_get_attestation_context(
    token: str,
    db: Session = Depends(get_db),
):
    link = db.query(FirstLineAttestationLink).filter(
        FirstLineAttestationLink.access_token == token,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Invalid attestation link")
    err = _link_is_usable(link)
    if err:
        raise HTTPException(status_code=403, detail=err)
    entity = link.auditable_entity
    return {
        "link": {
            "owner_name": link.owner_name,
            "owner_email": link.owner_email,
            "period_label": link.period_label,
            "instructions": link.instructions,
            "expires_at": link.expires_at.isoformat() if link.expires_at else None,
            "max_uses": link.max_uses,
            "use_count": link.use_count or 0,
        },
        "entity": {
            "id": entity.id if entity else None,
            "name": entity.name if entity else None,
            "entity_type": entity.entity_type if entity else None,
            "description": getattr(entity, "description", None) if entity else None,
        },
    }


@router.post("/attest/{token}/submit", status_code=201)
def public_submit_attestation(
    token: str,
    data: PublicAttestationSubmit,
    db: Session = Depends(get_db),
):
    link = db.query(FirstLineAttestationLink).filter(
        FirstLineAttestationLink.access_token == token,
    ).first()
    if not link:
        raise HTTPException(status_code=404, detail="Invalid attestation link")
    err = _link_is_usable(link)
    if err:
        raise HTTPException(status_code=403, detail=err)
    if not (data.control_description or "").strip():
        raise HTTPException(status_code=422, detail="control_description is required")

    allowed_effectiveness = {"effective", "partially_effective", "ineffective", "not_tested"}
    design = (data.design_effectiveness or "effective").strip().lower()
    operating = (data.operating_effectiveness or "effective").strip().lower()
    if design not in allowed_effectiveness:
        raise HTTPException(status_code=422, detail=f"Invalid design_effectiveness '{data.design_effectiveness}'")
    if operating not in allowed_effectiveness:
        raise HTTPException(status_code=422, detail=f"Invalid operating_effectiveness '{data.operating_effectiveness}'")

    submitter_label = (data.submitter_name or link.owner_name or "").strip() or None
    submitter_email = (data.submitter_email or link.owner_email or "").strip() or None

    row = FirstLineSelfAssessment(
        tenant_id=link.tenant_id,
        auditable_entity_id=link.auditable_entity_id,
        period_label=link.period_label,
        control_description=data.control_description,
        design_effectiveness=design,
        operating_effectiveness=operating,
        evidence_link=data.evidence_link,
        notes=data.notes,
        attestation_date=datetime.utcnow(),
        submitted_by_id=None,
        external_submitter_name=submitter_label,
        external_submitter_email=submitter_email,
        submission_source="attestation_link",
        attestation_link_id=link.id,
        version=1,
    )
    db.add(row)
    db.flush()
    db.add(FirstLineSelfAssessmentRevision(
        assessment_id=row.id,
        tenant_id=row.tenant_id,
        version=row.version or 1,
        snapshot=serialize_first_line(row),
        changed_by_id=None,
    ))
    link.use_count = (link.use_count or 0) + 1
    link.last_used_at = datetime.utcnow()
    if link.max_uses is not None and link.use_count >= link.max_uses:
        link.status = "expired"
    db.commit()
    db.refresh(row)
    refresh_assurance_gap(db, link.tenant_id, link.auditable_entity_id)
    return {
        "submitted": True,
        "assessment_id": row.id,
        "remaining_uses": (link.max_uses - link.use_count) if link.max_uses is not None else None,
    }
