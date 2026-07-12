"""Orchestration layer for the Health tab.

The only non-pure module in `app/health/` — fetches calibration data through
the existing `repositories/calibration.py` interface (per the constraint
that Health must not read calibration data any other way), maps ORM rows to
the plain dataclasses the pure modules expect, and assembles the Pydantic
response. All domain math lives in calculations.py/scoring.py/prediction.py.
"""
import math
import uuid
from functools import lru_cache

from sqlalchemy.orm import Session

from ..models.calibration import Calibration
from ..models.sensor import Sensor
from ..repositories import calibration as cal_repo
from . import calculations, prediction, regression, scoring
from .calculations import CalibrationSummary
from .models import (
    AssetHealthResponse,
    CalibrationOption,
    CalibrationStability,
    CurveComparisonResponse,
    CurveComparisonSummary,
    DetailedMetrics,
    DriftEvolution,
    DriftPoint,
    HealthOverview,
    MetricGroupItem,
    PredictionOut,
    RadarAxis,
    StabilityMetricSeries,
)
from .normalization import normalize_inverse


class CalibrationNotFoundError(Exception):
    """Raised when a requested calibration id doesn't exist or doesn't
    belong to the given asset — mapped to 404 by the API layer."""

# Minimum calibrations before any Health insight is shown.
MIN_CALIBRATIONS_FOR_OVERVIEW = 2
# Minimum calibrations before a drift prediction is attempted.
MIN_CALIBRATIONS_FOR_PREDICTION = 3
# Below this confidence, the frontend is told to show a "needs more data" message.
CONFIDENCE_MESSAGE_THRESHOLD_PCT = 70.0
# Stability metrics get a raw+smoothed moving average once history is long enough.
SMOOTHING_MIN_CALIBRATIONS = 5
MOVING_AVERAGE_WINDOW = 3
# Number of most-recent points used for the "current" (as opposed to
# long-term average) drift rate.
RECENT_DRIFT_WINDOW = 3
CURVE_COMPARISON_POINTS = 200

# Health-score / radar normalization thresholds, expressed as % of the
# channel's full-scale span (measurement_max - measurement_min). Chosen as
# reasonable general-purpose metrology defaults; documented here so they can
# be tuned in one place.
GOOD_PCT_FS = 0.5
BAD_PCT_FS = 5.0
GOOD_NONLINEARITY_PCT = 0.1
BAD_NONLINEARITY_PCT = 2.0
STABILITY_SCORE = {"stable": 100.0, "drifting": 60.0, "unstable": 20.0}
TREND_SCORE = {"improving": 100.0, "stable": 75.0, "degrading": 30.0, "unknown": 75.0}


def _f(value) -> float | None:
    return None if value is None else float(value)


def _to_summary(cal: Calibration) -> CalibrationSummary:
    coefficients = [float(c) for c in cal.poly_coefficients] if cal.poly_coefficients else None
    return CalibrationSummary(
        id=str(cal.id),
        calibration_date=cal.calibration_date,
        performed_by_name=cal.performed_by_name,
        poly_order=cal.poly_order,
        poly_coefficients=coefficients,
        valid_range_min=_f(cal.valid_range_min),
        valid_range_max=_f(cal.valid_range_max),
        r_squared=_f(cal.r_squared),
        rmse=_f(cal.rmse),
        max_error=_f(cal.max_error),
        expanded_uncertainty=_f(cal.expanded_uncertainty),
        hysteresis=_f(cal.hysteresis),
        non_linearity=_f(cal.non_linearity),
        repeatability=_f(cal.repeatability),
        calibration_interval=cal.calibration_interval,
    )


def _channel_unit(db: Session, sensor_id: uuid.UUID | None, summaries: list[CalibrationSummary], cals: list[Calibration]) -> tuple[str, float | None]:
    """Returns (unit, full_scale_span). Span is None if unavailable."""
    sid = sensor_id
    if sid is None and cals:
        sid = cals[0].sensor_id
    if sid is None:
        return "", None
    sensor = db.query(Sensor).filter(Sensor.id == sid).first()
    if not sensor:
        return "", None
    span = None
    if sensor.measurement_min is not None and sensor.measurement_max is not None:
        span = float(sensor.measurement_max) - float(sensor.measurement_min)
    return sensor.unit, (span if span else None)


def _pct_of_span(value: float | None, span: float | None) -> float | None:
    if value is None or not span:
        return None
    return 100.0 * abs(value) / span


def _score_or_neutral(pct: float | None, good: float, bad: float) -> float:
    """100 (neutral/best) when the metric can't be expressed as %FS."""
    if pct is None:
        return 100.0
    return normalize_inverse(pct, good=good, bad=bad)


def _compute_prediction(
    summaries: list[CalibrationSummary],
    drift_series: list[float | None],
    span: float | None,
    accuracy_value: float | None,
    accuracy_type: str | None,
) -> PredictionOut:
    valid = [(s.calibration_date, d) for s, d in zip(summaries, drift_series) if d is not None]
    if len(valid) < MIN_CALIBRATIONS_FOR_PREDICTION:
        return PredictionOut(available=False)

    dates = [v[0] for v in valid]
    values = [v[1] for v in valid]

    tolerance: float | None = None
    if accuracy_value is not None and accuracy_type == "percent_of_full_scale" and span:
        tolerance = (accuracy_value / 100.0) * span
    elif accuracy_value is not None and accuracy_type not in ("percent_of_reading", "percent_of_full_scale"):
        tolerance = accuracy_value

    result = prediction.get_default_predictor().predict(dates, values, tolerance)

    message = None
    if result.confidence_pct < CONFIDENCE_MESSAGE_THRESHOLD_PCT:
        message = "More historical calibrations are required for reliable prediction."

    return PredictionOut(
        available=True,
        projected_drift_1y=result.projected_drift_1y,
        projected_drift_2y=result.projected_drift_2y,
        projected_drift_3y=result.projected_drift_3y,
        projected_drift_5y=result.projected_drift_5y,
        projected_tolerance_exceeded_date=result.projected_tolerance_exceeded_date,
        remaining_useful_life_months=result.remaining_useful_life_months,
        confidence_pct=result.confidence_pct,
        confidence_reliable=result.confidence_reliable,
        message=message,
    )


def get_asset_calibration_health_score(db: Session, asset_pk: uuid.UUID) -> float | None:
    """Asset-level summary of the per-channel calibration Health Score, for
    display outside the Health tab (e.g. the asset profile header).

    An asset can have multiple sensor channels, each with its own Health
    Score; this returns the worst (lowest) one, so a single struggling
    channel isn't hidden by an average with healthier ones. Returns None if
    no channel yet has the 2+ calibrations required to compute a score
    (mirrors the Health tab's own empty-state threshold).
    """
    cals = cal_repo.list_by_asset(db, asset_pk, skip=0, limit=1000)
    sensor_ids = {c.sensor_id for c in cals if c.sensor_id is not None}

    if not sensor_ids:
        response = get_asset_health(db, asset_pk, None)
        return response.overview.health_score if response.overview else None

    scores = [
        response.overview.health_score
        for sid in sensor_ids
        if (response := get_asset_health(db, asset_pk, sid)).overview is not None
    ]
    return min(scores) if scores else None


def get_asset_health(
    db: Session, asset_pk: uuid.UUID, sensor_id: uuid.UUID | None
) -> AssetHealthResponse:
    cals = cal_repo.list_by_asset(db, asset_pk, skip=0, limit=1000)
    if sensor_id is not None:
        cals = [c for c in cals if c.sensor_id == sensor_id]

    # Repository returns newest-first; health calculations expect chronological order.
    chronological = list(reversed(cals))
    calibration_count = len(chronological)

    summaries = [_to_summary(c) for c in chronological]
    channel_unit, span = _channel_unit(db, sensor_id, summaries, chronological)

    if calibration_count < MIN_CALIBRATIONS_FOR_OVERVIEW:
        return AssetHealthResponse(
            calibration_count=calibration_count,
            channel_unit=channel_unit,
            prediction=PredictionOut(available=False),
        )

    baseline = summaries[0]
    drift_series = calculations.max_drift_series(summaries, baseline)
    valid_points = [
        (s, d) for s, d in zip(summaries, drift_series) if d is not None
    ]

    if len(valid_points) >= 2:
        valid_dates = [p[0].calibration_date for p in valid_points]
        valid_drift = [p[1] for p in valid_points]
        regression_origin_date = valid_dates[0]
        overall_fit = regression.fit_linear(
            [(d - regression_origin_date).days / 365.25 for d in valid_dates], valid_drift
        )
        recent = valid_points[-RECENT_DRIFT_WINDOW:]
        if len(recent) >= 2:
            recent_dates = [p[0].calibration_date for p in recent]
            recent_drift = [p[1] for p in recent]
            recent_fit = regression.fit_linear(
                [(d - recent_dates[0]).days / 365.25 for d in recent_dates], recent_drift
            )
            current_drift_rate = recent_fit.slope
        else:
            current_drift_rate = overall_fit.slope
        average_drift_rate = overall_fit.slope
        regression_intercept = overall_fit.intercept
        regression_r_squared = overall_fit.r_squared
        max_drift_value = max(valid_drift)
        rms_drift_value = math.sqrt(sum(v * v for v in valid_drift) / len(valid_drift))
    else:
        average_drift_rate = 0.0
        current_drift_rate = 0.0
        regression_intercept = 0.0
        regression_r_squared = 0.0
        regression_origin_date = summaries[0].calibration_date
        max_drift_value = valid_points[0][1] if valid_points else 0.0
        rms_drift_value = max_drift_value

    drift_rate_pct = _pct_of_span(average_drift_rate, span)
    stability = calculations.stability_classification(drift_rate_pct, regression_r_squared)

    drift_points = [
        DriftPoint(
            calibration_id=s.id,
            calibration_date=s.calibration_date,
            max_drift=d,
            operator=s.performed_by_name,
        )
        for s, d in valid_points
    ]
    drift_evolution = DriftEvolution(
        points=drift_points,
        regression_slope=average_drift_rate,
        regression_intercept=regression_intercept,
        regression_origin_date=regression_origin_date,
        regression_r_squared=regression_r_squared,
        current_drift_rate=current_drift_rate,
    )

    # --- Calibration Stability (card 3) ---
    dates = [s.calibration_date for s in summaries]
    smoothing_applied = calibration_count > SMOOTHING_MIN_CALIBRATIONS
    metric_defs = [
        ("rmse", "RMSE", [s.rmse for s in summaries]),
        ("max_error", "Max Error", [s.max_error for s in summaries]),
        ("expanded_uncertainty", "Expanded Uncertainty", [s.expanded_uncertainty for s in summaries]),
        ("hysteresis", "Hysteresis", [s.hysteresis for s in summaries]),
        ("r_squared", "R²", [s.r_squared for s in summaries]),
    ]
    series = [
        StabilityMetricSeries(
            name=name,
            label=label,
            dates=dates,
            raw_values=values,
            smoothed_values=calculations.moving_average(values, MOVING_AVERAGE_WINDOW) if smoothing_applied else None,
        )
        for name, label, values in metric_defs
    ]
    stability_out = CalibrationStability(series=series, smoothing_applied=smoothing_applied)

    # --- Curve comparison dropdown options (card 4) ---
    calibration_options = [
        CalibrationOption(
            id=s.id,
            calibration_date=s.calibration_date,
            calibration_version=c.calibration_version,
            label=f"{s.calibration_date.isoformat()} (v{c.calibration_version})",
        )
        for s, c in zip(summaries, chronological)
    ]

    # --- Prediction (card 5) ---
    latest_cal = chronological[-1]
    accuracy_value: float | None = None
    accuracy_type: str | None = None
    sid = sensor_id or latest_cal.sensor_id
    if sid is not None:
        sensor = db.query(Sensor).filter(Sensor.id == sid).first()
        if sensor:
            accuracy_value = _f(sensor.accuracy_value)
            accuracy_type = sensor.accuracy_type
    pred_out = _compute_prediction(summaries, drift_series, span, accuracy_value, accuracy_type)

    # --- Health score / overview (card 1) ---
    latest = summaries[-1]
    deltas = calculations.historical_deltas(summaries)
    trend_labels = [
        deltas["trend_rmse"], deltas["trend_uncertainty"],
        deltas["trend_max_error"], deltas["trend_hysteresis"],
    ]
    trend_score = sum(TREND_SCORE.get(t, 75.0) for t in trend_labels) / len(trend_labels)

    max_drift_score = _score_or_neutral(_pct_of_span(max_drift_value, span), GOOD_PCT_FS, BAD_PCT_FS)
    rms_drift_score = _score_or_neutral(_pct_of_span(rms_drift_value, span), GOOD_PCT_FS, BAD_PCT_FS)
    rmse_score = _score_or_neutral(_pct_of_span(latest.rmse, span), GOOD_PCT_FS, BAD_PCT_FS)
    uncertainty_score = _score_or_neutral(_pct_of_span(latest.expanded_uncertainty, span), GOOD_PCT_FS, BAD_PCT_FS)
    hysteresis_score = _score_or_neutral(_pct_of_span(latest.hysteresis, span), GOOD_PCT_FS, BAD_PCT_FS)
    linearity_score = (
        100.0 if latest.non_linearity is None
        else normalize_inverse(abs(latest.non_linearity), good=GOOD_NONLINEARITY_PCT, bad=BAD_NONLINEARITY_PCT)
    )

    health_score = scoring.compute_health_score(
        scoring.HealthScoreInputs(
            max_drift_score=max_drift_score,
            rms_drift_score=rms_drift_score,
            rmse_score=rmse_score,
            uncertainty_score=uncertainty_score,
            hysteresis_score=hysteresis_score,
            linearity_score=linearity_score,
            trend_score=trend_score,
        )
    )

    recommended_months = scoring.recommended_interval_months(
        latest.calibration_interval, stability, average_drift_rate
    )

    overview = HealthOverview(
        health_score=health_score,
        health_label=scoring.health_label(health_score),
        stability=stability.capitalize(),
        average_drift_rate=average_drift_rate,
        current_drift_rate=current_drift_rate,
        drift_rate_unit=f"{channel_unit}/year" if channel_unit else "/year",
        recommended_interval_months=recommended_months,
    )

    # --- Detailed metrics (card 6) ---
    detailed_metrics = DetailedMetrics(
        drift_group=[
            MetricGroupItem(key="max_drift", label="Maximum Drift", value=max_drift_value, unit=channel_unit, tooltip="Largest absolute deviation observed between any calibration and the baseline (first) calibration, evaluated across the shared operating range."),
            MetricGroupItem(key="rms_drift", label="RMS Drift", value=rms_drift_value, unit=channel_unit, tooltip="Root-mean-square of the per-calibration maximum drift values — a measure of overall drift dispersion, less sensitive to a single outlier than maximum drift."),
            MetricGroupItem(key="drift_rate", label="Drift Rate", value=average_drift_rate, unit=f"{channel_unit}/year" if channel_unit else "/year", tooltip="Long-term rate of change of drift over the full calibration history, from a linear regression."),
            MetricGroupItem(key="regression_slope", label="Regression Slope", value=average_drift_rate, unit=f"{channel_unit}/year" if channel_unit else "/year", tooltip="Slope of the drift-evolution trend line — identical to drift rate, shown here for traceability with the chart."),
            MetricGroupItem(key="regression_r2", label="Regression R²", value=regression_r_squared, unit="", tooltip="Goodness of fit (0-1) of the drift trend line. Values near 1 indicate a consistent, predictable drift pattern."),
        ],
        statistics_group=[
            MetricGroupItem(key="current_rmse", label="Current RMSE", value=latest.rmse, unit=channel_unit, tooltip="Root-mean-square error of the most recent calibration's fitted curve against its measured points."),
            MetricGroupItem(key="current_r2", label="Current R²", value=latest.r_squared, unit="", tooltip="Goodness of fit (0-1) of the most recent calibration's polynomial regression."),
            MetricGroupItem(key="max_error", label="Maximum Error", value=latest.max_error, unit=channel_unit, tooltip="Largest single-point residual in the most recent calibration."),
            MetricGroupItem(key="expanded_uncertainty", label="Expanded Uncertainty", value=latest.expanded_uncertainty, unit=channel_unit, tooltip="Combined measurement uncertainty of the most recent calibration, expanded by its coverage factor (typically k=2, ~95% confidence)."),
            MetricGroupItem(key="hysteresis", label="Hysteresis", value=latest.hysteresis, unit=channel_unit, tooltip="Maximum difference between measured values at the same reference point approached from opposite directions (ascending vs. descending)."),
            MetricGroupItem(key="non_linearity", label="Non-linearity", value=latest.non_linearity, unit="%", tooltip="Deviation of the calibration curve from a straight line, as a percentage of full-scale span."),
        ],
        trends_group=[
            MetricGroupItem(key="delta_rmse", label="Δ RMSE", value=deltas["delta_rmse"], unit=channel_unit, tooltip="Change in RMSE between the two most recent calibrations. Positive means RMSE increased (degrading)."),
            MetricGroupItem(key="delta_uncertainty", label="Δ Uncertainty", value=deltas["delta_uncertainty"], unit=channel_unit, tooltip="Change in expanded uncertainty between the two most recent calibrations."),
            MetricGroupItem(key="delta_max_error", label="Δ Maximum Error", value=deltas["delta_max_error"], unit=channel_unit, tooltip="Change in maximum error between the two most recent calibrations."),
            MetricGroupItem(key="delta_hysteresis", label="Δ Hysteresis", value=deltas["delta_hysteresis"], unit=channel_unit, tooltip="Change in hysteresis between the two most recent calibrations."),
            MetricGroupItem(key="trend_classification", label="Trend Classification", value=None, unit=deltas["trend_rmse"], tooltip="Overall direction of the instrument's calibration statistics: improving, stable, or degrading."),
        ],
    )

    # --- Radar chart ---
    repeatability_score = _score_or_neutral(_pct_of_span(latest.repeatability, span), GOOD_PCT_FS, BAD_PCT_FS)
    drift_axis_score = (max_drift_score + rms_drift_score) / 2.0
    radar = [
        RadarAxis(axis="Stability", value=STABILITY_SCORE.get(stability, 60.0)),
        RadarAxis(axis="Repeatability", value=repeatability_score),
        RadarAxis(axis="Linearity", value=linearity_score),
        RadarAxis(axis="Uncertainty", value=uncertainty_score),
        RadarAxis(axis="Drift", value=drift_axis_score),
        RadarAxis(axis="Hysteresis", value=hysteresis_score),
        RadarAxis(axis="Overall Quality", value=health_score),
    ]

    return AssetHealthResponse(
        calibration_count=calibration_count,
        channel_unit=channel_unit,
        overview=overview,
        drift_evolution=drift_evolution,
        stability=stability_out,
        calibration_options=calibration_options,
        prediction=pred_out,
        detailed_metrics=detailed_metrics,
        radar=radar,
    )


@lru_cache(maxsize=128)
def _cached_curve_comparison(
    reference_id: str, current_id: str, n_points: int,
    ref_key: tuple, cur_key: tuple,
) -> calculations.CurveComparisonResult:
    """Memoized on hashable calibration fingerprints (id + poly + range),
    not ORM objects, so a calibration update naturally invalidates the cache
    (different fingerprint -> different cache key) without manual eviction.
    """
    ref = CalibrationSummary(
        id=reference_id, calibration_date=ref_key[0], performed_by_name="",
        poly_order=None, poly_coefficients=list(ref_key[1]) if ref_key[1] else None,
        valid_range_min=ref_key[2], valid_range_max=ref_key[3],
        r_squared=None, rmse=None, max_error=None, expanded_uncertainty=None,
        hysteresis=None, non_linearity=None, repeatability=None, calibration_interval=None,
    )
    cur = CalibrationSummary(
        id=current_id, calibration_date=cur_key[0], performed_by_name="",
        poly_order=None, poly_coefficients=list(cur_key[1]) if cur_key[1] else None,
        valid_range_min=cur_key[2], valid_range_max=cur_key[3],
        r_squared=None, rmse=None, max_error=None, expanded_uncertainty=None,
        hysteresis=None, non_linearity=None, repeatability=None, calibration_interval=None,
    )
    return calculations.curve_comparison(ref, cur, n_points)


def get_curve_comparison(
    db: Session,
    asset_pk: uuid.UUID,
    reference_calibration_id: uuid.UUID,
    current_calibration_id: uuid.UUID,
) -> CurveComparisonResponse:
    reference = cal_repo.get_by_id(db, reference_calibration_id)
    current = cal_repo.get_by_id(db, current_calibration_id)
    if not reference or reference.asset_id != asset_pk:
        raise CalibrationNotFoundError("Reference calibration not found for this asset")
    if not current or current.asset_id != asset_pk:
        raise CalibrationNotFoundError("Current calibration not found for this asset")

    ref_key = (
        reference.calibration_date,
        tuple(float(c) for c in reference.poly_coefficients) if reference.poly_coefficients else None,
        _f(reference.valid_range_min),
        _f(reference.valid_range_max),
    )
    cur_key = (
        current.calibration_date,
        tuple(float(c) for c in current.poly_coefficients) if current.poly_coefficients else None,
        _f(current.valid_range_min),
        _f(current.valid_range_max),
    )

    result = _cached_curve_comparison(
        str(reference.id), str(current.id), CURVE_COMPARISON_POINTS, ref_key, cur_key
    )

    channel_unit = ""
    sid = current.sensor_id or reference.sensor_id
    if sid is not None:
        sensor = db.query(Sensor).filter(Sensor.id == sid).first()
        if sensor:
            channel_unit = sensor.unit

    return CurveComparisonResponse(
        x=result.x,
        y_reference=result.y_reference,
        y_current=result.y_current,
        delta=result.delta,
        abs_drift=result.abs_drift,
        summary=CurveComparisonSummary(
            max_drift=result.max_drift,
            mean_drift=result.mean_drift,
            rms_drift=result.rms_drift,
            offset=result.offset,
            gain=result.gain,
            residual_drift=result.residual_drift,
        ),
        unit=channel_unit,
    )
