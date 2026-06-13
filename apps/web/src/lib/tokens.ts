/**
 * MAR design tokens — single source of truth for colours, labels, and
 * chart-specific data used across the frontend.
 *
 * Tailwind semantic classes (text-mar-*, bg-mar-*, …) are defined in
 * tailwind.config.ts and should be used for JSX class names.
 *
 * The COLORS object below is for contexts where a raw hex string is
 * required (e.g. Recharts stroke/fill props, SVG attributes).
 */

// ---------------------------------------------------------------------------
// Brand colours (hex) — mirrors the mar.* entries in tailwind.config.ts
// ---------------------------------------------------------------------------
export const COLORS = {
  bgDark:      "#0f1c26",
  textPrimary: "#152330",
  action:      "#1b4f64",
  actionDark:  "#154050",
  accent:      "#2f819b",
  accentDark:  "#256a81",
} as const;

// ---------------------------------------------------------------------------
// Calibration status
// ---------------------------------------------------------------------------
export const CALIBRATION_STATUS_STYLE: Record<string, string> = {
  valid:          "bg-emerald-50 text-emerald-600 border-emerald-100",
  due_soon:       "bg-amber-50 text-amber-600 border-amber-100",
  expired:        "bg-red-50 text-red-600 border-red-100",
  not_calibrated: "bg-gray-50 text-gray-500 border-gray-100",
};

export const CALIBRATION_STATUS_LABEL: Record<string, string> = {
  valid:          "Valid",
  due_soon:       "Due soon",
  expired:        "Expired",
  not_calibrated: "Uncalibrated",
};

// ---------------------------------------------------------------------------
// Asset categories
// ---------------------------------------------------------------------------
export const ASSET_CATEGORY_LABEL: Record<string, string> = {
  sensor:             "Sensor",
  instrument:         "Instrument",
  reference_standard: "Ref. Standard",
  data_acquisition:   "DAQ",
  other:              "Other",
};

export const ASSET_CATEGORY_LABEL_PLURAL: Record<string, string> = {
  sensor:             "Sensors",
  instrument:         "Instruments",
  reference_standard: "Ref. Standards",
  data_acquisition:   "DAQ",
  other:              "Other",
};

// ---------------------------------------------------------------------------
// Asset subtypes — used by the category distribution donut charts
// ---------------------------------------------------------------------------
export const SUBTYPE_COLOR: Record<string, string> = {
  // sensor types
  temperature:        "#06b6d4",
  pressure:           "#3b82f6",
  flow:               "#22c55e",
  humidity:           "#f59e0b",
  electrical:         "#8b5cf6",
  distance:           "#ec4899",
  angle:              "#f97316",
  force:              "#14b8a6",
  angular_speed:      "#6366f1",
  acceleration:       "#ef4444",
  // instrument types
  transmitter:        "#0ea5e9",
  controller:         "#7c3aed",
  indicator:          "#16a34a",
  recorder:           "#d97706",
  // daq types
  data_logger:        "#06b6d4",
  signal_conditioner: "#3b82f6",
  gateway:            "#22c55e",
  // reference standard (no subtype breakdown)
  reference_standard: "#f59e0b",
  other:              "#6b7280",
};

export const SUBTYPE_LABEL: Record<string, string> = {
  temperature:        "Temp.",
  pressure:           "Pressure",
  flow:               "Flow",
  humidity:           "Humidity",
  electrical:         "Electrical",
  distance:           "Distance",
  angle:              "Angle",
  force:              "Force",
  angular_speed:      "Ang. Speed",
  acceleration:       "Accel.",
  transmitter:        "Transmitter",
  controller:         "Controller",
  indicator:          "Indicator",
  recorder:           "Recorder",
  data_logger:        "Data Logger",
  signal_conditioner: "Sig. Cond.",
  gateway:            "Gateway",
  reference_standard: "Ref. Std.",
  other:              "Other",
};
