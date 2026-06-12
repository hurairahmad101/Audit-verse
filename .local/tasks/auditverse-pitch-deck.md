# AuditVerse.AI Steve Jobs-Style Pitch Deck + In-App Demo

## What & Why
Build a cinematic, Steve Jobs-style sales pitch deck for AuditVerse.AI as a slides artifact, plus an in-app guided demo tour page. Universal pitch across banking, healthcare, energy, and government. Three-act Steve Jobs structure: Pain → Revolution → The World.

## Done looks like
- A 12-slide polished slides artifact visible on the canvas with a dark, premium aesthetic
- An in-app guided demo tour at `/demo` with step-by-step callouts for each key module
- "Demo Tour" link added to the sidebar under Audit Management

## Out of scope
- Named competitor comparisons
- Changing existing page layouts or functionality
- Animations or video embeds in slides

## Design Direction
- Background: #0A0A0F (near-black)
- Accent: #2563EB (electric blue)
- Pain slides accent: #DC2626 (red) or #F59E0B (amber)
- Text: white / #F8FAFC
- Display font: Montserrat ExtraBold (Google Fonts)
- Body font: Inter
- Style: Apple Keynote-like — massive headline, minimal words, one big visual or stat per slide. No bullet-point soup.

## Confirmed Slide Content (12 slides)

### Act 1 — The Problem (Slides 1–4)
**Slide 1:** "The world has an audit problem." / "And nobody has solved it. Until now."
**Slide 2:** "$14.8 billion in regulatory fines. Last year alone." / "Banks. Hospitals. Energy firms. Government agencies. All paying the price for audit failures they never saw coming."
**Slide 3:** "Your audit team is running on spreadsheets." / "Hundreds of hours. Thousands of cells. One version conflict away from a material finding."
**Slide 4:** "Zero real-time visibility." / "By the time leadership sees the risk, the auditors are already six months behind."

### Act 2 — The Revolution (Slides 5–10)
**Slide 5:** "Today, we change everything." / "Introducing AuditVerse.AI" — This is the product reveal. Big, centered, electric blue glow treatment.
**Slide 6:** "Know what to audit. Before the regulator does." / "AI-powered Audit Universe maps every auditable entity across your organization — scored, ranked, and ready. Annual plans generated in minutes, not months."
**Slide 7:** "Run engagements your team actually loves." / "From planning to fieldwork to reporting — one connected workflow. AI writes the fieldwork guide. Your team executes it."
**Slide 8:** "Every finding. Every action. Fully tracked." / "CCCE documentation. Severity calibration. Multi-level escalation. Nothing falls through the cracks."
**Slide 9:** "60+ compliance frameworks. Built in." / "GDPR. HIPAA. SOX. ISO 27001. Basel III. DORA. NIS2. NERC-CIP. GRI. TCFD. Switch industries. The frameworks come with you."
**Slide 10:** "Your smartest auditor never sleeps." / "AI that drafts findings, calibrates risk, generates reports, and answers compliance questions in plain English."

### Act 3 — The World (Slides 11–12)
**Slide 11:** "Built for every industry that can't afford to fail." — Quadrant layout: Banking & Financial Services (SOX, DORA, Basel III, PCI-DSS) / Healthcare (HIPAA, FDA 21 CFR Part 11, ISO 9001) / Energy & Utilities (NERC-CIP, ISO 50001, IEC 62443) / Government & Public Sector (FISMA, FedRAMP, NIST 800-53)
**Slide 12:** "One more thing." / "AuditVerse.AI doesn't just manage audits. It makes audit teams unstoppable. The future of audit starts now." — Closing slide with website/CTA feel, centered, premium.

## Steps
1. **Scaffold slides artifact** — Create a new slides artifact using the slides skill. Set up `index.html` with Montserrat + Inter from Google Fonts, `index.css` with the dark palette CSS variables, and all 12 slide `.tsx` files plus `slides-manifest.json` in one parallel batch.
2. **Build Act 1 slides (1–4)** — Dark background with red/amber accent tones. Slide 1: centered title treatment. Slides 2–4: large dramatic stat or statement as the hero element, supported by 1-2 lines of copy below. Stark, uncomfortable visual weight — these slides should feel like a gut punch.
3. **Build Act 2 slides (5–10)** — Slide 5 is the reveal: "Today, we change everything." centered with an electric blue glow/radial gradient. Slides 6–10 each feature the product pillar headline large, body copy below, and a subtle electric blue accent bar or geometric shape to add visual interest.
4. **Build Act 3 slides (11–12)** — Slide 11: 2×2 quadrant grid layout with industry names and their frameworks listed cleanly. Slide 12: full-bleed dark, centered "One more thing." in a large italic or display treatment, closing copy below, and "AuditVerse.AI" as a final brand lockup.
5. **Validate and embed on canvas** — Run `validate-slides`, restart the slides workflow, take a screenshot, and embed the artifact on the canvas as an iframe.
6. **Build in-app demo tour page** — Create `frontend/src/app/(dashboard)/demo/page.tsx` with a step-by-step guided tour UI (8 steps covering: Overview, Universe, Plans, Engagements, Workpapers, Findings, Analytics, Frameworks). Each step shows the module name, a bold callout headline, a description of what's visible on that screen, and a "Go to this page →" link. Include Previous / Next / Exit Demo navigation and a progress bar. Style with the AuditVerse.AI dark/blue theme.
7. **Add Demo Tour to sidebar** — Add a `{ name: 'Demo Tour', href: '/demo', icon: PlayCircle }` entry to the Audit Management nav group in `Sidebar.tsx`.

## Relevant files
- `frontend/src/components/layout/Sidebar.tsx`
- `frontend/src/app/(dashboard)/audit/page.tsx`
