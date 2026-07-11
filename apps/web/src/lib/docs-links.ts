// Maps tooltip keys to their explanation in the MAR Knowledge Center, so clicking a tooltip
// can open the full write-up (with math/examples) for that field or metric. Anchor ids match
// the `[#id]` markers in the corresponding .mdx pages 1:1. The same content is rendered both
// standalone (apps/docs, paths under /docs/guide/...) and inline inside this app (the
// /documentation/... route, see src/lib/docs-source.ts) — tooltips link to the in-app route
// so clicking one never leaves the app.

/** In-app path to a Knowledge Center page, e.g. "/docs/guide/sensors/adding-a-sensor#x" -> "/documentation/sensors/adding-a-sensor#x". */
export function docsUrl(path: string): string {
  return path.replace(/^\/docs\/guide/, "/documentation");
}

function getDocsBaseUrl(): string {
  return process.env.NEXT_PUBLIC_DOCS_URL ?? "http://localhost:3002";
}

/** Absolute URL into the standalone apps/docs site (external link, opens in a new tab). */
export function externalDocsUrl(path: string): string {
  return `${getDocsBaseUrl()}${path}`;
}

// Sensor channel fields — apps/docs/content/docs/guide/sensors/adding-a-sensor.mdx
export const CHAN_DOCS_LINKS: Record<string, string> = {
  physical_quantity: "/docs/guide/sensors/adding-a-sensor#physical-quantity",
  measurement_type: "/docs/guide/sensors/adding-a-sensor#measurement-type",
  accuracy_value: "/docs/guide/sensors/adding-a-sensor#accuracy-value",
  resolution: "/docs/guide/sensors/adding-a-sensor#resolution",
  measurement_uncertainty: "/docs/guide/sensors/adding-a-sensor#measurement-uncertainty",
  drift_rate: "/docs/guide/sensors/adding-a-sensor#drift-rate",
  response_time_ms: "/docs/guide/sensors/adding-a-sensor#response-time-ms",
  bandwidth_hz: "/docs/guide/sensors/adding-a-sensor#bandwidth-hz",
  calibration_role: "/docs/guide/sensors/adding-a-sensor#calibration-role",
};

// Health-tab drift/curve-comparison metrics — apps/docs/content/docs/guide/health-scoring/drift-metrics.mdx
export const CURVE_METRIC_DOCS_LINKS: Record<string, string> = {
  max_drift: "/docs/guide/health-scoring/drift-metrics#max-drift",
  mean_drift: "/docs/guide/health-scoring/drift-metrics#mean-drift",
  rms_drift: "/docs/guide/health-scoring/drift-metrics#rms-drift",
  offset: "/docs/guide/health-scoring/drift-metrics#offset",
  gain: "/docs/guide/health-scoring/drift-metrics#gain",
  residual_drift: "/docs/guide/health-scoring/drift-metrics#residual-drift",
};

// Health-tab overview cards — apps/docs/content/docs/guide/health-scoring/overview.mdx and predictions.mdx
export const HEALTH_DOCS_LINKS: Record<string, string> = {
  score: "/docs/guide/health-scoring/overview#score",
  stability: "/docs/guide/health-scoring/overview#stability",
  average_drift: "/docs/guide/health-scoring/overview#average-drift",
  recommended_interval: "/docs/guide/health-scoring/overview#recommended-interval",
  drift_evolution: "/docs/guide/health-scoring/overview#the-charts",
  calibration_stability: "/docs/guide/health-scoring/overview#the-charts",
  curve_comparison: "/docs/guide/health-scoring/overview#the-charts",
  prediction: "/docs/guide/health-scoring/predictions#prediction",
};

// Calibration wizard / history stat rows — apps/docs/content/docs/guide/calibration/curve-fitting.mdx
// and uncertainty-budget.mdx and decision-rules.mdx
export const STAT_DOCS_LINKS: Record<string, string> = {
  r_squared: "/docs/guide/calibration/curve-fitting#r-squared",
  rmse: "/docs/guide/calibration/curve-fitting#rmse",
  max_error: "/docs/guide/calibration/curve-fitting#max-error",
  full_scale_error: "/docs/guide/calibration/curve-fitting#full-scale-error",
  non_linearity: "/docs/guide/calibration/curve-fitting#non-linearity",
  repeatability: "/docs/guide/calibration/curve-fitting#repeatability",
  hysteresis: "/docs/guide/calibration/curve-fitting#hysteresis",
  uncertainty_budget_row: "/docs/guide/calibration/uncertainty-budget#contributions",
  combined_uncertainty: "/docs/guide/calibration/uncertainty-budget#combined-uncertainty",
  expanded_uncertainty: "/docs/guide/calibration/uncertainty-budget#expanded-uncertainty",
  coverage_factor: "/docs/guide/calibration/uncertainty-budget#coverage-factor",
  decision_rule: "/docs/guide/calibration/decision-rules#decision-rule",
};

// Health tab's "Detailed Metrics" panel — apps/api/app/health/service.py's MetricGroupItem.key
// values, mapped onto the same underlying concept's doc anchor above.
export const DETAILED_METRIC_DOCS_LINKS: Record<string, string> = {
  max_drift: CURVE_METRIC_DOCS_LINKS.max_drift,
  rms_drift: CURVE_METRIC_DOCS_LINKS.rms_drift,
  drift_rate: HEALTH_DOCS_LINKS.average_drift,
  regression_slope: HEALTH_DOCS_LINKS.average_drift,
  regression_r2: HEALTH_DOCS_LINKS.prediction,
  current_rmse: STAT_DOCS_LINKS.rmse,
  current_r2: STAT_DOCS_LINKS.r_squared,
  max_error: STAT_DOCS_LINKS.max_error,
  expanded_uncertainty: STAT_DOCS_LINKS.expanded_uncertainty,
  hysteresis: STAT_DOCS_LINKS.hysteresis,
  non_linearity: STAT_DOCS_LINKS.non_linearity,
  delta_rmse: STAT_DOCS_LINKS.rmse,
  delta_uncertainty: STAT_DOCS_LINKS.expanded_uncertainty,
  delta_max_error: STAT_DOCS_LINKS.max_error,
  delta_hysteresis: STAT_DOCS_LINKS.hysteresis,
  trend_classification: HEALTH_DOCS_LINKS.prediction,
};
