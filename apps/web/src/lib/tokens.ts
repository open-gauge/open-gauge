/**
 * Open Gauge design tokens — single source of truth for colours, labels, and
 * chart-specific data used across the frontend.
 *
 * Tailwind semantic classes (text-og-*, bg-og-*, …) are defined in the
 * `@theme` block in globals.css and should be used for JSX class names.
 *
 * The COLORS object below is for contexts where a raw hex string is
 * required (e.g. Recharts stroke/fill props, SVG attributes).
 */

// ---------------------------------------------------------------------------
// Brand colours (hex) — mirrors the --color-og-* entries in globals.css
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
// API Reference — HTTP method badges (embedded API Reference sidebar/pages)
// ---------------------------------------------------------------------------
export const HTTP_METHOD_STYLE: Record<string, string> = {
  GET:    "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  POST:   "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  PUT:    "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  PATCH:  "bg-violet-500/10 text-violet-600 dark:text-violet-400",
  DELETE: "bg-red-500/10 text-red-600 dark:text-red-400",
};

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
// Audit log entity types
// ---------------------------------------------------------------------------
export const AUDIT_ENTITY_LABEL: Record<string, string> = {
  asset:       "Asset",
  calibration: "Calibration",
  procedure:   "Procedure",
  location:    "Location",
};

export const AUDIT_ENTITY_STYLE: Record<string, string> = {
  asset:       "bg-blue-50 text-blue-600 border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/40",
  calibration: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/40",
  procedure:   "bg-purple-50 text-purple-600 border-purple-100 dark:bg-purple-900/20 dark:text-purple-400 dark:border-purple-900/40",
  location:    "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40",
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

// ---------------------------------------------------------------------------
// Health tab — score label, stability, and per-metric chart colours
// ---------------------------------------------------------------------------
export const HEALTH_LABEL_STYLE: Record<string, string> = {
  Excellent: "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/40",
  Good:      "bg-cyan-50 text-cyan-600 border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-900/40",
  Fair:      "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40",
  Poor:      "bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40",
};

export const STABILITY_STYLE: Record<string, string> = {
  Stable:   "bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/40",
  Drifting: "bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/40",
  Unstable: "bg-red-50 text-red-600 border-red-100 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/40",
};

// Series colours for the Calibration Stability multi-line chart.
export const HEALTH_METRIC_COLOR: Record<string, string> = {
  rmse:                 "#3b82f6",
  max_error:            "#ef4444",
  expanded_uncertainty: "#f59e0b",
  hysteresis:           "#8b5cf6",
  r_squared:            "#22c55e",
};

// Human-readable labels for uncertainty budget contribution sources (GUM Annex H.1 rows).
export const UNCERTAINTY_SOURCE_LABEL: Record<string, string> = {
  fit_residuals:           "Fit residuals (Type A)",
  reference_standard:      "Reference standard (Type B)",
  resolution:               "Resolution (Type B)",
  sensor_nominal_accuracy: "Sensor nominal accuracy (Type B)",
  external_certificate_stated: "Stated on external certificate (Type B)",
};

// Human-readable labels for ISO/IEC 17025 §7.1.3/§7.8.6 decision rules.
export const DECISION_RULE_LABEL: Record<string, string> = {
  simple_acceptance:         "Simple acceptance (tolerance only)",
  guard_band_w_uncertainty:  "Guard band (tolerance − U)",
  shared_risk:               "Shared risk (tolerance + U)",
};
