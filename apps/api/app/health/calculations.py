"""Domain-specific pure functions for the Health tab.

Every function here operates on plain dataclasses/lists — no ORM or DB
access — so each one is trivially unit testable with literal Python values.
Callers (health/service.py) are responsible for mapping SQLAlchemy rows to
`CalibrationSummary` and for ordering the list chronologically (oldest
first).
"""
from dataclasses import dataclass
from datetime import date
from math import sqrt

from . import regression

# Stability classification thresholds, expressed as % of full-scale span
# drifted per year (not absolute units, so they apply across sensor types).
STABLE_MAX_DRIFT_RATE_PCT = 0.5
UNSTABLE_DRIFT_RATE_PCT = 2.0
UNSTABLE_R2_FLOOR = 0.5

# A metric is considered "stable" between two calibrations if it moved less
# than this fraction of its own magnitude.
TREND_STABLE_RELATIVE_THRESHOLD = 0.05


@dataclass
class CalibrationSummary:
    """Minimal per-calibration fields health calculations need.

    Mapped from the ORM `Calibration` row by the service layer, decoupling
    this module from SQLAlchemy entirely.
    """
    id: str
    calibration_date: date
    performed_by_name: str
    poly_order: int | None
    poly_coefficients: list[float] | None
    valid_range_min: float | None
    valid_range_max: float | None
    r_squared: float | None
    rmse: float | None
    max_error: float | None
    expanded_uncertainty: float | None
    hysteresis: float | None
    non_linearity: float | None
    repeatability: float | None
    calibration_interval: int | None  # days


@dataclass
class CurveComparisonResult:
    x: list[float]
    y_reference: list[float]
    y_current: list[float]
    delta: list[float]
    abs_drift: list[float]
    max_drift: float
    mean_drift: float
    rms_drift: float
    offset: float
    gain: float
    residual_drift: float


def max_drift_series(
    calibrations: list[CalibrationSummary],
    baseline: CalibrationSummary,
    n_points: int = 100,
) -> list[float | None]:
    """For each calibration, evaluate its polynomial vs. the baseline's
    polynomial over their overlapping valid range and return max |delta|.

    Returns `None` at positions where a calibration (or the baseline) lacks
    a usable polynomial, or its valid range does not overlap the baseline's.
    The baseline itself (if present in `calibrations`) yields 0.0.
    """
    if not baseline.poly_coefficients or baseline.valid_range_min is None or baseline.valid_range_max is None:
        return [None for _ in calibrations]

    results: list[float | None] = []
    for cal in calibrations:
        if not cal.poly_coefficients or cal.valid_range_min is None or cal.valid_range_max is None:
            results.append(None)
            continue

        lo = max(baseline.valid_range_min, cal.valid_range_min)
        hi = min(baseline.valid_range_max, cal.valid_range_max)
        if hi <= lo:
            results.append(None)
            continue

        xs = regression.generate_x_range(lo, hi, n_points)
        y_baseline = regression.evaluate_polynomial(baseline.poly_coefficients, xs)
        y_cal = regression.evaluate_polynomial(cal.poly_coefficients, xs)
        results.append(max(abs(a - b) for a, b in zip(y_cal, y_baseline)))

    return results


def drift_rate_per_year(dates: list[date], drift_values: list[float]) -> float:
    """Slope of drift_values vs. dates, expressed per year."""
    if not dates:
        raise ValueError("dates must not be empty")
    first = dates[0]
    x_years = [(d - first).days / 365.25 for d in dates]
    return regression.fit_linear(x_years, drift_values).slope


def drift_rate_pct_of_span(drift_rate: float, span: float | None) -> float | None:
    """Convert an absolute drift rate to % of full-scale span per year.

    Used only for stability classification and score normalization, which
    need a unit-agnostic magnitude. Returns None if span is unknown/zero.
    """
    if not span:
        return None
    return 100.0 * abs(drift_rate) / span


def stability_classification(drift_rate_pct_fs_per_year: float | None, r_squared: float | None) -> str:
    """Returns 'stable' | 'drifting' | 'unstable'.

    Falls back to 'stable' when the drift rate can't be expressed as % of
    span (e.g. no measurement range configured) and the fit quality is
    unknown — absence of evidence is not treated as instability.
    """
    if drift_rate_pct_fs_per_year is None:
        return "stable"

    magnitude = abs(drift_rate_pct_fs_per_year)
    r2 = r_squared if r_squared is not None else 1.0

    if magnitude >= UNSTABLE_DRIFT_RATE_PCT or r2 < UNSTABLE_R2_FLOOR:
        return "unstable"
    if magnitude > STABLE_MAX_DRIFT_RATE_PCT:
        return "drifting"
    return "stable"


def moving_average(values: list[float | None], window: int = 3) -> list[float | None]:
    """Centered moving average over `window` points.

    Returns None for edge points where the window doesn't fully fit, and
    for any window that contains a None raw value — the frontend still
    plots raw points underneath, so gaps are acceptable.
    """
    if window < 1:
        raise ValueError("window must be >= 1")

    n = len(values)
    half = window // 2
    result: list[float | None] = []
    for i in range(n):
        lo = i - half
        hi = i + half + 1
        if lo < 0 or hi > n or any(v is None for v in values[lo:hi]):
            result.append(None)
        else:
            result.append(sum(values[lo:hi]) / window)  # type: ignore[arg-type]
    return result


def _classify_trend(delta: float | None, reference: float | None) -> str:
    if delta is None:
        return "unknown"
    ref_magnitude = abs(reference) if reference else 0.0
    threshold = max(ref_magnitude * TREND_STABLE_RELATIVE_THRESHOLD, 1e-9)
    if abs(delta) <= threshold:
        return "stable"
    # For all four tracked metrics (RMSE, uncertainty, max error, hysteresis)
    # a smaller value is better, so a positive delta means degrading.
    return "degrading" if delta > 0 else "improving"


def historical_deltas(calibrations: list[CalibrationSummary]) -> dict:
    """Deltas + trend classification between the two most recent calibrations.

    `calibrations` must be chronologically ordered (oldest first); the
    comparison uses the last two entries.
    """
    if len(calibrations) < 2:
        raise ValueError("At least 2 calibrations are required")

    prev, curr = calibrations[-2], calibrations[-1]

    def delta(a: float | None, b: float | None) -> float | None:
        return None if a is None or b is None else b - a

    d_rmse = delta(prev.rmse, curr.rmse)
    d_uncertainty = delta(prev.expanded_uncertainty, curr.expanded_uncertainty)
    d_max_error = delta(prev.max_error, curr.max_error)
    d_hysteresis = delta(prev.hysteresis, curr.hysteresis)

    return {
        "delta_rmse": d_rmse,
        "trend_rmse": _classify_trend(d_rmse, prev.rmse),
        "delta_uncertainty": d_uncertainty,
        "trend_uncertainty": _classify_trend(d_uncertainty, prev.expanded_uncertainty),
        "delta_max_error": d_max_error,
        "trend_max_error": _classify_trend(d_max_error, prev.max_error),
        "delta_hysteresis": d_hysteresis,
        "trend_hysteresis": _classify_trend(d_hysteresis, prev.hysteresis),
    }


def curve_comparison(
    reference: CalibrationSummary, current: CalibrationSummary, n_points: int = 200
) -> CurveComparisonResult:
    """Evaluate both fitted polynomials over their overlapping valid range.

    Raises ValueError if either calibration lacks a usable polynomial or
    their valid ranges do not overlap.
    """
    if not reference.poly_coefficients or not current.poly_coefficients:
        raise ValueError("Both calibrations must have a fitted polynomial")
    if (
        reference.valid_range_min is None or reference.valid_range_max is None
        or current.valid_range_min is None or current.valid_range_max is None
    ):
        raise ValueError("Both calibrations must have a valid range")

    lo = max(reference.valid_range_min, current.valid_range_min)
    hi = min(reference.valid_range_max, current.valid_range_max)
    if hi <= lo:
        raise ValueError("Reference and current calibrations do not have overlapping valid ranges")

    xs = regression.generate_x_range(lo, hi, n_points)
    y_reference = regression.evaluate_polynomial(reference.poly_coefficients, xs)
    y_current = regression.evaluate_polynomial(current.poly_coefficients, xs)
    delta = [c - r for c, r in zip(y_current, y_reference)]
    abs_drift = [abs(d) for d in delta]

    max_drift = max(abs_drift)
    mean_drift = sum(abs_drift) / len(abs_drift)
    rms_drift = sqrt(sum(d * d for d in delta) / len(delta))
    offset = delta[0]
    gain = regression.fit_linear(xs, delta).slope
    residual_drift = delta[-1] - delta[0]

    return CurveComparisonResult(
        x=xs,
        y_reference=y_reference,
        y_current=y_current,
        delta=delta,
        abs_drift=abs_drift,
        max_drift=max_drift,
        mean_drift=mean_drift,
        rms_drift=rms_drift,
        offset=offset,
        gain=gain,
        residual_drift=residual_drift,
    )
