"""
Calibration certificate generator.

Resolves the organization's (or global) active default LaTeX template —
falling back to the built-in template shipped with the app — renders it with
the calibration's data via Jinja, and compiles it to PDF via Tectonic.
See latex_service.py for the rendering/compilation primitives.
"""
from __future__ import annotations

import io
import logging
from typing import TYPE_CHECKING

import numpy as np
import qrcode
from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.organization import Organization
from ..models.user import User
from ..repositories import certificate_template as certtpl_repo
from ..repositories import stored_file as file_repo
from ..repositories import user_signature as signature_repo
from ..services import latex_service
from ..services import storage as storage_svc
from ..utils.uncertainty_format import format_expanded_uncertainty_statement, round_to_sig_figs

if TYPE_CHECKING:
    from ..models.asset import Asset
    from ..models.calibration import Calibration
    from ..models.calibration_method import Procedure
    from ..models.calibration_point import CalibrationData
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
# Pure formatting / context-building helpers (no DB or network access —
# directly unit-testable against plain Calibration-like objects)
# ---------------------------------------------------------------------------

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


def _fmt_accuracy(sensor: "Sensor") -> str:
    if sensor.accuracy_value is None:
        return "—"
    val = _fmt(sensor.accuracy_value, 4)
    t = f" {sensor.accuracy_type}" if sensor.accuracy_type else ""
    u = f" {sensor.accuracy_unit}" if sensor.accuracy_unit else ""
    return f"±{val}{u}{t}"


def _build_coefficient_rows(coeffs: list[float] | None) -> tuple[list[dict], str | None]:
    """Returns (table rows, human-readable equation). coeffs are stored highest-degree first."""
    if not coeffs:
        return [], None
    degree = len(coeffs) - 1
    rows = [
        {"coefficient": f"a{power}", "term": f"x^{power}" if power > 0 else "1", "value": _fmt(v, 8)}
        for power, v in enumerate(reversed(coeffs))
    ]
    if degree == 1:
        eq = f"y = {_fmt(coeffs[1], 6)} + {_fmt(coeffs[0], 6)}*x"
    elif degree == 2:
        eq = f"y = {_fmt(coeffs[2], 6)} + {_fmt(coeffs[1], 6)}*x + {_fmt(coeffs[0], 6)}*x^2"
    else:
        terms = [f"{_fmt(coeffs[-(k + 1)], 6)}*x^{degree - k}" for k in range(degree + 1)]
        eq = "y = " + " + ".join(terms)
    return rows, eq


def _build_stat_rows(cal: "Calibration") -> list[dict]:
    rows: list[dict] = []
    if cal.r_squared is not None:
        rows.append({"label": "R²", "value": _fmt(cal.r_squared, 6)})
        rows.append({"label": "RMSE", "value": _fmt(cal.rmse, 6)})
    if cal.max_error is not None:
        rows.append({"label": "Max Error", "value": _fmt(cal.max_error, 6)})
        rows.append({"label": "Std Error", "value": _fmt(cal.standard_error, 6)})
    if cal.full_scale_error is not None:
        rows.append({"label": "Full-Scale Error", "value": f"{_fmt(cal.full_scale_error, 4)} %"})
        rows.append({"label": "Non-Linearity", "value": f"{_fmt(cal.non_linearity, 4)} %"})
    if cal.repeatability is not None:
        rows.append({"label": "Repeatability", "value": _fmt(cal.repeatability, 6)})
        rows.append({"label": "Hysteresis", "value": _fmt(cal.hysteresis, 6)})
    if cal.expanded_uncertainty is not None:
        # GUM §7.2.6: quote uncertainty to at most 2 significant figures.
        u_rounded = round_to_sig_figs(cal.expanded_uncertainty, 2)
        uc_rounded = round_to_sig_figs(cal.combined_uncertainty, 2) if cal.combined_uncertainty is not None else None
        k_str = f"k={_fmt(cal.coverage_factor, 3)}" if cal.coverage_factor else ""
        cl_str = f"{_fmt(cal.confidence_level, 4)}%" if cal.confidence_level else ""
        rows.append({
            "label": "Expanded Uncertainty (U)",
            "value": f"{u_rounded:g} [{k_str} {cl_str}]".replace("[ ]", "").strip(),
        })
        rows.append({
            "label": "Combined Uncertainty (u_c)",
            "value": f"{uc_rounded:g}" if uc_rounded is not None else "—",
        })
    return rows


def _build_uncertainty_budget_rows(cal: "Calibration") -> list[dict]:
    budget = cal.uncertainty_budget
    if not budget:
        return []
    return [
        {
            "source": str(row.get("source", "")),
            "distribution": str(row.get("distribution", "")),
            # GUM §7.2.6: each u(x_i) quoted to at most 2 significant figures.
            "standard_uncertainty": (
                f"{round_to_sig_figs(row['standard_uncertainty'], 2):g}"
                if row.get("standard_uncertainty") is not None else "—"
            ),
            "dof": _fmt(row.get("degrees_of_freedom"), 1),
        }
        for row in budget
    ]


def _build_effective_dof_note(cal: "Calibration") -> str | None:
    if cal.effective_degrees_of_freedom is None:
        return None
    return (
        "Combined via root-sum-square (GUM Eq. 10); effective degrees of freedom "
        f"ν_eff = {_fmt(cal.effective_degrees_of_freedom, 1)} (Welch-Satterthwaite)."
    )


def _build_conformity(cal: "Calibration") -> dict | None:
    """Statement of conformity (ISO/IEC 17025 §7.8.4.1(e), §7.8.6.2 — the decision
    rule applied and which specification it was assessed against must be named)."""
    statement = cal.conformity_statement
    if not statement or not statement.get("specification"):
        return None
    rule_label = _DECISION_RULE_LABEL.get(statement.get("decision_rule", ""), statement.get("decision_rule", ""))
    result_label = "CONFORMS" if statement.get("passed") else "DOES NOT CONFORM"
    expanded_line = None
    if statement.get("expanded_uncertainty_applied") is not None:
        expanded_line = (
            f"Expanded uncertainty U = {_fmt(statement['expanded_uncertainty_applied'], 4)} "
            "was applied to the acceptance zone per the decision rule above."
        )
    return {
        "result_label": result_label,
        "specification": statement["specification"],
        "decision_rule_label": rule_label,
        "expanded_uncertainty_line": expanded_line,
    }


def _build_uncertainty_statement(cal: "Calibration", reference_unit: str) -> str | None:
    return format_expanded_uncertainty_statement(
        combined_uncertainty=cal.combined_uncertainty,
        expanded_uncertainty=cal.expanded_uncertainty,
        coverage_factor=cal.coverage_factor,
        confidence_level=cal.confidence_level,
        unit=reference_unit,
        effective_degrees_of_freedom=cal.effective_degrees_of_freedom,
        range_min=cal.valid_range_min if cal.valid_range_min is not None else cal.range_min,
        range_max=cal.valid_range_max if cal.valid_range_max is not None else cal.range_max,
    ) or None


def _build_dataset_rows(points: "list[CalibrationData]") -> list[dict]:
    rows = []
    for pt in sorted(points, key=lambda p: p.point_index):
        rows.append({
            "index": str(pt.point_index),
            "measured": _fmt(pt.measured_value, 6),
            "reference": _fmt(pt.reference_value, 6),
            "fit": _fmt(pt.calculated_value, 6),
            "residual_abs": _fmt(pt.residual_abs, 6),
            "residual_pct": _fmt(pt.residual_pct, 4) if pt.residual_pct is not None else "—",
        })
    return rows


def _build_template_context(
    asset: "Asset",
    calibration: "Calibration",
    points: "list[CalibrationData]",
    procedure: "Procedure | None",
    reference_asset: "Asset | None",
    sensor: "Sensor | None",
    organization: "Organization | None",
    version: int,
    certificate_number: str,
) -> dict:
    reference_unit = points[0].reference_unit if points else ""
    measured_unit = points[0].measured_unit if points else ""

    coefficient_rows, equation = _build_coefficient_rows(calibration.poly_coefficients)

    valid_range = None
    if calibration.range_min is not None or calibration.valid_range_min is not None:
        r_min = calibration.valid_range_min if calibration.valid_range_min is not None else calibration.range_min
        r_max = calibration.valid_range_max if calibration.valid_range_max is not None else calibration.range_max
        valid_range = f"{_fmt(r_min, 5)} to {_fmt(r_max, 5)}"

    channel = None
    if sensor:
        channel = {
            "id": sensor.channel_id or "—",
            "quantity": sensor.physical_quantity or "—",
            "unit": sensor.unit or "—",
            "min": _fmt(sensor.measurement_min, 5),
            "max": _fmt(sensor.measurement_max, 5),
            "accuracy": _fmt_accuracy(sensor),
        }

    procedure_ctx = None
    if procedure:
        procedure_ctx = {
            "id": procedure.proc_id or "—",
            "name": procedure.name or "—",
            "version": procedure.version or "—",
            "standard_ref": procedure.standard_ref or "—",
        }

    reference_asset_ctx = None
    if reference_asset:
        reference_asset_ctx = {
            "id": reference_asset.asset_id or "—",
            "name": reference_asset.name or "—",
            "manufacturer": reference_asset.manufacturer or "—",
            "model": reference_asset.model or "—",
            "serial": reference_asset.serial_number or "—",
        }

    return {
        "certificate_number": certificate_number,
        "org_name": organization.name if organization else "Open Gauge",
        "org_logo_path": None,
        "performer_name": calibration.performed_by_name or "—",
        "performer_signature_path": None,
        "calibration_date": _fmt_date(calibration.calibration_date),
        "due_date": _fmt_date(calibration.due_date),
        "version": version,
        "calibration_type": calibration.calibration_type or "—",
        "asset_id": asset.asset_id or "—",
        "asset_name": asset.name or "—",
        "asset_manufacturer": asset.manufacturer or "—",
        "asset_model": asset.model or "—",
        "asset_serial": asset.serial_number or "—",
        "asset_part_number": asset.manufacturer_part_number or "—",
        "asset_type_label": str(asset.asset_type.value).title() if asset.asset_type else "—",
        "asset_notes": asset.notes or None,
        "channel": channel,
        "external_lab_name": calibration.external_lab_name,
        "external_lab_certificate_number": calibration.external_lab_certificate_number,
        "procedure": procedure_ctx,
        "reference_asset": reference_asset_ctx,
        "temperature": _fmt(calibration.temperature, 4) if calibration.temperature is not None else None,
        "humidity": _fmt(calibration.humidity, 4) if calibration.humidity is not None else None,
        "pressure": _fmt(calibration.pressure, 4) if calibration.pressure is not None else None,
        "coefficient_rows": coefficient_rows,
        "equation": equation,
        "stat_rows": _build_stat_rows(calibration),
        "uncertainty_budget_rows": _build_uncertainty_budget_rows(calibration),
        "effective_dof_note": _build_effective_dof_note(calibration),
        "uncertainty_statement": _build_uncertainty_statement(calibration, reference_unit),
        "conformity": _build_conformity(calibration),
        "valid_range": valid_range,
        "notes": calibration.notes,
        "dataset_rows": _build_dataset_rows(points) if points else [],
        "measured_unit": measured_unit or "—",
        "reference_unit": reference_unit or "—",
        "qr_path": None,
        "chart_path": None,
        "lab_footer": calibration.external_lab_name or (organization.name if organization else None),
    }


# ---------------------------------------------------------------------------
# Image rendering (QR code, results chart) and normalization
# ---------------------------------------------------------------------------

def _normalize_to_png(data: bytes) -> bytes | None:
    """Decode arbitrary image bytes (PNG/JPEG/ICO/BMP/WEBP/...) and re-encode as PNG.

    Org logos and profile pictures are only validated as "an image/* content
    type" at upload time (see users.py/organizations.py), not as a specific
    format — a browser will happily submit a .ico with content-type
    image/x-icon. LaTeX's \\includegraphics can only load PNG/JPEG/PDF, so
    every image handed to Tectonic is normalized here first. Returns None
    (never raises) if the bytes can't be decoded as an image at all, so a bad
    stored file degrades to "logo omitted", not a failed certificate.
    """
    try:
        from PIL import Image

        img = Image.open(io.BytesIO(data))
        img.load()
        if img.mode not in ("RGBA", "RGB", "LA", "L"):
            img = img.convert("RGBA")
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        logger.warning("Could not decode image for certificate embedding", exc_info=True)
        return None


def _render_qr_png(url: str) -> bytes:
    try:
        qr = qrcode.make(url)
        buf = io.BytesIO()
        qr.save(buf, format="PNG")
        return buf.getvalue()
    except Exception:
        logger.warning("QR code generation failed", exc_info=True)
        return b""


def _render_chart_png(
    measured: list[float],
    reference: list[float],
    coefficients: list[float],
    measured_unit: str,
    reference_unit: str,
) -> bytes:
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6.3, 3.1), dpi=200)
    ax.scatter(measured, reference, s=16, color="#1b4f64", zorder=3, label="Data")
    if coefficients:
        x_min, x_max = min(measured), max(measured)
        span = (x_max - x_min) or 1.0
        xs = np.linspace(x_min - span * 0.05, x_max + span * 0.05, 150)
        ys = np.polyval(coefficients, xs)
        ax.plot(xs, ys, color="#2f819b", linewidth=1.6, label="Fit", zorder=2)
    ax.set_xlabel(f"Measured ({measured_unit})", fontsize=8)
    ax.set_ylabel(f"Reference ({reference_unit})", fontsize=8)
    ax.tick_params(labelsize=7)
    ax.grid(True, linewidth=0.4, color="#e5e7eb", zorder=0)
    for spine in ax.spines.values():
        spine.set_color("#1b4f64")
        spine.set_linewidth(0.6)
    ax.legend(fontsize=7, frameon=False, loc="best")
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor="white")
    plt.close(fig)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Organization / template resolution
# ---------------------------------------------------------------------------

def _resolve_organization(db: Session, asset: "Asset", calibration: "Calibration") -> "Organization | None":
    """Asset's location org, falling back to the performing user's org."""
    if asset.location_id:
        location = db.query(Location).filter(Location.id == asset.location_id).first()
        if location:
            org = db.query(Organization).filter(Organization.id == location.organization_id).first()
            if org:
                return org
    if calibration.performed_by_user_id:
        user = db.query(User).filter(User.id == calibration.performed_by_user_id).first()
        if user and user.organization_id:
            org = db.query(Organization).filter(Organization.id == user.organization_id).first()
            if org:
                return org
    return None


def _read_file_text(db: Session, file_id) -> str | None:
    f = file_repo.get_by_id(db, file_id)
    if not f:
        return None
    data = storage_svc.download_file(f.storage_path, f.bucket)
    if data is None:
        return None
    return data.decode("utf-8")


def resolve_template_source(db: Session, organization: "Organization | None") -> str:
    """Resolve the .tex Jinja source to use: org default -> global default -> built-in.

    Guarantees certificates still generate on a fresh install with zero
    configuration — the built-in template is read straight off local disk,
    no DB row required.
    """
    if organization:
        row = certtpl_repo.get_active_default(db, organization.id)
        if row:
            text = _read_file_text(db, row.template_file_id)
            if text is not None:
                return text
    global_row = certtpl_repo.get_active_default(db, None)
    if global_row:
        text = _read_file_text(db, global_row.template_file_id)
        if text is not None:
            return text
    return latex_service.BUILTIN_TEMPLATE_PATH.read_text(encoding="utf-8")


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def generate_certificate(
    db: Session,
    asset: "Asset",
    calibration: "Calibration",
    points: "list[CalibrationData]",
    procedure: "Procedure | None",
    reference_asset: "Asset | None",
    sensor: "Sensor | None",
    version: int,
    app_base_url: str,
) -> bytes:
    """Generate a calibration certificate PDF and return its bytes."""
    organization = _resolve_organization(db, asset, calibration)
    certificate_number = f"OG-CAL-{asset.asset_id}-v{version}"

    context = _build_template_context(
        asset, calibration, points, procedure, reference_asset, sensor, organization, version, certificate_number,
    )

    images: dict[str, bytes] = {}

    qr_bytes = _render_qr_png(f"{app_base_url.rstrip('/')}/assets/{asset.id}")
    if qr_bytes:
        images["qr.png"] = qr_bytes
        context["qr_path"] = "qr.png"

    measured_vals = [float(p.measured_value) for p in points if p.measured_value is not None]
    reference_vals = [float(p.reference_value) for p in points if p.reference_value is not None]
    if measured_vals and reference_vals:
        chart_bytes = _render_chart_png(
            measured_vals, reference_vals, calibration.poly_coefficients or [],
            context["measured_unit"], context["reference_unit"],
        )
        images["chart.png"] = chart_bytes
        context["chart_path"] = "chart.png"

    if organization and organization.logo_file_id:
        logo_bytes = None
        logo_file = file_repo.get_by_id(db, organization.logo_file_id)
        if logo_file:
            logo_bytes = storage_svc.download_file(logo_file.storage_path, logo_file.bucket)
        logo_png = _normalize_to_png(logo_bytes) if logo_bytes else None
        if logo_png:
            images["logo.png"] = logo_png
            context["org_logo_path"] = "logo.png"

    if calibration.performed_by_user_id:
        sig = signature_repo.get_active(db, calibration.performed_by_user_id)
        if sig:
            sig_bytes = None
            sig_file = file_repo.get_by_id(db, sig.image_file_id)
            if sig_file:
                sig_bytes = storage_svc.download_file(sig_file.storage_path, sig_file.bucket)
            sig_png = _normalize_to_png(sig_bytes) if sig_bytes else None
            if sig_png:
                images["signature.png"] = sig_png
                context["performer_signature_path"] = "signature.png"

    template_source = resolve_template_source(db, organization)
    rendered = latex_service.render_template(template_source, context)
    return latex_service.compile_tex(rendered, images)
