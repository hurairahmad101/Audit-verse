---
title: Match all audit pages to landing UI
---
# Audit Subpages Dark Redesign

## What & Why
The new `/audit` landing page uses a dark navy dashboard aesthetic (`bg-slate-950` shell, slate-900/800 surfaces, slate-700 borders, white/slate-200 type, indigo/emerald/amber accents) that matches the sidebar. All other pages under the Audit Management section still use the old light slate/white theme (or a few inconsistent dark variants like Charter/Committee/Portal), which makes the app feel broken and inconsistent once a user clicks into any module. Rework every audit subpage so the entire Audit Management section shares one cohesive dark UI language.

## Done looks like
- Every page under `/audit/*` (Universe, Plans, Engagements, Workpapers, Findings, Issues, Surveys, Documents, Analytics, Portal, Charter, CCM, Reporting, QAIP, Test Scripts, Skill Matrix, Capacity, Notifications, Committee, TLOD) renders on the same dark navy shell as the landing page, with no light-mode panels left behind.
- Shared visual primitives are consistent across pages: page header (title + subtitle + actions), surface card style, table/list style, badge/pill style, form inputs, buttons (primary indigo, secondary slate-outline, danger), tabs, modals/dialogs, empty states, loading skeletons.
- Charts and data visualizations on Analytics, CCM, Reporting, QAIP, Capacity, Skill Matrix, and TLOD use dark-friendly colors (light text, transparent grids, accent-on-dark series).
- Navigation between the landing page and any subpage feels seamless — no jarring background flash, no light cards inside the dark shell.
- Sidebar, top chrome, and the dashboard layout wrapper are unchanged.
- No backend changes; all existing data, filters, and actions on each page continue to work.

## Out of scope
- Changes outside `/audit/*` (Admin, ComplyChat, Login, Demo).
- Restructuring the sidebar or the dashboard layout shell.
- Adding new modules, new routes, or new backend endpoints.
- Functional refactors of existing forms, mutations, or business logic — this is a visual/styling pass only.
- A full design-token / Tailwind theme system overhaul; we standardize via shared component classes, not by reworking `globals.css` tokens.

## Steps
1. **Define the shared dark visual kit.** Codify the design language used by the landing page (shell background, surface card, border, type scale, accent colors, focus ring) as a small set of reusable component variants or class strings. Audit shared primitives (`PageHeader`, `StatCard`, `DataCard`, `DataTable`, `FilterBar`, `Breadcrumb`, badges, buttons, inputs, modals) and add dark-themed variants where missing. Keep the existing API of these components stable.
2. **Convert the already-darkish pages first.** Bring Charter, Committee, and Portal fully in line with the new kit so they stop using their own ad-hoc zinc/slate-800 styling. These act as the reference for the rest of the conversion.
3. **Convert the management/list pages.** Universe, Plans, Engagements, Workpapers, Findings, Issues, Surveys, Documents, Notifications, Test Scripts — apply the dark shell, restyle headers, tables/cards, filters, status pills, modals, and empty/loading states.
4. **Convert the analytics/insight pages.** Analytics, CCM, Reporting, QAIP, Capacity, Skill Matrix, TLOD — apply the dark shell and re-skin charts (axes, gridlines, tooltips, legends, color palette) so they read well on dark navy.
5. **Cross-page polish pass.** Walk every audit route, fix any leftover light backgrounds, white cards, low-contrast text, dark-on-dark icons, or broken focus states. Verify keyboard focus, hover states, and responsive behavior at sm/md/lg.

## Relevant files
- `frontend/src/app/(dashboard)/audit/page.tsx`
- `frontend/src/app/(dashboard)/audit/universe/page.tsx`
- `frontend/src/app/(dashboard)/audit/plans/page.tsx`
- `frontend/src/app/(dashboard)/audit/engagements/page.tsx`
- `frontend/src/app/(dashboard)/audit/workpapers/page.tsx`
- `frontend/src/app/(dashboard)/audit/findings/page.tsx`
- `frontend/src/app/(dashboard)/audit/issues/page.tsx`
- `frontend/src/app/(dashboard)/audit/surveys/page.tsx`
- `frontend/src/app/(dashboard)/audit/documents/page.tsx`
- `frontend/src/app/(dashboard)/audit/analytics/page.tsx`
- `frontend/src/app/(dashboard)/audit/portal/page.tsx`
- `frontend/src/app/(dashboard)/audit/charter/page.tsx`
- `frontend/src/app/(dashboard)/audit/ccm/page.tsx`
- `frontend/src/app/(dashboard)/audit/reporting/page.tsx`
- `frontend/src/app/(dashboard)/audit/qaip/page.tsx`
- `frontend/src/app/(dashboard)/audit/test-scripts/page.tsx`
- `frontend/src/app/(dashboard)/audit/skill-matrix/page.tsx`
- `frontend/src/app/(dashboard)/audit/capacity/page.tsx`
- `frontend/src/app/(dashboard)/audit/notifications/page.tsx`
- `frontend/src/app/(dashboard)/audit/committee/page.tsx`
- `frontend/src/app/(dashboard)/audit/tlod/page.tsx`
- `frontend/src/app/(dashboard)/layout.tsx`
- `frontend/src/components/ui`
- `frontend/src/components/layout/Sidebar.tsx`