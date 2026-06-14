export type CalibrationStatus =
  | "valid"
  | "due_soon"
  | "expired"
  | "not_calibrated"
  | "retired";

export interface ChannelListItem {
  channel_id: string;
  physical_quantity: string;
  technology: string | null;
  measurement_min: number | null;
  measurement_max: number | null;
  unit: string;
}

export interface AssetListItem {
  id: string;
  asset_id: string;
  asset_type: "sensor" | "daq";
  name: string;
  manufacturer: string;
  model: string;
  serial_number: string | null;
  health_score: number;
  is_active: boolean;
  updated_at: string;
  // location path
  site_name: string | null;      // highest-level ancestor
  location_name: string | null;  // direct location
  // calibration
  calibration_status: CalibrationStatus;
  next_due_at: string | null;
  // type info
  subtype: string | null;        // physical_quantity or daq_type
  technology: string | null;     // sensor technology (first channel)
  // range (first / primary channel)
  range_min: number | null;
  range_max: number | null;
  range_unit: string | null;
  // all sensor channels
  channels: ChannelListItem[];
}
