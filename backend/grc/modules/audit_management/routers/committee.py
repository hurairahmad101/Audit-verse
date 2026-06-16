from typing import Optional, List
from datetime import datetime, timedelta
import json
import os
import logging
import os
import uuid as _uuid
from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from openai import OpenAI

from ....models import (
    AuditCommittee, AuditCommitteeMember, AuditCommitteeMeeting, AuditCommitteeAgendaItem,
    AuditCommitteeResolution, AuditCommitteeActionItem, AuditCommitteePreRead, AuditCommitteeAcknowledgment,
    AuditCommitteeApproval, AuditCharter, AuditPlan, AuditPlanItem, AuditEngagement, AuditFinding,
    GRCUser, get_db,
)
from ....routers.auth_router import require_auth, get_user_tenants, get_user_primary_tenant

router = APIRouter(prefix="/committee", tags=["Audit - Committee"])
logger = logging.getLogger(__name__)


def get_openai_client() -> Optional[OpenAI]:
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    if not api_key:
        return None
    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    return OpenAI(**kwargs)


# ==================== Schemas ====================

class CommitteeCreate(BaseModel):
    name: Optional[str] = "Audit Committee"
    description: Optional[str] = None
    charter_text: Optional[str] = None
    chair_id: Optional[int] = None
    secretary_id: Optional[int] = None
    cae_reports_to: Optional[str] = "Audit Committee"
    meeting_cadence: Optional[str] = "quarterly"
    quorum_count: Optional[int] = 3


class CommitteeUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    charter_text: Optional[str] = None
    chair_id: Optional[int] = None
    secretary_id: Optional[int] = None
    cae_reports_to: Optional[str] = None
    meeting_cadence: Optional[str] = None
    quorum_count: Optional[int] = None
    is_active: Optional[bool] = None


class MemberCreate(BaseModel):
    name: str
    email: Optional[str] = None
    user_id: Optional[int] = None
    role: Optional[str] = "member"
    independence_status: Optional[str] = "independent"
    is_financial_expert: Optional[bool] = False
    term_start: Optional[datetime] = None
    term_end: Optional[datetime] = None
    bio: Optional[str] = None


class MemberUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    role: Optional[str] = None
    independence_status: Optional[str] = None
    is_financial_expert: Optional[bool] = None
    term_start: Optional[datetime] = None
    term_end: Optional[datetime] = None
    bio: Optional[str] = None
    is_active: Optional[bool] = None


class MeetingCreate(BaseModel):
    title: str
    meeting_type: Optional[str] = "regular"
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    chair_id: Optional[int] = None
    secretary_id: Optional[int] = None
    attendees: Optional[List[dict]] = None


class MeetingUpdate(BaseModel):
    title: Optional[str] = None
    meeting_type: Optional[str] = None
    scheduled_at: Optional[datetime] = None
    location: Optional[str] = None
    status: Optional[str] = None
    chair_id: Optional[int] = None
    secretary_id: Optional[int] = None
    attendees: Optional[List[dict]] = None
    quorum_met: Optional[bool] = None
    minutes: Optional[str] = None
    executive_summary: Optional[str] = None
    next_meeting_date: Optional[datetime] = None


class AgendaItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    presenter: Optional[str] = None
    time_allocation_min: Optional[int] = 15
    item_type: Optional[str] = "discussion"
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    order_no: Optional[int] = None


class AgendaItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    presenter: Optional[str] = None
    time_allocation_min: Optional[int] = None
    item_type: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    status: Optional[str] = None
    notes: Optional[str] = None
    order_no: Optional[int] = None


class ResolutionCreate(BaseModel):
    title: str
    description: Optional[str] = None
    resolution_text: Optional[str] = None
    votes_for: Optional[int] = 0
    votes_against: Optional[int] = 0
    votes_abstain: Optional[int] = 0
    status: Optional[str] = "proposed"
    agenda_item_id: Optional[int] = None
    target_type: Optional[str] = None
    target_id: Optional[int] = None


class ActionItemCreate(BaseModel):
    title: str
    description: Optional[str] = None
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = "medium"
    notes: Optional[str] = None


class ActionItemUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    owner_id: Optional[int] = None
    owner_name: Optional[str] = None
    due_date: Optional[datetime] = None
    priority: Optional[str] = None
    status: Optional[str] = None
    notes: Optional[str] = None


class PreReadCreate(BaseModel):
    title: str
    description: Optional[str] = None
    document_url: Optional[str] = None
    file_path: Optional[str] = None
    target_type: Optional[str] = None
    target_id: Optional[int] = None
    recipient_member_ids: Optional[List[int]] = None


class AcknowledgmentCreate(BaseModel):
    member_id: Optional[int] = None
    member_name: Optional[str] = None
    notes: Optional[str] = None
    signature_text: Optional[str] = None


APPROVAL_TARGET_TYPES = {"audit_charter", "audit_plan", "engagement", "report"}
_TARGET_TYPE_ALIASES = {"charter": "audit_charter", "plan": "audit_plan"}


def _canonical_target_type(t: Optional[str]) -> Optional[str]:
    if not t:
        return t
    return _TARGET_TYPE_ALIASES.get(t, t)


class ApprovalCreate(BaseModel):
    target_type: str
    target_id: int
    target_label: Optional[str] = None
    meeting_id: Optional[int] = None
    request_notes: Optional[str] = None


class ApprovalDecision(BaseModel):
    status: str  # approved, rejected, in_review, withdrawn
    decision_notes: Optional[str] = None
    digital_signature: Optional[str] = None


class AIAgendaRequest(BaseModel):
    meeting_type: Optional[str] = "regular"
    period: Optional[str] = None
    focus_areas: Optional[List[str]] = None


class AIMinutesRequest(BaseModel):
    additional_notes: Optional[str] = None
    raw_notes: Optional[str] = None  # secretary's rough discussion notes to be drafted into minutes


# ==================== Serializers ====================

def _user_name(user: Optional[GRCUser]) -> Optional[str]:
    if not user:
        return None
    return user.display_name or user.username


def serialize_member(m: AuditCommitteeMember) -> dict:
    return {
        "id": m.id,
        "committee_id": m.committee_id,
        "user_id": m.user_id,
        "name": m.name,
        "email": m.email,
        "role": m.role,
        "independence_status": m.independence_status,
        "is_financial_expert": m.is_financial_expert,
        "term_start": m.term_start.isoformat() if m.term_start else None,
        "term_end": m.term_end.isoformat() if m.term_end else None,
        "bio": m.bio,
        "is_active": m.is_active,
    }


def serialize_committee(c: AuditCommittee, include_members: bool = True) -> dict:
    data = {
        "id": c.id,
        "tenant_id": c.tenant_id,
        "name": c.name,
        "description": c.description,
        "charter_text": c.charter_text,
        "chair_id": c.chair_id,
        "chair_name": _user_name(c.chair),
        "secretary_id": c.secretary_id,
        "secretary_name": _user_name(c.secretary),
        "cae_reports_to": c.cae_reports_to,
        "meeting_cadence": c.meeting_cadence,
        "quorum_count": c.quorum_count,
        "is_active": c.is_active,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "updated_at": c.updated_at.isoformat() if c.updated_at else None,
    }
    if include_members:
        data["members"] = [serialize_member(m) for m in (c.members or [])]
        data["member_count"] = len(c.members or [])
    return data


def serialize_agenda_item(a: AuditCommitteeAgendaItem) -> dict:
    return {
        "id": a.id,
        "meeting_id": a.meeting_id,
        "order_no": a.order_no,
        "title": a.title,
        "description": a.description,
        "presenter": a.presenter,
        "time_allocation_min": a.time_allocation_min,
        "item_type": a.item_type,
        "target_type": a.target_type,
        "target_id": a.target_id,
        "status": a.status,
        "notes": a.notes,
    }


def serialize_resolution(r: AuditCommitteeResolution) -> dict:
    return {
        "id": r.id,
        "meeting_id": r.meeting_id,
        "agenda_item_id": r.agenda_item_id,
        "title": r.title,
        "description": r.description,
        "resolution_text": r.resolution_text,
        "votes_for": r.votes_for,
        "votes_against": r.votes_against,
        "votes_abstain": r.votes_abstain,
        "status": r.status,
        "target_type": r.target_type,
        "target_id": r.target_id,
        "decided_at": r.decided_at.isoformat() if r.decided_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


def serialize_action_item(a: AuditCommitteeActionItem) -> dict:
    return {
        "id": a.id,
        "meeting_id": a.meeting_id,
        "title": a.title,
        "description": a.description,
        "owner_id": a.owner_id,
        "owner_name": a.owner_name or _user_name(a.owner),
        "due_date": a.due_date.isoformat() if a.due_date else None,
        "priority": a.priority,
        "status": a.status,
        "completed_at": a.completed_at.isoformat() if a.completed_at else None,
        "notes": a.notes,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def serialize_pre_read(p: AuditCommitteePreRead) -> dict:
    return {
        "id": p.id,
        "meeting_id": p.meeting_id,
        "title": p.title,
        "description": p.description,
        "document_url": p.document_url,
        "file_path": p.file_path,
        "target_type": p.target_type,
        "target_id": p.target_id,
        "recipient_member_ids": list(getattr(p, "recipient_member_ids", None) or []),
        "uploaded_by_name": _user_name(p.uploaded_by),
        "uploaded_at": p.uploaded_at.isoformat() if p.uploaded_at else None,
    }


def serialize_ack(a: AuditCommitteeAcknowledgment) -> dict:
    return {
        "id": a.id,
        "meeting_id": a.meeting_id,
        "member_id": a.member_id,
        "member_name": a.member_name,
        "acknowledged_at": a.acknowledged_at.isoformat() if a.acknowledged_at else None,
        "notes": a.notes,
        "signature_text": getattr(a, "signature_text", None),
        "user_id": getattr(a, "user_id", None),
    }


def serialize_meeting(m: AuditCommitteeMeeting, full: bool = False) -> dict:
    data = {
        "id": m.id,
        "committee_id": m.committee_id,
        "tenant_id": m.tenant_id,
        "title": m.title,
        "meeting_type": m.meeting_type,
        "scheduled_at": m.scheduled_at.isoformat() if m.scheduled_at else None,
        "location": m.location,
        "status": m.status,
        "chair_id": m.chair_id,
        "chair_name": _user_name(m.chair),
        "secretary_id": m.secretary_id,
        "secretary_name": _user_name(m.secretary),
        "attendees": m.attendees or [],
        "quorum_met": m.quorum_met,
        "minutes_approved": m.minutes_approved,
        "minutes_approved_at": m.minutes_approved_at.isoformat() if m.minutes_approved_at else None,
        "next_meeting_date": m.next_meeting_date.isoformat() if m.next_meeting_date else None,
        "created_at": m.created_at.isoformat() if m.created_at else None,
        "updated_at": m.updated_at.isoformat() if m.updated_at else None,
    }
    if full:
        data["minutes"] = m.minutes
        data["executive_summary"] = m.executive_summary
        data["agenda_items"] = sorted(
            [serialize_agenda_item(a) for a in (m.agenda_items or [])],
            key=lambda x: x.get("order_no") or 0,
        )
        data["resolutions"] = [serialize_resolution(r) for r in (m.resolutions or [])]
        data["action_items"] = [serialize_action_item(a) for a in (m.action_items or [])]
        data["pre_reads"] = [serialize_pre_read(p) for p in (m.pre_reads or [])]
        data["acknowledgments"] = [serialize_ack(a) for a in (m.acknowledgments or [])]
    return data


def serialize_approval(a: AuditCommitteeApproval) -> dict:
    return {
        "id": a.id,
        "committee_id": a.committee_id,
        "tenant_id": a.tenant_id,
        "target_type": a.target_type,
        "target_id": a.target_id,
        "target_label": a.target_label,
        "meeting_id": a.meeting_id,
        "status": a.status,
        "requested_by_id": a.requested_by_id,
        "requested_by_name": _user_name(a.requested_by),
        "requested_at": a.requested_at.isoformat() if a.requested_at else None,
        "decided_by_id": a.decided_by_id,
        "decided_by_name": _user_name(a.decided_by),
        "decided_at": a.decided_at.isoformat() if a.decided_at else None,
        "decision_notes": a.decision_notes,
        "request_notes": a.request_notes,
        "digital_signature": getattr(a, "digital_signature", None),
    }


# ==================== Helpers ====================

def _get_committee_or_404(committee_id: int, user_tenants: List[int], db: Session) -> AuditCommittee:
    c = db.query(AuditCommittee).filter(
        AuditCommittee.id == committee_id,
        AuditCommittee.tenant_id.in_(user_tenants),
    ).first()
    if not c:
        raise HTTPException(status_code=404, detail="Committee not found")
    return c


def _get_meeting_or_404(meeting_id: int, user_tenants: List[int], db: Session) -> AuditCommitteeMeeting:
    m = db.query(AuditCommitteeMeeting).filter(
        AuditCommitteeMeeting.id == meeting_id,
        AuditCommitteeMeeting.tenant_id.in_(user_tenants),
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Meeting not found")
    return m


def _ensure_default_committee(tenant_id: int, db: Session, user_id: Optional[int] = None) -> AuditCommittee:
    c = db.query(AuditCommittee).filter(AuditCommittee.tenant_id == tenant_id).first()
    if c:
        return c
    c = AuditCommittee(
        tenant_id=tenant_id,
        name="Audit Committee",
        cae_reports_to="Audit Committee",
        meeting_cadence="quarterly",
        quorum_count=3,
        created_by_id=user_id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return c


# ==================== Committee endpoints ====================

@router.get("")
def list_committees(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"committees": [], "total": 0}
    committees = db.query(AuditCommittee).filter(
        AuditCommittee.tenant_id.in_(user_tenants)
    ).order_by(AuditCommittee.created_at.desc()).all()
    return {"committees": [serialize_committee(c) for c in committees], "total": len(committees)}


@router.get("/primary")
def get_primary_committee(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    c = _ensure_default_committee(tenant_id, db, current_user.id)
    return serialize_committee(c)


@router.post("", status_code=status.HTTP_201_CREATED)
def create_committee(
    data: CommitteeCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    c = AuditCommittee(
        tenant_id=tenant_id,
        name=data.name or "Audit Committee",
        description=data.description,
        charter_text=data.charter_text,
        chair_id=data.chair_id,
        secretary_id=data.secretary_id,
        cae_reports_to=data.cae_reports_to,
        meeting_cadence=data.meeting_cadence,
        quorum_count=data.quorum_count or 3,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(c)
    db.commit()
    db.refresh(c)
    return serialize_committee(c)


@router.get("/{committee_id:int}")
def get_committee(
    committee_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    return serialize_committee(_get_committee_or_404(committee_id, user_tenants, db))


@router.put("/{committee_id:int}")
def update_committee(
    committee_id: int,
    data: CommitteeUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    for f, v in data.dict(exclude_unset=True).items():
        setattr(c, f, v)
    c.updated_at = datetime.utcnow()
    c.updated_by_id = current_user.id
    db.commit()
    db.refresh(c)
    return serialize_committee(c)


@router.delete("/{committee_id:int}")
def delete_committee(
    committee_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    db.delete(c)
    db.commit()
    return {"deleted": True}


# ==================== Members ====================

@router.get("/{committee_id:int}/members")
def list_members(
    committee_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    return {"members": [serialize_member(m) for m in c.members]}


@router.post("/{committee_id:int}/members", status_code=status.HTTP_201_CREATED)
def add_member(
    committee_id: int,
    data: MemberCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    m = AuditCommitteeMember(
        committee_id=c.id,
        tenant_id=c.tenant_id,
        user_id=data.user_id,
        name=data.name,
        email=data.email,
        role=data.role or "member",
        independence_status=data.independence_status or "independent",
        is_financial_expert=bool(data.is_financial_expert),
        term_start=data.term_start,
        term_end=data.term_end,
        bio=data.bio,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return serialize_member(m)


@router.put("/{committee_id:int}/members/{member_id:int}")
def update_member(
    committee_id: int,
    member_id: int,
    data: MemberUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    m = db.query(AuditCommitteeMember).filter(
        AuditCommitteeMember.id == member_id,
        AuditCommitteeMember.committee_id == c.id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    for f, v in data.dict(exclude_unset=True).items():
        setattr(m, f, v)
    m.updated_by_id = current_user.id
    db.commit()
    db.refresh(m)
    return serialize_member(m)


@router.delete("/{committee_id:int}/members/{member_id:int}")
def delete_member(
    committee_id: int,
    member_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    m = db.query(AuditCommitteeMember).filter(
        AuditCommitteeMember.id == member_id,
        AuditCommitteeMember.committee_id == c.id,
    ).first()
    if not m:
        raise HTTPException(status_code=404, detail="Member not found")
    db.delete(m)
    db.commit()
    return {"deleted": True}


# ==================== Meetings ====================

@router.get("/{committee_id:int}/meetings")
def list_meetings(
    committee_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    meetings = db.query(AuditCommitteeMeeting).filter(
        AuditCommitteeMeeting.committee_id == c.id
    ).order_by(AuditCommitteeMeeting.scheduled_at.desc().nullslast(), AuditCommitteeMeeting.created_at.desc()).all()
    return {"meetings": [serialize_meeting(m) for m in meetings], "total": len(meetings)}


@router.post("/{committee_id:int}/meetings", status_code=status.HTTP_201_CREATED)
def create_meeting(
    committee_id: int,
    data: MeetingCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    m = AuditCommitteeMeeting(
        committee_id=c.id,
        tenant_id=c.tenant_id,
        title=data.title,
        meeting_type=data.meeting_type or "regular",
        scheduled_at=data.scheduled_at,
        location=data.location,
        chair_id=data.chair_id or c.chair_id,
        secretary_id=data.secretary_id or c.secretary_id,
        attendees=data.attendees or [],
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(m)
    db.commit()
    db.refresh(m)
    return serialize_meeting(m, full=True)


@router.get("/meetings/{meeting_id:int}")
def get_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    return serialize_meeting(m, full=True)


@router.put("/meetings/{meeting_id:int}")
def update_meeting(
    meeting_id: int,
    data: MeetingUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    for f, v in data.dict(exclude_unset=True).items():
        setattr(m, f, v)
    m.updated_at = datetime.utcnow()
    m.updated_by_id = current_user.id
    db.commit()
    db.refresh(m)
    return serialize_meeting(m, full=True)


@router.delete("/meetings/{meeting_id:int}")
def delete_meeting(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    db.delete(m)
    db.commit()
    return {"deleted": True}


@router.post("/meetings/{meeting_id:int}/approve-minutes")
def approve_minutes(
    meeting_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    m.minutes_approved = True
    m.minutes_approved_at = datetime.utcnow()
    if m.status not in ("completed",):
        m.status = "completed"
    db.commit()
    db.refresh(m)
    return serialize_meeting(m, full=True)


# ==================== Agenda items ====================

@router.post("/meetings/{meeting_id:int}/agenda", status_code=status.HTTP_201_CREATED)
def add_agenda_item(
    meeting_id: int,
    data: AgendaItemCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    order_no = data.order_no
    if order_no is None:
        max_order = db.query(func.max(AuditCommitteeAgendaItem.order_no)).filter(
            AuditCommitteeAgendaItem.meeting_id == m.id
        ).scalar() or 0
        order_no = max_order + 1
    a = AuditCommitteeAgendaItem(
        meeting_id=m.id,
        tenant_id=m.tenant_id,
        order_no=order_no,
        title=data.title,
        description=data.description,
        presenter=data.presenter,
        time_allocation_min=data.time_allocation_min or 15,
        item_type=data.item_type or "discussion",
        target_type=data.target_type,
        target_id=data.target_id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return serialize_agenda_item(a)


@router.put("/agenda/{item_id:int}")
def update_agenda_item(
    item_id: int,
    data: AgendaItemUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    a = db.query(AuditCommitteeAgendaItem).join(AuditCommitteeMeeting).filter(
        AuditCommitteeAgendaItem.id == item_id,
        AuditCommitteeMeeting.tenant_id.in_(user_tenants),
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    for f, v in data.dict(exclude_unset=True).items():
        setattr(a, f, v)
    a.updated_by_id = current_user.id
    db.commit()
    db.refresh(a)
    return serialize_agenda_item(a)


@router.delete("/agenda/{item_id:int}")
def delete_agenda_item(
    item_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    a = db.query(AuditCommitteeAgendaItem).join(AuditCommitteeMeeting).filter(
        AuditCommitteeAgendaItem.id == item_id,
        AuditCommitteeMeeting.tenant_id.in_(user_tenants),
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Agenda item not found")
    db.delete(a)
    db.commit()
    return {"deleted": True}


# ==================== Resolutions ====================

@router.post("/meetings/{meeting_id:int}/resolutions", status_code=status.HTTP_201_CREATED)
def add_resolution(
    meeting_id: int,
    data: ResolutionCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    r = AuditCommitteeResolution(
        meeting_id=m.id,
        tenant_id=m.tenant_id,
        agenda_item_id=data.agenda_item_id,
        title=data.title,
        description=data.description,
        resolution_text=data.resolution_text,
        votes_for=data.votes_for or 0,
        votes_against=data.votes_against or 0,
        votes_abstain=data.votes_abstain or 0,
        status=data.status or "proposed",
        target_type=data.target_type,
        target_id=data.target_id,
        decided_at=datetime.utcnow() if (data.status or "").lower() in ("passed", "rejected") else None,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(r)
    db.commit()
    db.refresh(r)
    return serialize_resolution(r)


@router.delete("/resolutions/{res_id:int}")
def delete_resolution(
    res_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    r = db.query(AuditCommitteeResolution).join(AuditCommitteeMeeting).filter(
        AuditCommitteeResolution.id == res_id,
        AuditCommitteeMeeting.tenant_id.in_(user_tenants),
    ).first()
    if not r:
        raise HTTPException(status_code=404, detail="Resolution not found")
    db.delete(r)
    db.commit()
    return {"deleted": True}


# ==================== Action items ====================

@router.post("/meetings/{meeting_id:int}/actions", status_code=status.HTTP_201_CREATED)
def add_action(
    meeting_id: int,
    data: ActionItemCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    a = AuditCommitteeActionItem(
        meeting_id=m.id,
        tenant_id=m.tenant_id,
        title=data.title,
        description=data.description,
        owner_id=data.owner_id,
        owner_name=data.owner_name,
        due_date=data.due_date,
        priority=data.priority or "medium",
        notes=data.notes,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return serialize_action_item(a)


@router.put("/actions/{action_id:int}")
def update_action(
    action_id: int,
    data: ActionItemUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    a = db.query(AuditCommitteeActionItem).filter(
        AuditCommitteeActionItem.id == action_id,
        AuditCommitteeActionItem.tenant_id.in_(user_tenants),
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Action item not found")
    for f, v in data.dict(exclude_unset=True).items():
        setattr(a, f, v)
    if data.status == "completed" and not a.completed_at:
        a.completed_at = datetime.utcnow()
    a.updated_at = datetime.utcnow()
    a.updated_by_id = current_user.id
    db.commit()
    db.refresh(a)
    return serialize_action_item(a)


@router.delete("/actions/{action_id:int}")
def delete_action(
    action_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    a = db.query(AuditCommitteeActionItem).filter(
        AuditCommitteeActionItem.id == action_id,
        AuditCommitteeActionItem.tenant_id.in_(user_tenants),
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Action item not found")
    db.delete(a)
    db.commit()
    return {"deleted": True}


@router.get("/actions/open")
def list_open_actions(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"actions": [], "total": 0}
    actions = db.query(AuditCommitteeActionItem).filter(
        AuditCommitteeActionItem.tenant_id.in_(user_tenants),
        AuditCommitteeActionItem.status.in_(["open", "in_progress"]),
    ).order_by(AuditCommitteeActionItem.due_date.asc().nullslast()).all()
    return {"actions": [serialize_action_item(a) for a in actions], "total": len(actions)}


# ==================== Pre-reads ====================

@router.post("/meetings/{meeting_id:int}/pre-reads", status_code=status.HTTP_201_CREATED)
def add_pre_read(
    meeting_id: int,
    data: PreReadCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    p = AuditCommitteePreRead(
        meeting_id=m.id,
        tenant_id=m.tenant_id,
        title=data.title,
        description=data.description,
        document_url=data.document_url,
        file_path=data.file_path,
        target_type=data.target_type,
        target_id=data.target_id,
        recipient_member_ids=data.recipient_member_ids or [],
        uploaded_by_id=current_user.id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return serialize_pre_read(p)


@router.post("/meetings/{meeting_id:int}/pre-reads/upload", status_code=status.HTTP_201_CREATED)
async def upload_pre_read(
    meeting_id: int,
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    description: Optional[str] = Form(None),
    recipient_member_ids: Optional[str] = Form(None),  # JSON-encoded list
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    """Upload a pre-read document file and persist its metadata + per-member distribution list."""
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)

    upload_dir = os.path.join(os.path.dirname(__file__), "..", "..", "..", "..", "..", "uploads", "committee_pre_reads", str(m.tenant_id))
    upload_dir = os.path.abspath(upload_dir)
    os.makedirs(upload_dir, exist_ok=True)
    safe_name = "".join(ch for ch in (file.filename or "pre_read") if ch.isalnum() or ch in "._-")
    fname = f"{_uuid.uuid4().hex}_{safe_name}"
    fpath = os.path.join(upload_dir, fname)

    content = await file.read()
    if len(content) > 25 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File exceeds 25 MB limit.")
    with open(fpath, "wb") as fh:
        fh.write(content)

    rcpts: List[int] = []
    if recipient_member_ids:
        try:
            parsed = json.loads(recipient_member_ids)
            if isinstance(parsed, list):
                rcpts = [int(x) for x in parsed if str(x).strip()]
        except Exception:
            pass

    p = AuditCommitteePreRead(
        meeting_id=m.id,
        tenant_id=m.tenant_id,
        title=(title or file.filename or "Pre-read"),
        description=description,
        document_url=None,
        file_path=fpath,
        recipient_member_ids=rcpts,
        uploaded_by_id=current_user.id,
        created_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(p)
    db.commit()
    db.refresh(p)
    return serialize_pre_read(p)


@router.delete("/pre-reads/{pre_read_id:int}")
def delete_pre_read(
    pre_read_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    p = db.query(AuditCommitteePreRead).join(AuditCommitteeMeeting).filter(
        AuditCommitteePreRead.id == pre_read_id,
        AuditCommitteeMeeting.tenant_id.in_(user_tenants),
    ).first()
    if not p:
        raise HTTPException(status_code=404, detail="Pre-read not found")
    db.delete(p)
    db.commit()
    return {"deleted": True}


# ==================== Acknowledgments ====================

@router.post("/meetings/{meeting_id:int}/acknowledge", status_code=status.HTTP_201_CREATED)
def acknowledge_meeting(
    meeting_id: int,
    data: AcknowledgmentCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)
    name = data.member_name or _user_name(current_user) or current_user.email
    ack = AuditCommitteeAcknowledgment(
        meeting_id=m.id,
        tenant_id=m.tenant_id,
        member_id=data.member_id,
        member_name=name,
        notes=data.notes,
        signature_text=getattr(data, "signature_text", None),
        user_id=current_user.id,
        created_by_id=current_user.id,
    )
    db.add(ack)
    db.commit()
    db.refresh(ack)
    return serialize_ack(ack)


# ==================== Approvals (governance inbox) ====================

@router.get("/approvals")
def list_approvals(
    status_filter: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"approvals": [], "total": 0}
    q = db.query(AuditCommitteeApproval).filter(AuditCommitteeApproval.tenant_id.in_(user_tenants))
    if status_filter:
        q = q.filter(AuditCommitteeApproval.status == status_filter)
    approvals = q.order_by(AuditCommitteeApproval.requested_at.desc()).all()
    return {"approvals": [serialize_approval(a) for a in approvals], "total": len(approvals)}


@router.post("/{committee_id:int}/approvals", status_code=status.HTTP_201_CREATED)
def request_approval(
    committee_id: int,
    data: ApprovalCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    target_type = _canonical_target_type(data.target_type)
    if target_type not in APPROVAL_TARGET_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"Invalid target_type '{data.target_type}'. Allowed: {sorted(APPROVAL_TARGET_TYPES)}",
        )
    label = data.target_label
    target_obj = None
    if target_type == "audit_charter":
        target_obj = db.query(AuditCharter).filter(
            AuditCharter.id == data.target_id,
            AuditCharter.tenant_id == c.tenant_id,
        ).first()
        if target_obj and not label:
            label = f"{target_obj.title} v{target_obj.version}"
    elif target_type == "audit_plan":
        target_obj = db.query(AuditPlan).filter(
            AuditPlan.id == data.target_id,
            AuditPlan.tenant_id == c.tenant_id,
        ).first()
        if target_obj and not label:
            label = f"{target_obj.name} ({target_obj.fiscal_year})"
    elif target_type == "engagement":
        target_obj = db.query(AuditEngagement).filter(
            AuditEngagement.id == data.target_id,
            AuditEngagement.tenant_id == c.tenant_id,
        ).first()
        if target_obj and not label:
            label = getattr(target_obj, "title", None) or f"Engagement #{target_obj.id}"
    elif target_type == "report":
        # Reports referenced opaquely; require a label if no concrete artifact lookup.
        target_obj = True
    if not target_obj:
        raise HTTPException(
            status_code=404,
            detail=f"{target_type} #{data.target_id} not found in this tenant.",
        )
    a = AuditCommitteeApproval(
        committee_id=c.id,
        tenant_id=c.tenant_id,
        target_type=target_type,
        target_id=data.target_id,
        target_label=label,
        meeting_id=data.meeting_id,
        request_notes=data.request_notes,
        requested_by_id=current_user.id,
        updated_by_id=current_user.id,
    )
    db.add(a)
    db.commit()
    db.refresh(a)
    return serialize_approval(a)


@router.post("/approvals/{approval_id:int}/decide")
def decide_approval(
    approval_id: int,
    data: ApprovalDecision,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    a = db.query(AuditCommitteeApproval).filter(
        AuditCommitteeApproval.id == approval_id,
        AuditCommitteeApproval.tenant_id.in_(user_tenants),
    ).first()
    if not a:
        raise HTTPException(status_code=404, detail="Approval not found")

    # Authorization: chair/vice_chair/secretary may decide. We accept either:
    #   (a) Committee.chair_id / secretary_id on the parent committee, OR
    #   (b) An active AuditCommitteeMember with role chair|vice_chair|secretary linked to the user.
    committee = db.query(AuditCommittee).filter(AuditCommittee.id == a.committee_id).first()
    privileged_user_ids: set[int] = set()
    if committee:
        if committee.chair_id:
            privileged_user_ids.add(committee.chair_id)
        if committee.secretary_id:
            privileged_user_ids.add(committee.secretary_id)
    member_rows = db.query(AuditCommitteeMember).filter(
        AuditCommitteeMember.committee_id == a.committee_id,
        AuditCommitteeMember.role.in_(["chair", "vice_chair", "secretary"]),
        AuditCommitteeMember.is_active == True,
    ).all()
    for m in member_rows:
        if m.user_id:
            privileged_user_ids.add(m.user_id)
    if not privileged_user_ids:
        raise HTTPException(
            status_code=409,
            detail="No privileged committee roles configured. Assign a chair, vice chair, or secretary before deciding approvals.",
        )
    if current_user.id not in privileged_user_ids:
        raise HTTPException(
            status_code=403,
            detail="Only the committee chair, vice chair, or secretary may decide approvals.",
        )
    if a.requested_by_id == current_user.id:
        raise HTTPException(status_code=403, detail="The requester cannot decide their own approval.")
    if data.status == "approved" and not (data.digital_signature or "").strip():
        raise HTTPException(status_code=422, detail="A digital signature attestation is required to approve.")
    a.status = data.status
    a.decision_notes = data.decision_notes
    a.decided_by_id = current_user.id
    a.decided_at = datetime.utcnow()
    a.updated_by_id = current_user.id
    if data.digital_signature:
        a.digital_signature = data.digital_signature.strip()

    # Cascade approval to target where applicable
    canon = _canonical_target_type(a.target_type)
    # Reflect intermediate "in_review" state to charter for visibility.
    if canon == "audit_charter" and data.status == "in_review":
        ch = db.query(AuditCharter).filter(
            AuditCharter.id == a.target_id,
            AuditCharter.tenant_id == a.tenant_id,
        ).first()
        if ch and ch.status == "submitted":
            ch.status = "under_review"
            ch.updated_at = datetime.utcnow()
    if canon == "audit_charter" and data.status == "rejected":
        ch = db.query(AuditCharter).filter(
            AuditCharter.id == a.target_id,
            AuditCharter.tenant_id == a.tenant_id,
        ).first()
        if ch:
            ch.status = "rejected"
            ch.rejection_reason = data.decision_notes or "Rejected by Audit Committee"
            ch.updated_at = datetime.utcnow()
    if data.status == "approved":
        if canon == "audit_charter":
            ch = db.query(AuditCharter).filter(
                AuditCharter.id == a.target_id,
                AuditCharter.tenant_id == a.tenant_id,
            ).first()
            if ch:
                db.query(AuditCharter).filter(
                    AuditCharter.tenant_id == a.tenant_id,
                    AuditCharter.status == "approved",
                    AuditCharter.id != ch.id,
                ).update({"status": "superseded"})
                ch.status = "approved"
                ch.approved_by_id = current_user.id
                ch.approved_at = datetime.utcnow()
                ch.rejection_reason = None
                if not ch.next_review_due:
                    ch.next_review_due = datetime.utcnow() + timedelta(days=365)
                ch.updated_at = datetime.utcnow()
        elif canon == "audit_plan":
            p = db.query(AuditPlan).filter(
                AuditPlan.id == a.target_id,
                AuditPlan.tenant_id == a.tenant_id,
            ).first()
            if p:
                p.approval_status = "approved"
                p.status = "approved"
                p.approved_by_id = current_user.id
                p.approved_at = datetime.utcnow()
    db.commit()
    db.refresh(a)
    return serialize_approval(a)


# ==================== Stats ====================

@router.get("/{committee_id:int}/stats")
def committee_stats(
    committee_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    c = _get_committee_or_404(committee_id, user_tenants, db)
    members_total = db.query(func.count(AuditCommitteeMember.id)).filter(
        AuditCommitteeMember.committee_id == c.id, AuditCommitteeMember.is_active == True
    ).scalar() or 0
    members_independent = db.query(func.count(AuditCommitteeMember.id)).filter(
        AuditCommitteeMember.committee_id == c.id,
        AuditCommitteeMember.is_active == True,
        AuditCommitteeMember.independence_status == "independent",
    ).scalar() or 0
    meetings_total = db.query(func.count(AuditCommitteeMeeting.id)).filter(
        AuditCommitteeMeeting.committee_id == c.id
    ).scalar() or 0
    meetings_completed = db.query(func.count(AuditCommitteeMeeting.id)).filter(
        AuditCommitteeMeeting.committee_id == c.id,
        AuditCommitteeMeeting.status == "completed",
    ).scalar() or 0
    meetings_upcoming = db.query(func.count(AuditCommitteeMeeting.id)).filter(
        AuditCommitteeMeeting.committee_id == c.id,
        AuditCommitteeMeeting.status == "scheduled",
        AuditCommitteeMeeting.scheduled_at >= datetime.utcnow(),
    ).scalar() or 0
    open_actions = db.query(func.count(AuditCommitteeActionItem.id)).filter(
        AuditCommitteeActionItem.tenant_id == c.tenant_id,
        AuditCommitteeActionItem.status.in_(["open", "in_progress"]),
    ).scalar() or 0
    overdue_actions = db.query(func.count(AuditCommitteeActionItem.id)).filter(
        AuditCommitteeActionItem.tenant_id == c.tenant_id,
        AuditCommitteeActionItem.status.in_(["open", "in_progress"]),
        AuditCommitteeActionItem.due_date < datetime.utcnow(),
    ).scalar() or 0
    pending_approvals = db.query(func.count(AuditCommitteeApproval.id)).filter(
        AuditCommitteeApproval.committee_id == c.id,
        AuditCommitteeApproval.status.in_(["requested", "in_review"]),
    ).scalar() or 0
    next_meeting = db.query(AuditCommitteeMeeting).filter(
        AuditCommitteeMeeting.committee_id == c.id,
        AuditCommitteeMeeting.status == "scheduled",
        AuditCommitteeMeeting.scheduled_at >= datetime.utcnow(),
    ).order_by(AuditCommitteeMeeting.scheduled_at.asc()).first()
    independence_pct = round((members_independent / members_total) * 100) if members_total else 0
    return {
        "members_total": members_total,
        "members_independent": members_independent,
        "independence_pct": independence_pct,
        "meetings_total": meetings_total,
        "meetings_completed": meetings_completed,
        "meetings_upcoming": meetings_upcoming,
        "open_actions": open_actions,
        "overdue_actions": overdue_actions,
        "pending_approvals": pending_approvals,
        "next_meeting": serialize_meeting(next_meeting) if next_meeting else None,
    }


# ==================== Reporting pack ====================

@router.get("/reporting-pack")
def reporting_pack(
    fiscal_year: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    """Aggregate board-ready reporting pack: findings, KPIs, coverage, budget, governance."""
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")

    committee = db.query(AuditCommittee).filter(
        AuditCommittee.tenant_id == tenant_id, AuditCommittee.is_active == True
    ).order_by(AuditCommittee.id.asc()).first()

    # Findings by severity (open + in_progress)
    sev_rows = db.query(AuditFinding.severity, func.count(AuditFinding.id)).filter(
        AuditFinding.tenant_id == tenant_id,
        AuditFinding.status.in_(["open", "in_progress"]),
    ).group_by(AuditFinding.severity).all()
    findings_by_severity = {sev or "unknown": cnt for sev, cnt in sev_rows}
    total_open_findings = sum(findings_by_severity.values())
    total_findings_all = db.query(func.count(AuditFinding.id)).filter(
        AuditFinding.tenant_id == tenant_id
    ).scalar() or 0
    closed_findings = total_findings_all - total_open_findings

    # Plan coverage + budget
    plan_q = db.query(AuditPlan).filter(AuditPlan.tenant_id == tenant_id)
    if fiscal_year is not None:
        plan_q = plan_q.filter(AuditPlan.fiscal_year == str(fiscal_year))
    plan = plan_q.order_by(AuditPlan.created_at.desc()).first()
    coverage = {
        "fiscal_year": plan.fiscal_year if plan else None,
        "plan_name": plan.name if plan else None,
        "approval_status": plan.approval_status if plan else None,
        "items_total": 0,
        "items_completed": 0,
        "items_in_progress": 0,
        "items_scheduled": 0,
        "coverage_pct": 0,
    }
    budget = {"planned_days": 0.0, "actual_hours": 0.0, "budget_hours": 0.0, "variance_pct": 0.0}
    if plan:
        items = db.query(AuditPlanItem).filter(AuditPlanItem.plan_id == plan.id).all()
        coverage["items_total"] = len(items)
        coverage["items_completed"] = sum(1 for i in items if i.status == "completed")
        coverage["items_in_progress"] = sum(1 for i in items if i.status == "in_progress")
        coverage["items_scheduled"] = sum(1 for i in items if i.status == "scheduled")
        budget["planned_days"] = float(plan.total_budget_days or 0)
        if coverage["items_total"]:
            coverage["coverage_pct"] = round(coverage["items_completed"] / coverage["items_total"] * 100)
        eng_rows = db.query(
            func.coalesce(func.sum(AuditEngagement.budget_hours), 0),
            func.coalesce(func.sum(AuditEngagement.actual_hours), 0),
        ).filter(AuditEngagement.tenant_id == tenant_id).first()
        budget["budget_hours"] = float(eng_rows[0] or 0)
        budget["actual_hours"] = float(eng_rows[1] or 0)
        if budget["budget_hours"]:
            budget["variance_pct"] = round(
                (budget["actual_hours"] - budget["budget_hours"]) / budget["budget_hours"] * 100, 1
            )

    # KPIs
    engagements_total = db.query(func.count(AuditEngagement.id)).filter(
        AuditEngagement.tenant_id == tenant_id
    ).scalar() or 0
    engagements_completed = db.query(func.count(AuditEngagement.id)).filter(
        AuditEngagement.tenant_id == tenant_id,
        AuditEngagement.status == "completed",
    ).scalar() or 0
    engagements_in_progress = db.query(func.count(AuditEngagement.id)).filter(
        AuditEngagement.tenant_id == tenant_id,
        AuditEngagement.status.in_(["fieldwork", "reporting", "in_progress"]),
    ).scalar() or 0

    # Governance
    open_actions = []
    overdue_actions_count = 0
    pending_approvals = []
    recent_meetings = []
    if committee:
        actions = db.query(AuditCommitteeActionItem).filter(
            AuditCommitteeActionItem.tenant_id == tenant_id,
            AuditCommitteeActionItem.status.in_(["open", "in_progress"]),
        ).order_by(AuditCommitteeActionItem.due_date.asc().nullslast()).limit(20).all()
        open_actions = [serialize_action_item(a) for a in actions]
        overdue_actions_count = db.query(func.count(AuditCommitteeActionItem.id)).filter(
            AuditCommitteeActionItem.tenant_id == tenant_id,
            AuditCommitteeActionItem.status.in_(["open", "in_progress"]),
            AuditCommitteeActionItem.due_date < datetime.utcnow(),
        ).scalar() or 0
        approvals = db.query(AuditCommitteeApproval).filter(
            AuditCommitteeApproval.tenant_id == tenant_id,
            AuditCommitteeApproval.status.in_(["requested", "in_review"]),
        ).order_by(AuditCommitteeApproval.requested_at.desc()).limit(20).all()
        pending_approvals = [serialize_approval(a) for a in approvals]
        meetings = db.query(AuditCommitteeMeeting).filter(
            AuditCommitteeMeeting.committee_id == committee.id,
        ).order_by(AuditCommitteeMeeting.scheduled_at.desc().nullslast()).limit(6).all()
        recent_meetings = [serialize_meeting(m) for m in meetings]

    # Charter status
    charter = db.query(AuditCharter).filter(
        AuditCharter.tenant_id == tenant_id
    ).order_by(AuditCharter.updated_at.desc().nullslast(), AuditCharter.created_at.desc()).first()
    charter_block = None
    if charter:
        charter_block = {
            "title": charter.title,
            "version": charter.version,
            "status": charter.status,
            "approved_at": charter.approved_at.isoformat() if charter.approved_at else None,
        }

    return {
        "generated_at": datetime.utcnow().isoformat(),
        "tenant_id": tenant_id,
        "fiscal_year": coverage["fiscal_year"],
        "committee": serialize_committee(committee, include_members=False) if committee else None,
        "kpis": {
            "open_findings": total_open_findings,
            "closed_findings": closed_findings,
            "engagements_total": engagements_total,
            "engagements_completed": engagements_completed,
            "engagements_in_progress": engagements_in_progress,
            "overdue_actions": overdue_actions_count,
            "pending_approvals": len(pending_approvals),
        },
        "findings_by_severity": findings_by_severity,
        "coverage": coverage,
        "budget_vs_actuals": budget,
        "open_actions": open_actions,
        "pending_approvals": pending_approvals,
        "recent_meetings": recent_meetings,
        "charter": charter_block,
    }


# ==================== AI helpers ====================

@router.post("/meetings/{meeting_id:int}/ai/agenda")
def ai_generate_agenda(
    meeting_id: int,
    data: AIAgendaRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)

    # Pull tenant context
    open_findings = db.query(func.count(AuditFinding.id)).filter(
        AuditFinding.tenant_id == m.tenant_id,
        AuditFinding.status.in_(["open", "in_progress"]),
    ).scalar() or 0
    pending_charter = db.query(AuditCharter).filter(
        AuditCharter.tenant_id == m.tenant_id,
        AuditCharter.status == "pending_approval",
    ).first()
    pending_plans = db.query(AuditPlan).filter(
        AuditPlan.tenant_id == m.tenant_id,
        AuditPlan.approval_status == "pending",
    ).count()

    default_items = [
        {"title": "Approval of Prior Meeting Minutes", "item_type": "approval", "time_allocation_min": 10},
        {"title": "CAE Update — Status of Audit Plan & Key Findings", "item_type": "information", "time_allocation_min": 25},
        {"title": "Review of Open & Overdue Audit Issues", "item_type": "discussion", "time_allocation_min": 20},
        {"title": "External Auditor Update", "item_type": "information", "time_allocation_min": 15},
        {"title": "Risk & Compliance Hot Topics", "item_type": "discussion", "time_allocation_min": 20},
        {"title": "Executive Session (CAE only)", "item_type": "executive_session", "time_allocation_min": 15},
    ]
    if pending_charter:
        default_items.insert(1, {"title": f"Approval — {pending_charter.title} v{pending_charter.version}", "item_type": "approval", "time_allocation_min": 15, "target_type": "audit_charter", "target_id": pending_charter.id})
    if pending_plans:
        default_items.insert(2, {"title": "Approval — Pending Annual Audit Plan", "item_type": "approval", "time_allocation_min": 15, "target_type": "audit_plan"})

    client = get_openai_client()
    if not client:
        return {"items": default_items, "source": "template"}

    focus = ", ".join(data.focus_areas or []) or "standard IIA agenda"
    prompt = f"""Generate an Audit Committee meeting agenda for a {data.meeting_type or 'regular'} meeting.
Period: {data.period or 'current quarter'}. Focus areas: {focus}.
Tenant context: {open_findings} open audit findings; {pending_plans} pending audit plan(s); pending charter: {'yes' if pending_charter else 'no'}.

Return strict JSON: {{"items": [{{"title": str, "description": str, "presenter": str, "time_allocation_min": int, "item_type": str}}, ...]}}.
item_type must be one of: discussion, approval, information, executive_session.
Provide 6-9 items totalling roughly 90-120 minutes, IIA-aligned, following standard governance flow (minutes → CAE update → approvals → discussions → executive session)."""

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
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
        items = parsed.get("items") or default_items
        if not isinstance(items, list):
            items = default_items
        return {"items": items, "source": "ai"}
    except Exception as exc:
        logger.warning(f"AI agenda generation failed: {exc}")
        return {"items": default_items, "source": "template"}


@router.post("/meetings/{meeting_id:int}/ai/minutes")
def ai_generate_minutes(
    meeting_id: int,
    data: AIMinutesRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    """Draft structured Audit Committee minutes from raw discussion notes.

    Request: { raw_notes?: str, additional_notes?: str }
    Response: {
        sections: { discussion, decisions, action_items, resolutions },
        minutes: <assembled markdown>,
        executive_summary: str,
        source: "ai" | "template",
        message: <user-facing status message>,
    }
    """
    user_tenants = get_user_tenants(current_user, db)
    m = _get_meeting_or_404(meeting_id, user_tenants, db)

    agenda_lines = [f"- [{a.item_type}] {a.title}" + (f" ({a.notes})" if a.notes else "") for a in sorted(m.agenda_items or [], key=lambda x: x.order_no or 0)]
    resolution_lines = [f"- {r.title}: {r.status} (For:{r.votes_for} Against:{r.votes_against} Abstain:{r.votes_abstain})" for r in (m.resolutions or [])]
    action_lines = [f"- {a.title} → {a.owner_name or 'TBD'} due {a.due_date.date().isoformat() if a.due_date else 'TBD'}" for a in (m.action_items or [])]
    attendees = m.attendees or []
    attendees_text = ", ".join([(att.get("name") if isinstance(att, dict) else str(att)) for att in attendees]) or "Not recorded"
    raw_notes = (data.raw_notes or "").strip()
    extra = (data.additional_notes or "").strip()

    def _assemble(sections: dict) -> str:
        return (
            f"# Minutes — {m.title}\n"
            f"**Date:** {(m.scheduled_at or m.created_at).strftime('%B %d, %Y') if (m.scheduled_at or m.created_at) else 'TBD'}\n"
            f"**Location:** {m.location or 'Virtual'}\n"
            f"**Chair:** {_user_name(m.chair) or 'TBD'}    **Secretary:** {_user_name(m.secretary) or 'TBD'}\n"
            f"**Attendees:** {attendees_text}\n\n"
            f"## Discussion\n{sections.get('discussion') or '_No discussion recorded._'}\n\n"
            f"## Decisions\n{sections.get('decisions') or '_No formal decisions captured._'}\n\n"
            f"## Action Items\n{sections.get('action_items') or '_No action items recorded._'}\n\n"
            f"## Resolutions\n{sections.get('resolutions') or '_No resolutions tabled._'}\n"
        )

    fallback_sections = {
        "discussion": (raw_notes or "No discussion notes provided.") + (f"\n\n_Additional notes:_ {extra}" if extra else ""),
        "decisions": "_Pending — capture key decisions from the discussion above._",
        "action_items": "\n".join(action_lines) or "_No action items recorded._",
        "resolutions": "\n".join(resolution_lines) or "_No resolutions tabled._",
    }

    client = get_openai_client()
    if not client:
        return {
            "sections": fallback_sections,
            "minutes": _assemble(fallback_sections),
            "executive_summary": "",
            "source": "template",
            "message": "AI is not configured — returned an empty structured draft populated from agenda/resolutions/action items. Please complete the Discussion and Decisions sections manually.",
        }

    prompt = f"""You are an Audit Committee secretary. Draft IIA-compliant minutes from the secretary's raw notes below.
Return STRICT JSON with these keys:
- sections.discussion (markdown bullets/paragraphs of what was discussed)
- sections.decisions (markdown bullets of formal decisions made)
- sections.action_items (markdown bullets of action items with owner & due date)
- sections.resolutions (markdown bullets of resolutions with vote counts)
- executive_summary (3-5 concise sentences)

Meeting: {m.title} ({m.meeting_type})
Date: {(m.scheduled_at or m.created_at).isoformat() if (m.scheduled_at or m.created_at) else 'TBD'}
Chair: {_user_name(m.chair) or 'TBD'}; Secretary: {_user_name(m.secretary) or 'TBD'}
Attendees: {attendees_text}

Agenda:
{chr(10).join(agenda_lines) or '- None'}

Existing resolutions:
{chr(10).join(resolution_lines) or '- None'}

Existing action items:
{chr(10).join(action_lines) or '- None'}

Secretary's raw notes:
{raw_notes or '(no raw notes provided — derive only from agenda/resolutions/actions)'}

Additional notes: {extra or 'None'}

Return ONLY the JSON object."""

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
        sections = parsed.get("sections") or {}
        if not isinstance(sections, dict):
            sections = {}
        normalized = {
            "discussion": sections.get("discussion") or fallback_sections["discussion"],
            "decisions": sections.get("decisions") or fallback_sections["decisions"],
            "action_items": sections.get("action_items") or fallback_sections["action_items"],
            "resolutions": sections.get("resolutions") or fallback_sections["resolutions"],
        }
        return {
            "sections": normalized,
            "minutes": _assemble(normalized),
            "executive_summary": parsed.get("executive_summary") or "",
            "source": "ai",
            "message": "AI draft generated. Review each section for accuracy before saving.",
        }
    except Exception as exc:
        logger.warning(f"AI minutes generation failed: {exc}")
        return {
            "sections": fallback_sections,
            "minutes": _assemble(fallback_sections),
            "executive_summary": "",
            "source": "template",
            "message": f"AI drafting unavailable ({type(exc).__name__}); returned a structured template populated from existing meeting data.",
        }


@router.get("/approvals/{approval_id:int}/review-context")
def approval_review_context(
    approval_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    """Return the approval + a snapshot of the artifact under review for side-by-side comparison.

    Provides current artifact state plus version-history hints (approved_at, version, updated_at)
    so the approver can review the submitted version in-context rather than navigating away.
    """
    user_tenants = get_user_tenants(current_user, db)
    ap = db.query(AuditCommitteeApproval).filter(AuditCommitteeApproval.id == approval_id).first()
    if not ap or (ap.tenant_id and ap.tenant_id not in user_tenants):
        raise HTTPException(status_code=404, detail="Approval not found")

    canon = _canonical_target_type(ap.target_type)
    artifact: dict = {"target_type": canon, "target_id": ap.target_id, "snapshot": None, "history": []}
    try:
        if canon == "audit_plan":
            from grc.models import AuditPlan
            obj = db.query(AuditPlan).filter(
                AuditPlan.id == ap.target_id,
                AuditPlan.tenant_id == ap.tenant_id,
            ).first()
            if obj:
                artifact["snapshot"] = {
                    "id": obj.id, "name": getattr(obj, "name", None),
                    "year": getattr(obj, "year", None), "status": getattr(obj, "status", None),
                    "objectives": getattr(obj, "objectives", None),
                    "scope": getattr(obj, "scope", None),
                    "approved_at": getattr(obj, "approved_at", None) and obj.approved_at.isoformat(),
                    "updated_at": getattr(obj, "updated_at", None) and obj.updated_at.isoformat(),
                    "created_at": getattr(obj, "created_at", None) and obj.created_at.isoformat(),
                }
                artifact["history"] = [
                    {"event": "created", "at": artifact["snapshot"]["created_at"]},
                    {"event": "last_updated", "at": artifact["snapshot"]["updated_at"]},
                    {"event": "approved", "at": artifact["snapshot"]["approved_at"]},
                ]
        elif canon == "audit_charter":
            from grc.models import AuditCharter
            obj = db.query(AuditCharter).filter(
                AuditCharter.id == ap.target_id,
                AuditCharter.tenant_id == ap.tenant_id,
            ).first()
            if obj:
                artifact["snapshot"] = {
                    "id": obj.id, "title": getattr(obj, "title", None),
                    "version": getattr(obj, "version", None), "status": getattr(obj, "status", None),
                    "purpose": getattr(obj, "purpose", None),
                    "authority": getattr(obj, "authority", None),
                    "responsibility": getattr(obj, "responsibility", None),
                    "approved_at": getattr(obj, "approved_at", None) and obj.approved_at.isoformat(),
                    "updated_at": getattr(obj, "updated_at", None) and obj.updated_at.isoformat(),
                }
                artifact["history"] = [
                    {"event": f"version {getattr(obj, 'version', '1.0')}", "at": artifact["snapshot"]["updated_at"]},
                    {"event": "approved", "at": artifact["snapshot"]["approved_at"]},
                ]
        elif canon == "engagement":
            from grc.models import AuditEngagement
            obj = db.query(AuditEngagement).filter(
                AuditEngagement.id == ap.target_id,
                AuditEngagement.tenant_id == ap.tenant_id,
            ).first()
            if obj:
                artifact["snapshot"] = {
                    "id": obj.id, "title": getattr(obj, "title", None),
                    "status": getattr(obj, "status", None),
                    "objectives": getattr(obj, "objectives", None),
                    "scope": getattr(obj, "scope", None),
                    "updated_at": getattr(obj, "updated_at", None) and obj.updated_at.isoformat(),
                }
    except Exception as exc:
        logger.warning(f"approval_review_context: failed loading artifact: {exc}")
        artifact["error"] = str(exc)

    return {
        "approval": serialize_approval(ap),
        "artifact": artifact,
    }
