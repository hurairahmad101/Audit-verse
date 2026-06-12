from typing import Optional, List
from datetime import datetime, timedelta
import os
import json
import math
import logging
from collections import Counter
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.orm import Session
from sqlalchemy import func
from pydantic import BaseModel
from openai import OpenAI

from ....models import (
    AuditFinding, AuditEngagement, AuditRecommendation, AuditActionPlan,
    GRCUser, get_db
)
from ....routers.auth_router import require_auth, get_user_tenants

router = APIRouter(prefix="/analytics", tags=["Audit - Analytics"])
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


def _benford_expected() -> dict:
    return {str(d): math.log10(1 + 1 / d) for d in range(1, 10)}


def _benford_test(values: List[float]) -> dict:
    positives = [abs(v) for v in values if v != 0]
    if not positives:
        return {"error": "No non-zero values"}
    first_digits = []
    for v in positives:
        s = str(v).lstrip("0").replace(".", "")
        if s:
            first_digits.append(s[0])
    counts = Counter(first_digits)
    total = len(first_digits)
    expected = _benford_expected()
    result = {}
    chi_sq = 0.0
    for d in range(1, 10):
        ds = str(d)
        observed_pct = counts.get(ds, 0) / total
        expected_pct = expected[ds]
        deviation = abs(observed_pct - expected_pct)
        obs_count = counts.get(ds, 0)
        exp_count = expected_pct * total
        chi_sq += ((obs_count - exp_count) ** 2) / exp_count if exp_count > 0 else 0
        result[ds] = {
            "observed": round(observed_pct * 100, 2),
            "expected": round(expected_pct * 100, 2),
            "deviation_pct": round(deviation * 100, 2),
            "count": obs_count,
        }
    conformity = "conforming" if chi_sq < 15.5 else "non_conforming"
    return {
        "digit_distribution": result,
        "chi_square": round(chi_sq, 4),
        "total_items": total,
        "conformity": conformity,
        "interpretation": "Data appears consistent with natural patterns." if conformity == "conforming" else "Data shows unusual distribution — further investigation recommended.",
    }


def _outlier_detection(values: List[float], labels: Optional[List[str]] = None) -> dict:
    if not values:
        return {"outliers": [], "stats": {}}
    n = len(values)
    mean = sum(values) / n
    variance = sum((v - mean) ** 2 for v in values) / n if n > 1 else 0
    std = math.sqrt(variance)
    q1 = sorted(values)[int(n * 0.25)]
    q3 = sorted(values)[int(n * 0.75)]
    iqr = q3 - q1
    lower_fence = q1 - 1.5 * iqr
    upper_fence = q3 + 1.5 * iqr
    outliers = []
    for i, v in enumerate(values):
        z_score = (v - mean) / std if std > 0 else 0
        is_outlier = abs(z_score) > 2.5 or v < lower_fence or v > upper_fence
        if is_outlier:
            outliers.append({
                "index": i,
                "label": labels[i] if labels and i < len(labels) else f"Item {i+1}",
                "value": v,
                "z_score": round(z_score, 3),
                "deviation_from_mean": round(v - mean, 2),
            })
    return {
        "outliers": outliers,
        "outlier_count": len(outliers),
        "stats": {
            "mean": round(mean, 2),
            "std_dev": round(std, 2),
            "min": round(min(values), 2),
            "max": round(max(values), 2),
            "q1": round(q1, 2),
            "q3": round(q3, 2),
            "iqr": round(iqr, 2),
        },
    }


@router.get("/findings-trend")
def findings_trend(
    months: Optional[int] = 12,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"trend": []}
    since = datetime.utcnow() - timedelta(days=months * 30)
    findings = db.query(AuditFinding).filter(
        AuditFinding.tenant_id.in_(user_tenants),
        AuditFinding.created_at >= since
    ).all()
    monthly: dict = {}
    for f in findings:
        key = f.created_at.strftime("%Y-%m")
        if key not in monthly:
            monthly[key] = {"month": key, "total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0, "open": 0, "closed": 0}
        monthly[key]["total"] += 1
        sev = (f.severity or "medium").lower()
        if sev in monthly[key]:
            monthly[key][sev] += 1
        st = (f.status or "open").lower()
        if st in ("closed", "remediated"):
            monthly[key]["closed"] += 1
        else:
            monthly[key]["open"] += 1
    trend = sorted(monthly.values(), key=lambda x: x["month"])
    return {"trend": trend, "total_findings": len(findings), "period_months": months}


@router.get("/severity-distribution")
def severity_distribution(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"distribution": []}
    findings = db.query(AuditFinding).filter(
        AuditFinding.tenant_id.in_(user_tenants)
    ).all()
    severity_counts: dict = {}
    for f in findings:
        sev = (f.severity or "medium").lower()
        severity_counts[sev] = severity_counts.get(sev, 0) + 1
    total = len(findings) or 1
    distribution = [
        {"severity": sev, "count": count, "percentage": round(count / total * 100, 1)}
        for sev, count in severity_counts.items()
    ]
    distribution.sort(key=lambda x: ["critical", "high", "medium", "low", "observation"].index(x["severity"]) if x["severity"] in ["critical", "high", "medium", "low", "observation"] else 9)
    return {"distribution": distribution, "total": len(findings)}


@router.get("/root-cause-analysis")
def root_cause_analysis(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"root_causes": []}
    findings = db.query(AuditFinding).filter(
        AuditFinding.tenant_id.in_(user_tenants)
    ).all()
    rca: dict = {}
    for f in findings:
        cat = f.root_cause_category or "uncategorized"
        if cat not in rca:
            rca[cat] = {"category": cat, "total": 0, "open": 0, "critical_high": 0}
        rca[cat]["total"] += 1
        if (f.status or "open") not in ("closed", "remediated"):
            rca[cat]["open"] += 1
        if (f.severity or "").lower() in ("critical", "high"):
            rca[cat]["critical_high"] += 1
    return {"root_causes": list(rca.values()), "total_findings": len(findings)}


@router.get("/remediation-aging")
def remediation_aging(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"aging_buckets": [], "overdue": []}
    findings = db.query(AuditFinding).filter(
        AuditFinding.tenant_id.in_(user_tenants),
        AuditFinding.status.notin_(["closed", "remediated"])
    ).all()
    now = datetime.utcnow()
    buckets = {"0-30_days": 0, "31-60_days": 0, "61-90_days": 0, "90+_days": 0}
    overdue = []
    for f in findings:
        age = (now - f.created_at).days if f.created_at else 0
        if age <= 30:
            buckets["0-30_days"] += 1
        elif age <= 60:
            buckets["31-60_days"] += 1
        elif age <= 90:
            buckets["61-90_days"] += 1
        else:
            buckets["90+_days"] += 1
        if f.due_date and f.due_date < now:
            overdue.append({
                "id": f.id,
                "finding_number": f.finding_number,
                "title": f.title,
                "severity": f.severity,
                "due_date": f.due_date.isoformat(),
                "days_overdue": (now - f.due_date).days,
                "owner_id": f.owner_id,
            })
    aging_buckets = [{"bucket": k.replace("_", " "), "count": v} for k, v in buckets.items()]
    overdue.sort(key=lambda x: x["days_overdue"], reverse=True)
    return {"aging_buckets": aging_buckets, "overdue": overdue, "overdue_count": len(overdue)}


@router.get("/repeat-findings")
def repeat_findings(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"recurring": []}
    findings = db.query(AuditFinding).filter(
        AuditFinding.tenant_id.in_(user_tenants)
    ).all()
    theme_map: dict = {}
    for f in findings:
        theme = (f.theme or "").strip().lower() or (f.title or "").strip().lower()[:40]
        if theme:
            if theme not in theme_map:
                theme_map[theme] = []
            theme_map[theme].append({
                "id": f.id,
                "title": f.title,
                "severity": f.severity,
                "status": f.status,
                "created_at": f.created_at.isoformat() if f.created_at else None,
            })
    recurring = [
        {"theme": theme, "count": len(items), "findings": items}
        for theme, items in theme_map.items()
        if len(items) >= 2
    ]
    recurring.sort(key=lambda x: x["count"], reverse=True)
    return {"recurring": recurring[:20], "total_recurring_themes": len(recurring)}


@router.get("/engagement-performance")
def engagement_performance(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {"engagements": []}
    engagements = db.query(AuditEngagement).filter(
        AuditEngagement.tenant_id.in_(user_tenants)
    ).all()
    result = []
    for e in engagements:
        budget = e.budget_hours or 0
        actual = e.actual_hours or 0
        variance = actual - budget
        variance_pct = round((variance / budget * 100), 1) if budget > 0 else 0
        on_time = True
        if e.planned_end and e.actual_end:
            on_time = e.actual_end <= e.planned_end
        elif e.planned_end and e.status not in ("closed",):
            on_time = datetime.utcnow() <= e.planned_end
        result.append({
            "id": e.id,
            "title": e.title,
            "status": e.status,
            "engagement_type": e.engagement_type,
            "budget_hours": budget,
            "actual_hours": actual,
            "variance_hours": variance,
            "variance_pct": variance_pct,
            "on_time": on_time,
            "finding_count": len(e.findings) if e.findings else 0,
            "planned_start": e.planned_start.isoformat() if e.planned_start else None,
            "planned_end": e.planned_end.isoformat() if e.planned_end else None,
        })
    return {"engagements": result, "total": len(result)}


class BenfordRequest(BaseModel):
    values: List[float]
    labels: Optional[List[str]] = None
    description: Optional[str] = None


class OutlierRequest(BaseModel):
    values: List[float]
    labels: Optional[List[str]] = None


@router.post("/benford-test")
def benford_analysis(
    data: BenfordRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    if not data.values:
        raise HTTPException(status_code=400, detail="No values provided")
    return _benford_test(data.values)


@router.post("/outlier-detection")
def outlier_detection(
    data: OutlierRequest,
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    if not data.values:
        raise HTTPException(status_code=400, detail="No values provided")
    return _outlier_detection(data.values, data.labels)


@router.get("/summary")
def analytics_summary(
    db: Session = Depends(get_db),
    current_user: GRCUser = Depends(require_auth)
):
    user_tenants = get_user_tenants(current_user, db)
    if not user_tenants:
        return {}
    now = datetime.utcnow()
    thirty_days = now - timedelta(days=30)
    findings = db.query(AuditFinding).filter(
        AuditFinding.tenant_id.in_(user_tenants)
    ).all()
    engagements = db.query(AuditEngagement).filter(
        AuditEngagement.tenant_id.in_(user_tenants)
    ).all()
    open_findings = [f for f in findings if (f.status or "open") not in ("closed", "remediated")]
    overdue_findings = [f for f in open_findings if f.due_date and f.due_date < now]
    new_findings_30d = [f for f in findings if f.created_at and f.created_at >= thirty_days]
    critical_high = [f for f in open_findings if (f.severity or "").lower() in ("critical", "high")]
    active_engagements = [e for e in engagements if e.status not in ("closed",)]
    return {
        "total_findings": len(findings),
        "open_findings": len(open_findings),
        "overdue_findings": len(overdue_findings),
        "critical_high_open": len(critical_high),
        "new_findings_30d": len(new_findings_30d),
        "total_engagements": len(engagements),
        "active_engagements": len(active_engagements),
        "closure_rate": round((len(findings) - len(open_findings)) / len(findings) * 100, 1) if findings else 0,
    }
