import os
import json
import logging
from typing import Dict, List, Optional, Any
from datetime import datetime, timedelta
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from pydantic import BaseModel

from ....models import (
    AuditableEntity, AuditEngagement, AuditFinding, Risk,
    RiskScoringConfig, AuditEntityScoreHistory, GRCUser, get_db,
)
from ....routers.auth_router import require_auth, get_user_tenants, get_user_primary_tenant
from ..scoring import (
    FACTOR_DEFINITIONS, DEFAULT_WEIGHTS, MANUAL_FACTOR_KEYS, normalize_weights,
    apply_score_to_entity, compute_entity_score, compute_factor_values, score_to_rating,
)
from ..lifecycle import rescore_entity

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/scoring", tags=["Audit - Risk Scoring"])

_MANUAL_FACTOR_META = {f["key"]: f for f in FACTOR_DEFINITIONS if f["source"] == "manual"}


def _get_ai_client():
    """Return an OpenAI client or None (graceful — AI features are optional)."""
    api_key = os.environ.get("AI_INTEGRATIONS_OPENAI_API_KEY") or os.environ.get("OPENAI_API_KEY")
    base_url = os.environ.get("AI_INTEGRATIONS_OPENAI_BASE_URL")
    if not api_key:
        return None
    try:
        from openai import OpenAI
    except Exception:
        return None
    kwargs = {"api_key": api_key}
    if base_url:
        kwargs["base_url"] = base_url
    try:
        return OpenAI(**kwargs)
    except Exception:
        return None


class ScoringConfigUpdate(BaseModel):
    weights: Dict[str, float]
    alert_delta: Optional[float] = None
    alert_on_rating_change: Optional[bool] = None


class FactorInputUpdate(BaseModel):
    risk_factors: Dict[str, float]


class OverrideRequest(BaseModel):
    override_score: float
    override_rating: Optional[str] = None
    justification: str


def get_or_create_config(db: Session, tenant_id: int) -> RiskScoringConfig:
    cfg = db.query(RiskScoringConfig).filter(RiskScoringConfig.tenant_id == tenant_id).first()
    if not cfg:
        cfg = RiskScoringConfig(tenant_id=tenant_id, weights=dict(DEFAULT_WEIGHTS))
        db.add(cfg)
        db.commit()
        db.refresh(cfg)
    return cfg


@router.get("/config")
def get_scoring_config(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    cfg = get_or_create_config(db, tenant_id)
    weights = normalize_weights(cfg.weights)
    return {
        "weights": weights,
        "factors": FACTOR_DEFINITIONS,
        "default_weights": DEFAULT_WEIGHTS,
        "alert_delta": cfg.alert_delta if cfg.alert_delta is not None else 10.0,
        "alert_on_rating_change": cfg.alert_on_rating_change if cfg.alert_on_rating_change is not None else True,
        "updated_at": cfg.updated_at.isoformat() if cfg.updated_at else None,
    }


@router.put("/config")
def update_scoring_config(
    data: ScoringConfigUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    cfg = get_or_create_config(db, tenant_id)
    cfg.weights = normalize_weights(data.weights)
    if data.alert_delta is not None:
        cfg.alert_delta = max(0.0, float(data.alert_delta))
    if data.alert_on_rating_change is not None:
        cfg.alert_on_rating_change = bool(data.alert_on_rating_change)
    cfg.updated_by_id = current_user.id
    cfg.updated_at = datetime.utcnow()
    db.commit()
    db.refresh(cfg)
    return {
        "weights": cfg.weights,
        "factors": FACTOR_DEFINITIONS,
        "alert_delta": cfg.alert_delta,
        "alert_on_rating_change": cfg.alert_on_rating_change,
    }


def _recompute_due_date(entity: AuditableEntity):
    cycle = entity.audit_cycle_months or 12
    base = entity.last_audited_date or datetime.utcnow()
    entity.next_audit_due = base + timedelta(days=cycle * 30)


@router.post("/run")
def run_scoring(
    entity_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    cfg = get_or_create_config(db, tenant_id)
    weights = normalize_weights(cfg.weights)

    query = db.query(AuditableEntity).filter(AuditableEntity.tenant_id == tenant_id)
    if entity_id is not None:
        query = query.filter(AuditableEntity.id == entity_id)
    entities = query.all()
    if entity_id is not None and not entities:
        raise HTTPException(status_code=404, detail="Entity not found")

    reason = "manual_rescore" if entity_id is not None else "bulk_rescore"
    scored = 0
    alerts = 0
    for entity in entities:
        info = rescore_entity(
            db, entity, weights, reason=reason, user_id=current_user.id,
            alert_delta=cfg.alert_delta if cfg.alert_delta is not None else 10.0,
            alert_on_rating_change=cfg.alert_on_rating_change if cfg.alert_on_rating_change is not None else True,
        )
        if info.get("alert"):
            alerts += 1
        scored += 1
    db.commit()
    return {"message": f"Scored {scored} entities", "scored": scored, "total": len(entities), "alerts_raised": alerts}


@router.get("/entity/{entity_id}")
def get_entity_score_breakdown(
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    entity = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id.in_(user_tenants),
    ).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    cfg = get_or_create_config(db, entity.tenant_id)
    weights = normalize_weights(cfg.weights)
    result = compute_entity_score(db, entity, weights)
    return {
        "entity_id": entity.id,
        "entity_name": entity.name,
        "auto_risk_score": result["composite_score"],
        "auto_rating": result["rating"],
        "contributions": result["contributions"],
        "score_override": bool(entity.score_override),
        "override_score": entity.override_score,
        "override_rating": entity.override_rating,
        "override_justification": entity.override_justification,
        "effective_score": entity.risk_score,
        "effective_rating": entity.risk_rating,
        "risk_factors": entity.risk_factors or {},
    }


@router.put("/entity/{entity_id}/factors")
def update_entity_factors(
    entity_id: int,
    data: FactorInputUpdate,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    entity = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id.in_(user_tenants),
    ).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    factors = dict(entity.risk_factors or {})
    for key, value in (data.risk_factors or {}).items():
        try:
            factors[key] = max(0.0, min(100.0, float(value)))
        except (TypeError, ValueError):
            continue
    entity.risk_factors = factors
    cfg = get_or_create_config(db, entity.tenant_id)
    result = rescore_entity(
        db, entity, normalize_weights(cfg.weights), reason="factors_updated",
        user_id=current_user.id,
        alert_delta=cfg.alert_delta if cfg.alert_delta is not None else 10.0,
        alert_on_rating_change=cfg.alert_on_rating_change if cfg.alert_on_rating_change is not None else True,
    )
    db.commit()
    return {
        "message": "Factors updated",
        "auto_risk_score": result["composite_score"],
        "contributions": result["contributions"],
        "alert": result.get("alert"),
    }


def _fallback_narrative(entity_name: str, score: float, rating: str, drivers: List[dict]) -> str:
    top = drivers[:3]
    if not top or score <= 0:
        return (
            f"{entity_name} has a composite risk score of {score:.0f}/100 ({rating}). "
            f"No significant risk factors have been recorded yet — capture manual factor "
            f"inputs (e.g. financial materiality, external intelligence) or link risks to "
            f"sharpen this assessment."
        )
    parts = [
        f"{d['label']} (value {d['value']:.0f}/100, contributing {d['contribution']:.1f} pts)"
        for d in top
    ]
    lead = top[0]
    return (
        f"{entity_name} carries a {rating} risk profile with a composite score of {score:.0f}/100. "
        f"The score is driven primarily by {'; '.join(parts)}. "
        f"{lead['label']} is the single largest contributor and should anchor the audit "
        f"response and any risk-mitigation effort."
    )


@router.get("/entity/{entity_id}/narrative")
def get_entity_risk_narrative(
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    entity = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id.in_(user_tenants),
    ).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    cfg = get_or_create_config(db, entity.tenant_id)
    result = compute_entity_score(db, entity, normalize_weights(cfg.weights))
    contributions = sorted(
        result["contributions"], key=lambda c: c.get("contribution", 0), reverse=True
    )
    drivers = [c for c in contributions if c.get("contribution", 0) > 0]
    score = float(entity.risk_score if entity.risk_score is not None else result["composite_score"])
    rating = entity.risk_rating or result["rating"]

    client = _get_ai_client()
    if client is not None:
        try:
            factor_lines = "\n".join(
                f"- {c['label']} ({c['source']}): value {c['value']}/100, "
                f"weight {round(c['weight'] * 100)}%, contributing {c['contribution']:.1f} pts"
                for c in contributions
            )
            prompt = (
                f"You are a chief audit executive writing a concise risk narrative for the "
                f"auditable entity '{entity.name}' (type: {entity.entity_type or 'n/a'}, "
                f"industry: {getattr(entity, 'industry', None) or 'n/a'}).\n"
                f"Composite risk score: {score:.0f}/100 ({rating}).\n"
                f"Factor contributions:\n{factor_lines}\n\n"
                f"Write 3-5 sentences explaining WHY this entity scores as it does, naming the "
                f"dominant drivers and what an audit should focus on. Be specific and factual; "
                f"do not invent data beyond the factors above."
            )
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You write precise, board-ready audit risk narratives."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=400,
                temperature=0.4,
            )
            narrative = (resp.choices[0].message.content or "").strip()
            if narrative:
                return {
                    "narrative": narrative,
                    "source": "ai",
                    "composite_score": score,
                    "rating": rating,
                    "drivers": drivers[:5],
                }
        except Exception as e:
            logger.warning(f"AI narrative failed for entity {entity_id}: {e}")

    return {
        "narrative": _fallback_narrative(entity.name, score, rating, drivers),
        "source": "fallback",
        "composite_score": score,
        "rating": rating,
        "drivers": drivers[:5],
    }


def _heuristic_factor_suggestions(entity, auto_values: Dict[str, float]) -> List[dict]:
    """Deterministic suggestions for manual factors derived from available signals."""
    industry = (getattr(entity, "industry", None) or "").lower()
    regulated = industry in ("banking", "healthcare", "insurance", "energy", "government")
    current = entity.risk_factors or {}
    findings_signal = auto_values.get("findings_history", 0) or 0
    inherent_signal = auto_values.get("inherent_risk", 0) or 0

    def clamp(v):
        return max(0.0, min(100.0, round(float(v), 1)))

    suggestions_raw = {
        "materiality": (
            clamp(inherent_signal if inherent_signal else 50),
            "Estimated from linked inherent risk as a proxy for financial exposure; "
            "replace with actual budget/revenue materiality where known.",
        ),
        "regulatory": (
            clamp(75 if regulated else 40),
            f"{'Highly regulated' if regulated else 'Moderately regulated'} industry "
            f"({industry or 'unspecified'}) — adjust for entity-specific obligations.",
        ),
        "strategic_importance": (
            clamp(60 if (entity.entity_type or '').lower() in ('process', 'business unit', 'department') else 45),
            "Baseline based on entity type; raise for entities tied to strategic objectives.",
        ),
        "fraud_risk": (
            clamp(60 if findings_signal > 50 else 30),
            "Elevated where prior findings history is high; confirm against cash-handling "
            "and override exposure.",
        ),
        "change_volatility": (
            clamp(45),
            "Neutral baseline — increase for entities undergoing transformation, M&A, or "
            "system changes.",
        ),
        "external_intelligence": (
            clamp(55 if regulated else 30),
            "Reflects sector threat/regulatory attention; update from external feeds, "
            "regulator actions, or news.",
        ),
    }

    out = []
    for key in MANUAL_FACTOR_KEYS:
        if key not in suggestions_raw:
            continue
        suggested, rationale = suggestions_raw[key]
        meta = _MANUAL_FACTOR_META.get(key, {})
        out.append({
            "key": key,
            "label": meta.get("label", key),
            "current_value": current.get(key),
            "suggested_value": suggested,
            "rationale": rationale,
        })
    return out


@router.post("/entity/{entity_id}/ai-assess")
def ai_assess_entity_factors(
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    entity = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id.in_(user_tenants),
    ).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")

    auto_values = {}
    try:
        auto_values = compute_factor_values(db, entity) or {}
    except Exception as e:
        logger.warning(f"compute_factor_values failed for entity {entity_id}: {e}")

    heuristic = _heuristic_factor_suggestions(entity, auto_values)

    client = _get_ai_client()
    if client is not None:
        try:
            current = entity.risk_factors or {}
            factor_catalog = "\n".join(
                f"- {key}: {_MANUAL_FACTOR_META[key]['label']} — {_MANUAL_FACTOR_META[key]['description']} "
                f"(current: {current.get(key, 'unset')})"
                for key in MANUAL_FACTOR_KEYS if key in _MANUAL_FACTOR_META
            )
            signal_lines = "\n".join(f"- {k}: {round(v, 1)}/100" for k, v in auto_values.items())
            prompt = (
                f"You are assisting an internal auditor in scoring the auditable entity "
                f"'{entity.name}' (type: {entity.entity_type or 'n/a'}, industry: "
                f"{getattr(entity, 'industry', None) or 'n/a'}).\n"
                f"System-computed signals (0-100):\n{signal_lines or '- none'}\n\n"
                f"Suggest values (0-100) for these MANUAL risk factors, each with a one-sentence rationale:\n"
                f"{factor_catalog}\n\n"
                f"Return ONLY a JSON object mapping factor key -> {{\"value\": number, \"rationale\": string}}. "
                f"These are suggestions a human will confirm; do not invent precise financial figures."
            )
            resp = client.chat.completions.create(
                model="gpt-4o-mini",
                messages=[
                    {"role": "system", "content": "You return only valid JSON. No prose outside the JSON object."},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=600,
                temperature=0.3,
                response_format={"type": "json_object"},
            )
            raw = (resp.choices[0].message.content or "").strip()
            parsed = json.loads(raw) if raw else {}
            suggestions = []
            current = entity.risk_factors or {}
            for key in MANUAL_FACTOR_KEYS:
                if key not in parsed or key not in _MANUAL_FACTOR_META:
                    continue
                item = parsed[key]
                if isinstance(item, dict):
                    val = item.get("value")
                    rationale = item.get("rationale", "")
                else:
                    val, rationale = item, ""
                try:
                    val = max(0.0, min(100.0, round(float(val), 1)))
                except (TypeError, ValueError):
                    continue
                suggestions.append({
                    "key": key,
                    "label": _MANUAL_FACTOR_META[key]["label"],
                    "current_value": current.get(key),
                    "suggested_value": val,
                    "rationale": str(rationale).strip(),
                })
            if suggestions:
                return {"suggestions": suggestions, "source": "ai"}
        except Exception as e:
            logger.warning(f"AI assess failed for entity {entity_id}: {e}")

    return {"suggestions": heuristic, "source": "fallback"}


@router.get("/entity/{entity_id}/history")
def get_entity_score_history(
    entity_id: int,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    tenant_id = get_user_primary_tenant(current_user, db)
    if not tenant_id:
        raise HTTPException(status_code=403, detail="No tenant access")
    entity = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id == tenant_id,
    ).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    rows = (
        db.query(AuditEntityScoreHistory)
        .filter(
            AuditEntityScoreHistory.auditable_entity_id == entity_id,
            AuditEntityScoreHistory.tenant_id == tenant_id,
        )
        .order_by(AuditEntityScoreHistory.recorded_at.desc())
        .limit(max(1, min(limit, 200)))
        .all()
    )
    return {
        "entity_id": entity_id,
        "entity_name": entity.name,
        "history": [
            {
                "id": r.id,
                "risk_score": r.risk_score,
                "risk_rating": r.risk_rating,
                "auto_risk_score": r.auto_risk_score,
                "previous_score": r.previous_score,
                "previous_rating": r.previous_rating,
                "delta": r.delta,
                "top_factor_key": r.top_factor_key,
                "top_factor_label": r.top_factor_label,
                "top_factor_contribution": r.top_factor_contribution,
                "trigger_reason": r.trigger_reason,
                "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
            }
            for r in rows
        ],
    }


@router.post("/entity/{entity_id}/override")
def set_entity_override(
    entity_id: int,
    data: OverrideRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    if not (data.justification or "").strip():
        raise HTTPException(status_code=422, detail="Justification is required for a manual override")
    user_tenants = get_user_tenants(current_user, db)
    entity = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id.in_(user_tenants),
    ).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    score = max(0.0, min(100.0, float(data.override_score)))
    entity.score_override = True
    entity.override_score = score
    entity.override_rating = data.override_rating or score_to_rating(score)
    entity.override_justification = data.justification.strip()
    entity.override_by_id = current_user.id
    entity.override_at = datetime.utcnow()
    entity.risk_score = score
    entity.risk_rating = entity.override_rating
    entity.updated_at = datetime.utcnow()
    db.commit()
    return {"message": "Override applied", "risk_score": entity.risk_score, "risk_rating": entity.risk_rating}


@router.delete("/entity/{entity_id}/override")
def clear_entity_override(
    entity_id: int,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth),
):
    user_tenants = get_user_tenants(current_user, db)
    entity = db.query(AuditableEntity).filter(
        AuditableEntity.id == entity_id,
        AuditableEntity.tenant_id.in_(user_tenants),
    ).first()
    if not entity:
        raise HTTPException(status_code=404, detail="Entity not found")
    entity.score_override = False
    entity.override_score = None
    entity.override_rating = None
    entity.override_justification = None
    entity.override_by_id = None
    entity.override_at = None
    cfg = get_or_create_config(db, entity.tenant_id)
    rescore_entity(
        db, entity, normalize_weights(cfg.weights), reason="override_cleared",
        user_id=current_user.id,
        alert_delta=cfg.alert_delta if cfg.alert_delta is not None else 10.0,
        alert_on_rating_change=cfg.alert_on_rating_change if cfg.alert_on_rating_change is not None else True,
    )
    db.commit()
    return {"message": "Override cleared", "risk_score": entity.risk_score, "risk_rating": entity.risk_rating}
