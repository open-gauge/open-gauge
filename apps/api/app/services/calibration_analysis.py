"""
Polynomial regression and statistical analysis for calibration data.

Fits a polynomial correction model to (reference, measured) point pairs and
computes full metrological statistics: R², RMSE, uncertainty, hysteresis,
repeatability, pass/fail.
"""

from __future__ import annotations

from dataclasses import dataclass, field
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
    points: list[AnalysisPoint] = field(default_factory=list)


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


def _uncertainty(
    residuals: np.ndarray,
    distribution_type: str,
    confidence_level: float,
    coverage_factor: float,
    n: int,
    k: int,
) -> tuple[float, float]:
    """Return (combined_uncertainty, expanded_uncertainty)."""
    std_res = float(np.std(residuals, ddof=1))

    if distribution_type == "t":
        dof = n - k
        if dof > 0:
            t_factor = float(stats.t.ppf(0.5 + confidence_level / 200.0, df=dof))
            expanded = std_res * t_factor
        else:
            expanded = std_res * coverage_factor
    elif distribution_type == "chi_squared":
        dof = n - k
        if dof > 0:
            chi2_factor = float(np.sqrt(stats.chi2.ppf(confidence_level / 100.0, df=dof) / dof))
            expanded = std_res * chi2_factor
        else:
            expanded = std_res * coverage_factor
    else:  # normal
        expanded = std_res * coverage_factor

    return std_res, expanded


def run_analysis(
    reference_values: list[float],
    measured_values: list[float],
    reference_unit: str,
    measured_unit: str,
    poly_degree: int | None = None,
    distribution_type: Literal["normal", "t", "chi_squared"] = "normal",
    confidence_level: float = 95.0,
    coverage_factor: float = 2.0,
    channel_accuracy_value: float | None = None,
    channel_accuracy_type: str | None = None,
) -> AnalysisResult:
    """
    Fit a polynomial model to calibration data and compute full statistics.

    reference_values / measured_values must be in SI units.
    poly_degree=None triggers automatic degree selection via AIC.
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
    coeffs = np.polyfit(meas, ref, degree)
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

    # Uncertainty
    combined_u, expanded_u = _uncertainty(
        residuals, distribution_type, confidence_level, coverage_factor, n, k
    )

    # Pass/fail against channel accuracy spec
    passed = True
    if channel_accuracy_value is not None and channel_accuracy_value > 0:
        if channel_accuracy_type == "percent_of_reading":
            # max tolerable error at any point = accuracy_pct * |reference|
            tolerances = channel_accuracy_value / 100.0 * np.abs(ref)
            passed = bool(np.all(np.abs(residuals) <= tolerances))
        elif channel_accuracy_type == "percent_of_full_scale":
            tolerance = channel_accuracy_value / 100.0 * span
            passed = bool(max_error <= tolerance)
        else:  # absolute
            passed = bool(max_error <= channel_accuracy_value)

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
        coverage_factor=coverage_factor,
        valid_range_min=float(np.min(ref)),
        valid_range_max=float(np.max(ref)),
        passed=passed,
        points=points,
    )
