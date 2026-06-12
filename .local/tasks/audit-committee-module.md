# Audit Committee Module

## What & Why
The Audit Committee is the governance body that approves the Charter, hires the CAE, approves the annual audit plan, and receives all Internal Audit reporting. The platform currently has no Audit Committee module at all — a critical credibility gap for any enterprise audit demo. This task adds a full v1 Audit Committee module that establishes governance as the entry point for audit work.

## Done looks like
- New `Audit Committee` page accessible from the sidebar under a `Governance` section
- Committee member roster with profile cards showing name, role, independence status, financial-expertise flag (SOX 407), tenure, and term end date
- Meeting calendar view (list + month grid) showing past and upcoming meetings with status badges (Scheduled, In Progress, Held, Cancelled)
- Meeting detail page with: agenda (orderable items), attendees (members + invitees), minutes (rich text), executive session toggle, resolutions list, action items list, pre-read documents
- Charter approval workflow surface: Committee can review and approve/reject submitted Charter versions with comments and digital sign-off (the Charter side is built in the companion task)
- Annual Audit Plan approval workflow: Committee reviews the submitted plan, sees version history, approves with digital sign-off
- Reporting Packs page that auto-assembles a board-ready PDF from latest Findings, KPIs, Coverage heat map, and budget-vs-actuals
- Resolutions and action items have owners, due dates, status, and overdue alerts
- Pre-read distribution: upload documents, send to members, track per-member acknowledgment
- AI Meeting Minutes Drafter: paste rough discussion notes, AI returns formatted minutes with decisions, action items, and resolutions extracted
- All committee data persists in the database and is tenant-scoped

## Out of scope
- Public board portal or external member access (members log in through the standard tenant auth)
- Voting workflows beyond simple approve/reject (no weighted votes, no proxy voting)
- Integration with calendar systems (Outlook, Google Calendar) — manual scheduling only in v1
- E-signature integrations (DocuSign, Adobe Sign) — internal digital sign-off only

## Steps
1. **Backend: data model** — Define SQLAlchemy models for `AuditCommittee`, `CommitteeMember`, `CommitteeMeeting`, `MeetingAgendaItem`, `MeetingResolution`, `MeetingActionItem`, `MeetingPreRead`, `MeetingAcknowledgment`, `CommitteeApproval` (polymorphic — applies to Charter or Audit Plan).
2. **Backend: REST API** — Build CRUD endpoints under a new `committee.py` router covering committee profile, members, meetings, agenda, minutes, resolutions, action items, pre-reads, and approval workflow.
3. **Backend: AI minutes drafter** — Endpoint that accepts raw notes + meeting context and returns structured minutes (sections: Discussion, Decisions, Action Items, Resolutions). Use the existing OpenAI integration with graceful fallback.
4. **Backend: reporting pack generator** — Endpoint that aggregates Findings (by severity), KPI snapshot, Coverage data, and Budget-vs-Actuals into a structured JSON payload for the frontend to render and export.
5. **Frontend: roster page** — Members list with cards, add/edit member modal capturing independence and financial-expertise attributes.
6. **Frontend: meeting calendar + detail** — Calendar view + meeting workspace with tabs for Agenda, Attendees, Minutes, Resolutions, Action Items, Pre-Reads.
7. **Frontend: approval workflow UI** — Inbox of pending approvals (Charter or Plan), side-by-side review of the submitted version, approve/reject buttons with comment box and digital sign-off attestation.
8. **Frontend: reporting packs page** — Generate-pack action, preview rendered pack on screen, export to PDF (browser print stylesheet is acceptable).
9. **Frontend: pre-reads & acknowledgment tracking** — Upload pre-reads, distribute, see per-member ack status with overdue indicators.
10. **API client & navigation** — Add `committeeApi` group to `frontend/src/lib/api.ts`. Sidebar wiring is handled in the companion sidebar-restructure task.

## Architectural constraints
- Tenant scoping is non-negotiable: every committee record carries `tenant_id` and is filtered through the existing tenant-context dependency.
- Approvals are polymorphic over the artifact being approved (Charter version, Audit Plan version) — design the `CommitteeApproval` model with a target type + target id pair so future artifact types can plug in without schema churn.
- AI features must degrade gracefully (return empty draft + message) when `AI_INTEGRATIONS_OPENAI_API_KEY` is unavailable, matching the pattern already established in `chatbot/router.py` and `findings.py`.
- All write endpoints require an authenticated user and capture `created_by` / `updated_by` for the audit trail.

## Relevant files
- `backend/grc/main.py:9,82-86`
- `backend/grc/modules/audit_management/routers/charter.py`
- `backend/grc/modules/audit_management/routers/__init__.py`
- `backend/grc/models.py`
- `backend/grc/routers/auth_router.py`
- `frontend/src/lib/api.ts`
- `frontend/src/components/layout/Sidebar.tsx:67-86`
- `frontend/src/app/(dashboard)/audit/charter/page.tsx`
