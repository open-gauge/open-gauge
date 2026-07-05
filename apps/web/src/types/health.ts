// Mirrors apps/api/app/health/models.py

export interface HealthOverview {
  health_score: number;
  health_label: string;
  stability: string;
  average_drift_rate: number;
  current_drift_rate: number;
  drift_rate_unit: string;
  recommended_interval_months: number;
}

export interface DriftPoint {
  calibration_id: string;
  calibration_date: string;
  max_drift: number;
  operator: string;
}

export interface DriftEvolution {
  points: DriftPoint[];
  regression_slope: number;
  regression_intercept: number;
  regression_origin_date: string;
  regression_r_squared: number;
  current_drift_rate: number;
}

export interface StabilityMetricSeries {
  name: string;
  label: string;
  dates: string[];
  raw_values: (number | null)[];
  smoothed_values: (number | null)[] | null;
}

export interface CalibrationStability {
  series: StabilityMetricSeries[];
  smoothing_applied: boolean;
}

export interface CalibrationOption {
  id: string;
  calibration_date: string;
  calibration_version: number;
  label: string;
}

export interface CurveComparisonSummary {
  max_drift: number;
  mean_drift: number;
  rms_drift: number;
  offset: number;
  gain: number;
  residual_drift: number;
}

export interface CurveComparisonResponse {
  x: number[];
  y_reference: number[];
  y_current: number[];
  delta: number[];
  abs_drift: number[];
  summary: CurveComparisonSummary;
  unit: string;
}

export interface PredictionOut {
  available: boolean;
  projected_drift_1y: number | null;
  projected_drift_2y: number | null;
  projected_drift_3y: number | null;
  projected_drift_5y: number | null;
  projected_tolerance_exceeded_date: string | null;
  remaining_useful_life_months: number | null;
  confidence_pct: number | null;
  confidence_reliable: boolean;
  message: string | null;
}

export interface MetricGroupItem {
  key: string;
  label: string;
  value: number | null;
  unit: string;
  tooltip: string;
}

export interface DetailedMetrics {
  drift_group: MetricGroupItem[];
  statistics_group: MetricGroupItem[];
  trends_group: MetricGroupItem[];
}

export interface RadarAxis {
  axis: string;
  value: number;
}

export interface AssetHealthResponse {
  calibration_count: number;
  channel_unit: string;
  overview: HealthOverview | null;
  drift_evolution: DriftEvolution | null;
  stability: CalibrationStability | null;
  calibration_options: CalibrationOption[];
  prediction: PredictionOut;
  detailed_metrics: DetailedMetrics | null;
  radar: RadarAxis[] | null;
}
