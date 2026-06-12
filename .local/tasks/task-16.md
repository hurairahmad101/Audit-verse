---
title: Redesign Audit Lifecycle landing page
---
# Redesign Audit Lifecycle landing page

## What & Why
The current `/audit` landing page is hard to read: tinted band backgrounds wash out the cards, white H1 text disappeared on a light background, the metric tiles look disabled, and there is no live signal at the top of the page. Redesign the page as a proper dashboard that matches the dark sidebar, with high-contrast cards and live KPIs at the top. Sidebar must not change.

## Done looks like
- Visiting `/audit` shows a dark, modern dashboard whose background and surface tones match the sidebar (deep navy/slate).
- A KPI strip sits at the top of the page with at least: Open Engagements, Overdue Findings, Charter Status (version + due-for-review count), and Assurance Gaps. Each KPI is a real number pulled from the backend; loading and empty states render cleanly without "0/0" looking broken.
- The 5 audit stages (Governance, Planning, Execution, Continuous Activities, Reporting & Quality) remain stacked sections in the same order as today, but the tinted band backgrounds are removed; each section uses a clean dark surface with a colored stage badge and a subtle divider.
- Each module card shows: stage-colored icon, module name, one-line description, and one small live metric (e.g. Charter "v99.0 · approved", Audit Universe "0 entities · 0 high/critical", Findings "3 open", Capacity "2 auditors free this month"). Cards are fully clickable, have hover/focus states, and clearly readable text contrast (no greyed-out look).
- Header keeps both top-right actions: "Operational Dashboard" (secondary) and "New Engagement" (primary). The eyebrow + title + blurb are all readable on the dark background.
- Page is responsive: KPI strip wraps to 2 columns on tablet and 1 on mobile; module grids reflow to 2 columns then 1.
- Left sidebar is unchanged (no edits to `Sidebar.tsx`, layout, or navigation).
- No new API endpoints required — reuse what the existing dashboard tiles already fetch.

## Out of scope
- Sidebar / global layout / navigation changes.
- Building a separate "/audit/dashboard" page (the existing operational dashboard link stays as-is).
- Any backend changes; if a metric isn't already exposed by an existing endpoint, render a placeholder dash ("—") instead of adding APIs.
- Redesign of any sub-pages (Universe, Plans, Engagements, etc.).
- Light-mode variant.

## Steps
1. **Theme + page shell** — Replace the current page background and section "band" wrappers with a dark surface that visually continues the sidebar. Fix the eyebrow / H1 / blurb colors so they are readable on dark. Keep the two top-right buttons; restyle "Operational Dashboard" as a secondary dark button so it doesn't fade into the page.
2. **KPI strip** — Add a 4-tile KPI strip directly under the header. Wire each tile to the existing data sources currently used by TierMetrics and the operational dashboard summary (engagements, findings, charter, 3LoD summary). Show a small skeleton while loading and a dash when a value is unavailable. Make KPI tiles wrap responsively.
3. **Stage sections** — Keep stacked Governance → Planning → Execution → Continuous → Reporting sections, but drop the tinted band backgrounds. Each section shows a colored stage badge (Tier N), stage name, and a one-line blurb on a clean dark surface.
4. **Module cards** — Rebuild the module card so it shows icon + name + description + one live metric line in a high-contrast dark card with hover and focus states. Define the metric source per module (Charter version, Universe counts, Plans count, Engagements open count, Findings open count, Issues overdue, Capacity availability, etc.) and only show the metric when its data has loaded — otherwise show "—".
5. **Responsive + a11y pass** — Verify the page at desktop / tablet / mobile widths, ensure keyboard focus rings are visible, color contrast passes for body text and badges, and the assurance-gap badge that already lives on the Plans page still renders correctly after the restyle.

## Relevant files
- `frontend/src/app/(dashboard)/audit/page.tsx`
- `frontend/src/lib/api.ts`
- `frontend/src/app/(dashboard)/audit/plans/page.tsx`
- `frontend/src/components/layout/Sidebar.tsx`