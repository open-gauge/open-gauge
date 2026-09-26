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
import random
import uuid
from datetime import date
from typing import TYPE_CHECKING

import numpy as np
import qrcode
from sqlalchemy.orm import Session

from ..models.location import Location
from ..models.organization import Organization
from ..models.user import User
from ..repositories import certificate_template as certtpl_repo
from ..repositories import document_template as doctpl_repo
from ..repositories import organization as org_repo
from ..repositories import stored_file as file_repo
from ..repositories import user_signature as signature_repo
from ..services import latex_service
from ..services import org_signing_key_service
from ..services import pdf_signing_service
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

# Human names for low-order polynomial coefficients, paired with a subscripted
# symbol (a0, a1, ...) for cross-reference with the function formula shown
# alongside the coefficient table. The symbol is rendered via LaTeX math-mode
# subscript syntax ($a_0$) rather than Unicode subscript characters (₀, ₁,
# ...) — DejaVu Sans does not reliably render those glyphs under Tectonic's
# XeTeX engine, so they were silently disappearing. Since this contains raw
# LaTeX, the template must reference \VAR{row.name} directly, not
# \VAR{row.name|latex} (the escape filter would mangle the math syntax).
_COEFFICIENT_NAME = {0: "Offset", 1: "Gain", 2: "Quadratic", 3: "Cubic"}


def _coefficient_name(power: int) -> str:
    base = _COEFFICIENT_NAME.get(power, f"a{power}")
    return f"{base} ($a_{{{power}}}$)"


# ---------------------------------------------------------------------------
# Pure formatting / context-building helpers (no DB or network access —
# directly unit-testable against plain Calibration-like objects)
# ---------------------------------------------------------------------------

def _has_model(cal: "Calibration") -> bool:
    """Mirrors the web app's hasModel (asset-detail-client.tsx) exactly, so the
    certificate agrees with the calibration detail view on whether this
    calibration has a real transfer function. False for frequency_response
    even though it stores an internal [gain, 0] poly_coefficients
    representation (see Calibration.data_entry_mode) — that's not a model in
    the usual sense, it gets its own dedicated results panel on the web app.
    """
    if cal.data_entry_mode == "frequency_response":
        return False
    return bool(cal.poly_coefficients) or (cal.model_type == "custom_formula" and bool(cal.custom_formula))


def _has_evaluable_curve(cal: "Calibration") -> bool:
    """Mirrors the web app's hasEvaluableCurve — broader than _has_model: a
    Lookup Table has no formula/coefficients but its own points (linearly
    interpolated) still make a perfectly good curve to draw."""
    return _has_model(cal) or cal.model_type == "lookup_table"


def _is_indicated_style(cal: "Calibration") -> bool:
    """Mirrors the web app's isIndicatedStyle: reference_vs_indicated, or a
    reference_vs_as_found_as_left calibration with no model, has no real
    transfer function to fit — the dataset shows an "Indicated" column
    instead of "Measured" and has no Fitted column at all (the "fitted"
    value on those points is just the measured value echoed back, not an
    actual fit — see calibration_analysis.run_analysis's skip_fit path)."""
    return cal.data_entry_mode == "reference_vs_indicated" or (
        cal.data_entry_mode == "reference_vs_as_found_as_left" and not _has_model(cal)
    )


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
    """Mirrors the web app's own accuracy display (asset-detail-client.tsx's
    SpecRow for "Accuracy": `±${value}${unit}`) — accuracy_unit already says
    everything accuracy_type would ("%FS", "%RDG", or a physical unit like
    "°C"), so appending a human label of accuracy_type too would just repeat
    the unit's meaning a second time (e.g. "±1 %FS % of full scale")."""
    if sensor.accuracy_value is None:
        return "—"
    val = _fmt(sensor.accuracy_value, 4)
    u = f" {sensor.accuracy_unit}" if sensor.accuracy_unit else ""
    return f"±{val}{u}"


def _build_function_formula(degree: int) -> str:
    """Generic (non-numeric) calibration function in LaTeX math syntax, e.g.
    'f(x) = a_0 + a_1 x + a_2 x^2' — paired with the named coefficient value
    table so a reader can match each row to its place in the function."""
    terms = ["a_0"]
    for power in range(1, degree + 1):
        terms.append("a_1 x" if power == 1 else f"a_{{{power}}} x^{power}")
    return "f(x) = " + " + ".join(terms)


def _build_coefficient_rows(coeffs: list[float] | None) -> tuple[list[dict], str | None]:
    """Returns (table rows, human-readable equation). coeffs are stored highest-degree first."""
    if not coeffs:
        return [], None
    degree = len(coeffs) - 1
    rows = [
        {
            "coefficient": f"a{power}", "name": _coefficient_name(power),
            "term": f"x^{power}" if power > 0 else "1", "value": _fmt(v, 8),
        }
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
    # A Lookup Table's "residuals" are an exact interpolant through its own
    # training data (R²=1, RMSE=0, ... by construction, not real statistics)
    # — same reasoning the wizard/detail view apply, skip the whole fit-
    # statistics block, keep only the uncertainty budget rows below (Type B
    # only, still meaningful).
    is_lookup_table = cal.model_type == "lookup_table"
    if cal.r_squared is not None and not is_lookup_table:
        rows.append({"label": "R²", "value": _fmt(cal.r_squared, 6)})
        rows.append({"label": "RMSE", "value": _fmt(cal.rmse, 6)})
    if cal.max_error is not None and not is_lookup_table:
        rows.append({"label": "Max Error", "value": _fmt(cal.max_error, 6)})
        rows.append({"label": "Std Error", "value": _fmt(cal.standard_error, 6)})
    if cal.full_scale_error is not None and not is_lookup_table:
        rows.append({"label": "Full-Scale Error", "value": f"{_fmt(cal.full_scale_error, 4)} %"})
        rows.append({"label": "Non-Linearity", "value": f"{_fmt(cal.non_linearity, 4)} %"})
    if cal.repeatability is not None and not is_lookup_table:
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


def _build_results_summary(cal: "Calibration", unit: str) -> list[dict]:
    """Max error / %FS error / expanded uncertainty — a compact three-row
    'error at a glance' table, distinct from the full statistical breakdown
    in stat_rows (used by example_tables.tex's results section)."""
    rows: list[dict] = []
    if cal.max_error is not None:
        rows.append({"label": "Max Error", "value": f"{_fmt(cal.max_error, 6)} {unit}".strip()})
    if cal.full_scale_error is not None:
        rows.append({"label": "% Full-Scale Error", "value": f"{_fmt(cal.full_scale_error, 4)} %"})
    if cal.expanded_uncertainty is not None:
        # GUM §7.2.6: quote uncertainty to at most 2 significant figures.
        u_rounded = round_to_sig_figs(cal.expanded_uncertainty, 2)
        k_str = f"k={_fmt(cal.coverage_factor, 3)}" if cal.coverage_factor else ""
        cl_str = f"{_fmt(cal.confidence_level, 4)}%" if cal.confidence_level else ""
        rows.append({
            "label": "Expanded Uncertainty (U)",
            "value": f"{u_rounded:g} {unit} [{k_str} {cl_str}]".replace("[ ]", "").strip(),
        })
    return rows


def _build_error_summary(cal: "Calibration", unit: str) -> dict | None:
    """Max error / %FS error / expanded uncertainty as a single compact row of
    three columns (Abs. Error, FS Error, Uncertainty), each signed with ±,
    for example_tables.tex's results section."""
    if cal.max_error is None and cal.full_scale_error is None and cal.expanded_uncertainty is None:
        return None
    abs_error = f"±{_fmt(cal.max_error, 4)} {unit}".strip() if cal.max_error is not None else "—"
    fs_error = f"±{_fmt(cal.full_scale_error, 4)} %" if cal.full_scale_error is not None else "—"
    if cal.expanded_uncertainty is not None:
        # GUM §7.2.6: quote uncertainty to at most 2 significant figures.
        u_rounded = round_to_sig_figs(cal.expanded_uncertainty, 2)
        uncertainty = f"±{u_rounded:g} {unit}".strip()
    else:
        uncertainty = "—"
    return {"abs_error": abs_error, "fs_error": fs_error, "uncertainty": uncertainty}


def _build_conformity_derivation(cal: "Calibration", conformity: dict | None, unit: str) -> str | None:
    """Narrates the max-error + expanded-uncertainty total against the
    specification the conformity statement was assessed against, so the
    pass/fail conclusion in the footer boilerplate is traceable to a number
    on the page rather than asserted on its own."""
    if not conformity or cal.max_error is None or cal.expanded_uncertainty is None:
        return None
    combined = cal.max_error + cal.expanded_uncertainty
    return (
        f"The maximum error ({_fmt(cal.max_error, 4)} {unit}) plus the expanded uncertainty "
        f"({_fmt(cal.expanded_uncertainty, 4)} {unit}) totals {_fmt(combined, 4)} {unit}, "
        f"against a specification of {conformity['specification']} — the calibration "
        f"{conformity['result_label']} to the specification."
    )


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


# Display label per uncertainty_budget entry `source` (see
# calibration_analysis._build_uncertainty_budget) — every source besides
# fit_residuals is a Type B contribution by construction in this system.
# Falls back to a humanized version of the raw source key for any future
# source not listed here, so a new Type B contribution never renders blank.
_UNCERTAINTY_SOURCE_LABEL = {
    "fit_residuals": "Fit residuals (Type A)",
    "reference_standard": "Reference standard (Type B)",
    "resolution": "Resolution (Type B)",
    "sensor_nominal_accuracy": "Sensor nominal accuracy (Type B)",
}


def _uncertainty_source_label(source: str) -> str:
    return _UNCERTAINTY_SOURCE_LABEL.get(source, f"{source.replace('_', ' ').capitalize()} (Type B)")


def _build_uncertainty_summary_rows(cal: "Calibration", unit: str) -> list[dict]:
    """Itemized GUM uncertainty budget — one named row per contribution that
    actually applies to this calibration (whichever of fit residuals/
    reference standard/resolution/sensor nominal accuracy were supplied),
    plus the combined (RSS) and expanded totals. Distinct from
    `_build_uncertainty_budget_rows` (a generic source/distribution/dof
    table) and `_build_stat_rows` (which folds combined/expanded into the
    statistics table) — this is a single self-contained budget table for
    templates that want one.
    """
    rows: list[dict] = []
    for row in cal.uncertainty_budget or []:
        if row.get("standard_uncertainty") is None:
            continue
        rows.append({
            "label": _uncertainty_source_label(str(row.get("source", ""))),
            "value": f"{_fmt(row['standard_uncertainty'], 4)} {unit}".strip(),
        })
    if cal.combined_uncertainty is not None:
        rows.append({"label": "Combined (RSS)", "value": f"{_fmt(cal.combined_uncertainty, 4)} {unit}".strip()})
    if cal.expanded_uncertainty is not None:
        # GUM §7.2.6: quote uncertainty to at most 2 significant figures.
        u_rounded = round_to_sig_figs(cal.expanded_uncertainty, 2)
        k_str = f" (k={_fmt(cal.coverage_factor, 3)})" if cal.coverage_factor else ""
        rows.append({"label": "Expanded (±)", "value": f"{u_rounded:g} {unit}{k_str}".strip()})
    return rows


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
    calibration_location_name: str | None = None,
) -> dict:
    reference_unit = points[0].reference_unit if points else ""
    measured_unit = points[0].measured_unit if points else ""

    coefficient_rows, equation = _build_coefficient_rows(calibration.poly_coefficients)
    # data_entry_mode=model_direct with model_type=custom_formula: there's no
    # coefficient table to render (nothing was fitted, the formula was
    # declared as-is) — show the formula text directly instead.
    if calibration.model_type == "custom_formula" and calibration.custom_formula:
        coefficient_rows = []
        equation = f"y = {calibration.custom_formula}"
    asset_type_label = str(asset.asset_type.value).title() if asset.asset_type else "—"

    valid_range = None
    if calibration.range_min is not None or calibration.valid_range_min is not None:
        r_min = calibration.valid_range_min if calibration.valid_range_min is not None else calibration.range_min
        r_max = calibration.valid_range_max if calibration.valid_range_max is not None else calibration.range_max
        valid_range = f"{_fmt(r_min, 5)} to {_fmt(r_max, 5)}"

    channel = None
    if sensor:
        range_str = f"{_fmt(sensor.measurement_min, 5)}–{_fmt(sensor.measurement_max, 5)} {sensor.unit or ''}".strip()
        if sensor.output_signal_min is not None and sensor.output_signal_max is not None:
            signal_str = (
                f"{_fmt(sensor.output_signal_min, 5)}–{_fmt(sensor.output_signal_max, 5)} "
                f"{sensor.output_signal_unit or ''}"
            ).strip()
        else:
            signal_str = "—"
        if sensor.measurement_uncertainty is not None:
            precision_str = f"±{_fmt(sensor.measurement_uncertainty, 4)} {sensor.uncertainty_unit or ''}".strip()
        else:
            precision_str = "—"
        if sensor.resolution is not None:
            resolution_str = f"{_fmt(sensor.resolution, 4)} {sensor.resolution_unit or ''}".strip()
        else:
            resolution_str = "—"
        channel = {
            "id": sensor.channel_id or "—",
            "quantity": sensor.physical_quantity or "—",
            "unit": sensor.unit or "—",
            "min": _fmt(sensor.measurement_min, 5),
            "max": _fmt(sensor.measurement_max, 5),
            "accuracy": _fmt_accuracy(sensor),
            "range": range_str,
            "signal": signal_str,
            "precision": precision_str,
            "resolution": resolution_str,
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

    # "Chapter"/"Revision"/"Calibration ID" — document-control fields used by
    # accredited-lab-style templates (see example_tables.tex.jinja) alongside
    # the certificate_number/version already used by the built-in template.
    chapter = channel["quantity"].title() if channel else asset_type_label

    conformity = _build_conformity(calibration)
    degree = len(calibration.poly_coefficients) - 1 if calibration.poly_coefficients else 0
    function_formula = (
        f"f(x) = {calibration.custom_formula}"
        if calibration.model_type == "custom_formula" and calibration.custom_formula
        else _build_function_formula(degree)
    )

    return {
        "certificate_number": certificate_number,
        "org_name": organization.name if organization else "Open Gauge",
        # Organization.full_name is an optional registered/legal name, distinct from the
        # short display "name" used elsewhere (letterheads, etc.) — falls back to "name"
        # when not set, same as "org_name" falls back to "Open Gauge" when there's no org.
        "org_legal_name": (
            (organization.full_name or organization.name) if organization else "Open Gauge"
        ),
        "org_logo_path": None,
        "performer_name": calibration.performed_by_name or "—",
        "performer_signature_path": None,
        "checked_by_name": calibration.checked_by_name or None,
        "checked_by_signature_path": None,
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
        "asset_type_label": asset_type_label,
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
        "function_formula": function_formula,
        "stat_rows": _build_stat_rows(calibration),
        "results_summary": _build_results_summary(calibration, reference_unit),
        "error_summary": _build_error_summary(calibration, reference_unit),
        "uncertainty_budget_rows": _build_uncertainty_budget_rows(calibration),
        "uncertainty_summary_rows": _build_uncertainty_summary_rows(calibration, reference_unit),
        "effective_dof_note": _build_effective_dof_note(calibration),
        "uncertainty_statement": _build_uncertainty_statement(calibration, reference_unit),
        "conformity": conformity,
        "conformity_derivation": _build_conformity_derivation(calibration, conformity, reference_unit),
        "valid_range": valid_range,
        "notes": calibration.notes,
        "dataset_rows": _build_dataset_rows(points) if points else [],
        # Mirrors the web app's isIndicatedStyle (see asset-detail-client.tsx) so the dataset
        # table's column labels/shape match the calibration detail view exactly. A skip_fit
        # calibration's "fitted" value is just the measured value echoed back (no real fit was
        # computed — see calibration_analysis.run_analysis), so templates should hide that
        # column entirely for these rather than show a misleading duplicate of "measured".
        "is_indicated_style": _is_indicated_style(calibration),
        "measured_or_indicated_label": "Indicated" if _is_indicated_style(calibration) else "Measured",
        "measured_unit": measured_unit or "—",
        "reference_unit": reference_unit or "—",
        "qr_path": None,
        "chart_path": None,
        "residuals_chart_path": None,
        "lab_footer": calibration.external_lab_name or (organization.name if organization else None),
        "chapter": chapter,
        "calibration_id": str(calibration.id)[:8].upper(),
        "generated_date": date.today().isoformat(),
        "calibration_location": calibration_location_name,
    }


def _build_document_template_context(
    asset: "Asset",
    calibration: "Calibration",
    points: "list[CalibrationData]",
    procedure: "Procedure | None",
    reference_asset: "Asset | None",
    sensor: "Sensor | None",
    organization: "Organization | None",
    version: int,
    certificate_number: str,
    app_base_url: str,
    calibration_location_name: str | None = None,
) -> dict:
    """Same underlying data as `_build_template_context`, restructured to the dot-path variable
    catalog the editor's templates use (`apps/web/src/lib/template-variables.ts`), for real
    calibration data instead of the editor's sample-preview values. Only covers the categories
    certificate templates actually expose (asset/channel/calibration/calibration_results/
    measurements/organization/user/dates/page) — procedure-only categories (equipment, steps,
    acceptance, ...) don't apply to a per-calibration generated report.

    Reuses `_build_template_context`'s formatted values where the shape lines up, rather than
    recomputing them, to avoid duplicating its formatting/fallback logic.
    """
    flat = _build_template_context(
        asset, calibration, points, procedure, reference_asset, sensor, organization, version,
        certificate_number, calibration_location_name,
    )
    reference_unit = points[0].reference_unit if points else ""

    measurement_range = "—"
    if sensor and sensor.measurement_min is not None and sensor.measurement_max is not None:
        measurement_range = f"{_fmt(sensor.measurement_min, 5)} to {_fmt(sensor.measurement_max, 5)} {sensor.unit or ''}".strip()
    output_signal_range = "—"
    if sensor and sensor.output_signal_min is not None and sensor.output_signal_max is not None:
        output_signal_range = (
            f"{_fmt(sensor.output_signal_min, 5)} to {_fmt(sensor.output_signal_max, 5)} {sensor.output_signal_unit or ''}"
        ).strip()

    address_parts = [
        organization.address_street if organization else None,
        organization.address_city if organization else None,
        organization.address_state if organization else None,
        organization.address_postal_code if organization else None,
        organization.address_country if organization else None,
    ]
    org_address = ", ".join(p for p in address_parts if p) or "—"

    ctx: dict = {
        "asset.id": flat["asset_id"],
        "asset.name": flat["asset_name"],
        "asset.serial_number": flat["asset_serial"],
        "asset.manufacturer": flat["asset_manufacturer"],
        "asset.model": flat["asset_model"],
        "asset.type": flat["asset_type_label"],
        "asset.description": asset.notes or "—",
        "asset.location": calibration_location_name or "—",
        "asset.status": "Active" if asset.is_active else "Inactive",
        "asset.public_url": f"{app_base_url.rstrip('/')}/assets/{asset.id}",
        "channel.id": sensor.channel_id if sensor else "—",
        "channel.physical_quantity": sensor.physical_quantity if sensor else "—",
        "channel.unit": sensor.unit if sensor else "—",
        "channel.technology": (sensor.technology or "—") if sensor else "—",
        "channel.range_min": _fmt(sensor.measurement_min, 5) if sensor else "—",
        "channel.range_max": _fmt(sensor.measurement_max, 5) if sensor else "—",
        "channel.measurement_range": measurement_range,
        "channel.accuracy": _fmt_accuracy(sensor) if sensor else "—",
        "channel.resolution": _fmt(sensor.resolution, 4) if sensor else "—",
        "channel.uncertainty": _fmt(sensor.measurement_uncertainty, 4) if sensor else "—",
        "channel.output_signal_min": _fmt(sensor.output_signal_min, 5) if sensor else "—",
        "channel.output_signal_max": _fmt(sensor.output_signal_max, 5) if sensor else "—",
        "channel.output_signal_unit": (sensor.output_signal_unit or "—") if sensor else "—",
        "channel.output_signal_range": output_signal_range,
        "calibration.id": flat["calibration_id"],
        "calibration.date": flat["calibration_date"],
        "calibration.next_date": flat["due_date"],
        "calibration.type": flat["calibration_type"],
        "calibration.method": procedure.name if procedure else "—",
        "calibration.status": (calibration.status or "—").replace("_", " ").title(),
        "calibration.laboratory": flat["org_name"],
        "calibration.certificate_number": certificate_number,
        "calibration.certificate_url": f"{app_base_url.rstrip('/')}/assets/{asset.id}?calibration={calibration.id}",
        "calibration.technician": flat["performer_name"],
        "calibration.coefficients": (
            ", ".join(f"a_{i}={_fmt(c, 6)}" for i, c in enumerate(reversed(calibration.poly_coefficients or [])))
            or "—"
        ),
        "calibration.polynomial_order": (len(calibration.poly_coefficients) - 1) if calibration.poly_coefficients else 0,
        "calibration.statistics.r_squared": _fmt(calibration.r_squared, 6) if calibration.r_squared is not None else "—",
        "calibration.statistics.rmse": f"{_fmt(calibration.rmse, 4)} {reference_unit}".strip() if calibration.rmse is not None else "—",
        "calibration.statistics.max_error": f"{_fmt(calibration.max_error, 4)} {reference_unit}".strip() if calibration.max_error is not None else "—",
        "calibration.statistics.full_scale_error": f"{_fmt(calibration.full_scale_error, 4)} %FS" if calibration.full_scale_error is not None else "—",
        "calibration.statistics.non_linearity": f"{_fmt(calibration.non_linearity, 4)} %FS" if calibration.non_linearity is not None else "—",
        "calibration.statistics.hysteresis": f"{_fmt(calibration.hysteresis, 4)} {reference_unit}".strip() if calibration.hysteresis is not None else "—",
        "calibration.uncertainty.combined": f"{_fmt(calibration.combined_uncertainty, 4)} {reference_unit}".strip() if calibration.combined_uncertainty is not None else "—",
        "calibration.uncertainty.expanded": (
            f"{_fmt(calibration.expanded_uncertainty, 4)} {reference_unit} (k={_fmt(calibration.coverage_factor, 2)})".strip()
            if calibration.expanded_uncertainty is not None
            else "—"
        ),
        "organization.name": flat["org_name"],
        "organization.address": org_address,
        "organization.email": (organization.email if organization else None) or "—",
        "organization.website": (organization.website if organization else None) or "—",
        "organization.accreditation_number": "—",  # not modeled — no field on Organization today
        "user.name": flat["performer_name"],
        "user.email": "—",
        "user.role": "—",
        "date.current": flat["generated_date"],
        "date.calibration": flat["calibration_date"],
        "date.issue": flat["generated_date"],
        "date.expiration": flat["due_date"],
        # Internal-only keys (not part of the public variable catalog): resolved by the caller
        # (generate_certificate_from_document_template) for the "checked_by" signature block.
        "_checked_by_name": calibration.checked_by_name or "—",
    }

    # measurement.* repeating rows for the table `repeat` binding. Per-point uncertainty isn't
    # tracked individually — the calibration's combined uncertainty is repeated per row as the
    # closest real value available.
    combined_uncertainty_str = _fmt(calibration.combined_uncertainty, 4) if calibration.combined_uncertainty is not None else "—"
    ctx["_collections"] = {
        "measurements": [
            {
                "index": row["index"],
                "reference": row["reference"],
                "measured": row["measured"],
                "fitted": row["fit"],
                "residual": row["residual_abs"],
                "uncertainty": combined_uncertainty_str,
            }
            for row in flat["dataset_rows"]
        ],
    }
    return ctx


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


def _render_residuals_chart_png(reference: list[float], residual: list[float], reference_unit: str) -> bytes:
    """Residual-vs-reference chart, mirroring the web app's ResidualsChart
    (reference on x, absolute residual on y, dashed zero line) — see
    apps/web/src/components/residuals-chart.tsx. Unlike the fitted-curve
    chart (_render_chart_png, only meaningful when there's an evaluable
    curve — see generate_certificate's has_evaluable_curve), residuals are
    always defined, so this chart is generated for every calibration with
    data, including skip_fit modes (reference_vs_indicated, etc.) that have
    no transfer function at all.
    """
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6.3, 3.1), dpi=200)
    x_min, x_max = min(reference), max(reference)
    ax.axhline(0, color="#9ca3af", linewidth=1.0, linestyle="--", zorder=1)
    ax.scatter(reference, residual, s=16, color="#1b4f64", zorder=3)
    unit_suffix = f" ({reference_unit})" if reference_unit else ""
    ax.set_xlabel(f"Reference{unit_suffix}", fontsize=8)
    ax.set_ylabel(f"Residual{unit_suffix}", fontsize=8)
    ax.tick_params(labelsize=7)
    ax.grid(True, linewidth=0.4, color="#e5e7eb", zorder=0)
    for spine in ax.spines.values():
        spine.set_color("#1b4f64")
        spine.set_linewidth(0.6)
    fig.tight_layout()
    buf = io.BytesIO()
    fig.savefig(buf, format="png", facecolor="white")
    plt.close(fig)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# Randomized sample data for the admin "preview a template" feature
# ---------------------------------------------------------------------------

def build_random_preview_context(num_points: int = 10) -> tuple[dict, dict[str, bytes]]:
    """Build a plausible, randomized context + images for previewing a
    template in the admin UI, without needing a real calibration on hand.

    Unlike latex_service.dummy_context() (fixed, minimal, used to validate
    that an uploaded template compiles at all), this generates a fresh random
    linear-calibration dataset every call — a real scatter+fit chart alongside
    a matching dataset table, so an admin previewing a template sees something
    close to what a real certificate looks like.
    """
    true_gain = round(random.uniform(0.85, 1.15), 4)
    true_offset = round(random.uniform(-3.0, 3.0), 4)
    reference_vals = sorted(round(random.uniform(0, 100), 2) for _ in range(num_points))

    measured_vals: list[float] = []
    residual_abs_vals: list[float] = []
    dataset_rows: list[dict] = []
    for i, ref in enumerate(reference_vals):
        measured = (ref - true_offset) / true_gain + random.uniform(-0.4, 0.4)
        fit = true_gain * measured + true_offset
        residual_abs = fit - ref
        residual_pct = (residual_abs / ref * 100) if ref else 0.0
        measured_vals.append(measured)
        residual_abs_vals.append(residual_abs)
        dataset_rows.append({
            "index": str(i),
            "measured": _fmt(measured, 6),
            "reference": _fmt(ref, 6),
            "fit": _fmt(fit, 6),
            "residual_abs": _fmt(residual_abs, 6),
            "residual_pct": _fmt(residual_pct, 4),
        })

    coefficient_rows, equation = _build_coefficient_rows([true_gain, true_offset])
    max_abs_residual = max((abs(v) for v in residual_abs_vals), default=0.0)
    full_scale_pct = (max_abs_residual / 100 * 100) if reference_vals else 0.0
    expanded_uncertainty = max_abs_residual * 2
    specification = "±0.5 V (absolute)"
    result_label = "CONFORMS" if (max_abs_residual + expanded_uncertainty) <= 0.5 else "DOES NOT CONFORM"

    context = latex_service.dummy_context()
    context.update({
        "dataset_rows": dataset_rows,
        "measured_unit": "V",
        "reference_unit": "V",
        "coefficient_rows": coefficient_rows,
        "equation": equation,
        "function_formula": _build_function_formula(1),
        "calibration_id": f"CAL-{random.randint(1000, 9999)}",
        "chapter": "Voltage",
        "generated_date": date.today().isoformat(),
        "calibration_location": "Metrology Lab A",
        "results_summary": [
            {"label": "Max Error", "value": f"{_fmt(max_abs_residual, 6)} V"},
            {"label": "% Full-Scale Error", "value": f"{_fmt(full_scale_pct, 4)} %"},
            {"label": "Expanded Uncertainty (U)", "value": f"{_fmt(expanded_uncertainty, 4)} V [k=2.00 95.00%]"},
        ],
        "error_summary": {
            "abs_error": f"±{_fmt(max_abs_residual, 4)} V",
            "fs_error": f"±{_fmt(full_scale_pct, 4)} %",
            "uncertainty": f"±{_fmt(expanded_uncertainty, 4)} V",
        },
        "conformity": {
            "result_label": result_label,
            "specification": specification,
            "decision_rule_label": "Simple acceptance (tolerance only, per ISO/IEC Guide 98-4)",
            "expanded_uncertainty_line": None,
        },
        "conformity_derivation": (
            f"The maximum error ({_fmt(max_abs_residual, 4)} V) plus the expanded uncertainty "
            f"({_fmt(expanded_uncertainty, 4)} V) totals {_fmt(max_abs_residual + expanded_uncertainty, 4)} V, "
            f"against a specification of {specification} — the calibration {result_label} to the specification."
        ),
    })

    images = {
        "logo.png": latex_service.dummy_placeholder_png(),
        "signature.png": latex_service.dummy_placeholder_png(),
        "qr.png": _render_qr_png("https://example.com/preview") or latex_service.dummy_placeholder_png(),
        "chart.png": _render_chart_png(measured_vals, reference_vals, [true_gain, true_offset], "V", "V"),
    }
    return context, images


# ---------------------------------------------------------------------------
# Organization / template resolution
# ---------------------------------------------------------------------------

def resolve_organization(db: Session, asset: "Asset", calibration: "Calibration | None") -> "Organization | None":
    """The asset's own organization_id (authoritative — set directly when the
    asset was created), falling back to its location's org, then the
    performing user's first active organization membership. The last fallback
    is skipped when `calibration` is None (e.g. resolving candidates for a
    calibration that doesn't exist yet)."""
    if asset.organization_id:
        org = db.query(Organization).filter(Organization.id == asset.organization_id).first()
        if org:
            return org
    if asset.location_id:
        location = db.query(Location).filter(Location.id == asset.location_id).first()
        if location:
            org = db.query(Organization).filter(Organization.id == location.organization_id).first()
            if org:
                return org
    if calibration and calibration.performed_by_user_id:
        orgs = org_repo.list_user_organizations(db, calibration.performed_by_user_id)
        if orgs:
            return orgs[0]
    return None


def resolve_performer_user_id(db: Session, calibration: "Calibration") -> "uuid.UUID | None":
    """Which user's signature to attach to the certificate: the explicitly
    linked performer, or — as a fallback — an active user whose display name
    exactly matches the free-text performed_by_name. The fallback covers
    calibrations recorded before performed_by_user_id was linked (e.g. older
    records, or CSV/seed imports), so a signature still shows up whenever the
    typed name unambiguously identifies a real account.
    """
    if calibration.performed_by_user_id:
        return calibration.performed_by_user_id
    if calibration.performed_by_name:
        matched_user = (
            db.query(User)
            .filter(User.name == calibration.performed_by_name, User.is_active.is_(True))
            .first()
        )
        if matched_user:
            return matched_user.id
    return None


def _read_file_text(db: Session, file_id) -> str | None:
    f = file_repo.get_by_id(db, file_id)
    if not f:
        return None
    data = storage_svc.download_file(f.storage_path, f.bucket)
    if data is None:
        return None
    return data.decode("utf-8")


def resolve_template_source(
    db: Session, organization: "Organization | None", template_id: uuid.UUID | None = None,
) -> str:
    """Resolve the .tex Jinja source to use.

    If `template_id` is given, that specific active template is used regardless
    of scope (an explicit choice, e.g. from the calibration certificate download
    dropdown) — raises ValueError if it doesn't exist or isn't active. Otherwise:
    org default -> global default -> built-in.

    Guarantees certificates still generate on a fresh install with zero
    configuration — the built-in template is read straight off local disk,
    no DB row required.
    """
    if template_id is not None:
        row = certtpl_repo.get_by_id(db, template_id)
        if not row or not row.is_active:
            raise ValueError(f"Certificate template {template_id} not found")
        text = _read_file_text(db, row.template_file_id)
        if text is None:
            raise ValueError(f"Certificate template {template_id} file is unavailable")
        return text
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
    template_id: uuid.UUID | None = None,
) -> bytes:
    """Generate a calibration certificate PDF and return its bytes.

    `template_id`, if given, forces a specific active template to be used
    instead of the resolved org/global/built-in default (e.g. a one-off
    "download with this template" request) — see `resolve_template_source`.
    """
    organization = resolve_organization(db, asset, calibration)
    certificate_number = f"OG-CAL-{asset.asset_id}-v{version}"

    calibration_location_name = None
    if calibration.calibration_location_id:
        location = db.query(Location).filter(Location.id == calibration.calibration_location_id).first()
        if location:
            calibration_location_name = location.name

    context = _build_template_context(
        asset, calibration, points, procedure, reference_asset, sensor, organization, version, certificate_number,
        calibration_location_name=calibration_location_name,
    )

    images: dict[str, bytes] = {}

    qr_bytes = _render_qr_png(f"{app_base_url.rstrip('/')}/assets/{asset.id}")
    if qr_bytes:
        images["qr.png"] = qr_bytes
        context["qr_path"] = "qr.png"

    measured_vals = [float(p.measured_value) for p in points if p.measured_value is not None]
    reference_vals = [float(p.reference_value) for p in points if p.reference_value is not None]
    # A skip_fit calibration (reference_vs_indicated, or
    # reference_vs_as_found_as_left with no model) has no transfer function
    # to plot, and the web app shows only the residuals chart for those —
    # drawing a "fit" line there would be fabricating a curve that was never
    # computed. See _has_evaluable_curve.
    if _has_evaluable_curve(calibration) and measured_vals and reference_vals:
        chart_bytes = _render_chart_png(
            measured_vals, reference_vals, calibration.poly_coefficients or [],
            context["measured_unit"], context["reference_unit"],
        )
        images["chart.png"] = chart_bytes
        context["chart_path"] = "chart.png"

    # Residuals are always defined (even with no transfer function), so this
    # chart is generated unconditionally whenever there's data — see
    # _render_residuals_chart_png.
    residual_pairs = [
        (float(p.reference_value), float(p.residual_abs))
        for p in points if p.reference_value is not None and p.residual_abs is not None
    ]
    if residual_pairs:
        residual_refs, residual_vals = zip(*residual_pairs)
        residuals_bytes = _render_residuals_chart_png(
            list(residual_refs), list(residual_vals), context["reference_unit"],
        )
        images["residuals.png"] = residuals_bytes
        context["residuals_chart_path"] = "residuals.png"

    if organization and organization.logo_file_id:
        logo_bytes = None
        logo_file = file_repo.get_by_id(db, organization.logo_file_id)
        if logo_file:
            logo_bytes = storage_svc.download_file(logo_file.storage_path, logo_file.bucket)
        logo_png = _normalize_to_png(logo_bytes) if logo_bytes else None
        if logo_png:
            images["logo.png"] = logo_png
            context["org_logo_path"] = "logo.png"

    performer_user_id = resolve_performer_user_id(db, calibration)
    if performer_user_id:
        sig = signature_repo.get_active(db, performer_user_id)
        if sig:
            sig_bytes = None
            sig_file = file_repo.get_by_id(db, sig.image_file_id)
            if sig_file:
                sig_bytes = storage_svc.download_file(sig_file.storage_path, sig_file.bucket)
            sig_png = _normalize_to_png(sig_bytes) if sig_bytes else None
            if sig_png:
                images["signature.png"] = sig_png
                context["performer_signature_path"] = "signature.png"

    if calibration.checked_by_user_id:
        sig = signature_repo.get_active(db, calibration.checked_by_user_id)
        if sig:
            sig_file = file_repo.get_by_id(db, sig.image_file_id)
            sig_bytes = storage_svc.download_file(sig_file.storage_path, sig_file.bucket) if sig_file else None
            sig_png = _normalize_to_png(sig_bytes) if sig_bytes else None
            if sig_png:
                images["checked_signature.png"] = sig_png
                context["checked_by_signature_path"] = "checked_signature.png"

    template_source = resolve_template_source(db, organization, template_id=template_id)
    rendered = latex_service.render_template(template_source, context)
    pdf_bytes = latex_service.compile_tex(rendered, images)

    # Embed a PAdES digital signature — a post-processing step on the
    # compiled bytes, so it applies identically regardless of which
    # template produced them. organization=None falls back to a single
    # instance-wide signing certificate (see org_signing_key_service).
    signer_name = organization.name if organization else "Open Gauge (self-hosted instance)"
    org_key = org_signing_key_service.get_or_create_signing_key(
        db,
        organization_id=organization.id if organization else None,
        subject_common_name=signer_name,
        created_by=calibration.created_by,
    )
    return pdf_signing_service.sign_certificate_pdf(
        pdf_bytes, org_key, reason=f"Calibration certificate issued by {signer_name}"
    )


def resolve_uploaded_images(db: Session, document: dict) -> dict[str, bytes]:
    """Fetches and PNG-normalizes every "image" block's uploaded file in a document template,
    keyed by file id — shared by real report generation and the sample-data admin preview, both
    of which pass the result straight to `document_template_latex.document_to_latex` as
    `images_by_file_id`."""
    from .document_template_latex import collect_image_file_ids

    images_by_file_id: dict[str, bytes] = {}
    for file_id in collect_image_file_ids(document):
        img_file = file_repo.get_by_id(db, uuid.UUID(file_id))
        img_bytes = storage_svc.download_file(img_file.storage_path, img_file.bucket) if img_file else None
        img_png = _normalize_to_png(img_bytes) if img_bytes else None
        if img_png:
            images_by_file_id[file_id] = img_png
    return images_by_file_id


def build_sample_document_context() -> tuple[dict, dict[str, bytes]]:
    """Static dot-path sample values for previewing an editor (JSON) document template with no
    real calibration on hand — mirrors apps/web/src/lib/template-variables.ts's sample catalog
    key-for-key, so an admin's preview here looks like the editor's own "Preview Data" mode
    instead of a differently-shaped placeholder. Deterministic (not randomized, unlike
    `build_random_preview_context`) since it backs many small list-row thumbnails at once — no
    value in generating a fresh dataset per row."""
    ctx: dict = {
        "asset.id": "OG-000123",
        "asset.name": "PT100 Temperature Sensor",
        "asset.serial_number": "SN-2026-00421",
        "asset.manufacturer": "Fluke",
        "asset.model": "5628",
        "asset.type": "Temperature Sensor",
        "asset.description": "Reference PT100 probe used for tank calibration.",
        "asset.location": "Lab A / Bench 3",
        "asset.status": "Active",
        "asset.public_url": "https://opengauge.example/assets/OG-000123",
        "channel.id": "TT",
        "channel.physical_quantity": "Temperature",
        "channel.unit": "°C",
        "channel.technology": "RTD Pt100",
        "channel.range_min": "-20",
        "channel.range_max": "600",
        "channel.measurement_range": "-20 to 600 °C",
        "channel.accuracy": "± 0.048 °C",
        "channel.resolution": "0.31",
        "channel.uncertainty": "0.124",
        "channel.output_signal_min": "4",
        "channel.output_signal_max": "20",
        "channel.output_signal_unit": "mA",
        "channel.output_signal_range": "4 to 20 mA",
        "calibration.id": "CAL-2026-04471",
        "calibration.date": "28 Aug 2026",
        "calibration.next_date": "28 Aug 2027",
        "calibration.type": "Periodic",
        "calibration.method": "Comparison to reference standard",
        "calibration.status": "Valid",
        "calibration.laboratory": "Open Gauge Calibration Lab",
        "calibration.certificate_number": "CERT-2026-01187",
        "calibration.certificate_url": "https://opengauge.example/certificates/CERT-2026-01187",
        "calibration.technician": "Jordan Reyes",
        "calibration.coefficients": "a0=0.1023, a1=0.9987, a2=-0.00004",
        "calibration.polynomial_order": 2,
        "calibration.statistics.r_squared": "0.9998",
        "calibration.statistics.rmse": "0.304 °C",
        "calibration.statistics.max_error": "0.612 °C",
        "calibration.statistics.full_scale_error": "0.15 %FS",
        "calibration.statistics.non_linearity": "0.08 %FS",
        "calibration.statistics.hysteresis": "0.04 %FS",
        "calibration.uncertainty.combined": "0.18 °C",
        "calibration.uncertainty.expanded": "0.36 °C (k=2)",
        "organization.name": "Open Gauge Metrology",
        "organization.address": "1200 Industrial Ave, Springfield",
        "organization.email": "lab@opengauge.example",
        "organization.website": "opengauge.example",
        "organization.accreditation_number": "ISO/IEC 17025 - 4471",
        "user.name": "Jordan Reyes",
        "user.email": "jordan.reyes@opengauge.example",
        "user.role": "Calibration Technician",
        "date.current": "28 Aug 2026",
        "date.calibration": "28 Aug 2026",
        "date.issue": "28 Aug 2026",
        "date.expiration": "28 Aug 2027",
        "_checked_by_name": "Alex Morgan",
        "_collections": {
            "measurements": [
                {"index": "1", "reference": "0.000", "measured": "0.021", "fitted": "0.006", "residual": "0.015", "uncertainty": "0.021"},
                {"index": "2", "reference": "100.000", "measured": "100.041", "fitted": "100.006", "residual": "0.035", "uncertainty": "0.021"},
                {"index": "3", "reference": "200.000", "measured": "200.038", "fitted": "200.011", "residual": "0.027", "uncertainty": "0.021"},
                {"index": "4", "reference": "300.000", "measured": "300.052", "fitted": "300.019", "residual": "0.033", "uncertainty": "0.021"},
                {"index": "5", "reference": "400.000", "measured": "400.047", "fitted": "400.024", "residual": "0.023", "uncertainty": "0.021"},
            ],
        },
    }
    return ctx, {}


def generate_certificate_from_document_template(
    db: Session,
    asset: "Asset",
    calibration: "Calibration",
    points: "list[CalibrationData]",
    procedure: "Procedure | None",
    reference_asset: "Asset | None",
    sensor: "Sensor | None",
    version: int,
    app_base_url: str,
    document_template_id: uuid.UUID,
) -> bytes:
    """Same job as `generate_certificate`, but the source is a published editor (JSON) template
    instead of a hand-authored .tex upload — generates LaTeX from the document via
    `document_template_latex.document_to_latex` and compiles it the same way. Shares this
    function's image-gathering (QR/signatures) and PAdES signing steps for parity between the
    two template kinds."""
    from .document_template_latex import document_to_latex

    template = doctpl_repo.get_by_id(db, document_template_id)
    if not template or template.status != "published":
        raise ValueError(f"Document template {document_template_id} not found or not published")

    organization = resolve_organization(db, asset, calibration)
    certificate_number = f"OG-CAL-{asset.asset_id}-v{version}"

    calibration_location_name = None
    if calibration.calibration_location_id:
        location = db.query(Location).filter(Location.id == calibration.calibration_location_id).first()
        if location:
            calibration_location_name = location.name

    context = _build_document_template_context(
        asset, calibration, points, procedure, reference_asset, sensor, organization, version, certificate_number,
        app_base_url, calibration_location_name=calibration_location_name,
    )

    performer_user_id = resolve_performer_user_id(db, calibration)
    if performer_user_id:
        sig = signature_repo.get_active(db, performer_user_id)
        if sig:
            sig_file = file_repo.get_by_id(db, sig.image_file_id)
            sig_bytes = storage_svc.download_file(sig_file.storage_path, sig_file.bucket) if sig_file else None
            sig_png = _normalize_to_png(sig_bytes) if sig_bytes else None
            if sig_png:
                context["_signature_prepared_by_bytes"] = sig_png
    if calibration.checked_by_user_id:
        sig = signature_repo.get_active(db, calibration.checked_by_user_id)
        if sig:
            sig_file = file_repo.get_by_id(db, sig.image_file_id)
            sig_bytes = storage_svc.download_file(sig_file.storage_path, sig_file.bucket) if sig_file else None
            sig_png = _normalize_to_png(sig_bytes) if sig_bytes else None
            if sig_png:
                context["_signature_checked_by_bytes"] = sig_png

    images_by_file_id = resolve_uploaded_images(db, template.document)

    images: dict[str, bytes] = {}
    tex_source = document_to_latex(template.document, context, images, images_by_file_id)
    pdf_bytes = latex_service.compile_tex(tex_source, images)

    signer_name = organization.name if organization else "Open Gauge (self-hosted instance)"
    org_key = org_signing_key_service.get_or_create_signing_key(
        db,
        organization_id=organization.id if organization else None,
        subject_common_name=signer_name,
        created_by=calibration.created_by,
    )
    return pdf_signing_service.sign_certificate_pdf(
        pdf_bytes, org_key, reason=f"Calibration certificate issued by {signer_name}"
    )
