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

DPI = 300
INCH = DPI  # 300 px per inch at 300 DPI

# Colours (Pillow uses RGBA tuples)
WHITE       = (255, 255, 255, 255)
BG          = (255, 255, 255, 255)
DARK        = (27, 79, 100, 255)     # #1b4f64
TEXT        = (21, 35, 48, 255)      # #152330
GRAY        = (107, 114, 128, 255)   # #6b7280
BORDER      = (200, 215, 220, 255)   # light separator
TBL_LABEL   = (245, 248, 250, 255)   # table label-cell background


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

    asset_id = asset.asset_id or ""
    name = asset.name or ""
    coeff_rows = _coeff_table(calibration, points) if calibration else []
    cal_date = str(calibration.calibration_date) if calibration and calibration.calibration_date else None
    due_date = str(calibration.due_date) if calibration and calibration.due_date else None

    if fmt == "pdf":
        data = _pdf(qr_bytes, asset_id, name, coeff_rows, cal_date, due_date, size)
        return data, "application/pdf"

    img = _raster(qr_bytes, asset_id, name, coeff_rows, cal_date, due_date, size)
    buf = io.BytesIO()
    pil_fmt = "JPEG" if fmt == "jpg" else "PNG"
    if pil_fmt == "JPEG" and img.mode == "RGBA":
        img = img.convert("RGB")
    img.save(buf, format=pil_fmt, dpi=(DPI, DPI))
    content_type = "image/jpeg" if fmt == "jpg" else "image/png"
    return buf.getvalue(), content_type


# ---------------------------------------------------------------------------
# QR code
# ---------------------------------------------------------------------------
def _make_qr(url: str) -> bytes:
    import qrcode  # type: ignore[import-untyped]

    qr = qrcode.QRCode(version=None, error_correction=qrcode.constants.ERROR_CORRECT_M, box_size=10, border=1)
    qr.add_data(url)
    qr.make(fit=True)
    img = qr.make_image(fill_color="#1b4f64", back_color="white")
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Coefficient table helper
# ---------------------------------------------------------------------------
def _coeff_table(cal: "Calibration", points: "list[CalibrationData]") -> list[tuple[str, str]]:
    """Return [(row_label, formatted_value), …] for each polynomial coefficient."""
    coeffs = cal.poly_coefficients
    if not coeffs:
        return []

    degree = len(coeffs) - 1
    m_unit = points[0].measured_unit if points else ""
    r_unit = points[0].reference_unit if points else ""

    def label_for(exp: int) -> str:
        if exp == 0:
            return f"Offset ({r_unit})" if r_unit else "Offset"
        if exp == 1:
            return f"Scale ({m_unit}/{r_unit})" if (m_unit and r_unit) else "Scale"
        letters = "ABCDE"
        return f"Curve ({letters[exp - 2]})" if exp - 2 < len(letters) else f"Curve (deg {exp})"

    def fmt_val(v: float) -> str:
        av = abs(v)
        if av == 0:
            return "0"
        if av < 1e-3 or av >= 1e5:
            return f"{v:.4g}"
        return f"{v:.5g}"

    rows: list[tuple[str, str]] = []
    for exp in range(min(degree + 1, 5)):   # max 5 rows to keep table compact
        c = coeffs[degree - exp]            # coeffs are highest-degree-first (numpy convention)
        rows.append((label_for(exp), fmt_val(c)))
    return rows


# ---------------------------------------------------------------------------
# Font loader (Pillow)
# ---------------------------------------------------------------------------
def _load_font(size: int, bold: bool = False):
    from PIL import ImageFont

    paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        "/usr/share/fonts/truetype/ttf-dejavu/DejaVuSans-Bold.ttf" if bold else "/usr/share/fonts/truetype/ttf-dejavu/DejaVuSans.ttf",
    ]
    for p in paths:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, size)
            except (IOError, OSError):
                pass
    return ImageFont.load_default()


# ---------------------------------------------------------------------------
# Pillow raster (PNG / JPG)
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
    draw = ImageDraw.Draw(canvas)

    qr_img = Image.open(io.BytesIO(qr_bytes)).convert("RGBA")

    if size == "2x2":
        _draw_2x2(canvas, draw, qr_img, asset_id)
    else:
        _draw_4x2(canvas, draw, qr_img, asset_id, name, coeff_rows, cal_date, due_date)

    return canvas


def _draw_2x2(canvas, draw, qr_img, asset_id: str) -> None:
    from PIL import Image

    W, H = canvas.size  # 600 × 600

    # Outer border
    draw.rectangle([4, 4, W - 5, H - 5], outline=BORDER[:3], width=2)

    # QR — large, leaving ~120 px at bottom for text
    pad = 30
    qr_size = W - 2 * pad        # 540 px
    max_qr = H - 128             # 472 px — leave room for text
    qr_size = min(qr_size, max_qr)
    qr_x = (W - qr_size) // 2
    qr_y = pad
    qr_resized = qr_img.resize((qr_size, qr_size), Image.LANCZOS)
    canvas.paste(qr_resized, (qr_x, qr_y), qr_resized)

    sep_y = qr_y + qr_size + 14
    draw.line([(pad, sep_y), (W - pad, sep_y)], fill=BORDER[:3], width=2)

    # "SENSOR ID" label — small caps, DARK colour
    lbl_font = _load_font(22, bold=False)
    draw.text((W // 2, sep_y + 14), "SENSOR ID", font=lbl_font, fill=DARK[:3], anchor="mt")

    # Asset ID — bold, dark text
    id_font = _load_font(38, bold=True)
    draw.text((W // 2, sep_y + 44), asset_id, font=id_font, fill=TEXT[:3], anchor="mt")


def _draw_4x2(
    canvas, draw, qr_img,
    asset_id: str, name: str,
    coeff_rows: list[tuple[str, str]],
    cal_date: str | None, due_date: str | None,
) -> None:
    from PIL import Image

    W, H = canvas.size  # 1200 × 600

    # Outer border
    draw.rectangle([4, 4, W - 5, H - 5], outline=BORDER[:3], width=2)

    # ── Left column: QR + ID ──────────────────────────────────────────
    LEFT_W = 370
    pad = 26

    qr_size = 298
    qr_x = (LEFT_W - qr_size) // 2
    qr_y = 28
    qr_resized = qr_img.resize((qr_size, qr_size), Image.LANCZOS)
    canvas.paste(qr_resized, (qr_x, qr_y), qr_resized)

    sep_y = qr_y + qr_size + 14   # ≈ 340
    draw.line([(pad, sep_y), (LEFT_W - pad, sep_y)], fill=BORDER[:3], width=2)

    lbl_font = _load_font(18, bold=False)
    draw.text((LEFT_W // 2, sep_y + 12), "SENSOR ID", font=lbl_font, fill=DARK[:3], anchor="mt")

    id_font = _load_font(34, bold=True)
    draw.text((LEFT_W // 2, sep_y + 38), asset_id, font=id_font, fill=TEXT[:3], anchor="mt")

    # ── Vertical divider ─────────────────────────────────────────────
    div_x = LEFT_W + 8
    draw.line([(div_x, pad), (div_x, H - pad)], fill=BORDER[:3], width=2)

    # ── Right column ─────────────────────────────────────────────────
    rx = div_x + 22          # right column x
    rw = W - rx - pad        # right column usable width ≈ 796 px
    ry = 26

    section_font = _load_font(18, bold=False)   # section labels (DARK)
    name_font    = _load_font(28, bold=False)   # sensor name value
    eq_font      = _load_font(20, bold=False)   # table text
    date_lbl_fnt = _load_font(16, bold=False)   # date labels
    date_val_fnt = _load_font(24, bold=False)   # date values

    # "SENSOR NAME"
    draw.text((rx, ry), "SENSOR NAME", font=section_font, fill=DARK[:3])
    ry += 24
    trunc = name[:48] + ("…" if len(name) > 48 else "")
    draw.text((rx, ry), trunc, font=name_font, fill=TEXT[:3])
    ry += 36

    # Horizontal divider
    draw.line([(rx, ry), (rx + rw, ry)], fill=BORDER[:3], width=1)
    ry += 12

    # "CALIBRATION COEFFICIENTS"
    draw.text((rx, ry), "CALIBRATION COEFFICIENTS", font=section_font, fill=DARK[:3])
    ry += 22

    # Coefficient table
    if coeff_rows:
        row_h   = 38
        col1_w  = int(rw * 0.56)
        col2_w  = rw - col1_w

        for i, (lbl, val) in enumerate(coeff_rows[:4]):
            ty = ry + i * row_h
            # Label cell (light bg)
            draw.rectangle([rx, ty, rx + col1_w, ty + row_h],
                           fill=TBL_LABEL[:3], outline=BORDER[:3])
            draw.text((rx + 8, ty + row_h // 2), lbl, font=eq_font, fill=TEXT[:3], anchor="lm")
            # Value cell (white)
            draw.rectangle([rx + col1_w, ty, rx + rw, ty + row_h],
                           fill=WHITE[:3], outline=BORDER[:3])
            draw.text((rx + col1_w + 8, ty + row_h // 2), val, font=eq_font, fill=TEXT[:3], anchor="lm")

        ry += min(len(coeff_rows), 4) * row_h + 10

    # Horizontal divider
    draw.line([(rx, ry), (rx + rw, ry)], fill=BORDER[:3], width=1)
    ry += 12

    # Dates — two columns separated by a thin vertical line
    half = rw // 2
    mid_x = rx + half

    draw.text((rx, ry), "CALIBRATED ON", font=date_lbl_fnt, fill=DARK[:3])
    draw.text((rx, ry + 22), cal_date or "—", font=date_val_fnt, fill=TEXT[:3])

    draw.line([(mid_x, ry), (mid_x, ry + 54)], fill=BORDER[:3], width=2)

    draw.text((mid_x + 14, ry), "CALIBRATION DUE", font=date_lbl_fnt, fill=DARK[:3])
    draw.text((mid_x + 14, ry + 22), due_date or "—", font=date_val_fnt, fill=TEXT[:3])


# ---------------------------------------------------------------------------
# ReportLab PDF
# ---------------------------------------------------------------------------
def _pdf(
    qr_bytes: bytes,
    asset_id: str,
    name: str,
    coeff_rows: list[tuple[str, str]],
    cal_date: str | None,
    due_date: str | None,
    size: str,
) -> bytes:
    from reportlab.lib.colors import HexColor
    from reportlab.lib.units import inch
    from reportlab.lib.utils import ImageReader
    from reportlab.pdfgen import canvas as rl_canvas

    W = (4.0 * inch) if size == "4x2" else (2.0 * inch)
    H = 2.0 * inch

    buf = io.BytesIO()
    c = rl_canvas.Canvas(buf, pagesize=(W, H))

    qr_reader = ImageReader(io.BytesIO(qr_bytes))

    c_dark   = HexColor("#1b4f64")
    c_text   = HexColor("#152330")
    c_border = HexColor("#c8d7dc")
    c_tbl_bg = HexColor("#f7f9fa")

    # Outer border
    c.setStrokeColor(c_border)
    c.setLineWidth(0.5)
    c.rect(0.03 * inch, 0.03 * inch, W - 0.06 * inch, H - 0.06 * inch)

    if size == "2x2":
        # QR code — centred, leaving bottom 0.42" for text
        qr_sz = H - 0.52 * inch
        qr_x  = (W - qr_sz) / 2
        qr_y  = H - qr_sz - 0.06 * inch
        c.drawImage(qr_reader, qr_x, qr_y, qr_sz, qr_sz, preserveAspectRatio=True)

        # Separator
        sep_y = qr_y - 0.055 * inch
        c.setStrokeColor(c_border)
        c.setLineWidth(0.5)
        c.line(0.12 * inch, sep_y, W - 0.12 * inch, sep_y)

        # "SENSOR ID" label
        c.setFont("Helvetica", 6)
        c.setFillColor(c_dark)
        c.drawCentredString(W / 2, sep_y - 0.12 * inch, "SENSOR ID")

        # Asset ID
        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(c_text)
        c.drawCentredString(W / 2, sep_y - 0.26 * inch, asset_id)

    else:  # 4x2
        LEFT_W = W * 0.305   # ~1.22 inch
        pad    = 0.08 * inch

        # QR
        qr_sz = LEFT_W - 2 * pad
        qr_x  = pad
        qr_y  = H - qr_sz - pad
        c.drawImage(qr_reader, qr_x, qr_y, qr_sz, qr_sz, preserveAspectRatio=True)

        # Separator under QR
        sep_y = qr_y - 0.04 * inch
        c.setStrokeColor(c_border)
        c.setLineWidth(0.5)
        c.line(pad, sep_y, LEFT_W - pad, sep_y)

        # "SENSOR ID"
        c.setFont("Helvetica", 5.5)
        c.setFillColor(c_dark)
        c.drawCentredString(LEFT_W / 2, sep_y - 0.10 * inch, "SENSOR ID")

        # Asset ID
        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(c_text)
        c.drawCentredString(LEFT_W / 2, sep_y - 0.21 * inch, asset_id)

        # Vertical divider
        div_x = LEFT_W + 0.05 * inch
        c.setStrokeColor(c_border)
        c.setLineWidth(0.5)
        c.line(div_x, pad, div_x, H - pad)

        # ── Right column ──────────────────────────────────────────────
        tx = div_x + 0.10 * inch
        ty = H - 0.10 * inch
        rw = W - tx - 0.06 * inch

        # "SENSOR NAME"
        c.setFont("Helvetica", 5.5)
        c.setFillColor(c_dark)
        c.drawString(tx, ty, "SENSOR NAME")
        ty -= 0.13 * inch

        c.setFont("Helvetica-Bold", 9)
        c.setFillColor(c_text)
        trunc = (name[:50] + "…") if len(name) > 50 else name
        c.drawString(tx, ty, trunc)
        ty -= 0.10 * inch

        # Divider
        c.setStrokeColor(c_border)
        c.setLineWidth(0.5)
        c.line(tx, ty, tx + rw, ty)
        ty -= 0.09 * inch

        # "CALIBRATION COEFFICIENTS"
        c.setFont("Helvetica", 5.5)
        c.setFillColor(c_dark)
        c.drawString(tx, ty, "CALIBRATION COEFFICIENTS")
        ty -= 0.08 * inch

        # Coefficient table via manual drawing
        if coeff_rows:
            row_h   = 0.115 * inch
            col1_w  = rw * 0.57
            col2_w  = rw - col1_w
            from reportlab.lib.colors import HexColor as HC
            for lbl, val in coeff_rows[:4]:
                # label cell
                c.setFillColor(HC("#f7f9fa"))
                c.setStrokeColor(HC("#c8d7dc"))
                c.setLineWidth(0.4)
                c.rect(tx, ty - row_h, col1_w, row_h, fill=1, stroke=1)
                c.setFont("Helvetica", 5.5)
                c.setFillColor(c_text)
                c.drawString(tx + 0.04 * inch, ty - row_h + 0.03 * inch, lbl)
                # value cell
                c.setFillColor(HC("#ffffff"))
                c.rect(tx + col1_w, ty - row_h, col2_w, row_h, fill=1, stroke=1)
                c.setFont("Courier", 5.5)
                c.drawString(tx + col1_w + 0.04 * inch, ty - row_h + 0.03 * inch, val)
                ty -= row_h

        ty -= 0.06 * inch

        # Divider
        c.setStrokeColor(c_border)
        c.setLineWidth(0.5)
        c.line(tx, ty, tx + rw, ty)
        ty -= 0.08 * inch

        # Dates
        half_rw = rw / 2
        c.setFont("Helvetica", 5)
        c.setFillColor(c_dark)
        c.drawString(tx, ty, "CALIBRATED ON")
        c.drawString(tx + half_rw + 0.06 * inch, ty, "CALIBRATION DUE")

        c.setFont("Helvetica-Bold", 7.5)
        c.setFillColor(c_text)
        c.drawString(tx, ty - 0.11 * inch, cal_date or "—")
        c.drawString(tx + half_rw + 0.06 * inch, ty - 0.11 * inch, due_date or "—")

        # Date vertical divider
        c.setStrokeColor(c_border)
        c.setLineWidth(0.5)
        c.line(tx + half_rw, ty + 0.06 * inch, tx + half_rw, ty - 0.13 * inch)

    c.save()
    return buf.getvalue()
