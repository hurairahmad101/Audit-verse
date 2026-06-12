---
name: Audit dark→light theming
description: How the dark-built audit module stays readable on the light platform surface, and the cascade pitfalls.
---

The `/audit/*` pages (frontend) were authored for a DARK theme — text-white,
text-slate-50/100/200/300/400, bg-slate-700/800/900 plus heavy use of alpha
variants (e.g. bg-slate-900/60, border-slate-700/60) and hover variants. They
now render on the LIGHT platform surface (parent `.platform-ui` wrapper from
`(dashboard)/layout.tsx`).

**Rule:** readability is provided by the `.audit-light` conversion block in
`frontend/src/app/globals.css`, which MUST be applied at the audit layout
(`(dashboard)/audit/layout.tsx`, wrapper class `audit-light ...
!bg-[var(--color-subtle)]`). The `!` is required because `.audit-light{
background:#fff }` would otherwise win the canvas background on source order.

**Why attribute selectors, not enumerated classes:** the pages use too many
shade/alpha/prefix combinations to enumerate reliably. The block uses
`[class*="bg-slate-6|7|8|9"]`, `[class*="border-slate-5..9"]`,
`[class*="hover:bg-slate-"]:hover`, `[class*="hover:text-slate-"]:hover`, and
`[class*="group-hover:text-white"]`. The `bg-`/`border-` prefix in the
substring keeps these from matching `from-slate-*`/`to-slate-*` gradients or
`text-slate-*`.

**Cascade facts:** `.audit-light .x` (0,2,0) beats `.platform-ui :where(...)`
(0,1,0) and the global unscoped `.text-white` (0,1,0), all with `!important`.
Tailwind's generated hover/group-hover variant utilities are NON-important, so
`.audit-light [...] !important` overrides them regardless of their specificity.
Hover bg rule is `:hover` (0,3,0) so it beats the base bg conversion (0,2,0) and
hover feedback survives even though hover classes also match the base rule.

**How to apply:** keep the colored-button/badge white-text safelist
(`.audit-light .bg-blue-600.text-white` etc.) and the `bg-slate-700/800.text-white`
chip rule intact — they preserve intentional white text / convert dark chips.
Admin and ComplyChat are light-built (only use text-white on colored buttons) —
do NOT wrap them in `.audit-light`; it risks regressions. Modals in audit are
inline `fixed inset-0` (no React portals), so they stay inside `.audit-light`.
