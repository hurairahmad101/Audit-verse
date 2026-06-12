---
title: Full demo data seeding for every audit module
---
# Full Demo Data Seeding

## What & Why
Populate the AuditVerse.AI demo tenant with rich, realistic data across every one of the 17 audit modules so each page renders with multiple records, charts show real distributions, and the workspace looks like a real customer instance during demos and screenshots. Today the seed only inserts ~50 thin rows; modules like Workpapers, Audit Committee, Action Plans, Time Entries, Reports, Board Packs, CCM Anomalies, External Auditor Sessions, and Document Versions are empty.

## Done looks like
- Every audit page in the demo tenant (`/audit/*` for all 17 modules) shows at least 3 rows of data and analytics/dashboards render non-empty charts.
- The seed script can be re-run any number of times and row counts stay identical (idempotent).
- After a fresh run, screenshots captured by the existing capture script show populated tables and cards on every module page.

## Out of scope
- Rebuilding the pitch deck or brochure (separate follow-up).
- Database schema changes — data only.
- Modules outside the 17 in scope (ERM, Vendor Risk, etc. were already removed per `replit.md`).

## Steps
1. **Expand existing seeders** — Increase row counts to target volumes: Universe 20 entities across 5 business units, Plans 6 (FY24/25/26 × annual+strategic), Engagements 20 across all statuses, Findings 30 with severity mix, Issues 25 with realistic aging, Surveys 8, Documents 25, Charter v9.0 + 2 superseded versions, CCM 12 rules, QAIP 4 reviews, Test Scripts 12, Skills 12 auditors × 6 skills, Capacity 12 monthly allocations.
2. **Add missing-module seeders** — New idempotent functions for: workpapers (40) + procedures + sampling records, audit team members + time entries, recommendations + management responses per finding, action plans + follow-ups + escalations per issue, survey responses, document versions, external auditor sessions + access logs, charter clauses with engagement/plan links, CCM anomalies + exceptions, audit reports + board packs, audit committee meetings + members + agenda + pre-reads + resolutions.
3. **Determinism + idempotency hardening** — Use a fixed BASE_DATE (Jan 1 of current year) for all derived dates so re-runs produce identical rows. Keep the existing presence-check upsert pattern with stable natural keys (no NOW in keys). Print one-line per-module summaries.
4. **Verification** — Run the seed script twice end-to-end and assert COUNT(*) is identical for every seeded table. Spot-check 3–4 audit pages in the running app to confirm they render populated.

## Relevant files
- `backend/scripts/seed_demo.py`
- `backend/grc/modules/audit_management`
- `scripts/capture_screenshots.py`