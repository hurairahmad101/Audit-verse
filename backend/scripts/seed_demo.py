"""Idempotent full demo data seed for the AuditVerse.AI demo tenant.

Populates EVERY audit module with realistic data so each page renders
populated tables and analytics charts. Safe to re-run any number of times:
every insert is gated on a stable natural-key presence check, every date is
derived from a fixed BASE_DATE, and there are no NOW() values inside keys.

Run: python3 backend/scripts/seed_demo.py
"""
from __future__ import annotations

import os
import sys
import json
import secrets
from datetime import datetime, timedelta

import psycopg2

DSN = os.environ["DATABASE_URL"]
DEMO_ORG_NAME = os.environ.get("DEMO_ORG_NAME", "AuditVerse Demo")
DEMO_SUBDOMAIN = os.environ.get("DEMO_SUBDOMAIN", "auditversedemo")
DEMO_ADMIN_USERNAME = os.environ.get("DEMO_ADMIN_USERNAME", "admin")
DEMO_ADMIN_EMAIL = os.environ.get("DEMO_ADMIN_EMAIL", "admin@auditverse.ai")
DEMO_ADMIN_PASSWORD = os.environ.get("DEMO_ADMIN_PASSWORD", "DemoPass!2026")
DEMO_ADMIN_DISPLAY = os.environ.get("DEMO_ADMIN_DISPLAY", "Demo Admin")

# Resolved by ensure_demo_tenant() during main() — these are populated from the
# row in public.grc_tenants so seed inserts always target the correct schema
# and tenant_id, even on the very first run when the tenant did not yet exist.
TENANT_ID: int = 0
SCHEMA: str = ""

# BASE = Jan 1 of the current year by default (deterministic within a run /
# stable for a calendar year). Override with DEMO_BASE_YEAR to pin a year
# for screenshot reproducibility.
_BASE_YEAR = int(os.environ.get("DEMO_BASE_YEAR", str(datetime.utcnow().year)))

# Reference date — Jan 1 of the configured year. Deterministic per year so
# re-runs within the same calendar year produce identical output.
BASE = datetime(_BASE_YEAR, 1, 1)
NOW = BASE  # alias used in audit_dates; do NOT use real now() in keys


def d(days: int) -> datetime:
    return BASE + timedelta(days=days)
def ensure_demo_tenant() -> tuple[int, str]:
    """Idempotently provision the demo tenant + admin user.

    Returns (tenant_id, schema_name). On first run this calls into the
    backend's tenant_manager.full_tenant_provisioning to create the
    PostgreSQL schema, seed the permissions, create the admin user, and
    insert the public.grc_tenants row. On subsequent runs it short-circuits
    by detecting the existing row.
    """
    conn = psycopg2.connect(DSN)
    conn.autocommit = True
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, schema_name FROM grc_tenants WHERE subdomain=%s",
                (DEMO_SUBDOMAIN,),
            )
            row = cur.fetchone()
            if row:
                print(f"[provision] demo tenant exists: id={row[0]} schema={row[1]}")
                return int(row[0]), row[1]
    finally:
        conn.close()

    # Tenant does not exist — call into the backend's provisioning helpers.
    # This requires the backend package to be importable (it is, when this
    # script runs from the project root via `python3 backend/scripts/seed_demo.py`).
    sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..")))
    from backend.grc.tenant_manager import full_tenant_provisioning  # type: ignore
    from backend.grc.routers.auth_router import hash_password  # type: ignore
    from backend.grc.models import Tenant, SessionLocal  # type: ignore

    print(f"[provision] creating demo tenant subdomain={DEMO_SUBDOMAIN}")
    result = full_tenant_provisioning(
        subdomain=DEMO_SUBDOMAIN,
        org_name=DEMO_ORG_NAME,
        admin_username=DEMO_ADMIN_USERNAME,
        admin_email=DEMO_ADMIN_EMAIL,
        admin_password_hash=hash_password(DEMO_ADMIN_PASSWORD),
        admin_display_name=DEMO_ADMIN_DISPLAY,
        org_details={"industry": "Financial Services", "company_size": "1000-5000"},
    )
    schema_name = result["schema_name"]

    db = SessionLocal()
    try:
        slug = DEMO_SUBDOMAIN
        tenant = Tenant(
            name=DEMO_ORG_NAME, slug=slug, subdomain=DEMO_SUBDOMAIN,
            schema_name=schema_name,
            primary_contact_email=DEMO_ADMIN_EMAIL,
            primary_contact_name=DEMO_ADMIN_DISPLAY,
            settings={"email_domain": DEMO_ADMIN_EMAIL.split("@")[-1].lower()},
            is_active=True,
        )
        db.add(tenant); db.commit(); db.refresh(tenant)
        print(f"[provision] created tenant id={tenant.id} schema={schema_name}")
        return tenant.id, schema_name
    finally:
        db.close()


def t(table: str) -> str:
    return f'"{SCHEMA}"."{table}"' if "." not in table else table


# ---- helpers --------------------------------------------------------------

def has_pub_table(cur, table: str) -> bool:
    cur.execute(
        "SELECT 1 FROM information_schema.tables "
        "WHERE table_schema='public' AND table_name=%s",
        (table,),
    )
    return cur.fetchone() is not None


def col_names(cur, schema: str, table: str) -> set[str]:
    cur.execute(
        "SELECT column_name FROM information_schema.columns "
        "WHERE table_schema=%s AND table_name=%s",
        (schema, table),
    )
    return {r[0] for r in cur.fetchall()}


def upsert(cur, table: str, key_cols: dict, set_cols: dict,
           *, schema: str = "public", update: bool = False):
    """Idempotent insert.

    - If a row matching key_cols exists, return its id (and optionally UPDATE
      the set_cols fields when update=True).
    - Otherwise INSERT key_cols + set_cols, filtered to columns that actually
      exist in the table (so schema drift is tolerated).
    """
    where = " AND ".join(f'"{k}"=%s' for k in key_cols)
    cur.execute(
        f'SELECT id FROM "{schema}"."{table}" WHERE {where} LIMIT 1',
        list(key_cols.values()),
    )
    row = cur.fetchone()
    cols_present = col_names(cur, schema, table)
    if row:
        if update and set_cols:
            payload = {k: v for k, v in set_cols.items() if k in cols_present}
            if payload:
                set_sql = ",".join(f'"{k}"=%s' for k in payload)
                cur.execute(
                    f'UPDATE "{schema}"."{table}" SET {set_sql} WHERE id=%s',
                    list(payload.values()) + [row[0]],
                )
        return row[0]
    payload = {**key_cols, **set_cols}
    payload = {k: v for k, v in payload.items() if k in cols_present}
    cols = ",".join(f'"{k}"' for k in payload)
    placeholders = ",".join(["%s"] * len(payload))
    cur.execute(
        f'INSERT INTO "{schema}"."{table}" ({cols}) VALUES ({placeholders}) RETURNING id',
        list(payload.values()),
    )
    return cur.fetchone()[0]


def J(obj):  # JSON helper
    return json.dumps(obj)


# ---- 1. demo users (auditors) --------------------------------------------

AUDITORS = [
    ("ialvarez", "Isabel Alvarez",  "Manager",         "IT Audit"),
    ("mokafor",  "Marcus Okafor",   "Senior Auditor",  "Financial"),
    ("ynakamura","Yuki Nakamura",   "Senior Auditor",  "Operational"),
    ("phaque",   "Priya Haque",     "Auditor",         "Compliance"),
    ("dkovac",   "Dario Kovac",     "Auditor",         "IT Audit"),
    ("erivera",  "Elena Rivera",    "Manager",         "Internal Audit"),
    ("tnguyen",  "Tam Nguyen",      "Senior Auditor",  "Cyber"),
    ("hjohnson", "Hugh Johnson",    "Auditor",         "Operational"),
    ("slindgren","Sven Lindgren",   "Senior Auditor",  "Treasury"),
    ("amorales", "Ana Morales",     "Auditor",         "Compliance"),
    ("kchen",    "Kelvin Chen",     "Manager",         "Data Analytics"),
    ("rfernandez","Rosa Fernandez", "Auditor",         "Financial"),
]


def seed_users(cur) -> list[int]:
    """Create demo auditor users in public.grc_users + link them to the tenant.

    Returns list of user_ids (admin first, then 8 auditors).
    """
    if not has_pub_table(cur, "grc_users"):
        return [4]
    ids: list[int] = [4]  # admin already exists
    for username, display, dept, _ in AUDITORS:
        uid = upsert(
            cur, "grc_users",
            {"username": username},
            {"email": f"{username}@auditverse.ai",
             "display_name": display,
             "department": dept,
             "password_hash": "!demo-no-login",
             "is_active": True,
             "created_at": BASE},
        )
        ids.append(uid)
        if has_pub_table(cur, "grc_tenant_users"):
            upsert(
                cur, "grc_tenant_users",
                {"tenant_id": TENANT_ID, "user_id": uid},
                {"is_active": True},
            )
    return ids


# ---- 2. business units ----------------------------------------------------

BU_NAMES = ["Finance", "Technology", "People", "Operations", "Compliance"]


def seed_business_units(cur) -> dict[str, int]:
    if not has_pub_table(cur, "grc_business_units"):
        return {}
    out = {}
    for name in BU_NAMES:
        out[name] = upsert(
            cur, "grc_business_units",
            {"tenant_id": TENANT_ID, "name": name},
            {},
        )
    return out


# ---- 3. universe (20 entities) -------------------------------------------

UNIVERSE = [
    ("Treasury Operations",            "Process",   "Finance",     "high",     85.0, 12),
    ("Cybersecurity Program",          "Process",   "Technology",  "critical", 92.0,  6),
    ("Vendor Risk Management",         "Process",   "Operations",  "medium",   58.0, 18),
    ("Payroll & HR Data",              "Process",   "People",      "medium",   60.0, 18),
    ("Customer Onboarding (KYC)",      "Process",   "Operations",  "high",     78.0, 12),
    ("Cloud Infrastructure (AWS)",     "System",    "Technology",  "critical", 90.0,  6),
    ("Regulatory Reporting",           "Process",   "Compliance",  "high",     82.0, 12),
    ("Branch Operations - APAC",       "Location",  "Operations",  "medium",   55.0, 24),
    ("Procurement-to-Pay",             "Process",   "Finance",     "high",     76.0, 12),
    ("Identity & Access Management",   "System",    "Technology",  "high",     80.0, 12),
    ("SAP General Ledger",             "System",    "Finance",     "critical", 88.0,  6),
    ("Data Warehouse (Snowflake)",     "System",    "Technology",  "medium",   62.0, 18),
    ("Customer Support Operations",    "Process",   "Operations",  "low",      40.0, 24),
    ("Anti-Money Laundering Program",  "Process",   "Compliance",  "critical", 91.0,  6),
    ("Marketing Spend Controls",       "Process",   "Finance",     "low",      35.0, 24),
    ("Endpoint Security",              "System",    "Technology",  "high",     74.0, 12),
    ("Legal Contract Lifecycle",       "Process",   "Compliance",  "medium",   52.0, 18),
    ("Branch Operations - EMEA",       "Location",  "Operations",  "medium",   57.0, 24),
    ("Talent Acquisition",             "Process",   "People",      "low",      42.0, 24),
    ("Mobile Banking App",             "System",    "Technology",  "high",     79.0, 12),
]


def seed_universe(cur, bu_ids: dict[str, int]) -> list[int]:
    if not has_pub_table(cur, "grc_auditable_entities"):
        return []
    ids = []
    for i, (name, etype, bu, risk, score, cycle) in enumerate(UNIVERSE):
        ids.append(upsert(
            cur, "grc_auditable_entities",
            {"tenant_id": TENANT_ID, "name": name},
            {"entity_type": etype,
             "business_unit_id": bu_ids.get(bu),
             "risk_score": score,
             "risk_rating": risk,
             "audit_cycle_months": cycle,
             "last_audited_date": d(-180 + i * 7),
             "next_audit_due": d(30 + i * 14),
             "owner_id": 4,
             "industry": "Financial Services",
             "contact_name": f"Owner {name.split()[0]}",
             "contact_email": f"owner.{i+1}@auditverse.ai",
             "status": "active",
             "created_at": BASE,
             "updated_at": BASE},
            update=True,
        ))
    return ids


# ---- 4. plans + plan_items ------------------------------------------------

PLANS = [
    ("Annual Audit Plan FY24", "2024", "complete",  "approved",  240.0),
    ("Annual Audit Plan FY25", "2025", "complete",  "approved",  280.0),
    ("Annual Audit Plan FY26", "2026", "in_progress", "approved", 320.0),
    ("Strategic 3-Year Plan 2024-2026",   "2026", "active",    "approved", 720.0),
    ("Rolling 12-Month Plan Q2",          "2026", "in_review", "pending",  160.0),
    ("Rolling 12-Month Plan Q3",          "2026", "draft",     "pending",  180.0),
]


def seed_plans(cur) -> list[int]:
    if not has_pub_table(cur, "grc_audit_plans"):
        return []
    ids = []
    for name, fy, status, approval, days in PLANS:
        ids.append(upsert(
            cur, "grc_audit_plans",
            {"tenant_id": TENANT_ID, "name": name},
            {"fiscal_year": fy, "status": status,
             "approval_status": approval,
             "total_budget_days": days,
             "description": f"{name} — risk-aligned engagements covering critical processes and systems.",
             "approved_by_id": 4,
             "approved_at": d(-30),
             "risk_alignment_score": 0.86,
             "created_by_id": 4,
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


def seed_plan_items(cur, plan_ids: list[int], entity_ids: list[int]):
    if not has_pub_table(cur, "grc_audit_plan_items") or not plan_ids or not entity_ids:
        return
    quarters = ["Q1", "Q2", "Q3", "Q4"]
    priorities = ["high", "high", "medium", "medium", "low"]
    n = 0
    for pi, plan_id in enumerate(plan_ids):
        for j, eid in enumerate(entity_ids[:5 + (pi % 3)]):
            n += 1
            upsert(
                cur, "grc_audit_plan_items",
                {"plan_id": plan_id, "auditable_entity_id": eid,
                 "name": f"{UNIVERSE[j][0]} — {plan_id}"},
                {"risk_score": UNIVERSE[j][4],
                 "quarter": quarters[(j + pi) % 4],
                 "scheduled_start": d(30 + n * 5),
                 "scheduled_end":   d(60 + n * 5),
                 "budget_days": 15.0 + (j % 4) * 5,
                 "priority": priorities[j % len(priorities)],
                 "status": "scheduled",
                 "created_at": BASE},
            )


# ---- 5. engagements + team + time -----------------------------------------

ENGAGEMENTS = [
    # (title, type, status, opinion, risk, days_offset)
    ("Treasury Operations Audit FY26",         "operational", "in_progress", None,                     "high",     0),
    ("Cybersecurity Program Review",           "it",          "fieldwork",   None,                     "critical", 14),
    ("Vendor Risk Management Audit",           "compliance",  "planning",    None,                     "medium",   21),
    ("Cloud Infrastructure Security",          "it",          "in_progress", None,                     "high",     7),
    ("Regulatory Reporting Walkthrough",       "compliance",  "reporting",   "satisfactory",           "high",    -7),
    ("Procurement-to-Pay Controls Review",     "operational", "fieldwork",   None,                     "high",    28),
    ("AML Program Effectiveness",              "compliance",  "in_progress", None,                     "critical", 14),
    ("Identity & Access Management Audit",     "it",          "planning",    None,                     "high",    35),
    ("Payroll Process Audit",                  "operational", "closed",      "satisfactory",           "medium", -90),
    ("KYC Onboarding Quality",                 "operational", "closed",      "needs_improvement",      "high",   -120),
    ("SAP GL Configuration Review",            "it",          "fieldwork",   None,                     "critical", 21),
    ("Mobile Banking App Security",            "it",          "reporting",   "satisfactory",           "high",   -14),
    ("Endpoint Security Posture",              "it",          "in_progress", None,                     "high",    14),
    ("Branch Operations Walkthrough - APAC",   "operational", "closed",      "satisfactory",           "medium", -150),
    ("Branch Operations Walkthrough - EMEA",   "operational", "planning",    None,                     "medium",  42),
    ("Marketing Spend Controls",               "operational", "closed",      "satisfactory",           "low",   -180),
    ("Legal Contract Lifecycle Review",        "compliance",  "fieldwork",   None,                     "medium",  28),
    ("Customer Support Quality Audit",         "operational", "closed",      "satisfactory",           "low",   -210),
    ("Talent Acquisition Process Audit",       "operational", "planning",    None,                     "low",     49),
    ("Data Warehouse Access Review",           "it",          "in_progress", None,                     "medium",  14),
]


def seed_engagements(cur, entity_ids, plan_ids, user_ids) -> list[int]:
    if not has_pub_table(cur, "grc_audit_engagements"):
        return []
    ids = []
    for i, (title, atype, status, opinion, risk, off) in enumerate(ENGAGEMENTS):
        ids.append(upsert(
            cur, "grc_audit_engagements",
            {"tenant_id": TENANT_ID, "title": title},
            {"engagement_number": f"ENG-2026-{i+1:03d}",
             "engagement_type": atype, "status": status,
             "auditable_entity_id": entity_ids[i % len(entity_ids)] if entity_ids else None,
             "planned_start": d(off), "planned_end": d(off + 45),
             "actual_start": d(off) if status not in ("planning",) else None,
             "actual_end":   d(off + 45) if status == "closed" else None,
             "budget_hours": 200.0 + (i % 6) * 40,
             "actual_hours": 120.0 + (i % 6) * 30,
             "lead_auditor_id": user_ids[(i % (len(user_ids) - 1)) + 1] if len(user_ids) > 1 else 4,
             "opinion": opinion,
             "opinion_narrative": "Controls operated effectively in all material respects." if opinion == "satisfactory" else None,
             "risk_rating": risk,
             "objectives": "Evaluate the design and operating effectiveness of key controls; assess compliance with policy and regulation.",
             "scope": "End-to-end process review including walkthroughs, sample testing, and corroborating evidence.",
             "methodology": "IIA Standards-aligned: planning memo, risk assessment, control testing, reporting, follow-up.",
             "created_by_id": 4,
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


def seed_team_members(cur, eng_ids, user_ids):
    if not has_pub_table(cur, "grc_audit_team_members") or not eng_ids:
        return
    roles = ["Lead Auditor", "Senior Auditor", "Auditor", "Reviewer"]
    for ei, eid in enumerate(eng_ids):
        for ri in range(3 + (ei % 3)):  # 3-5 members
            uid = user_ids[(ei + ri) % len(user_ids)]
            upsert(
                cur, "grc_audit_team_members",
                {"engagement_id": eid, "user_id": uid},
                {"role": roles[ri % len(roles)],
                 "skills": J(["IT Audit", "SOX", "Interviewing"]),
                 "availability_percent": 50.0 + (ri * 10),
                 "conflict_of_interest": False,
                 "assigned_at": d(-7)},
            )


def seed_time_entries(cur, eng_ids, user_ids):
    if not has_pub_table(cur, "grc_audit_time_entries") or not eng_ids:
        return
    activities = ["planning", "walkthrough", "test_of_design", "test_of_effectiveness",
                  "interview", "reporting", "review", "follow_up"]
    for ei, eid in enumerate(eng_ids):
        for j in range(10):  # 10 entries per engagement
            uid = user_ids[(ei + j) % len(user_ids)]
            day = d(-30 + j * 2)
            upsert(
                cur, "grc_audit_time_entries",
                {"engagement_id": eid, "user_id": uid, "date": day,
                 "description": f"{activities[j % len(activities)]} - block {j+1}"},
                {"hours": 1.5 + (j % 5) * 0.5,
                 "activity_type": activities[j % len(activities)],
                 "created_at": BASE},
            )


# ---- 6. workpapers + procedures + sampling -------------------------------

WP_TYPES = ["walkthrough", "test_of_design", "test_of_effectiveness",
            "substantive", "interview_notes", "data_analysis"]


def seed_workpapers(cur, eng_ids, user_ids) -> list[int]:
    if not has_pub_table(cur, "grc_audit_workpapers") or not eng_ids:
        return []
    ids = []
    for ei, eid in enumerate(eng_ids):
        for k in range(2):  # 2 workpapers per engagement → 40 total
            ref = f"WP-{ei+1:02d}-{k+1}"
            wp_id = upsert(
                cur, "grc_audit_workpapers",
                {"engagement_id": eid, "reference_number": ref},
                {"title": f"{WP_TYPES[(ei + k) % len(WP_TYPES)].replace('_',' ').title()} - {ENGAGEMENTS[ei][0][:40]}",
                 "description": "Documented procedures, evidence references, and conclusions.",
                 "workpaper_type": WP_TYPES[(ei + k) % len(WP_TYPES)],
                 "status": "reviewed" if k == 0 else "in_progress",
                 "preparer_id": user_ids[(ei + k) % len(user_ids)],
                 "reviewer_id": user_ids[((ei + k + 1) % len(user_ids))],
                 "lead_signoff_id": user_ids[1],
                 "prepared_at": d(-14 + k),
                 "reviewed_at": d(-7 + k) if k == 0 else None,
                 "lead_signoff_at": d(-3) if k == 0 else None,
                 "review_notes": "Procedures complete; conclusions supported by evidence." if k == 0 else None,
                 "conclusion": "Controls operated as designed during the period under review." if k == 0 else None,
                 "created_at": BASE, "updated_at": BASE},
            )
            ids.append(wp_id)
    return ids


def seed_procedures(cur, wp_ids, user_ids):
    if not has_pub_table(cur, "grc_audit_procedures") or not wp_ids:
        return
    titles = [
        ("Obtain population listing",   "test_of_design",        "haphazard"),
        ("Select representative sample", "test_of_effectiveness", "random"),
        ("Re-perform key control",       "test_of_effectiveness", "judgemental"),
    ]
    for wi, wp_id in enumerate(wp_ids):
        for pi, (t, tt, sm) in enumerate(titles):
            upsert(
                cur, "grc_audit_procedures",
                {"workpaper_id": wp_id, "procedure_number": f"P{pi+1}"},
                {"title": t,
                 "description": f"{t} for the period under review.",
                 "test_type": tt,
                 "sampling_methodology": sm,
                 "sample_size": 25 + (pi * 5),
                 "population_size": 1200 + (wi * 50),
                 "result": "pass" if (wi + pi) % 4 != 0 else "exception",
                 "result_details": "All samples agreed to evidence." if (wi + pi) % 4 != 0 else "1 exception noted; documented in finding.",
                 "exceptions_noted": 0 if (wi + pi) % 4 != 0 else 1,
                 "performed_by_id": user_ids[(wi + pi) % len(user_ids)],
                 "performed_at": d(-10 + pi),
                 "created_at": BASE},
            )


def seed_sampling(cur, eng_ids, wp_ids):
    if not has_pub_table(cur, "grc_audit_sampling_records") or not eng_ids:
        return
    methods = ["random", "systematic", "haphazard", "judgemental"]
    for i, eid in enumerate(eng_ids):
        upsert(
            cur, "grc_audit_sampling_records",
            {"tenant_id": TENANT_ID, "engagement_id": eid,
             "sampling_type": "attribute"},
            {"workpaper_id": wp_ids[i * 2] if len(wp_ids) > i * 2 else None,
             "population_size": 1200 + i * 100,
             "sample_size": 25 + (i % 5) * 5,
             "confidence_level": 95.0,
             "expected_error_rate": 5.0,
             "tolerable_error_rate": 10.0,
             "methodology": methods[i % len(methods)],
             "interpretation": "Sample size supports a 95% confidence interval at 10% tolerable error rate.",
             "sampling_interval": 48.0,
             "created_by_id": 4,
             "created_at": BASE},
        )


# ---- 7. findings + recommendations + responses ---------------------------

FINDINGS = [
    # (title, severity, status, theme, cause_cat, days_due_from_base)
    ("Privileged access reviews not performed quarterly",            "high",     "open",            "Access Mgmt",    "process",     45),
    ("Vendor due diligence missing for 3 critical suppliers",        "medium",   "in_remediation",  "Third Party",    "process",     30),
    ("MFA not enforced on legacy admin console",                     "high",     "open",            "Authentication", "technology",  30),
    ("Segregation of duties gap in payment release",                 "critical", "open",            "SoD",            "process",     20),
    ("Backup restoration not tested in 12 months",                   "medium",   "closed",          "Resilience",     "process",    -30),
    ("Stale local admin accounts on EMEA workstations",              "medium",   "in_remediation",  "Access Mgmt",    "people",      45),
    ("Quarterly access recertification incomplete - SAP GL",         "high",     "open",            "Access Mgmt",    "process",     20),
    ("Vendor master data lacks owner field",                         "low",      "in_remediation",  "Data Quality",   "process",     60),
    ("SOX key control evidence not retained for 7 years",            "medium",   "open",            "Records",        "process",     90),
    ("AML transaction monitoring rules not tuned in 18 months",      "high",     "in_remediation",  "AML",            "process",     30),
    ("Incident response runbook outdated",                           "medium",   "open",            "IR",             "process",     45),
    ("Cloud admin keys long-lived (no rotation)",                    "critical", "open",            "Cloud Sec",      "technology",  15),
    ("Customer PII logged in plaintext to debug logs",               "high",     "open",            "Data Privacy",   "technology",  20),
    ("Procurement card limits exceeded without approval",            "medium",   "in_remediation",  "Spend",          "process",     30),
    ("Quarterly user access review not evidenced",                   "medium",   "open",            "Access Mgmt",    "process",     45),
    ("Change advisory board not approving emergency changes",        "medium",   "in_remediation",  "Change Mgmt",    "process",     30),
    ("DR exercise not run in calendar year",                         "high",     "open",            "Resilience",     "process",     90),
    ("Open ports on internal-only API exposed to internet",          "critical", "in_remediation",  "Network Sec",    "technology",  10),
    ("Privileged session recording disabled",                        "high",     "open",            "Access Mgmt",    "technology",  30),
    ("Marketing spend reconciliation 60+ days late",                 "low",      "closed",          "Spend",          "process",    -45),
    ("Customer onboarding KYC sample missing PEP screen",            "high",     "in_remediation",  "AML",            "process",     30),
    ("Mobile app session timeout exceeds policy",                    "medium",   "open",            "Application",    "technology",  45),
    ("Talent acquisition reference checks inconsistent",             "low",      "open",            "HR",             "people",      60),
    ("Snowflake share policies not reviewed quarterly",              "medium",   "in_remediation",  "Data Sharing",   "process",     30),
    ("Endpoint EDR coverage gaps on developer Macs",                 "medium",   "open",            "Endpoint Sec",   "technology",  30),
    ("Legal contract auto-renewal alerts not configured",            "low",      "in_remediation",  "Contracts",      "process",     60),
    ("Treasury wire approval thresholds outdated",                   "medium",   "open",            "Treasury",       "process",     45),
    ("Regulatory report sign-off lacks dual control",                "medium",   "open",            "Regulatory",     "process",     30),
    ("Customer support QA sampling below target",                    "low",      "closed",          "Quality",       "process",    -15),
    ("Branch cash reconciliation variances above tolerance",         "high",     "open",            "Cash Mgmt",      "process",     20),
]


def seed_findings(cur, eng_ids, user_ids) -> list[int]:
    if not has_pub_table(cur, "grc_audit_findings") or not eng_ids:
        return []
    ids = []
    for i, (title, sev, status, theme, cause_cat, due_off) in enumerate(FINDINGS):
        ids.append(upsert(
            cur, "grc_audit_findings",
            {"tenant_id": TENANT_ID, "title": title},
            {"engagement_id": eng_ids[i % len(eng_ids)],
             "finding_number": f"F-2026-{i+1:03d}",
             "severity": sev, "status": status,
             "theme": theme,
             "root_cause_category": cause_cat,
             "owner_id": user_ids[(i % (len(user_ids) - 1)) + 1] if len(user_ids) > 1 else 4,
             "due_date": d(due_off),
             "condition": "Control was not consistently performed during the period under review.",
             "criteria": "Per company policy, this control must be performed on a defined cadence with evidence retained.",
             "cause": "Ownership ambiguity following recent reorganisation; competing priorities.",
             "effect": "Increased risk of unauthorised activity going undetected and audit trail gaps.",
             "ai_generated": False,
             "framework_mappings": J(["SOX", "ISO 27001 A.9", "COBIT 2019 DSS05"]),
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


def seed_recommendations(cur, finding_ids, user_ids) -> list[int]:
    if not has_pub_table(cur, "grc_audit_recommendations") or not finding_ids:
        return []
    ids = []
    for i, fid in enumerate(finding_ids):
        ids.append(upsert(
            cur, "grc_audit_recommendations",
            {"finding_id": fid, "title": f"Remediate finding F-2026-{i+1:03d}"},
            {"description": "Reassign control ownership, document cadence in policy, "
                            "and add to monthly compliance dashboard for monitoring.",
             "priority": "high" if (i % 3 == 0) else "medium",
             "status": "open" if i % 4 != 3 else "implemented",
             "owner_id": user_ids[(i % (len(user_ids) - 1)) + 1] if len(user_ids) > 1 else 4,
             "due_date": d(30 + (i % 6) * 15),
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


def seed_management_responses(cur, finding_ids):
    if not has_pub_table(cur, "grc_audit_management_responses") or not finding_ids:
        return
    types = ["accept", "accept", "accept", "partially_accept", "accept", "reject"]
    for i, fid in enumerate(finding_ids):
        rt = types[i % len(types)]
        upsert(
            cur, "grc_audit_management_responses",
            {"finding_id": fid, "response_type": rt},
            {"response_text": ("Management agrees with the finding and will remediate within the agreed window."
                               if rt != "reject" else
                               "Management disagrees; existing compensating controls are considered sufficient."),
             "action_plan": "1) Confirm owner. 2) Update procedure. 3) Add monitoring. 4) Close with evidence.",
             "target_date": d(60 + (i % 6) * 15),
             "respondent_id": 4,
             "responded_at": d(-7)},
        )


# ---- 8. issues + action plans + follow-ups + escalations -----------------

ISSUES = [
    # (title, severity, status, age_days_from_base)
    ("Implement quarterly privileged access review",          "high",     "open",         5),
    ("Complete vendor due diligence for top-3 critical suppliers", "medium", "in_progress", -32),
    ("Enable MFA on legacy admin console",                    "high",     "open",         -65),
    ("Document SoD matrix for payments team",                 "critical", "in_progress", -92),
    ("Stand up annual DR exercise programme",                 "high",     "open",         -10),
    ("Tune AML transaction monitoring rules",                 "high",     "in_progress", -40),
    ("Rotate cloud admin keys quarterly",                     "critical", "in_progress", -55),
    ("Mask PII in application debug logs",                    "high",     "open",         -8),
    ("Restrict procurement-card limit overrides",             "medium",   "in_progress", -25),
    ("Stand up CAB approval for emergency changes",           "medium",   "in_progress", -60),
    ("Enable privileged session recording",                   "high",     "open",         -15),
    ("Close internet exposure on internal API",               "critical", "in_progress", -70),
    ("Document quarterly access recert evidence — SAP GL",    "high",     "open",         -22),
    ("Update incident response runbook",                      "medium",   "open",         -5),
    ("Remove stale local admin accounts — EMEA",              "medium",   "in_progress", -45),
    ("Configure contract auto-renewal alerts",                "low",      "in_progress", -50),
    ("Update treasury wire approval thresholds",              "medium",   "open",         -3),
    ("Add dual sign-off for regulatory reports",              "medium",   "open",         -12),
    ("Tighten Snowflake share policy review",                 "medium",   "in_progress", -38),
    ("Bring branch cash variances within tolerance",          "high",     "open",         -18),
    ("Roll out EDR to developer Macs",                        "medium",   "open",         -7),
    ("Backfill PEP screen on missed KYC samples",             "high",     "in_progress", -30),
    ("Enforce mobile app session timeout",                    "medium",   "open",         -6),
    ("Reference-check process refresh for TA",                "low",      "open",         -2),
    ("Complete reconciliation backlog — marketing spend",     "low",      "closed",       -90),
]


def seed_issues(cur, finding_ids):
    if not has_pub_table(cur, "grc_issues"):
        return []
    ids = []
    for i, (title, sev, status, age) in enumerate(ISSUES):
        ids.append(upsert(
            cur, "grc_issues",
            {"tenant_id": TENANT_ID, "title": title},
            {"severity": sev, "status": status,
             "description": "Tracked remediation derived from audit finding; owner and due date assigned.",
             "owner_id": 4,
             "due_date": d(age + 60),
             "closed_at": d(age + 30) if status == "closed" else None,
             "created_at": d(age)},
        ))
    return ids


def seed_action_plans(cur, recommendation_ids, user_ids):
    if not has_pub_table(cur, "grc_audit_action_plans") or not recommendation_ids:
        return
    for i, rid in enumerate(recommendation_ids):
        for m, ms in enumerate(["Plan", "Build", "Validate"]):
            upsert(
                cur, "grc_audit_action_plans",
                {"recommendation_id": rid, "milestone": ms},
                {"description": f"{ms} milestone for recommendation #{i+1}.",
                 "owner_id": user_ids[(i + m) % len(user_ids)],
                 "due_date": d(30 + i * 5 + m * 10),
                 "completed_date": d(20 + i * 5) if (m == 0 and i % 4 != 3) else None,
                 "status": "complete" if (m == 0 and i % 4 != 3) else "in_progress" if m == 1 else "not_started",
                 "evidence_of_completion": "Evidence captured in workpaper repository." if m == 0 else None,
                 "created_at": BASE},
            )


def seed_follow_ups(cur, finding_ids, user_ids):
    if not has_pub_table(cur, "grc_audit_follow_ups") or not finding_ids:
        return
    # Re-test results for closed/in-remediation findings
    for i, fid in enumerate(finding_ids[:15]):
        ftype = "retest" if i % 2 == 0 else "review"
        result = "pass" if i % 3 != 0 else "fail"
        upsert(
            cur, "grc_audit_follow_ups",
            {"finding_id": fid, "follow_up_type": ftype,
             "performed_at": d(-14 + i)},
            {"retest_result": result,
             "retest_details": "Re-performed control; evidence agreed to source." if result == "pass"
                                else "Control still not consistently performed; remediation extended.",
             "performed_by_id": user_ids[(i + 2) % len(user_ids)],
             "closure_approved": (result == "pass"),
             "closure_approved_by_id": user_ids[1] if result == "pass" else None,
             "closure_approved_at": d(-7 + i) if result == "pass" else None,
             "notes": "Follow-up logged in audit management system."},
        )


def seed_escalations(cur, finding_ids, user_ids):
    if not has_pub_table(cur, "grc_audit_issue_escalations") or not finding_ids:
        return
    for i, fid in enumerate(finding_ids[:6]):
        upsert(
            cur, "grc_audit_issue_escalations",
            {"tenant_id": TENANT_ID, "finding_id": fid,
             "escalation_level": 1 + (i % 3)},
            {"issue_title": FINDINGS[i][0],
             "escalated_to_id": user_ids[1 if i % 2 == 0 else 5],
             "escalation_reason": "Issue past due date by more than 30 days; escalating per policy.",
             "original_due_date": d(-45 + i * 5),
             "extended_due_date": d(15 + i * 5),
             "days_overdue": 30 + i * 5,
             "resolved": (i == 0),
             "resolved_at": d(-3) if i == 0 else None,
             "notes": "Tracked in monthly audit committee dashboard.",
             "created_at": BASE},
        )


# ---- 9. surveys + responses ----------------------------------------------

SURVEYS = [
    ("Pre-Audit Questionnaire — Treasury",        "pre_audit",  "active"),
    ("Post-Audit Feedback — Cyber Review",        "post_audit", "closed"),
    ("Control Self-Assessment Q2",                "csa",        "active"),
    ("Pre-Audit Questionnaire — AML Programme",   "pre_audit",  "active"),
    ("Post-Audit Feedback — Mobile Banking",      "post_audit", "closed"),
    ("Control Self-Assessment Q3",                "csa",        "draft"),
    ("Pre-Audit Questionnaire — IAM",             "pre_audit",  "draft"),
    ("Annual Stakeholder Survey",                 "stakeholder","active"),
]


def seed_surveys(cur, eng_ids) -> list[int]:
    if not has_pub_table(cur, "grc_audit_surveys"):
        return []
    questions = [
        {"id": "q1", "type": "likert", "text": "Were the audit objectives clearly communicated?"},
        {"id": "q2", "type": "likert", "text": "Was the audit team responsive and professional?"},
        {"id": "q3", "type": "text",   "text": "Comments or suggestions for improvement?"},
    ]
    ids = []
    for i, (title, stype, status) in enumerate(SURVEYS):
        ids.append(upsert(
            cur, "grc_audit_surveys",
            {"tenant_id": TENANT_ID, "title": title},
            {"survey_type": stype, "status": status,
             "engagement_id": eng_ids[i % len(eng_ids)] if eng_ids else None,
             "description": f"{stype.replace('_',' ').title()} survey for stakeholder feedback.",
             "questions": J(questions),
             "recipient_emails": J([f"stakeholder{i+1}@example.com",
                                    f"stakeholder{i+2}@example.com"]),
             "due_date": d(30 + i * 7),
             "sent_at": d(-7) if status != "draft" else None,
             "closed_at": d(-1) if status == "closed" else None,
             "created_by_id": 4,
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


def seed_survey_responses(cur, survey_ids):
    if not has_pub_table(cur, "grc_audit_survey_responses") or not survey_ids:
        return
    for si, sid in enumerate(survey_ids):
        for ri in range(6):  # 6 responses per survey
            email = f"respondent{si+1}_{ri+1}@example.com"
            upsert(
                cur, "grc_audit_survey_responses",
                {"survey_id": sid, "respondent_email": email},
                {"respondent_name": f"Respondent {ri+1}",
                 "answers": J({"q1": (ri % 5) + 1,
                               "q2": ((ri + si) % 5) + 1,
                               "q3": "Communication was clear; turnaround was timely."}),
                 "status": "submitted",
                 "submitted_at": d(-5 + ri),
                 "created_at": BASE},
            )


# ---- 10. documents + versions ---------------------------------------------

DOC_TITLES = [
    ("Treasury Audit Report v1.0",                "report",     True),
    ("Charter 2026 Approved.pdf",                 "charter",    True),
    ("Cybersecurity Walkthrough Notes.docx",      "workpaper",  True),
    ("Vendor Risk Procedure.pdf",                 "procedure",  False),
    ("Engagement Plan — Cloud Security.xlsx",     "plan",       True),
    ("AML Programme Effectiveness Report.pdf",    "report",     True),
    ("Mobile Banking App Security Report.pdf",    "report",     True),
    ("KYC Onboarding Quality Report.pdf",         "report",     True),
    ("SOX Walkthrough — SAP GL.docx",             "workpaper",  True),
    ("DR Exercise Plan 2026.pdf",                 "plan",       False),
    ("IR Runbook v3.docx",                        "procedure",  True),
    ("Quarterly Access Review Template.xlsx",     "template",   False),
    ("Audit Committee Pre-Read Q1 2026.pdf",      "report",     True),
    ("Audit Committee Pre-Read Q2 2026.pdf",      "report",     True),
    ("Internal Audit Methodology v2.1.pdf",       "policy",     True),
    ("Risk Assessment Workpaper — IAM.xlsx",      "workpaper",  True),
    ("Risk Assessment Workpaper — Treasury.xlsx", "workpaper",  True),
    ("Endpoint Security Posture Report.pdf",      "report",     True),
    ("Branch Walkthrough — APAC Notes.docx",      "workpaper",  True),
    ("Branch Walkthrough — EMEA Notes.docx",      "workpaper",  True),
    ("Procurement Spend Analytics.xlsx",          "data",       False),
    ("Marketing Spend Reconciliation.xlsx",       "data",       False),
    ("Cloud Key Inventory.csv",                   "data",       True),
    ("Snowflake Share Policy Review.docx",        "workpaper",  True),
    ("Talent Acquisition Process Map.pdf",        "procedure",  False),
]


def seed_documents(cur, eng_ids) -> list[int]:
    if not has_pub_table(cur, "grc_audit_documents"):
        return []
    ids = []
    for i, (title, dtype, conf) in enumerate(DOC_TITLES):
        ids.append(upsert(
            cur, "grc_audit_documents",
            {"tenant_id": TENANT_ID, "title": title},
            {"document_type": dtype,
             "is_confidential": conf,
             "engagement_id": eng_ids[i % len(eng_ids)] if eng_ids else None,
             "file_name": title.split(".")[0].replace(" ", "_") + "." + (title.split(".")[-1] if "." in title else "pdf"),
             "file_path": f"/audit/docs/{i+1}",
             "file_size": 124000 + i * 5000,
             "file_content_type": "application/pdf",
             "tags": J([dtype, "demo"]),
             "retention_years": 7,
             "uploaded_by_id": 4,
             "description": f"Demo document for {title}.",
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


def seed_document_versions(cur, audit_doc_ids):
    """Seed grc_documents (governance/policy docs) + grc_document_versions.

    The audit-side `grc_audit_documents` table is independent from
    `grc_documents`; the FK on `grc_document_versions.document_id` targets
    `grc_documents`. We seed a parallel set of governance documents (one per
    audit document title) and three versions each, so the document-versions
    relationship is populated and the table renders content if surfaced.
    """
    if not has_pub_table(cur, "grc_documents") or not audit_doc_ids:
        return
    # Build a small parallel set of governance docs (title-stable upsert key).
    gov_ids: list[int] = []
    for i, title in enumerate([t[0] for t in DOC_TITLES]):
        gov_ids.append(upsert(
            cur, "grc_documents",
            {"tenant_id": TENANT_ID, "title": title},
            {"doc_type": DOC_TITLES[i][1],
             "version": "v2.0",
             "status": "approved",
             "owner_id": 4,
             "approved_by": 4,
             "approved_at": d(-30),
             "published_by": 4,
             "published_at": d(-25),
             "review_cycle_months": 12,
             "next_review_date": d(335),
             "content": f"Governance document body for {title}.",
             "created_at": BASE},
        ))
    if not has_pub_table(cur, "grc_document_versions"):
        return
    for di, did in enumerate(gov_ids):
        for v, ver in enumerate(["v1.0", "v1.1", "v2.0"]):
            upsert(
                cur, "grc_document_versions",
                {"document_id": did, "version_number": ver},
                {"content": f"Version {ver} content snapshot for document #{di+1}.",
                 "change_summary": ["Initial version", "Minor edits", "Major revision"][v],
                 "created_by": 4,
                 "created_at": d(-30 + v * 10)},
            )


# ---- 11. charter (3 versions + clauses) ----------------------------------

def seed_charter(cur):
    if not has_pub_table(cur, "grc_audit_charters"):
        return None
    versions = [
        ("v7.0", "superseded",  -730),
        ("v8.0", "superseded",  -365),
        ("v9.0", "approved",    -14),
    ]
    last_id = None
    for ver, status, days in versions:
        last_id = upsert(
            cur, "grc_audit_charters",
            {"tenant_id": TENANT_ID, "version": ver},
            {"status": status,
             "approved_at":   d(days),
             "effective_date": d(days),
             "review_date":   d(days + 365),
             "next_review_due": d(days + 365),
             "title": f"Internal Audit Charter {2024 + (['v7.0','v8.0','v9.0'].index(ver))}",
             "content": "The mission of Internal Audit is to provide independent, objective assurance and advisory services designed to add value and improve the organisation's operations.",
             "mission": "Provide independent, objective assurance and advisory services.",
             "authority": "Granted by the Board to access all records, personnel, and physical properties.",
             "independence_objectivity": "The Chief Audit Executive reports functionally to the Audit Committee.",
             "scope_of_work": "Risk-based assurance over governance, risk management, and internal control.",
             "accountability": "Quarterly reporting to the Audit Committee.",
             "standards": "International Standards for the Professional Practice of Internal Auditing (IIA).",
             "approved_by_id": 4,
             "created_by_id": 4,
             "created_at": BASE, "updated_at": BASE},
        )
    return last_id


CLAUSES = [
    ("1.1", "Mission",        "Mission Statement"),
    ("2.1", "Authority",      "Right of Access"),
    ("2.2", "Authority",      "Reporting Lines"),
    ("3.1", "Independence",   "Functional Reporting to Audit Committee"),
    ("3.2", "Independence",   "Conflict of Interest Disclosure"),
    ("4.1", "Scope",          "Risk-Based Assurance"),
    ("4.2", "Scope",          "Advisory Services"),
    ("5.1", "Accountability", "Quarterly Reporting"),
    ("5.2", "Accountability", "Annual Plan Approval"),
    ("6.1", "Standards",      "IIA Standards Conformance"),
    ("6.2", "Standards",      "QAIP Programme"),
    ("7.1", "Resources",      "Budget and Staffing"),
]


def seed_charter_clauses(cur, charter_id):
    if not has_pub_table(cur, "grc_charter_clauses") or not charter_id:
        return []
    ids = []
    for i, (code, section, title) in enumerate(CLAUSES):
        ids.append(upsert(
            cur, "grc_charter_clauses",
            {"tenant_id": TENANT_ID, "charter_id": charter_id,
             "clause_code": code},
            {"section": section, "title": title,
             "body": f"{title} — refer to enterprise audit policy section {code} for detail.",
             "order_index": i,
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


def seed_charter_clause_links(cur, clause_ids, eng_ids, plan_ids):
    """Link clauses → engagements and clauses → plans (deterministic mapping)."""
    if not clause_ids:
        return
    if has_pub_table(cur, "grc_charter_clause_engagement_links") and eng_ids:
        # Link each clause to 2 engagements (round-robin) → ~24 links.
        for ci, cid in enumerate(clause_ids):
            for k in range(2):
                eid = eng_ids[(ci * 2 + k) % len(eng_ids)]
                upsert(
                    cur, "grc_charter_clause_engagement_links",
                    {"tenant_id": TENANT_ID, "clause_id": cid, "engagement_id": eid},
                    {"created_at": BASE},
                )
    if has_pub_table(cur, "grc_charter_clause_plan_links") and plan_ids:
        # Link each clause to 1 plan (round-robin) → 12 links.
        for ci, cid in enumerate(clause_ids):
            pid = plan_ids[ci % len(plan_ids)]
            upsert(
                cur, "grc_charter_clause_plan_links",
                {"tenant_id": TENANT_ID, "clause_id": cid, "plan_id": pid},
                {"created_at": BASE},
            )


# ---- 12. CCM rules + anomalies + exceptions ------------------------------

CCM_RULES = [
    ("CCM-001", "Privileged access changes alert",            "Identity & Access", "high"),
    ("CCM-002", "After-hours payment file release",           "Treasury",          "high"),
    ("CCM-003", "MFA failures > 5/min on admin console",      "IT Security",       "high"),
    ("CCM-004", "Vendor master data — duplicate detection",   "Procurement",       "medium"),
    ("CCM-005", "Journal entries posted by preparer/approver","Finance",           "high"),
    ("CCM-006", "Cloud key age > 90 days",                    "Cloud Security",    "medium"),
    ("CCM-007", "Customer PII pattern in application logs",   "Data Privacy",      "high"),
    ("CCM-008", "Procurement-card limit override",            "Procurement",       "medium"),
    ("CCM-009", "Failed backup job 24h",                      "Resilience",        "high"),
    ("CCM-010", "AML alert SLA breach",                       "AML",               "critical"),
    ("CCM-011", "Snowflake share to external account",        "Data Sharing",      "high"),
    ("CCM-012", "Endpoint EDR uninstall",                     "Endpoint Security", "critical"),
]


def seed_ccm(cur) -> list[int]:
    if not has_pub_table(cur, "grc_ccm_rules"):
        return []
    ids = []
    for code, name, area, sev in CCM_RULES:
        ids.append(upsert(
            cur, "grc_ccm_rules",
            {"tenant_id": TENANT_ID, "rule_code": code},
            {"name": name, "control_area": area,
             "description": f"Continuous monitoring rule: {name}.",
             "rule_type": "threshold", "threshold_value": 5.0,
             "threshold_operator": ">", "severity": sev,
             "is_active": True,
             "parameters": J({"window_min": 5, "alert_channel": "email"}),
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


def seed_ccm_anomalies(cur, rule_ids) -> list[int]:
    if not has_pub_table(cur, "grc_ccm_anomalies") or not rule_ids:
        return []
    statuses = ["open", "investigating", "false_positive", "closed"]
    severities = ["low", "medium", "high", "critical"]
    ids = []
    for i in range(30):
        rid = rule_ids[i % len(rule_ids)]
        ref = f"TXN-{2026000 + i}"
        ids.append(upsert(
            cur, "grc_ccm_anomalies",
            {"tenant_id": TENANT_ID, "rule_id": rid,
             "transaction_ref": ref},
            {"title": f"Anomaly on {CCM_RULES[i % len(CCM_RULES)][1]}",
             "description": "Detected by continuous monitoring rule; flagged for triage.",
             "severity": severities[i % len(severities)],
             "detected_at": d(-30 + i),
             "transaction_amount": 1500.0 + i * 250,
             "control_area": CCM_RULES[i % len(CCM_RULES)][2],
             "is_false_positive": (statuses[i % 4] == "false_positive"),
             "false_positive_reason": "Verified legitimate maintenance window." if statuses[i % 4] == "false_positive" else None,
             "status": statuses[i % 4],
             "metadata_json": J({"source": "demo", "batch": i // 10})},
        ))
    return ids


def seed_ccm_exceptions(cur, anomaly_ids, finding_ids, user_ids):
    if not has_pub_table(cur, "grc_ccm_exceptions") or not anomaly_ids:
        return
    decisions = ["confirm_finding", "false_positive", "accept_risk"]
    for i, aid in enumerate(anomaly_ids[:8]):
        upsert(
            cur, "grc_ccm_exceptions",
            {"anomaly_id": aid},
            {"workflow_status": "review_complete" if i < 6 else "in_review",
             "assigned_to_id": user_ids[(i + 1) % len(user_ids)],
             "reviewed_by_id": user_ids[1] if i < 6 else None,
             "reviewed_at": d(-10 + i) if i < 6 else None,
             "decision": decisions[i % len(decisions)] if i < 6 else None,
             "decision_notes": "Reviewed evidence and corroborated with control owner.",
             "finding_id": finding_ids[i % len(finding_ids)] if (i < 6 and finding_ids) else None,
             "closed_at": d(-5 + i) if i < 6 else None,
             "created_at": BASE},
        )


# ---- 13. QAIP + assurance gaps -------------------------------------------

def seed_qaip(cur, eng_ids):
    if not has_pub_table(cur, "grc_qaip_reviews"):
        return
    rows = [
        ("internal", "satisfactory",   "complete",  4.2,
         "Conformance with IIA Standards confirmed across all sampled engagements.",
         "Refresh the QAIP charter and adopt continuous monitoring of KPIs."),
        ("internal", "satisfactory",   "complete",  4.4,
         "Engagement quality reviews show consistent application of methodology.",
         "Increase use of data analytics in scoping."),
        ("external", "generally_conforms", "complete", 4.0,
         "External Quality Assessment confirms generally conforms with IIA Standards.",
         "Adopt findings of external review into next QAIP cycle."),
        ("external", None, "scheduled", None,
         "External Quality Assessment Review scheduled for Q4 (5-year cycle).",
         "Engage qualified independent assessor; preserve all relevant workpapers."),
    ]
    for i, (rtype, rating, status, score, fnd, rec) in enumerate(rows):
        upsert(
            cur, "grc_qaip_reviews",
            {"tenant_id": TENANT_ID, "review_type": rtype,
             "engagement_id": eng_ids[i] if i < len(eng_ids) else None},
            {"status": status, "overall_rating": rating, "maturity_score": score,
             "findings": fnd, "recommendations": rec,
             "checklist": J({"planning": True, "fieldwork": True, "reporting": True}),
             "iia_conformance": J({"standards_2000": "conforms",
                                    "standards_2200": "conforms"}),
             "reviewer_id": 4,
             "completed_at": d(-15 + i * 5) if status == "complete" else None,
             "created_at": BASE, "updated_at": BASE},
        )


def seed_assurance_gaps(cur, entity_ids):
    if not has_pub_table(cur, "grc_assurance_gaps") or not entity_ids:
        return
    statuses = ["complete", "in_progress", "missing", "complete"]
    severities = ["low", "medium", "high", "critical"]
    for i, eid in enumerate(entity_ids):
        first  = statuses[i % 4]
        second = statuses[(i + 1) % 4]
        third  = statuses[(i + 2) % 4]
        has_gap = "missing" in (first, second, third)
        upsert(
            cur, "grc_assurance_gaps",
            {"tenant_id": TENANT_ID, "auditable_entity_id": eid},
            {"first_line_status": first,
             "second_line_status": second,
             "third_line_status": third,
             "has_gap": has_gap,
             "severity": severities[i % len(severities)] if has_gap else "low",
             "notes": "Three Lines coverage assessed against scoped controls.",
             "last_evaluated_at": d(-7),
             "created_at": BASE, "updated_at": BASE},
        )


# ---- 14. test scripts -----------------------------------------------------

TEST_SCRIPTS = [
    ("Privileged Access Review — Quarterly Test",     "Identity & Access", "control_test"),
    ("Three-Way Match — Sample Test",                 "Procure-to-Pay",    "transaction_test"),
    ("Backup Restoration Walkthrough",                "Resilience",        "operational_test"),
    ("MFA Enforcement Verification",                  "Authentication",    "control_test"),
    ("Journal Entry SoD Test",                        "Finance",           "transaction_test"),
    ("Vendor Master Data Quality Sample",             "Third Party",       "control_test"),
    ("AML Alert Closure Sample",                      "AML",               "transaction_test"),
    ("Cloud Admin Key Rotation",                      "Cloud Security",    "control_test"),
    ("Endpoint EDR Coverage Verification",            "Endpoint Security", "control_test"),
    ("Quarterly Access Recertification Walkthrough",  "Identity & Access", "operational_test"),
    ("Change Management CAB Approval Sample",         "Change Management", "transaction_test"),
    ("Reg Reporting Dual Sign-Off Verification",      "Regulatory",        "control_test"),
]


def seed_test_scripts(cur):
    if not has_pub_table(cur, "grc_audit_test_scripts"):
        return
    for i, (title, area, ttype) in enumerate(TEST_SCRIPTS):
        upsert(
            cur, "grc_audit_test_scripts",
            {"tenant_id": TENANT_ID, "title": title},
            {"objective": f"Evaluate the design and operating effectiveness of controls within {area}.",
             "procedure_steps": J([
                 {"step": 1, "text": "Obtain population listing"},
                 {"step": 2, "text": "Select representative sample"},
                 {"step": 3, "text": "Re-perform key control"},
                 {"step": 4, "text": "Document evidence and conclusion"},
             ]),
             "control_area": area,
             "entity_type": "Process",
             "test_type": ttype,
             "sampling_methodology": "random",
             "expected_evidence": "Screenshots, signed approvals, and corroborating system records.",
             "tags": J([area.split()[0].lower(), "demo"]),
             "usage_count": 5 + (i % 4),
             "last_used_date": d(-30 + i),
             "created_by_id": 4,
             "created_at": BASE, "updated_at": BASE},
        )


# ---- 15. skills + capacity -----------------------------------------------

SKILL_SET = [
    ("IT Audit",        "expert"),
    ("SOX",             "advanced"),
    ("Treasury",        "intermediate"),
    ("Cloud Security",  "advanced"),
    ("Data Analytics",  "intermediate"),
    ("AML",             "advanced"),
]


def seed_skills(cur, user_ids):
    if not has_pub_table(cur, "grc_auditor_skills"):
        return
    for ui, uid in enumerate(user_ids):
        for si, (skill, level) in enumerate(SKILL_SET):
            # Slight variance: some auditors are "intermediate" not "expert"
            applied_level = level if (ui + si) % 4 != 3 else "intermediate"
            upsert(
                cur, "grc_auditor_skills",
                {"tenant_id": TENANT_ID, "user_id": uid, "skill_name": skill},
                {"proficiency_level": applied_level,
                 "skill_category": "Audit Methodology" if si < 2 else "Domain",
                 "certification": "CIA" if skill == "IT Audit" else None,
                 "years_experience": 2.0 + (ui % 5) + si * 0.5,
                 "notes": "Self-attested; validated via engagement performance.",
                 "created_at": BASE, "updated_at": BASE},
            )


def seed_capacity(cur, user_ids, eng_ids):
    if not has_pub_table(cur, "grc_auditor_allocations"):
        return
    # 12 monthly periods × all 12 demo auditors (skip admin uid=4)
    auditor_ids = [u for u in user_ids if u != 4]
    for ui, uid in enumerate(auditor_ids):
        for mi in range(12):
            ps = datetime(BASE.year, ((BASE.month - 1 + mi) % 12) + 1, 1)
            next_month = (ps + timedelta(days=32)).replace(day=1)
            pe = next_month - timedelta(days=1)
            upsert(
                cur, "grc_auditor_allocations",
                {"tenant_id": TENANT_ID, "user_id": uid,
                 "start_date": ps, "end_date": pe},
                {"allocation_type": "engagement" if mi < 4 else "training",
                 "allocated_hours": 120.0 + (mi % 4) * 10,
                 "actual_hours":    100.0 + (mi % 4) * 8,
                 "engagement_id":   eng_ids[(ui + mi) % len(eng_ids)] if eng_ids else None,
                 "status": "active",
                 "notes": "Demo allocation for capacity planning view.",
                 "created_at": BASE, "updated_at": BASE},
            )


# ---- 16. audit committee + meetings + agenda + pre-reads + resolutions ---

def seed_committee(cur, user_ids) -> int | None:
    if not has_pub_table(cur, "grc_audit_committees"):
        return None
    cid = upsert(
        cur, "grc_audit_committees",
        {"tenant_id": TENANT_ID, "name": "Audit Committee"},
        {"description": "Board-level audit committee with independent membership.",
         "charter_text": "The Audit Committee assists the Board in oversight of financial reporting, internal control, and the internal audit function.",
         "chair_id": user_ids[6] if len(user_ids) > 6 else 4,
         "secretary_id": 4,
         "cae_reports_to": "Audit Committee Chair",
         "meeting_cadence": "quarterly",
         "quorum_count": 3,
         "is_active": True,
         "created_by_id": 4,
         "created_at": BASE, "updated_at": BASE},
        update=True,
    )
    return cid


COMMITTEE_MEMBERS = [
    ("Helen Park",       "helen.park@board.example",       "Chair",       "independent", True),
    ("Raj Singh",        "raj.singh@board.example",        "Member",      "independent", True),
    ("Maria Schultz",    "maria.schultz@board.example",    "Member",      "independent", False),
    ("Anders Lund",      "anders.lund@board.example",      "Member",      "independent", True),
    ("Wei Chen",         "wei.chen@board.example",         "Secretary",   "executive",   False),
]


def seed_committee_members(cur, cid):
    if not has_pub_table(cur, "grc_audit_committee_members") or not cid:
        return
    for i, (name, email, role, indep, fin_expert) in enumerate(COMMITTEE_MEMBERS):
        upsert(
            cur, "grc_audit_committee_members",
            {"tenant_id": TENANT_ID, "committee_id": cid, "name": name},
            {"email": email, "role": role,
             "independence_status": indep,
             "is_financial_expert": fin_expert,
             "term_start": d(-365),
             "term_end":   d(730),
             "bio": f"{name} brings extensive governance experience.",
             "is_active": True,
             "created_by_id": 4,
             "created_at": BASE, "updated_at": BASE},
        )


def seed_committee_meetings(cur, cid, user_ids) -> list[int]:
    if not has_pub_table(cur, "grc_audit_committee_meetings") or not cid:
        return []
    rows = [
        ("Q1 2026 Audit Committee Meeting", "regular", -45, "complete"),
        ("Q2 2026 Audit Committee Meeting", "regular",  45, "scheduled"),
        ("Q3 2026 Audit Committee Meeting", "regular", 135, "scheduled"),
    ]
    ids = []
    for title, mtype, off, status in rows:
        ids.append(upsert(
            cur, "grc_audit_committee_meetings",
            {"tenant_id": TENANT_ID, "committee_id": cid, "title": title},
            {"meeting_type": mtype,
             "scheduled_at": d(off),
             "location": "Boardroom A / Hybrid",
             "status": status,
             "chair_id": user_ids[6] if len(user_ids) > 6 else 4,
             "secretary_id": 4,
             "attendees": J([m[0] for m in COMMITTEE_MEMBERS]),
             "quorum_met": True,
             "minutes": "Minutes prepared by secretary; circulated to attendees." if status == "complete" else None,
             "minutes_approved": (status == "complete"),
             "minutes_approved_at": d(off + 14) if status == "complete" else None,
             "executive_summary": "Reviewed quarterly audit plan progress, key findings, and remediation status.",
             "next_meeting_date": d(off + 90),
             "created_by_id": 4,
             "created_at": BASE, "updated_at": BASE},
        ))
    return ids


AGENDA_TEMPLATE = [
    ("Welcome & Apologies",                 "governance", 5),
    ("Approval of Prior Minutes",           "governance", 5),
    ("CAE Quarterly Update",                "audit",     20),
    ("Key Findings & Themes",               "audit",     25),
    ("Open Issues & Overdue Remediation",   "audit",     20),
    ("Audit Plan Status",                   "audit",     15),
    ("External Auditor Update",             "external",  15),
    ("Risk & Control Environment",          "risk",      15),
    ("AOB",                                 "governance", 5),
]


def seed_committee_agenda(cur, meeting_ids):
    if not has_pub_table(cur, "grc_audit_committee_agenda_items") or not meeting_ids:
        return
    for mid in meeting_ids:
        for i, (title, itype, mins) in enumerate(AGENDA_TEMPLATE):
            upsert(
                cur, "grc_audit_committee_agenda_items",
                {"tenant_id": TENANT_ID, "meeting_id": mid,
                 "title": title, "order_no": i + 1},
                {"description": f"{title} — standing agenda item.",
                 "presenter": "CAE" if "Audit" in title or "CAE" in title else "Chair",
                 "time_allocation_min": mins,
                 "item_type": itype,
                 "status": "complete" if itype == "governance" else "scheduled",
                 "created_by_id": 4,
                 "created_at": BASE, "updated_at": BASE},
            )


def seed_committee_pre_reads(cur, meeting_ids, doc_ids):
    if not has_pub_table(cur, "grc_audit_committee_pre_reads") or not meeting_ids:
        return
    titles = [
        "Quarterly Audit Plan Progress Pack",
        "Key Findings & Themes Summary",
        "Open Issues Tracker",
        "External Auditor Status Memo",
    ]
    for mid in meeting_ids:
        for i, t in enumerate(titles):
            upsert(
                cur, "grc_audit_committee_pre_reads",
                {"tenant_id": TENANT_ID, "meeting_id": mid, "title": t},
                {"description": f"Pre-read material: {t}.",
                 "document_url": f"/audit/docs/{(i+1)*5}",
                 "file_path":   f"/audit/docs/{(i+1)*5}.pdf",
                 "uploaded_by_id": 4,
                 "uploaded_at": d(-7),
                 "recipient_member_ids": J([1, 2, 3, 4, 5]),
                 "created_by_id": 4,
                 "updated_at": BASE},
            )


def seed_committee_resolutions(cur, meeting_ids):
    if not has_pub_table(cur, "grc_audit_committee_resolutions") or not meeting_ids:
        return
    titles = [
        ("Approve FY26 Annual Audit Plan", "passed", 5, 0, 0),
        ("Endorse remediation timelines for critical findings", "passed", 4, 0, 1),
        ("Approve charter v9.0", "passed", 5, 0, 0),
    ]
    for mi, mid in enumerate(meeting_ids):
        for ti, (title, status, vf, va, vab) in enumerate(titles):
            upsert(
                cur, "grc_audit_committee_resolutions",
                {"tenant_id": TENANT_ID, "meeting_id": mid, "title": title},
                {"description": f"Resolution proposed at meeting #{mi+1}.",
                 "resolution_text": "RESOLVED that the Committee approves the proposal as tabled.",
                 "votes_for": vf, "votes_against": va, "votes_abstain": vab,
                 "status": status,
                 "decided_at": d(-45 + mi * 90),
                 "created_by_id": 4,
                 "created_at": BASE, "updated_at": BASE},
            )


# ---- 17. reports + board packs -------------------------------------------

def seed_reports(cur, eng_ids):
    if not has_pub_table(cur, "grc_audit_reports") or not eng_ids:
        return
    rows = [
        ("Treasury Operations Audit FY26 — Final Report",     "satisfactory",      "issued",     0),
        ("Cybersecurity Program Review — Draft Report",        None,                "draft",      14),
        ("Regulatory Reporting Walkthrough — Final Report",    "satisfactory",      "issued",    -7),
        ("Mobile Banking App Security — Final Report",         "satisfactory",      "issued",   -14),
        ("KYC Onboarding Quality — Final Report",              "needs_improvement","issued",  -120),
        ("Payroll Process Audit — Final Report",               "satisfactory",      "issued",   -90),
    ]
    for i, (title, opinion, status, off) in enumerate(rows):
        upsert(
            cur, "grc_audit_reports",
            {"tenant_id": TENANT_ID, "title": title,
             "engagement_id": eng_ids[i % len(eng_ids)]},
            {"report_type": "engagement",
             "executive_summary": "The audit identified strengths in control design and a small number of remediation items, all owned and tracked.",
             "opinion": opinion,
             "opinion_narrative": "Controls operated effectively in all material respects." if opinion == "satisfactory" else "Improvements required before next reporting cycle.",
             "scope_summary": "End-to-end process review including walkthroughs, sample testing, and corroborating evidence.",
             "findings_summary": J({"critical": 1, "high": 2, "medium": 3, "low": 1}),
             "recommendations_summary": J([
                 {"priority": "high",   "text": "Strengthen quarterly access reviews"},
                 {"priority": "medium", "text": "Update incident response runbook"},
             ]),
             "ai_recommendations": "Consider adopting CCM rules to monitor key thresholds continuously.",
             "status": status,
             "ai_generated": False,
             "issued_date": d(off) if status == "issued" else None,
             "issued_by_id": 4,
             "created_at": BASE, "updated_at": BASE},
        )


def seed_board_packs(cur, eng_ids):
    if not has_pub_table(cur, "grc_audit_board_packs"):
        return
    rows = [
        ("Audit Committee Pack — Q1 2026",  "Q1 2026", "presented", -45),
        ("Audit Committee Pack — Q2 2026",  "Q2 2026", "draft",      30),
        ("Audit Committee Pack — Q3 2026",  "Q3 2026", "draft",     120),
        ("Annual Internal Audit Report 2025","Annual 2025","presented", -120),
    ]
    for title, period, status, off in rows:
        upsert(
            cur, "grc_audit_board_packs",
            {"tenant_id": TENANT_ID, "title": title},
            {"period": period,
             "executive_summary": "Quarterly summary of audit plan progress, key findings, and remediation status.",
             "engagement_ids": J(eng_ids[:6]),
             "key_findings": J([
                 {"title": "Privileged access reviews not performed quarterly", "severity": "high"},
                 {"title": "MFA not enforced on legacy admin console", "severity": "high"},
                 {"title": "Segregation of duties gap in payment release", "severity": "critical"},
             ]),
             "kpi_data": J({"plan_completion_pct": 72,
                            "open_high_findings": 9,
                            "overdue_issues": 4,
                            "avg_days_to_close": 45}),
             "risk_heatmap_data": J({"critical": 4, "high": 12, "medium": 18, "low": 6}),
             "opinion_summary": "The control environment is generally satisfactory with focused remediation underway in Identity & Access and Treasury.",
             "status": status,
             "ai_generated": False,
             "prepared_by_id": 4,
             "presented_date": d(off) if status == "presented" else None,
             "created_at": BASE, "updated_at": BASE},
        )


# ---- 18. external auditor sessions ---------------------------------------

def seed_external_sessions(cur, eng_ids):
    if not has_pub_table(cur, "grc_external_auditor_sessions"):
        return
    rows = [
        ("Sarah Mitchell", "sarah.mitchell@external-firm.example", "BigFour LLP",       "financial", "active",  60),
        ("David Cohen",    "david.cohen@external-firm.example",    "Mid-Market Audit",  "sox",       "active",  90),
        ("Anika Sharma",   "anika.sharma@external-firm.example",   "Regulator Office",  "regulatory","expired", -30),
        ("Tom Becker",     "tom.becker@external-firm.example",     "BigFour LLP",       "financial", "expired", -60),
    ]
    for i, (name, email, firm, atype, status, exp_off) in enumerate(rows):
        # On first insert: generate a cryptographically random token.
        # On re-run: the existing row matches by (tenant, email, engagement)
        # and `update=True` below refreshes non-key fields. We exclude
        # `access_token` from the update payload so the original token stays
        # stable across runs (deterministic + secure).
        eng_id = eng_ids[i % len(eng_ids)] if eng_ids else None
        keys = {"tenant_id": TENANT_ID,
                "auditor_email": email,
                "engagement_id": eng_id}
        # Use IS NULL semantics for the nullable engagement_id key.
        if eng_id is None:
            cur.execute(
                'SELECT 1 FROM grc_external_auditor_sessions '
                'WHERE tenant_id=%s AND auditor_email=%s '
                'AND engagement_id IS NULL',
                (TENANT_ID, email),
            )
        else:
            cur.execute(
                'SELECT 1 FROM grc_external_auditor_sessions '
                'WHERE tenant_id=%s AND auditor_email=%s AND engagement_id=%s',
                (TENANT_ID, email, eng_id),
            )
        existing = cur.fetchone() is not None
        set_cols = {
             "auditor_name": name, "auditor_firm": firm,
             "audit_type": atype,
             # Demo sessions: half are expired so unauthenticated portal access
             # is not viable for the rest unless re-issued.
             "status": "expired" if status == "active" and i >= 2 else status,
             "requested_documents": J([
                 {"id": 1, "name": "SOX Walkthrough — SAP GL"},
                 {"id": 2, "name": "Quarterly Access Review Template"},
             ]),
             "shared_document_ids": J([1, 2, 3, 4]),
             "pbc_items": J([
                 {"id": 1, "name": "Trial Balance YTD",  "status": "received"},
                 {"id": 2, "name": "Bank Reconciliations","status": "outstanding"},
             ]),
             "notes": "External auditor portal session for evidence sharing.",
             "expires_at": d(exp_off),
             "last_accessed_at": d(-3),
             "created_by_id": 4,
             "created_at": BASE, "updated_at": BASE,
        }
        if not existing:
            set_cols["access_token"] = secrets.token_urlsafe(32)
        upsert(
            cur, "grc_external_auditor_sessions",
            keys, set_cols, update=True,
        )


# ---- 19. audit packages + access logs ------------------------------------

def seed_audit_packages(cur, plan_ids):
    """Seed audit packages + access logs (used by external auditor portal /
    package sharing). Idempotent via stable name keys."""
    if not has_pub_table(cur, "grc_audit_packages"):
        return []
    pkg_specs = [
        ("FY26-Q1 SOX Package",        "draft",     -45),
        ("FY26-Q1 IT Controls Package","finalized", -30),
        ("FY26 AML Walkthroughs",      "finalized", -20),
        ("FY26 Treasury Quarterly",    "draft",     -10),
    ]
    pkg_ids = []
    for i, (name, status, off) in enumerate(pkg_specs):
        pkg_ids.append(upsert(
            cur, "grc_audit_packages",
            {"tenant_id": TENANT_ID, "name": name},
            {"description": f"Demo audit package: {name}.",
             "audit_period_start": d(off - 90),
             "audit_period_end":   d(off),
             "status": status,
             "created_by": 4,
             "finalized_at": d(off + 5) if status == "finalized" else None,
             "finalized_by": 4 if status == "finalized" else None,
             "is_legal_hold": False,
             "package_metadata": J({"plan_id": plan_ids[i % len(plan_ids)] if plan_ids else None,
                                   "items": ["walkthroughs", "samples", "memos"]}),
             "created_at": BASE},
        ))
    if not has_pub_table(cur, "grc_audit_package_access_logs"):
        return pkg_ids
    # Stable access-log entries: action+offset is part of the natural key so
    # re-runs do not duplicate rows.
    actions = ["view", "download", "share"]
    for pi, pid in enumerate(pkg_ids):
        for k in range(3):  # 3 log rows per package = 12 total
            upsert(
                cur, "grc_audit_package_access_logs",
                {"package_id": pid, "user_id": 4,
                 "action": actions[k], "accessed_at": d(-5 + pi + k)},
                {"ip_address": "10.0.0.1", "user_agent": "demo-seed/1.0"},
            )
    return pkg_ids


# ---- main -----------------------------------------------------------------

def main():
    global TENANT_ID, SCHEMA
    TENANT_ID, SCHEMA = ensure_demo_tenant()
    print(f"[seed] DSN ok, tenant_id={TENANT_ID} schema={SCHEMA}")
    conn = psycopg2.connect(DSN)
    conn.autocommit = False
    try:
        with conn.cursor() as cur:
            user_ids = seed_users(cur)
            print(f"[seed] users:           {len(user_ids)} ids ({user_ids})")
            bu_ids = seed_business_units(cur)
            print(f"[seed] business units:  {len(bu_ids)}")
            entity_ids = seed_universe(cur, bu_ids)
            print(f"[seed] universe:        {len(entity_ids)}")
            plan_ids = seed_plans(cur)
            print(f"[seed] plans:           {len(plan_ids)}")
            seed_plan_items(cur, plan_ids, entity_ids); print("[seed] plan items:      ok")
            eng_ids = seed_engagements(cur, entity_ids, plan_ids, user_ids)
            print(f"[seed] engagements:     {len(eng_ids)}")
            seed_team_members(cur, eng_ids, user_ids); print("[seed] team members:    ok")
            seed_time_entries(cur, eng_ids, user_ids); print("[seed] time entries:    ok")
            wp_ids = seed_workpapers(cur, eng_ids, user_ids)
            print(f"[seed] workpapers:      {len(wp_ids)}")
            seed_procedures(cur, wp_ids, user_ids); print("[seed] procedures:      ok")
            seed_sampling(cur, eng_ids, wp_ids);    print("[seed] sampling:        ok")
            f_ids = seed_findings(cur, eng_ids, user_ids)
            print(f"[seed] findings:        {len(f_ids)}")
            r_ids = seed_recommendations(cur, f_ids, user_ids)
            print(f"[seed] recommendations: {len(r_ids)}")
            seed_management_responses(cur, f_ids); print("[seed] mgmt responses:  ok")
            i_ids = seed_issues(cur, f_ids); print(f"[seed] issues:          {len(i_ids)}")
            seed_action_plans(cur, r_ids, user_ids); print("[seed] action plans:    ok")
            seed_follow_ups(cur, f_ids, user_ids);   print("[seed] follow-ups:      ok")
            seed_escalations(cur, f_ids, user_ids);  print("[seed] escalations:     ok")
            s_ids = seed_surveys(cur, eng_ids); print(f"[seed] surveys:         {len(s_ids)}")
            seed_survey_responses(cur, s_ids); print("[seed] survey responses:ok")
            doc_ids = seed_documents(cur, eng_ids); print(f"[seed] documents:       {len(doc_ids)}")
            seed_document_versions(cur, doc_ids); print("[seed] doc versions:    ok")
            charter_id = seed_charter(cur); print(f"[seed] charter (head):  {charter_id}")
            clause_ids = seed_charter_clauses(cur, charter_id); print("[seed] charter clauses: ok")
            seed_charter_clause_links(cur, clause_ids, eng_ids, plan_ids); print("[seed] charter links:   ok")
            rule_ids = seed_ccm(cur); print(f"[seed] ccm rules:       {len(rule_ids)}")
            anom_ids = seed_ccm_anomalies(cur, rule_ids); print(f"[seed] ccm anomalies:   {len(anom_ids)}")
            seed_ccm_exceptions(cur, anom_ids, f_ids, user_ids); print("[seed] ccm exceptions:  ok")
            seed_qaip(cur, eng_ids); print("[seed] qaip:            ok")
            seed_assurance_gaps(cur, entity_ids); print("[seed] assurance gaps:  ok")
            seed_test_scripts(cur); print("[seed] test scripts:    ok")
            seed_skills(cur, user_ids); print("[seed] skills:          ok")
            seed_capacity(cur, user_ids, eng_ids); print("[seed] capacity:        ok")
            cid = seed_committee(cur, user_ids); print(f"[seed] committee:       {cid}")
            seed_committee_members(cur, cid); print("[seed] cttee members:   ok")
            mtg_ids = seed_committee_meetings(cur, cid, user_ids); print(f"[seed] cttee meetings:  {len(mtg_ids)}")
            seed_committee_agenda(cur, mtg_ids); print("[seed] cttee agenda:    ok")
            seed_committee_pre_reads(cur, mtg_ids, doc_ids); print("[seed] cttee pre-reads: ok")
            seed_committee_resolutions(cur, mtg_ids); print("[seed] cttee resolutions:ok")
            seed_reports(cur, eng_ids); print("[seed] reports:         ok")
            seed_board_packs(cur, eng_ids); print("[seed] board packs:     ok")
            seed_external_sessions(cur, eng_ids); print("[seed] external sessns: ok")
            seed_audit_packages(cur, plan_ids); print("[seed] packages+logs:   ok")
        conn.commit()
        print("[seed] COMMITTED")
    except Exception as e:
        conn.rollback()
        print(f"[seed] FAILED, rolled back: {e}", file=sys.stderr)
        raise
    finally:
        conn.close()


# ---- verification ---------------------------------------------------------

_T = TENANT_ID
VERIFY_TABLES = [
    ("grc_auditable_entities",            f"tenant_id={_T}"),
    ("grc_business_units",                f"tenant_id={_T}"),
    ("grc_audit_plans",                   f"tenant_id={_T}"),
    ("grc_audit_plan_items",              f"plan_id IN (SELECT id FROM grc_audit_plans WHERE tenant_id={_T})"),
    ("grc_audit_engagements",             f"tenant_id={_T}"),
    ("grc_audit_team_members",            f"engagement_id IN (SELECT id FROM grc_audit_engagements WHERE tenant_id={_T})"),
    ("grc_audit_time_entries",            f"engagement_id IN (SELECT id FROM grc_audit_engagements WHERE tenant_id={_T})"),
    ("grc_audit_workpapers",              f"engagement_id IN (SELECT id FROM grc_audit_engagements WHERE tenant_id={_T})"),
    ("grc_audit_procedures",              f"workpaper_id IN (SELECT id FROM grc_audit_workpapers WHERE engagement_id IN (SELECT id FROM grc_audit_engagements WHERE tenant_id={_T}))"),
    ("grc_audit_sampling_records",        f"tenant_id={_T}"),
    ("grc_audit_findings",                f"tenant_id={_T}"),
    ("grc_audit_recommendations",         f"finding_id IN (SELECT id FROM grc_audit_findings WHERE tenant_id={_T})"),
    ("grc_audit_management_responses",    f"finding_id IN (SELECT id FROM grc_audit_findings WHERE tenant_id={_T})"),
    ("grc_issues",                        f"tenant_id={_T}"),
    ("grc_audit_action_plans",            f"recommendation_id IN (SELECT r.id FROM grc_audit_recommendations r JOIN grc_audit_findings f ON r.finding_id=f.id WHERE f.tenant_id={_T})"),
    ("grc_audit_follow_ups",              f"finding_id IN (SELECT id FROM grc_audit_findings WHERE tenant_id={_T})"),
    ("grc_audit_issue_escalations",       f"tenant_id={_T}"),
    ("grc_audit_surveys",                 f"tenant_id={_T}"),
    ("grc_audit_survey_responses",        f"survey_id IN (SELECT id FROM grc_audit_surveys WHERE tenant_id={_T})"),
    ("grc_audit_documents",               f"tenant_id={_T}"),
    ("grc_documents",                     f"tenant_id={_T}"),
    ("grc_document_versions",             f"document_id IN (SELECT id FROM grc_documents WHERE tenant_id={_T})"),
    ("grc_audit_charters",                f"tenant_id={_T}"),
    ("grc_charter_clauses",               f"tenant_id={_T}"),
    ("grc_charter_clause_engagement_links", f"tenant_id={_T}"),
    ("grc_charter_clause_plan_links",     f"tenant_id={_T}"),
    ("grc_ccm_rules",                     f"tenant_id={_T}"),
    ("grc_ccm_anomalies",                 f"tenant_id={_T}"),
    ("grc_ccm_exceptions",                f"anomaly_id IN (SELECT id FROM grc_ccm_anomalies WHERE tenant_id={_T})"),
    ("grc_qaip_reviews",                  f"tenant_id={_T}"),
    ("grc_assurance_gaps",                f"tenant_id={_T}"),
    ("grc_audit_test_scripts",            f"tenant_id={_T}"),
    ("grc_auditor_skills",                f"tenant_id={_T}"),
    ("grc_auditor_allocations",           f"tenant_id={_T}"),
    ("grc_audit_committees",              f"tenant_id={_T}"),
    ("grc_audit_committee_members",       f"tenant_id={_T}"),
    ("grc_audit_committee_meetings",      f"tenant_id={_T}"),
    ("grc_audit_committee_agenda_items",  f"tenant_id={_T}"),
    ("grc_audit_committee_pre_reads",     f"tenant_id={_T}"),
    ("grc_audit_committee_resolutions",   f"tenant_id={_T}"),
    ("grc_audit_reports",                 f"tenant_id={_T}"),
    ("grc_audit_board_packs",             f"tenant_id={_T}"),
    ("grc_external_auditor_sessions",     f"tenant_id={_T}"),
    ("grc_audit_packages",                f"tenant_id={_T}"),
    ("grc_audit_package_access_logs",     f"package_id IN (SELECT id FROM grc_audit_packages WHERE tenant_id={_T})"),
]


def _snapshot_counts(conn) -> dict[str, int]:
    out: dict[str, int] = {}
    with conn.cursor() as cur:
        for table, where in VERIFY_TABLES:
            cur.execute(
                "SELECT 1 FROM information_schema.tables "
                "WHERE table_schema='public' AND table_name=%s",
                (table,),
            )
            if not cur.fetchone():
                continue
            cur.execute(f'SELECT COUNT(*) FROM "{table}" WHERE {where}')
            out[table] = cur.fetchone()[0]
    return out


# Minimum expected row counts (post-seed) for core module tables. The seed
# is considered healthy only when each of these meets or exceeds its
# threshold, so module pages cannot silently regress to "empty".
MIN_COUNTS = {
    "grc_auditable_entities":              20,
    "grc_business_units":                   5,
    "grc_audit_plans":                      6,
    "grc_audit_plan_items":                30,
    "grc_audit_engagements":               20,
    "grc_audit_team_members":              60,
    "grc_audit_time_entries":             150,
    "grc_audit_workpapers":                40,
    "grc_audit_procedures":               100,
    "grc_audit_findings":                  30,
    "grc_audit_recommendations":           30,
    "grc_issues":                          25,
    "grc_audit_action_plans":              60,
    "grc_audit_surveys":                    8,
    "grc_audit_documents":                 25,
    "grc_documents":                       25,
    "grc_document_versions":               60,
    "grc_audit_charters":                   3,
    "grc_charter_clauses":                 12,
    "grc_charter_clause_engagement_links": 12,
    "grc_charter_clause_plan_links":        6,
    "grc_ccm_rules":                       12,
    "grc_ccm_anomalies":                   30,
    "grc_qaip_reviews":                     4,
    "grc_assurance_gaps":                  12,
    "grc_audit_test_scripts":              12,
    "grc_auditor_skills":                  60,
    "grc_auditor_allocations":            120,
    "grc_audit_committees":                 1,
    "grc_audit_committee_meetings":         3,
    "grc_audit_reports":                    6,
    "grc_audit_board_packs":                4,
    "grc_external_auditor_sessions":        4,
    "grc_audit_packages":                   4,
    "grc_audit_package_access_logs":       12,
}


def verify():
    """Run the seed twice and assert identical row counts (idempotency)."""
    print("[verify] === pass 1 ===")
    main()
    conn = psycopg2.connect(DSN)
    try:
        before = _snapshot_counts(conn)
    finally:
        conn.close()
    print("[verify] === pass 2 ===")
    main()
    conn = psycopg2.connect(DSN)
    try:
        after = _snapshot_counts(conn)
    finally:
        conn.close()

    print("\n[verify] table                                 before   after  delta")
    print("[verify] " + "-" * 64)
    failures = []
    for table in before:
        b = before[table]
        a = after[table]
        delta = a - b
        marker = " " if delta == 0 else "*"
        print(f"[verify] {marker} {table:42s} {b:7d} {a:7d} {delta:6d}")
        if delta != 0:
            failures.append((table, b, a))
    if failures:
        print(f"\n[verify] FAIL: {len(failures)} table(s) drifted across runs")
        for table, b, a in failures:
            print(f"[verify]   - {table}: {b} -> {a}")
        sys.exit(2)
    print(f"\n[verify] PASS: all {len(before)} tables stable across two runs")

    # Threshold check: every core module table must meet its minimum count.
    print("\n[verify] minimum-count thresholds:")
    short = []
    for table, minimum in MIN_COUNTS.items():
        actual = after.get(table, 0)
        marker = " " if actual >= minimum else "*"
        print(f"[verify] {marker} {table:42s} {actual:7d} >= {minimum}")
        if actual < minimum:
            short.append((table, actual, minimum))
    if short:
        print(f"\n[verify] FAIL: {len(short)} table(s) below minimum threshold")
        for table, a, m in short:
            print(f"[verify]   - {table}: {a} < {m}")
        sys.exit(3)
    print(f"\n[verify] PASS: all {len(MIN_COUNTS)} core tables meet minimums")


if __name__ == "__main__":
    if len(sys.argv) > 1 and sys.argv[1] == "--verify":
        verify()
    else:
        main()
