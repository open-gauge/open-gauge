export type CalibrationResult = "pass" | "fail" | "conditional_pass";
export type CoefficientType = "linear" | "polynomial";

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
}
