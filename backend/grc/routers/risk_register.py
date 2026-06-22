import logging
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from ..models import Risk, GRCUser, BusinessUnit, get_db
from .auth_router import require_auth, get_user_tenants, get_user_primary_tenant

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/audit/risk-register", tags=["Risk Register"])


class RiskCreate(BaseModel):
    title: str
    description: Optional[str] = None
    category: str = "operational"
    risk_category: Optional[str] = "operational"
    risk_sub_category: Optional[str] = None
    register_type: Optional[str] = None
    business_unit_id: Optional[int] = None
    owner_id: Optional[int] = None
    business_owner_id: Optional[int] = None
    inherent_likelihood: Optional[int] = None
    inherent_impact: Optional[int] = None
    inherent_score: Optional[float] = None
    residual_likelihood: Optional[int] = None
    residual_impact: Optional[int] = None
    residual_score: Optional[float] = None
    risk_appetite: Optional[str] = None
    status: str = "open"
    treatment_plan: Optional[str] = None
    due_date: Optional[str] = None
    affected_department_ids: Optional[List[int]] = None


class RiskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    risk_category: Optional[str] = None
    risk_sub_category: Optional[str] = None
    register_type: Optional[str] = None
    business_unit_id: Optional[int] = None
    owner_id: Optional[int] = None
    business_owner_id: Optional[int] = None
    inherent_likelihood: Optional[int] = None
    inherent_impact: Optional[int] = None
    inherent_score: Optional[float] = None
    residual_likelihood: Optional[int] = None
    residual_impact: Optional[int] = None
    residual_score: Optional[float] = None
    risk_appetite: Optional[str] = None
    status: Optional[str] = None
    treatment_plan: Optional[str] = None
    due_date: Optional[str] = None
    closure_status: Optional[str] = None
    closure_notes: Optional[str] = None
    affected_department_ids: Optional[List[int]] = None


def serialize_risk(r: Risk) -> dict:
    return {
        "id": r.id,
        "tenant_id": r.tenant_id,
        "title": r.title,
        "description": r.description,
        "category": r.category,
        "risk_category": r.risk_category,
        "risk_sub_category": r.risk_sub_category,
        "register_type": r.register_type,
        "business_unit_id": r.business_unit_id,
        "business_unit_name": r.business_unit.name if r.business_unit else None,
        "owner_id": r.owner_id,
        "owner_name": r.owner.display_name or r.owner.username if r.owner else None,
        "business_owner_id": r.business_owner_id,
        "inherent_likelihood": r.inherent_likelihood,
        "inherent_impact": r.inherent_impact,
        "inherent_score": r.inherent_score,
        "residual_likelihood": r.residual_likelihood,
        "residual_impact": r.residual_impact,
        "residual_score": r.residual_score,
        "risk_appetite": r.risk_appetite,
        "status": r.status,
        "treatment_plan": r.treatment_plan,
        "closure_status": r.closure_status,
        "closed_at": r.closed_at.isoformat() if r.closed_at else None,
        "closure_notes": r.closure_notes,
        "due_date": r.due_date.isoformat() if r.due_date else None,
        "review_date": r.review_date.isoformat() if r.review_date else None,
        "affected_department_ids": r.affected_department_ids or [],
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "updated_at": r.updated_at.isoformat() if r.updated_at else None,
    }


def _compute_inherent(r: Risk):
    if r.inherent_score is not None:
        return
    if r.inherent_likelihood is not None and r.inherent_impact is not None:
        r.inherent_score = round((r.inherent_likelihood * r.inherent_impact) / 25.0 * 100, 1)


def _compute_residual(r: Risk):
    if r.residual_score is not None:
        return
    if r.residual_likelihood is not None and r.residual_impact is not None:
        r.residual_score = round((r.residual_likelihood * r.residual_impact) / 25.0 * 100, 1)


@router.get("")
def list_risks(
    category: Optional[str] = None,
    status: Optional[str] = None,
    register_type: Optional[str] = None,
    search: Optional[str] = Query(None, min_length=1),
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"risks": [], "total": 0}
    query = db.query(Risk).filter(Risk.tenant_id.in_(user_tenants))
    if category:
        query = query.filter(Risk.category == category)
    if status:
        query = query.filter(Risk.status == status)
    if register_type:
        query = query.filter(Risk.register_type == register_type)
    if search:
        like = f"%{search}%"
        query = query.filter(Risk.title.ilike(like) | (Risk.description.ilike(like)))
    risks = query.order_by(Risk.residual_score.desc().nullslast(), Risk.created_at.desc()).all()
    return {"risks": [serialize_risk(r) for r in risks], "total": len(risks)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_risk(
    data: RiskCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    risk = Risk(
        tenant_id=tenant_id,
        title=data.title,
        description=data.description,
        category=data.category,
        risk_category=data.risk_category or data.category,
        risk_sub_category=data.risk_sub_category,
        register_type=data.register_type,
        business_unit_id=data.business_unit_id,
        owner_id=data.owner_id,
        business_owner_id=data.business_owner_id,
        inherent_likelihood=data.inherent_likelihood,
        inherent_impact=data.inherent_impact,
        inherent_score=data.inherent_score,
        residual_likelihood=data.residual_likelihood,
        residual_impact=data.residual_impact,
        residual_score=data.residual_score,
        risk_appetite=data.risk_appetite,
        status=data.status,
        treatment_plan=data.treatment_plan,
        affected_department_ids=data.affected_department_ids or [],
    )
    if data.due_date:
        try:
            risk.due_date = datetime.fromisoformat(data.due_date)
        except (ValueError, TypeError):
            pass
    _compute_inherent(risk)
    _compute_residual(risk)
    db.add(risk)
    db.commit()
    db.refresh(risk)
    return serialize_risk(risk)


@router.get("/{risk_id}")
def get_risk(
    risk_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    risk = db.query(Risk).filter(Risk.id == risk_id, Risk.tenant_id.in_(user_tenants)).first()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    return serialize_risk(risk)


@router.put("/{risk_id}")
def update_risk(
    risk_id: int,
    data: RiskUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    risk = db.query(Risk).filter(Risk.id == risk_id, Risk.tenant_id.in_(user_tenants)).first()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    update_fields = data.dict(exclude_unset=True)
    for field, value in update_fields.items():
        if field == "due_date" and value is not None:
            try:
                setattr(risk, field, datetime.fromisoformat(value))
            except (ValueError, TypeError):
                pass
        elif field == "affected_department_ids":
            setattr(risk, field, value or [])
        else:
            setattr(risk, field, value)
    _compute_inherent(risk)
    _compute_residual(risk)
    if data.status == "closed" and not risk.closed_at:
        risk.closed_at = datetime.utcnow()
        risk.closed_by = current_user.id
    risk.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(risk)
    return serialize_risk(risk)


@router.delete("/{risk_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_risk(
    risk_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    risk = db.query(Risk).filter(Risk.id == risk_id, Risk.tenant_id.in_(user_tenants)).first()
    if not risk:
        raise HTTPException(status_code=404, detail="Risk not found")
    db.delete(risk)
    db.commit()


@router.get("/categories/summary")
def risk_category_summary(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"categories": []}
    rows = db.query(
        Risk.category,
        func.count(Risk.id).label("count"),
        func.avg(Risk.residual_score).label("avg_score"),
        func.max(Risk.residual_score).label("max_score"),
    ).filter(
        Risk.tenant_id.in_(user_tenants),
    ).group_by(Risk.category).all()
    return {
        "categories": [
            {
                "category": r.category,
                "count": r.count,
                "avg_score": round(float(r.avg_score or 0), 1),
                "max_score": float(r.max_score or 0),
            }
            for r in rows
        ]
    }
