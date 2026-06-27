"""
Asset label / sticker generator.

Sizes:
  "2x2"  — 50.8 × 50.8 mm  (2 × 2 in)   QR code + asset ID
  "4x2"  — 101.6 × 50.8 mm (4 × 2 in)   QR + ID + name + owner + due date + equation

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
INCH = DPI                # 300 px per inch at 300 DPI

# Colours (Pillow uses RGBA tuples)
WHITE    = (255, 255, 255, 255)
BG       = (255, 255, 255, 255)
DARK     = (27, 79, 100, 255)    # #1b4f64
MID      = (47, 129, 155, 255)   # #2f819b
TEXT     = (21, 35, 48, 255)     # #152330
GRAY     = (107, 114, 128, 255)  # #6b7280
BORDER   = (229, 231, 235, 255)  # #e5e7eb


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------
def generate_label(
    asset: "Asset",
    calibration: "Calibration | None",
    points: "list[CalibrationData]",
    owner_name: str | None,
    size: str,   # "2x2" | "4x2"
    fmt: str,    # "png" | "jpg" | "pdf"
    base_url: str,
) -> tuple[bytes, str]:
    """Return (content_bytes, content_type)."""
    url = f"{base_url.rstrip('/')}/assets/{asset.id}"
    qr_bytes = _make_qr(url)

    eq_lines, eq_units = _equation_parts(calibration, points) if calibration else ([], "")
    due = str(calibration.due_date) if calibration and calibration.due_date else None
    name = asset.name or ""
    asset_id = asset.asset_id or ""

    if fmt == "pdf":
        data = _pdf(qr_bytes, asset_id, name, owner_name, due, eq_lines, eq_units, size)
        return data, "application/pdf"
    else:
        img = _raster(qr_bytes, asset_id, name, owner_name, due, eq_lines, eq_units, size)
        buf = io.BytesIO()
        pil_fmt = "JPEG" if fmt == "jpg" else "PNG"
        mode = "RGB" if pil_fmt == "JPEG" else "RGBA"
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
# Equation helpers
# ---------------------------------------------------------------------------
def _equation_parts(cal: "Calibration", points: "list[CalibrationData]") -> tuple[list[str], str]:
    """Return (poly_lines, units_str) for sticker rendering."""
    coeffs = cal.poly_coefficients
    if not coeffs:
        return [], ""

    degree = len(coeffs) - 1
    m_unit = points[0].measured_unit if points else ""
    r_unit = points[0].reference_unit if points else ""

    def fmt_abs(v: float) -> str:
        return f"{abs(v):.4g}"

    terms: list[tuple[bool, str]] = []
    for i, c in enumerate(coeffs):
        power = degree - i
        if abs(c) < 1e-15:
            continue
        t = fmt_abs(c)
        if power == 1:
            t += "x"
        elif power == 2:
            t += "x²"
        elif power > 2:
            t += f"x^{power}"
        terms.append((c < 0, t))

    if not terms:
        return ["y = 0"], ""

    lines: list[str] = []
    for j, (neg, t) in enumerate(terms):
        if j == 0:
            prefix = "y = −" if neg else "y = "
            lines.append(f"{prefix}{t}")
        else:
            sign = "−" if neg else "+"
            lines.append(f"  {sign} {t}")

    units_str = f"[{m_unit} → {r_unit}]" if (m_unit or r_unit) else ""
    return lines, units_str


# ---------------------------------------------------------------------------
# Pillow raster (PNG / JPG)
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


def _raster(
    qr_bytes: bytes,
    asset_id: str,
    name: str,
    owner: str | None,
    due: str | None,
    eq_lines: list[str],
    eq_units: str,
    size: str,
) -> "Image":  # type: ignore[name-defined]
    from PIL import Image, ImageDraw

    W = (4 * INCH) if size == "4x2" else (2 * INCH)
    H = 2 * INCH

    canvas = Image.new("RGBA", (W, H), BG)
    draw = ImageDraw.Draw(canvas)

    # Border
    draw.rectangle([0, 0, W - 1, H - 1], outline=DARK[:3], width=4)

    # Load QR image
    qr_img = Image.open(io.BytesIO(qr_bytes)).convert("RGBA")

    if size == "2x2":
        _draw_2x2(canvas, draw, qr_img, asset_id)
    else:
        _draw_4x2(canvas, draw, qr_img, asset_id, name, owner, due, eq_lines, eq_units)

    return canvas


def _draw_2x2(canvas, draw, qr_img, asset_id: str) -> None:
    from PIL import Image

    W, H = canvas.size
    pad = 40
    qr_size = W - 2 * pad
    qr_resized = qr_img.resize((qr_size, qr_size), Image.LANCZOS)
    canvas.paste(qr_resized, (pad, pad), qr_resized)

    id_font = _load_font(42, bold=True)
    draw.text((W // 2, H - 44), asset_id, font=id_font, fill=DARK[:3], anchor="mm")


def _draw_4x2(canvas, draw, qr_img, asset_id: str, name: str, owner: str | None, due: str | None, eq_lines: list[str], eq_units: str) -> None:
    from PIL import Image

    W, H = canvas.size
    col_split = int(W * 0.38)   # ~456 px — left column width

    # QR code — centred vertically in left column (no text below it)
    pad = 30
    qr_size = col_split - 2 * pad
    qr_resized = qr_img.resize((qr_size, qr_size), Image.LANCZOS)
    qr_y = (H - qr_size) // 2
    canvas.paste(qr_resized, (pad, qr_y), qr_resized)

    # Vertical divider
    draw.line([(col_split + 10, 30), (col_split + 10, H - 30)], fill=BORDER[:3], width=2)

    # Right column — top aligns with top of QR
    rx = col_split + 36
    ry = qr_y

    # Asset ID (large)
    id_font = _load_font(48, bold=True)
    draw.text((rx, ry), asset_id, font=id_font, fill=DARK[:3])
    ry += 58

    # Asset name
    name_font = _load_font(30, bold=False)
    draw.text((rx, ry), name[:40] + ("…" if len(name) > 40 else ""), font=name_font, fill=TEXT[:3])
    ry += 40

    # Owner + due date
    meta_font = _load_font(24, bold=False)
    if owner:
        draw.text((rx, ry), f"Owner: {owner}", font=meta_font, fill=GRAY[:3])
        ry += 32
    if due:
        draw.text((rx, ry), f"Due: {due}", font=meta_font, fill=GRAY[:3])
        ry += 32

    # Calibration equation — one term per line, then units conversion
    if eq_lines:
        ry += 6
        eq_font = _load_font(20, bold=False)
        for line in eq_lines:
            draw.text((rx, ry), line, font=eq_font, fill=TEXT[:3])
            ry += 26
        if eq_units:
            draw.text((rx, ry), eq_units, font=eq_font, fill=GRAY[:3])


# ---------------------------------------------------------------------------
# ReportLab PDF
# ---------------------------------------------------------------------------
def _pdf(
    qr_bytes: bytes,
    asset_id: str,
    name: str,
    owner: str | None,
    due: str | None,
    eq_lines: list[str],
    eq_units: str,
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

    c_dark = HexColor("#1b4f64")
    c_text = HexColor("#152330")
    c_gray = HexColor("#6b7280")
    c_border = HexColor("#e5e7eb")

    # Border
    c.setStrokeColor(c_dark)
    c.setLineWidth(1.5)
    c.rect(0.04 * inch, 0.04 * inch, W - 0.08 * inch, H - 0.08 * inch)

    if size == "2x2":
        qr_sz = 1.6 * inch
        qr_x = (W - qr_sz) / 2
        qr_y = H - qr_sz - 0.14 * inch
        c.drawImage(qr_reader, qr_x, qr_y, qr_sz, qr_sz, preserveAspectRatio=True)

        c.setFont("Helvetica-Bold", 11)
        c.setFillColor(c_dark)
        c.drawCentredString(W / 2, 0.1 * inch, asset_id)

    else:  # 4x2
        col_split = W * 0.38
        qr_sz = col_split - 0.2 * inch
        qr_x = 0.1 * inch
        qr_y = (H - qr_sz) / 2
        c.drawImage(qr_reader, qr_x, qr_y, qr_sz, qr_sz, preserveAspectRatio=True)

        # Divider
        c.setStrokeColor(c_border)
        c.setLineWidth(0.5)
        div_x = col_split + 0.06 * inch
        c.line(div_x, 0.12 * inch, div_x, H - 0.12 * inch)

        # Right side — top baseline aligns with top of QR
        tx = div_x + 0.15 * inch
        ty = qr_y + qr_sz - 0.14 * inch  # first baseline just inside QR top

        # Asset ID
        c.setFont("Helvetica-Bold", 14)
        c.setFillColor(c_dark)
        c.drawString(tx, ty, asset_id)
        ty -= 0.20 * inch

        # Name
        c.setFont("Helvetica-Bold", 10)
        c.setFillColor(c_text)
        c.drawString(tx, ty, (name[:42] + "…") if len(name) > 42 else name)
        ty -= 0.16 * inch

        # Owner + due
        c.setFont("Helvetica", 8.5)
        c.setFillColor(c_gray)
        if owner:
            c.drawString(tx, ty, f"Owner: {owner}")
            ty -= 0.14 * inch
        if due:
            c.drawString(tx, ty, f"Due: {due}")
            ty -= 0.14 * inch

        # Calibration equation — one term per line
        if eq_lines:
            ty -= 0.04 * inch
            c.setFont("Courier", 7)
            c.setFillColor(c_text)
            for line in eq_lines:
                c.drawString(tx, ty, line)
                ty -= 0.115 * inch
            if eq_units:
                c.setFillColor(c_gray)
                c.drawString(tx, ty, eq_units)

    c.save()
    return buf.getvalue()
