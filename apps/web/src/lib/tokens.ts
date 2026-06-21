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
  scatter:     "#ef4444",
} as const;

// ---------------------------------------------------------------------------
// Calibration status
// ---------------------------------------------------------------------------
export const CALIBRATION_STATUS_STYLE: Record<string, string> = {
  valid:          "bg-emerald-50 text-emerald-600 border-emerald-100",
  due_soon:       "bg-amber-50 text-amber-600 border-amber-100",
  expired:        "bg-red-50 text-red-600 border-red-100",
  not_calibrated: "bg-gray-50 text-gray-500 border-gray-100",
  retired:        "bg-gray-100 text-gray-400 border-gray-200",
};

export const CALIBRATION_STATUS_LABEL: Record<string, string> = {
  valid:          "Active",
  due_soon:       "Due soon",
  expired:        "Expired",
  not_calibrated: "Uncalibrated",
  retired:        "Retired",
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
  // physical quantities (sensor channels)
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
  // daq_type values (from daq table)
  USB:                "#06b6d4",
  Wireless:           "#8b5cf6",
  Ethernet:           "#3b82f6",
  PCIe:               "#f97316",
  PXI:                "#14b8a6",
  // legacy / fallback
  data_logger:        "#06b6d4",
  signal_conditioner: "#3b82f6",
  gateway:            "#22c55e",
  reference_standard: "#f59e0b",
  other:              "#6b7280",
};

// ---------------------------------------------------------------------------
// Procedure difficulty
// ---------------------------------------------------------------------------
export const PROCEDURE_DIFFICULTY_STYLE: Record<string, string> = {
  Basic:        "bg-gray-100 text-gray-600 border-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:border-gray-700",
  Intermediate: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-800",
  Advanced:     "bg-red-50 text-red-600 border-red-200 dark:bg-red-900/30 dark:text-red-400 dark:border-red-800",
};

export const PROCEDURE_DIFFICULTY_LABEL: Record<string, string> = {
  Basic:        "Basic",
  Intermediate: "Intermediate",
  Advanced:     "Advanced",
};

export const SUBTYPE_LABEL: Record<string, string> = {
  // physical quantities
  temperature:        "Temperature",
  pressure:           "Pressure",
  flow:               "Flow",
  humidity:           "Humidity",
  electrical:         "Electrical",
  distance:           "Distance",
  angle:              "Angle",
  force:              "Force",
  angular_speed:      "Ang. Speed",
  acceleration:       "Accel.",
  // daq_type values
  USB:                "USB",
  Wireless:           "Wireless",
  Ethernet:           "Ethernet",
  PCIe:               "PCIe",
  PXI:                "PXI",
  // legacy / fallback
  data_logger:        "Data Logger",
  signal_conditioner: "Sig. Cond.",
  gateway:            "Gateway",
  reference_standard: "Ref. Std.",
  other:              "Other",
};
