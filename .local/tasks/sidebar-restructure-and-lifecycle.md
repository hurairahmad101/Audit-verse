# Sidebar Restructure & Audit Lifecycle Landing Page

## What & Why
The current Audit Management sidebar is a flat 18-item list with no governance hierarchy — Charter sits at position 11 and there is no Audit Committee at all. The order does not match how internal audit actually works (IIA / IPPF). This task restructures the sidebar into collapsible governance-aligned groups and replaces the bare `/audit` landing page with a visual `Audit Lifecycle` map that shows the full IIA flow with each stage clickable.

## Done looks like
- Sidebar Audit Management section is now a collapsible tree with five groups in this order:
  - **Governance** — Charter, Audit Committee, Skill Matrix, Capacity Planning
  - **Planning** — Audit Universe, Annual Audit Plans
  - **Execution** — Engagements, Workpapers, Test Scripts, Findings, Issue Tracking
  - **Continuous Activities** — CCM, Surveys, Document Repository, External Auditor Portal
  - **Reporting & Quality** — Analytics, Reporting, QAIP, Notifications
- Each group can be collapsed/expanded with chevron icons; the group containing the current page auto-expands on navigation
- Group headers are styled distinctly (caps label, divider line) so the tiering is immediately visible
- The `/audit` landing page is replaced with an `Audit Lifecycle` map: a horizontal flow diagram showing the five tiers (Governance → Planning → Execution → Continuous → Reporting) with each module rendered as a clickable card grouped under its tier
- Lifecycle map shows mini metrics per tier (e.g. Governance: Charter status, last Committee meeting; Planning: Universe count, active plans; Execution: open engagements, open findings)
- Mobile-responsive: groups still collapse, lifecycle map stacks tiers vertically on narrow screens

## Out of scope
- Per-user sidebar customization (drag-to-reorder, hide items)
- Permission-based hiding of items beyond what already exists
- Animated lifecycle walk-through (the existing in-app demo tour at `/demo` covers the narrative)
- Renaming or removing any existing modules — only reordering and grouping

## Steps
1. **Sidebar refactor** — Convert the flat Audit Management list into a grouped structure with collapse/expand state stored in localStorage. Add the new `Audit Committee` link under the Governance group (relies on the committee module existing).
2. **Group styling** — Add caps labels and dividers between groups; auto-expand the group whose item matches the current route.
3. **Lifecycle landing page** — Build a new `/audit` page that renders the five-tier visual map. Each tier is a horizontal band with a label, icon, and a row of module cards.
4. **Tier metrics** — Each tier card shows a 1–2 line live metric pulled from the relevant API (Charter status, open findings, etc.). Loading and empty states handled.
5. **Responsive layout** — Lifecycle map degrades to a vertical stack on screens below `md`. Sidebar groups remain collapsible on mobile.

## Architectural constraints
- Depends on the Audit Committee module existing so the sidebar link resolves to a real page.
- Depends on the Charter Enhancements task because the Governance tier metric for Charter shows version status and next-review-due — both come from that task.
- Use existing `lucide-react` icons; pick ones that visually distinguish the five tiers (e.g. ShieldCheck for Governance, Map for Planning, ClipboardList for Execution, Activity for Continuous, BarChart3 for Reporting).
- Keep the existing single-list fallback behavior accessible via keyboard — no module should become unreachable.

## Relevant files
- `frontend/src/components/layout/Sidebar.tsx:67-86`
- `frontend/src/app/(dashboard)/audit/page.tsx`
- `frontend/src/lib/api.ts`
