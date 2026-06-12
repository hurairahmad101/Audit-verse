from typing import Optional
from datetime import datetime, timedelta
import secrets
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ....models import (
    ExternalAuditorSession, AuditEngagement, AuditDocumentRepository,
    GRCUser, get_db
)
from ....routers.auth_router import require_auth, get_user_tenants, get_user_primary_tenant

router = APIRouter(prefix="/external-portal", tags=["Audit - External Portal"])
logger = logging.getLogger(__name__)


class SessionCreate(BaseModel):
    auditor_name: str
    auditor_email: str
    auditor_firm: Optional[str] = None
    audit_type: Optional[str] = "external_audit"
    engagement_id: Optional[int] = None
    notes: Optional[str] = None
    expires_days: Optional[int] = 30
    pbc_items: Optional[list] = []


class SessionUpdate(BaseModel):
    auditor_name: Optional[str] = None
    auditor_firm: Optional[str] = None
    notes: Optional[str] = None
    status: Optional[str] = None
    pbc_items: Optional[list] = None
    shared_document_ids: Optional[list] = None


class PBCItemUpdate(BaseModel):
    pbc_items: list


class ShareDocumentsRequest(BaseModel):
    document_ids: list


def serialize_session(s: ExternalAuditorSession, include_docs: bool = False) -> dict:
    result = {
        "id": s.id,
        "tenant_id": s.tenant_id,
        "engagement_id": s.engagement_id,
        "engagement_title": s.engagement.title if s.engagement else None,
        "auditor_name": s.auditor_name,
        "auditor_email": s.auditor_email,
        "auditor_firm": s.auditor_firm,
        "audit_type": s.audit_type,
        "access_token": s.access_token,
        "status": s.status,
        "pbc_items": s.pbc_items or [],
        "shared_document_ids": s.shared_document_ids or [],
        "notes": s.notes,
        "expires_at": s.expires_at.isoformat() if s.expires_at else None,
        "last_accessed_at": s.last_accessed_at.isoformat() if s.last_accessed_at else None,
        "created_by_id": s.created_by_id,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }
    pbc = s.pbc_items or []
    result["pbc_stats"] = {
        "total": len(pbc),
        "submitted": sum(1 for i in pbc if i.get("status") == "submitted"),
        "pending": sum(1 for i in pbc if i.get("status") != "submitted"),
    }
    return result


@router.get("")
def list_sessions(
    engagement_id: Optional[int] = None,
    session_status: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"sessions": [], "total": 0}
    query = db.query(ExternalAuditorSession).filter(
        ExternalAuditorSession.tenant_id.in_(user_tenants)
    )
    if engagement_id:
        query = query.filter(ExternalAuditorSession.engagement_id == engagement_id)
    if session_status:
        query = query.filter(ExternalAuditorSession.status == session_status)
    sessions = query.order_by(ExternalAuditorSession.created_at.desc()).all()
    return {"sessions": [serialize_session(s) for s in sessions], "total": len(sessions)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_session(
    data: SessionCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    if data.engagement_id:
        eng = db.query(AuditEngagement).filter(
            AuditEngagement.id == data.engagement_id,
            AuditEngagement.tenant_id == tenant_id
        ).first()
        if not eng:
            raise HTTPException(status_code=404, detail="Engagement not found")
    token = secrets.token_urlsafe(32)
    expires = datetime.utcnow() + timedelta(days=data.expires_days or 30)
    session = ExternalAuditorSession(
        tenant_id=tenant_id,
        engagement_id=data.engagement_id,
        auditor_name=data.auditor_name,
        auditor_email=data.auditor_email,
        auditor_firm=data.auditor_firm,
        audit_type=data.audit_type or "external_audit",
        access_token=token,
        status="active",
        pbc_items=data.pbc_items or [],
        shared_document_ids=[],
        notes=data.notes,
        expires_at=expires,
        created_by_id=current_user.id,
    )
    db.add(session)
    db.commit()
    db.refresh(session)
    return serialize_session(session)


@router.get("/access/{token}")
def access_portal(
    token: str,
    db: Session = Depends(get_db)
):
    session = db.query(ExternalAuditorSession).filter(
        ExternalAuditorSession.access_token == token,
        ExternalAuditorSession.status == "active"
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid or expired portal link")
    if session.expires_at and session.expires_at < datetime.utcnow():
        session.status = "expired"
        db.commit()
        raise HTTPException(status_code=403, detail="This portal link has expired")
    session.last_accessed_at = datetime.utcnow()
    db.commit()
    shared_docs = []
    if session.shared_document_ids:
        docs = db.query(AuditDocumentRepository).filter(
            AuditDocumentRepository.id.in_(session.shared_document_ids)
        ).all()
        shared_docs = [{
            "id": d.id,
            "title": d.title,
            "document_type": d.document_type,
            "file_name": d.file_name,
            "file_size": d.file_size,
        } for d in docs]
    return {
        "session_id": session.id,
        "auditor_name": session.auditor_name,
        "auditor_firm": session.auditor_firm,
        "audit_type": session.audit_type,
        "engagement_title": session.engagement.title if session.engagement else None,
        "pbc_items": session.pbc_items or [],
        "shared_documents": shared_docs,
        "expires_at": session.expires_at.isoformat() if session.expires_at else None,
    }


@router.put("/access/{token}/pbc/{item_id}")
def submit_pbc_item(
    token: str,
    item_id: str,
    db: Session = Depends(get_db)
):
    session = db.query(ExternalAuditorSession).filter(
        ExternalAuditorSession.access_token == token,
        ExternalAuditorSession.status == "active"
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Invalid or expired portal link")
    pbc = list(session.pbc_items or [])
    for item in pbc:
        if str(item.get("id")) == str(item_id):
            item["status"] = "submitted"
            item["submitted_at"] = datetime.utcnow().isoformat()
            break
    session.pbc_items = pbc
    session.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "PBC item marked as submitted"}


@router.get("/{session_id}")
def get_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    session = db.query(ExternalAuditorSession).filter(
        ExternalAuditorSession.id == session_id,
        ExternalAuditorSession.tenant_id.in_(user_tenants)
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return serialize_session(session, include_docs=True)


@router.put("/{session_id}")
def update_session(
    session_id: int,
    data: SessionUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    session = db.query(ExternalAuditorSession).filter(
        ExternalAuditorSession.id == session_id,
        ExternalAuditorSession.tenant_id.in_(user_tenants)
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(session, field, value)
    session.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(session)
    return serialize_session(session)


@router.post("/{session_id}/share-documents")
def share_documents(
    session_id: int,
    data: ShareDocumentsRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    session = db.query(ExternalAuditorSession).filter(
        ExternalAuditorSession.id == session_id,
        ExternalAuditorSession.tenant_id.in_(user_tenants)
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    existing = set(session.shared_document_ids or [])
    new_ids = [d for d in data.document_ids if d not in existing]
    session.shared_document_ids = list(existing | set(data.document_ids))
    session.updated_at = datetime.utcnow()
    db.commit()
    return {"message": f"Shared {len(new_ids)} document(s)", "total_shared": len(session.shared_document_ids)}


@router.post("/{session_id}/revoke")
def revoke_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    session = db.query(ExternalAuditorSession).filter(
        ExternalAuditorSession.id == session_id,
        ExternalAuditorSession.tenant_id.in_(user_tenants)
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    session.status = "revoked"
    session.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Portal access revoked"}


@router.delete("/{session_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_session(
    session_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    session = db.query(ExternalAuditorSession).filter(
        ExternalAuditorSession.id == session_id,
        ExternalAuditorSession.tenant_id.in_(user_tenants)
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    db.delete(session)
    db.commit()
