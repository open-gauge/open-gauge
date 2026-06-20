export type CalibrationResult = "pass" | "fail" | "conditional_pass";
export type CoefficientType = "linear" | "polynomial";
export type DistributionType = "normal" | "t" | "chi_squared";

export interface CalibrationRecord {
  id: string;
  asset_id: string;
  calibration_date: string;
  due_date: string;
  performed_by_name: string;
  performed_by_user_id: string | null;
  external_lab_name: string | null;
  external_lab_accreditation: string | null;
  result: CalibrationResult;
  temperature_c: number | null;
  humidity_pct: number | null;
  pressure_hpa: number | null;
  notes: string | null;
  calibration_file_id: string | null;
  created_by: string;
  created_at: string;
  // Migration 004
  sensor_id: string | null;
  calibration_type: string;
  reference_asset_id: string | null;
  calibration_method_id: string | null;
  certificate_number: string | null;
  certificate_expiry_date: string | null;
  calibration_interval: number | null;
  version: number;
  temperature_value: number | null;
  temperature_unit: string | null;
  pressure_value: number | null;
  pressure_unit: string | null;
  humidity_value: number | null;
  humidity_unit: string | null;
}

export interface CalibrationCoefficient {
  id: string;
  calibration_id: string;
  channel: string | null;
  coefficient_type: CoefficientType;
  offset_value: number | null;
  gain: number | null;
  poly_degree: number | null;
  poly_coefficients: number[] | null;
  unit_input: string | null;
  unit_output: string | null;
  range_min: number | null;
  range_max: number | null;
  uncertainty: number | null;
  uncertainty_coverage_factor: number | null;
  notes: string | null;
  created_at: string;
  // Migration 004 statistics
  r_squared: number | null;
  rmse: number | null;
  standard_error: number | null;
  max_error: number | null;
  full_scale_error_pct: number | null;
  non_linearity_pct: number | null;
  repeatability: number | null;
  hysteresis: number | null;
  distribution_type: string | null;
  confidence_level: number | null;
  combined_uncertainty: number | null;
  expanded_uncertainty: number | null;
  valid_range_min: number | null;
  valid_range_max: number | null;
}

export interface CalibrationPoint {
  id: string;
  calibration_id: string;
  point_index: number;
  reference_value: number;
  measured_value: number;
  calculated_value: number | null;
  residual_abs: number | null;
  residual_pct: number | null;
  reference_unit: string;
  measured_unit: string;
  created_at: string;
}

// ------------------------------------------------------------------ //
// Analyze endpoint types                                              //
// ------------------------------------------------------------------ //

export interface AnalyzePointIn {
  reference: number;
  measured: number;
}

export interface AnalyzeRequest {
  points: AnalyzePointIn[];
  reference_unit: string;
  measured_unit: string;
  physical_quantity?: string;
  poly_degree: number | null;
  distribution_type: DistributionType;
  confidence_level: number;
  coverage_factor: number;
  channel_accuracy_value: number | null;
  channel_accuracy_type: string | null;
}

export interface AnalyzePointOut {
  point_index: number;
  reference_value: number;
  measured_value: number;
  calculated_value: number | null;
  residual_abs: number | null;
  residual_pct: number | null;
}

export interface AnalyzeResponse {
  poly_degree: number;
  coefficients: number[];
  r_squared: number;
  rmse: number;
  standard_error: number;
  max_error: number;
  full_scale_error_pct: number;
  non_linearity_pct: number;
  repeatability: number | null;
  hysteresis: number | null;
  combined_uncertainty: number;
  expanded_uncertainty: number;
  distribution_type: DistributionType;
  confidence_level: number;
  coverage_factor: number;
  valid_range_min: number;
  valid_range_max: number;
  passed: boolean;
  points: AnalyzePointOut[];
}

// ------------------------------------------------------------------ //
// Wizard form state                                                   //
// ------------------------------------------------------------------ //

export interface WizardStep1 {
  sensor_id: string;
  calibration_date: string;
  calibration_type: "internal" | "external";
  performed_by_name: string;
  calibration_interval: string;
  // external only
  external_lab_name: string;
  certificate_number: string;
  certificate_expiry_date: string;
  coefficients_only: boolean;
  // internal only
  calibration_method_id: string;
  reference_asset_id: string;
  // environment (optional)
  temperature_value: string;
  temperature_unit: string;
  pressure_value: string;
  pressure_unit: string;
  humidity_value: string;
  humidity_unit: string;
  notes: string;
}

export interface WizardRawPoint {
  reference: string;
  measured: string;
}

// ------------------------------------------------------------------ //
// API create body (mirrors backend CalibrationCreate schema)         //
// ------------------------------------------------------------------ //

export interface CalibrationCoefficientInline {
  channel?: string | null;
  unit_input?: string | null;
  unit_output?: string | null;
  poly_degree: number;
  poly_coefficients: number[];
  range_min?: number | null;
  range_max?: number | null;
  r_squared?: number | null;
  rmse?: number | null;
  standard_error?: number | null;
  max_error?: number | null;
  full_scale_error_pct?: number | null;
  non_linearity_pct?: number | null;
  repeatability?: number | null;
  hysteresis?: number | null;
  distribution_type?: string | null;
  confidence_level?: number | null;
  combined_uncertainty?: number | null;
  expanded_uncertainty?: number | null;
  valid_range_min?: number | null;
  valid_range_max?: number | null;
  notes?: string | null;
}

export interface CalibrationPointInline {
  point_index: number;
  reference_value: number;
  measured_value: number;
  calculated_value?: number | null;
  residual_abs?: number | null;
  residual_pct?: number | null;
  reference_unit: string;
  measured_unit: string;
}

export interface CalibrationCreateBody {
  asset_id: string;
  sensor_id?: string | null;
  calibration_date: string;
  due_date: string;
  performed_by_name: string;
  performed_by_user_id?: string | null;
  external_lab_name?: string | null;
  external_lab_accreditation?: string | null;
  result: CalibrationResult;
  notes?: string | null;
  calibration_type: string;
  reference_asset_id?: string | null;
  calibration_method_id?: string | null;
  certificate_number?: string | null;
  certificate_expiry_date?: string | null;
  calibration_interval?: number | null;
  version: number;
  temperature_value?: number | null;
  temperature_unit?: string | null;
  pressure_value?: number | null;
  pressure_unit?: string | null;
  humidity_value?: number | null;
  humidity_unit?: string | null;
  coefficient?: CalibrationCoefficientInline | null;
  points?: CalibrationPointInline[];
}
