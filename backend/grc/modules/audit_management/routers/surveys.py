from typing import List, Optional
from datetime import datetime
import json
import os
import logging
from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel
from openai import OpenAI

from ....models import (
    AuditSurvey, AuditSurveyResponse, AuditEngagement,
    GRCUser, get_db
)
from ....routers.auth_router import require_auth, get_user_tenants, get_user_primary_tenant

router = APIRouter(prefix="/surveys", tags=["Audit - Surveys"])
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


class SurveyCreate(BaseModel):
    title: str
    description: Optional[str] = None
    engagement_id: Optional[int] = None
    survey_type: Optional[str] = "pre_audit"
    questions: Optional[list] = []
    recipient_emails: Optional[list] = []
    due_date: Optional[datetime] = None


class SurveyUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    survey_type: Optional[str] = None
    questions: Optional[list] = None
    recipient_emails: Optional[list] = None
    due_date: Optional[datetime] = None
    status: Optional[str] = None


class SurveyResponseCreate(BaseModel):
    respondent_email: str
    respondent_name: Optional[str] = None
    answers: Optional[dict] = {}


class AIGenerateQuestionsRequest(BaseModel):
    engagement_title: Optional[str] = None
    engagement_scope: Optional[str] = None
    survey_type: Optional[str] = "pre_audit"
    control_area: Optional[str] = None


def serialize_survey(s: AuditSurvey) -> dict:
    responses_summary = {"total": 0, "submitted": 0, "pending": 0}
    if s.responses:
        responses_summary["total"] = len(s.responses)
        responses_summary["submitted"] = sum(1 for r in s.responses if r.status == "submitted")
        responses_summary["pending"] = sum(1 for r in s.responses if r.status != "submitted")
    return {
        "id": s.id,
        "tenant_id": s.tenant_id,
        "engagement_id": s.engagement_id,
        "engagement_title": s.engagement.title if s.engagement else None,
        "title": s.title,
        "description": s.description,
        "survey_type": s.survey_type,
        "status": s.status,
        "questions": s.questions or [],
        "recipient_emails": s.recipient_emails or [],
        "due_date": s.due_date.isoformat() if s.due_date else None,
        "sent_at": s.sent_at.isoformat() if s.sent_at else None,
        "closed_at": s.closed_at.isoformat() if s.closed_at else None,
        "responses_summary": responses_summary,
        "created_by_id": s.created_by_id,
        "created_at": s.created_at.isoformat() if s.created_at else None,
        "updated_at": s.updated_at.isoformat() if s.updated_at else None,
    }


def serialize_response(r: AuditSurveyResponse) -> dict:
    return {
        "id": r.id,
        "survey_id": r.survey_id,
        "respondent_email": r.respondent_email,
        "respondent_name": r.respondent_name,
        "answers": r.answers or {},
        "status": r.status,
        "submitted_at": r.submitted_at.isoformat() if r.submitted_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }


@router.get("")
def list_surveys(
    engagement_id: Optional[int] = None,
    survey_type: Optional[str] = None,
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"surveys": [], "total": 0}
    query = db.query(AuditSurvey).filter(AuditSurvey.tenant_id.in_(user_tenants))
    if engagement_id:
        query = query.filter(AuditSurvey.engagement_id == engagement_id)
    if survey_type:
        query = query.filter(AuditSurvey.survey_type == survey_type)
    if status_filter:
        query = query.filter(AuditSurvey.status == status_filter)
    surveys = query.order_by(AuditSurvey.created_at.desc()).all()
    return {"surveys": [serialize_survey(s) for s in surveys], "total": len(surveys)}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_survey(
    data: SurveyCreate,
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
    survey = AuditSurvey(
        tenant_id=tenant_id,
        engagement_id=data.engagement_id,
        title=data.title,
        description=data.description,
        survey_type=data.survey_type or "pre_audit",
        questions=data.questions or [],
        recipient_emails=data.recipient_emails or [],
        due_date=data.due_date,
        created_by_id=current_user.id,
    )
    db.add(survey)
    db.commit()
    db.refresh(survey)
    return serialize_survey(survey)


@router.get("/{survey_id}")
def get_survey(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    survey = db.query(AuditSurvey).filter(
        AuditSurvey.id == survey_id,
        AuditSurvey.tenant_id.in_(user_tenants)
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    result = serialize_survey(survey)
    result["responses"] = [serialize_response(r) for r in (survey.responses or [])]
    return result


@router.put("/{survey_id}")
def update_survey(
    survey_id: int,
    data: SurveyUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    survey = db.query(AuditSurvey).filter(
        AuditSurvey.id == survey_id,
        AuditSurvey.tenant_id.in_(user_tenants)
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    for field, value in data.dict(exclude_unset=True).items():
        setattr(survey, field, value)
    survey.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(survey)
    return serialize_survey(survey)


@router.delete("/{survey_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_survey(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    survey = db.query(AuditSurvey).filter(
        AuditSurvey.id == survey_id,
        AuditSurvey.tenant_id.in_(user_tenants)
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    db.delete(survey)
    db.commit()


@router.post("/{survey_id}/send")
def send_survey(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    survey = db.query(AuditSurvey).filter(
        AuditSurvey.id == survey_id,
        AuditSurvey.tenant_id.in_(user_tenants)
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    if not survey.questions:
        raise HTTPException(status_code=400, detail="Survey has no questions")
    if not survey.recipient_emails:
        raise HTTPException(status_code=400, detail="No recipients defined")
    for email in (survey.recipient_emails or []):
        existing = db.query(AuditSurveyResponse).filter(
            AuditSurveyResponse.survey_id == survey_id,
            AuditSurveyResponse.respondent_email == email
        ).first()
        if not existing:
            resp = AuditSurveyResponse(
                survey_id=survey_id,
                respondent_email=email,
                status="pending",
            )
            db.add(resp)
    survey.status = "sent"
    survey.sent_at = datetime.utcnow()
    survey.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(survey)
    return {"message": f"Survey sent to {len(survey.recipient_emails)} recipient(s)", "survey": serialize_survey(survey)}


@router.post("/{survey_id}/close")
def close_survey(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    survey = db.query(AuditSurvey).filter(
        AuditSurvey.id == survey_id,
        AuditSurvey.tenant_id.in_(user_tenants)
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    survey.status = "closed"
    survey.closed_at = datetime.utcnow()
    survey.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(survey)
    return serialize_survey(survey)


@router.get("/{survey_id}/responses")
def list_responses(
    survey_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    survey = db.query(AuditSurvey).filter(
        AuditSurvey.id == survey_id,
        AuditSurvey.tenant_id.in_(user_tenants)
    ).first()
    if not survey:
        raise HTTPException(status_code=404, detail="Survey not found")
    return [serialize_response(r) for r in (survey.responses or [])]


@router.put("/{survey_id}/responses/{response_id}")
def submit_response(
    survey_id: int,
    response_id: int,
    data: SurveyResponseCreate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    resp = db.query(AuditSurveyResponse).filter(
        AuditSurveyResponse.id == response_id,
        AuditSurveyResponse.survey_id == survey_id
    ).first()
    if not resp:
        raise HTTPException(status_code=404, detail="Response not found")
    resp.answers = data.answers or {}
    resp.respondent_name = data.respondent_name or resp.respondent_name
    resp.status = "submitted"
    resp.submitted_at = datetime.utcnow()
    db.commit()
    db.refresh(resp)
    survey = resp.survey
    if survey:
        all_submitted = all(r.status == "submitted" for r in (survey.responses or []))
        if all_submitted and survey.status not in ("closed",):
            survey.status = "completed"
            survey.updated_at = datetime.utcnow()
            db.commit()
    return serialize_response(resp)


@router.post("/ai/generate-questions")
def ai_generate_questions(
    data: AIGenerateQuestionsRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    client = get_openai_client()
    type_labels = {
        "pre_audit": "pre-audit questionnaire sent to auditees before fieldwork",
        "post_audit": "post-audit satisfaction survey",
        "control_self_assessment": "control self-assessment questionnaire",
    }
    type_label = type_labels.get(data.survey_type or "pre_audit", "pre-audit questionnaire")
    context_parts = []
    if data.engagement_title:
        context_parts.append(f"Audit title: {data.engagement_title}")
    if data.engagement_scope:
        context_parts.append(f"Scope: {data.engagement_scope}")
    if data.control_area:
        context_parts.append(f"Control area: {data.control_area}")
    context = "\n".join(context_parts) or "General internal audit"

    if not client:
        questions = [
            {"id": "q1", "text": "Please describe your team's current control environment.", "type": "textarea", "required": True},
            {"id": "q2", "text": "Have there been any significant process changes in the past 12 months?", "type": "yesno", "required": True},
            {"id": "q3", "text": "Are documented policies and procedures in place and up to date?", "type": "yesno", "required": True},
            {"id": "q4", "text": "How would you rate the risk maturity of your area?", "type": "rating", "required": True},
            {"id": "q5", "text": "List any known control gaps or concerns.", "type": "textarea", "required": False},
        ]
        return {"questions": questions, "source": "template"}

    prompt = f"""Generate 8-10 audit survey questions for a {type_label}.
Context:
{context}

Return strict JSON array where each item has:
- id: string (q1, q2, ...)
- text: the question text
- type: one of "text", "textarea", "yesno", "rating", "multiple_choice"
- options: array of strings (only for multiple_choice)
- required: boolean

Focus on control effectiveness, risk management, process documentation, and compliance."""

    try:
        completion = client.chat.completions.create(
            model="gpt-4o-mini",
            temperature=0.3,
            messages=[
                {"role": "system", "content": "Return valid JSON array only."},
                {"role": "user", "content": prompt},
            ],
        )
        content = (completion.choices[0].message.content or "").strip()
        if content.startswith("```"):
            content = content.split("```")[1]
            if content.startswith("json"):
                content = content[4:]
        questions = json.loads(content)
        return {"questions": questions, "source": "ai"}
    except Exception as exc:
        logger.warning(f"AI question generation failed: {exc}")
        questions = [
            {"id": "q1", "text": "Please describe your team's current control environment.", "type": "textarea", "required": True},
            {"id": "q2", "text": "Have there been any significant process changes in the past 12 months?", "type": "yesno", "required": True},
            {"id": "q3", "text": "Are documented policies and procedures in place and up to date?", "type": "yesno", "required": True},
            {"id": "q4", "text": "How would you rate the risk maturity of your area?", "type": "rating", "required": True},
            {"id": "q5", "text": "List any known control gaps or concerns.", "type": "textarea", "required": False},
        ]
        return {"questions": questions, "source": "template"}
