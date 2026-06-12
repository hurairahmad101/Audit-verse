from typing import Optional
from datetime import datetime, timedelta
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel

from ....models import (
    AuditFinding, AuditIssueEscalation, AuditEngagement,
    GRCUser, get_db
)
from ....routers.auth_router import require_auth, get_user_tenants, get_user_primary_tenant

router = APIRouter(prefix="/issue-tracking", tags=["Audit - Issue Tracking"])
logger = logging.getLogger(__name__)


class EscalationCreate(BaseModel):
    finding_id: Optional[int] = None
    issue_title: str
    escalation_level: Optional[int] = 1
    escalated_to_id: Optional[int] = None
    escalation_reason: Optional[str] = None
    original_due_date: Optional[datetime] = None
    extended_due_date: Optional[datetime] = None
    notes: Optional[str] = None


class EscalationUpdate(BaseModel):
    escalation_level: Optional[int] = None
    escalated_to_id: Optional[int] = None
    escalation_reason: Optional[str] = None
    extended_due_date: Optional[datetime] = None
    resolved: Optional[bool] = None
    notes: Optional[str] = None


def serialize_escalation(e: AuditIssueEscalation) -> dict:
    finding = e.finding
    return {
        "id": e.id,
        "tenant_id": e.tenant_id,
        "finding_id": e.finding_id,
        "finding_number": finding.finding_number if finding else None,
        "finding_title": finding.title if finding else None,
        "finding_severity": finding.severity if finding else None,
        "issue_title": e.issue_title,
        "escalation_level": e.escalation_level,
        "escalated_to_id": e.escalated_to_id,
        "escalated_to_name": (e.escalated_to.display_name or e.escalated_to.username) if e.escalated_to else None,
        "escalation_reason": e.escalation_reason,
        "original_due_date": e.original_due_date.isoformat() if e.original_due_date else None,
        "extended_due_date": e.extended_due_date.isoformat() if e.extended_due_date else None,
        "days_overdue": e.days_overdue,
        "resolved": e.resolved,
        "resolved_at": e.resolved_at.isoformat() if e.resolved_at else None,
        "notes": e.notes,
        "created_at": e.created_at.isoformat() if e.created_at else None,
    }


@router.get("")
def list_escalations(
    resolved: Optional[bool] = None,
    escalation_level: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"escalations": [], "total": 0}
    query = db.query(AuditIssueEscalation).filter(
        AuditIssueEscalation.tenant_id.in_(user_tenants)
    )
    if resolved is not None:
        query = query.filter(AuditIssueEscalation.resolved == resolved)
    if escalation_level is not None:
        query = query.filter(AuditIssueEscalation.escalation_level == escalation_level)
    escalations = query.order_by(AuditIssueEscalation.created_at.desc()).all()
    return {"escalations": [serialize_escalation(e) for e in escalations], "total": len(escalations)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_escalation(
    data: EscalationCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    days_overdue = 0
    if data.original_due_date and data.original_due_date < datetime.utcnow():
        days_overdue = (datetime.utcnow() - data.original_due_date).days
    esc = AuditIssueEscalation(
        tenant_id=tenant_id,
        finding_id=data.finding_id,
        issue_title=data.issue_title,
        escalation_level=data.escalation_level or 1,
        escalated_to_id=data.escalated_to_id,
        escalation_reason=data.escalation_reason,
        original_due_date=data.original_due_date,
        extended_due_date=data.extended_due_date,
        days_overdue=days_overdue,
        notes=data.notes,
    )
    db.add(esc)
    db.commit()
    db.refresh(esc)
    return serialize_escalation(esc)


@router.get("/aging-summary")
def aging_summary(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"summary": {}}
    now = datetime.utcnow()
    findings = db.query(AuditFinding).filter(
        AuditFinding.tenant_id.in_(user_tenants),
        AuditFinding.status.notin_(["closed", "remediated"])
    ).all()
    by_severity: dict = {}
    age_distribution = {"0_30": 0, "31_60": 0, "61_90": 0, "over_90": 0}
    overdue_findings = []
    for f in findings:
        sev = (f.severity or "medium").lower()
        if sev not in by_severity:
            by_severity[sev] = {"count": 0, "overdue": 0, "avg_age_days": 0, "total_age": 0}
        age = (now - f.created_at).days if f.created_at else 0
        by_severity[sev]["count"] += 1
        by_severity[sev]["total_age"] += age
        if age <= 30:
            age_distribution["0_30"] += 1
        elif age <= 60:
            age_distribution["31_60"] += 1
        elif age <= 90:
            age_distribution["61_90"] += 1
        else:
            age_distribution["over_90"] += 1
        if f.due_date and f.due_date < now:
            by_severity[sev]["overdue"] += 1
            days_overdue = (now - f.due_date).days
            overdue_findings.append({
                "id": f.id,
                "finding_number": f.finding_number,
                "title": f.title,
                "severity": f.severity,
                "status": f.status,
                "due_date": f.due_date.isoformat(),
                "days_overdue": days_overdue,
                "owner_id": f.owner_id,
            })
    for sev_data in by_severity.values():
        cnt = sev_data["count"]
        sev_data["avg_age_days"] = round(sev_data["total_age"] / cnt, 1) if cnt > 0 else 0
        del sev_data["total_age"]
    overdue_findings.sort(key=lambda x: x["days_overdue"], reverse=True)
    escalations = db.query(AuditIssueEscalation).filter(
        AuditIssueEscalation.tenant_id.in_(user_tenants),
        AuditIssueEscalation.resolved == False
    ).all()
    return {
        "total_open_findings": len(findings),
        "total_overdue": len(overdue_findings),
        "overdue_findings": overdue_findings[:20],
        "by_severity": by_severity,
        "age_distribution": age_distribution,
        "active_escalations": len(escalations),
        "escalation_breakdown": {
            "level_1": sum(1 for e in escalations if e.escalation_level == 1),
            "level_2": sum(1 for e in escalations if e.escalation_level == 2),
            "level_3": sum(1 for e in escalations if e.escalation_level == 3),
        }
    }


@router.post("/auto-escalate")
def auto_escalate(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    now = datetime.utcnow()
    overdue_findings = db.query(AuditFinding).filter(
        AuditFinding.tenant_id == tenant_id,
        AuditFinding.status.notin_(["closed", "remediated"]),
        AuditFinding.due_date < now,
    ).all()
    created = []
    for f in overdue_findings:
        existing = db.query(AuditIssueEscalation).filter(
            AuditIssueEscalation.finding_id == f.id,
            AuditIssueEscalation.resolved == False
        ).first()
        if existing:
            continue
        days_overdue = (now - f.due_date).days if f.due_date else 0
        level = 1
        if days_overdue > 60:
            level = 3
        elif days_overdue > 30:
            level = 2
        esc = AuditIssueEscalation(
            tenant_id=tenant_id,
            finding_id=f.id,
            issue_title=f.title,
            escalation_level=level,
            escalated_to_id=f.owner_id,
            escalation_reason=f"Finding overdue by {days_overdue} days. Auto-escalated.",
            original_due_date=f.due_date,
            days_overdue=days_overdue,
        )
        db.add(esc)
        created.append(f.id)
    db.commit()
    return {"auto_escalated": len(created), "finding_ids": created}


@router.get("/{escalation_id}")
def get_escalation(
    escalation_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    esc = db.query(AuditIssueEscalation).filter(
        AuditIssueEscalation.id == escalation_id,
        AuditIssueEscalation.tenant_id.in_(user_tenants)
    ).first()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")
    return serialize_escalation(esc)


@router.put("/{escalation_id}")
def update_escalation(
    escalation_id: int,
    data: EscalationUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    esc = db.query(AuditIssueEscalation).filter(
        AuditIssueEscalation.id == escalation_id,
        AuditIssueEscalation.tenant_id.in_(user_tenants)
    ).first()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(esc, field, value)
    if data.resolved:
        esc.resolved_at = datetime.utcnow()
    db.commit()
    db.refresh(esc)
    return serialize_escalation(esc)


@router.post("/{escalation_id}/resolve")
def resolve_escalation(
    escalation_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    esc = db.query(AuditIssueEscalation).filter(
        AuditIssueEscalation.id == escalation_id,
        AuditIssueEscalation.tenant_id.in_(user_tenants)
    ).first()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")
    esc.resolved = True
    esc.resolved_at = datetime.utcnow()
    db.commit()
    return serialize_escalation(esc)


@router.delete("/{escalation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_escalation(
    escalation_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    esc = db.query(AuditIssueEscalation).filter(
        AuditIssueEscalation.id == escalation_id,
        AuditIssueEscalation.tenant_id.in_(user_tenants)
    ).first()
    if not esc:
        raise HTTPException(status_code=404, detail="Escalation not found")
    db.delete(esc)
    db.commit()
