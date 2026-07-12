/**
 * Health-tab math, ported from `apps/api/app/health/{calculations,scoring,
 * prediction,regression,normalization,service}.py` into plain JS.
 *
 * This is generator-only: the demo fixture's `AssetHealthResponse` snapshots
 * are precomputed once here and committed to `fixtures/data.json`. Nothing at
 * runtime (the router) recomputes health — see the "explicitly-scoped
 * limitation" note in the task write-up — so there is no TypeScript twin of
 * this file the way there is for curve-fit.mjs/.ts.
 */
import { polyval } from "./curve-fit.mjs";

// --- calculations.py thresholds -------------------------------------------
const STABLE_MAX_DRIFT_RATE_PCT = 0.5;
const UNSTABLE_DRIFT_RATE_PCT = 2.0;
const UNSTABLE_R2_FLOOR = 0.5;
const TREND_STABLE_RELATIVE_THRESHOLD = 0.05;

// --- scoring.py thresholds --------------------------------------------------
const EXCELLENT_THRESHOLD = 90.0;
const GOOD_THRESHOLD = 75.0;
const FAIR_THRESHOLD = 50.0;
const MIN_INTERVAL_MONTHS = 3;
const MAX_INTERVAL_MONTHS = 24;
const STABLE_EXTENSION_FACTOR = 1.5;
const DRIFTING_SHRINK_FACTOR = 0.75;
const UNSTABLE_SHRINK_FACTOR = 0.5;
const DEFAULT_BASE_INTERVAL_MONTHS = 12.0;
const DEFAULT_WEIGHTS = {
  maxDrift: 0.30, rmsDrift: 0.20, rmse: 0.15, uncertainty: 0.10,
  hysteresis: 0.10, linearity: 0.10, trend: 0.05,
};

// --- prediction.py constants -------------------------------------------------
const DAYS_PER_YEAR = 365.25;
const MONTHS_PER_DAY = 12.0 / DAYS_PER_YEAR;
const MIN_SAMPLES_FOR_RELIABLE_CONFIDENCE = 5;

// --- service.py constants ----------------------------------------------------
const MIN_CALIBRATIONS_FOR_OVERVIEW = 2;
const MIN_CALIBRATIONS_FOR_PREDICTION = 3;
const CONFIDENCE_MESSAGE_THRESHOLD_PCT = 70.0;
const SMOOTHING_MIN_CALIBRATIONS = 5;
const MOVING_AVERAGE_WINDOW = 3;
const RECENT_DRIFT_WINDOW = 3;
const GOOD_PCT_FS = 0.5;
const BAD_PCT_FS = 5.0;
const GOOD_NONLINEARITY_PCT = 0.1;
const BAD_NONLINEARITY_PCT = 2.0;
const STABILITY_SCORE = { stable: 100.0, drifting: 60.0, unstable: 20.0 };
const TREND_SCORE = { improving: 100.0, stable: 75.0, degrading: 30.0, unknown: 75.0 };

// ---------------------------------------------------------------------------
// normalization.py
// ---------------------------------------------------------------------------

export function clamp(value, lo = 0, hi = 100) {
  return Math.max(lo, Math.min(hi, value));
}

export function normalizeInverse(value, good, bad) {
  const v = Math.abs(value);
  const span = bad - good;
  return clamp((100.0 * (bad - v)) / span);
}

// ---------------------------------------------------------------------------
// regression.py
// ---------------------------------------------------------------------------

/** OLS fit of y = slope*x + intercept. */
export function fitLinear(x, y) {
  const n = x.length;
  const xMin = Math.min(...x);
  const xMax = Math.max(...x);
  if (xMax === xMin) {
    const yMean = y.reduce((s, v) => s + v, 0) / n;
    const ssTot = y.reduce((s, v) => s + (v - yMean) ** 2, 0);
    return { slope: 0, intercept: yMean, rSquared: ssTot === 0 ? 1 : 0 };
  }

  const xMean = x.reduce((s, v) => s + v, 0) / n;
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  const sxy = x.reduce((s, xi, i) => s + (xi - xMean) * (y[i] - yMean), 0);
  const sxx = x.reduce((s, xi) => s + (xi - xMean) ** 2, 0);
  const slope = sxy / sxx;
  const intercept = yMean - slope * xMean;

  const yPred = x.map((xi) => slope * xi + intercept);
  const ssRes = y.reduce((s, yi, i) => s + (yi - yPred[i]) ** 2, 0);
  const ssTot = y.reduce((s, yi) => s + (yi - yMean) ** 2, 0);
  const rSquared = ssTot > 0 ? Math.max(0, 1 - ssRes / ssTot) : 1;
  return { slope, intercept, rSquared };
}

function daysBetween(a, b) {
  return (a.getTime() - b.getTime()) / 86_400_000;
}

// ---------------------------------------------------------------------------
// calculations.py
// ---------------------------------------------------------------------------

function maxDriftSeries(summaries, baseline, nPoints = 100) {
  if (!baseline.poly_coefficients || baseline.valid_range_min == null || baseline.valid_range_max == null) {
    return summaries.map(() => null);
  }
  return summaries.map((cal) => {
    if (!cal.poly_coefficients || cal.valid_range_min == null || cal.valid_range_max == null) return null;
    const lo = Math.max(baseline.valid_range_min, cal.valid_range_min);
    const hi = Math.min(baseline.valid_range_max, cal.valid_range_max);
    if (hi <= lo) return null;
    const step = (hi - lo) / 99;
    let maxAbs = 0;
    for (let i = 0; i < 100; i++) {
      const xi = lo + step * i;
      const diff = Math.abs(polyval(cal.poly_coefficients, xi) - polyval(baseline.poly_coefficients, xi));
      if (diff > maxAbs) maxAbs = diff;
    }
    return maxAbs;
  });
}

function pctOfSpan(value, span) {
  if (value == null || !span) return null;
  return (100.0 * Math.abs(value)) / span;
}

function stabilityClassification(driftRatePctFsPerYear, rSquared) {
  if (driftRatePctFsPerYear == null) return "stable";
  const magnitude = Math.abs(driftRatePctFsPerYear);
  const r2 = rSquared != null ? rSquared : 1.0;
  if (magnitude >= UNSTABLE_DRIFT_RATE_PCT || r2 < UNSTABLE_R2_FLOOR) return "unstable";
  if (magnitude > STABLE_MAX_DRIFT_RATE_PCT) return "drifting";
  return "stable";
}

function movingAverage(values, window = 3) {
  const n = values.length;
  const half = Math.floor(window / 2);
  const result = [];
  for (let i = 0; i < n; i++) {
    const lo = i - half;
    const hi = i + half + 1;
    if (lo < 0 || hi > n || values.slice(lo, hi).some((v) => v == null)) {
      result.push(null);
    } else {
      result.push(values.slice(lo, hi).reduce((s, v) => s + v, 0) / window);
    }
  }
  return result;
}

function classifyTrend(delta, reference) {
  if (delta == null) return "unknown";
  const refMagnitude = reference ? Math.abs(reference) : 0;
  const threshold = Math.max(refMagnitude * TREND_STABLE_RELATIVE_THRESHOLD, 1e-9);
  if (Math.abs(delta) <= threshold) return "stable";
  return delta > 0 ? "degrading" : "improving";
}

function historicalDeltas(summaries) {
  const prev = summaries[summaries.length - 2];
  const curr = summaries[summaries.length - 1];
  const delta = (a, b) => (a == null || b == null ? null : b - a);

  const dRmse = delta(prev.rmse, curr.rmse);
  const dUncertainty = delta(prev.expanded_uncertainty, curr.expanded_uncertainty);
  const dMaxError = delta(prev.max_error, curr.max_error);
  const dHysteresis = delta(prev.hysteresis, curr.hysteresis);

  return {
    delta_rmse: dRmse, trend_rmse: classifyTrend(dRmse, prev.rmse),
    delta_uncertainty: dUncertainty, trend_uncertainty: classifyTrend(dUncertainty, prev.expanded_uncertainty),
    delta_max_error: dMaxError, trend_max_error: classifyTrend(dMaxError, prev.max_error),
    delta_hysteresis: dHysteresis, trend_hysteresis: classifyTrend(dHysteresis, prev.hysteresis),
  };
}

// ---------------------------------------------------------------------------
// scoring.py
// ---------------------------------------------------------------------------

function computeHealthScore(inputs, weights = DEFAULT_WEIGHTS) {
  const total = inputs.maxDriftScore * weights.maxDrift
    + inputs.rmsDriftScore * weights.rmsDrift
    + inputs.rmseScore * weights.rmse
    + inputs.uncertaintyScore * weights.uncertainty
    + inputs.hysteresisScore * weights.hysteresis
    + inputs.linearityScore * weights.linearity
    + inputs.trendScore * weights.trend;
  return clamp(total);
}

function healthLabel(score) {
  if (score >= EXCELLENT_THRESHOLD) return "Excellent";
  if (score >= GOOD_THRESHOLD) return "Good";
  if (score >= FAIR_THRESHOLD) return "Fair";
  return "Poor";
}

function recommendedIntervalMonths(currentIntervalDays, stability) {
  const baseMonths = currentIntervalDays ? currentIntervalDays / 30.0 : DEFAULT_BASE_INTERVAL_MONTHS;
  const factor = { stable: STABLE_EXTENSION_FACTOR, drifting: DRIFTING_SHRINK_FACTOR, unstable: UNSTABLE_SHRINK_FACTOR }[stability] ?? 1.0;
  return Math.round(clamp(baseMonths * factor, MIN_INTERVAL_MONTHS, MAX_INTERVAL_MONTHS));
}

// ---------------------------------------------------------------------------
// prediction.py
// ---------------------------------------------------------------------------

function predictDrift(dates, driftValues, tolerance) {
  const first = dates[0];
  const xYears = dates.map((d) => daysBetween(d, first) / DAYS_PER_YEAR);
  const fit = fitLinear(xYears, driftValues);

  const xToday = daysBetween(new Date(), first) / DAYS_PER_YEAR;
  const project = (yearsAhead) => fit.slope * (xToday + yearsAhead) + fit.intercept;

  let projectedToleranceExceededDate = null;
  let remainingUsefulLifeMonths = null;
  if (tolerance != null && fit.slope > 0) {
    const xExceeded = (tolerance - fit.intercept) / fit.slope;
    if (xExceeded > xToday) {
      const exceededDate = new Date(first.getTime() + xExceeded * DAYS_PER_YEAR * 86_400_000);
      projectedToleranceExceededDate = exceededDate;
      const remainingDays = daysBetween(exceededDate, new Date());
      remainingUsefulLifeMonths = remainingDays * MONTHS_PER_DAY;
    }
  }

  return {
    projected_drift_1y: project(1),
    projected_drift_2y: project(2),
    projected_drift_3y: project(3),
    projected_drift_5y: project(5),
    projected_tolerance_exceeded_date: projectedToleranceExceededDate,
    remaining_useful_life_months: remainingUsefulLifeMonths,
    confidence_pct: clamp(fit.rSquared * 100.0),
    confidence_reliable: dates.length >= MIN_SAMPLES_FOR_RELIABLE_CONFIDENCE,
  };
}

// ---------------------------------------------------------------------------
// service.py orchestration — computeAssetHealth(summaries, channelUnit, span, accuracyValue, accuracyType)
// ---------------------------------------------------------------------------

const isoDate = (d) => d.toISOString().slice(0, 10);
const f = (v) => (v == null ? null : Number(v));

function scoreOrNeutral(pct, good, bad) {
  return pct == null ? 100.0 : normalizeInverse(pct, good, bad);
}

function computePrediction(summaries, driftSeries, span, accuracyValue, accuracyType) {
  const valid = summaries
    .map((s, i) => ({ date: s.calibration_date, drift: driftSeries[i] }))
    .filter((v) => v.drift != null);
  if (valid.length < MIN_CALIBRATIONS_FOR_PREDICTION) {
    return { available: false, confidence_reliable: false };
  }

  const dates = valid.map((v) => v.date);
  const values = valid.map((v) => v.drift);

  let tolerance = null;
  if (accuracyValue != null && accuracyType === "percent_of_full_scale" && span) {
    tolerance = (accuracyValue / 100.0) * span;
  } else if (accuracyValue != null && accuracyType !== "percent_of_reading" && accuracyType !== "percent_of_full_scale") {
    tolerance = accuracyValue;
  }

  const result = predictDrift(dates, values, tolerance);
  const message = result.confidence_pct < CONFIDENCE_MESSAGE_THRESHOLD_PCT
    ? "More historical calibrations are required for reliable prediction."
    : null;

  return {
    available: true,
    projected_drift_1y: result.projected_drift_1y,
    projected_drift_2y: result.projected_drift_2y,
    projected_drift_3y: result.projected_drift_3y,
    projected_drift_5y: result.projected_drift_5y,
    projected_tolerance_exceeded_date: result.projected_tolerance_exceeded_date ? isoDate(result.projected_tolerance_exceeded_date) : null,
    remaining_useful_life_months: result.remaining_useful_life_months,
    confidence_pct: result.confidence_pct,
    confidence_reliable: result.confidence_reliable,
    message,
  };
}

/**
 * @param {object[]} chronological Calibrations for one asset/sensor, oldest first. Each must have:
 *   id, calibration_date (Date), performed_by_name, poly_coefficients (number[]|null),
 *   valid_range_min/max, r_squared, rmse, max_error, expanded_uncertainty, hysteresis,
 *   non_linearity, repeatability, calibration_interval (days), calibration_version
 * @param {string} channelUnit
 * @param {number|null} span measurement_max - measurement_min for the channel
 * @param {number|null} accuracyValue
 * @param {string|null} accuracyType
 */
export function computeAssetHealth(chronological, channelUnit, span, accuracyValue, accuracyType) {
  const calibrationCount = chronological.length;
  const summaries = chronological;

  if (calibrationCount < MIN_CALIBRATIONS_FOR_OVERVIEW) {
    return {
      calibration_count: calibrationCount,
      channel_unit: channelUnit,
      overview: null,
      drift_evolution: null,
      stability: null,
      calibration_options: [],
      prediction: { available: false, confidence_reliable: false },
      detailed_metrics: null,
      radar: null,
    };
  }

  const baseline = summaries[0];
  const driftSeries = maxDriftSeries(summaries, baseline);
  const validPoints = summaries.map((s, i) => ({ s, d: driftSeries[i] })).filter((p) => p.d != null);

  let averageDriftRate, currentDriftRate, regressionIntercept, regressionRSquared, regressionOriginDate, maxDriftValue, rmsDriftValue;
  if (validPoints.length >= 2) {
    const validDates = validPoints.map((p) => p.s.calibration_date);
    const validDrift = validPoints.map((p) => p.d);
    regressionOriginDate = validDates[0];
    const xYears = validDates.map((d) => daysBetween(d, regressionOriginDate) / 365.25);
    const overallFit = fitLinear(xYears, validDrift);
    const recent = validPoints.slice(-RECENT_DRIFT_WINDOW);
    if (recent.length >= 2) {
      const recentDates = recent.map((p) => p.s.calibration_date);
      const recentDrift = recent.map((p) => p.d);
      const recentX = recentDates.map((d) => daysBetween(d, recentDates[0]) / 365.25);
      currentDriftRate = fitLinear(recentX, recentDrift).slope;
    } else {
      currentDriftRate = overallFit.slope;
    }
    averageDriftRate = overallFit.slope;
    regressionIntercept = overallFit.intercept;
    regressionRSquared = overallFit.rSquared;
    maxDriftValue = Math.max(...validDrift);
    rmsDriftValue = Math.sqrt(validDrift.reduce((s, v) => s + v * v, 0) / validDrift.length);
  } else {
    averageDriftRate = 0; currentDriftRate = 0; regressionIntercept = 0; regressionRSquared = 0;
    regressionOriginDate = summaries[0].calibration_date;
    maxDriftValue = validPoints[0]?.d ?? 0;
    rmsDriftValue = maxDriftValue;
  }

  const driftRatePct = pctOfSpan(averageDriftRate, span);
  const stability = stabilityClassification(driftRatePct, regressionRSquared);

  const driftPoints = validPoints.map((p) => ({
    calibration_id: p.s.id,
    calibration_date: isoDate(p.s.calibration_date),
    max_drift: p.d,
    operator: p.s.performed_by_name,
  }));
  const driftEvolution = {
    points: driftPoints,
    regression_slope: averageDriftRate,
    regression_intercept: regressionIntercept,
    regression_origin_date: isoDate(regressionOriginDate),
    regression_r_squared: regressionRSquared,
    current_drift_rate: currentDriftRate,
  };

  const dates = summaries.map((s) => isoDate(s.calibration_date));
  const smoothingApplied = calibrationCount > SMOOTHING_MIN_CALIBRATIONS;
  const metricDefs = [
    ["rmse", "RMSE", summaries.map((s) => f(s.rmse))],
    ["max_error", "Max Error", summaries.map((s) => f(s.max_error))],
    ["expanded_uncertainty", "Expanded Uncertainty", summaries.map((s) => f(s.expanded_uncertainty))],
    ["hysteresis", "Hysteresis", summaries.map((s) => f(s.hysteresis))],
    ["r_squared", "R²", summaries.map((s) => f(s.r_squared))],
  ];
  const series = metricDefs.map(([name, label, values]) => ({
    name, label, dates,
    raw_values: values,
    smoothed_values: smoothingApplied ? movingAverage(values, MOVING_AVERAGE_WINDOW) : null,
  }));
  const stabilityOut = { series, smoothing_applied: smoothingApplied };

  const calibrationOptions = summaries.map((s) => ({
    id: s.id,
    calibration_date: isoDate(s.calibration_date),
    calibration_version: s.calibration_version,
    label: `${isoDate(s.calibration_date)} (v${s.calibration_version})`,
  }));

  const predOut = computePrediction(summaries, driftSeries, span, accuracyValue, accuracyType);

  const latest = summaries[summaries.length - 1];
  const deltas = historicalDeltas(summaries);
  const trendLabels = [deltas.trend_rmse, deltas.trend_uncertainty, deltas.trend_max_error, deltas.trend_hysteresis];
  const trendScore = trendLabels.reduce((s, t) => s + (TREND_SCORE[t] ?? 75.0), 0) / trendLabels.length;

  const maxDriftScore = scoreOrNeutral(pctOfSpan(maxDriftValue, span), GOOD_PCT_FS, BAD_PCT_FS);
  const rmsDriftScore = scoreOrNeutral(pctOfSpan(rmsDriftValue, span), GOOD_PCT_FS, BAD_PCT_FS);
  const rmseScore = scoreOrNeutral(pctOfSpan(latest.rmse, span), GOOD_PCT_FS, BAD_PCT_FS);
  const uncertaintyScore = scoreOrNeutral(pctOfSpan(latest.expanded_uncertainty, span), GOOD_PCT_FS, BAD_PCT_FS);
  const hysteresisScore = scoreOrNeutral(pctOfSpan(latest.hysteresis, span), GOOD_PCT_FS, BAD_PCT_FS);
  const linearityScore = latest.non_linearity == null
    ? 100.0
    : normalizeInverse(Math.abs(latest.non_linearity), GOOD_NONLINEARITY_PCT, BAD_NONLINEARITY_PCT);

  const healthScore = computeHealthScore({
    maxDriftScore, rmsDriftScore, rmseScore, uncertaintyScore, hysteresisScore, linearityScore, trendScore,
  });
  const recommendedMonths = recommendedIntervalMonths(latest.calibration_interval, stability);

  const overview = {
    health_score: healthScore,
    health_label: healthLabel(healthScore),
    stability: stability.charAt(0).toUpperCase() + stability.slice(1),
    average_drift_rate: averageDriftRate,
    current_drift_rate: currentDriftRate,
    drift_rate_unit: channelUnit ? `${channelUnit}/year` : "/year",
    recommended_interval_months: recommendedMonths,
  };

  const detailedMetrics = {
    drift_group: [
      { key: "max_drift", label: "Maximum Drift", value: maxDriftValue, unit: channelUnit, tooltip: "Largest absolute deviation observed between any calibration and the baseline (first) calibration, evaluated across the shared operating range." },
      { key: "rms_drift", label: "RMS Drift", value: rmsDriftValue, unit: channelUnit, tooltip: "Root-mean-square of the per-calibration maximum drift values — a measure of overall drift dispersion, less sensitive to a single outlier than Maximum Drift." },
      { key: "drift_rate", label: "Drift Rate", value: averageDriftRate, unit: channelUnit ? `${channelUnit}/year` : "/year", tooltip: "Long-term rate of change of drift over the full calibration history, from a linear regression." },
      { key: "regression_slope", label: "Regression Slope", value: averageDriftRate, unit: channelUnit ? `${channelUnit}/year` : "/year", tooltip: "Slope of the drift-evolution trend line — identical to Drift Rate, shown here for traceability with the chart." },
      { key: "regression_r2", label: "Regression R²", value: regressionRSquared, unit: "", tooltip: "Goodness of fit (0-1) of the drift trend line. Values near 1 indicate a consistent, predictable drift pattern." },
    ],
    statistics_group: [
      { key: "current_rmse", label: "Current RMSE", value: f(latest.rmse), unit: channelUnit, tooltip: "Root-mean-square error of the most recent calibration's fitted curve against its measured points." },
      { key: "current_r2", label: "Current R²", value: f(latest.r_squared), unit: "", tooltip: "Goodness of fit (0-1) of the most recent calibration's polynomial regression." },
      { key: "max_error", label: "Maximum Error", value: f(latest.max_error), unit: channelUnit, tooltip: "Largest single-point residual in the most recent calibration." },
      { key: "expanded_uncertainty", label: "Expanded Uncertainty", value: f(latest.expanded_uncertainty), unit: channelUnit, tooltip: "Combined measurement uncertainty of the most recent calibration, expanded by its coverage factor (typically k=2, ~95% confidence)." },
      { key: "hysteresis", label: "Hysteresis", value: f(latest.hysteresis), unit: channelUnit, tooltip: "Maximum difference between measured values at the same reference point approached from opposite directions (ascending vs. descending)." },
      { key: "non_linearity", label: "Non-linearity", value: f(latest.non_linearity), unit: "%", tooltip: "Deviation of the calibration curve from a straight line, as a percentage of full-scale span." },
    ],
    trends_group: [
      { key: "delta_rmse", label: "Δ RMSE", value: deltas.delta_rmse, unit: channelUnit, tooltip: "Change in RMSE between the two most recent calibrations. Positive means RMSE increased (degrading)." },
      { key: "delta_uncertainty", label: "Δ Uncertainty", value: deltas.delta_uncertainty, unit: channelUnit, tooltip: "Change in expanded uncertainty between the two most recent calibrations." },
      { key: "delta_max_error", label: "Δ Maximum Error", value: deltas.delta_max_error, unit: channelUnit, tooltip: "Change in maximum error between the two most recent calibrations." },
      { key: "delta_hysteresis", label: "Δ Hysteresis", value: deltas.delta_hysteresis, unit: channelUnit, tooltip: "Change in hysteresis between the two most recent calibrations." },
      { key: "trend_classification", label: "Trend Classification", value: null, unit: deltas.trend_rmse, tooltip: "Overall direction of the instrument's calibration statistics: improving, stable, or degrading." },
    ],
  };

  const repeatabilityScore = scoreOrNeutral(pctOfSpan(latest.repeatability, span), GOOD_PCT_FS, BAD_PCT_FS);
  const driftAxisScore = (maxDriftScore + rmsDriftScore) / 2.0;
  const radar = [
    { axis: "Stability", value: STABILITY_SCORE[stability] ?? 60.0 },
    { axis: "Repeatability", value: repeatabilityScore },
    { axis: "Linearity", value: linearityScore },
    { axis: "Uncertainty", value: uncertaintyScore },
    { axis: "Drift", value: driftAxisScore },
    { axis: "Hysteresis", value: hysteresisScore },
    { axis: "Overall Quality", value: healthScore },
  ];

  return {
    calibration_count: calibrationCount,
    channel_unit: channelUnit,
    overview,
    drift_evolution: driftEvolution,
    stability: stabilityOut,
    calibration_options: calibrationOptions,
    prediction: predOut,
    detailed_metrics: detailedMetrics,
    radar,
  };
}
