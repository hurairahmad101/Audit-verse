# Fix Unreadable White-On-White Text

## What & Why
Text across the logged-in platform (audit, admin, ComplyChat) renders in light/white colors on white backgrounds, making it unreadable. The internal pages were originally built for a dark theme (`text-white`, `text-slate-100/200/300`, `bg-slate-900/800/700`), but the app now renders on a light surface. A theme-conversion system already exists in `globals.css` (the `.audit-light` block) that correctly converts dark-built markup to readable dark-on-light — including keeping white text on colored buttons. The bug is that this conversion is not actually applied to the pages: the audit layout wraps content in a dark slate background without the conversion class, and the global `platform-ui` overrides do not convert `text-white` / `text-slate-100/200/300`, so light text survives on the white surface.

## Done looks like
- Every logged-in page (all `/audit/*` pages, `/admin` and its sub-pages, `/complychat`) shows readable dark text on light backgrounds.
- Headings, body text, table cells, labels, and helper text are all legible — no white or near-white text on white/light surfaces.
- White text is preserved where it belongs: on solid colored buttons and badges (e.g. primary/blue, success/green, danger/red, gradient buttons).
- Inputs, selects, and textareas show dark text with visible borders and readable placeholders.
- The login page (already correct) is unchanged.

## Out of scope
- No redesign or restyling beyond fixing contrast/readability.
- No change to the color palette or brand tokens.
- No backend changes.

## Steps
1. **Apply the light-theme conversion to the audit module** — Make the audit section actually use the existing dark-to-light conversion wrapper instead of rendering on a raw dark background, so all audit pages convert to readable dark-on-light.
2. **Apply the same conversion to the remaining dark-built modules** — Ensure the admin pages (users, roles, audit-logs, organization) and the ComplyChat page receive the same conversion wrapper so their light text becomes readable too.
3. **Generalize / verify the conversion rules cover all cases** — Confirm the conversion handles `text-white`, `text-slate-100/200/300`, and `bg-slate-950` (the audit layout's own background), and that colored buttons/badges keep their white text. Extend the conversion block where a case is missing rather than editing individual pages.
4. **Verify across modules** — Log in to the demo tenant and visually confirm readability on representative pages in each module (audit dashboard plus a few sub-pages, admin, ComplyChat), checking tables, forms, cards, and buttons.

## Notes / constraints
- Prefer fixing at the theme/layout level (a few shared selectors and layout wrappers) over editing all 28+ page files individually. The conversion machinery already exists and is comprehensive — the primary defect is that it is not being applied.
- Key tokens: `--color-surface: #FFFFFF`, `--color-text: #1A1A1A`, `--color-text-inverse: #FFFFFF`. Note the global rule that forces `.text-white` to `--color-text-inverse` (white) is what keeps stray light text white on light surfaces.

## Relevant files
- `frontend/src/app/globals.css:587-715`
- `frontend/src/app/globals.css:717-830`
- `frontend/src/app/(dashboard)/audit/layout.tsx`
- `frontend/src/app/(dashboard)/layout.tsx`
- `frontend/styles/tokens.css`
