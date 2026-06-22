import logging
from datetime import datetime
from typing import Dict, List, Optional, Any

from sqlalchemy.orm import Session

from ...models import AuditableEntity

logger = logging.getLogger(__name__)

FACTOR_DEFINITIONS: List[dict] = [
    {"key": "inherent_risk",        "label": "Inherent Risk (Linked Risks)",            "description": "Highest residual/inherent score of risks linked from the Risk Register.",                        "source": "auto",   "default_weight": 0.18},
    {"key": "prior_findings",       "label": "Prior Findings & Open Issues",             "description": "Open findings on prior engagements, weighted by severity.",                                        "source": "auto",   "default_weight": 0.12},
    {"key": "control_maturity",     "label": "Control Maturity / Assurance Gap (3LoD)",  "description": "Severity of 1st/2nd/3rd line of defence coverage gaps (lower maturity = higher risk).",          "source": "auto",   "default_weight": 0.12},
    {"key": "time_since_last_audit","label": "Time Since Last Audit",                    "description": "Time elapsed against the entity's audit cycle (overdue = Highest).",                             "source": "auto",   "default_weight": 0.08},
    {"key": "materiality",          "label": "Financial Materiality",                    "description": "Financial / ERP materiality of the entity (analyst input).",                                      "source": "manual", "default_weight": 0.10},
    {"key": "regulatory",           "label": "Regulatory Exposure",                      "description": "Degree of regulatory / compliance exposure (analyst input).",                                     "source": "manual", "default_weight": 0.12},
    {"key": "strategic_importance", "label": "Strategic Importance",                     "description": "Strategic significance to the organization (analyst input).",                                     "source": "manual", "default_weight": 0.06},
    {"key": "fraud_risk",           "label": "Fraud Risk",                               "description": "Susceptibility to fraud / misappropriation (analyst input).",                                    "source": "manual", "default_weight": 0.09},
    {"key": "change_volatility",    "label": "Change & Volatility",                      "description": "Rate of organisational, process, or system change (analyst input).",                             "source": "manual", "default_weight": 0.07},
    {"key": "external_intelligence","label": "External Intelligence",                    "description": "External threat / market / regulatory intelligence signals (analyst input).",                    "source": "manual", "default_weight": 0.06},
]

MANUAL_FACTOR_KEYS: set = {f["key"] for f in FACTOR_DEFINITIONS if f["source"] == "manual"}

DEFAULT_WEIGHTS: Dict[str, float] = {f["key"]: f["default_weight"] for f in FACTOR_DEFINITIONS}


def normalize_weights(weights: Dict[str, float]) -> Dict[str, float]:
    if not weights:
        return dict(DEFAULT_WEIGHTS)
    total = sum(weights.values())
    if total <= 0:
        return dict(DEFAULT_WEIGHTS)
    return {k: v / total for k, v in weights.items()}


def compute_factor_values(db: Session, entity: AuditableEntity) -> Dict[str, float]:
    values: Dict[str, float] = {}

    # Inherent risk — highest residual/inherent score from linked risks
    risk_ids = entity.linked_risk_ids or []
    if risk_ids:
        from ....models import Risk
        risks = db.query(Risk).filter(Risk.id.in_(risk_ids)).all()
        if risks:
            max_score = max(r.residual_score or r.inherent_score or 0 for r in risks)
            values["inherent_risk"] = round(max_score, 1)
        else:
            values["inherent_risk"] = 0
    else:
        values["inherent_risk"] = 0

    # Prior findings — open/unresolved findings from past engagements
    try:
        from ....models import AuditFinding
        open_findings = db.query(AuditFinding).filter(
            AuditFinding.entity_id == entity.id,
            AuditFinding.status.in_(["open", "in_progress", "overdue"]),
        ).all()
        if open_findings:
            severity_map = {"critical": 100, "high": 75, "medium": 50, "low": 25}
            avg = sum(severity_map.get(f.severity, 0) for f in open_findings) / len(open_findings)
            values["prior_findings"] = round(avg, 1)
        else:
            values["prior_findings"] = 0
    except Exception:
        values["prior_findings"] = 0

    # Control maturity — approximated from 3LoD / assurance gap data (0 until linked)
    values["control_maturity"] = 0

    # Time since last audit — days since last audit scaled to 0-100
    try:
        from datetime import datetime, timezone
        last = getattr(entity, "last_audit_date", None)
        if last:
            if hasattr(last, "tzinfo") and last.tzinfo is None:
                last = last.replace(tzinfo=timezone.utc)
            days = (datetime.now(timezone.utc) - last).days
            values["time_since_last_audit"] = round(min(days / 365.0 * 100, 100), 1)
        else:
            values["time_since_last_audit"] = 0
    except Exception:
        values["time_since_last_audit"] = 0

    return values


def score_to_rating(score: float) -> str:
    if score >= 80:
        return "critical"
    elif score >= 70:
        return "high"
    elif score >= 50:
        return "medium"
    return "low"


def compute_entity_score(db: Session, entity: AuditableEntity, weights: Dict[str, float]) -> dict:
    auto_values = compute_factor_values(db, entity)
    manual_factors = entity.risk_factors or {}

    contributions = []
    total_score = 0.0
    used_weight = 0.0

    for f in FACTOR_DEFINITIONS:
        key = f["key"]
        weight = weights.get(key, f["default_weight"])
        if weight <= 0:
            continue
        if f["source"] == "auto":
            value = auto_values.get(key, 0)
        else:
            value = manual_factors.get(key, 0)
        contribution = value * weight
        total_score += contribution
        used_weight += weight
        contributions.append({
            "key": key,
            "label": f["label"],
            "source": f["source"],
            "value": value,
            "weight": weight,
            "contribution": round(contribution, 1),
        })

    if used_weight > 0:
        composite_score = round(total_score / used_weight, 1)
    else:
        composite_score = 0.0

    return {
        "composite_score": composite_score,
        "rating": score_to_rating(composite_score),
        "contributions": contributions,
    }


def apply_score_to_entity(db: Session, entity: AuditableEntity, weights: Dict[str, float]):
    result = compute_entity_score(db, entity, weights)
    entity.auto_risk_score = result["composite_score"]
    entity.factor_contributions = result["contributions"]
    entity.risk_factors = entity.risk_factors or {}
    if not entity.score_override:
        entity.risk_score = result["composite_score"]
        entity.risk_rating = result["rating"]
    entity.scored_at = datetime.utcnow()
