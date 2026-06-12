# Three Lines of Defense Alignment

## What & Why
The Three Lines of Defense (3LoD) is the standard governance model that distinguishes 1st line (operational management owning controls), 2nd line (risk and compliance functions overseeing controls), and 3rd line (internal audit independently assuring controls). Today the platform treats audit as a standalone activity with no upstream feed from the first two lines. This task lets 1st-line management self-assessments and 2nd-line risk/compliance assertions flow into the 3rd-line audit universe so auditors see a complete control assurance picture before scoping engagements.

## Done looks like
- New `3LoD Inputs` page under the Governance group of the Audit Management sidebar
- 1st-line self-assessment intake: process owners can submit periodic self-assessments per auditable entity (control description, design effectiveness, operating effectiveness, evidence link, attestation date)
- 2nd-line assertion intake: risk and compliance officers can submit assertions per entity (risk rating, compliance status, open issues, last review date)
- Combined 3LoD view per Audit Universe entity showing the latest 1st-line self-assessment, 2nd-line assertion, and 3rd-line audit history side-by-side
- "Assurance gap" indicator highlights entities where 1st or 2nd line input is stale or missing — surfaces them to the audit planning view
- Engagement planning surface gains a `3LoD Context` panel showing the latest first- and second-line inputs for the entity being audited, so auditors don't duplicate testing already covered upstream
- 3LoD Coverage Map: visualization of all auditable entities scored on whether each line of defense has provided current input
- All 3LoD records are tenant-scoped, versioned, and attributable to the submitting user

## Out of scope
- A full Enterprise Risk Management module (risk register, KRIs, incidents) — those were intentionally removed from the platform earlier
- A full Compliance module — same reason
- Public-facing attestation portals; submissions happen inside the platform
- Automated import of 1st/2nd-line data from external GRC tools (manual entry plus REST API only)

## Steps
1. **Backend: data model** — Add `FirstLineSelfAssessment`, `SecondLineAssertion`, `AssuranceGap` models, all linked to `AuditableEntity` (which exists in the Audit Universe).
2. **Backend: API** — CRUD endpoints for 1st-line self-assessments and 2nd-line assertions, plus a combined `3lod-summary` endpoint that returns the latest of each per entity with a gap flag.
3. **Backend: planning integration** — Extend the engagement-detail endpoint to include the latest 1st- and 2nd-line context for the engagement's entity.
4. **Frontend: 3LoD intake pages** — Two intake forms (1st line, 2nd line) with entity selector, structured form, attestation, and history list per entity.
5. **Frontend: 3LoD entity view** — Side-by-side three-column view (1st / 2nd / 3rd line) per Audit Universe entity, with timestamps and staleness badges.
6. **Frontend: assurance gap surfacing** — On the Audit Plans page, decorate entities with a colored badge indicating gap status. Allow filtering to "entities with gaps".
7. **Frontend: engagement context panel** — Add a `3LoD Context` collapsible panel to the engagement workspace showing the latest first- and second-line inputs.
8. **Frontend: coverage map** — A simple grid view: rows are auditable entities, columns are the three lines, cells colored green / amber / red by recency.

## Architectural constraints
- Depends on the Audit Committee module being merged so the new pages can sit under the same Governance group in the restructured sidebar without conflicts.
- Stale thresholds (what counts as "current" 1st-line or 2nd-line input) should be configurable per tenant with sane defaults (180 days for 1st line, 365 days for 2nd line).
- 3LoD records do not modify audit findings — they are inputs to scoping, not substitutes for independent testing.
- Tenant scoping and `created_by` / `updated_by` audit trail apply to every record.

## Relevant files
- `backend/grc/modules/audit_management/routers/__init__.py`
- `backend/grc/modules/audit_management/routers/charter.py`
- `backend/grc/models.py`
- `frontend/src/lib/api.ts`
- `frontend/src/components/layout/Sidebar.tsx:67-86`
- `frontend/src/app/(dashboard)/audit/engagements`
- `frontend/src/app/(dashboard)/audit/plans`
- `frontend/src/app/(dashboard)/audit/universe`
