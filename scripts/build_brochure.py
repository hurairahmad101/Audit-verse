"""AuditVerse.AI one-page brochure (PDF, US Letter landscape).

Single page, AuditVerse.AI dark navy theme. Mirrors the deck:
header + value prop, 17-module grid, ROI strip, contact strip.
"""
from __future__ import annotations

from pathlib import Path

from reportlab.lib.pagesizes import landscape, LETTER
from reportlab.lib.colors import HexColor
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

# ---- Theme ----
BG          = HexColor("#020617")
PANEL       = HexColor("#0F172A")
PANEL_SOFT  = HexColor("#121B32")
BORDER      = HexColor("#1F2A44")
BORDER_SOFT = HexColor("#18223A")
WHITE       = HexColor("#F8FAFC")
SLATE_300   = HexColor("#CBD5E1")
SLATE_400   = HexColor("#94A3B8")
SLATE_500   = HexColor("#64748B")
BLUE        = HexColor("#3B82F6")
EMERALD     = HexColor("#10B981")
AMBER       = HexColor("#F59E0B")
RED         = HexColor("#EF4444")
PURPLE      = HexColor("#A85CF6")
CYAN        = HexColor("#06B6D4")

W, H = landscape(LETTER)  # 792 x 612 pts

# ---------- Helpers ----------
def fill_rect(c, x, y, w, h, color):
    c.setFillColor(color)
    c.setStrokeColor(color)
    c.rect(x, y, w, h, stroke=0, fill=1)


def panel(c, x, y, w, h, *, fill=PANEL, border=BORDER, radius=6, border_w=0.6):
    c.setFillColor(fill)
    c.setStrokeColor(border)
    c.setLineWidth(border_w)
    c.roundRect(x, y, w, h, radius, stroke=1, fill=1)


def text(c, x, y, s, *, font="Helvetica", size=9, color=WHITE):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawString(x, y, s)


def text_right(c, x, y, s, *, font="Helvetica", size=9, color=WHITE):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawRightString(x, y, s)


def text_center(c, x, y, s, *, font="Helvetica", size=9, color=WHITE):
    c.setFillColor(color)
    c.setFont(font, size)
    c.drawCentredString(x, y, s)


def wrap_lines(c, x, y, s, *, font="Helvetica", size=8, color=SLATE_300,
               max_w=200, leading=10):
    c.setFillColor(color)
    c.setFont(font, size)
    words = s.split()
    line = ""
    cy = y
    for w in words:
        test = (line + " " + w).strip()
        if c.stringWidth(test, font, size) > max_w and line:
            c.drawString(x, cy, line)
            cy -= leading
            line = w
        else:
            line = test
    if line:
        c.drawString(x, cy, line)
    return cy


# ---------- Layout ----------
def build():
    out = Path("assets/pitch")
    out.mkdir(parents=True, exist_ok=True)
    pdf_path = out / "AuditVerse.AI_Brochure.pdf"
    c = canvas.Canvas(str(pdf_path), pagesize=landscape(LETTER))

    # Background
    fill_rect(c, 0, 0, W, H, BG)

    # ---- Top header band ----
    band_h = 90
    fill_rect(c, 0, H - band_h, W, band_h, PANEL)
    fill_rect(c, 0, H - band_h - 1, W, 1, BORDER)

    # Eyebrow + brand
    text(c, 36, H - 32, "AUDITVERSE.AI", font="Helvetica-Bold", size=10,
         color=BLUE)
    text(c, 36, H - 60, "The audit platform that actually ships findings.",
         font="Helvetica-Bold", size=22, color=WHITE)
    text(c, 36, H - 82,
         "One workspace for the audit lifecycle — universe to engagement, "
         "workpaper to finding, escalation to closure.",
         font="Helvetica", size=10, color=SLATE_400)
    text_right(c, W - 36, H - 32, "Client Briefing  ·  May 2026",
               font="Helvetica", size=9, color=SLATE_400)
    text_right(c, W - 36, H - 60, "auditverse.ai",
               font="Helvetica-Bold", size=12, color=WHITE)
    text_right(c, W - 36, H - 78, "pilot@auditverse.ai",
               font="Helvetica", size=9, color=SLATE_400)

    # ---- Module grid ----
    grid_top = H - band_h - 24
    text(c, 36, grid_top, "SEVENTEEN MODULES, ONE WORKSPACE",
         font="Helvetica-Bold", size=9, color=SLATE_500)
    grid_top -= 14

    modules = [
        ("Universe",     "Risk-rated map of every auditable entity.",     BLUE),
        ("Plans",        "Risk-based annual planning + multi-year roll.",  BLUE),
        ("Engagements",  "Standard scope, hours, milestones — every time.", BLUE),
        ("Workpapers",   "Structured tests, evidence, 4-stage sign-off.",   AMBER),
        ("Findings",     "AI-drafted CCCE structure, calibrated severity.", RED),
        ("Issues",       "Aging buckets + auto 3-level escalation.",        RED),
        ("Surveys",      "Pre/post-audit + CSA, AI-generated questions.",  PURPLE),
        ("Documents",    "Single repository with confidentiality flags.",   CYAN),
        ("Analytics",    "Coverage, velocity, closure — live, sliceable.",  EMERALD),
        ("Portal",       "Scoped, expiring read-only access for Big-4.",   PURPLE),
        ("Charter",      "Versioned charter with committee approval.",      CYAN),
        ("CCM",          "Daily controls testing → findings backlog.",      EMERALD),
        ("Reporting",    "One-click branded committee pack.",                BLUE),
        ("QAIP",         "IIA-aligned KPIs + EQA history.",                  AMBER),
        ("Test Scripts", "184 reusable, framework-mapped procedures.",      AMBER),
        ("Skill Matrix", "Competency × seniority gap detection.",          PURPLE),
        ("Capacity",     "Hours planned vs. available, forecast 2 quarters.", PURPLE),
    ]
    cols = 6
    margin = 36
    gap_x = 8
    gap_y = 8
    grid_h_total = 300
    grid_w_total = W - 2 * margin
    cell_w = (grid_w_total - (cols - 1) * gap_x) / cols
    rows = 3
    cell_h = (grid_h_total - (rows - 1) * gap_y) / rows

    pad = 6
    thumb_w = cell_w - 2 * pad
    thumb_h = thumb_w / 1.6  # screenshot aspect 1600x1000

    shots_dir = Path("assets/pitch/screenshots")

    for i, (name, desc, col) in enumerate(modules):
        r = i // cols
        ccol = i % cols
        x = margin + ccol * (cell_w + gap_x)
        y = grid_top - cell_h - r * (cell_h + gap_y)
        panel(c, x, y, cell_w, cell_h, fill=PANEL, border=BORDER, radius=4)

        # ---- Thumbnail (real product screenshot) ----
        slug = name.lower().replace(" ", "-")
        shot = shots_dir / f"{slug}.png"
        thumb_x = x + pad
        thumb_y = y + cell_h - pad - thumb_h
        if shot.exists():
            try:
                c.drawImage(str(shot), thumb_x, thumb_y,
                            width=thumb_w, height=thumb_h,
                            preserveAspectRatio=True, anchor="c", mask="auto")
            except Exception:
                fill_rect(c, thumb_x, thumb_y, thumb_w, thumb_h, BORDER)
        else:
            fill_rect(c, thumb_x, thumb_y, thumb_w, thumb_h, BORDER)
        # subtle frame around thumbnail
        c.setStrokeColor(BORDER_SOFT)
        c.setLineWidth(0.4)
        c.rect(thumb_x, thumb_y, thumb_w, thumb_h, stroke=1, fill=0)

        # accent stripe under thumbnail
        fill_rect(c, x, thumb_y - 3, cell_w, 2, col)

        # number + name (in the strip below the thumbnail)
        text(c, x + pad, y + pad + 6,
             f"{i+1:02d}", font="Helvetica-Bold", size=7, color=SLATE_500)
        text(c, x + pad + 16, y + pad + 6, name,
             font="Helvetica-Bold", size=9, color=WHITE)

    # ---- ROI strip (just below grid) ----
    grid_bottom = grid_top - rows * cell_h - (rows - 1) * gap_y
    roi_y = grid_bottom - 86
    panel(c, margin, roi_y, W - 2 * margin, 76,
          fill=PANEL_SOFT, border=BORDER_SOFT, radius=4)
    text(c, margin + 14, roi_y + 60, "WHAT IT MEANS IN NUMBERS",
         font="Helvetica-Bold", size=9, color=SLATE_500)
    stats = [
        ("40%", "less cycle time per engagement", EMERALD),
        ("60%", "less admin in audit hours", BLUE),
        ("3x",  "fresher audit-committee data", PURPLE),
        ("100%", "evidence retrievability", AMBER),
    ]
    avail_w = W - 2 * margin - 28
    each = avail_w / len(stats)
    for i, (val, lab, col) in enumerate(stats):
        sx = margin + 14 + i * each
        c.setFillColor(col)
        c.setFont("Helvetica-Bold", 26)
        c.drawString(sx, roi_y + 22, val)
        # label next to number
        c.setFillColor(SLATE_300)
        c.setFont("Helvetica", 9)
        # split label across two lines if long
        wrap_lines(c, sx + 70, roi_y + 36, lab,
                   font="Helvetica", size=9, color=SLATE_300,
                   max_w=each - 80, leading=11)

    # ---- Bottom contact strip ----
    foot_h = 28
    fill_rect(c, 0, 0, W, foot_h, PANEL)
    fill_rect(c, 0, foot_h, W, 1, BORDER)
    text(c, 36, 10, "AuditVerse.AI  ·  Audit Management Platform",
         font="Helvetica-Bold", size=9, color=WHITE)
    text_center(c, W / 2, 10,
                "pilot@auditverse.ai   ·   solutions@auditverse.ai",
                font="Helvetica", size=9, color=SLATE_400)
    text_right(c, W - 36, 10, "auditverse.ai   ·   +1 (555) 014-0210",
               font="Helvetica", size=9, color=SLATE_300)

    c.showPage()
    c.save()
    print(f"Wrote {pdf_path}")
    return pdf_path


if __name__ == "__main__":
    build()
