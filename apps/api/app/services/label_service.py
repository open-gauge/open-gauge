"""
Asset label / sticker generator.

Sizes:
  "2x2"  — 50.8 × 50.8 mm  (2 × 2 in)   QR code + asset ID
  "4x2"  — 101.6 × 50.8 mm (4 × 2 in)   QR + ID + sensor name + coefficient table + dates

Formats:
  "png"  — Pillow raster, 300 DPI
  "jpg"  — Pillow raster, 300 DPI
  "pdf"  — ReportLab vector (printable, scalable)
"""
from __future__ import annotations

import io
import logging
import os
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from ..models.asset import Asset
    from ..models.calibration import Calibration
    from ..models.calibration_point import CalibrationData

logger = logging.getLogger(__name__)

DPI  = 300
INCH = DPI  # 300 px per inch at 300 DPI

# ── Shared / 2×2 colours ─────────────────────────────────────────────────────
WHITE = (255, 255, 255, 255)
BG    = (255, 255, 255, 255)
DARK  = (27, 79, 100, 255)      # #1b4f64  (2×2 accent)
TEXT  = (21, 35, 48, 255)       # #152330  (2×2 text)
BORDER_2X2 = (200, 215, 220, 255)

# ── 4×2 design-system colours (spec) ─────────────────────────────────────────
ACCENT   = (62, 131, 152, 255)    # #3E8398  — titles, dividers
TXT_PRI  = (30, 37, 43, 255)     # #1E252B  — primary text
TXT_SEC  = (104, 117, 127, 255)  # #68757F  — secondary text
DIV_H    = (220, 229, 232, 255)  # #DCE5E8  — horizontal dividers
DIV_V    = (199, 211, 216, 255)  # #C7D3D8  — vertical divider
TBL_BG   = (250, 251, 252, 255)  # #FAFBFC  — table label-cell background
TBL_BRD  = (216, 226, 230, 255)  # #D8E2E6  — table cell borders
LBL_BRD  = (230, 235, 238, 255)  # #E6EBEE  — outer border


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def generate_label(
    asset: "Asset",
    calibration: "Calibration | None",
    points: "list[CalibrationData]",
    owner_name: str | None,
    size: str,    # "2x2" | "4x2"
    fmt: str,     # "png" | "jpg" | "pdf"
    base_url: str,
) -> tuple[bytes, str]:
    """Return (content_bytes, content_type)."""
    url = f"{base_url.rstrip('/')}/assets/{asset.id}"
    qr_bytes = _make_qr(url)

    asset_id  = asset.asset_id or ""
    name      = asset.name or ""
    coeff_rows = _coeff_table(calibration, points) if calibration else []
    cal_date  = str(calibration.calibration_date) if calibration and calibration.calibration_date else None
    due_date  = str(calibration.due_date) if calibration and calibration.due_date else None

    img = _raster(qr_bytes, asset_id, name, coeff_rows, cal_date, due_date, size)
    buf = io.BytesIO()

    if fmt == "pdf":
        img.convert("RGB").save(buf, format="PDF", resolution=DPI)
        return buf.getvalue(), "application/pdf"

    pil_fmt = "JPEG" if fmt == "jpg" else "PNG"
    if pil_fmt == "JPEG" and img.mode == "RGBA":
        img = img.convert("RGB")
    img.save(buf, format=pil_fmt, dpi=(DPI, DPI))
    return buf.getvalue(), ("image/jpeg" if fmt == "jpg" else "image/png")


# ---------------------------------------------------------------------------
# QR code  (black on white, error-correction M)
# ---------------------------------------------------------------------------
def _make_qr(url: str) -> bytes:
    import qrcode  # type: ignore[import-untyped]

    qr = qrcode.QRCode(
        version=None,
        error_correction=qrcode.constants.ERROR_CORRECT_M,
        box_size=10,
        border=1,
    )
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="black", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Coefficient table  (numpy highest-degree-first convention)
# ---------------------------------------------------------------------------
def _coeff_table(cal: "Calibration", points: "list[CalibrationData]") -> list[tuple[str, str]]:
    coeffs = cal.poly_coefficients
    if not coeffs:
        return []

    degree = len(coeffs) - 1
    m_unit = points[0].measured_unit if points else ""
    r_unit = points[0].reference_unit if points else ""

    def _label(exp: int) -> str:
        if exp == 0:
            return f"Offset (constant)" 
        if exp == 1:
            return f"Gain (slope)"
        if exp == 2:
            return f"Cuadratic correction"
        if exp == 3:
            return f"Cubic correction"
        if exp == 4:
            return f"Quartic correction"
        if exp == 5:
            return f"Quintic correction"

    def _fmt(v: float) -> str:
        av = abs(v)
        if av == 0:
            return "0"
        if av < 1e-3 or av >= 1e5:
            return f"{v:.4g}"
        return f"{v:.5g}"

    return [
        (_label(exp), _fmt(coeffs[degree - exp]))
        for exp in range(min(degree + 1, 5))
    ]


# ---------------------------------------------------------------------------
# Font loader  (proportional / monospace × regular / bold)
# ---------------------------------------------------------------------------
def _load_font(size: int, bold: bool = False, mono: bool = False):
    from PIL import ImageFont

    if mono:
        names = ("DejaVuSansMono-Bold.ttf" if bold else "DejaVuSansMono.ttf",)
    else:
        names = ("DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf",)

    dirs = [
        "/usr/share/fonts/truetype/dejavu",
        "/usr/share/fonts/truetype/ttf-dejavu",
    ]
    for d in dirs:
        for n in names:
            p = os.path.join(d, n)
            if os.path.exists(p):
                try:
                    return ImageFont.truetype(p, size)
                except (IOError, OSError):
                    pass
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Pillow raster
# ---------------------------------------------------------------------------
def _raster(
    qr_bytes: bytes,
    asset_id: str,
    name: str,
    coeff_rows: list[tuple[str, str]],
    cal_date: str | None,
    due_date: str | None,
    size: str,
) -> "Image":  # type: ignore[name-defined]
    from PIL import Image, ImageDraw

    W = (4 * INCH) if size == "4x2" else (2 * INCH)
    H = 2 * INCH
    canvas = Image.new("RGBA", (W, H), BG)
    draw   = ImageDraw.Draw(canvas)
    qr_img = Image.open(io.BytesIO(qr_bytes)).convert("RGBA")

    if size == "2x2":
        _draw_2x2(canvas, draw, qr_img, asset_id)
    else:
        _draw_4x2(canvas, draw, qr_img, asset_id, name, coeff_rows, cal_date, due_date)
    return canvas


# ── 2×2 sticker ──────────────────────────────────────────────────────────────
def _draw_2x2(canvas, draw, qr_img, asset_id: str) -> None:
    from PIL import Image

    W, H = canvas.size

    draw.rectangle([4, 4, W - 5, H - 5], outline=BORDER_2X2[:3], width=2)

    pad     = 28
    qr_size = min(W - 2 * pad, H - 124)
    qr_x    = (W - qr_size) // 2
    qr_y    = pad
    canvas.paste(qr_img.resize((qr_size, qr_size), Image.LANCZOS), (qr_x, qr_y), qr_img.resize((qr_size, qr_size), Image.LANCZOS))

    sep_y = qr_y + qr_size + 14
    draw.line([(pad, sep_y), (W - pad, sep_y)], fill=BORDER_2X2[:3], width=2)

    lbl_font = _load_font(24)
    draw.text((W // 2, sep_y + 14), "SENSOR ID", font=lbl_font, fill=DARK[:3], anchor="mt")

    id_font = _load_font(38, bold=True, mono=True)
    draw.text((W // 2, sep_y + 44), asset_id, font=id_font, fill=TEXT[:3], anchor="mt")


# ── 4×2 sticker ──────────────────────────────────────────────────────────────
#
#  Spec (all measurements at 300 DPI):
#   Left  34% = 408 px   |   Right 66% = 792 px
#   Safe margin: 3 mm ≈ 35 px
#   Font scale (spec px → 300 DPI): × 1.73  (96→300 DPI ratio scaled for label readability)
#     Labels    11 px spec → 20 px   (proportional, accent colour)
#     Table     14 px spec → 24 px   (proportional name / mono value)
#     Dates     18 px spec → 32 px   mono
#     Name      22 px spec → 38 px   proportional
#     ID        30 px spec → 52 px   mono bold  (dominant element)
#
def _draw_4x2(
    canvas, draw, qr_img,
    asset_id: str, name: str,
    coeff_rows: list[tuple[str, str]],
    cal_date: str | None, due_date: str | None,
) -> None:
    from PIL import Image

    W, H = canvas.size  # 1200 × 600

    # Outer border (1 px #E6EBEE)
    draw.rectangle([2, 2, W - 3, H - 3], outline=LBL_BRD[:3], width=2)

    # ── dimensions ───────────────────────────────────────────────────────────
    LEFT_W  = int(W * 0.34)   # 408 px
    SAFE    = 26               # safe margin px
    DIV_GAP = 10               # gap around vertical divider

    # ── QR code (2/3-aligned, ~30×30 mm = 354 px, capped to available width) ─
    qr_avail = LEFT_W - 2 * SAFE
    qr_size  = min(qr_avail, 340)   # 340 px ≈ 28.8 mm — snug but with quiet zone
    qr_x     = SAFE + (qr_avail - qr_size) // 2
    qr_y     = SAFE + (H - 2 * SAFE - qr_size) // 3
    qr_img_r = qr_img.resize((qr_size, qr_size), Image.LANCZOS)
    canvas.paste(qr_img_r, (qr_x, qr_y), qr_img_r)

    # ── Separator under QR ───────────────────────────────────────────────────
    sep_y = qr_y + qr_size + 14
    draw.line([(SAFE, sep_y), (LEFT_W - SAFE, sep_y)], fill=DIV_H[:3], width=1)

    # ── "SENSOR ID" label ────────────────────────────────────────────────────
    lbl_font = _load_font(20)
    draw.text(
        (LEFT_W // 2, sep_y + 10),
        "SENSOR ID",
        font=lbl_font, fill=ACCENT[:3], anchor="mt",
    )

    # ── Sensor ID value (dominant, bold mono, centred) ───────────────────────
    id_font = _load_font(52, bold=True, mono=True)
    draw.text(
        (LEFT_W // 2, sep_y + 36),
        asset_id,
        font=id_font, fill=TXT_PRI[:3], anchor="mt",
    )

    # ── Vertical divider (1 px #C7D3D8) ──────────────────────────────────────
    div_x = LEFT_W + DIV_GAP
    draw.line([(div_x, SAFE), (div_x, H - SAFE)], fill=DIV_V[:3], width=2)

    # ── Right column ─────────────────────────────────────────────────────────
    rx  = div_x + DIV_GAP + 6        # x start of right content
    rw  = W - rx - SAFE              # usable width ≈ 734 px
    ry  = qr_y                       # running y cursor

    name_lbl_f  = _load_font(24)              # section labels
    name_val_f  = _load_font(38)              # sensor name
    tbl_name_f  = _load_font(26)              # table label column
    tbl_val_f   = _load_font(24, mono=True)   # table value column (mono)
    date_lbl_f  = _load_font(28)              # date header labels
    date_val_f  = _load_font(32, mono=True)   # date values

    # ── Block 1: Sensor Name ──────────────────────────────────────────────────
    draw.text((rx, ry), "SENSOR NAME", font=name_lbl_f, fill=ACCENT[:3])
    ry += 26
    trunc = name[:52] + ("…" if len(name) > 52 else "")
    draw.text((rx, ry), trunc, font=name_val_f, fill=TXT_PRI[:3])
    ry += 46

    # Horizontal divider
    draw.line([(rx, ry), (rx + rw, ry)], fill=DIV_H[:3], width=1)
    ry += 26

    # ── Block 2: Calibration Dates ────────────────────────────────────────────
    half   = rw // 2
    mid_x  = rx + half

    # Left: Calibrated on
    draw.text((rx, ry), "CALIBRATED ON", font=name_lbl_f, fill=ACCENT[:3])
    draw.text((rx, ry + 26), cal_date or "—", font=date_val_f, fill=TXT_PRI[:3])

    # Vertical date divider
    draw.line([(mid_x - 4, ry - 2), (mid_x - 4, ry + 60)], fill=DIV_H[:3], width=1)

    # Right: Calibration due
    draw.text((mid_x + 14, ry), "CALIBRATION DUE", font=name_lbl_f, fill=ACCENT[:3])
    draw.text((mid_x + 14, ry + 26), due_date or "—", font=date_val_f, fill=TXT_PRI[:3])
    
    ry += 72

    # Horizontal divider
    draw.line([(rx, ry), (rx + rw, ry)], fill=DIV_H[:3], width=1)
    ry += 26

    # ── Block 3: Calibration Coefficients ────────────────────────────────────
    draw.text((rx, ry), "CALIBRATION COEFFICIENTS", font=name_lbl_f, fill=ACCENT[:3])
    ry += 32

    if coeff_rows:
        row_h  = 42
        col1_w = int(rw * 0.58)   # label column
        col2_w = rw - col1_w       # value column

        for i, (lbl, val) in enumerate(coeff_rows[:5]):
            ty = ry + i * row_h
            # Label cell  (light tinted background)
            draw.rectangle(
                [rx, ty, rx + col1_w - 1, ty + row_h - 1],
                fill=TBL_BG[:3], outline=TBL_BRD[:3],
            )
            draw.text(
                (rx + 10, ty + row_h // 2),
                lbl, font=tbl_name_f, fill=TXT_PRI[:3], anchor="lm",
            )
            # Value cell  (white, mono, right-aligned)
            draw.rectangle(
                [rx + col1_w, ty, rx + rw - 1, ty + row_h - 1],
                fill=WHITE[:3], outline=TBL_BRD[:3],
            )
            draw.text(
                (rx + rw - 10, ty + row_h // 2),
                val, font=tbl_val_f, fill=TXT_PRI[:3], anchor="rm",
            )

