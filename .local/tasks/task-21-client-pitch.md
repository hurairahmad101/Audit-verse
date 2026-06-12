# Client Pitch Deck + Brochure

## What & Why
Build a client-facing presentation of ComplyVerse that walks a mixed
audience (execs + audit practitioners + IT evaluators) through the
business problem in audit operations today and how every audit module
in the platform solves it. Two deliverables:

1. **Slide deck (PPTX + PDF export)** — one section per audit module,
   with problem → solution → real screenshot → 2-line feature copy.
   Used in live demos and shared as a leave-behind.
2. **One-page visual brochure (PDF)** — dense exec summary covering
   the whole platform on a single page (or two-page spread), suitable
   as an email attachment or print handout.

Both share the ComplyVerse dark navy visual identity (slate-950 shell,
slate-900/60 cards, slate-700 borders, white/slate-200 type, blue/
emerald/amber accents) so the marketing collateral feels native to the
product the client will see when they log in.

## Done looks like
- A polished slide deck covering all 17 audit modules — Universe,
  Plans, Engagements, Workpapers, Findings, Issues, Surveys,
  Documents, Analytics, Portal, Charter, CCM, Reporting, QAIP,
  Test Scripts, Skill Matrix, Capacity — plus opening (problem
  landscape), closing (ROI + business case), and CTA slides.
- Each module slide answers four questions: what's the business pain
  today, how ComplyVerse solves it, what the feature actually looks
  like (real screenshot), and a 2-line feature description.
- Tone is balanced for a mixed room: outcomes/ROI for execs, workflow
  detail for practitioners, brief security/architecture callouts for
  IT.
- A one-page visual brochure PDF that summarizes the same story at a
  glance — module grid with mini-screenshots and one-line value
  statements, plus a "ComplyVerse in numbers" strip.
- All screenshots are captured from the live app *after* it has been
  populated with realistic seed data (audit universe entries, plans,
  engagements with budget/actual hours, workpapers, findings of mixed
  severity, issues at multiple escalation levels, completed surveys,
  documents, analytics with real numbers, charter, CCM tests, QAIP
  records, committee minutes, skill matrix entries, capacity entries).
- Deck and brochure are exportable to PPTX and PDF and presented as
  downloadable files at the end of the task.
- Visual style matches the in-product dark navy theme.

## Out of scope
- Custom client branding (using ComplyVerse dark theme only this round).
- Localization / non-English versions.
- Live website hosting (no /tour route — that was Option B and was
  not selected).
- In-app guided tour overlay (Option C — not selected).
- Backend or product feature changes; this is collateral only,
  although a one-time seed-data script will be added to make the
  screenshots look realistic.

## Steps
1. **Seed realistic demo data** — Add a one-off seed script that
   populates every audit module with believable, screenshot-ready
   records (no Lorem Ipsum). Keep it idempotent and clearly labeled
   as demo data so it can be re-run or wiped. Run it against the
   local dev database before capturing screenshots.
2. **Capture screenshots** — Take a high-resolution screenshot of each
   of the 17 audit module pages plus the audit landing page, after
   seed data is in place. Save them under a dedicated assets folder
   so the deck and brochure both reference the same source files.
3. **Build the slide deck** — Cover slide, problem-landscape slide,
   one slide per module (problem / solution / screenshot / 2-line
   copy), one ROI / business-case slide (time saved, audit cycle
   reduction, finding closure rate, assurance coverage), and a
   closing CTA slide. Apply the ComplyVerse dark navy theme to every
   slide.
4. **Build the one-page brochure** — Dense single-page (or two-page
   spread) PDF with a module grid, mini-screenshots, one-line value
   statement per module, a "ComplyVerse in numbers" strip, and contact
   block. Same dark navy styling.
5. **Export and present** — Export the deck as PPTX and PDF, the
   brochure as PDF, and surface all three files as downloadable
   assets at the end of the task.

## Relevant files
- `frontend/src/app/(dashboard)/audit/page.tsx`
- `frontend/src/app/(dashboard)/audit/layout.tsx`
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
- `frontend/src/app/(dashboard)/audit/committee/page.tsx`
- `frontend/src/app/(dashboard)/audit/tlod/page.tsx`
- `backend/grc/seed_frameworks.py`
- `backend/grc/main.py`
- `backend/main.py`
