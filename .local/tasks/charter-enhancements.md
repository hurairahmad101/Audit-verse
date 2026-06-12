# Charter Enhancements & Lifecycle

## What & Why
The Audit Charter is the foundation of the Internal Audit function — it defines IA's purpose, authority, independence, and scope (IIA Standard 1000). Today it exists only as a single-document page buried in the sidebar. This task elevates the Charter into a versioned, governance-grade artifact that is reviewed annually, approved by the Audit Committee, and traceable down to the audit activities that fulfill it. The Audit Committee module (companion task) supplies the approval body.

## Done looks like
- Versioned Charter: every save creates a new version with author, timestamp, change reason; old versions remain viewable
- Side-by-side diff view between any two versions (added text in green, removed text in red, line-level changes highlighted)
- Annual review workflow: each Charter version has a `next_review_due` date; when due, an in-app notification fires and the CAE can submit it to the Audit Committee for re-approval
- Submission status timeline: Draft → Submitted to Committee → Under Review → Approved / Rejected → Active
- Independence attestation: CAE submits an annual independence attestation (form with declarations, signed digitally); attestations are listed with date and status
- Charter template library: pre-built IIA-aligned templates for BFSI, Healthcare, Government, and Generic Enterprise; user can clone a template into a new Charter version
- Charter-to-activity traceability: each Charter clause can be tagged with an ID, and Engagements / Audit Plans can reference the clause IDs they fulfill; a coverage view shows which clauses have audit activity backing them
- AI Charter drafting assistant: given an organization profile (sector, size, regulatory scope) and a chosen template, AI generates a first-draft Charter that the user can edit before saving as v1

## Out of scope
- Public/external publication of the Charter (no public URL)
- Charter translation into multiple languages
- E-signature platform integration — internal digital sign-off is sufficient
- Automated extraction of clauses from PDF uploads (the user pastes or types content into the structured editor)

## Steps
1. **Backend: data model** — Add `CharterVersion`, `CharterClause`, `IndependenceAttestation`, `CharterTemplate` models. Existing `charter.py` router likely holds a flat single-record model — extend, don't replace, to keep migration safe.
2. **Backend: API** — Endpoints for version create / list / get / diff, submit-for-approval (creates a `CommitteeApproval` record from the companion task), independence attestation create / list, template list / clone, AI-draft generation.
3. **Backend: AI draft endpoint** — Uses organization profile + selected template to generate a structured Charter draft (sections + clauses). Falls back to returning the raw template when AI is unavailable.
4. **Backend: clause traceability** — Add a join table linking `CharterClause` to `Engagement` and `AnnualAuditPlan`. Expose a coverage endpoint that returns clauses with their linked activities.
5. **Frontend: charter workspace** — Replace flat charter page with a workspace: left rail of versions (badged with status), main panel shows the active version with section / clause editor.
6. **Frontend: diff view** — Side-by-side or unified diff between two selected versions using a lightweight diff library; highlight changes at the line level.
7. **Frontend: submit & status** — Submit-for-approval action that creates the committee approval and shows a horizontal status timeline. Approval result reflects back into the version status.
8. **Frontend: independence attestation** — Annual attestation form, history list with status, overdue indicator.
9. **Frontend: template library** — Browse templates by sector, preview, clone into a new version. AI-draft button on the new-version flow.
10. **Frontend: traceability view** — A `Charter Coverage` tab showing each clause with linked engagements / plan items and a "no coverage" warning.

## Architectural constraints
- Approval workflow integrates with the Audit Committee module — when CAE submits a version, a `CommitteeApproval` record is created targeting the version id. UI here only triggers submission and reads back status; the approval lives in committee-side workflows.
- AI assistant degrades gracefully when OpenAI is unavailable.
- Diff computation runs client-side to keep backend responsibilities narrow.
- Independence attestation is its own audit trail — each attestation is immutable once submitted.

## Relevant files
- `backend/grc/modules/audit_management/routers/charter.py`
- `backend/grc/modules/audit_management/routers/__init__.py`
- `frontend/src/app/(dashboard)/audit/charter/page.tsx`
- `frontend/src/lib/api.ts`
