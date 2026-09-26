import type { TemplateType } from "@/types/template";

// Variable catalog for the Document Template editor.
//
// Labels and descriptions are NOT hardcoded here — they live in
// messages/{locale}/templates.json under "variables.labels" /
// "variables.categoryLabels" / "variables.categoryDescriptions", looked up
// by `key` from the UI layer (same convention as tokens.ts + tokens.json).

export interface TemplateVariableDef {
  /** Dot-path token used inside {{ }}, e.g. "asset.id" or "measurement.reference". */
  key: string;
  /** Sample value shown in Preview Data mode. */
  sample: string | number;
}

export interface TemplateCollectionFieldDef {
  /** Field key relative to the collection item, e.g. "reference" -> {{measurement.reference}}. */
  key: string;
  sample: string | number;
}

export interface TemplateCollectionVariableDef {
  /** Collection token used for {{#key}}...{{/key}} repeats and table `repeat` binding. */
  key: string;
  /** Singular item scope prefix, e.g. "measurement" for the "measurements" collection. */
  itemScope: string;
  fields: TemplateCollectionFieldDef[];
  rowCount: number;
}

export interface TemplateVariableCategoryDef {
  key: string;
  variables: TemplateVariableDef[];
  collections?: TemplateCollectionVariableDef[];
}

const ASSET_CATEGORY: TemplateVariableCategoryDef = {
  key: "asset",
  variables: [
    { key: "asset.id", sample: "OG-000123" },
    { key: "asset.name", sample: "PT100 Temperature Sensor" },
    { key: "asset.serial_number", sample: "SN-2026-00421" },
    { key: "asset.manufacturer", sample: "Fluke" },
    { key: "asset.model", sample: "5628" },
    { key: "asset.type", sample: "Temperature Sensor" },
    { key: "asset.description", sample: "Reference PT100 probe used for tank calibration." },
    { key: "asset.location", sample: "Lab A / Bench 3" },
    { key: "asset.status", sample: "Active" },
    { key: "asset.public_url", sample: "https://opengauge.example/assets/OG-000123" },
  ],
  collections: [
    {
      key: "asset_channels",
      itemScope: "channel",
      rowCount: 2,
      fields: [
        { key: "id", sample: "TT" },
        { key: "physical_quantity", sample: "Temperature" },
        { key: "unit", sample: "°C" },
        { key: "technology", sample: "RTD Pt100" },
        { key: "range_min", sample: -20 },
        { key: "range_max", sample: 600 },
        { key: "measurement_range", sample: "-20 to 600 °C" },
        { key: "accuracy", sample: "± 0.048 °C" },
        { key: "resolution", sample: 0.31 },
        { key: "uncertainty", sample: 0.124 },
        { key: "output_signal_min", sample: 4 },
        { key: "output_signal_max", sample: 20 },
        { key: "output_signal_unit", sample: "mA" },
        { key: "output_signal_range", sample: "4 to 20 mA" },
      ],
    },
  ],
};

const CALIBRATION_CATEGORY: TemplateVariableCategoryDef = {
  key: "calibration",
  variables: [
    { key: "calibration.id", sample: "CAL-2026-04471" },
    { key: "calibration.date", sample: "28 Aug 2026" },
    { key: "calibration.next_date", sample: "28 Aug 2027" },
    { key: "calibration.type", sample: "Periodic" },
    { key: "calibration.method", sample: "Comparison to reference standard" },
    { key: "calibration.status", sample: "Valid" },
    { key: "calibration.laboratory", sample: "Open Gauge Calibration Lab" },
    { key: "calibration.certificate_number", sample: "CERT-2026-01187" },
    { key: "calibration.certificate_url", sample: "https://opengauge.example/certificates/CERT-2026-01187" },
    { key: "calibration.technician", sample: "Jordan Reyes" },
  ],
};

const CALIBRATION_RESULTS_CATEGORY: TemplateVariableCategoryDef = {
  key: "calibration_results",
  variables: [
    { key: "calibration.coefficients", sample: "a0=0.1023, a1=0.9987, a2=-0.00004" },
    { key: "calibration.polynomial_order", sample: 2 },
    { key: "calibration.statistics.r_squared", sample: "0.9998" },
    { key: "calibration.statistics.rmse", sample: "0.304 °C" },
    { key: "calibration.statistics.max_error", sample: "0.612 °C" },
    { key: "calibration.statistics.full_scale_error", sample: "0.15 %FS" },
    { key: "calibration.statistics.non_linearity", sample: "0.08 %FS" },
    { key: "calibration.statistics.hysteresis", sample: "0.04 %FS" },
    { key: "calibration.uncertainty.combined", sample: "0.18 °C" },
    { key: "calibration.uncertainty.expanded", sample: "0.36 °C (k=2)" },
  ],
};

const MEASUREMENTS_CATEGORY: TemplateVariableCategoryDef = {
  key: "measurements",
  variables: [],
  collections: [
    {
      key: "measurements",
      itemScope: "measurement",
      rowCount: 5,
      fields: [
        { key: "index", sample: 1 },
        { key: "reference", sample: "20.000" },
        { key: "measured", sample: "20.041" },
        { key: "fitted", sample: "20.006" },
        { key: "residual", sample: "0.035" },
        { key: "uncertainty", sample: "0.021" },
      ],
    },
  ],
};

const ORGANIZATION_CATEGORY: TemplateVariableCategoryDef = {
  key: "organization",
  variables: [
    { key: "organization.name", sample: "Open Gauge Metrology" },
    { key: "organization.address", sample: "1200 Industrial Ave, Springfield" },
    { key: "organization.email", sample: "lab@opengauge.example" },
    { key: "organization.website", sample: "opengauge.example" },
    { key: "organization.accreditation_number", sample: "ISO/IEC 17025 - 4471" },
  ],
};

const USER_CATEGORY: TemplateVariableCategoryDef = {
  key: "user",
  variables: [
    { key: "user.name", sample: "Jordan Reyes" },
    { key: "user.email", sample: "jordan.reyes@opengauge.example" },
    { key: "user.role", sample: "Calibration Technician" },
  ],
};

const DATES_CATEGORY: TemplateVariableCategoryDef = {
  key: "dates",
  variables: [
    { key: "date.current", sample: "28 Aug 2026" },
    { key: "date.calibration", sample: "28 Aug 2026" },
    { key: "date.issue", sample: "28 Aug 2026" },
    { key: "date.expiration", sample: "28 Aug 2027" },
  ],
};

// Resolved from actual layout context (which page a block renders on) when available — see
// lib/template-preview.ts's `pageContext` param — with these samples as the generic fallback.
const PAGE_CATEGORY: TemplateVariableCategoryDef = {
  key: "page",
  variables: [
    { key: "page.current", sample: 1 },
    { key: "page.total", sample: 1 },
  ],
};

export const CERTIFICATE_VARIABLE_CATEGORIES: TemplateVariableCategoryDef[] = [
  ASSET_CATEGORY,
  CALIBRATION_CATEGORY,
  CALIBRATION_RESULTS_CATEGORY,
  MEASUREMENTS_CATEGORY,
  ORGANIZATION_CATEGORY,
  USER_CATEGORY,
  DATES_CATEGORY,
  PAGE_CATEGORY,
];

const EQUIPMENT_CATEGORY: TemplateVariableCategoryDef = {
  key: "equipment",
  variables: [
    { key: "equipment.asset_type", sample: "Pressure Gauge" },
    { key: "equipment.name", sample: "Digital Pressure Calibrator" },
    { key: "equipment.model", sample: "DPI 620" },
  ],
  collections: [
    {
      key: "required_equipment",
      itemScope: "item",
      rowCount: 3,
      fields: [
        { key: "name", sample: "Reference pressure standard" },
        { key: "model", sample: "Druck DPI 620" },
      ],
    },
  ],
};

const PROCEDURE_CATEGORY: TemplateVariableCategoryDef = {
  key: "procedure",
  variables: [
    { key: "procedure.number", sample: "PROC-PRE-014" },
    { key: "procedure.revision", sample: "Rev. C" },
    { key: "procedure.title", sample: "Pressure Gauge Calibration Procedure" },
    { key: "procedure.standard_ref", sample: "ISO 5171" },
    { key: "procedure.description", sample: "Comparison calibration of a pressure gauge against a reference pressure standard across its full scale." },
    { key: "procedure.author", sample: "Casey Morgan" },
    { key: "procedure.duration_min", sample: 45 },
    { key: "procedure.tags", sample: "pressure, comparison, field" },
    { key: "procedure.physical_quantity", sample: "Pressure" },
    { key: "procedure.difficulty", sample: "Intermediate" },
  ],
};

const MATERIALS_CATEGORY: TemplateVariableCategoryDef = {
  key: "materials",
  variables: [],
  collections: [
    {
      key: "materials",
      itemScope: "material",
      rowCount: 2,
      fields: [
        { key: "name", sample: "Thread sealant tape" },
        { key: "quantity", sample: "1 roll" },
      ],
    },
  ],
};

const ENVIRONMENT_CATEGORY: TemplateVariableCategoryDef = {
  key: "environment",
  variables: [],
  collections: [
    {
      key: "environmental_conditions",
      itemScope: "condition",
      rowCount: 3,
      fields: [
        { key: "parameter", sample: "Ambient temperature" },
        { key: "value", sample: "20 ± 2 °C" },
      ],
    },
  ],
};

const STEPS_CATEGORY: TemplateVariableCategoryDef = {
  key: "steps",
  variables: [],
  collections: [
    {
      key: "steps",
      itemScope: "step",
      rowCount: 4,
      fields: [
        { key: "index", sample: 1 },
        { key: "title", sample: "Zero the reference standard" },
        { key: "description", sample: "Vent both ports to atmosphere and record the zero reading." },
        { key: "duration_min", sample: 5 },
      ],
    },
  ],
};

const ACCEPTANCE_CATEGORY: TemplateVariableCategoryDef = {
  key: "acceptance_criteria",
  variables: [],
  collections: [
    {
      key: "acceptance_criteria",
      itemScope: "criterion",
      rowCount: 3,
      fields: [
        { key: "label", sample: "Maximum permissible error" },
        { key: "limit", sample: "± 0.5 %FS" },
      ],
    },
  ],
};

const SAFETY_CATEGORY: TemplateVariableCategoryDef = {
  key: "safety",
  variables: [],
  collections: [
    {
      key: "safety_instructions",
      itemScope: "instruction",
      rowCount: 2,
      fields: [{ key: "text", sample: "Depressurize the system before disconnecting fittings." }],
    },
  ],
};

const APPROVAL_CATEGORY: TemplateVariableCategoryDef = {
  key: "approval",
  variables: [
    { key: "approval.approver_name", sample: "Casey Morgan" },
    { key: "approval.approved_date", sample: "12 Jul 2026" },
    { key: "approval.status", sample: "Approved" },
  ],
};

const REVISION_HISTORY_CATEGORY: TemplateVariableCategoryDef = {
  key: "revision_history",
  variables: [],
  collections: [
    {
      key: "revision_history",
      itemScope: "revision",
      rowCount: 3,
      fields: [
        { key: "version", sample: "Rev. C" },
        { key: "date", sample: "12 Jul 2026" },
        { key: "author", sample: "Casey Morgan" },
        { key: "change_reason", sample: "Updated acceptance criteria for new reference standard" },
      ],
    },
  ],
};

export const PROCEDURE_VARIABLE_CATEGORIES: TemplateVariableCategoryDef[] = [
  EQUIPMENT_CATEGORY,
  PROCEDURE_CATEGORY,
  MATERIALS_CATEGORY,
  ENVIRONMENT_CATEGORY,
  STEPS_CATEGORY,
  ACCEPTANCE_CATEGORY,
  SAFETY_CATEGORY,
  USER_CATEGORY,
  APPROVAL_CATEGORY,
  REVISION_HISTORY_CATEGORY,
  DATES_CATEGORY,
  PAGE_CATEGORY,
];

export function variableCategoriesForType(type: TemplateType): TemplateVariableCategoryDef[] {
  return type === "certificate" ? CERTIFICATE_VARIABLE_CATEGORIES : PROCEDURE_VARIABLE_CATEGORIES;
}

/** Flat lookup of every scalar variable + collection field, keyed by full dot-path, for sample-data resolution. */
export function flatSampleValues(type: TemplateType): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const category of variableCategoriesForType(type)) {
    for (const v of category.variables) out[v.key] = v.sample;
    for (const c of category.collections ?? []) {
      for (const f of c.fields) out[`${c.itemScope}.${f.key}`] = f.sample;
    }
  }
  return out;
}

/** Sample row data for a collection variable, e.g. rows for `{{#measurements}}...{{/measurements}}`. */
export function collectionSampleRows(type: TemplateType, collectionKey: string): Record<string, string | number>[] {
  for (const category of variableCategoriesForType(type)) {
    const c = category.collections?.find((c) => c.key === collectionKey);
    if (!c) continue;
    return Array.from({ length: c.rowCount }, (_, i) => {
      const row: Record<string, string | number> = {};
      for (const f of c.fields) {
        row[f.key] = f.key === "index" ? i + 1 : f.sample;
      }
      return row;
    });
  }
  return [];
}

export function findCollectionDef(type: TemplateType, collectionKey: string): TemplateCollectionVariableDef | null {
  for (const category of variableCategoriesForType(type)) {
    const c = category.collections?.find((c) => c.key === collectionKey);
    if (c) return c;
  }
  return null;
}

/** All collection keys available for a template type (used to flag repeat-capable blocks). */
export function collectionKeysForType(type: TemplateType): string[] {
  return variableCategoriesForType(type).flatMap((c) => (c.collections ?? []).map((cc) => cc.key));
}
