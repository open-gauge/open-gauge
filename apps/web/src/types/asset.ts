export type AssetCategory =
  | "sensor"
  | "instrument"
  | "reference_standard"
  | "data_acquisition"
  | "other";

export type CalibrationStatus =
  | "valid"
  | "due_soon"
  | "expired"
  | "not_calibrated";

export interface AssetListItem {
  id: string;
  asset_id: string;
  name: string;
  category: AssetCategory;
  manufacturer: string;
  model: string;
  serial_number: string | null;
  calibration_status: CalibrationStatus;
  next_due_at: string | null;
  health_score: number;
  is_active: boolean;
  updated_at: string;
  subtype: string | null;
  site_name: string | null;
  laboratory_name: string | null;
}
