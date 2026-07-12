/**
 * Polynomial least-squares regression + GUM-style uncertainty analysis for
 * the demo (backend-free) build.
 *
 * This is a faithful, dependency-free port of
 * `apps/api/app/services/calibration_analysis.py` (`run_analysis`) so the
 * CalibrationWizard's "Analysis" step performs a REAL computation in the
 * browser instead of returning a canned/looked-up result — the one place in
 * the demo where runtime computation genuinely matters.
 *
 * The core polynomial-fit primitives (`polyfit`, `polyval`, `selectDegree`)
 * are mirrored — not imported — in `apps/web/scripts/curve-fit.mjs`, which
 * the plain-Node fixture generator uses to fabricate historical calibration
 * curves. Keep the two in sync; see the comment at the top of that file.
 *
 * No new dependency: everything below (Vandermonde least squares, Gaussian
 * elimination, normal/t/chi-squared quantile approximations) is hand-rolled.
 */
import type {
  AnalyzePointIn,
  AnalyzePointOut,
  AnalyzeResponse,
  ConformityStatement,
  DecisionRule,
  DistributionType,
  UncertaintyContribution,
} from "@/types/calibration";

// ---------------------------------------------------------------------------
// Linear algebra helpers (Vandermonde normal equations)
// ---------------------------------------------------------------------------

function buildVandermonde(x: number[], degree: number): number[][] {
  // Row i = [x_i^degree, x_i^(degree-1), …, x_i^0] — highest power first,
  // matching the numpy.polyfit coefficient convention used everywhere else
  // in Open Gauge (`Calibration.poly_coefficients`).
  return x.map((xi) => {
    const row = new Array<number>(degree + 1);
    for (let k = 0; k <= degree; k++) row[k] = Math.pow(xi, degree - k);
    return row;
  });
}

function transpose(m: number[][]): number[][] {
  return m[0].map((_, col) => m.map((row) => row[col]));
}

function matMul(a: number[][], b: number[][]): number[][] {
  const result: number[][] = [];
  for (let i = 0; i < a.length; i++) {
    const row: number[] = [];
    for (let j = 0; j < b[0].length; j++) {
      let sum = 0;
      for (let k = 0; k < b.length; k++) sum += a[i][k] * b[k][j];
      row.push(sum);
    }
    result.push(row);
  }
  return result;
}

function matVec(a: number[][], v: number[]): number[] {
  return a.map((row) => row.reduce((sum, aij, j) => sum + aij * v[j], 0));
}

/** Solve Ax = b via Gaussian elimination with partial pivoting. */
function solveLinearSystem(a: number[][], b: number[]): number[] {
  const n = a.length;
  const m = a.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivotRow][col])) pivotRow = r;
    }
    [m[col], m[pivotRow]] = [m[pivotRow], m[col]];

    const pivot = m[col][col];
    if (Math.abs(pivot) < 1e-12) continue; // singular-ish; leave as-is (best effort)
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col] / pivot;
      for (let c = col; c <= n; c++) m[r][c] -= factor * m[col][c];
    }
  }

  return m.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[row.length - 1] / row[i]));
}

/** Invert a square matrix via Gauss-Jordan elimination. Returns null if singular. */
function invertMatrix(a: number[][]): number[][] | null {
  const n = a.length;
  const m = a.map((row, i) => [
    ...row,
    ...Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)),
  ]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r][col]) > Math.abs(m[pivotRow][col])) pivotRow = r;
    }
    [m[col], m[pivotRow]] = [m[pivotRow], m[col]];

    const pivot = m[col][col];
    if (Math.abs(pivot) < 1e-12) return null;
    for (let c = 0; c < 2 * n; c++) m[col][c] /= pivot;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r][col];
      for (let c = 0; c < 2 * n; c++) m[r][c] -= factor * m[col][c];
    }
  }

  return m.map((row) => row.slice(n));
}

// ---------------------------------------------------------------------------
// Core polynomial fit — mirrored in scripts/curve-fit.mjs, keep in sync
// ---------------------------------------------------------------------------

export interface PolyFitResult {
  coefficients: number[]; // highest degree first (numpy.polyfit convention)
  covariance: number[][] | null; // null when there are zero residual degrees of freedom
}

/** Evaluate a polynomial at x. `coefficients` are highest-degree-first. */
export function polyval(coefficients: number[], x: number): number {
  let result = 0;
  for (const c of coefficients) result = result * x + c;
  return result;
}

export function generateXRange(min: number, max: number, nPoints: number): number[] {
  if (nPoints < 2) throw new Error("nPoints must be at least 2");
  const step = (max - min) / (nPoints - 1);
  return Array.from({ length: nPoints }, (_, i) => min + step * i);
}

/** Fit y = f(x) as a degree-N polynomial via least squares. */
export function polyfit(x: number[], y: number[], degree: number): PolyFitResult {
  const X = buildVandermonde(x, degree);
  const Xt = transpose(X);
  const XtX = matMul(Xt, X);
  const Xty = matVec(Xt, y);
  const coefficients = solveLinearSystem(XtX, Xty);

  let covariance: number[][] | null = null;
  const dof = x.length - (degree + 1);
  if (dof > 0) {
    const residuals = x.map((xi, i) => y[i] - polyval(coefficients, xi));
    const sigma2 = residuals.reduce((s, r) => s + r * r, 0) / dof;
    const XtXInv = invertMatrix(XtX);
    if (XtXInv) covariance = XtXInv.map((row) => row.map((v) => v * sigma2));
  }
  return { coefficients, covariance };
}

function aic(n: number, rss: number, k: number): number {
  if (rss <= 0 || n <= 0) return Infinity;
  return n * Math.log(rss / n) + 2 * k;
}

/** Auto-select polynomial degree using AIC with a parsimony rule (mirrors calculations.py's `_select_degree`). */
export function selectDegree(x: number[], y: number[], maxDegree = 5): number {
  const n = x.length;
  let bestDegree = 1;
  let bestAic = Infinity;
  const upper = Math.min(maxDegree, n - 1);

  for (let d = 1; d <= upper; d++) {
    const { coefficients } = polyfit(x, y, d);
    const rss = x.reduce((s, xi, i) => s + (y[i] - polyval(coefficients, xi)) ** 2, 0);
    const k = d + 1;
    const candidateAic = aic(n, rss, k);
    if (candidateAic < bestAic - 2) {
      bestAic = candidateAic;
      bestDegree = d;
    } else if (d > 1 && candidateAic >= bestAic - 2) {
      break;
    }
  }
  return bestDegree;
}

// ---------------------------------------------------------------------------
// Quantile (inverse CDF) approximations — no scipy in the browser.
// ---------------------------------------------------------------------------

/** Standard normal quantile function (Acklam's rational approximation, ~1e-9 accurate). */
function normalPpf(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;

  const a = [-3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2, 1.38357751867269e2, -3.066479806614716e1, 2.506628277459239];
  const b = [-5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2, 6.680131188771972e1, -1.328068155288572e1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996, 3.754408661907416];

  const pLow = 0.02425;
  if (p < pLow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
  }
  if (p <= 1 - pLow) {
    const q = p - 0.5;
    const r = q * q;
    return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1);
}

/** Student's t quantile via a Cornish-Fisher expansion around the normal quantile. Accurate enough for demo purposes. */
function tPpf(p: number, df: number): number {
  const z = normalPpf(p);
  if (!isFinite(df) || df <= 0) return z;
  const z3 = z ** 3;
  const z5 = z ** 5;
  const z7 = z ** 7;
  const z9 = z ** 9;
  const g1 = (z3 + z) / 4;
  const g2 = (5 * z5 + 16 * z3 + 3 * z) / 96;
  const g3 = (3 * z7 + 19 * z5 + 17 * z3 - 15 * z) / 384;
  const g4 = (79 * z9 + 776 * z7 + 1482 * z5 - 1920 * z3 - 945 * z) / 92160;
  return z + g1 / df + g2 / df ** 2 + g3 / df ** 3 + g4 / df ** 4;
}

/** Chi-squared quantile via the Wilson-Hilferty approximation. */
function chi2Ppf(p: number, df: number): number {
  const z = normalPpf(p);
  const term = 1 - 2 / (9 * df) + z * Math.sqrt(2 / (9 * df));
  return df * term ** 3;
}

// ---------------------------------------------------------------------------
// Hysteresis / repeatability detection — mirrors calibration_analysis.py
// ---------------------------------------------------------------------------

function detectHysteresis(ref: number[], meas: number[]): number | null {
  if (ref.length < 4) return null;

  let hasAscending = false;
  let hasDescending = false;
  for (let i = 1; i < ref.length; i++) {
    if (ref[i] - ref[i - 1] > 0) hasAscending = true;
    if (ref[i] - ref[i - 1] < 0) hasDescending = true;
  }
  if (!hasAscending || !hasDescending) return null;

  const rounded = ref.map((r) => Math.round(r * 1e6) / 1e6);
  const groups = new Map<number, number[]>();
  rounded.forEach((r, i) => {
    const g = groups.get(r) ?? [];
    g.push(meas[i]);
    groups.set(r, g);
  });

  let maxSpan = 0;
  let foundDuplicates = false;
  for (const values of groups.values()) {
    if (values.length >= 2) {
      foundDuplicates = true;
      maxSpan = Math.max(maxSpan, Math.max(...values) - Math.min(...values));
    }
  }
  return foundDuplicates ? maxSpan : null;
}

function detectRepeatability(ref: number[], meas: number[]): number | null {
  const rounded = ref.map((r) => Math.round(r * 1e6) / 1e6);
  const groups = new Map<number, number[]>();
  rounded.forEach((r, i) => {
    const g = groups.get(r) ?? [];
    g.push(meas[i]);
    groups.set(r, g);
  });

  let maxStd = 0;
  let found = false;
  for (const values of groups.values()) {
    if (values.length >= 3) {
      found = true;
      const mean = values.reduce((s, v) => s + v, 0) / values.length;
      const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / (values.length - 1);
      maxStd = Math.max(maxStd, Math.sqrt(variance));
    }
  }
  return found ? maxStd : null;
}

// ---------------------------------------------------------------------------
// Uncertainty budget (GUM Annex H.1-style) — mirrors calibration_analysis.py
// ---------------------------------------------------------------------------

function typeBFromExpanded(expandedValue: number, coverageFactor: number): number {
  return coverageFactor <= 0 ? Math.abs(expandedValue) : Math.abs(expandedValue) / coverageFactor;
}

function typeBRectangular(halfWidth: number): number {
  return Math.abs(halfWidth) / Math.sqrt(3);
}

export interface AnalyzeCalibrationParams {
  points: AnalyzePointIn[];
  referenceUnit: string;
  measuredUnit: string;
  polyDegree: number | null;
  distributionType: DistributionType;
  confidenceLevel: number;
  channelAccuracyValue: number | null;
  channelAccuracyType: string | null;
  decisionRule: DecisionRule;
  referenceStandardUncertainty?: number | null;
  referenceStandardCoverageFactor?: number;
  resolution?: number | null;
  sensorNominalUncertainty?: number | null;
  sensorNominalCoverageFactor?: number;
  includeSensorNominalUncertainty?: boolean;
}

function buildUncertaintyBudget(
  residuals: number[],
  n: number,
  k: number,
  params: AnalyzeCalibrationParams,
): UncertaintyContribution[] {
  const mean = residuals.reduce((s, r) => s + r, 0) / (n || 1);
  const stdRes = n > 1
    ? Math.sqrt(residuals.reduce((s, r) => s + (r - mean) ** 2, 0) / (n - 1))
    : 0;
  const dofA = n > k ? n - k : null;

  const budget: UncertaintyContribution[] = [
    {
      source: "fit_residuals",
      description: "Type A: standard deviation of calibration-fit residuals",
      value: stdRes,
      distribution: "normal",
      divisor: 1.0,
      standard_uncertainty: stdRes,
      degrees_of_freedom: dofA,
    },
  ];

  const refU = params.referenceStandardUncertainty;
  if (refU != null && refU > 0) {
    const k2 = params.referenceStandardCoverageFactor ?? 2.0;
    budget.push({
      source: "reference_standard",
      description: "Type B: uncertainty of the reference standard used for this calibration",
      value: refU,
      distribution: "normal",
      divisor: k2,
      standard_uncertainty: typeBFromExpanded(refU, k2),
      degrees_of_freedom: null,
    });
  }

  const resolution = params.resolution;
  if (resolution != null && resolution > 0) {
    budget.push({
      source: "resolution",
      description: "Type B: instrument/sensor digital resolution (rectangular distribution)",
      value: resolution,
      distribution: "rectangular",
      divisor: Math.sqrt(12.0),
      standard_uncertainty: typeBRectangular(resolution / 2.0),
      degrees_of_freedom: null,
    });
  }

  const nominalU = params.sensorNominalUncertainty;
  if (params.includeSensorNominalUncertainty && nominalU != null && nominalU > 0) {
    const kNom = params.sensorNominalCoverageFactor ?? 2.0;
    budget.push({
      source: "sensor_nominal_accuracy",
      description: "Type B: sensor manufacturer nominal accuracy/uncertainty specification",
      value: nominalU,
      distribution: "normal",
      divisor: kNom,
      standard_uncertainty: typeBFromExpanded(nominalU, kNom),
      degrees_of_freedom: null,
    });
  }

  return budget;
}

function combineBudget(budget: UncertaintyContribution[]): { combinedU: number; dofEff: number | null } {
  const combinedU = Math.sqrt(budget.reduce((s, c) => s + c.standard_uncertainty ** 2, 0));
  if (combinedU <= 0) return { combinedU, dofEff: null };

  const denom = budget.reduce((s, c) => {
    if (c.degrees_of_freedom != null && c.degrees_of_freedom > 0) {
      return s + c.standard_uncertainty ** 4 / c.degrees_of_freedom;
    }
    return s;
  }, 0);
  if (denom <= 0) return { combinedU, dofEff: null };

  return { combinedU, dofEff: combinedU ** 4 / denom };
}

function expandUncertainty(
  combinedU: number,
  dofEff: number | null,
  distributionType: DistributionType,
  confidenceLevel: number,
): { expandedU: number; coverageFactor: number } {
  let k: number;
  if (distributionType === "t") {
    k = dofEff != null && dofEff > 0 ? tPpf(0.5 + confidenceLevel / 200, dofEff) : normalPpf(0.5 + confidenceLevel / 200);
  } else if (distributionType === "chi_squared") {
    k = dofEff != null && dofEff > 0 ? Math.sqrt(chi2Ppf(confidenceLevel / 100, dofEff) / dofEff) : 1.0;
  } else {
    k = normalPpf(0.5 + confidenceLevel / 200);
  }
  return { expandedU: combinedU * k, coverageFactor: k };
}

function applyDecisionRule(
  residuals: number[],
  ref: number[],
  maxError: number,
  span: number,
  params: AnalyzeCalibrationParams,
  expandedUncertainty: number,
): { passed: boolean; conformity: ConformityStatement } {
  const { channelAccuracyValue, channelAccuracyType, decisionRule } = params;
  if (channelAccuracyValue == null || channelAccuracyValue <= 0) {
    return {
      passed: true,
      conformity: {
        decision_rule: decisionRule,
        specification: null,
        expanded_uncertainty_applied: null,
        passed: true,
        reason: "No accuracy specification provided; conformity not evaluated.",
      },
    };
  }

  let guard = 0;
  if (decisionRule === "guard_band_w_uncertainty") guard = expandedUncertainty;
  else if (decisionRule === "shared_risk") guard = -expandedUncertainty;

  let passed: boolean;
  let specDesc: string;
  if (channelAccuracyType === "percent_of_reading") {
    passed = residuals.every((r, i) => Math.abs(r) + guard <= (channelAccuracyValue / 100) * Math.abs(ref[i]));
    specDesc = `±${channelAccuracyValue}% of reading`;
  } else if (channelAccuracyType === "percent_of_full_scale") {
    const tolerance = (channelAccuracyValue / 100) * span;
    passed = maxError + guard <= tolerance;
    specDesc = `±${channelAccuracyValue}% of full scale`;
  } else {
    passed = maxError + guard <= channelAccuracyValue;
    specDesc = `±${channelAccuracyValue} (absolute)`;
  }

  return {
    passed,
    conformity: {
      decision_rule: decisionRule,
      specification: specDesc,
      expanded_uncertainty_applied: decisionRule !== "simple_acceptance" ? expandedUncertainty : null,
      passed,
      reason: null,
    },
  };
}

/**
 * Full analysis pipeline for one calibration: fits a polynomial correction
 * model (measured -> reference) and computes the same statistics the real
 * backend's `POST /api/v1/calibrations/analyze` endpoint returns. Mirrors
 * `calibration_analysis.run_analysis`.
 */
export function runAnalysis(params: AnalyzeCalibrationParams): AnalyzeResponse {
  const { points } = params;
  if (points.length < 2) throw new Error("Need at least 2 data points for regression");

  const ref = points.map((p) => p.reference);
  const meas = points.map((p) => p.measured);

  const degree = params.polyDegree != null
    ? Math.max(1, Math.min(params.polyDegree, 5))
    : selectDegree(meas, ref);

  // Calibration function: reference = f(measured).
  const { coefficients, covariance } = polyfit(meas, ref, degree);
  const fitted = meas.map((m) => polyval(coefficients, m));
  const residuals = ref.map((r, i) => r - fitted[i]);
  const n = ref.length;
  const k = degree + 1;

  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const refMean = ref.reduce((s, r) => s + r, 0) / n;
  const ssTot = ref.reduce((s, r) => s + (r - refMean) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1;
  const rmse = Math.sqrt(ssRes / n);
  const standardError = Math.sqrt(ssRes / Math.max(n - k, 1));
  const maxError = Math.max(...residuals.map((r) => Math.abs(r)));

  const span = Math.max(...ref) - Math.min(...ref);
  const fullScaleErrorPct = span > 0 ? (maxError / span) * 100 : 0;

  // Non-linearity: deviation of the fitted curve from its own best-fit line.
  const { coefficients: linCoeffs } = polyfit(meas, fitted, 1);
  const linFitted = meas.map((m) => polyval(linCoeffs, m));
  const nlMax = Math.max(...fitted.map((f, i) => Math.abs(f - linFitted[i])));
  const nonLinearityPct = span > 0 ? (nlMax / span) * 100 : 0;

  const hysteresis = detectHysteresis(ref, meas);
  const repeatability = detectRepeatability(ref, meas);

  const budget = buildUncertaintyBudget(residuals, n, k, params);
  const { combinedU, dofEff } = combineBudget(budget);
  const { expandedU, coverageFactor } = expandUncertainty(combinedU, dofEff, params.distributionType, params.confidenceLevel);

  const { passed, conformity } = applyDecisionRule(residuals, ref, maxError, span, params, expandedU);

  const outPoints: AnalyzePointOut[] = points.map((p, i) => ({
    point_index: i,
    reference_value: p.reference,
    measured_value: p.measured,
    calculated_value: fitted[i],
    residual_abs: residuals[i],
    residual_pct: span > 0 ? (residuals[i] / span) * 100 : 0,
  }));

  return {
    poly_degree: degree,
    coefficients,
    r_squared: rSquared,
    rmse,
    standard_error: standardError,
    max_error: maxError,
    full_scale_error_pct: fullScaleErrorPct,
    non_linearity_pct: nonLinearityPct,
    repeatability,
    hysteresis,
    combined_uncertainty: combinedU,
    expanded_uncertainty: expandedU,
    distribution_type: params.distributionType,
    confidence_level: params.confidenceLevel,
    coverage_factor: coverageFactor,
    valid_range_min: Math.min(...ref),
    valid_range_max: Math.max(...ref),
    passed,
    conformity_statement: conformity,
    uncertainty_budget: budget,
    effective_degrees_of_freedom: dofEff,
    poly_coefficients_covariance: covariance,
    points: outPoints,
  };
}
