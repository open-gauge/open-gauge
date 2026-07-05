"""
Polynomial regression and statistical analysis for calibration data.

Fits a polynomial correction model to (reference, measured) point pairs and
computes full metrological statistics: R², RMSE, uncertainty, hysteresis,
repeatability, pass/fail.

Uncertainty is evaluated per JCGM 100:2008 (GUM): the fit-residual scatter is
a Type A contribution, and the reference standard's uncertainty / the
sensor's resolution / its nominal accuracy spec are Type B contributions
(see ``references/References.md`` §2-§6). All contributions are combined via
the law of propagation of uncertainty (RSS) and expanded using a coverage
factor derived, where possible, from the Welch-Satterthwaite effective
degrees of freedom rather than the fit's own degrees of freedom alone.
"""

from __future__ import annotations

import math
from dataclasses import asdict, dataclass, field
from typing import Literal

import numpy as np
from scipy import stats


@dataclass
class AnalysisPoint:
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None = None
    residual_abs: float | None = None
    residual_pct: float | None = None


@dataclass
class UncertaintyContribution:
    """One row of a GUM Annex H.1-style uncertainty budget table."""

    source: str
    description: str
    value: float
    distribution: str
    divisor: float
    standard_uncertainty: float
    degrees_of_freedom: float | None  # None = treated as exactly known (infinite dof)


@dataclass
class AnalysisResult:
    poly_degree: int
    coefficients: list[float]          # highest degree first (np.polyfit convention)
    r_squared: float
    rmse: float
    standard_error: float
    max_error: float
    full_scale_error_pct: float
    non_linearity_pct: float
    repeatability: float | None
    hysteresis: float | None
    combined_uncertainty: float
    expanded_uncertainty: float
    distribution_type: str
    confidence_level: float
    coverage_factor: float
    valid_range_min: float
    valid_range_max: float
    passed: bool
    conformity_statement: dict = field(default_factory=dict)
    uncertainty_budget: list[dict] = field(default_factory=list)
    effective_degrees_of_freedom: float | None = None
    poly_coefficients_covariance: list[list[float]] | None = None
    points: list[AnalysisPoint] = field(default_factory=list)


def _fit_with_covariance(
    x: np.ndarray, y: np.ndarray, degree: int
) -> tuple[np.ndarray, np.ndarray | None]:
    """
    Fit y = f(x) as a degree-N polynomial and return (coefficients, covariance).

    Covariance is None when there are not enough points to estimate it
    (n <= degree + 1, i.e. zero residual degrees of freedom) — same condition
    under which the Type A row's degrees_of_freedom is None elsewhere in this
    module. Ignoring the coefficient covariance when using multiple fitted
    coefficients together understates uncertainty (GUM Annex H.3, GUM-6 §8.1.6).
    """
    if len(x) > degree + 1:
        coeffs, cov = np.polyfit(x, y, degree, cov=True)
        return coeffs, cov
    return np.polyfit(x, y, degree), None


def predict_with_uncertainty(
    coefficients: list[float],
    covariance: list[list[float]] | None,
    x: float,
) -> tuple[float, float | None]:
    """
    Evaluate a fitted polynomial at x and propagate the coefficient covariance
    to the predicted value's standard uncertainty (GUM Eq. H.15, generalized
    from the two-parameter slope/intercept case to degree-N polynomials).

    coefficients is in np.polyfit convention (highest degree first). Returns
    (predicted_value, standard_uncertainty); standard_uncertainty is None if
    no covariance matrix is available (e.g. the fit had zero residual dof).
    """
    coeffs = np.asarray(coefficients, dtype=float)
    y = float(np.polyval(coeffs, x))

    if covariance is None:
        return y, None

    cov = np.asarray(covariance, dtype=float)
    degree = len(coeffs) - 1
    # Sensitivity of y to each coefficient: g_i = dy/dc_i = x^(degree - i)
    g = np.array([x ** (degree - i) for i in range(len(coeffs))])
    variance = float(g @ cov @ g)
    return y, math.sqrt(variance) if variance > 0 else 0.0


def _aic(n: int, rss: float, k: int) -> float:
    """AIC for polynomial regression: n·ln(RSS/n) + 2k."""
    if rss <= 0 or n <= 0:
        return float("inf")
    return n * np.log(rss / n) + 2 * k


def _select_degree(x: np.ndarray, y: np.ndarray, max_degree: int = 5) -> int:
    """Auto-select polynomial degree using AIC with parsimony rule (stop if Δ < 2)."""
    n = len(x)
    best_degree = 1
    best_aic = float("inf")

    for d in range(1, min(max_degree, n - 1) + 1):
        coeffs = np.polyfit(x, y, d)
        fitted = np.polyval(coeffs, x)
        rss = float(np.sum((y - fitted) ** 2))
        k = d + 1
        aic = _aic(n, rss, k)
        if aic < best_aic - 2:
            best_aic = aic
            best_degree = d
        elif d > 1 and aic >= best_aic - 2:
            break

    return best_degree


def _detect_hysteresis(ref: np.ndarray, meas: np.ndarray) -> float | None:
    """
    Detect hysteresis if both an ascending and a descending sweep are present.
    Returns the max span of measured values at matching reference points, or None.
    """
    if len(ref) < 4:
        return None

    # Check for direction changes — need at least one ascending and one descending segment
    diffs = np.diff(ref)
    has_ascending = np.any(diffs > 0)
    has_descending = np.any(diffs < 0)
    if not (has_ascending and has_descending):
        return None

    # Group by reference value (rounded to avoid float noise)
    rounded = np.round(ref, decimals=6)
    unique_refs = np.unique(rounded)
    max_span = 0.0
    found_duplicates = False
    for r in unique_refs:
        mask = rounded == r
        if np.sum(mask) >= 2:
            found_duplicates = True
            span = float(np.max(meas[mask]) - np.min(meas[mask]))
            max_span = max(max_span, span)

    return max_span if found_duplicates else None


def _detect_repeatability(ref: np.ndarray, meas: np.ndarray) -> float | None:
    """
    Detect repeatability if 3+ measurements exist at the same reference value.
    Returns the max standard deviation across repeated points, or None.
    """
    rounded = np.round(ref, decimals=6)
    unique_refs, counts = np.unique(rounded, return_counts=True)
    triple_refs = unique_refs[counts >= 3]
    if len(triple_refs) == 0:
        return None

    max_std = 0.0
    for r in triple_refs:
        mask = rounded == r
        max_std = max(max_std, float(np.std(meas[mask], ddof=1)))
    return max_std


def _type_b_from_expanded(expanded_value: float, coverage_factor: float) -> float:
    """GUM §4.3.3: a cert/spec states uncertainty as U at coverage factor k -> u = U/k."""
    if coverage_factor <= 0:
        return abs(expanded_value)
    return abs(expanded_value) / coverage_factor


def _type_b_rectangular(half_width: float) -> float:
    """GUM §4.3.7: only bounds ±a known, no further info -> u = a/sqrt(3)."""
    return abs(half_width) / math.sqrt(3)


def _build_uncertainty_budget(
    residuals: np.ndarray,
    n: int,
    k: int,
    reference_standard_uncertainty: float | None,
    reference_standard_coverage_factor: float,
    resolution: float | None,
    sensor_nominal_uncertainty: float | None,
    sensor_nominal_coverage_factor: float,
    include_sensor_nominal_uncertainty: bool,
) -> list[UncertaintyContribution]:
    """
    Build a GUM-style uncertainty budget: one Type A row (fit residual scatter)
    plus whichever Type B rows the caller was able to supply. Contributions are
    combined via RSS in `_combine_budget`, so every entry here must already be
    expressed as a standard uncertainty in the measurand's own units.
    """
    std_res = float(np.std(residuals, ddof=1)) if n > 1 else 0.0
    dof_a = float(n - k) if n > k else None

    budget = [
        UncertaintyContribution(
            source="fit_residuals",
            description="Type A: standard deviation of calibration-fit residuals",
            value=std_res,
            distribution="normal",
            divisor=1.0,
            standard_uncertainty=std_res,
            degrees_of_freedom=dof_a,
        )
    ]

    if reference_standard_uncertainty is not None and reference_standard_uncertainty > 0:
        u = _type_b_from_expanded(reference_standard_uncertainty, reference_standard_coverage_factor)
        budget.append(UncertaintyContribution(
            source="reference_standard",
            description="Type B: uncertainty of the reference standard used for this calibration",
            value=reference_standard_uncertainty,
            distribution="normal",
            divisor=reference_standard_coverage_factor,
            standard_uncertainty=u,
            degrees_of_freedom=None,
        ))

    if resolution is not None and resolution > 0:
        u = _type_b_rectangular(resolution / 2.0)
        budget.append(UncertaintyContribution(
            source="resolution",
            description="Type B: instrument/sensor digital resolution (rectangular distribution)",
            value=resolution,
            distribution="rectangular",
            divisor=math.sqrt(12.0),
            standard_uncertainty=u,
            degrees_of_freedom=None,
        ))

    if (
        include_sensor_nominal_uncertainty
        and sensor_nominal_uncertainty is not None
        and sensor_nominal_uncertainty > 0
    ):
        u = _type_b_from_expanded(sensor_nominal_uncertainty, sensor_nominal_coverage_factor)
        budget.append(UncertaintyContribution(
            source="sensor_nominal_accuracy",
            description="Type B: sensor manufacturer nominal accuracy/uncertainty specification",
            value=sensor_nominal_uncertainty,
            distribution="normal",
            divisor=sensor_nominal_coverage_factor,
            standard_uncertainty=u,
            degrees_of_freedom=None,
        ))

    return budget


def _combine_budget(budget: list[UncertaintyContribution]) -> tuple[float, float | None]:
    """
    RSS-combine an uncertainty budget (GUM Eq. 10, uncorrelated inputs) and
    compute the effective degrees of freedom via the Welch-Satterthwaite
    formula (GUM Eq. G.2b). Contributions with degrees_of_freedom=None are
    treated as exactly known (they drop out of the Welch-Satterthwaite sum).
    Returns (combined_uncertainty, effective_degrees_of_freedom).
    """
    combined_u = math.sqrt(sum(c.standard_uncertainty ** 2 for c in budget))

    if combined_u <= 0:
        return combined_u, None

    denom = sum(
        (c.standard_uncertainty ** 4) / c.degrees_of_freedom
        for c in budget
        if c.degrees_of_freedom is not None and c.degrees_of_freedom > 0
    )
    if denom <= 0:
        return combined_u, None

    return combined_u, combined_u ** 4 / denom


def _expand(
    combined_u: float,
    dof_eff: float | None,
    distribution_type: str,
    confidence_level: float,
) -> tuple[float, float]:
    """
    Expanded uncertainty U = k * u_c (GUM Eq. 18). The coverage factor k is
    always *derived* from the requested confidence level (GUM §6.3, Annex G)
    rather than entered separately — there is no statistically meaningful way
    for a user to pick an arbitrary k independent of the confidence level and
    distribution shape, so MAR doesn't ask for one:
      - "t": k from the Student-t quantile at dof_eff (falls back to the
        normal quantile when dof_eff is unavailable/infinite — the correct
        limit as degrees of freedom -> infinity).
      - "chi_squared": k from the chi-squared quantile at dof_eff.
      - "normal": k from the normal quantile directly (the GUM §6.3.3 "simple
        case" — e.g. confidence_level=95 gives k≈1.96, ≈95.45% gives k=2).
    Returns (expanded_uncertainty, coverage_factor_used).
    """
    if distribution_type == "t":
        if dof_eff is not None and dof_eff > 0:
            k = float(stats.t.ppf(0.5 + confidence_level / 200.0, df=dof_eff))
        else:
            k = float(stats.norm.ppf(0.5 + confidence_level / 200.0))
    elif distribution_type == "chi_squared":
        if dof_eff is not None and dof_eff > 0:
            k = float(np.sqrt(stats.chi2.ppf(confidence_level / 100.0, df=dof_eff) / dof_eff))
        else:
            k = 1.0
    else:  # normal
        k = float(stats.norm.ppf(0.5 + confidence_level / 200.0))
    return combined_u * k, k


DecisionRule = Literal["simple_acceptance", "guard_band_w_uncertainty", "shared_risk"]


def _apply_decision_rule(
    residuals: np.ndarray,
    ref: np.ndarray,
    max_error: float,
    span: float,
    channel_accuracy_value: float | None,
    channel_accuracy_type: str | None,
    decision_rule: DecisionRule,
    expanded_uncertainty: float,
) -> tuple[bool, dict]:
    """
    Apply an ISO/IEC 17025 §7.1.3 / §7.8.6-compliant decision rule and return
    (passed, conformity_statement). See References.md §9.4 (ISO/IEC 17025
    requires the decision rule applied to a conformity statement to be
    documented, not just an unstated tolerance comparison).

    - simple_acceptance: accept iff the reading is within tolerance, ignoring
      measurement uncertainty (ISO/IEC Guide 98-4's "simple acceptance";
      matches MAR's original tolerance-only behavior).
    - guard_band_w_uncertainty: shrink the acceptance zone inward by the
      expanded uncertainty U (accept iff error + U <= tolerance), reducing
      the risk of a false accept.
    - shared_risk: expand the acceptance zone outward by U (accept iff
      error - U <= tolerance), reducing the risk of a false reject at the
      cost of some false-accept risk near the boundary.
    """
    if channel_accuracy_value is None or channel_accuracy_value <= 0:
        return True, {
            "decision_rule": decision_rule,
            "specification": None,
            "expanded_uncertainty_applied": None,
            "passed": True,
            "reason": "No accuracy specification provided; conformity not evaluated.",
        }

    guard = 0.0
    if decision_rule == "guard_band_w_uncertainty":
        guard = expanded_uncertainty
    elif decision_rule == "shared_risk":
        guard = -expanded_uncertainty

    if channel_accuracy_type == "percent_of_reading":
        tolerances = channel_accuracy_value / 100.0 * np.abs(ref)
        passed = bool(np.all(np.abs(residuals) + guard <= tolerances))
        spec_desc = f"±{channel_accuracy_value}% of reading"
    elif channel_accuracy_type == "percent_of_full_scale":
        tolerance = channel_accuracy_value / 100.0 * span
        passed = bool(max_error + guard <= tolerance)
        spec_desc = f"±{channel_accuracy_value}% of full scale"
    else:  # absolute
        passed = bool(max_error + guard <= channel_accuracy_value)
        spec_desc = f"±{channel_accuracy_value} (absolute)"

    return passed, {
        "decision_rule": decision_rule,
        "specification": spec_desc,
        "expanded_uncertainty_applied": expanded_uncertainty if decision_rule != "simple_acceptance" else None,
        "passed": passed,
        "reason": None,
    }


def run_analysis(
    reference_values: list[float],
    measured_values: list[float],
    reference_unit: str,
    measured_unit: str,
    poly_degree: int | None = None,
    distribution_type: Literal["normal", "t", "chi_squared"] = "normal",
    confidence_level: float = 95.0,
    channel_accuracy_value: float | None = None,
    channel_accuracy_type: str | None = None,
    reference_standard_uncertainty: float | None = None,
    reference_standard_coverage_factor: float = 2.0,
    resolution: float | None = None,
    sensor_nominal_uncertainty: float | None = None,
    sensor_nominal_coverage_factor: float = 2.0,
    include_sensor_nominal_uncertainty: bool = False,
    decision_rule: DecisionRule = "simple_acceptance",
) -> AnalysisResult:
    """
    Fit a polynomial model to calibration data and compute full statistics.

    reference_values / measured_values must be in SI units.
    poly_degree=None triggers automatic degree selection via AIC.

    There is no separate "coverage factor" input: the coverage factor k is
    always derived from confidence_level (and, for "t"/"chi_squared", the
    Welch-Satterthwaite effective degrees of freedom) — see `_expand`.

    Uncertainty contributions beyond the fit-residual scatter (Type A) are
    optional Type B inputs, each expressed in the measurand's own units:
      - reference_standard_uncertainty: expanded uncertainty (U) stated on the
        reference standard's own calibration certificate, with
        reference_standard_coverage_factor as its stated k.
      - resolution: the instrument's digital resolution (rectangular
        distribution per GUM §4.3.7).
      - sensor_nominal_uncertainty: the sensor's manufacturer-stated
        accuracy/uncertainty; only combined in when
        include_sensor_nominal_uncertainty=True, since it risks double-
        counting against the fit-residual (Type A) term otherwise.

    decision_rule selects how measurement uncertainty is factored into the
    pass/fail conformity statement, per ISO/IEC 17025 §7.1.3/§7.8.6 (see
    `_apply_decision_rule`).
    """
    if len(reference_values) < 2:
        raise ValueError("Need at least 2 data points for regression")
    if len(reference_values) != len(measured_values):
        raise ValueError("reference_values and measured_values must have the same length")

    ref = np.array(reference_values, dtype=float)
    meas = np.array(measured_values, dtype=float)

    # Select or use provided degree
    if poly_degree is None:
        degree = _select_degree(meas, ref)
    else:
        degree = max(1, min(poly_degree, 5))

    # Calibration function: reference = f(measured) — maps instrument reading to true value
    coeffs, coeffs_cov = _fit_with_covariance(meas, ref, degree)
    fitted = np.polyval(coeffs, meas)

    residuals = ref - fitted
    n = len(ref)
    k = degree + 1  # number of parameters

    # Core statistics
    ss_res = float(np.sum(residuals ** 2))
    ss_tot = float(np.sum((ref - np.mean(ref)) ** 2))
    r_squared = 1.0 - ss_res / ss_tot if ss_tot > 0 else 1.0
    rmse = float(np.sqrt(ss_res / n))
    standard_error = float(np.sqrt(ss_res / max(n - k, 1)))
    max_error = float(np.max(np.abs(residuals)))

    span = float(np.max(ref) - np.min(ref))
    full_scale_error_pct = (max_error / span * 100.0) if span > 0 else 0.0

    # Non-linearity: deviation of fitted curve from best-fit line
    lin_coeffs = np.polyfit(meas, fitted, 1)
    lin_fitted = np.polyval(lin_coeffs, meas)
    nl_max = float(np.max(np.abs(fitted - lin_fitted)))
    non_linearity_pct = (nl_max / span * 100.0) if span > 0 else 0.0

    # Hysteresis and repeatability
    hysteresis = _detect_hysteresis(ref, meas)
    repeatability = _detect_repeatability(ref, meas)

    # Uncertainty budget: Type A (fit residuals) + whichever Type B contributions
    # were supplied, combined via RSS with a Welch-Satterthwaite effective dof.
    budget = _build_uncertainty_budget(
        residuals, n, k,
        reference_standard_uncertainty, reference_standard_coverage_factor,
        resolution,
        sensor_nominal_uncertainty, sensor_nominal_coverage_factor, include_sensor_nominal_uncertainty,
    )
    combined_u, dof_eff = _combine_budget(budget)
    expanded_u, coverage_factor = _expand(combined_u, dof_eff, distribution_type, confidence_level)

    # Pass/fail against channel accuracy spec, per a documented decision rule
    # (ISO/IEC 17025 §7.1.3/§7.8.6 — see _apply_decision_rule).
    passed, conformity_statement = _apply_decision_rule(
        residuals, ref, max_error, span,
        channel_accuracy_value, channel_accuracy_type,
        decision_rule, expanded_u,
    )

    # Build point list
    points: list[AnalysisPoint] = []
    for i, (rv, mv, cv, res) in enumerate(zip(ref, meas, fitted, residuals)):
        res_pct = float(res / span * 100.0) if span > 0 else 0.0
        points.append(AnalysisPoint(
            point_index=i,
            reference_value=float(rv),
            measured_value=float(mv),
            calculated_value=float(cv),
            residual_abs=float(res),
            residual_pct=res_pct,
        ))

    return AnalysisResult(
        poly_degree=degree,
        coefficients=coeffs.tolist(),
        r_squared=round(r_squared, 8),
        rmse=round(rmse, 8),
        standard_error=round(standard_error, 8),
        max_error=round(max_error, 8),
        full_scale_error_pct=round(full_scale_error_pct, 4),
        non_linearity_pct=round(non_linearity_pct, 4),
        repeatability=round(repeatability, 8) if repeatability is not None else None,
        hysteresis=round(hysteresis, 8) if hysteresis is not None else None,
        combined_uncertainty=round(combined_u, 8),
        expanded_uncertainty=round(expanded_u, 8),
        distribution_type=distribution_type,
        confidence_level=confidence_level,
        coverage_factor=round(coverage_factor, 4),
        valid_range_min=float(np.min(ref)),
        valid_range_max=float(np.max(ref)),
        passed=passed,
        conformity_statement=conformity_statement,
        uncertainty_budget=[asdict(c) for c in budget],
        effective_degrees_of_freedom=dof_eff,
        poly_coefficients_covariance=coeffs_cov.tolist() if coeffs_cov is not None else None,
        points=points,
    )
