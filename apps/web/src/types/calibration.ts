export type DistributionType = "normal" | "t" | "chi_squared";

export type DecisionRule = "simple_acceptance" | "guard_band_w_uncertainty" | "shared_risk";

export interface ConformityStatement {
  decision_rule: string;
  specification: string | null;
  expanded_uncertainty_applied: number | null;
  passed: boolean;
  reason: string | null;
}

export interface CalibrationRecord {
  id: string;
  asset_id: string;
  calibration_date: string;
  due_date: string;
  performed_by_name: string;
  performed_by_user_id: string | null;
  external_lab_name: string | null;
  notes: string | null;
  calibration_file_id: string | null;
  created_by: string;
  created_at: string;

  // Metadata
  sensor_id: string | null;
  calibration_type: string;
  calibration_version: number;
  calibration_interval: number | null;
  tolerance_criteria: string | null;

  // Traceability
  internal_reference_asset_id: string | null;
  internal_procedure_id: string | null;
  external_lab_certificate_number: string | null;
  daq_id: string | null;
  calibration_data_id: string | null;
  calibration_location_id: string | null;

  // Environmental conditions (canonical units: °C, %RH, Pa)
  temperature: number | null;
  humidity: number | null;
  pressure: number | null;

  // Polynomial model
  poly_order: number | null;
  poly_coefficients: number[] | null;
  range_min: number | null;
  range_max: number | null;

  // Regression statistics
  r_squared: number | null;
  rmse: number | null;
  standard_error: number | null;
  max_error: number | null;
  full_scale_error: number | null;
  non_linearity: number | null;
  repeatability: number | null;
  hysteresis: number | null;
  distribution_type: string | null;
  confidence_level: number | null;
  coverage_factor: number | null;
  combined_uncertainty: number | null;
  expanded_uncertainty: number | null;
  valid_range_min: number | null;
  valid_range_max: number | null;

  // Uncertainty budget (GUM Annex H.1-style itemized contributions)
  uncertainty_budget: UncertaintyContribution[] | null;
  effective_degrees_of_freedom: number | null;

  // Fitted coefficient covariance matrix (GUM Annex H.3 / GUM-6 §8.1.6)
  poly_coefficients_covariance: number[][] | null;

  // Decision rule / conformity statement (ISO/IEC 17025 §7.1.3, §7.8.6)
  decision_rule: string | null;
  conformity_statement: ConformityStatement | null;

  // Soft-void state
  is_active: boolean;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
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
  channel_accuracy_value: number | null;
  channel_accuracy_type: string | null;
  decision_rule?: DecisionRule;

  // Type B uncertainty contributions (GUM §4.3) — all optional.
  reference_standard_uncertainty?: number | null;
  reference_standard_coverage_factor?: number;
  resolution?: number | null;
  sensor_nominal_uncertainty?: number | null;
  sensor_nominal_coverage_factor?: number;
  include_sensor_nominal_uncertainty?: boolean;
}

export interface AnalyzePointOut {
  point_index: number;
  reference_value: number;
  measured_value: number;
  calculated_value: number | null;
  residual_abs: number | null;
  residual_pct: number | null;
}

export interface UncertaintyContribution {
  source: string;
  description: string;
  value: number;
  distribution: string;
  divisor: number;
  standard_uncertainty: number;
  degrees_of_freedom: number | null;
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
  conformity_statement: ConformityStatement;
  uncertainty_budget: UncertaintyContribution[];
  effective_degrees_of_freedom: number | null;
  poly_coefficients_covariance: number[][] | null;
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
  external_lab_certificate_number: string;
  coefficients_only: boolean;
  // internal only
  internal_procedure_id: string;
  internal_reference_asset_id: string;
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
// Inline data point for create body                                  //
// ------------------------------------------------------------------ //

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

// ------------------------------------------------------------------ //
// API create body (mirrors backend CalibrationCreate schema)         //
// ------------------------------------------------------------------ //

export interface CalibrationCreateBody {
  asset_id: string;
  sensor_id?: string | null;
  calibration_date: string;
  due_date: string;
  performed_by_name: string;
  performed_by_user_id?: string | null;
  external_lab_name?: string | null;
  notes?: string | null;

  // Metadata
  calibration_type: string;
  calibration_interval?: number | null;
  tolerance_criteria?: string | null;

  // Traceability
  internal_reference_asset_id?: string | null;
  internal_procedure_id?: string | null;
  external_lab_certificate_number?: string | null;
  daq_id?: string | null;
  calibration_location_id?: string | null;

  // Environmental conditions (canonical units: °C, %RH, Pa)
  temperature?: number | null;
  humidity?: number | null;
  pressure?: number | null;

  // Polynomial model
  poly_order?: number | null;
  poly_coefficients?: number[] | null;
  range_min?: number | null;
  range_max?: number | null;

  // Regression statistics
  r_squared?: number | null;
  rmse?: number | null;
  standard_error?: number | null;
  max_error?: number | null;
  full_scale_error?: number | null;
  non_linearity?: number | null;
  repeatability?: number | null;
  hysteresis?: number | null;
  distribution_type?: string | null;
  confidence_level?: number | null;
  coverage_factor?: number | null;
  combined_uncertainty?: number | null;
  expanded_uncertainty?: number | null;
  valid_range_min?: number | null;
  valid_range_max?: number | null;

  // Uncertainty budget (GUM Annex H.1-style itemized contributions)
  uncertainty_budget?: UncertaintyContribution[] | null;
  effective_degrees_of_freedom?: number | null;

  // Fitted coefficient covariance matrix (GUM Annex H.3 / GUM-6 §8.1.6)
  poly_coefficients_covariance?: number[][] | null;

  // Decision rule / conformity statement (ISO/IEC 17025 §7.1.3, §7.8.6)
  decision_rule?: string | null;
  conformity_statement?: ConformityStatement | null;

  // Embedded data points
  points?: CalibrationPointInline[];
}
