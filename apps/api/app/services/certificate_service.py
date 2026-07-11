"""
Calibration certificate PDF generator.

Produces an A4 multi-page PDF with QR code, asset info, traceability,
calibration results, dataset table, and a scatter/fit chart.

Dependencies: reportlab, qrcode[pil], Pillow
"""
from __future__ import annotations

import io
import logging
from typing import TYPE_CHECKING

import numpy as np
from reportlab.lib.colors import HexColor, white
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas as rl_canvas
from reportlab.platypus import (
    KeepTogether,
    Paragraph,
    SimpleDocTemplate,
    Spacer,
    Table,
    TableStyle,
    Image as RLImage,
    Flowable,
)

from ..utils.uncertainty_format import format_expanded_uncertainty_statement, round_to_sig_figs

if TYPE_CHECKING:
    from ..models.asset import Asset
    from ..models.calibration import Calibration
    from ..models.calibration_point import CalibrationData
    from ..models.calibration_method import Procedure
    from ..models.sensor import Sensor

logger = logging.getLogger(__name__)

# Human-readable labels for decision rules (ISO/IEC 17025 §7.8.6.2 requires the
# rule applied to a conformity statement to be named on the certificate).
_DECISION_RULE_LABEL = {
    "simple_acceptance": "Simple acceptance (tolerance only, per ISO/IEC Guide 98-4)",
    "guard_band_w_uncertainty": "Guard-banded acceptance (acceptance zone reduced by expanded uncertainty)",
    "shared_risk": "Shared-risk acceptance (acceptance zone expanded by expanded uncertainty)",
}

# ---------------------------------------------------------------------------
# Brand colours
# ---------------------------------------------------------------------------
C_DARK = HexColor("#1b4f64")
C_MID = HexColor("#2f819b")
C_LIGHT = HexColor("#e8f4f8")
C_TEXT = HexColor("#152330")
C_GRAY = HexColor("#6b7280")
C_GRID = HexColor("#e5e7eb")
C_ROW_TINT = HexColor("#f8fbfd")

W, H = A4  # 595.28pt × 841.89pt
LMARGIN = 14 * mm
RMARGIN = 14 * mm
TMARGIN = 22 * mm
BMARGIN = 22 * mm
CW = W - LMARGIN - RMARGIN  # usable content width ≈ 182mm


# ---------------------------------------------------------------------------
# NumberedCanvas factory — draws "Page X of Y" footer on every page
# ---------------------------------------------------------------------------
def _make_canvas_class(lab_name: str, performed_by: str) -> type:
    class _Canvas(rl_canvas.Canvas):
        _lab = lab_name
        _by = performed_by

        def __init__(self, *args, **kwargs):  # type: ignore[no-untyped-def]
            rl_canvas.Canvas.__init__(self, *args, **kwargs)
            self._saved_page_states: list[dict] = []

        def showPage(self) -> None:
            self._saved_page_states.append(dict(self.__dict__))
            self._startPage()

        def save(self) -> None:
            total = len(self._saved_page_states)
            for state in self._saved_page_states:
                self.__dict__.update(state)
                self._draw_footer(total)
                rl_canvas.Canvas.showPage(self)
            rl_canvas.Canvas.save(self)

        def _draw_footer(self, total: int) -> None:
            self.saveState()
            self.setStrokeColor(C_DARK)
            self.setLineWidth(0.4)
            self.line(LMARGIN, 17 * mm, W - RMARGIN, 17 * mm)
            self.setFont("Helvetica", 6.5)
            self.setFillColor(C_GRAY)
            if self._lab:
                self.drawString(LMARGIN, 11 * mm, f"Laboratory: {self._lab}")
            if self._by:
                self.drawCentredString(W / 2, 11 * mm, f"Performed by: {self._by}")
            self.drawRightString(
                W - RMARGIN, 11 * mm, f"Page {self._pageNumber} of {total}"
            )
            self.restoreState()

    return _Canvas


# ---------------------------------------------------------------------------
# Custom Flowables
# ---------------------------------------------------------------------------
class _HRule(Flowable):
    """Thin horizontal rule."""

    def __init__(self, width: float = CW, color: HexColor = C_GRID, thickness: float = 0.4) -> None:
        super().__init__()
        self.width = width
        self._color = color
        self._thickness = thickness
        self.height = 0.5

    def draw(self) -> None:
        self.canv.setStrokeColor(self._color)
        self.canv.setLineWidth(self._thickness)
        self.canv.line(0, 0, self.width, 0)


class _CalibrationChart(Flowable):
    """Scatter plot of calibration data + polynomial fit curve, drawn directly on canvas."""

    def __init__(
        self,
        measured: list[float],
        reference: list[float],
        coefficients: list[float],
        measured_unit: str,
        reference_unit: str,
        w: float = CW,
        h: float = 82 * mm,
    ) -> None:
        super().__init__()
        self.width = w
        self.height = h
        self._m = measured
        self._r = reference
        self._c = coefficients
        self._mu = measured_unit
        self._ru = reference_unit

    def draw(self) -> None:
        if not self._m:
            return

        m = self._m
        r = self._r
        c = self._c

        # Margins inside the drawing (in points)
        ML, MB, MR, MT = 36, 22, 10, 8
        cw = self.width - ML - MR
        ch = self.height - MB - MT
        ox, oy = float(ML), float(MB)

        # Value ranges
        x_min, x_max = min(m), max(m)
        y_min, y_max = min(r), max(r)

        if c:
            xs_test = np.linspace(x_min, x_max, 60)
            ys_test = np.polyval(c, xs_test)
            y_min = min(y_min, float(np.min(ys_test)))
            y_max = max(y_max, float(np.max(ys_test)))

        x_span = x_max - x_min or 1.0
        y_span = y_max - y_min or 1.0
        x_min -= x_span * 0.06
        x_max += x_span * 0.06
        y_min -= y_span * 0.06
        y_max += y_span * 0.06

        def tx(v: float) -> float:
            return ox + (v - x_min) / (x_max - x_min) * cw

        def ty(v: float) -> float:
            return oy + (v - y_min) / (y_max - y_min) * ch

        cv = self.canv

        # Background
        cv.setFillColor(C_ROW_TINT)
        cv.rect(ox, oy, cw, ch, fill=1, stroke=0)

        # Grid lines
        cv.setStrokeColor(C_GRID)
        cv.setLineWidth(0.3)
        for i in range(1, 5):
            cv.line(ox + i * cw / 5, oy, ox + i * cw / 5, oy + ch)
            cv.line(ox, oy + i * ch / 5, ox + cw, oy + i * ch / 5)

        # Fit line
        if c:
            xs = np.linspace(x_min, x_max, 120)
            ys = np.polyval(c, xs)
            cv.setStrokeColor(C_MID)
            cv.setLineWidth(1.3)
            path = cv.beginPath()
            path.moveTo(tx(float(xs[0])), ty(float(ys[0])))
            for xi, yi in zip(xs[1:], ys[1:]):
                path.lineTo(tx(float(xi)), ty(float(yi)))
            cv.drawPath(path)

        # Scatter data points
        cv.setFillColor(C_DARK)
        for mv, rv in zip(m, r):
            cv.circle(tx(mv), ty(rv), 2.2, fill=1, stroke=0)

        # Chart border
        cv.setStrokeColor(C_DARK)
        cv.setLineWidth(0.5)
        cv.rect(ox, oy, cw, ch, fill=0, stroke=1)

        # X-axis tick labels (5 ticks)
        cv.setFont("Helvetica", 5.5)
        cv.setFillColor(C_GRAY)
        for i in range(5):
            v = x_min + i * (x_max - x_min) / 4
            cv.drawCentredString(tx(v), oy - 10, f"{v:.4g}")

        # Y-axis tick labels
        for i in range(5):
            v = y_min + i * (y_max - y_min) / 4
            cv.drawRightString(ox - 2, ty(v) - 2, f"{v:.4g}")

        # Axis titles
        cv.setFont("Helvetica", 6.5)
        cv.drawCentredString(ox + cw / 2, 2, f"Measured ({self._mu})")
        cv.saveState()
        cv.rotate(90)
        cv.drawCentredString(oy + ch / 2, -(ox - 25), f"Reference ({self._ru})")
        cv.restoreState()

        # Mini legend
        lx = ox + cw - 65
        ly = oy + ch - 15
        cv.setStrokeColor(C_MID)
        cv.setFillColor(C_MID)
        cv.setLineWidth(1.3)
        cv.line(lx, ly + 4, lx + 12, ly + 4)
        cv.setFillColor(C_DARK)
        cv.circle(lx + 20, ly + 4, 2.2, fill=1, stroke=0)
        cv.setFont("Helvetica", 5.5)
        cv.setFillColor(C_GRAY)
        cv.drawString(lx + 15, ly + 1.5, "Fit")
        cv.drawString(lx + 25, ly + 1.5, "Data")


# ---------------------------------------------------------------------------
# Style helpers
# ---------------------------------------------------------------------------
def _style(name: str, **kwargs: object) -> ParagraphStyle:
    return ParagraphStyle(name, **kwargs)


_S_TITLE = _style("cert_title", fontSize=15, fontName="Helvetica-Bold", textColor=C_DARK, spaceAfter=1)
_S_SUBTITLE = _style("cert_sub", fontSize=8, fontName="Helvetica", textColor=C_GRAY, spaceAfter=0)
_S_SECTION = _style("cert_sec", fontSize=8, fontName="Helvetica-Bold", textColor=C_DARK, spaceBefore=4, spaceAfter=3)
_S_BODY = _style("cert_body", fontSize=7.5, fontName="Helvetica", textColor=C_TEXT, leading=11)
_S_LABEL = _style("cert_lbl", fontSize=7, fontName="Helvetica-Bold", textColor=C_GRAY)
_S_VALUE = _style("cert_val", fontSize=7.5, fontName="Helvetica", textColor=C_TEXT)
_S_CENTER = _style("cert_ctr", fontSize=7.5, fontName="Helvetica", textColor=C_TEXT, alignment=TA_CENTER)
_S_RIGHT = _style("cert_rgt", fontSize=7.5, fontName="Helvetica", textColor=C_TEXT, alignment=TA_RIGHT)
_S_MONO = _style("cert_mono", fontSize=7, fontName="Courier", textColor=C_TEXT)


def _p(text: str, style: ParagraphStyle = _S_BODY) -> Paragraph:
    return Paragraph(str(text) if text is not None else "—", style)


def _section_header(title: str) -> list:
    return [
        Spacer(1, 5 * mm),
        Table(
            [[Paragraph(title, _style("h", fontSize=8, fontName="Helvetica-Bold", textColor=white))]],
            colWidths=[CW],
            style=TableStyle([
                ("BACKGROUND", (0, 0), (-1, -1), C_DARK),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING", (0, 0), (-1, -1), 8),
                ("RIGHTPADDING", (0, 0), (-1, -1), 8),
                ("ROWBACKGROUNDS", (0, 0), (-1, -1), [C_DARK]),
            ]),
        ),
        Spacer(1, 3 * mm),
    ]


_TS_BASE = TableStyle([
    ("FONTNAME", (0, 0), (-1, 0), "Helvetica-Bold"),
    ("FONTSIZE", (0, 0), (-1, -1), 7.5),
    ("TEXTCOLOR", (0, 0), (-1, 0), white),
    ("BACKGROUND", (0, 0), (-1, 0), C_DARK),
    ("ROWBACKGROUNDS", (0, 1), (-1, -1), [C_ROW_TINT, white]),
    ("ALIGN", (0, 0), (-1, -1), "LEFT"),
    ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
    ("GRID", (0, 0), (-1, -1), 0.3, C_GRID),
    ("TOPPADDING", (0, 0), (-1, -1), 3),
    ("BOTTOMPADDING", (0, 0), (-1, -1), 3),
    ("LEFTPADDING", (0, 0), (-1, -1), 5),
    ("RIGHTPADDING", (0, 0), (-1, -1), 5),
])


def _table(data: list[list], col_widths: list[float], extra_style: list | None = None) -> Table:
    ts = TableStyle(_TS_BASE.getCommands())
    if extra_style:
        for cmd in extra_style:
            ts.add(*cmd)
    t = Table(data, colWidths=col_widths, repeatRows=1)
    t.setStyle(ts)
    return t


def _fmt(v: object, decimals: int = 5) -> str:
    if v is None:
        return "—"
    try:
        f = float(v)  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return str(v)
    abs_f = abs(f)
    if abs_f != 0 and (abs_f < 0.001 or abs_f >= 1_000_000):
        return f"{f:.3e}"
    return f"{f:.{decimals}g}"


def _fmt_date(d: object) -> str:
    if d is None:
        return "—"
    return str(d)


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------
def generate_certificate(
    asset: "Asset",
    calibration: "Calibration",
    points: "list[CalibrationData]",
    procedure: "Procedure | None",
    reference_asset: "Asset | None",
    sensor: "Sensor | None",
    version: int,
    app_base_url: str,
) -> bytes:
    """
    Generate an A4 calibration certificate PDF and return its bytes.

    Sections: header (QR + cert info), asset info, traceability, results, dataset + chart.
    Footer contains lab name, performed_by, and 'Page X of Y'.
    """

    # -- QR code -----------------------------------------------------------
    qr_img_obj = _build_qr(asset, app_base_url)

    # -- Story (list of Flowables) ----------------------------------------
    story: list = []

    story += _build_header(asset, calibration, version, qr_img_obj)
    story += _build_asset_info(asset, sensor)
    story += _build_traceability(calibration, procedure, reference_asset)
    story += _build_results(calibration, points)
    story += _build_dataset(calibration, points, sensor)

    # -- Render ------------------------------------------------------------
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=LMARGIN,
        rightMargin=RMARGIN,
        topMargin=TMARGIN,
        bottomMargin=BMARGIN,
        title=f"Calibration Certificate — {asset.asset_id}",
        author="Open Gauge",
    )

    lab = calibration.external_lab_name or ""
    by = calibration.performed_by_name or ""
    canvas_cls = _make_canvas_class(lab, by)

    doc.build(story, canvasmaker=canvas_cls)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Section builders
# ---------------------------------------------------------------------------
def _build_qr(asset: "Asset", base_url: str):  # type: ignore[return]
    """Return a ReportLab Image of the QR code, or None on failure."""
    try:
        import qrcode  # type: ignore[import-untyped]

        url = f"{base_url.rstrip('/')}/assets/{asset.id}"
        qr = qrcode.make(url)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        buf.seek(0)
        return RLImage(buf, width=28 * mm, height=28 * mm)
    except Exception:
        logger.warning("QR code generation failed", exc_info=True)
        return None


def _build_header(
    asset: "Asset",
    cal: "Calibration",
    version: int,
    qr_img: object,
) -> list:
    """Full-width header: QR code left, title + cert info right."""
    title_block = [
        Paragraph("CERTIFICATE OF CALIBRATION", _style(
            "h1", fontSize=14, fontName="Helvetica-Bold", textColor=C_DARK, spaceAfter=3
        )),
        Paragraph(f"OG-CAL-{asset.asset_id}-v{version}", _style(
            "h1sub", fontSize=8, fontName="Courier", textColor=C_MID
        )),
    ]

    info_rows = [
        ["Asset ID", asset.asset_id or "—", "Calibration Date", _fmt_date(cal.calibration_date)],
        ["Asset Name", asset.name or "—", "Due Date", _fmt_date(cal.due_date)],
        ["Type", str(asset.asset_type.value).title() if asset.asset_type else "—", "Version", f"v{version}"],
        ["Performed by", cal.performed_by_name or "—", "Cal. Type", cal.calibration_type or "—"],
    ]

    info_table = Table(
        info_rows,
        colWidths=[22 * mm, 54 * mm, 28 * mm, 46 * mm],
        style=TableStyle([
            ("FONTNAME", (0, 0), (0, -1), "Helvetica-Bold"),
            ("FONTNAME", (2, 0), (2, -1), "Helvetica-Bold"),
            ("FONTSIZE", (0, 0), (-1, -1), 7.5),
            ("TEXTCOLOR", (0, 0), (0, -1), C_GRAY),
            ("TEXTCOLOR", (2, 0), (2, -1), C_GRAY),
            ("TEXTCOLOR", (1, 0), (1, -1), C_TEXT),
            ("TEXTCOLOR", (3, 0), (3, -1), C_TEXT),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("TOPPADDING", (0, 0), (-1, -1), 2.5),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
            ("LEFTPADDING", (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("LINEBELOW", (0, 0), (-1, -2), 0.3, C_GRID),
        ]),
    )

    qr_cell: object = qr_img if qr_img else Spacer(28 * mm, 28 * mm)

    header_table = Table(
        [[qr_cell, [title_block[0], title_block[1], Spacer(1, 3 * mm), info_table]]],
        colWidths=[32 * mm, CW - 32 * mm],
        style=TableStyle([
            ("VALIGN", (0, 0), (-1, -1), "TOP"),
            ("LEFTPADDING", (0, 0), (-1, -1), 0),
            ("RIGHTPADDING", (0, 0), (-1, -1), 0),
            ("TOPPADDING", (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
        ]),
    )

    return [
        header_table,
        Spacer(1, 3 * mm),
        Table(
            [[""]],
            colWidths=[CW],
            style=TableStyle([
                ("LINEABOVE", (0, 0), (-1, -1), 1.5, C_DARK),
            ]),
        ),
    ]


def _build_asset_info(asset: "Asset", sensor: "Sensor | None") -> list:
    story: list = _section_header("1. ASSET INFORMATION")

    general_data = [
        [_p("Asset ID", _S_LABEL), _p(asset.asset_id or "—"), _p("Asset Name", _S_LABEL), _p(asset.name or "—")],
        [_p("Manufacturer", _S_LABEL), _p(asset.manufacturer or "—"), _p("Model", _S_LABEL), _p(asset.model or "—")],
        [_p("Serial Number", _S_LABEL), _p(asset.serial_number or "—"), _p("Part Number", _S_LABEL), _p(asset.manufacturer_part_number or "—")],
        [_p("Type", _S_LABEL), _p(str(asset.asset_type.value).title() if asset.asset_type else "—"), _p("Notes", _S_LABEL), _p((asset.notes or "—")[:120])],
    ]
    cw4 = [30 * mm, 60 * mm, 30 * mm, CW - 120 * mm]
    story.append(_table(
        [["Field", "Value", "Field", "Value"]] + general_data,
        cw4,
    ))

    if sensor:
        story.append(Spacer(1, 3 * mm))
        story.append(_p("Channel Specification", _S_SECTION))
        ch_data = [
            [
                sensor.channel_id or "—",
                sensor.physical_quantity or "—",
                sensor.unit or "—",
                _fmt(sensor.measurement_min, 5),
                _fmt(sensor.measurement_max, 5),
                _fmt_accuracy(sensor),
                sensor.calibration_role or "—",
            ]
        ]
        story.append(_table(
            [["Channel", "Quantity", "Unit", "Min", "Max", "Accuracy", "Role"]] + ch_data,
            [20 * mm, 35 * mm, 18 * mm, 22 * mm, 22 * mm, 35 * mm, CW - 152 * mm],
        ))

    return story


def _fmt_accuracy(sensor: "Sensor") -> str:
    if sensor.accuracy_value is None:
        return "—"
    val = _fmt(sensor.accuracy_value, 4)
    t = f" {sensor.accuracy_type}" if sensor.accuracy_type else ""
    u = f" {sensor.accuracy_unit}" if sensor.accuracy_unit else ""
    return f"±{val}{u}{t}"


def _build_traceability(
    cal: "Calibration",
    procedure: "Procedure | None",
    ref_asset: "Asset | None",
) -> list:
    story: list = _section_header("2. TRACEABILITY & PROCEDURE")

    rows = [
        [_p("Calibration Type", _S_LABEL), _p(cal.calibration_type or "—"), _p("External Lab", _S_LABEL), _p(cal.external_lab_name or "—")],
        [_p("Certificate No.", _S_LABEL), _p(cal.external_lab_certificate_number or "—"), _p("Performed by", _S_LABEL), _p(cal.performed_by_name or "—")],
    ]
    if procedure:
        rows += [
            [_p("Procedure ID", _S_LABEL), _p(procedure.proc_id or "—"), _p("Procedure Name", _S_LABEL), _p(procedure.name or "—")],
            [_p("Procedure Version", _S_LABEL), _p(procedure.version or "—"), _p("Standard Ref.", _S_LABEL), _p(procedure.standard_ref or "—")],
        ]

    cw4 = [32 * mm, 58 * mm, 32 * mm, CW - 122 * mm]
    story.append(_table(
        [["Field", "Value", "Field", "Value"]] + rows,
        cw4,
    ))

    if ref_asset:
        story += [
            Spacer(1, 3 * mm),
            _p("Reference Standard", _S_SECTION),
            _table(
                [
                    ["Asset ID", "Name", "Manufacturer", "Model", "Serial No."],
                    [
                        ref_asset.asset_id or "—",
                        ref_asset.name or "—",
                        ref_asset.manufacturer or "—",
                        ref_asset.model or "—",
                        ref_asset.serial_number or "—",
                    ],
                ],
                [22 * mm, 55 * mm, 38 * mm, 38 * mm, CW - 153 * mm],
            ),
        ]

    env_parts = []
    if cal.temperature is not None:
        env_parts.append(f"Temperature: {_fmt(cal.temperature, 4)} °C")
    if cal.humidity is not None:
        env_parts.append(f"Humidity: {_fmt(cal.humidity, 4)} %RH")
    if cal.pressure is not None:
        env_parts.append(f"Pressure: {_fmt(cal.pressure, 4)} Pa")
    if env_parts:
        story += [
            Spacer(1, 2 * mm),
            _p(f"Environmental Conditions: {' · '.join(env_parts)}", _S_BODY),
        ]

    return story


def _build_results(cal: "Calibration", points: "list[CalibrationData] | None" = None) -> list:
    story: list = _section_header("3. CALIBRATION RESULTS")
    reference_unit = points[0].reference_unit if points else ""

    # Polynomial coefficients
    coeffs = cal.poly_coefficients
    if coeffs:
        degree = (len(coeffs) - 1) if coeffs else 0
        coeff_rows = []
        for k, v in enumerate(reversed(coeffs)):  # stored highest-degree first → show a0, a1, ...
            power = k
            coeff_rows.append([f"a{power}", f"x^{power}" if power > 0 else "1", _fmt(v, 8)])
        story.append(KeepTogether([
            _p("Polynomial Coefficients", _S_SECTION),
            _table(
                [["Coefficient", "Term", "Value"]] + coeff_rows,
                [22 * mm, 25 * mm, CW - 47 * mm],
            ),
        ]))
        story.append(Spacer(1, 3 * mm))

        # Human-readable equation
        if degree == 1:
            eq = f"y = {_fmt(coeffs[1], 6)} + {_fmt(coeffs[0], 6)}·x"
        elif degree == 2:
            eq = f"y = {_fmt(coeffs[2], 6)} + {_fmt(coeffs[1], 6)}·x + {_fmt(coeffs[0], 6)}·x²"
        else:
            terms = [f"{_fmt(coeffs[-(k+1)], 6)}·x^{degree - k}" for k in range(degree + 1)]
            eq = "y = " + " + ".join(terms)
        story.append(_p(f"Equation: {eq}", _S_MONO))
        story.append(Spacer(1, 3 * mm))

    # Statistical summary
    stat_rows: list[list] = []
    if cal.r_squared is not None:
        stat_rows.append(["R²", _fmt(cal.r_squared, 6), "RMSE", _fmt(cal.rmse, 6)])
    if cal.max_error is not None:
        stat_rows.append(["Max Error", _fmt(cal.max_error, 6), "Std Error", _fmt(cal.standard_error, 6)])
    if cal.full_scale_error is not None:
        stat_rows.append(["Full-Scale Error", f"{_fmt(cal.full_scale_error, 4)} %", "Non-Linearity", f"{_fmt(cal.non_linearity, 4)} %"])
    if cal.repeatability is not None:
        stat_rows.append(["Repeatability", _fmt(cal.repeatability, 6), "Hysteresis", _fmt(cal.hysteresis, 6)])
    if cal.expanded_uncertainty is not None:
        # GUM §7.2.6: quote uncertainty to at most 2 significant figures.
        u_rounded = round_to_sig_figs(cal.expanded_uncertainty, 2)
        uc_rounded = round_to_sig_figs(cal.combined_uncertainty, 2) if cal.combined_uncertainty is not None else None
        k_str = f"k={_fmt(cal.coverage_factor, 3)}" if cal.coverage_factor else ""
        cl_str = f"{_fmt(cal.confidence_level, 4)}%" if cal.confidence_level else ""
        stat_rows.append([
            "Expanded Uncertainty (U)", f"{u_rounded:g} [{k_str} {cl_str}]",
            "Combined Uncertainty (u_c)", f"{uc_rounded:g}" if uc_rounded is not None else "—",
        ])

    if stat_rows:
        story.append(KeepTogether([
            _p("Statistical Analysis", _S_SECTION),
            _table(
                [["Metric", "Value", "Metric", "Value"]] + stat_rows,
                [42 * mm, 48 * mm, 42 * mm, CW - 132 * mm],
            ),
        ]))

    # Uncertainty budget (GUM Annex H.1-style itemized contributions)
    budget = cal.uncertainty_budget
    if budget:
        budget_rows = [
            [
                str(row.get("source", "")),
                str(row.get("distribution", "")),
                # GUM §7.2.6: each u(x_i) quoted to at most 2 significant figures.
                f"{round_to_sig_figs(row['standard_uncertainty'], 2):g}" if row.get("standard_uncertainty") is not None else "—",
                _fmt(row.get("degrees_of_freedom"), 1),
            ]
            for row in budget
        ]
        story.append(Spacer(1, 3 * mm))
        story.append(KeepTogether([
            _p("Uncertainty Budget", _S_SECTION),
            _table(
                [["Source", "Distribution", "Standard Uncertainty (u)", "dof"]] + budget_rows,
                [55 * mm, 32 * mm, 45 * mm, CW - 132 * mm],
            ),
        ]))
        if cal.effective_degrees_of_freedom is not None:
            story.append(Spacer(1, 2 * mm))
            story.append(_p(
                f"Combined via root-sum-square (GUM Eq. 10); effective degrees of freedom "
                f"ν_eff = {_fmt(cal.effective_degrees_of_freedom, 1)} (Welch-Satterthwaite).",
                _S_BODY,
            ))

    # Full-sentence expanded-uncertainty statement (GUM §7.2.4 reporting format,
    # adapted for a calibration function rather than a single measurement result).
    statement_text = format_expanded_uncertainty_statement(
        combined_uncertainty=cal.combined_uncertainty,
        expanded_uncertainty=cal.expanded_uncertainty,
        coverage_factor=cal.coverage_factor,
        confidence_level=cal.confidence_level,
        unit=reference_unit,
        effective_degrees_of_freedom=cal.effective_degrees_of_freedom,
        range_min=cal.valid_range_min if cal.valid_range_min is not None else cal.range_min,
        range_max=cal.valid_range_max if cal.valid_range_max is not None else cal.range_max,
    )
    if statement_text:
        story.append(Spacer(1, 2 * mm))
        story.append(_p(statement_text, _S_BODY))

    # Statement of conformity (ISO/IEC 17025 §7.8.4.1(e), §7.8.6.2 — the decision
    # rule applied and which specification it was assessed against must be named).
    statement = cal.conformity_statement
    if statement and statement.get("specification"):
        story.append(Spacer(1, 3 * mm))
        rule_label = _DECISION_RULE_LABEL.get(statement.get("decision_rule", ""), statement.get("decision_rule", ""))
        result_label = "CONFORMS" if statement.get("passed") else "DOES NOT CONFORM"
        lines = [
            f"Statement of Conformity: {result_label} to specification {statement['specification']}.",
            f"Decision rule applied: {rule_label}.",
        ]
        if statement.get("expanded_uncertainty_applied") is not None:
            lines.append(
                f"Expanded uncertainty U = {_fmt(statement['expanded_uncertainty_applied'], 4)} "
                f"was applied to the acceptance zone per the decision rule above."
            )
        story.append(KeepTogether([
            _p("Statement of Conformity", _S_SECTION),
            *[_p(line, _S_BODY) for line in lines],
        ]))

    if cal.range_min is not None or cal.valid_range_min is not None:
        story.append(Spacer(1, 2 * mm))
        r_min = cal.valid_range_min if cal.valid_range_min is not None else cal.range_min
        r_max = cal.valid_range_max if cal.valid_range_max is not None else cal.range_max
        story.append(_p(f"Valid Range: {_fmt(r_min, 5)} to {_fmt(r_max, 5)}", _S_BODY))

    if cal.notes:
        story.append(Spacer(1, 2 * mm))
        story.append(_p(f"Notes: {cal.notes}", _S_BODY))

    return story


def _build_dataset(
    cal: "Calibration",
    points: "list[CalibrationData]",
    sensor: "Sensor | None",
) -> list:
    if not points:
        return []

    story: list = _section_header("4. DATASET")

    measured_unit = points[0].measured_unit if points else "—"
    reference_unit = points[0].reference_unit if points else "—"

    # Data table
    data_rows = []
    for pt in sorted(points, key=lambda p: p.point_index):
        data_rows.append([
            str(pt.point_index),
            _fmt(pt.measured_value, 6),
            _fmt(pt.reference_value, 6),
            _fmt(pt.calculated_value, 6),
            _fmt(pt.residual_abs, 6),
            _fmt(pt.residual_pct, 4) if pt.residual_pct is not None else "—",
        ])

    headers = [
        f"#",
        f"Measured\n({measured_unit})",
        f"Reference\n({reference_unit})",
        f"Fit Value\n({reference_unit})",
        "Residual\n(abs)",
        "Residual\n(%)",
    ]
    col_w = [8 * mm, 30 * mm, 30 * mm, 30 * mm, 30 * mm, CW - 128 * mm]
    data_table = _table([headers] + data_rows, col_w, extra_style=[
        ("ALIGN", (0, 0), (0, -1), "CENTER"),
        ("ALIGN", (1, 0), (-1, -1), "RIGHT"),
    ])

    story.append(data_table)

    # Chart
    coeffs = cal.poly_coefficients or []
    measured_vals = [float(pt.measured_value) for pt in points if pt.measured_value is not None]
    reference_vals = [float(pt.reference_value) for pt in points if pt.reference_value is not None]

    if measured_vals and reference_vals:
        story.append(Spacer(1, 4 * mm))
        story.append(_CalibrationChart(
            measured=measured_vals,
            reference=reference_vals,
            coefficients=coeffs,
            measured_unit=measured_unit,
            reference_unit=reference_unit,
            w=CW,
            h=88 * mm,
        ))

    return story
