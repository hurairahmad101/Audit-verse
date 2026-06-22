import logging
from datetime import datetime
from typing import Dict, Optional, Any

from sqlalchemy.orm import Session

from ...models import AuditableEntity, AuditEntityScoreHistory
from .scoring import apply_score_to_entity, compute_entity_score, score_to_rating

logger = logging.getLogger(__name__)


def rescore_entity(
    db: Session,
    entity: AuditableEntity,
    weights: Dict[str, float],
    reason: str = "manual",
    user_id: Optional[int] = None,
    alert_delta: float = 10.0,
    alert_on_rating_change: bool = True,
) -> dict:
    previous_score = entity.risk_score
    previous_rating = entity.risk_rating

    apply_score_to_entity(db, entity, weights)

    score_result = compute_entity_score(db, entity, weights)

    alert_raised = False
    if previous_score is not None:
        score_delta = abs(entity.risk_score - previous_score)
        if alert_delta > 0 and score_delta >= alert_delta:
            alert_raised = True
        if alert_on_rating_change and previous_rating != entity.risk_rating:
            alert_raised = True

    history_entry = AuditEntityScoreHistory(
        tenant_id=entity.tenant_id,
        auditable_entity_id=entity.id,
        risk_score=entity.risk_score,
        risk_rating=entity.risk_rating,
        auto_risk_score=score_result["composite_score"],
        previous_score=previous_score,
        previous_rating=previous_rating,
        delta=round((entity.risk_score - (previous_score or 0)), 1) if previous_score is not None else 0,
        top_factor_key=score_result["contributions"][0]["key"] if score_result["contributions"] else None,
        top_factor_label=score_result["contributions"][0]["label"] if score_result["contributions"] else None,
        top_factor_contribution=score_result["contributions"][0]["contribution"] if score_result["contributions"] else None,
        trigger_reason=reason,
        recorded_by_id=user_id,
        recorded_at=datetime.utcnow(),
    )
    db.add(history_entry)

    contributions = sorted(
        score_result["contributions"], key=lambda c: c.get("contribution", 0), reverse=True
    )

    return {
        "composite_score": score_result["composite_score"],
        "rating": score_result["rating"],
        "contributions": contributions,
        "alert": alert_raised,
        "previous_score": previous_score,
        "previous_rating": previous_rating,
        "score_delta": round((entity.risk_score - (previous_score or 0)), 1) if previous_score is not None else 0,
    }
