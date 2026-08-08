export type DistributionType = "normal" | "t" | "chi_squared";

export type DecisionRule = "simple_acceptance" | "guard_band_w_uncertainty" | "shared_risk";

export type CalibrationStatus = "valid" | "pending_approval" | "rejected" | "void";

export type CalibrationType = "oem" | "external_accredited_lab" | "internal_lab" | "customer_asset";

export type CalibrationPurpose = "initial" | "routine" | "after_repair" | "verification";

/** How the data was entered — orthogonal to CalibrationType (who performed it)
 * and CalibrationPurpose (why). "reference_vs_as_found_as_left" only pairs
 * with purpose "after_repair"; "model_direct" never pairs with "after_repair"
 * (backend-enforced, see AGENTS.md's calibration philosophy). "frequency_response"
 * is open to any purpose, like "reference_vs_indicated". This is the
 * wire-level value the backend stores — the wizard's own Step 2 selection is
 * InputMethod below, which derives this value together with the purpose. */
export type DataEntryMode =
  | "raw_data"
  | "model_direct"
  | "reference_vs_indicated"
  | "reference_vs_as_found_as_left"
  | "frequency_response";

/** The wizard's own Step 2 "Input data" method choice — distinct from
 * DataEntryMode above, picked via a dropdown at the top of Step 2 (always
 * set, defaults to "reference_vs_measured"). As-Found/As-Left is not a
 * selectable method here; it's an automatic consequence of picking
 * "reference_vs_measured" or "reference_vs_indicated" together with
 * purpose="after_repair" (see deriveDataEntryMode in CalibrationWizard.tsx). */
export type InputMethod =
  | "reference_vs_measured"
  | "reference_vs_indicated"
  | "model_direct"
  | "frequency_response";

/** What poly_coefficients/custom_formula on a calibration represent.
 * "lookup_table" has neither — the model is the calibration's own primary
 * points, linearly interpolated (data_entry_mode=raw_data's Step 3
 * "Calibration method" only — see CalibrationMethod). */
export type ModelType = "polynomial" | "custom_formula" | "lookup_table";

/** data_entry_mode=raw_data's Step 3 "Calibration method" — how the raw
 * (reference, measured) points become a model. Orthogonal to ModelType
 * above: this selects *which* fitting strategy to run; its result is stored
 * using the same model_type/poly_coefficients/custom_formula fields any
 * other calibration uses. */
export type CalibrationMethod = "polynomial_fit" | "lookup_table" | "custom_formula";

export interface ConformityStatement {
  decision_rule: string;
  specification: string | null;
  expanded_uncertainty_applied: number | null;
  /** The single numeric tolerance the decision rule compared max_error
   * against — only populated for the "percent_of_full_scale" and "absolute"
   * accuracy types. "percent_of_reading" checks each point's residual
   * against its own point's tolerance rather than max_error against one
   * flat number, so it has no single value to report here. */
  tolerance_value: number | null;
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
  checked_by_user_id: string | null;
  checked_by_name: string | null;
  external_lab_name: string | null;
  notes: string | null;
  calibration_file_id: string | null;
  uploaded_certificate_file_id: string | null;
  created_by: string;
  created_at: string;

  // Metadata
  sensor_id: string | null;
  calibration_type: CalibrationType;
  calibration_purpose: CalibrationPurpose;
  calibration_version: number;
  calibration_interval: number | null;
  tolerance_criteria: string | null;

  // Repair tracking — only meaningful when calibration_purpose === "after_repair"
  repair_date: string | null;
  repair_description: string | null;

  // How this record's data was entered, and what its model (if any) is.
  data_entry_mode: DataEntryMode;
  model_type: ModelType;
  custom_formula: string | null;
  // Diagnostic-only "as found" result for reference_vs_as_found_as_left — an
  // AnalyzeResponse-shaped blob; this record's own stats/points are as-left.
  as_found_summary: AnalyzeResponse | null;

  // Traceability
  internal_reference_asset_id: string | null;
  internal_procedure_id: string | null;
  external_lab_certificate_number: string | null;
  calibration_organization_id: string | null;
  daq_id: string | null;
  calibration_data_id: string | null;
  calibration_location_id: string | null;

  // Environmental conditions (canonical units: °C, %RH, Pa)
  temperature: number | null;
  temperature_uncertainty: number | null;
  humidity: number | null;
  humidity_uncertainty: number | null;
  pressure: number | null;
  pressure_uncertainty: number | null;

  // Polynomial model
  poly_order: number | null;
  poly_coefficients: number[] | null;
  range_min: number | null;
  range_max: number | null;

  // data_entry_mode="frequency_response" sweep settings — points are fetched
  // separately via getCalibrationFrequencyResponsePoints, like every other
  // points collection on this resource.
  frequency_response_frequency_unit: string | null;
  frequency_response_amplitude_type: string | null;
  frequency_response_offset_enabled: boolean;
  frequency_response_offset_unit: string | null;
  frequency_response_baseline_sweep_index: number | null;

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

  // Approval workflow
  status: CalibrationStatus;
  decided_by: string | null;
  decided_at: string | null;
  decision_reason: string | null;
}

export interface CalibrationUser {
  id: string;
  name: string;
  email: string;
  profile_picture_url: string | null;
}

/** Minimal external-org candidate for the Calibration Lab picker (External
 * Accredited Lab / Customer's Asset types) — id+name only. */
export interface CalibrationLabCandidate {
  id: string;
  name: string;
}

export interface RepairPeriod {
  label: string;
  after: string | null;
  before: string | null;
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
  point_role: "primary" | "as_found";
  created_at: string;
}

/** One point of a data_entry_mode="frequency_response" sweep, as returned by
 * GET /calibrations/{id}/frequency-response-points. sensitivity_value/
 * deviation_pct are always server-computed. */
export interface FrequencyResponsePoint {
  id: string;
  calibration_id: string;
  sweep_index: number;
  frequency_value: number;
  reference_value: number;
  measured_value: number;
  offset_value: number | null;
  reference_unit: string;
  measured_unit: string;
  sensitivity_value: number | null;
  deviation_pct: number | null;
  created_at: string;
}

/** Minimal shape the shared ResidualsChart component needs — both CalibrationPoint
 * (saved calibrations) and AnalyzePointOut (live wizard analysis) are structural
 * supersets, mapped explicitly at each call site. */
export interface ResidualPoint {
  point_index: number;
  reference_value: number;
  residual_abs: number | null;
  residual_pct: number | null;
}

/** Minimal shape SensitivityChart needs — both AnalyzeFrequencyResponsePointOut
 * (live wizard preview) and FrequencyResponsePoint (saved calibrations) are
 * structural supersets. */
export interface SensitivityChartPoint {
  sweep_index: number;
  frequency_value: number;
  sensitivity_value: number;
  deviation_pct: number;
}

/** Minimal shape PhaseChart needs — only points with a non-null offset_value
 * are plottable, filtered at the call site. */
export interface PhaseChartPoint {
  sweep_index: number;
  frequency_value: number;
  offset_value: number;
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
  /** True for reference_vs_indicated/reference_vs_as_found_as_left — no
   * transference function is known, so no curve is fitted at all. */
  skip_fit?: boolean;
  /** data_entry_mode=raw_data's Step 3 "Calibration method" — consulted
   * only when skip_fit is not set. */
  calibration_method?: CalibrationMethod;
  /** A custom-formula *template* with free parameters (e.g. "a*x + b") —
   * fitted to the points when calibration_method="custom_formula", or
   * resolved via direct substitution of custom_formula_params when
   * skip_fit=true (data_entry_mode=model_direct's declared-values flow). */
  custom_formula_template?: string | null;
  custom_formula_params?: Record<string, number> | null;
  distribution_type: DistributionType;
  confidence_level: number;
  channel_accuracy_value: number | null;
  channel_accuracy_type: string | null;
  decision_rule?: DecisionRule;
  /** The wizard's editable Tolerance box (already converted to reference
   * units client-side) — when set, overrides channel_accuracy_value/type
   * entirely for the conformity check. */
  tolerance_override_value?: number | null;

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
  // Null when the request had skip_fit=true — no curve was fitted.
  poly_degree: number | null;
  coefficients: number[];
  r_squared: number;
  rmse: number;
  standard_error: number;
  max_error: number;
  full_scale_error_pct: number;
  non_linearity_pct: number | null;
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
  /** Set when a custom formula was involved — either fitted
   * (calibration_method="custom_formula") or declared/resolved directly
   * (skip_fit=true + custom_formula_template, model_direct's flow). */
  resolved_custom_formula?: string | null;
  custom_formula_parameter_values?: Record<string, number> | null;
}

// ------------------------------------------------------------------ //
// Wizard form state                                                   //
// ------------------------------------------------------------------ //

export interface WizardStep1 {
  sensor_id: string;
  calibration_date: string;
  calibration_type: "internal" | "external";
  performed_by_name: string;
  performed_by_user_id: string | null;
  checked_by_user_id: string | null;
  checked_by_name: string | null;
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
  point_role?: "primary" | "as_found";
}

/** A frequency-response sweep point for the create body — sensitivity_value/
 * deviation_pct are never sent, the server always computes them. */
export interface FrequencyResponsePointInline {
  sweep_index: number;
  frequency_value: number;
  reference_value: number;
  measured_value: number;
  offset_value?: number | null;
  reference_unit: string;
  measured_unit: string;
}

// ------------------------------------------------------------------ //
// Analyze-frequency-response endpoint types                          //
// ------------------------------------------------------------------ //

export interface AnalyzeFrequencyResponsePointIn {
  sweep_index: number;
  frequency_value: number;
  reference_value: number;
  measured_value: number;
}

export interface AnalyzeFrequencyResponseRequest {
  points: AnalyzeFrequencyResponsePointIn[];
  baseline_sweep_index: number;
}

export interface AnalyzeFrequencyResponsePointOut {
  sweep_index: number;
  frequency_value: number;
  reference_value: number;
  measured_value: number;
  sensitivity_value: number;
  deviation_pct: number;
}

export interface AnalyzeFrequencyResponseResponse {
  gain: number;
  poly_coefficients: number[];
  range_min: number;
  range_max: number;
  points: AnalyzeFrequencyResponsePointOut[];
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
  checked_by_user_id?: string | null;
  checked_by_name?: string | null;
  external_lab_name?: string | null;
  notes?: string | null;

  // Metadata
  calibration_type: CalibrationType;
  calibration_purpose?: CalibrationPurpose;
  calibration_interval?: number | null;
  tolerance_criteria?: string | null;

  // Repair tracking — only meaningful when calibration_purpose === "after_repair"
  repair_date?: string | null;
  repair_description?: string | null;

  data_entry_mode?: DataEntryMode;
  model_type?: ModelType;
  custom_formula?: string | null;
  // Diagnostic-only "as found" dataset for reference_vs_as_found_as_left —
  // this record's own points/stats fields are the as-left (primary) result.
  as_found_points?: CalibrationPointInline[];
  as_found_summary?: AnalyzeResponse | null;

  // Traceability
  internal_reference_asset_id?: string | null;
  internal_procedure_id?: string | null;
  external_lab_certificate_number?: string | null;
  calibration_organization_id?: string | null;
  daq_id?: string | null;
  calibration_location_id?: string | null;

  // Environmental conditions (canonical units: °C, %RH, Pa)
  temperature?: number | null;
  temperature_uncertainty?: number | null;
  humidity?: number | null;
  humidity_uncertainty?: number | null;
  pressure?: number | null;
  pressure_uncertainty?: number | null;

  // Polynomial model
  poly_order?: number | null;
  poly_coefficients?: number[] | null;
  range_min?: number | null;
  range_max?: number | null;

  // data_entry_mode="frequency_response" sweep settings + points
  frequency_response_frequency_unit?: string | null;
  frequency_response_amplitude_type?: string | null;
  frequency_response_offset_enabled?: boolean;
  frequency_response_offset_unit?: string | null;
  frequency_response_baseline_sweep_index?: number | null;
  frequency_response_points?: FrequencyResponsePointInline[];

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
