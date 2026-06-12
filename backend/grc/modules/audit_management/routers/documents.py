from typing import List, Optional
from datetime import datetime
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query, UploadFile, File, Form
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ....models import (
    AuditDocumentRepository, AuditEngagement, AuditFinding,
    GRCUser, get_db
)
from ....routers.auth_router import require_auth, get_user_tenants, get_user_primary_tenant

router = APIRouter(prefix="/documents", tags=["Audit - Documents"])
logger = logging.getLogger(__name__)

UPLOAD_DIR = os.path.join("backend", "uploads", "audit_documents")
os.makedirs(UPLOAD_DIR, exist_ok=True)


class DocumentCreate(BaseModel):
    title: str
    description: Optional[str] = None
    engagement_id: Optional[int] = None
    finding_id: Optional[int] = None
    workpaper_id: Optional[int] = None
    document_type: Optional[str] = "evidence"
    tags: Optional[list] = []
    is_confidential: Optional[bool] = False
    retention_years: Optional[int] = 7


class DocumentUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    document_type: Optional[str] = None
    tags: Optional[list] = None
    is_confidential: Optional[bool] = None
    retention_years: Optional[int] = None


def serialize_document(d: AuditDocumentRepository) -> dict:
    return {
        "id": d.id,
        "tenant_id": d.tenant_id,
        "engagement_id": d.engagement_id,
        "engagement_title": d.engagement.title if d.engagement else None,
        "finding_id": d.finding_id,
        "workpaper_id": d.workpaper_id,
        "title": d.title,
        "description": d.description,
        "document_type": d.document_type,
        "file_name": d.file_name,
        "file_size": d.file_size,
        "file_content_type": d.file_content_type,
        "tags": d.tags or [],
        "is_confidential": d.is_confidential,
        "retention_years": d.retention_years,
        "uploaded_by_id": d.uploaded_by_id,
        "uploaded_by_name": (d.uploaded_by.display_name or d.uploaded_by.username) if d.uploaded_by else None,
        "created_at": d.created_at.isoformat() if d.created_at else None,
        "updated_at": d.updated_at.isoformat() if d.updated_at else None,
    }


@router.get("")
def list_documents(
    engagement_id: Optional[int] = None,
    finding_id: Optional[int] = None,
    document_type: Optional[str] = None,
    search: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"documents": [], "total": 0}
    query = db.query(AuditDocumentRepository).filter(
        AuditDocumentRepository.tenant_id.in_(user_tenants)
    )
    if engagement_id:
        query = query.filter(AuditDocumentRepository.engagement_id == engagement_id)
    if finding_id:
        query = query.filter(AuditDocumentRepository.finding_id == finding_id)
    if document_type:
        query = query.filter(AuditDocumentRepository.document_type == document_type)
    if search:
        query = query.filter(AuditDocumentRepository.title.ilike(f"%{search}%"))
    docs = query.order_by(AuditDocumentRepository.created_at.desc()).all()
    return {"documents": [serialize_document(d) for d in docs], "total": len(docs)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_document(
    data: DocumentCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    doc = AuditDocumentRepository(
        tenant_id=tenant_id,
        engagement_id=data.engagement_id,
        finding_id=data.finding_id,
        workpaper_id=data.workpaper_id,
        title=data.title,
        description=data.description,
        document_type=data.document_type or "evidence",
        tags=data.tags or [],
        is_confidential=data.is_confidential or False,
        retention_years=data.retention_years or 7,
        uploaded_by_id=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return serialize_document(doc)


@router.post("/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    title: str = Form(...),
    document_type: str = Form("evidence"),
    engagement_id: Optional[int] = Form(None),
    finding_id: Optional[int] = Form(None),
    description: Optional[str] = Form(None),
    is_confidential: Optional[bool] = Form(False),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    file_content = await file.read()
    file_size = len(file_content)
    safe_name = f"{datetime.utcnow().strftime('%Y%m%d_%H%M%S')}_{file.filename}"
    file_path = os.path.join(UPLOAD_DIR, safe_name)
    with open(file_path, "wb") as f:
        f.write(file_content)
    doc = AuditDocumentRepository(
        tenant_id=tenant_id,
        engagement_id=engagement_id,
        finding_id=finding_id,
        title=title,
        description=description,
        document_type=document_type,
        file_name=file.filename,
        file_path=file_path,
        file_size=file_size,
        file_content_type=file.content_type,
        is_confidential=is_confidential or False,
        uploaded_by_id=current_user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return serialize_document(doc)


@router.get("/stats")
def get_document_stats(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"total": 0, "by_type": {}, "total_size_mb": 0}
    docs = db.query(AuditDocumentRepository).filter(
        AuditDocumentRepository.tenant_id.in_(user_tenants)
    ).all()
    by_type: dict = {}
    total_size = 0
    for d in docs:
        dt = d.document_type or "other"
        by_type[dt] = by_type.get(dt, 0) + 1
        total_size += d.file_size or 0
    return {
        "total": len(docs),
        "by_type": by_type,
        "total_size_mb": round(total_size / (1024 * 1024), 2),
        "confidential_count": sum(1 for d in docs if d.is_confidential),
    }


@router.get("/{document_id}")
def get_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    doc = db.query(AuditDocumentRepository).filter(
        AuditDocumentRepository.id == document_id,
        AuditDocumentRepository.tenant_id.in_(user_tenants)
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    return serialize_document(doc)


@router.put("/{document_id}")
def update_document(
    document_id: int,
    data: DocumentUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    doc = db.query(AuditDocumentRepository).filter(
        AuditDocumentRepository.id == document_id,
        AuditDocumentRepository.tenant_id.in_(user_tenants)
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(doc, field, value)
    doc.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(doc)
    return serialize_document(doc)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    doc = db.query(AuditDocumentRepository).filter(
        AuditDocumentRepository.id == document_id,
        AuditDocumentRepository.tenant_id.in_(user_tenants)
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Document not found")
    if doc.file_path and os.path.exists(doc.file_path):
        try:
            os.remove(doc.file_path)
        except Exception:
            pass
    db.delete(doc)
    db.commit()
