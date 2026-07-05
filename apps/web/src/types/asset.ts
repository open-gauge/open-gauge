// ---------------------------------------------------------------------------
// Full sensor channel (used on profile page — includes accuracy, output, etc.)
// ---------------------------------------------------------------------------
export interface SensorChannelFull {
  id: string;
  asset_id: string;
  channel_id: string;
  physical_quantity: string;
  measurement_type: string | null;
  unit: string;
  technology: string | null;
  measurement_min: number | null;
  measurement_max: number | null;
  accuracy_value: number | null;
  accuracy_type: string | null;
  accuracy_unit: string | null;
  resolution: number | null;
  resolution_unit: string | null;
  measurement_uncertainty: number | null;
  uncertainty_unit: string | null;
  confidence_level: number | null;
  coverage_factor: number | null;
  drift_rate: number | null;
  drift_unit: string | null;
  sensitivity: number | null;
  sensitivity_unit: string | null;
  response_time_ms: number | null;
  bandwidth_hz: number | null;
  output_signal_min: number | null;
  output_signal_max: number | null;
  output_signal_unit: string | null;
  output_type: string | null;
  calibration_role: string | null;
  criticality: string | null;
  calibration_method_id: string | null;
  calibration_method_name: string | null;
  calibration_interval: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ---------------------------------------------------------------------------
// Full DAQ details (used on profile page)
// ---------------------------------------------------------------------------
export interface DaqDetailsFull {
  id: string;
  asset_id: string;
  daq_type: string;
  input_channels: number;
  output_channels: number;
  input_signal_types: string | null;
  output_signal_types: string | null;
  sampling_rate_hz: number | null;
  per_channel_sampling_rate_hz: number | null;
  adc_resolution_bits: number | null;
  adc_type: string | null;
  input_voltage_range_min: number | null;
  input_voltage_range_max: number | null;
  noise_floor_uv_rms: number | null;
  dynamic_range_db: number | null;
  synchronization_supported: boolean;
  clock_source: string | null;
  time_sync_precision_ns: number | null;
  jitter_ns: number | null;
  communication_protocol: string | null;
  interface_type: string | null;
  trigger_modes: string | null;
  input_impedance_ohm: number | null;
  is_active: boolean;
}

// ---------------------------------------------------------------------------
// Asset profile — full detail for the profile page
// ---------------------------------------------------------------------------
export interface AssetProfile {
  id: string;
  asset_id: string;
  asset_type: "sensor" | "daq";
  name: string;
  description: string | null;
  manufacturer: string;
  model: string;
  serial_number: string | null;
  manufacturer_part_number: string | null;
  location_id: string | null;
  firmware_version: string | null;
  power_supply: string | null;
  power_consumption_w: number | null;
  dimensions: string | null;
  weight_kg: number | null;
  mounting_type: string | null;
  connection_type: string | null;
  displays_readings: boolean;
  ip_rating: string | null;
  hazardous_area_rating: string | null;
  operating_temperature_min: number | null;
  operating_temperature_max: number | null;
  operating_humidity_min: number | null;
  operating_humidity_max: number | null;
  health_score: number;
  price_eur: number | null;
  purchase_date: string | null;
  warranty_expiry_date: string | null;
  owner: string | null;
  is_active: boolean;
  retired_at: string | null;
  retired_reason: string | null;
  version: number;
  notes: string | null;
  pinout_table: Array<{ pin_number: number; name: string; description: string }> | null;
  pinout_image_id: string | null;
  sensor_image_id: string | null;
  sensor_schematic_id: string | null;
  created_at: string;
  updated_at: string;
  sensor_channels: SensorChannelFull[];
  daq_details: DaqDetailsFull | null;
  // enriched
  site_name: string | null;
  location_name: string | null;
  location_code: string | null;
  location_description: string | null;
  location_latitude: number | null;
  location_longitude: number | null;
  calibration_status: CalibrationStatus;
  next_due_at: string | null;
  last_calibration_date: string | null;
  calibration_count: number;
  subtype: string | null;
  technology: string | null;
  owner_name: string | null;
  calibration_health_score: number | null;
}

export type CalibrationStatus =
  | "valid"
  | "due_soon"
  | "expired"
  | "not_calibrated"
  | "retired";

// ---------------------------------------------------------------------------
// Location option (for location picker in edit mode)
// ---------------------------------------------------------------------------
export interface LocationOption {
  id: string;
  path: string;
}

// ---------------------------------------------------------------------------
// Asset update request (PUT /assets/{id})
// ---------------------------------------------------------------------------
export interface SensorChannelUpdateInput {
  sensor_id?: string | null;
  channel_id: string;
  physical_quantity: string;
  measurement_type?: string | null;
  unit: string;
  technology?: string | null;
  measurement_min?: number | null;
  measurement_max?: number | null;
  accuracy_value?: number | null;
  accuracy_type?: string | null;
  accuracy_unit?: string | null;
  resolution?: number | null;
  resolution_unit?: string | null;
  measurement_uncertainty?: number | null;
  uncertainty_unit?: string | null;
  drift_rate?: number | null;
  drift_unit?: string | null;
  response_time_ms?: number | null;
  bandwidth_hz?: number | null;
  output_signal_min?: number | null;
  output_signal_max?: number | null;
  output_signal_unit?: string | null;
  output_type?: string | null;
  calibration_role?: string | null;
}

export interface AssetCreateBody {
  asset_id: string;
  asset_type: "sensor" | "daq";
  name: string;
  manufacturer: string;
  model: string;
  serial_number?: string | null;
  description?: string | null;
  location_id?: string | null;
  owner?: string | null;
}

export interface AssetUpdateRequest {
  asset_id?: string;
  name?: string;
  description?: string | null;
  manufacturer?: string;
  model?: string;
  serial_number?: string | null;
  manufacturer_part_number?: string | null;
  location_id?: string | null;
  firmware_version?: string | null;
  power_supply?: string | null;
  power_consumption_w?: number | null;
  dimensions?: string | null;
  weight_kg?: number | null;
  mounting_type?: string | null;
  connection_type?: string | null;
  ip_rating?: string | null;
  hazardous_area_rating?: string | null;
  operating_temperature_min?: number | null;
  operating_temperature_max?: number | null;
  operating_humidity_min?: number | null;
  operating_humidity_max?: number | null;
  price_eur?: number | null;
  purchase_date?: string | null;
  warranty_expiry_date?: string | null;
  owner?: string | null;
  notes?: string | null;
  pinout_table?: Array<{ pin_number: number; name: string; description: string }> | null;
  sensor_channels?: SensorChannelUpdateInput[];
}

export interface ChannelListItem {
  channel_id: string;
  physical_quantity: string;
  technology: string | null;
  measurement_min: number | null;
  measurement_max: number | null;
  unit: string;
  calibration_role: string | null;
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
