"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetProfile, SensorChannelFull } from "@/types/asset";
import type {
  AnalyzeFrequencyResponseResponse, AnalyzeRequest, AnalyzeResponse, CalibrationCreateBody, CalibrationLabCandidate, CalibrationMethod,
  CalibrationPointInline, CalibrationPurpose, CalibrationRecord, CalibrationType, CalibrationUser,
  DataEntryMode, DecisionRule, DistributionType, FrequencyResponsePointInline, InputMethod, ModelType,
  PhaseChartPoint, ResidualPoint, SensitivityChartPoint, WizardRawPoint,
} from "@/types/calibration";
import {
  analyzeCalibration, analyzeFrequencyResponse, createCalibration, getAssetCalibrations,
  listAssets, listCalibrationUsers, listProcedures, uploadCalibrationCertificate,
} from "@/services/asset.service";
import {
  evaluateModel, extractFormulaParameters, validateFormulaTemplate,
  computeLinearityDeviation, computeLinearityDeviationAtPoints,
} from "@/lib/evaluate-model";
import { listCalibrationLabs } from "@/services/location.service";
import { listCalibrationLabCandidates } from "@/services/organization.service";
import { useTranslations } from "next-intl";
import { COLORS } from "@/lib/tokens";
import { translateDynamic } from "@/lib/translate-dynamic";
import { roundToSigFigs } from "@/lib/uncertainty-format";
import { getUnitsForQuantity, getOutputUnits, resolveSpecValue, getSpecUnitOptions, PERCENT_FS_UNIT, FREQUENCY_OUTPUT_UNITS, AMPLITUDE_TYPE_OPTIONS } from "@/lib/sensor-options";
import { convertMagnitude } from "@/lib/unit-conversion";
import { useAuth } from "@/lib/auth-context";
import { STAT_DOCS_LINKS, WIZARD_DOCS_LINKS } from "@/lib/docs-links";
import { StatRow } from "@/components/stat-row";
import { ModelPanel } from "@/components/calibration-model-panel";
import { ToggleSwitch } from "@/components/toggle-switch";
import { NumberInput } from "@/components/number-input";
import { Select } from "@/components/select";
import { DatePicker } from "@/components/date-picker";
import { Tooltip } from "@/components/tooltip";
import { ResidualsChart } from "@/components/residuals-chart";
import { SensitivityChart } from "@/components/sensitivity-chart";
import { PhaseChart } from "@/components/phase-chart";
import { LinearityDeviationChart } from "@/components/linearity-deviation-chart";
import {
  CheckIcon, ChevronDownIcon, InfoIcon, PlusIcon, RestoreIcon, TrashIcon,
  WarningIcon, XIcon,
} from "@/components/icons";

// ---------------------------------------------------------------------------
// Shared mini-field components (inlined to avoid page.tsx coupling)
// ---------------------------------------------------------------------------

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";
const IB_ERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

function FieldTooltip({ tooltip, docsHref }: { tooltip?: string; docsHref?: string }) {
  if (!tooltip) return null;
  return (
    <Tooltip content={tooltip} docsHref={docsHref}>
      <InfoIcon size={11} className="text-gray-400 cursor-help" />
    </Tooltip>
  );
}

// Content-sized by default (inline-flex), same as before — pass `className`
// with a `max-w-[...]` when the caller wants the label capped to a compact
// field's width; the text then truncates with an ellipsis instead of
// forcing the column wider (min-w-0 is what lets the truncate span actually
// shrink below the text's natural width once that cap is in effect). Always
// paired with a `title` (the full text, shown natively on hover once
// truncated) and, where the caller supplies one, the FieldTooltip info icon
// explaining the concept itself.
function WLabel({
  text, required, tooltip, docsHref, className,
}: { text: string; required?: boolean; tooltip?: string; docsHref?: string; className?: string }) {
  return (
    <span className={`text-xs text-gray-400 inline-flex min-w-0 items-center gap-1 ${className ?? ""}`}>
      <span className="truncate" title={text}>{text}</span>
      {required && <span className="text-red-400 shrink-0">*</span>}
      <span className="shrink-0"><FieldTooltip tooltip={tooltip} docsHref={docsHref} /></span>
    </span>
  );
}

function WInput({
  label, value, onChange, type = "text", placeholder, required, readOnly, error, tooltip, docsHref, numberWidth,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; readOnly?: boolean; error?: string;
  tooltip?: string; docsHref?: string;
  /** Width tier for `type="number"` fields only — see UI.md's Compact Numeric Inputs sizing table. */
  numberWidth?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <WLabel text={label} required={required} tooltip={tooltip} docsHref={docsHref} />
      {type === "number" ? (
        <NumberInput
          value={value}
          onChange={onChange}
          placeholder={placeholder}
          readOnly={readOnly}
          invalid={!!error}
          className={numberWidth}
        />
      ) : type === "date" ? (
        <DatePicker value={value} onChange={onChange} placeholder={placeholder} readOnly={readOnly} invalid={!!error} />
      ) : (
        <input
          type={type}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`${IB} ${error ? IB_ERR : IB_OK} ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
        />
      )}
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function WSelect({
  label, value, onChange, options, required, placeholder, tooltip, docsHref, width,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean; placeholder?: string; tooltip?: string; docsHref?: string;
  /** Width tier — see UI.md's Dropdown / Select Inputs sizing table. Defaults to full width. */
  width?: string;
}) {
  const t = useTranslations("assets.fields");
  return (
    <div className="flex flex-col gap-1">
      <WLabel text={label} required={required} tooltip={tooltip} docsHref={docsHref} />
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder ?? t("select")}
        className={width}
      />
    </div>
  );
}

function WCheckbox({
  label, checked, onChange, tooltip, docsHref,
}: { label: string; checked: boolean; onChange: (v: boolean) => void; tooltip?: string; docsHref?: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <label className="flex items-center gap-2 cursor-pointer">
        <ToggleSwitch checked={checked} onChange={onChange} />
        <span className="text-sm text-og-text">{label}</span>
      </label>
      <FieldTooltip tooltip={tooltip} docsHref={docsHref} />
    </span>
  );
}


// ---------------------------------------------------------------------------
// Step indicator
// ---------------------------------------------------------------------------

function StepIndicator({ step, steps }: { step: number; steps: string[] }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const active = n === step;
        return (
          <div key={n} className="flex items-center">
            <div className="flex items-center gap-2">
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold shrink-0
                ${done ? "bg-og-accent text-white" : active ? "bg-og-action text-white" : "bg-og-surface-alt text-gray-400 border border-og-border-md"}`}>
                {done ? <CheckIcon size={12} /> : n}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${active ? "text-og-text" : done ? "text-og-accent" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px mx-2 ${done ? "bg-og-accent" : "bg-og-border-md"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtN(n: number | null | undefined, dec = 6): string {
  if (n == null) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 0.0001 || abs >= 100000)) return n.toExponential(4);
  return parseFloat(n.toFixed(dec)).toString();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

// Derives the wire-level DataEntryMode from Step 2's own InputMethod choice
// (a dropdown, always set) plus Step 1's calibration_purpose — As-Found/
// As-Left isn't a separately selectable method, it's an automatic
// consequence of purpose="after_repair" applied to either
// "reference_vs_measured" or "reference_vs_indicated".
function deriveDataEntryMode(inputMethod: InputMethod, purpose: CalibrationPurpose): DataEntryMode {
  if (inputMethod === "model_direct") return "model_direct";
  if (inputMethod === "frequency_response") return "frequency_response";
  const isAfterRepair = purpose === "after_repair";
  if (inputMethod === "reference_vs_measured") return isAfterRepair ? "reference_vs_as_found_as_left" : "raw_data";
  return isAfterRepair ? "reference_vs_as_found_as_left" : "reference_vs_indicated";
}

// The channel's own nominal accuracy, resolved to a single flat magnitude
// (in the channel's own unit terms) and converted to referenceUnit — the
// default the Conformity assessment panel's Tolerance box "refresh" icon
// restores. Null when the channel has no accuracy spec, "percent_of_reading"
// (no single flat value — see _apply_decision_rule's own reasoning), or the
// conversion to referenceUnit isn't defined (see unit-conversion.ts).
function channelToleranceDefault(
  channel: { accuracy_value: number | null; accuracy_type: string | null; accuracy_unit: string | null; unit: string; physical_quantity: string; measurement_min: number | null; measurement_max: number | null } | undefined,
  referenceUnit: string,
): number | null {
  if (!channel || channel.accuracy_value == null) return null;
  let absolute: number | null = null;
  let baseUnit: string = channel.accuracy_unit ?? channel.unit;
  if (channel.accuracy_type === "absolute") {
    absolute = channel.accuracy_value;
  } else if (channel.accuracy_type === "percent_of_full_scale") {
    if (channel.measurement_min == null || channel.measurement_max == null) return null;
    absolute = (channel.accuracy_value / 100) * (channel.measurement_max - channel.measurement_min);
    baseUnit = channel.unit;
  } else {
    return null; // percent_of_reading — no single flat value
  }
  return convertMagnitude(absolute, baseUnit, referenceUnit, channel.physical_quantity);
}

// The channel's own datasheet measurement uncertainty, resolved to a single
// flat magnitude in its own configured unit (or the channel's base unit if
// it was expressed as %FS) — the default the Uncertainty calculation
// panel's Sensor nominal accuracy box "refresh" icon restores. Null when the
// channel has no measurement uncertainty configured, or a %FS value with no
// measurement range to resolve it against.
function sensorNominalAccuracyDefault(
  channel: { measurement_uncertainty: number | null; uncertainty_unit: string | null; unit: string; measurement_min: number | null; measurement_max: number | null } | undefined,
): { value: number; unit: string } | null {
  if (!channel) return null;
  const value = resolveSpecValue(
    channel.measurement_uncertainty ?? null, channel.uncertainty_unit ?? null,
    channel.measurement_min ?? null, channel.measurement_max ?? null,
  );
  if (value == null) return null;
  const unit = channel.uncertainty_unit && channel.uncertainty_unit !== PERCENT_FS_UNIT
    ? channel.uncertainty_unit
    : channel.unit;
  return { value, unit };
}

// Converts an uncertainty magnitude between any two units a box's unit
// dropdown offers — including %FS, which convertMagnitude doesn't know
// about (it's range-relative, not a fixed physical unit), resolved against
// the channel's own measurement range via the same logic getSpecUnitOptions/
// resolveSpecValue already use for the channel's own spec fields. Used both
// for the dropdown's onChange (so switching units keeps the same underlying
// magnitude) and for resolving a box's final value into referenceUnit
// before sending it to /analyze.
function convertUncertaintyBoxValue(
  value: number,
  fromUnit: string,
  toUnit: string,
  physicalQuantity: string,
  channelUnit: string,
  measurementMin: number | null,
  measurementMax: number | null,
): number | null {
  if (fromUnit === toUnit) return value;
  const absolute = fromUnit === PERCENT_FS_UNIT
    ? resolveSpecValue(value, PERCENT_FS_UNIT, measurementMin, measurementMax)
    : convertMagnitude(value, fromUnit, channelUnit, physicalQuantity);
  if (absolute == null) return null;
  if (toUnit === PERCENT_FS_UNIT) {
    if (measurementMin == null || measurementMax == null || measurementMax === measurementMin) return null;
    return (absolute / (measurementMax - measurementMin)) * 100;
  }
  return convertMagnitude(absolute, channelUnit, toUnit, physicalQuantity);
}

// Resolves a manually-entered uncertainty box's raw string + selected unit
// down to a single number in referenceUnit — shared by Sensor nominal
// accuracy and Reference standard uncertainty's manual-entry sub-case,
// since both boxes follow the same "value + unit dropdown" pattern.
function resolveManualUncertaintyValue(
  valueStr: string,
  unit: string,
  physicalQuantity: string,
  measurementMin: number | null,
  measurementMax: number | null,
  channelUnit: string,
  referenceUnit: string,
): number | null {
  const raw = parseFloat(valueStr);
  if (valueStr.trim() === "" || isNaN(raw)) return null;
  return convertUncertaintyBoxValue(raw, unit, referenceUnit, physicalQuantity, channelUnit, measurementMin, measurementMax);
}

// The full set of Uncertainty calculation / Conformity assessment panel
// inputs, bundled together — the single-dataset case uses one directly, and
// As-Found/As-Left shares one instance across both sides too (same channel/
// spec either side of the repair; only the resulting Error/Uncertainty
// numbers differ per side, computed from each side's own AnalyzeResponse).
interface UncertaintyConformityState {
  includeSensorNominalUncertainty: boolean;
  sensorNominalUncertaintyManual: string;
  sensorNominalUncertaintyUnit: string;
  decisionRule: DecisionRule;
  toleranceOverrideValue: string;
  includeReferenceStandardManual: boolean;
  referenceStandardManualUncertainty: string;
  referenceStandardManualUnit: string;
  referenceStandardManualCoverageFactor: string;
}

// Same defaults the single-dataset case's own channel-change effect applies
// — pre-fill Sensor nominal accuracy from the channel's datasheet spec and
// Tolerance from its accuracy spec, both switches off, Ref. standard unit
// reset to referenceUnit.
function defaultUncertaintyConformityState(
  channel: Parameters<typeof sensorNominalAccuracyDefault>[0] & Parameters<typeof channelToleranceDefault>[0],
  referenceUnit: string,
): UncertaintyConformityState {
  const sensorDefault = sensorNominalAccuracyDefault(channel);
  const toleranceDefault = channelToleranceDefault(channel, referenceUnit);
  return {
    includeSensorNominalUncertainty: false,
    sensorNominalUncertaintyManual: sensorDefault != null ? String(sensorDefault.value) : "",
    sensorNominalUncertaintyUnit: sensorDefault?.unit ?? (channel?.unit ?? ""),
    decisionRule: "simple_acceptance",
    toleranceOverrideValue: toleranceDefault != null ? String(toleranceDefault) : "",
    includeReferenceStandardManual: false,
    referenceStandardManualUncertainty: "",
    referenceStandardManualUnit: referenceUnit,
    referenceStandardManualCoverageFactor: "2",
  };
}

// Reduces an UncertaintyConformityState bundle down to the actual numbers
// /analyze needs (referenceUnit-scale) — the same derivation the
// single-dataset case applies to its own state, generalized so the
// As-Found/As-Left case's shared bundle can reuse it too.
function deriveUncertaintyBudgetInputs(
  bundle: UncertaintyConformityState,
  selectedChannel: SensorChannelFull | undefined,
  referenceUnit: string,
  referenceStandardAuto: { expandedUncertainty: number; coverageFactor: number } | null,
): { sensorNominalUncertaintyNum: number | null; referenceStandardUncertainty: number | null; referenceStandardCoverageFactor: number } {
  const sensorNominalUncertaintyNum = bundle.includeSensorNominalUncertainty
    ? resolveManualUncertaintyValue(
        bundle.sensorNominalUncertaintyManual, bundle.sensorNominalUncertaintyUnit,
        selectedChannel?.physical_quantity ?? "",
        selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
        selectedChannel?.unit ?? "", referenceUnit,
      )
    : null;
  const referenceStandardManualUncertaintyNum = resolveManualUncertaintyValue(
    bundle.referenceStandardManualUncertainty, bundle.referenceStandardManualUnit,
    selectedChannel?.physical_quantity ?? "",
    selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
    selectedChannel?.unit ?? "", referenceUnit,
  );
  const referenceStandardUncertainty = bundle.includeReferenceStandardManual
    ? (referenceStandardAuto ? referenceStandardAuto.expandedUncertainty : referenceStandardManualUncertaintyNum)
    : null;
  const referenceStandardCoverageFactor = referenceStandardAuto
    ? referenceStandardAuto.coverageFactor
    : (parseFloat(bundle.referenceStandardManualCoverageFactor) || 2.0);
  return { sensorNominalUncertaintyNum, referenceStandardUncertainty, referenceStandardCoverageFactor };
}

const SUPERS: Record<number, string> = { 2: "²", 3: "³", 4: "⁴", 5: "⁵" };

// Label for a polynomial coefficient's power of x, e.g. "× x²", "× x", "Constant".
function coeffPowerLabel(power: number, t: ReturnType<typeof useTranslations>): string {
  if (power === 0) return t("constant");
  if (power === 1) return "× x";
  return `× x${SUPERS[power] ?? `^${power}`}`;
}

// Format polynomial as human-readable equation string — ascending order: a₀ + a₁·x + a₂·x² + …
function formatEquation(coefficients: number[], degree: number): string {
  const parts: string[] = [];
  // coefficients[0] = highest degree, coefficients[degree] = constant (np.polyfit convention)
  for (let exp = 0; exp <= degree; exp++) {
    const c = coefficients[degree - exp];
    if (Math.abs(c) < 1e-15) continue;
    const sign = c < 0 ? (parts.length === 0 ? "−" : " − ") : (parts.length === 0 ? "" : " + ");
    const absStr = fmtN(Math.abs(c), 4);
    if (exp === 0) parts.push(sign + absStr);
    else if (exp === 1) parts.push(sign + absStr + "·x");
    else parts.push(sign + absStr + "·x" + (SUPERS[exp] ?? `^${exp}`));
  }
  return "f(x) = " + (parts.join("") || "0");
}


// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Step1State {
  sensor_id: string;
  calibration_date: string;
  calibration_type: CalibrationType;
  calibration_purpose: CalibrationPurpose;
  performed_by_name: string;
  performed_by_user_id: string | null;
  checked_by_user_id: string | null;
  checked_by_name: string | null;
  calibration_interval: string;
  external_lab_name: string;
  external_lab_certificate_number: string;
  calibration_organization_id: string;
  certificate_file: File | null;
  /** Step 2's own "Input data" method choice (a dropdown at the top of the
   * step, always set — defaults to "reference_vs_measured") — see
   * InputMethod's doc comment. Combined with calibration_purpose to derive
   * the actual wire-level DataEntryMode via deriveDataEntryMode(). */
  input_method: InputMethod;
  internal_procedure_id: string;
  internal_reference_asset_id: string;
  calibration_location_id: string;
  repair_date: string;
  repair_description: string;
  temperature_value: string;
  temperature_uncertainty: string;
  temperature_unit: string;
  pressure_value: string;
  pressure_uncertainty: string;
  pressure_unit: string;
  humidity_value: string;
  humidity_uncertainty: string;
  humidity_unit: string;
  notes: string;
  env_expanded: boolean;
}

interface AnalyzeParams {
  poly_degree: number | null;
  distribution_type: DistributionType;
  confidence_level: number;
}

// Manual model entry for data_entry_mode="model_direct" (a lab-supplied
// model, no raw data) — coefficients[0] = highest degree … coefficients[order]
// = constant term (same np.polyfit-style convention as AnalyzeResponse.
// coefficients). The Type B uncertainty budget (reference standard, sensor
// nominal accuracy, resolution, distribution/confidence, decision rule) is
// *not* duplicated here — model_direct reuses the exact same wizard-level
// state/controls Step3 already collects for raw_data (see the model_direct
// useEffect and Step3's controls row), since none of it is actually specific
// to how the model was entered.
interface ManualCoeffState {
  model_type: ModelType;
  // A custom-formula *template* with free parameters (e.g. "a*x + b") plus a
  // declared value per parameter — resolved server-side into a plain x-only
  // formula on analyze/save (see the model_direct useEffect). Never store
  // the resolved string here; it always comes back from the API.
  custom_formula_template: string;
  custom_formula_params: Record<string, string>;
  poly_order: number;
  coefficients: string[];
  range_min: string;
  range_max: string;
}

// data_entry_mode="frequency_response": one sweep row per frequency point.
// offset is only meaningful when FreqSweepSettings.offset_enabled is true —
// left blank otherwise (its phase_value ends up null, same as any other
// optional field on this wizard).
interface FreqRow {
  frequency: string;
  reference: string;
  measured: string;
  offset: string;
}

// Settings shared by every row in the sweep — frequency_unit/amplitude_type
// apply throughout; offset_unit only matters when offset_enabled.
interface FreqSweepSettings {
  frequency_unit: string;
  reference_unit: string;
  measured_unit: string;
  amplitude_type: string;
  offset_enabled: boolean;
  offset_unit: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CalibrationWizardProps {
  assetId: string;
  profile: AssetProfile;
  calibrations: CalibrationRecord[];
  onClose: () => void;
  onSaved: () => void;
}

export function CalibrationWizard({ assetId, profile, calibrations, onClose, onSaved }: CalibrationWizardProps) {
  const t = useTranslations("assets.wizard");
  const tDecisionRule = useTranslations("tokens.decisionRule");
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const initialSensorId = profile.sensor_channels[0]?.id ?? "";
  const [step1, setStep1] = useState<Step1State>({
    sensor_id: initialSensorId,
    calibration_date: todayIso(),
    calibration_type: "internal_lab",
    // Smart default: this is the channel's first calibration if none exist yet.
    calibration_purpose: calibrations.some((c) => c.sensor_id === initialSensorId) ? "routine" : "initial",
    performed_by_name: user.name,
    performed_by_user_id: user.id,
    checked_by_user_id: null,
    checked_by_name: null,
    calibration_interval: "12",
    external_lab_name: "",
    external_lab_certificate_number: "",
    calibration_organization_id: "",
    certificate_file: null,
    input_method: "reference_vs_measured",
    internal_procedure_id: "",
    internal_reference_asset_id: "",
    calibration_location_id: "",
    repair_date: "",
    repair_description: "",
    temperature_value: "",
    temperature_uncertainty: "",
    temperature_unit: "°C",
    pressure_value: "",
    pressure_uncertainty: "",
    pressure_unit: "hPa",
    humidity_value: "",
    humidity_uncertainty: "",
    humidity_unit: "%RH",
    notes: "",
    env_expanded: false,
  });

  // The wire-level DataEntryMode, derived from Step 2's own method choice
  // (input_method) plus Step 1's calibration_purpose — see
  // deriveDataEntryMode's own doc comment. null until a method is chosen.
  const dataEntryMode = deriveDataEntryMode(step1.input_method, step1.calibration_purpose);
  const isModelDirect = dataEntryMode === "model_direct";
  const isRawData = dataEntryMode === "raw_data";
  const isRefVsIndicated = dataEntryMode === "reference_vs_indicated";
  const isRefVsAsFoundAsLeft = dataEntryMode === "reference_vs_as_found_as_left";
  const isFrequencyResponse = dataEntryMode === "frequency_response";
  // True for the Reference-vs-Indicated-based As-Found/As-Left variant
  // (skip_fit both sides, no transference function) — false for the
  // Reference-vs-Measured-based variant (curve-fit both sides).
  const isAfalSkipFit = isRefVsAsFoundAsLeft && step1.input_method === "reference_vs_indicated";

  // data_entry_mode="raw_data"'s Step 3 "Calibration method" — how the
  // entered points become a model. Named curveFitMethod (not
  // "calibrationMethod") to avoid confusion with the unrelated
  // calibrationMethods state below (internal-lab procedures).
  const [curveFitMethod, setCurveFitMethod] = useState<CalibrationMethod>("polynomial_fit");
  const [rawCustomFormulaTemplate, setRawCustomFormulaTemplate] = useState<string>("");
  const [rawCustomFormulaError, setRawCustomFormulaError] = useState<string | null>(null);
  const isRawCustomFormula = isRawData && curveFitMethod === "custom_formula";

  // Reference assets, calibration methods, and calibration labs (loaded once)
  const [referenceAssets, setReferenceAssets] = useState<{ id: string; name: string; asset_id: string }[]>([]);
  const [calibrationMethods, setCalibrationMethods] = useState<{ id: string; name: string }[]>([]);
  const [calibrationLabs, setCalibrationLabs] = useState<{ id: string; name: string }[]>([]);

  // External organization candidates for the Calibration Lab picker — refetched
  // whenever calibration_type switches between provider/customer, since they're
  // two different org_type filters on the same minimal endpoint.
  const [labCandidates, setLabCandidates] = useState<CalibrationLabCandidate[]>([]);
  useEffect(() => {
    if (step1.calibration_type === "external_accredited_lab") {
      listCalibrationLabCandidates("provider").then(setLabCandidates).catch(() => setLabCandidates([]));
    } else if (step1.calibration_type === "customer_asset") {
      listCalibrationLabCandidates("customer").then(setLabCandidates).catch(() => setLabCandidates([]));
    } else {
      setLabCandidates([]);
    }
  }, [step1.calibration_type]);

  // Candidates for the Registered By / Checked By dropdowns (loaded once)
  const [calibrationUsers, setCalibrationUsers] = useState<CalibrationUser[]>([]);
  useEffect(() => {
    listCalibrationUsers(assetId).then(setCalibrationUsers).catch(() => {});
  }, [assetId]);

  // Step 2: raw data
  const [inputMode, setInputMode] = useState<"manual" | "csv">("manual");
  const [rawPoints, setRawPoints] = useState<WizardRawPoint[]>([
    { reference: "", measured: "" },
    { reference: "", measured: "" },
  ]);
  const [referenceUnit, setReferenceUnit] = useState<string>(() => {
    const ch = profile.sensor_channels[0];
    return ch?.unit ?? "";
  });
  const [measuredUnit, setMeasuredUnit] = useState<string>(() => {
    const ch = profile.sensor_channels[0];
    return ch?.output_signal_unit ?? ch?.unit ?? "";
  });
  const [csvError, setCsvError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 alternative: model entered directly (data_entry_mode="model_direct")
  const [manualCoeff, setManualCoeff] = useState<ManualCoeffState>({
    model_type: "polynomial",
    custom_formula_template: "",
    custom_formula_params: {},
    poly_order: 1,
    coefficients: ["", ""],
    range_min: "",
    range_max: "",
  });
  const [customFormulaError, setCustomFormulaError] = useState<string | null>(null);

  // data_entry_mode="reference_vs_indicated" reuses rawPoints/analysisResult
  // below (below) — it's the exact same live /analyze pipeline as raw_data,
  // just called with skip_fit=true (no curve, direct reference/indicated
  // residuals); Step3 decides what to render based on data_entry_mode.

  // data_entry_mode="reference_vs_as_found_as_left": two independent point
  // sets, each analyzed with skip_fit=true. As-left is this calibration's
  // primary/official result; as-found is diagnostic-only (as_found_summary).
  const [asFoundPoints, setAsFoundPoints] = useState<WizardRawPoint[]>([
    { reference: "", measured: "" },
    { reference: "", measured: "" },
  ]);
  const [asLeftPoints, setAsLeftPoints] = useState<WizardRawPoint[]>([
    { reference: "", measured: "" },
    { reference: "", measured: "" },
  ]);
  const [asFoundResult, setAsFoundResult] = useState<AnalyzeResponse | null>(null);
  const [asLeftResult, setAsLeftResult] = useState<AnalyzeResponse | null>(null);
  const [asFoundAsLeftAnalyzing, setAsFoundAsLeftAnalyzing] = useState(false);
  const [asFoundAsLeftError, setAsFoundAsLeftError] = useState<string | null>(null);
  const [asFoundInputMode, setAsFoundInputMode] = useState<"manual" | "csv">("manual");
  const [asFoundCsvError, setAsFoundCsvError] = useState<string | null>(null);
  const asFoundFileInputRef = useRef<HTMLInputElement>(null);
  const [asLeftInputMode, setAsLeftInputMode] = useState<"manual" | "csv">("manual");
  const [asLeftCsvError, setAsLeftCsvError] = useState<string | null>(null);
  const asLeftFileInputRef = useRef<HTMLInputElement>(null);

  // Step 2 alternative: data_entry_mode="frequency_response" — a sweep of
  // (frequency, reference, measured[, offset]) points. freqBaselineIndex
  // selects which row (by its position in freqRows) the sensitivity/deviation
  // shown on every point — and the saved gain — are computed against; it's
  // edited on Step 3 (the dropdown is sourced from Step 2's own frequencies)
  // but lives here since it's part of the same sweep as freqRows/freqSettings.
  const [freqRows, setFreqRows] = useState<FreqRow[]>([
    { frequency: "", reference: "", measured: "", offset: "" },
    { frequency: "", reference: "", measured: "", offset: "" },
  ]);
  const [freqSettings, setFreqSettings] = useState<FreqSweepSettings>(() => {
    const ch = profile.sensor_channels[0];
    return {
      frequency_unit: "Hz",
      reference_unit: ch?.unit ?? "",
      measured_unit: ch?.output_signal_unit ?? ch?.unit ?? "",
      amplitude_type: "dB",
      offset_enabled: false,
      offset_unit: "°",
    };
  });
  const [freqBaselineIndex, setFreqBaselineIndex] = useState<number>(0);
  const [freqInputMode, setFreqInputMode] = useState<"manual" | "csv">("manual");
  const [freqCsvError, setFreqCsvError] = useState<string | null>(null);
  const freqFileInputRef = useRef<HTMLInputElement>(null);
  const [freqAnalysisResult, setFreqAnalysisResult] = useState<AnalyzeFrequencyResponseResponse | null>(null);
  const [freqAnalyzing, setFreqAnalyzing] = useState(false);
  const [freqAnalyzeError, setFreqAnalyzeError] = useState<string | null>(null);

  // Step 3: analysis
  const [analyzeParams, setAnalyzeParams] = useState<AnalyzeParams>({
    poly_degree: null,
    distribution_type: "normal",
    confidence_level: 95.0,
  });
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);
  // Opt-in: fold the sensor's nominal manufacturer accuracy spec into the
  // uncertainty budget as a Type B contribution (off by default — it risks
  // double-counting against the Type A fit-residual term, GUM §4). The value
  // pre-fills from the channel's manufacturer spec but is editable per
  // calibration — the uncertainty actually used belongs to this calibration
  // event, not silently to the channel.
  const [includeSensorNominalUncertainty, setIncludeSensorNominalUncertainty] = useState(false);
  const [sensorNominalUncertaintyManual, setSensorNominalUncertaintyManual] = useState<string>("");
  // Unit the box above is currently expressed in — defaults to the channel's
  // own physical-quantity unit, switchable to any unit convertMagnitude
  // considers interchangeable with it (see unit-conversion.ts), or %FS.
  const [sensorNominalUncertaintyUnit, setSensorNominalUncertaintyUnit] = useState<string>("");
  // ISO/IEC 17025 §7.1.3/§7.8.6 decision rule — how measurement uncertainty is
  // factored into the pass/fail conformity statement. This is the value that
  // gets stored and printed on the certificate (unlike the ad-hoc tolerance
  // preview below, which is just for exploring "what if" thresholds).
  const [decisionRule, setDecisionRule] = useState<DecisionRule>("simple_acceptance");
  // The Conformity assessment panel's editable Tolerance box — independent
  // of the channel's own accuracy spec; overrides it entirely when set. The
  // refresh icon next to it resets it back to the channel's nominal
  // accuracy (converted to reference units), see toleranceOverrideDefault.
  // Always expressed in referenceUnit — same scale as Error/Uncertainty
  // above it, and the scale channelToleranceDefault's own default is
  // already computed in.
  const [toleranceOverrideValue, setToleranceOverrideValue] = useState<string>("");
  // Type B: uncertainty of the reference standard used for this calibration.
  // For an internal reference asset, auto-fetched from its own most recent
  // calibration; otherwise (external labs, or an internal asset with no prior
  // calibration on record) the technician can enter it manually from the
  // reference standard's own certificate. Opt-in (off by default) — matches
  // Sensor nominal accuracy's toggle-gated visibility/inclusion above.
  const [includeReferenceStandardManual, setIncludeReferenceStandardManual] = useState(false);
  const [referenceStandardAuto, setReferenceStandardAuto] = useState<{ expandedUncertainty: number; coverageFactor: number } | null>(null);
  const [referenceStandardAutoLoading, setReferenceStandardAutoLoading] = useState(false);
  const [referenceStandardManualUncertainty, setReferenceStandardManualUncertainty] = useState<string>("");
  const [referenceStandardManualUnit, setReferenceStandardManualUnit] = useState<string>("");
  const [referenceStandardManualCoverageFactor, setReferenceStandardManualCoverageFactor] = useState<string>("2");

  // data_entry_mode="reference_vs_as_found_as_left": Uncertainty calculation
  // and the conformity criteria (decision rule + tolerance override) are
  // shared across both sides — same channel/spec either side of the repair
  // — see UncertaintyConformityState. Only the resulting Error/Uncertainty
  // numbers (computed per side from each side's own AnalyzeResponse) and the
  // Statistics panel differ per side. referenceStandardAuto/AutoLoading above
  // stay shared too (same physical reference instrument either side).
  const [afalUncertainty, setAfalUncertainty] = useState<UncertaintyConformityState>(() => defaultUncertaintyConformityState(undefined, ""));
  // The As-Found/As-Left curve-fit method — shared across both sides (same
  // physical instrument before/after repair, fit with the same method/
  // degree for a meaningful comparison), only used when the base input
  // method is "reference_vs_measured" (isAfalSkipFit === false).
  const [afalCurveFitMethod, setAfalCurveFitMethod] = useState<CalibrationMethod>("polynomial_fit");
  const [afalCustomFormulaTemplate, setAfalCustomFormulaTemplate] = useState<string>("");
  const [afalCustomFormulaError, setAfalCustomFormulaError] = useState<string | null>(null);

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  const selectedChannel = profile.sensor_channels.find((c) => c.id === step1.sensor_id)
    ?? profile.sensor_channels[0];

  // The real, server-computed, decision-rule-aware conformity result (as
  // opposed to an ad-hoc client-side preview) — null when nothing has been
  // analyzed yet, or when the channel has no accuracy spec to check against.
  // reference_vs_as_found_as_left has no `analysisResult` at all (it's
  // driven by asFoundResult/asLeftResult instead) — as-left is this
  // record's primary/official result, so its conformity is the one shown.
  const conformityStatement = isRefVsAsFoundAsLeft
    ? (asLeftResult?.conformity_statement ?? null)
    : (analysisResult?.conformity_statement ?? null);
  const hasConformityCheck = conformityStatement?.specification != null;

  const validPoints = rawPoints.filter(
    (p) => p.reference.trim() !== "" && p.measured.trim() !== "" &&
      !isNaN(parseFloat(p.reference)) && !isNaN(parseFloat(p.measured))
  );

  function isNumOrEmpty(v: string): boolean {
    return v.trim() === "" || !isNaN(parseFloat(v.trim()));
  }

  const step1Valid =
    step1.performed_by_user_id !== null &&
    step1.sensor_id !== "" &&
    step1.calibration_interval.trim() !== "" &&
    !isNaN(parseInt(step1.calibration_interval)) &&
    (step1.calibration_purpose !== "after_repair" || step1.repair_date.trim() !== "") &&
    isNumOrEmpty(step1.temperature_value) &&
    isNumOrEmpty(step1.pressure_value) &&
    isNumOrEmpty(step1.humidity_value);

  function formulaParamsValid(template: string, params: Record<string, string>): boolean {
    if (template.trim() === "") return false;
    try {
      const names = extractFormulaParameters(template);
      return names.every((p) => {
        const v = params[p];
        return v !== undefined && v.trim() !== "" && !isNaN(parseFloat(v));
      });
    } catch {
      return false;
    }
  }

  const manualCoeffValid =
    (manualCoeff.model_type === "polynomial"
      ? manualCoeff.coefficients.every((c) => c.trim() !== "" && !isNaN(parseFloat(c)))
      : customFormulaError === null &&
        formulaParamsValid(manualCoeff.custom_formula_template, manualCoeff.custom_formula_params)) &&
    manualCoeff.range_min.trim() !== "" && !isNaN(parseFloat(manualCoeff.range_min)) &&
    manualCoeff.range_max.trim() !== "" && !isNaN(parseFloat(manualCoeff.range_max));

  const validRefPoints = (pts: WizardRawPoint[]) => pts.filter(
    (p) => p.reference.trim() !== "" && p.measured.trim() !== "" &&
      !isNaN(parseFloat(p.reference)) && !isNaN(parseFloat(p.measured))
  );
  const validAsFoundPoints = validRefPoints(asFoundPoints);
  const validAsLeftPoints = validRefPoints(asLeftPoints);

  const validFreqRows = freqRows.filter(
    (r) => r.frequency.trim() !== "" && r.reference.trim() !== "" && r.measured.trim() !== "" &&
      !isNaN(parseFloat(r.frequency)) && !isNaN(parseFloat(r.reference)) && !isNaN(parseFloat(r.measured))
  );
  // sweep_index = the row's position in freqRows (matches freqBaselineIndex
  // and what handleSave sends) — assigned before filtering out blank/invalid
  // rows so it stays stable as the user edits other rows.
  function freqAnalyzePoints() {
    return freqRows
      .map((r, sweep_index) => ({ r, sweep_index }))
      .filter(({ r }) =>
        r.frequency.trim() !== "" && r.reference.trim() !== "" && r.measured.trim() !== "" &&
        !isNaN(parseFloat(r.frequency)) && !isNaN(parseFloat(r.reference)) && !isNaN(parseFloat(r.measured))
      )
      .map(({ r, sweep_index }) => ({
        sweep_index,
        frequency_value: parseFloat(r.frequency),
        reference_value: parseFloat(r.reference),
        measured_value: parseFloat(r.measured),
      }));
  }

  const step2Valid =
    isModelDirect ? manualCoeffValid
    : isRefVsIndicated ? validPoints.length >= 2
    : isRefVsAsFoundAsLeft ? (validAsFoundPoints.length >= 2 && validAsLeftPoints.length >= 2)
    : isFrequencyResponse ? validFreqRows.length >= 2
    : validPoints.length >= 2;

  // Whether the final step's analysis has produced a result that's actually
  // ready to save — mirrors handleSave's own guard so the Confirm & Save
  // button's disabled state never drifts out of sync with it.
  const canSave =
    isModelDirect
      ? manualCoeffValid && (
          // A custom formula's stored value always comes from the server
          // (resolved template + params) — wait for that round-trip so
          // Save can never write a stale/empty custom_formula.
          manualCoeff.model_type !== "custom_formula"
            || (analysisResult?.resolved_custom_formula != null && !analyzing)
        )
    : isRefVsAsFoundAsLeft
      ? (asFoundResult != null && asLeftResult != null && !asFoundAsLeftAnalyzing && (
          // Curve-fit As-Found/As-Left's Custom Formula method — same
          // reasoning as raw_data's own guard above.
          isAfalSkipFit || afalCurveFitMethod !== "custom_formula" || asLeftResult.resolved_custom_formula != null
        ))
    : isRawCustomFormula
      // Same reasoning as model_direct above — the fitted formula's resolved
      // value always comes from the server.
      ? (analysisResult?.resolved_custom_formula != null && !analyzing)
    : isFrequencyResponse
      ? (freqAnalysisResult != null && !freqAnalyzing)
    : (analysisResult != null && !analyzing);

  const lastStep = 3;

  // Pre-fill the sensor nominal accuracy input from the channel's manufacturer
  // spec whenever the selected channel changes; still freely editable per
  // calibration afterwards (the value used belongs to this calibration event).
  useEffect(() => {
    const def = sensorNominalAccuracyDefault(selectedChannel);
    setSensorNominalUncertaintyManual(def != null ? String(def.value) : "");
    setSensorNominalUncertaintyUnit(def?.unit ?? (selectedChannel?.unit ?? ""));
    setIncludeSensorNominalUncertainty(false);
    setToleranceOverrideValue(
      (() => {
        const def = channelToleranceDefault(selectedChannel, referenceUnit);
        return def != null ? String(def) : "";
      })()
    );
    setReferenceStandardManualUnit(referenceUnit);
    setIncludeReferenceStandardManual(false);
    setAfalUncertainty(defaultUncertaintyConformityState(selectedChannel, referenceUnit));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel?.id]);

  // While Sensor nominal accuracy is included in the uncertainty budget, the
  // Conformity assessment panel's Tolerance box mirrors it — converted from
  // the sensor box's own unit into referenceUnit, since Tolerance (like
  // Error/Uncertainty next to it) is always expressed in referenceUnit — and
  // becomes read-only, since the sensor's own accuracy IS the pass/fail
  // threshold in that case. Switching it back off leaves Tolerance at
  // whatever it last mirrored, now freely editable again.
  useEffect(() => {
    if (!includeSensorNominalUncertainty) return;
    const converted = resolveManualUncertaintyValue(
      sensorNominalUncertaintyManual, sensorNominalUncertaintyUnit,
      selectedChannel?.physical_quantity ?? "",
      selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
      selectedChannel?.unit ?? "", referenceUnit,
    );
    if (converted != null) setToleranceOverrideValue(String(converted));
  }, [includeSensorNominalUncertainty, sensorNominalUncertaintyManual, sensorNominalUncertaintyUnit, selectedChannel, referenceUnit]);

  // Off (default): excluded entirely — no contribution, box hidden. On: the
  // box's value, converted from its selected unit (or %FS, resolved against
  // the channel's own measurement range) into referenceUnit, since that's
  // the scale every other budget term (fit residuals, reference standard,
  // resolution) is combined in.
  const sensorNominalUncertaintyNum = includeSensorNominalUncertainty
    ? resolveManualUncertaintyValue(
        sensorNominalUncertaintyManual, sensorNominalUncertaintyUnit,
        selectedChannel?.physical_quantity ?? "",
        selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
        selectedChannel?.unit ?? "", referenceUnit,
      )
    : null;

  // OEM calibrations snapshot the asset's manufacturer as the (read-only)
  // calibration lab — keep external_lab_name in sync whenever the type
  // switches to/from "oem", since it's the column this snapshot is stored in.
  useEffect(() => {
    if (step1.calibration_type === "oem") {
      setStep1((s) => ({ ...s, external_lab_name: profile.manufacturer }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step1.calibration_type]);

  // Load reference assets and calibration labs on mount
  useEffect(() => {
    listAssets({ limit: 200, is_active: true })
      .then((assets) =>
        setReferenceAssets(
          assets
            .filter((a) => a.channels.some((ch) => ch.calibration_role === "reference"))
            .map((a) => ({ id: a.id, name: a.name, asset_id: a.asset_id }))
        )
      )
      .catch(() => {});

    listCalibrationLabs()
      .then((labs) => setCalibrationLabs(labs.map((l) => ({ id: l.id, name: l.name }))))
      .catch(() => {});
  }, []);

  // Load calibration methods when channel physical quantity changes
  useEffect(() => {
    if (!selectedChannel?.physical_quantity) return;
    listProcedures(selectedChannel.physical_quantity)
      .then((methods) => setCalibrationMethods(methods.map((m) => ({ id: m.id, name: m.name }))))
      .catch(() => {});
  }, [selectedChannel?.physical_quantity]);

  // Auto-fetch the reference standard's own uncertainty from its most recent
  // calibration, so it can be folded into this calibration's Type B budget
  // (GUM Annex A.2.1(c): traceability requires each link's own uncertainty).
  useEffect(() => {
    const refId = step1.internal_reference_asset_id;
    if (step1.calibration_type !== "internal_lab" || !refId) {
      setReferenceStandardAuto(null);
      return;
    }
    let cancelled = false;
    setReferenceStandardAutoLoading(true);
    getAssetCalibrations(refId)
      .then((cals) => {
        if (cancelled) return;
        const latest = cals[0];
        if (latest?.expanded_uncertainty != null) {
          setReferenceStandardAuto({
            expandedUncertainty: latest.expanded_uncertainty,
            coverageFactor: latest.coverage_factor ?? 2.0,
          });
        } else {
          setReferenceStandardAuto(null);
        }
      })
      .catch(() => { if (!cancelled) setReferenceStandardAuto(null); })
      .finally(() => { if (!cancelled) setReferenceStandardAutoLoading(false); });
    return () => { cancelled = true; };
  }, [step1.internal_reference_asset_id, step1.calibration_type]);

  const referenceStandardManualUncertaintyNum = resolveManualUncertaintyValue(
    referenceStandardManualUncertainty, referenceStandardManualUnit,
    selectedChannel?.physical_quantity ?? "",
    selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
    selectedChannel?.unit ?? "", referenceUnit,
  );
  // Off (default): excluded entirely — no contribution, no box shown, even
  // when a reference asset would otherwise auto-fetch a value. On: the
  // auto-fetched certificate value when available, else the manual box.
  const referenceStandardUncertainty = includeReferenceStandardManual
    ? (referenceStandardAuto ? referenceStandardAuto.expandedUncertainty : referenceStandardManualUncertaintyNum)
    : null;
  const referenceStandardCoverageFactor = referenceStandardAuto
    ? referenceStandardAuto.coverageFactor
    : (parseFloat(referenceStandardManualCoverageFactor) || 2.0);
  // The Conformity assessment panel's editable Tolerance box, already in
  // referenceUnit — overrides channel_accuracy_value/type entirely when set.
  const toleranceOverrideNum = (() => {
    const v = parseFloat(toleranceOverrideValue);
    return toleranceOverrideValue.trim() !== "" && !isNaN(v) && v > 0 ? v : null;
  })();

  // As-Found/As-Left's shared bundle — same derivation as the single-dataset
  // case above, generalized via deriveUncertaintyBudgetInputs.
  const afalBudget = deriveUncertaintyBudgetInputs(afalUncertainty, selectedChannel, referenceUnit, referenceStandardAuto);
  const afalToleranceOverrideNum = (() => {
    const v = parseFloat(afalUncertainty.toleranceOverrideValue);
    return afalUncertainty.toleranceOverrideValue.trim() !== "" && !isNaN(v) && v > 0 ? v : null;
  })();

  // Mirrors the shared (single-dataset) case's own "Tolerance locks to
  // Sensor nominal accuracy" sync effect above.
  useEffect(() => {
    if (!afalUncertainty.includeSensorNominalUncertainty) return;
    const converted = resolveManualUncertaintyValue(
      afalUncertainty.sensorNominalUncertaintyManual, afalUncertainty.sensorNominalUncertaintyUnit,
      selectedChannel?.physical_quantity ?? "",
      selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
      selectedChannel?.unit ?? "", referenceUnit,
    );
    if (converted != null) setAfalUncertainty((s) => ({ ...s, toleranceOverrideValue: String(converted) }));
  }, [afalUncertainty.includeSensorNominalUncertainty, afalUncertainty.sensorNominalUncertaintyManual, afalUncertainty.sensorNominalUncertaintyUnit, selectedChannel, referenceUnit]);

  // ---------------------------------------------------------------------------
  // Analysis debounce (Step 3) — stable, no blinking
  // ---------------------------------------------------------------------------

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnalysisKeyRef = useRef<string>("");

  // Trigger analysis when entering step 3 or when inputs change — covers both
  // raw_data (fitted) and reference_vs_indicated (skip_fit, no curve) modes,
  // since both share the exact same live /analyze pipeline over rawPoints.
  useEffect(() => {
    if (step !== lastStep || !(isRawData || isRefVsIndicated)) return;
    // Custom Formula needs a parseable template before there's anything to fit.
    if (isRawCustomFormula && (rawCustomFormulaTemplate.trim() === "" || rawCustomFormulaError !== null)) return;

    const vp = rawPoints.filter(
      (p) =>
        p.reference.trim() !== "" &&
        p.measured.trim() !== "" &&
        !isNaN(parseFloat(p.reference)) &&
        !isNaN(parseFloat(p.measured))
    );
    if (vp.length < 2) return;

    const key = JSON.stringify({
      vp, referenceUnit, measuredUnit, analyzeParams, includeSensorNominalUncertainty, decisionRule,
      referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum, toleranceOverrideNum,
      skipFit: isRefVsIndicated,
      curveFitMethod: isRawData ? curveFitMethod : null,
      rawCustomFormulaTemplate: isRawCustomFormula ? rawCustomFormulaTemplate : null,
    });
    if (key === lastAnalysisKeyRef.current) return;
    lastAnalysisKeyRef.current = key;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const req: AnalyzeRequest = {
        points: vp.map((p) => ({
          reference: parseFloat(p.reference),
          measured: parseFloat(p.measured),
        })),
        reference_unit: referenceUnit,
        measured_unit: measuredUnit,
        physical_quantity: selectedChannel?.physical_quantity ?? "",
        poly_degree: analyzeParams.poly_degree,
        skip_fit: isRefVsIndicated,
        calibration_method: isRawData ? curveFitMethod : "polynomial_fit",
        ...(isRawCustomFormula ? { custom_formula_template: rawCustomFormulaTemplate } : {}),
        distribution_type: analyzeParams.distribution_type,
        confidence_level: analyzeParams.confidence_level,
        channel_accuracy_value: selectedChannel?.accuracy_value ?? null,
        channel_accuracy_type: selectedChannel?.accuracy_type ?? null,
        decision_rule: decisionRule,
        // Type B: instrument resolution is always folded in when known (no
        // double-counting risk — it's a distinct physical effect from fit scatter).
        // Converted from %FS to an absolute value if that's how it was entered.
        resolution: resolveSpecValue(
          selectedChannel?.resolution ?? null, selectedChannel?.resolution_unit ?? null,
          selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
        ),
        // Type B: sensor's nominal manufacturer accuracy spec, opt-in only.
        // Pre-filled from the channel's spec but editable per calibration —
        // see sensorNominalUncertaintyManual above.
        sensor_nominal_uncertainty: sensorNominalUncertaintyNum,
        // The channel no longer carries its own coverage factor (removed from
        // channel editing) — a nominal manufacturer spec's k is conventionally 2.
        sensor_nominal_coverage_factor: 2.0,
        include_sensor_nominal_uncertainty: includeSensorNominalUncertainty,
        // Type B: uncertainty of the reference standard used for this calibration
        // (auto-fetched from its own last calibration, or entered manually).
        reference_standard_uncertainty: referenceStandardUncertainty,
        reference_standard_coverage_factor: referenceStandardCoverageFactor,
        tolerance_override_value: toleranceOverrideNum,
      };
      setAnalyzing(true);
      setAnalyzeError(null);
      try {
        const result = await analyzeCalibration(req);
        setAnalysisResult(result);
      } catch (e: unknown) {
        setAnalyzeError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setAnalyzing(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [step, lastStep, rawPoints, referenceUnit, measuredUnit, analyzeParams, dataEntryMode, isRawData, isRefVsIndicated, isRawCustomFormula, curveFitMethod, rawCustomFormulaTemplate, rawCustomFormulaError, selectedChannel, includeSensorNominalUncertainty, decisionRule, referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum, toleranceOverrideNum]);

  // data_entry_mode="model_direct": there's no raw data, so "residuals" are
  // synthesized as exactly zero at both ends of the declared valid range
  // (measured == reference) and run through the same /analyze(skip_fit=true)
  // pipeline. This combines the *same* Type B budget inputs Step3 already
  // collects for raw_data (reference standard, sensor nominal accuracy,
  // resolution, distribution/confidence, decision rule — none of it is
  // actually specific to how the model was entered) via RSS, and applies the
  // decision rule against the channel's tolerance spec with the model
  // trusted as declared (max_error=0) — reusing the tested GUM math server-
  // side instead of re-deriving coverage factors/effective dof in JS.
  useEffect(() => {
    if (step !== lastStep || !isModelDirect || !manualCoeffValid) return;

    const rMin = parseFloat(manualCoeff.range_min);
    const rMax = parseFloat(manualCoeff.range_max);

    const key = JSON.stringify({
      mode: "model_direct", rMin, rMax, referenceUnit, analyzeParams,
      includeSensorNominalUncertainty, decisionRule,
      referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum, toleranceOverrideNum,
      accV: selectedChannel?.accuracy_value, accT: selectedChannel?.accuracy_type,
      formulaTemplate: manualCoeff.model_type === "custom_formula" ? manualCoeff.custom_formula_template : null,
      formulaParams: manualCoeff.model_type === "custom_formula" ? manualCoeff.custom_formula_params : null,
    });
    if (key === lastAnalysisKeyRef.current) return;
    lastAnalysisKeyRef.current = key;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const req: AnalyzeRequest = {
        points: [
          { reference: rMin, measured: rMin },
          { reference: rMax, measured: rMax },
        ],
        reference_unit: referenceUnit,
        measured_unit: referenceUnit,
        physical_quantity: selectedChannel?.physical_quantity ?? "",
        poly_degree: null,
        skip_fit: true,
        distribution_type: analyzeParams.distribution_type,
        confidence_level: analyzeParams.confidence_level,
        channel_accuracy_value: selectedChannel?.accuracy_value ?? null,
        channel_accuracy_type: selectedChannel?.accuracy_type ?? null,
        decision_rule: decisionRule,
        resolution: resolveSpecValue(
          selectedChannel?.resolution ?? null, selectedChannel?.resolution_unit ?? null,
          selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
        ),
        sensor_nominal_uncertainty: sensorNominalUncertaintyNum,
        sensor_nominal_coverage_factor: 2.0,
        include_sensor_nominal_uncertainty: includeSensorNominalUncertainty,
        reference_standard_uncertainty: referenceStandardUncertainty,
        reference_standard_coverage_factor: referenceStandardCoverageFactor,
        ...(manualCoeff.model_type === "custom_formula" ? {
          custom_formula_template: manualCoeff.custom_formula_template,
          custom_formula_params: Object.fromEntries(
            Object.entries(manualCoeff.custom_formula_params).map(([k, v]) => [k, parseFloat(v)])
          ),
        } : {}),
      };
      setAnalyzing(true);
      setAnalyzeError(null);
      try {
        const result = await analyzeCalibration(req);
        setAnalysisResult(result);
      } catch (e: unknown) {
        setAnalyzeError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setAnalyzing(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [step, lastStep, isModelDirect, manualCoeffValid, manualCoeff.range_min, manualCoeff.range_max, manualCoeff.model_type, manualCoeff.custom_formula_template, manualCoeff.custom_formula_params, referenceUnit, analyzeParams, selectedChannel, includeSensorNominalUncertainty, decisionRule, referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum, toleranceOverrideNum]);

  // data_entry_mode="reference_vs_as_found_as_left": two independent
  // /analyze calls — skip_fit when the base method is reference_vs_indicated
  // (no curve, direct reference/indicated residuals), or a real curve fit
  // (shared afalCurveFitMethod/degree/formula) when the base method is
  // reference_vs_measured. Both sides share the same Uncertainty/Conformity
  // settings (afalUncertainty) — same channel/spec either side of the
  // repair. As-left is this calibration's primary/official result (feeds
  // due-date/approval/Health tab); as-found is diagnostic-only, stored into
  // as_found_summary rather than the record's primary fields.
  useEffect(() => {
    if (step !== lastStep || !isRefVsAsFoundAsLeft) return;
    if (validAsFoundPoints.length < 2 || validAsLeftPoints.length < 2) return;
    const isAfalCustomFormula = !isAfalSkipFit && afalCurveFitMethod === "custom_formula";
    if (isAfalCustomFormula && (afalCustomFormulaTemplate.trim() === "" || afalCustomFormulaError !== null)) return;

    const key = JSON.stringify({
      mode: "as_found_as_left", validAsFoundPoints, validAsLeftPoints, referenceUnit, measuredUnit,
      analyzeParams, afalUncertainty, referenceStandardAuto,
      isAfalSkipFit, afalCurveFitMethod, afalCustomFormulaTemplate,
    });
    if (key === lastAnalysisKeyRef.current) return;
    lastAnalysisKeyRef.current = key;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      const buildReq = (pts: WizardRawPoint[]): AnalyzeRequest => ({
        points: pts.map((p) => ({ reference: parseFloat(p.reference), measured: parseFloat(p.measured) })),
        reference_unit: referenceUnit,
        measured_unit: measuredUnit,
        physical_quantity: selectedChannel?.physical_quantity ?? "",
        poly_degree: isAfalSkipFit ? null : analyzeParams.poly_degree,
        skip_fit: isAfalSkipFit,
        calibration_method: isAfalSkipFit ? undefined : afalCurveFitMethod,
        ...(isAfalCustomFormula ? { custom_formula_template: afalCustomFormulaTemplate } : {}),
        distribution_type: analyzeParams.distribution_type,
        confidence_level: analyzeParams.confidence_level,
        channel_accuracy_value: selectedChannel?.accuracy_value ?? null,
        channel_accuracy_type: selectedChannel?.accuracy_type ?? null,
        decision_rule: afalUncertainty.decisionRule,
        resolution: resolveSpecValue(
          selectedChannel?.resolution ?? null, selectedChannel?.resolution_unit ?? null,
          selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
        ),
        sensor_nominal_uncertainty: afalBudget.sensorNominalUncertaintyNum,
        sensor_nominal_coverage_factor: 2.0,
        include_sensor_nominal_uncertainty: afalUncertainty.includeSensorNominalUncertainty,
        reference_standard_uncertainty: afalBudget.referenceStandardUncertainty,
        reference_standard_coverage_factor: afalBudget.referenceStandardCoverageFactor,
        tolerance_override_value: afalToleranceOverrideNum,
      });

      setAsFoundAsLeftAnalyzing(true);
      setAsFoundAsLeftError(null);
      try {
        const [foundRes, leftRes] = await Promise.all([
          analyzeCalibration(buildReq(validAsFoundPoints)),
          analyzeCalibration(buildReq(validAsLeftPoints)),
        ]);
        setAsFoundResult(foundRes);
        setAsLeftResult(leftRes);
      } catch (e: unknown) {
        setAsFoundAsLeftError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setAsFoundAsLeftAnalyzing(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [step, lastStep, isRefVsAsFoundAsLeft, isAfalSkipFit, validAsFoundPoints, validAsLeftPoints, referenceUnit, measuredUnit, analyzeParams, selectedChannel, afalUncertainty, afalBudget, afalToleranceOverrideNum, afalCurveFitMethod, afalCustomFormulaTemplate, afalCustomFormulaError, referenceStandardAuto]);

  // data_entry_mode="frequency_response": live sensitivity preview — no
  // transference function to fit, just measured/reference ratios, so this is
  // a much lighter call than the other modes' /analyze but shares the same
  // debounce/dedupe-by-key mechanism (debounceRef/lastAnalysisKeyRef).
  useEffect(() => {
    if (step !== lastStep || !isFrequencyResponse) return;
    const points = freqAnalyzePoints();
    if (points.length < 2) return;
    if (!points.some((p) => p.sweep_index === freqBaselineIndex)) return;

    const key = JSON.stringify({ mode: "frequency_response", points, freqBaselineIndex });
    if (key === lastAnalysisKeyRef.current) return;
    lastAnalysisKeyRef.current = key;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setFreqAnalyzing(true);
      setFreqAnalyzeError(null);
      try {
        const result = await analyzeFrequencyResponse({ points, baseline_sweep_index: freqBaselineIndex });
        setFreqAnalysisResult(result);
      } catch (e: unknown) {
        setFreqAnalyzeError(e instanceof Error ? e.message : "Analysis failed");
      } finally {
        setFreqAnalyzing(false);
      }
    }, 400);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, lastStep, isFrequencyResponse, freqRows, freqBaselineIndex]);

  // Keep freqBaselineIndex pointed at a valid row (e.g. after the row it was
  // on is deleted, or on first entering enough valid rows to pick from).
  useEffect(() => {
    if (!isFrequencyResponse) return;
    const indices = freqAnalyzePoints().map((p) => p.sweep_index);
    if (indices.length > 0 && !indices.includes(freqBaselineIndex)) {
      setFreqBaselineIndex(indices[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFrequencyResponse, freqRows, freqBaselineIndex]);

  // ---------------------------------------------------------------------------
  // CSV parsing
  // ---------------------------------------------------------------------------

  function parseCSV(text: string) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setCsvError("CSV must have at least a header and one data row."); return; }

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const refIdx = header.findIndex((h) => h.includes("ref"));
    const measIdx = header.findIndex((h) => h.includes("meas") || h.includes("actual"));

    if (refIdx === -1 || measIdx === -1) {
      setCsvError("CSV must have columns named 'Reference' and 'Measured'.");
      return;
    }

    const points: WizardRawPoint[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const ref = cols[refIdx]?.trim() ?? "";
      const meas = cols[measIdx]?.trim() ?? "";
      if (ref === "" || meas === "") continue;
      if (isNaN(parseFloat(ref)) || isNaN(parseFloat(meas))) {
        setCsvError(`Row ${i + 1}: non-numeric value — skipped.`);
        continue;
      }
      points.push({ reference: ref, measured: meas });
    }

    if (points.length < 2) { setCsvError("Need at least 2 valid data rows."); return; }
    setCsvError(null);
    setRawPoints(points);
    setInputMode("manual"); // switch to manual to allow editing
  }

  function handleFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => parseCSV((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  // Shared by the as-found/as-left dual tables (data_entry_mode=
  // reference_vs_as_found_as_left) — same Reference/Measured CSV shape as
  // parseCSV above, generalized over which side's state to update.
  function parseRefMeasuredCSV(
    text: string,
    setPoints: (p: WizardRawPoint[]) => void,
    setError: (e: string | null) => void,
    setMode: (m: "manual" | "csv") => void,
  ) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setError(t("csvNeedHeaderAndRow")); return; }

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const refIdx = header.findIndex((h) => h.includes("ref"));
    const measIdx = header.findIndex((h) => h.includes("meas") || h.includes("actual"));
    if (refIdx === -1 || measIdx === -1) { setError(t("csvMissingRefMeasuredColumns")); return; }

    const points: WizardRawPoint[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const ref = cols[refIdx]?.trim() ?? "";
      const meas = cols[measIdx]?.trim() ?? "";
      if (ref === "" || meas === "") continue;
      if (isNaN(parseFloat(ref)) || isNaN(parseFloat(meas))) {
        setError(t("csvNonNumericRow", { row: i + 1 }));
        continue;
      }
      points.push({ reference: ref, measured: meas });
    }

    if (points.length < 2) { setError(t("csvNeedTwoValidRows")); return; }
    setError(null);
    setPoints(points);
    setMode("manual");
  }

  function handleAsFoundFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => parseRefMeasuredCSV((e.target?.result as string) ?? "", setAsFoundPoints, setAsFoundCsvError, setAsFoundInputMode);
    reader.readAsText(file);
  }

  function handleAsLeftFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => parseRefMeasuredCSV((e.target?.result as string) ?? "", setAsLeftPoints, setAsLeftCsvError, setAsLeftInputMode);
    reader.readAsText(file);
  }

  // data_entry_mode="frequency_response": Frequency/Reference/Measured
  // required, Offset optional (present only when freqSettings.offset_enabled
  // — a row missing it just gets a null phase_value, same as any other
  // optional field elsewhere in the wizard).
  function parseFreqCSV(text: string) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setFreqCsvError(t("csvNeedHeaderAndRow")); return; }

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const freqIdx = header.findIndex((h) => h.includes("freq"));
    const refIdx = header.findIndex((h) => h.includes("ref"));
    const measIdx = header.findIndex((h) => h.includes("meas") || h.includes("actual"));
    const offsetIdx = header.findIndex((h) => h.includes("offset") || h.includes("phase"));
    if (freqIdx === -1) { setFreqCsvError(t("csvMissingFrequencyColumn")); return; }
    if (refIdx === -1 || measIdx === -1) { setFreqCsvError(t("csvMissingRefMeasuredColumns")); return; }

    const rows: FreqRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const freq = cols[freqIdx]?.trim() ?? "";
      const ref = cols[refIdx]?.trim() ?? "";
      const meas = cols[measIdx]?.trim() ?? "";
      const offset = offsetIdx !== -1 ? (cols[offsetIdx]?.trim() ?? "") : "";
      if (freq === "" || ref === "" || meas === "") continue;
      if (isNaN(parseFloat(freq)) || isNaN(parseFloat(ref)) || isNaN(parseFloat(meas))) {
        setFreqCsvError(t("csvNonNumericRow", { row: i + 1 }));
        continue;
      }
      rows.push({ frequency: freq, reference: ref, measured: meas, offset });
    }

    if (rows.length < 2) { setFreqCsvError(t("csvNeedTwoValidRows")); return; }
    setFreqCsvError(null);
    setFreqRows(rows);
    setFreqInputMode("manual");
  }

  function handleFreqFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => parseFreqCSV((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!canSave) return;
    const mode = dataEntryMode;

    setSaving(true);
    setSaveError(null);

    try {
      const n = (v: string): number | null => {
        const f = parseFloat(v);
        return isNaN(f) || v.trim() === "" ? null : f;
      };

      const tempVal = n(step1.temperature_value);
      const pressVal = n(step1.pressure_value);
      const humVal = n(step1.humidity_value);
      const tempUncertaintyVal = n(step1.temperature_uncertainty);
      const pressUncertaintyVal = n(step1.pressure_uncertainty);
      const humUncertaintyVal = n(step1.humidity_uncertainty);

      // Convert to canonical units: °C, %RH, Pa
      const temperatureCelsius: number | null = (() => {
        if (tempVal == null) return null;
        const unit = step1.temperature_unit;
        if (unit === "°F") return Math.round(((tempVal - 32) * 5 / 9) * 100) / 100;
        if (unit === "K") return Math.round((tempVal - 273.15) * 100) / 100;
        return tempVal;
      })();
      // An uncertainty is a Δ magnitude, not an absolute reading — apply the same
      // scale as the value's conversion but never the additive offset (°F/K), or a
      // ±2°F uncertainty would silently become "−16.67°C" instead of "±1.11°C".
      const temperatureUncertaintyCelsius: number | null = (() => {
        if (tempUncertaintyVal == null) return null;
        const unit = step1.temperature_unit;
        if (unit === "°F") return Math.round((tempUncertaintyVal * 5 / 9) * 100) / 100;
        return Math.round(tempUncertaintyVal * 100) / 100; // K and °C share the same magnitude
      })();
      const convertPressureToPa = (v: number, unit: string): number => {
        if (unit === "hPa" || unit === "mbar") return Math.round(v * 100 * 100) / 100;
        if (unit === "kPa") return Math.round(v * 1000 * 100) / 100;
        if (unit === "bar") return Math.round(v * 100000 * 100) / 100;
        if (unit === "psi") return Math.round(v * 6894.757 * 100) / 100;
        return v;
      };
      const pressurePa: number | null = pressVal == null ? null : convertPressureToPa(pressVal, step1.pressure_unit);
      const pressureUncertaintyPa: number | null =
        pressUncertaintyVal == null ? null : convertPressureToPa(pressUncertaintyVal, step1.pressure_unit);

      let points: CalibrationPointInline[] = [];
      let asFoundPointsBody: CalibrationPointInline[] = [];
      let asFoundSummaryBody: AnalyzeResponse | null = null;
      let polyStats: Partial<CalibrationCreateBody> = {};
      let frequencyResponsePointsBody: FrequencyResponsePointInline[] = [];

      // Store point values and ranges in the display units used for
      // analysis, matching the exact shape run_analysis returned — for
      // reference_vs_indicated/reference_vs_as_found_as_left this is a
      // skip_fit result (poly_order/coefficients/non_linearity stay null,
      // there's no curve), for raw_data/model_direct it's a real fit.
      const pointsFromResult = (r: AnalyzeResponse): CalibrationPointInline[] =>
        r.points.map((p) => ({
          point_index: p.point_index,
          reference_value: p.reference_value,
          measured_value: p.measured_value,
          calculated_value: p.calculated_value ?? null,
          residual_abs: p.residual_abs,
          residual_pct: p.residual_pct,
          reference_unit: referenceUnit,
          measured_unit: measuredUnit,
        }));
      const statsFromResult = (r: AnalyzeResponse): Partial<CalibrationCreateBody> => ({
        poly_order: r.poly_degree,
        poly_coefficients: r.coefficients,
        range_min: r.valid_range_min,
        range_max: r.valid_range_max,
        r_squared: r.r_squared,
        rmse: r.rmse,
        standard_error: r.standard_error,
        max_error: r.max_error,
        full_scale_error: r.full_scale_error_pct,
        non_linearity: r.non_linearity_pct,
        repeatability: r.repeatability,
        hysteresis: r.hysteresis,
        distribution_type: r.distribution_type,
        confidence_level: r.confidence_level,
        coverage_factor: r.coverage_factor,
        combined_uncertainty: r.combined_uncertainty,
        expanded_uncertainty: r.expanded_uncertainty,
        valid_range_min: r.valid_range_min,
        valid_range_max: r.valid_range_max,
        uncertainty_budget: r.uncertainty_budget,
        effective_degrees_of_freedom: r.effective_degrees_of_freedom,
        poly_coefficients_covariance: r.poly_coefficients_covariance,
        decision_rule: r.conformity_statement.decision_rule,
        conformity_statement: r.conformity_statement,
      });

      if (mode === "model_direct") {
        // No raw data: the model (coefficients or formula) comes straight
        // from the certificate. Uncertainty/conformity are still real,
        // though — they come from the model_direct useEffect's synthetic
        // zero-residual /analyze(skip_fit=true) call over the same Type B
        // budget raw_data collects, so points/range there mirror manualCoeff.
        const rangeMin = n(manualCoeff.range_min);
        const rangeMax = n(manualCoeff.range_max);
        polyStats = {
          poly_order: manualCoeff.model_type === "polynomial" ? manualCoeff.poly_order : null,
          poly_coefficients: manualCoeff.model_type === "polynomial"
            ? manualCoeff.coefficients.map((c) => parseFloat(c)) : [],
          range_min: rangeMin,
          range_max: rangeMax,
          valid_range_min: rangeMin,
          valid_range_max: rangeMax,
          ...(analysisResult ? {
            distribution_type: analysisResult.distribution_type,
            confidence_level: analysisResult.confidence_level,
            coverage_factor: analysisResult.coverage_factor,
            combined_uncertainty: analysisResult.combined_uncertainty,
            expanded_uncertainty: analysisResult.expanded_uncertainty,
            uncertainty_budget: analysisResult.uncertainty_budget,
            effective_degrees_of_freedom: analysisResult.effective_degrees_of_freedom,
            decision_rule: analysisResult.conformity_statement.decision_rule,
            conformity_statement: analysisResult.conformity_statement,
          } : {}),
        };
        // No raw data points exist for this mode at all.
        points = [];
      } else if (mode === "reference_vs_as_found_as_left" && asLeftResult) {
        // As-left is this record's primary/official result; as-found is
        // diagnostic-only, stored separately (point_role="as_found" +
        // as_found_summary), never feeding due-date/approval/Health tab.
        polyStats = statsFromResult(asLeftResult);
        points = pointsFromResult(asLeftResult);
        if (asFoundResult) {
          asFoundPointsBody = pointsFromResult(asFoundResult).map((p) => ({ ...p, point_role: "as_found" }));
          asFoundSummaryBody = asFoundResult;
        }
      } else if (mode === "frequency_response") {
        // No raw_data-style points/polyStats here — poly_order=1/
        // poly_coefficients=[gain, 0]/range_min/range_max are all computed
        // server-side from frequency_response_points (see
        // repositories/calibration.py's create_atomic), same reasoning as
        // every other mode's server-computed result: never trust a
        // client-sent gain.
        frequencyResponsePointsBody = freqRows
          .map((r, sweep_index) => ({ r, sweep_index }))
          .filter(({ r }) =>
            r.frequency.trim() !== "" && r.reference.trim() !== "" && r.measured.trim() !== "" &&
            !isNaN(parseFloat(r.frequency)) && !isNaN(parseFloat(r.reference)) && !isNaN(parseFloat(r.measured))
          )
          .map(({ r, sweep_index }) => ({
            sweep_index,
            frequency_value: parseFloat(r.frequency),
            reference_value: parseFloat(r.reference),
            measured_value: parseFloat(r.measured),
            offset_value: freqSettings.offset_enabled && r.offset.trim() !== "" && !isNaN(parseFloat(r.offset))
              ? parseFloat(r.offset) : null,
            reference_unit: freqSettings.reference_unit,
            measured_unit: freqSettings.measured_unit,
          }));
      } else if (analysisResult) {
        // raw_data and reference_vs_indicated share this exact branch —
        // both are `analysisResult`-driven (the latter via skip_fit=true).
        polyStats = statsFromResult(analysisResult);
        points = pointsFromResult(analysisResult);
      }

      // Compute due_date from calibration_interval
      const calDate = new Date(step1.calibration_date);
      const intervalMonths = parseInt(step1.calibration_interval) || 12;
      const dueDate = new Date(calDate);
      dueDate.setMonth(dueDate.getMonth() + intervalMonths);

      const body: CalibrationCreateBody = {
        asset_id: assetId,
        sensor_id: step1.sensor_id || null,
        calibration_date: step1.calibration_date,
        due_date: dueDate.toISOString().slice(0, 10),
        performed_by_name: step1.performed_by_name,
        performed_by_user_id: step1.performed_by_user_id,
        checked_by_user_id: step1.checked_by_user_id,
        checked_by_name: step1.checked_by_name,
        calibration_type: step1.calibration_type,
        calibration_purpose: step1.calibration_purpose,
        external_lab_name: step1.external_lab_name || null,
        external_lab_certificate_number: step1.external_lab_certificate_number || null,
        calibration_organization_id: step1.calibration_organization_id || null,
        internal_procedure_id: step1.internal_procedure_id || null,
        internal_reference_asset_id: step1.internal_reference_asset_id || null,
        calibration_location_id: step1.calibration_location_id || null,
        repair_date: step1.calibration_purpose === "after_repair" ? (step1.repair_date || null) : null,
        repair_description: step1.calibration_purpose === "after_repair" ? (step1.repair_description || null) : null,
        calibration_interval: parseInt(step1.calibration_interval) || null,
        temperature: temperatureCelsius,
        temperature_uncertainty: temperatureUncertaintyCelsius,
        humidity: humVal,
        humidity_uncertainty: humUncertaintyVal,
        pressure: pressurePa,
        pressure_uncertainty: pressureUncertaintyPa,
        notes: step1.notes || null,
        data_entry_mode: mode,
        model_type: mode === "model_direct" ? manualCoeff.model_type
          : mode === "raw_data" ? (curveFitMethod === "polynomial_fit" ? "polynomial" : curveFitMethod)
          // Reference-vs-Measured-based As-Found/As-Left curve-fits both
          // sides with the shared afalCurveFitMethod, same mapping raw_data
          // uses; the Reference-vs-Indicated-based variant (isAfalSkipFit)
          // has no real model, "polynomial" is a harmless default.
          : mode === "reference_vs_as_found_as_left" && !isAfalSkipFit
            ? (afalCurveFitMethod === "polynomial_fit" ? "polynomial" : afalCurveFitMethod)
          : "polynomial",
        // The resolved (numbers-only) formula always comes from the server
        // — either fitted (raw_data's/curve-fit As-Found-As-Left's Custom
        // Formula method) or resolved by direct substitution (model_direct's
        // declared-values flow). Never send the unresolved template.
        custom_formula:
          (mode === "model_direct" && manualCoeff.model_type === "custom_formula")
          || (mode === "raw_data" && curveFitMethod === "custom_formula")
            ? analysisResult?.resolved_custom_formula ?? null
          : (mode === "reference_vs_as_found_as_left" && !isAfalSkipFit && afalCurveFitMethod === "custom_formula")
            ? asLeftResult?.resolved_custom_formula ?? null
            : null,
        as_found_points: asFoundPointsBody,
        as_found_summary: asFoundSummaryBody,
        ...(mode === "frequency_response" ? {
          frequency_response_frequency_unit: freqSettings.frequency_unit,
          frequency_response_amplitude_type: freqSettings.amplitude_type,
          frequency_response_offset_enabled: freqSettings.offset_enabled,
          frequency_response_offset_unit: freqSettings.offset_enabled ? freqSettings.offset_unit : null,
          frequency_response_baseline_sweep_index: freqBaselineIndex,
          frequency_response_points: frequencyResponsePointsBody,
        } : {}),
        ...polyStats,
        points,
      };

      const created = await createCalibration(body);
      if (step1.certificate_file) {
        try {
          await uploadCalibrationCertificate(created.id, step1.certificate_file);
        } catch {
          // Best-effort: the calibration record itself is already saved (immutable
          // history) — the user can't retry the upload from here, but the record
          // isn't rolled back for a failed attachment.
        }
      }
      setConfirmOpen(false);
      onSaved();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : t("errorSaveCalibration"));
    } finally {
      setSaving(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-5xl max-h-[92vh] bg-og-surface border border-og-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-og-border shrink-0">
          <div>
            <h2 className="text-base font-semibold text-og-text">{t("addCalibrationRecord")}</h2>
            <p className="text-xs text-gray-400 mt-0.5">{profile.name} · {profile.asset_id}</p>
          </div>
          <div className="flex items-center gap-6">
            <StepIndicator
              step={step}
              steps={[
                t("stepGeneralInfo"),
                t("stepInputData"),
                isModelDirect ? t("stepReview") : t("stepAnalysis"),
              ]}
            />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors"
            >
              <XIcon size={16} />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          {step === 1 && (
            <Step1
              state={step1}
              onChange={setStep1}
              profile={profile}
              calibrations={calibrations}
              currentUserName={user.name}
              currentUserId={user.id}
              calibrationUsers={calibrationUsers}
              referenceAssets={referenceAssets}
              calibrationMethods={calibrationMethods}
              calibrationLabs={calibrationLabs}
              labCandidates={labCandidates}
              onReferenceUnitChange={setReferenceUnit}
              onMeasuredUnitChange={setMeasuredUnit}
            />
          )}
          {step === 2 && (
            <div className="px-6 pt-6 pb-2">
              <InputMethodPicker
                value={step1.input_method}
                onChange={(m) => {
                  setStep1((s) => ({ ...s, input_method: m }));
                  // Reference vs Indicated is a display reading, always in
                  // the channel's own physical unit — Reference vs Measured
                  // is the channel's raw output signal (today's default).
                  if (m === "reference_vs_indicated") setMeasuredUnit(selectedChannel?.unit ?? "");
                  else if (m === "reference_vs_measured") setMeasuredUnit(selectedChannel?.output_signal_unit ?? selectedChannel?.unit ?? "");
                }}
              />
            </div>
          )}
          {step === 2 && (
            isModelDirect ? (
              <ManualCoefficientsStep
                state={manualCoeff}
                onChange={setManualCoeff}
                referenceUnit={referenceUnit}
                customFormulaError={customFormulaError}
                onCustomFormulaErrorChange={setCustomFormulaError}
              />
            ) : isRefVsAsFoundAsLeft ? (
              <AsFoundAsLeftStep
                asFoundPoints={asFoundPoints}
                onAsFoundPointsChange={setAsFoundPoints}
                asLeftPoints={asLeftPoints}
                onAsLeftPointsChange={setAsLeftPoints}
                referenceUnit={referenceUnit}
                measuredUnit={measuredUnit}
                onReferenceUnitChange={setReferenceUnit}
                onMeasuredUnitChange={setMeasuredUnit}
                physicalQuantity={selectedChannel?.physical_quantity ?? ""}
                outputType={selectedChannel?.output_type ?? null}
                measuredUnitIsPhysical={isAfalSkipFit}
                asFoundInputMode={asFoundInputMode}
                onAsFoundInputModeChange={setAsFoundInputMode}
                asFoundCsvError={asFoundCsvError}
                onAsFoundFileUpload={handleAsFoundFileUpload}
                asFoundFileInputRef={asFoundFileInputRef}
                asLeftInputMode={asLeftInputMode}
                onAsLeftInputModeChange={setAsLeftInputMode}
                asLeftCsvError={asLeftCsvError}
                onAsLeftFileUpload={handleAsLeftFileUpload}
                asLeftFileInputRef={asLeftFileInputRef}
              />
            ) : isFrequencyResponse ? (
              <FrequencyResponseDataStep
                rows={freqRows}
                onRowsChange={setFreqRows}
                settings={freqSettings}
                onSettingsChange={setFreqSettings}
                physicalQuantity={selectedChannel?.physical_quantity ?? ""}
                outputType={selectedChannel?.output_type ?? null}
                inputMode={freqInputMode}
                onInputModeChange={setFreqInputMode}
                csvError={freqCsvError}
                onFileUpload={handleFreqFileUpload}
                fileInputRef={freqFileInputRef}
              />
            ) : (
              <Step2
                points={rawPoints}
                onPointsChange={setRawPoints}
                referenceUnit={referenceUnit}
                measuredUnit={measuredUnit}
                onReferenceUnitChange={setReferenceUnit}
                onMeasuredUnitChange={setMeasuredUnit}
                physicalQuantity={selectedChannel?.physical_quantity ?? ""}
                outputType={selectedChannel?.output_type ?? null}
                inputMode={inputMode}
                onInputModeChange={setInputMode}
                csvError={csvError}
                onFileUpload={handleFileUpload}
                fileInputRef={fileInputRef}
                measuredLabel={isRefVsIndicated ? t("indicatedValue") : undefined}
                measuredUnitIsPhysical={isRefVsIndicated}
              />
            )
          )}
          {step === lastStep && (
            isRefVsAsFoundAsLeft ? (
              <AsFoundAsLeftResults
                asFoundResult={asFoundResult}
                asLeftResult={asLeftResult}
                analyzing={asFoundAsLeftAnalyzing}
                analyzeError={asFoundAsLeftError}
                referenceUnit={referenceUnit}
                measuredUnit={measuredUnit}
                selectedChannel={selectedChannel}
                isAfalSkipFit={isAfalSkipFit}
                afalCurveFitMethod={afalCurveFitMethod}
                onAfalCurveFitMethodChange={setAfalCurveFitMethod}
                afalCustomFormulaTemplate={afalCustomFormulaTemplate}
                onAfalCustomFormulaTemplateChange={setAfalCustomFormulaTemplate}
                afalCustomFormulaError={afalCustomFormulaError}
                onAfalCustomFormulaErrorChange={setAfalCustomFormulaError}
                analyzeParams={analyzeParams}
                onAnalyzeParamsChange={setAnalyzeParams}
                afalUncertainty={afalUncertainty}
                onAfalUncertaintyChange={setAfalUncertainty}
                referenceStandardAuto={referenceStandardAuto}
                referenceStandardAutoLoading={referenceStandardAutoLoading}
                referenceAssetName={referenceAssets.find((a) => a.id === step1.internal_reference_asset_id)?.name ?? null}
              />
            ) : isFrequencyResponse ? (
              <FrequencyResponseResults
                rows={freqRows}
                settings={freqSettings}
                baselineIndex={freqBaselineIndex}
                onBaselineIndexChange={setFreqBaselineIndex}
                result={freqAnalysisResult}
                analyzing={freqAnalyzing}
                analyzeError={freqAnalyzeError}
              />
            ) : (
              <Step3
                state={step1}
                analyzeParams={analyzeParams}
                onAnalyzeParamsChange={setAnalyzeParams}
                result={analysisResult}
                analyzing={analyzing}
                analyzeError={analyzeError}
                referenceUnit={referenceUnit}
                measuredUnit={measuredUnit}
                hoveredPointIdx={hoveredPointIdx}
                onHoverPoint={setHoveredPointIdx}
                dataEntryMode={dataEntryMode}
                manualCoeff={manualCoeff}
                selectedChannel={selectedChannel}
                includeSensorNominalUncertainty={includeSensorNominalUncertainty}
                onIncludeSensorNominalUncertaintyChange={setIncludeSensorNominalUncertainty}
                sensorNominalUncertaintyManual={sensorNominalUncertaintyManual}
                onSensorNominalUncertaintyManualChange={setSensorNominalUncertaintyManual}
                sensorNominalUncertaintyUnit={sensorNominalUncertaintyUnit}
                decisionRule={decisionRule}
                onDecisionRuleChange={setDecisionRule}
                toleranceOverrideValue={toleranceOverrideValue}
                onToleranceOverrideValueChange={setToleranceOverrideValue}
                includeReferenceStandardManual={includeReferenceStandardManual}
                onIncludeReferenceStandardManualChange={setIncludeReferenceStandardManual}
                referenceStandardAuto={referenceStandardAuto}
                referenceStandardAutoLoading={referenceStandardAutoLoading}
                referenceAssetName={referenceAssets.find((a) => a.id === step1.internal_reference_asset_id)?.name ?? null}
                referenceStandardManualUncertainty={referenceStandardManualUncertainty}
                onReferenceStandardManualUncertaintyChange={setReferenceStandardManualUncertainty}
                referenceStandardManualUnit={referenceStandardManualUnit}
                referenceStandardManualCoverageFactor={referenceStandardManualCoverageFactor}
                onReferenceStandardManualCoverageFactorChange={setReferenceStandardManualCoverageFactor}
                curveFitMethod={curveFitMethod}
                onCurveFitMethodChange={setCurveFitMethod}
                rawCustomFormulaTemplate={rawCustomFormulaTemplate}
                onRawCustomFormulaTemplateChange={setRawCustomFormulaTemplate}
                rawCustomFormulaError={rawCustomFormulaError}
                onRawCustomFormulaErrorChange={setRawCustomFormulaError}
              />
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-og-border shrink-0">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)}
            disabled={step === 1}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-og-border-md text-og-text hover:bg-og-surface-alt disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            {t("back")}
          </button>

          {step < lastStep ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && !step1Valid) return;
                if (step === 2 && !step2Valid) return;
                setStep((s) => (s + 1) as 2 | 3);
              }}
              disabled={
                (step === 1 && !step1Valid) ||
                (step === 2 && !step2Valid)
              }
              className="px-5 py-2 text-sm font-medium rounded-lg bg-og-action hover:bg-og-action-dark text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t("next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!canSave}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t("confirmAndSave")}
            </button>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="bg-og-surface border border-og-border rounded-xl shadow-2xl p-6 w-96 mx-auto">
            <h3 className="text-sm font-semibold text-og-text mb-3">{t("saveCalibrationRecord")}</h3>
            {hasConformityCheck && conformityStatement!.passed && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 mb-3">
                <CheckIcon size={13} className="text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  {t("conformsMessage", { specification: conformityStatement!.specification ?? "", rule: translateDynamic(tDecisionRule, conformityStatement!.decision_rule) })}
                </p>
              </div>
            )}
            {hasConformityCheck && !conformityStatement!.passed && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 mb-3">
                <WarningIcon size={13} className="text-amber-600 shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  {t("doesNotConformMessage", { specification: conformityStatement!.specification ?? "", rule: translateDynamic(tDecisionRule, conformityStatement!.decision_rule) })}
                </p>
              </div>
            )}
            <p className="text-xs text-gray-400 mb-4">
              {t("permanentVersionHint")}
            </p>
            {saveError && <p className="text-xs text-red-500 mb-3">{saveError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
                className="px-3 py-1.5 text-sm rounded-lg border border-og-border-md text-og-text hover:bg-og-surface-alt transition-colors"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={`px-3 py-1.5 text-sm rounded-lg text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                  hasConformityCheck && !conformityStatement!.passed
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {hasConformityCheck && !conformityStatement!.passed ? t("saveAnyway") : t("save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 1 — General Information
// ---------------------------------------------------------------------------

function Step1({
  state, onChange, profile, calibrations, currentUserName, currentUserId, calibrationUsers, referenceAssets, calibrationMethods,
  calibrationLabs, labCandidates, onReferenceUnitChange, onMeasuredUnitChange,
}: {
  state: Step1State;
  onChange: (s: Step1State) => void;
  profile: AssetProfile;
  calibrations: CalibrationRecord[];
  currentUserName: string;
  currentUserId: string;
  calibrationUsers: CalibrationUser[];
  referenceAssets: { id: string; name: string; asset_id: string }[];
  calibrationMethods: { id: string; name: string }[];
  calibrationLabs: { id: string; name: string }[];
  labCandidates: CalibrationLabCandidate[];
  onReferenceUnitChange: (u: string) => void;
  onMeasuredUnitChange: (u: string) => void;
}) {
  const t = useTranslations("assets.wizard");
  const tQuantity = useTranslations("tokens.physicalQuantity");
  const set = (key: keyof Step1State) => (value: string | boolean) =>
    onChange({ ...state, [key]: value });
  const [certificateError, setCertificateError] = useState<string | null>(null);
  const [certificateDragging, setCertificateDragging] = useState(false);
  const certFileInputRef = useRef<HTMLInputElement>(null);

  const selectedChannel = profile.sensor_channels.find((c) => c.id === state.sensor_id);

  const CALIBRATION_TYPE_OPTIONS: { value: CalibrationType; label: string }[] = [
    { value: "oem", label: t("calibrationTypeOem") },
    { value: "external_accredited_lab", label: t("calibrationTypeExternalAccreditedLab") },
    { value: "internal_lab", label: t("calibrationTypeInternalLab") },
    { value: "customer_asset", label: t("calibrationTypeCustomerAsset") },
  ];
  const CALIBRATION_PURPOSE_OPTIONS: { value: CalibrationPurpose; label: string }[] = [
    { value: "initial", label: t("purposeInitial") },
    { value: "routine", label: t("purposeRoutine") },
    { value: "after_repair", label: t("purposeAfterRepair") },
    { value: "verification", label: t("purposeVerification") },
  ];
  const showsCertificateUpload = state.calibration_type === "oem" || state.calibration_type === "external_accredited_lab";

  function handleCertificateFile(file: File | null) {
    if (!file) {
      setCertificateError(null);
      onChange({ ...state, certificate_file: null });
      return;
    }
    if (file.type !== "application/pdf") {
      setCertificateError(t("certificateMustBePdf"));
      return;
    }
    setCertificateError(null);
    onChange({ ...state, certificate_file: file });
  }

  return (
    <div className="p-6 space-y-5">
      {/* Channel row (only when the asset has more than one channel) */}
      {profile.sensor_channels.length > 1 && (
        <div className="grid grid-cols-1 gap-4">
          <WSelect
            label={t("channel")}
            value={state.sensor_id}
            onChange={(v) => {
              const ch = profile.sensor_channels.find((c) => c.id === v);
              onChange({
                ...state,
                sensor_id: v,
                calibration_purpose: calibrations.some((c) => c.sensor_id === v) ? "routine" : "initial",
              });
              onReferenceUnitChange(ch?.unit ?? "");
              onMeasuredUnitChange(ch?.output_signal_unit ?? ch?.unit ?? "");
            }}
            options={profile.sensor_channels.map((c) => ({
              value: c.id,
              label: `${c.channel_id} — ${translateDynamic(tQuantity, c.physical_quantity)}`,
            }))}
            required
            tooltip={t("tips.channel")}
            docsHref={WIZARD_DOCS_LINKS.channel}
          />
        </div>
      )}

      {/* Calibration date + interval, same row */}
      <div className="grid grid-cols-2 gap-4">
        <WInput
          label={t("calibrationDate")}
          type="date"
          value={state.calibration_date}
          onChange={set("calibration_date")}
          required
          tooltip={t("tips.calibrationDate")}
          docsHref={WIZARD_DOCS_LINKS.calibration_date}
        />
        <WInput
          label={t("calibrationIntervalMonths")}
          type="number"
          numberWidth="w-24"
          value={state.calibration_interval}
          onChange={set("calibration_interval") as (v: string) => void}
          placeholder={String(selectedChannel?.calibration_interval ?? 12)}
          required
          tooltip={t("tips.calibrationInterval")}
          docsHref={WIZARD_DOCS_LINKS.calibration_interval}
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Registered by: dropdown of the asset's org members, defaults to current user */}
        <WSelect
          label={t("registeredBy")}
          value={state.performed_by_user_id ?? ""}
          onChange={(v) => {
            const selected = calibrationUsers.find((u) => u.id === v);
            onChange({
              ...state,
              performed_by_user_id: v || null,
              performed_by_name: selected?.name ?? "",
              // The registrant can't also be their own checker.
              checked_by_user_id: state.checked_by_user_id === v ? null : state.checked_by_user_id,
              checked_by_name: state.checked_by_user_id === v ? null : state.checked_by_name,
            });
          }}
          options={calibrationUsers.map((u) => ({ value: u.id, label: u.id === currentUserId ? currentUserName : u.name }))}
          required
          tooltip={t("tips.registeredBy")}
          docsHref={WIZARD_DOCS_LINKS.registered_by}
        />
        {/* Checked by: optional — same candidate list, minus whoever is Registered By */}
        <WSelect
          label={t("checkedBy")}
          value={state.checked_by_user_id ?? ""}
          onChange={(v) => {
            const selected = calibrationUsers.find((u) => u.id === v);
            onChange({ ...state, checked_by_user_id: v || null, checked_by_name: selected?.name ?? null });
          }}
          options={calibrationUsers
            .filter((u) => u.id !== state.performed_by_user_id)
            .map((u) => ({ value: u.id, label: u.id === currentUserId ? currentUserName : u.name }))}
          placeholder={t("checkedByNone")}
          tooltip={t("tips.checkedBy")}
          docsHref={WIZARD_DOCS_LINKS.checked_by}
        />
      </div>

      {/* Calibration type + purpose */}
      <div className="grid grid-cols-2 gap-4">
        <WSelect
          label={t("calibrationType")}
          value={state.calibration_type}
          onChange={(v) => onChange({ ...state, calibration_type: v as CalibrationType })}
          options={CALIBRATION_TYPE_OPTIONS}
          required
          tooltip={t("tips.calibrationType")}
          docsHref={WIZARD_DOCS_LINKS.calibration_type}
        />
        <WSelect
          label={t("calibrationPurpose")}
          value={state.calibration_purpose}
          onChange={(v) => onChange({ ...state, calibration_purpose: v as CalibrationPurpose })}
          options={CALIBRATION_PURPOSE_OPTIONS}
          required
          tooltip={t("tips.calibrationPurpose")}
          docsHref={WIZARD_DOCS_LINKS.calibration_purpose}
        />
      </div>

      {/* Calibration lab — field behavior switches on calibration_type */}
      <div className="grid grid-cols-2 gap-4">
        {state.calibration_type === "oem" && (
          <WInput label={t("calibrationLab")} value={state.external_lab_name} onChange={() => {}} readOnly
            tooltip={t("tips.calibrationLab")} docsHref={WIZARD_DOCS_LINKS.calibration_lab} />
        )}
        {(state.calibration_type === "external_accredited_lab" || state.calibration_type === "customer_asset") && (
          <WSelect
            label={t("calibrationLab")}
            value={state.calibration_organization_id}
            onChange={set("calibration_organization_id") as (v: string) => void}
            options={labCandidates.map((o) => ({ value: o.id, label: o.name }))}
            placeholder={
              labCandidates.length === 0
                ? (state.calibration_type === "customer_asset" ? t("noCustomersConfigured") : t("noProvidersConfigured"))
                : t("selectLab")
            }
            tooltip={t("tips.calibrationLab")}
            docsHref={WIZARD_DOCS_LINKS.calibration_lab}
          />
        )}
        {state.calibration_type === "internal_lab" && (
          <WSelect
            label={t("calibrationLab")}
            value={state.calibration_location_id}
            onChange={set("calibration_location_id") as (v: string) => void}
            options={calibrationLabs.map((l) => ({ value: l.id, label: l.name }))}
            placeholder={calibrationLabs.length === 0 ? t("noLabsConfigured") : t("selectLab")}
            tooltip={t("tips.calibrationLab")}
            docsHref={WIZARD_DOCS_LINKS.calibration_lab}
          />
        )}
      </div>

      {/* OEM / External Accredited Lab / Customer's Asset: certificate upload */}
      {showsCertificateUpload && (
        <div className="pl-4 border-l-2 border-og-border">
          <div className="flex flex-col gap-1">
            <WLabel text={t("calibrationCertificate")} tooltip={t("tips.calibrationCertificate")} docsHref={WIZARD_DOCS_LINKS.calibration_certificate} />
            {state.certificate_file ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-og-text truncate">{state.certificate_file.name}</span>
                <button type="button" onClick={() => handleCertificateFile(null)} className="text-gray-400 hover:text-og-text">
                  <XIcon size={13} />
                </button>
              </div>
            ) : (
              <div
                onDragOver={(e) => { e.preventDefault(); setCertificateDragging(true); }}
                onDragLeave={() => setCertificateDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setCertificateDragging(false);
                  const f = e.dataTransfer.files[0];
                  if (f) handleCertificateFile(f);
                }}
                onClick={() => certFileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors ${
                  certificateDragging ? "border-og-accent bg-og-accent/5" : "border-og-border-md hover:border-og-accent hover:bg-og-surface-alt"
                }`}
              >
                <input
                  ref={certFileInputRef}
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleCertificateFile(e.target.files?.[0] ?? null)}
                />
                <p className="text-xs font-medium text-og-text">{t("dropCertificateHint")}</p>
              </div>
            )}
            {certificateError && <p className="text-xs text-red-500 mt-0.5">{certificateError}</p>}
            <p className="text-xs text-gray-400">{t("uploadCertificateHint")}</p>
          </div>
        </div>
      )}

      {/* Internal Lab fields */}
      {state.calibration_type === "internal_lab" && (
        <div className="space-y-4 pl-4 border-l-2 border-og-border">
          <div className="grid grid-cols-2 gap-4">
            <WSelect
              label={t("referenceAsset")}
              value={state.internal_reference_asset_id}
              onChange={set("internal_reference_asset_id") as (v: string) => void}
              options={referenceAssets.map((a) => ({ value: a.id, label: `${a.name} (${a.asset_id})` }))}
              placeholder={t("selectReference")}
              tooltip={t("tips.referenceAsset")}
              docsHref={WIZARD_DOCS_LINKS.reference_asset}
            />
            <WSelect
              label={t("calibrationMethod")}
              value={state.internal_procedure_id}
              onChange={set("internal_procedure_id") as (v: string) => void}
              options={calibrationMethods.map((m) => ({ value: m.id, label: m.name }))}
              placeholder={t("selectMethod")}
              tooltip={t("tips.calibrationMethod")}
              docsHref={WIZARD_DOCS_LINKS.calibration_method}
            />
          </div>
        </div>
      )}

      {/* After Repair fields */}
      {state.calibration_purpose === "after_repair" && (
        <div className="space-y-4 pl-4 border-l-2 border-og-border">
          <div className="grid grid-cols-2 gap-4">
            <WInput
              label={t("repairDate")}
              type="date"
              value={state.repair_date}
              onChange={set("repair_date") as (v: string) => void}
              required
              tooltip={t("tips.repairDate")}
              docsHref={WIZARD_DOCS_LINKS.repair_date}
            />
          </div>
          <div className="flex flex-col gap-1">
            <WLabel text={t("repairDescription")} tooltip={t("tips.repairDescription")} docsHref={WIZARD_DOCS_LINKS.repair_description} />
            <textarea
              value={state.repair_description}
              onChange={(e) => set("repair_description")(e.target.value.slice(0, 500))}
              rows={3}
              maxLength={500}
              placeholder={t("repairDescriptionPlaceholder")}
              className={`${IB} ${IB_OK} resize-none`}
            />
            <p className="text-xs text-gray-400 text-right">{t("charactersRemaining", { count: 500 - state.repair_description.length })}</p>
          </div>
        </div>
      )}

      {/* Environmental conditions */}
      <div className="border border-og-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => onChange({ ...state, env_expanded: !state.env_expanded })}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-og-text hover:bg-og-surface-alt transition-colors"
        >
          <span className="inline-flex items-center gap-1">
            {t("environmentalConditions")} <span className="text-xs text-gray-400 font-normal ml-1">{t("optional")}</span>
            <FieldTooltip tooltip={t("tips.environmentalConditions")} docsHref={WIZARD_DOCS_LINKS.environmental_conditions} />
          </span>
          <ChevronDownIcon size={14} className={`text-gray-400 transition-transform ${state.env_expanded ? "rotate-180" : ""}`} />
        </button>
        {state.env_expanded && (
          <div className="px-4 pb-4 pt-2 space-y-4 border-t border-og-border">
            <>
              <div className="grid grid-cols-3 gap-3">
                <WInput label={t("temperature")} type="number" numberWidth="w-24" value={state.temperature_value}
                  onChange={set("temperature_value") as (v: string) => void}
                  placeholder="e.g. 23" />
                <div className="flex flex-col gap-1">
                  <WLabel text={t("uncertainty")} />
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">±</span>
                    <NumberInput value={state.temperature_uncertainty}
                      onChange={set("temperature_uncertainty")}
                      placeholder="e.g. 0.1" className="w-24" />
                  </div>
                </div>
                <WSelect label={t("unit")} value={state.temperature_unit}
                  onChange={set("temperature_unit") as (v: string) => void}
                  options={[{ value: "°C", label: "°C" }, { value: "K", label: "K" }, { value: "°F", label: "°F" }]}
                  width="w-20" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <WInput label={t("pressure")} type="number" numberWidth="w-24" value={state.pressure_value}
                  onChange={set("pressure_value") as (v: string) => void}
                  placeholder="e.g. 1013.25" />
                <div className="flex flex-col gap-1">
                  <WLabel text={t("uncertainty")} />
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">±</span>
                    <NumberInput value={state.pressure_uncertainty}
                      onChange={set("pressure_uncertainty")}
                      placeholder="e.g. 0.5" className="w-24" />
                  </div>
                </div>
                <WSelect label={t("unit")} value={state.pressure_unit}
                  onChange={set("pressure_unit") as (v: string) => void}
                  options={[{ value: "hPa", label: "hPa" }, { value: "Pa", label: "Pa" }, { value: "bar", label: "bar" }, { value: "psi", label: "psi" }]}
                  width="w-20" />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <WInput label={t("humidity")} type="number" numberWidth="w-24" value={state.humidity_value}
                  onChange={set("humidity_value") as (v: string) => void}
                  placeholder="e.g. 45" />
                <div className="flex flex-col gap-1">
                  <WLabel text={t("uncertainty")} />
                  <div className="flex items-center gap-1">
                    <span className="text-sm text-gray-400">±</span>
                    <NumberInput value={state.humidity_uncertainty}
                      onChange={set("humidity_uncertainty")}
                      placeholder="e.g. 2" className="w-24" />
                  </div>
                </div>
                <WSelect label={t("unit")} value={state.humidity_unit}
                  onChange={set("humidity_unit") as (v: string) => void}
                  options={[{ value: "%RH", label: "%RH" }]}
                  width="w-20" />
              </div>
            </>
          </div>
        )}
      </div>

      {/* Notes */}
      <div className="flex flex-col gap-1">
        <WLabel text={t("notes")} tooltip={t("tips.notes")} docsHref={WIZARD_DOCS_LINKS.notes} />
        <textarea
          value={state.notes}
          onChange={(e) => set("notes")(e.target.value)}
          rows={2}
          placeholder={t("notesPlaceholder")}
          className={`${IB} ${IB_OK} resize-none`}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Input data method picker
// ---------------------------------------------------------------------------

// A single dropdown at the top of Step 2, always set (defaults to
// "reference_vs_measured") — the rest of the step renders immediately below
// according to the current selection, no separate "pick a method" screen.
// As-Found/As-Left is deliberately not one of the options here; it's an
// automatic consequence of purpose="after_repair" applied to either of the
// first two (see deriveDataEntryMode). "Model (transfer function)" is always
// offered alongside the rest — independent of whatever calibration_type/
// calibration_purpose was entered on Step 1.
function InputMethodPicker({
  value, onChange,
}: {
  value: InputMethod;
  onChange: (m: InputMethod) => void;
}) {
  const t = useTranslations("assets.wizard");
  const options: { value: InputMethod; label: string }[] = [
    { value: "reference_vs_measured", label: t("inputMethodMeasuredTitle") },
    { value: "reference_vs_indicated", label: t("inputMethodIndicatedTitle") },
    { value: "model_direct", label: t("inputMethodModelTitle") },
    { value: "frequency_response", label: t("inputMethodFrequencyResponseTitle") },
  ];

  return (
    <div className="flex flex-col gap-1 w-72">
      <WLabel text={t("dataEntryMode")} tooltip={t("tips.dataEntryMode")} docsHref={WIZARD_DOCS_LINKS.data_entry_mode} />
      <Select value={value} onChange={(v) => onChange(v as InputMethod)} options={options} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 — Raw Data
// ---------------------------------------------------------------------------

// The Reference/Measured (or Indicated) unit dropdowns — extracted so
// AsFoundAsLeftStep can render one shared row above its two side-by-side
// tables instead of duplicating it (or showing it only above one side).
function UnitSelectorsRow({
  referenceUnit, measuredUnit, onReferenceUnitChange, onMeasuredUnitChange,
  physicalQuantity, outputType, measuredUnitIsPhysical = false, measuredLabel,
}: {
  referenceUnit: string;
  measuredUnit: string;
  onReferenceUnitChange: (u: string) => void;
  onMeasuredUnitChange: (u: string) => void;
  physicalQuantity: string;
  outputType: string | null;
  measuredUnitIsPhysical?: boolean;
  measuredLabel?: string;
}) {
  const t = useTranslations("assets.wizard");
  const refUnitOpts = (() => {
    const base = getUnitsForQuantity(physicalQuantity);
    const opts = base.length > 0 ? base : [{ value: referenceUnit, label: referenceUnit }];
    return opts.some(u => u.value === referenceUnit) ? opts : [{ value: referenceUnit, label: referenceUnit }, ...opts];
  })();
  const measUnitOpts = (() => {
    const fromOutput = (!measuredUnitIsPhysical && outputType) ? (getOutputUnits(outputType, physicalQuantity) ?? []) : [];
    const base = fromOutput.length > 0 ? fromOutput : getUnitsForQuantity(physicalQuantity);
    const opts = base.length > 0 ? base : [{ value: measuredUnit, label: measuredUnit }];
    return opts.some(u => u.value === measuredUnit) ? opts : [{ value: measuredUnit, label: measuredUnit }, ...opts];
  })();
  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="flex flex-col gap-1">
        <WLabel text={t("referenceUnit")} />
        <Select value={referenceUnit} onChange={onReferenceUnitChange} options={refUnitOpts} className="w-32" />
      </div>
      <div className="flex flex-col gap-1">
        <WLabel text={measuredLabel ?? t("measuredUnit")} />
        <Select value={measuredUnit} onChange={onMeasuredUnitChange} options={measUnitOpts} className="w-32" />
      </div>
    </div>
  );
}

function Step2({
  points, onPointsChange, referenceUnit, measuredUnit,
  onReferenceUnitChange, onMeasuredUnitChange, physicalQuantity, outputType,
  inputMode, onInputModeChange, csvError, onFileUpload, fileInputRef,
  title, showUnitSelectors = true, measuredLabel, measuredUnitIsPhysical = false,
}: {
  points: WizardRawPoint[];
  onPointsChange: (p: WizardRawPoint[]) => void;
  referenceUnit: string;
  measuredUnit: string;
  onReferenceUnitChange: (u: string) => void;
  onMeasuredUnitChange: (u: string) => void;
  physicalQuantity: string;
  outputType: string | null;
  inputMode: "manual" | "csv";
  onInputModeChange: (m: "manual" | "csv") => void;
  csvError: string | null;
  onFileUpload: (f: File) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  // reference_vs_indicated/reference_vs_as_found_as_left reuse this exact
  // table: `title` labels which dataset it is (e.g. "As Found"), and
  // showUnitSelectors=false hides a redundant unit picker when a sibling
  // instance already owns the shared referenceUnit/measuredUnit state.
  title?: string;
  showUnitSelectors?: boolean;
  measuredLabel?: string;
  // True for Reference vs Indicated (and its As-Found/As-Left variant): an
  // "indicated" value is a display reading, in the channel's own physical
  // unit — never the raw electrical output signal (e.g. mA) raw_data's
  // "Measured" column uses.
  measuredUnitIsPhysical?: boolean;
}) {
  const t = useTranslations("assets.wizard");
  const [dragging, setDragging] = useState(false);

  function updatePoint(idx: number, key: "reference" | "measured", val: string) {
    const next = [...points];
    next[idx] = { ...next[idx], [key]: val };
    onPointsChange(next);
  }

  function addRow() {
    onPointsChange([...points, { reference: "", measured: "" }]);
  }

  function removeRow(idx: number) {
    if (points.length <= 2) return;
    onPointsChange(points.filter((_, i) => i !== idx));
  }

  return (
    <div className="p-6 space-y-4">
      {title && <p className="text-xs font-semibold text-og-text -mb-1">{title}</p>}
      {/* Unit selectors */}
      {showUnitSelectors && (
        <UnitSelectorsRow
          referenceUnit={referenceUnit}
          measuredUnit={measuredUnit}
          onReferenceUnitChange={onReferenceUnitChange}
          onMeasuredUnitChange={onMeasuredUnitChange}
          physicalQuantity={physicalQuantity}
          outputType={outputType}
          measuredUnitIsPhysical={measuredUnitIsPhysical}
          measuredLabel={measuredLabel}
        />
      )}

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-og-surface-alt rounded-lg w-fit">
        {(["manual", "csv"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onInputModeChange(m)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              inputMode === m ? "bg-og-surface text-og-text shadow-xs" : "text-gray-400 hover:text-og-text"
            }`}
          >
            {m === "manual" ? t("manualEntry") : t("csvUpload")}
          </button>
        ))}
      </div>

      {inputMode === "manual" && (
        <div className="space-y-3">
          {/* Data table */}
          <div className="rounded-lg border border-og-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-og-border bg-og-surface-alt">
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium w-10">#</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                    {t("reference")} {referenceUnit && <span className="font-mono ml-1">({referenceUnit})</span>}
                  </th>
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                    {t("measured")} {measuredUnit && <span className="font-mono ml-1">({measuredUnit})</span>}
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {points.map((pt, i) => (
                  <tr key={i} className="border-b border-og-border last:border-b-0 hover:bg-og-surface-alt/50 transition-colors">
                    <td className="px-3 py-1.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-2 py-1">
                      <NumberInput
                        value={pt.reference}
                        onChange={(v) => updatePoint(i, "reference", v)}
                        placeholder="0.0"
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <NumberInput
                        value={pt.measured}
                        onChange={(v) => updatePoint(i, "measured", v)}
                        placeholder="0.0"
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <button
                        type="button"
                        onClick={() => removeRow(i)}
                        disabled={points.length <= 2}
                        className="p-1 rounded-sm text-gray-400 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                      >
                        <TrashIcon size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addRow}
            className="flex items-center gap-1.5 text-xs text-og-accent hover:text-og-accent-dark font-medium transition-colors"
          >
            <PlusIcon size={13} />
            {t("addRow")}
          </button>
        </div>
      )}

      {inputMode === "csv" && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) onFileUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? "border-og-accent bg-og-accent/5" : "border-og-border-md hover:border-og-accent hover:bg-og-surface-alt"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); }}
            />
            <p className="text-sm font-medium text-og-text">{t("dropCsvHint")}</p>
            <p className="text-xs text-gray-400 mt-1">{t("csvFormatHint")}</p>
          </div>
          {csvError && (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-900/30">
              <WarningIcon size={13} className="shrink-0 mt-0.5" />
              {csvError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 alternative — data_entry_mode="reference_vs_as_found_as_left":
// reuses Step2's row-table twice, stacked (as-found, as-left), sharing one
// pair of reference/measured units — same channel, same session either side
// of the repair. CSV upload is intentionally per-side but manual-only tables
// remain the primary path (these datasets are typically small).
// ---------------------------------------------------------------------------

function AsFoundAsLeftStep({
  asFoundPoints, onAsFoundPointsChange, asLeftPoints, onAsLeftPointsChange,
  referenceUnit, measuredUnit, onReferenceUnitChange, onMeasuredUnitChange,
  physicalQuantity, outputType, measuredUnitIsPhysical = false,
  asFoundInputMode, onAsFoundInputModeChange, asFoundCsvError, onAsFoundFileUpload, asFoundFileInputRef,
  asLeftInputMode, onAsLeftInputModeChange, asLeftCsvError, onAsLeftFileUpload, asLeftFileInputRef,
}: {
  asFoundPoints: WizardRawPoint[];
  onAsFoundPointsChange: (p: WizardRawPoint[]) => void;
  asLeftPoints: WizardRawPoint[];
  onAsLeftPointsChange: (p: WizardRawPoint[]) => void;
  referenceUnit: string;
  measuredUnit: string;
  onReferenceUnitChange: (u: string) => void;
  onMeasuredUnitChange: (u: string) => void;
  physicalQuantity: string;
  outputType: string | null;
  measuredUnitIsPhysical?: boolean;
  asFoundInputMode: "manual" | "csv";
  onAsFoundInputModeChange: (m: "manual" | "csv") => void;
  asFoundCsvError: string | null;
  onAsFoundFileUpload: (f: File) => void;
  asFoundFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  asLeftInputMode: "manual" | "csv";
  onAsLeftInputModeChange: (m: "manual" | "csv") => void;
  asLeftCsvError: string | null;
  onAsLeftFileUpload: (f: File) => void;
  asLeftFileInputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations("assets.wizard");
  const measuredLabel = measuredUnitIsPhysical ? t("indicatedValue") : undefined;
  return (
    <div>
      {/* Units are shared between As Found and As Left — same channel, same
          session either side of the repair — shown once, above both
          side-by-side tables. */}
      <div className="px-6 pt-6 pb-2">
        <UnitSelectorsRow
          referenceUnit={referenceUnit}
          measuredUnit={measuredUnit}
          onReferenceUnitChange={onReferenceUnitChange}
          onMeasuredUnitChange={onMeasuredUnitChange}
          physicalQuantity={physicalQuantity}
          outputType={outputType}
          measuredUnitIsPhysical={measuredUnitIsPhysical}
          measuredLabel={measuredLabel}
        />
      </div>
      <div className="grid grid-cols-2 divide-x divide-og-border border-t border-og-border">
        <Step2
          title={t("asFoundData")}
          points={asFoundPoints}
          onPointsChange={onAsFoundPointsChange}
          referenceUnit={referenceUnit}
          measuredUnit={measuredUnit}
          onReferenceUnitChange={onReferenceUnitChange}
          onMeasuredUnitChange={onMeasuredUnitChange}
          physicalQuantity={physicalQuantity}
          outputType={outputType}
          measuredUnitIsPhysical={measuredUnitIsPhysical}
          measuredLabel={measuredLabel}
          inputMode={asFoundInputMode}
          onInputModeChange={onAsFoundInputModeChange}
          csvError={asFoundCsvError}
          onFileUpload={onAsFoundFileUpload}
          fileInputRef={asFoundFileInputRef}
          showUnitSelectors={false}
        />
        <Step2
          title={t("asLeftData")}
          points={asLeftPoints}
          onPointsChange={onAsLeftPointsChange}
          referenceUnit={referenceUnit}
          measuredUnit={measuredUnit}
          onReferenceUnitChange={onReferenceUnitChange}
          onMeasuredUnitChange={onMeasuredUnitChange}
          physicalQuantity={physicalQuantity}
          outputType={outputType}
          measuredUnitIsPhysical={measuredUnitIsPhysical}
          measuredLabel={measuredLabel}
          inputMode={asLeftInputMode}
          onInputModeChange={onAsLeftInputModeChange}
          csvError={asLeftCsvError}
          onFileUpload={onAsLeftFileUpload}
          fileInputRef={asLeftFileInputRef}
          showUnitSelectors={false}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 alternative — manual coefficient entry ("coefficients only")
// ---------------------------------------------------------------------------

function ManualCoefficientsStep({
  state, onChange, referenceUnit, customFormulaError, onCustomFormulaErrorChange,
}: {
  state: ManualCoeffState;
  onChange: (s: ManualCoeffState) => void;
  referenceUnit: string;
  customFormulaError: string | null;
  onCustomFormulaErrorChange: (e: string | null) => void;
}) {
  const t = useTranslations("assets.wizard");
  function setOrder(order: number) {
    const coefficients = [...state.coefficients];
    while (coefficients.length < order + 1) coefficients.push("");
    coefficients.length = order + 1;
    onChange({ ...state, poly_order: order, coefficients });
  }

  function setCoeff(idx: number, val: string) {
    const coefficients = [...state.coefficients];
    coefficients[idx] = val;
    onChange({ ...state, coefficients });
  }

  function setCustomFormulaTemplate(template: string) {
    // Re-derive the parameter-value map from the new template: keep values
    // for names still present, add blank entries for newly-detected ones,
    // drop ones that no longer appear — same "live re-derive" pattern as
    // setOrder's coefficient-array resizing above.
    let params: Record<string, string> = {};
    let error: string | null = null;
    if (template.trim() !== "") {
      try {
        validateFormulaTemplate(template);
        const names = extractFormulaParameters(template);
        params = Object.fromEntries(names.map((n) => [n, state.custom_formula_params[n] ?? ""]));
      } catch {
        error = t("customFormulaInvalid");
        params = state.custom_formula_params;
      }
    }
    onChange({ ...state, custom_formula_template: template, custom_formula_params: params });
    onCustomFormulaErrorChange(error);
  }

  function setCustomFormulaParam(name: string, value: string) {
    onChange({ ...state, custom_formula_params: { ...state.custom_formula_params, [name]: value } });
  }

  const numericCoeffs = state.coefficients.map((c) => parseFloat(c));
  const previewValid = numericCoeffs.every((c) => !isNaN(c));

  const detectedParams = (() => {
    if (state.custom_formula_template.trim() === "") return [];
    try {
      return extractFormulaParameters(state.custom_formula_template);
    } catch {
      return [];
    }
  })();
  // Local, display-only preview (simple word-boundary substitution) — the
  // authoritative resolved formula always comes back from the server, since
  // it's the only side guaranteed to produce valid, re-parseable syntax
  // (see evaluate-model.ts's validateFormulaTemplate doc comment).
  const previewFormula = (() => {
    let text = state.custom_formula_template;
    for (const name of detectedParams) {
      const v = state.custom_formula_params[name];
      if (v === undefined || v.trim() === "" || isNaN(parseFloat(v))) return null;
      text = text.replace(new RegExp(`\\b${name}\\b`, "g"), v);
    }
    return text;
  })();

  return (
    <div className="p-6 space-y-5">
      <p className="text-xs text-gray-400">
        {t("manualCoeffHint")}
      </p>

      <div className="flex flex-col gap-1 w-56">
        <WLabel text={t("modelType")} required tooltip={t("tips.modelType")} />
        <Select
          value={state.model_type}
          onChange={(v) => onChange({ ...state, model_type: v as ModelType })}
          options={[
            { value: "polynomial", label: t("modelTypePolynomial") },
            { value: "custom_formula", label: t("modelTypeCustomFormula") },
          ]}
        />
      </div>

      {state.model_type === "polynomial" ? (
        <>
          <div className="flex flex-col gap-1 w-40">
            <WLabel text={t("polynomialOrder")} required />
            <Select
              value={String(state.poly_order)}
              onChange={(v) => setOrder(parseInt(v))}
              options={[1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: String(d) }))}
              className="w-20"
            />
          </div>

          <div className="grid grid-cols-3 gap-3">
            {state.coefficients.map((c, i) => {
              const power = state.poly_order - i;
              return (
                <WInput
                  key={i}
                  label={t("coefficientLabel", { power: coeffPowerLabel(power, t) })}
                  type="number"
                  numberWidth="w-24"
                  value={c}
                  onChange={(v) => setCoeff(i, v)}
                  placeholder="0.0"
                  required
                />
              );
            })}
          </div>

          {previewValid && (
            <div className="px-4 py-2 rounded-lg bg-og-surface-alt border border-og-border">
              <span className="text-[11px] text-gray-400 mr-2">{t("equation")}</span>
              <span className="text-xs font-mono text-og-text">{formatEquation(numericCoeffs, state.poly_order)}</span>
            </div>
          )}
        </>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1">
            <WInput
              label={t("customFormula")}
              value={state.custom_formula_template}
              onChange={setCustomFormulaTemplate}
              placeholder={t("customFormulaPlaceholder")}
              required
              error={customFormulaError ?? undefined}
              tooltip={t("tips.customFormula")}
              docsHref={STAT_DOCS_LINKS.custom_formula_syntax}
            />
            <p className="text-xs text-gray-400">{t("customFormulaHint")}</p>
            {customFormulaError && <p className="text-xs text-red-500">{customFormulaError}</p>}
          </div>

          {detectedParams.length > 0 && !customFormulaError && (
            <div className="space-y-2">
              <p className="text-xs text-gray-400">
                {t("detectedParameters", { params: detectedParams.join(", ") })}
              </p>
              <div className="grid grid-cols-3 gap-3">
                {detectedParams.map((name) => (
                  <WInput
                    key={name}
                    label={t("parameterValueLabel", { name })}
                    type="number"
                    numberWidth="w-24"
                    value={state.custom_formula_params[name] ?? ""}
                    onChange={(v) => setCustomFormulaParam(name, v)}
                    placeholder="0.0"
                    required
                  />
                ))}
              </div>
            </div>
          )}

          {previewFormula && (
            <div className="px-4 py-2 rounded-lg bg-og-surface-alt border border-og-border">
              <span className="text-[11px] text-gray-400 mr-2">{t("equation")}</span>
              <span className="text-xs font-mono text-og-text">f(x) = {previewFormula}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <WInput
          label={referenceUnit ? t("validRangeMinUnit", { unit: referenceUnit }) : t("validRangeMin")}
          type="number"
          numberWidth="w-24"
          value={state.range_min}
          onChange={(v) => onChange({ ...state, range_min: v })}
          required
        />
        <WInput
          label={referenceUnit ? t("validRangeMaxUnit", { unit: referenceUnit }) : t("validRangeMax")}
          type="number"
          numberWidth="w-24"
          value={state.range_max}
          onChange={(v) => onChange({ ...state, range_max: v })}
          required
        />
      </div>

      <p className="text-xs text-gray-400">{t("modelDirectUncertaintyHint")}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 2 alternative — data_entry_mode="frequency_response": a sweep of
// (frequency, reference, measured[, offset]) rows, for sensors that deliver a
// signal in the frequency domain (accelerometers, microphones, etc). One
// settings row above a manual/CSV table reusing Step2's table UX.
// ---------------------------------------------------------------------------

function FrequencyResponseDataStep({
  rows, onRowsChange, settings, onSettingsChange, physicalQuantity, outputType,
  inputMode, onInputModeChange, csvError, onFileUpload, fileInputRef,
}: {
  rows: FreqRow[];
  onRowsChange: (r: FreqRow[]) => void;
  settings: FreqSweepSettings;
  onSettingsChange: (s: FreqSweepSettings) => void;
  physicalQuantity: string;
  outputType: string | null;
  inputMode: "manual" | "csv";
  onInputModeChange: (m: "manual" | "csv") => void;
  csvError: string | null;
  onFileUpload: (f: File) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations("assets.wizard");
  const [dragging, setDragging] = useState(false);

  const refUnitOpts = (() => {
    const base = getUnitsForQuantity(physicalQuantity);
    const opts = base.length > 0 ? base : [{ value: settings.reference_unit, label: settings.reference_unit }];
    return opts.some((u) => u.value === settings.reference_unit) ? opts : [{ value: settings.reference_unit, label: settings.reference_unit }, ...opts];
  })();
  const measUnitOpts = (() => {
    const fromOutput = outputType ? (getOutputUnits(outputType, physicalQuantity) ?? []) : [];
    const base = fromOutput.length > 0 ? fromOutput : getUnitsForQuantity(physicalQuantity);
    const opts = base.length > 0 ? base : [{ value: settings.measured_unit, label: settings.measured_unit }];
    return opts.some((u) => u.value === settings.measured_unit) ? opts : [{ value: settings.measured_unit, label: settings.measured_unit }, ...opts];
  })();
  const offsetUnitOpts = getUnitsForQuantity("angle");

  function updateRow(idx: number, key: keyof FreqRow, val: string) {
    const next = [...rows];
    next[idx] = { ...next[idx], [key]: val };
    onRowsChange(next);
  }

  function addRow() {
    onRowsChange([...rows, { frequency: "", reference: "", measured: "", offset: "" }]);
  }

  function removeRow(idx: number) {
    if (rows.length <= 2) return;
    onRowsChange(rows.filter((_, i) => i !== idx));
  }

  return (
    <div className="p-6 space-y-4">
      <p className="text-xs text-gray-400">{t("frequencyResponseHint")}</p>

      {/* Settings row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="flex flex-col gap-1">
          <WLabel text={t("frequencyUnit")} />
          <Select
            value={settings.frequency_unit}
            onChange={(v) => onSettingsChange({ ...settings, frequency_unit: v })}
            options={FREQUENCY_OUTPUT_UNITS}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <WLabel text={t("referenceUnit")} />
          <Select
            value={settings.reference_unit}
            onChange={(v) => onSettingsChange({ ...settings, reference_unit: v })}
            options={refUnitOpts}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <WLabel text={t("measuredUnit")} />
          <Select
            value={settings.measured_unit}
            onChange={(v) => onSettingsChange({ ...settings, measured_unit: v })}
            options={measUnitOpts}
            className="w-24"
          />
        </div>
        <div className="flex flex-col gap-1">
          <WLabel text={t("amplitudeType")} />
          <Select
            value={settings.amplitude_type}
            onChange={(v) => onSettingsChange({ ...settings, amplitude_type: v })}
            options={AMPLITUDE_TYPE_OPTIONS}
            className="w-32"
          />
        </div>
      </div>

      {/* Offset toggle */}
      <div className="flex items-center gap-3">
        <ToggleSwitch checked={settings.offset_enabled} onChange={(v) => onSettingsChange({ ...settings, offset_enabled: v })} size="sm" />
        <span className="text-xs text-og-text">{t("addOffsetLabel")}</span>
        {settings.offset_enabled && (
          <Select
            value={settings.offset_unit}
            onChange={(v) => onSettingsChange({ ...settings, offset_unit: v })}
            options={offsetUnitOpts}
            className="w-20"
          />
        )}
      </div>

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-og-surface-alt rounded-lg w-fit">
        {(["manual", "csv"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onInputModeChange(m)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              inputMode === m ? "bg-og-surface text-og-text shadow-xs" : "text-gray-400 hover:text-og-text"
            }`}
          >
            {m === "manual" ? t("manualEntry") : t("csvUpload")}
          </button>
        ))}
      </div>

      {inputMode === "manual" && (
        <div className="space-y-3">
          <div className="rounded-lg border border-og-border overflow-hidden overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-og-border bg-og-surface-alt">
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium w-10">#</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                    {t("frequency")} {settings.frequency_unit && <span className="font-mono ml-1">({settings.frequency_unit})</span>}
                  </th>
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                    {t("reference")} {settings.reference_unit && <span className="font-mono ml-1">({settings.reference_unit})</span>}
                  </th>
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                    {t("measured")} {settings.measured_unit && <span className="font-mono ml-1">({settings.measured_unit})</span>}
                  </th>
                  {settings.offset_enabled && (
                    <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                      {t("phase")} {settings.offset_unit && <span className="font-mono ml-1">({settings.offset_unit})</span>}
                    </th>
                  )}
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr key={i} className="border-b border-og-border last:border-b-0 hover:bg-og-surface-alt/50 transition-colors">
                    <td className="px-3 py-1.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                    <td className="px-2 py-1">
                      <NumberInput value={row.frequency} onChange={(v) => updateRow(i, "frequency", v)} placeholder="0.0" className="w-24" />
                    </td>
                    <td className="px-2 py-1">
                      <NumberInput value={row.reference} onChange={(v) => updateRow(i, "reference", v)} placeholder="0.0" className="w-24" />
                    </td>
                    <td className="px-2 py-1">
                      <NumberInput value={row.measured} onChange={(v) => updateRow(i, "measured", v)} placeholder="0.0" className="w-24" />
                    </td>
                    {settings.offset_enabled && (
                      <td className="px-2 py-1">
                        <NumberInput value={row.offset} onChange={(v) => updateRow(i, "offset", v)} placeholder="0.0" className="w-24" />
                      </td>
                    )}
                    <td className="px-2 py-1">
                      <button type="button" onClick={() => removeRow(i)} disabled={rows.length <= 2} className="p-1 rounded-sm text-gray-400 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors">
                        <TrashIcon size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button type="button" onClick={addRow} className="flex items-center gap-1.5 text-xs text-og-accent hover:text-og-accent-dark font-medium transition-colors">
            <PlusIcon size={13} />
            {t("addRow")}
          </button>
        </div>
      )}

      {inputMode === "csv" && (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              const file = e.dataTransfer.files[0];
              if (file) onFileUpload(file);
            }}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
              dragging ? "border-og-accent bg-og-accent/5" : "border-og-border-md hover:border-og-accent hover:bg-og-surface-alt"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); }}
            />
            <p className="text-sm font-medium text-og-text">{t("dropCsvHint")}</p>
            <p className="text-xs text-gray-400 mt-1">{t("freqCsvFormatHint")}</p>
          </div>
          {csvError && (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-900/30">
              <WarningIcon size={13} className="shrink-0 mt-0.5" />
              {csvError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 — Analysis & Results
// ---------------------------------------------------------------------------

function residualColor(residual: number, maxAbsResidual: number): string {
  const t = Math.min(Math.abs(residual) / (maxAbsResidual || 1), 1);
  const hue = Math.round(120 * (1 - t)); // green(120) → yellow(60) → red(0)
  return `hsl(${hue},80%,42%)`;
}

// The "Method" panel (raw_data's Polynomial Fit/Lookup Table/Custom Formula
// selector) — extracted so it can render once, shared, above a curve-fit
// As-Found/As-Left pair (both sides fit with the same method/degree/formula)
// as well as inside the single-dataset Step3.
function CalibrationMethodPanel({
  curveFitMethod, onCurveFitMethodChange, analyzeParams, onAnalyzeParamsChange,
  customFormulaTemplate, onCustomFormulaTemplateChange, customFormulaError, onCustomFormulaErrorChange,
}: {
  curveFitMethod: CalibrationMethod;
  onCurveFitMethodChange: (m: CalibrationMethod) => void;
  analyzeParams: AnalyzeParams;
  onAnalyzeParamsChange: (p: AnalyzeParams) => void;
  customFormulaTemplate: string;
  onCustomFormulaTemplateChange: (v: string) => void;
  customFormulaError: string | null;
  onCustomFormulaErrorChange: (e: string | null) => void;
}) {
  const t = useTranslations("assets.wizard");

  function setFormulaTemplate(template: string) {
    onCustomFormulaTemplateChange(template);
    if (template.trim() === "") { onCustomFormulaErrorChange(null); return; }
    try {
      validateFormulaTemplate(template);
      onCustomFormulaErrorChange(null);
    } catch {
      onCustomFormulaErrorChange(t("customFormulaInvalid"));
    }
  }
  const detectedParams = (() => {
    if (customFormulaTemplate.trim() === "" || customFormulaError) return [];
    try {
      return extractFormulaParameters(customFormulaTemplate);
    } catch {
      return [];
    }
  })();

  return (
    <div className="flex flex-col gap-3 p-4 bg-og-surface-alt rounded-xl border border-og-border">
      <p className="text-xs font-semibold text-og-text">{t("methodSectionTitle")}</p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1 w-56 shrink-0">
          <WLabel text={t("calibrationMethod")} tooltip={t("tips.calibrationMethodAnalysis")} docsHref={STAT_DOCS_LINKS.calibration_method} />
          <Select
            value={curveFitMethod}
            onChange={(v) => onCurveFitMethodChange(v as CalibrationMethod)}
            options={[
              { value: "polynomial_fit", label: t("calibrationMethodPolynomialFit") },
              { value: "lookup_table", label: t("calibrationMethodLookupTable") },
              { value: "custom_formula", label: t("calibrationMethodCustomFormula") },
            ]}
          />
        </div>
        {curveFitMethod === "polynomial_fit" && (
        <div className="flex flex-col gap-1 w-40">
          <WLabel text={t("regressionDegree")} tooltip={t("tips.regressionDegree")} docsHref={STAT_DOCS_LINKS.regression_degree} />
          <Select
            value={analyzeParams.poly_degree === null ? "auto" : String(analyzeParams.poly_degree)}
            onChange={(v) => onAnalyzeParamsChange({ ...analyzeParams, poly_degree: v === "auto" ? null : parseInt(v) })}
            options={[{ value: "auto", label: t("auto") }, ...[1, 2, 3, 4, 5].map((d) => ({ value: String(d), label: String(d) }))]}
          />
        </div>
        )}
        {curveFitMethod === "custom_formula" && (
        <div className="flex flex-col gap-1 flex-1 min-w-[220px]">
          <WInput
            label={t("customFormula")}
            value={customFormulaTemplate}
            onChange={setFormulaTemplate}
            placeholder={t("customFormulaPlaceholder")}
            required
            error={customFormulaError ?? undefined}
            tooltip={t("tips.customFormula")}
            docsHref={STAT_DOCS_LINKS.custom_formula_syntax}
          />
          {detectedParams.length > 0 && (
            <p className="text-[11px] text-gray-400">
              {t("detectedParameters", { params: detectedParams.join(", ") })}
            </p>
          )}
        </div>
        )}
      </div>
    </div>
  );
}

// The "Uncertainty calculation" panel (Type B budget inputs — Distribution,
// Confidence %, Sensor nominal accuracy, Reference standard uncertainty) —
// extracted so it can render once for the single-dataset case and once,
// shared, above an As-Found/As-Left pair (same channel/spec either side of
// the repair — see AsFoundAsLeftResults).
function UncertaintyCalculationPanel({
  analyzeParams, onAnalyzeParamsChange, result, referenceUnit, selectedChannel,
  includeSensorNominalUncertainty, onIncludeSensorNominalUncertaintyChange,
  sensorNominalUncertaintyManual, onSensorNominalUncertaintyManualChange,
  sensorNominalUncertaintyUnit,
  includeReferenceStandardManual, onIncludeReferenceStandardManualChange,
  referenceStandardAuto, referenceStandardAutoLoading, referenceAssetName,
  referenceStandardManualUncertainty, onReferenceStandardManualUncertaintyChange,
  referenceStandardManualUnit,
  referenceStandardManualCoverageFactor, onReferenceStandardManualCoverageFactorChange,
}: {
  analyzeParams: AnalyzeParams;
  onAnalyzeParamsChange: (p: AnalyzeParams) => void;
  result: AnalyzeResponse | null;
  referenceUnit: string;
  selectedChannel: SensorChannelFull | undefined;
  includeSensorNominalUncertainty: boolean;
  onIncludeSensorNominalUncertaintyChange: (v: boolean) => void;
  sensorNominalUncertaintyManual: string;
  onSensorNominalUncertaintyManualChange: (v: string) => void;
  sensorNominalUncertaintyUnit: string;
  includeReferenceStandardManual: boolean;
  onIncludeReferenceStandardManualChange: (v: boolean) => void;
  referenceStandardAuto: { expandedUncertainty: number; coverageFactor: number } | null;
  referenceStandardAutoLoading: boolean;
  referenceAssetName: string | null;
  referenceStandardManualUncertainty: string;
  onReferenceStandardManualUncertaintyChange: (v: string) => void;
  referenceStandardManualUnit: string;
  referenceStandardManualCoverageFactor: string;
  onReferenceStandardManualCoverageFactorChange: (v: string) => void;
}) {
  const t = useTranslations("assets.wizard");
  const setParam = <K extends keyof AnalyzeParams>(key: K) => (value: AnalyzeParams[K]) =>
    onAnalyzeParamsChange({ ...analyzeParams, [key]: value });

  function handleSensorNominalRefresh() {
    const def = sensorNominalAccuracyDefault(selectedChannel);
    if (def == null) return;
    onSensorNominalUncertaintyManualChange(String(def.value));
  }
  const sensorNominalDefault = sensorNominalAccuracyDefault(selectedChannel);

  return (
    <div className="flex flex-col gap-3 p-4 bg-og-surface-alt rounded-xl border border-og-border">
      <p className="text-xs font-semibold text-og-text">{t("uncertaintyCalculationTitle")}</p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1 min-w-[130px]">
          <div className="min-h-[32px] flex items-end"><WLabel text={t("distribution")} tooltip={t("tips.distribution")} docsHref={STAT_DOCS_LINKS.coverage_factor} /></div>
          <Select
            value={analyzeParams.distribution_type}
            onChange={(v) => setParam("distribution_type")(v as DistributionType)}
            options={[
              { value: "normal", label: t("distributionNormal") },
              { value: "t", label: t("distributionT") },
              { value: "chi_squared", label: t("distributionChiSquared") },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1 w-20">
          <div className="min-h-[32px] flex items-end">
            <WLabel text={t("confidencePercent")} tooltip={t("tips.confidencePercent")} docsHref={STAT_DOCS_LINKS.coverage_factor} className="max-w-20" />
          </div>
          <NumberInput
            value={String(analyzeParams.confidence_level)}
            onChange={(v) => setParam("confidence_level")(parseFloat(v) || 95)}
            min={50} max={99.99} step={0.5}
          />
          {result && (
            <span className="text-[10px] text-gray-400">{t("coverageFactorLabel", { value: fmtN(result.coverage_factor, 2) })}</span>
          )}
        </div>
        {/* Sensor nominal accuracy (Type B) — off by default: excluded
            entirely, no box shown. On: pre-filled from the channel's
            manufacturer spec (still freely editable; unit is fixed to
            whatever the channel's own spec is configured in, shown as
            plain text next to the box) and included in the budget. The
            contribution readout shows the real number the uncertainty
            budget currently attributes to this source. */}
        <div className="flex flex-col gap-1 w-40">
          <div className="min-h-[32px] flex items-end gap-1">
            <label className="flex items-center gap-1.5 min-w-0 text-xs text-gray-400 cursor-pointer">
              <ToggleSwitch checked={includeSensorNominalUncertainty} onChange={onIncludeSensorNominalUncertaintyChange} size="sm" />
              <WLabel text={t("sensorNominalAccuracy")} tooltip={t("tips.sensorNominalAccuracy")} docsHref={STAT_DOCS_LINKS.uncertainty_box_units} className="max-w-24" />
            </label>
            {includeSensorNominalUncertainty && sensorNominalDefault != null && (
              <button
                type="button"
                onClick={handleSensorNominalRefresh}
                title={t("refreshSensorNominalFromDatasheet")}
                className="text-gray-400 hover:text-og-text transition-colors shrink-0"
              >
                <RestoreIcon size={11} />
              </button>
            )}
          </div>
          {includeSensorNominalUncertainty && (
            <>
              <div className="flex items-center gap-1.5">
                <NumberInput
                  value={sensorNominalUncertaintyManual}
                  onChange={onSensorNominalUncertaintyManualChange}
                  min={0}
                  placeholder={t("fromDatasheet")}
                  className="w-20"
                />
                <span className="text-xs text-gray-400">{sensorNominalUncertaintyUnit}</span>
              </div>
              {(() => {
                const contribution = result?.uncertainty_budget.find((c) => c.source === "sensor_nominal_accuracy");
                return contribution ? (
                  <span className="text-[10px] text-gray-400">{t("usedInBudget", { value: `${fmtN(contribution.standard_uncertainty)} ${referenceUnit}` })}</span>
                ) : null;
              })()}
            </>
          )}
        </div>
        {/* Reference standard uncertainty (Type B) — off by default:
            excluded entirely, no box shown (even when a reference asset
            would auto-fetch a value). On: the auto-fetched certificate
            value when available, else a manual box (unit fixed to
            referenceUnit, shown as plain text next to the box). */}
        <div className="flex flex-col gap-1 w-56">
          <div className="min-h-[32px] flex items-end gap-3">
            <label className="flex items-center gap-1.5 min-w-0 text-xs text-gray-400 cursor-pointer">
              <ToggleSwitch checked={includeReferenceStandardManual} onChange={onIncludeReferenceStandardManualChange} size="sm" />
              <WLabel text={t("refStandardU")} tooltip={t("tips.refStandardUManual")} docsHref={STAT_DOCS_LINKS.uncertainty_box_units} className="max-w-24" />
            </label>
            {includeReferenceStandardManual && !referenceStandardAutoLoading && !referenceStandardAuto
              && referenceStandardManualUncertainty.trim() !== "" && (
              <WLabel text={t("refStdK")} tooltip={t("tips.refStdK")} docsHref={STAT_DOCS_LINKS.coverage_factor} />
            )}
          </div>
          {includeReferenceStandardManual && (
            referenceStandardAutoLoading ? (
              <span className="text-xs text-gray-400 flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
                {t("loadingReferenceStandard")}
              </span>
            ) : referenceStandardAuto ? (
              <span className="text-xs text-gray-400">
                <span className="font-mono text-og-text">{fmtN(referenceStandardAuto.expandedUncertainty)}</span> {referenceUnit}
                {referenceAssetName && <span className="text-gray-400"> {t("lastCalibrationOf", { name: referenceAssetName })}</span>}
              </span>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <div className="flex items-center gap-1.5">
                    <NumberInput
                      value={referenceStandardManualUncertainty}
                      onChange={onReferenceStandardManualUncertaintyChange}
                      min={0}
                      placeholder={t("fromCert")}
                      className="w-20"
                    />
                    <span className="text-xs text-gray-400">{referenceStandardManualUnit}</span>
                  </div>
                  {referenceStandardManualUncertainty.trim() !== "" && (
                    <NumberInput
                      value={referenceStandardManualCoverageFactor}
                      onChange={onReferenceStandardManualCoverageFactorChange}
                      min={1} max={5} step={0.1}
                      className="w-14"
                    />
                  )}
                </div>
                {(() => {
                  const contribution = result?.uncertainty_budget.find((c) => c.source === "reference_standard");
                  return contribution ? (
                    <span className="text-[10px] text-gray-400">{t("usedInBudget", { value: `${fmtN(contribution.standard_uncertainty)} ${referenceUnit}` })}</span>
                  ) : null;
                })()}
              </>
            )
          )}
        </div>
      </div>
    </div>
  );
}

// The "Conformity assessment" panel (decision rule + Error/Uncertainty/
// Tolerance boxes + CONFORMS badge) — used for the single-dataset case.
// As-Found/As-Left uses a decomposed pair instead (ConformityCriteriaSelector
// shared above both sides + a per-side ConformityCriteriaReadout below,
// since only the decision rule/tolerance *settings* are shared there — the
// actual Error/Uncertainty numbers differ per side).
function ConformityAssessmentPanel({
  result, referenceUnit, selectedChannel, decisionRule, onDecisionRuleChange,
  toleranceOverrideValue, onToleranceOverrideValueChange, includeSensorNominalUncertainty,
}: {
  result: AnalyzeResponse | null;
  referenceUnit: string;
  selectedChannel: SensorChannelFull | undefined;
  decisionRule: DecisionRule;
  onDecisionRuleChange: (v: DecisionRule) => void;
  toleranceOverrideValue: string;
  onToleranceOverrideValueChange: (v: string) => void;
  // Tolerance mirrors Sensor nominal accuracy (and locks) while that switch
  // is on — see the calling scope's own sync effect, which is what actually
  // keeps toleranceOverrideValue in sync; this panel only reflects the
  // locked *display* state.
  includeSensorNominalUncertainty: boolean;
}) {
  const t = useTranslations("assets.wizard");
  const tDecisionRule = useTranslations("tokens.decisionRule");

  function handleToleranceRefresh() {
    const def = channelToleranceDefault(selectedChannel, referenceUnit);
    if (def != null) onToleranceOverrideValueChange(String(def));
  }
  const toleranceDefault = channelToleranceDefault(selectedChannel, referenceUnit);

  return (
    <div className="flex flex-col gap-3 p-4 bg-og-surface-alt rounded-xl border border-og-border">
      <p className="text-xs font-semibold text-og-text">{t("conformityAssessmentTitle")}</p>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="flex flex-col gap-1 w-56 shrink-0">
            <WLabel text={t("decisionRuleLabel")} tooltip={t("tips.decisionRuleCert")} docsHref={STAT_DOCS_LINKS.decision_rule} />
            <Select
              value={decisionRule}
              onChange={(v) => onDecisionRuleChange(v as DecisionRule)}
              options={[
                { value: "simple_acceptance", label: tDecisionRule("simple_acceptance") },
                { value: "guard_band_w_uncertainty", label: tDecisionRule("guard_band_w_uncertainty") },
                { value: "shared_risk", label: tDecisionRule("shared_risk") },
              ]}
            />
          </div>
          <div className="flex flex-col gap-1">
            <div className="flex flex-wrap items-end gap-1.5">
              <div className="flex flex-col gap-1">
                <WLabel text={t("errorValueLabel")} tooltip={t("tips.errorValueBox")} docsHref={STAT_DOCS_LINKS.conformity_boxes} className="max-w-20" />
                <div className={`${IB} border-og-border-md bg-og-surface text-og-text font-mono text-right w-20 py-1.5`}>
                  {result ? fmtN(result.max_error) : "–"}
                </div>
              </div>
              <span className="text-xs text-gray-400 pb-2">{referenceUnit}</span>
              {decisionRule !== "simple_acceptance" && (
                <>
                  <span className="text-sm text-gray-400 pb-2 px-0.5">{decisionRule === "guard_band_w_uncertainty" ? "+" : "−"}</span>
                  <div className="flex flex-col gap-1">
                    <WLabel text={t("uncertaintyValueLabel")} tooltip={t("tips.uncertaintyValueBox")} docsHref={STAT_DOCS_LINKS.conformity_boxes} className="max-w-20" />
                    <div className={`${IB} border-og-border-md bg-og-surface text-og-text font-mono text-right w-20 py-1.5`}>
                      {result?.conformity_statement.expanded_uncertainty_applied != null ? fmtN(result.conformity_statement.expanded_uncertainty_applied) : "–"}
                    </div>
                  </div>
                  <span className="text-xs text-gray-400 pb-2">{referenceUnit}</span>
                </>
              )}
              <span className="text-sm text-gray-400 pb-2 px-0.5">≤</span>
              <div className="flex flex-col gap-1 w-20">
                <div className="flex items-center gap-1">
                  <WLabel text={t("toleranceValueLabel")} tooltip={t("tips.toleranceValueBox")} docsHref={STAT_DOCS_LINKS.conformity_boxes} className="max-w-16" />
                  {toleranceDefault != null && !includeSensorNominalUncertainty && (
                    <button
                      type="button"
                      onClick={handleToleranceRefresh}
                      title={t("refreshToleranceFromNominal")}
                      className="text-gray-400 hover:text-og-text transition-colors shrink-0"
                    >
                      <RestoreIcon size={11} />
                    </button>
                  )}
                </div>
                <NumberInput
                  value={toleranceOverrideValue}
                  onChange={onToleranceOverrideValueChange}
                  min={0}
                  disabled={includeSensorNominalUncertainty}
                  title={includeSensorNominalUncertainty ? t("toleranceLockedFromSensorAccuracy") : undefined}
                />
              </div>
              <span className="text-xs text-gray-400 pb-2">{referenceUnit}</span>
            </div>
          </div>
        </div>
        {result?.conformity_statement.tolerance_value != null && (
          <span className={`flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
            result.passed
              ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50"
              : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:border-red-900/50"
          }`}>
            {result.passed ? <CheckIcon size={12} /> : <WarningIcon size={12} />}
            {result.passed ? t("conforms") : t("doesNotConform")}
          </span>
        )}
      </div>
    </div>
  );
}

// The "conformity criteria" — decision rule + tolerance override — shared
// across both sides of an As-Found/As-Left pair (same channel/spec either
// side of a repair): only the *settings* half of a Conformity assessment.
// Each side's own Error/Uncertainty/Tolerance readout is a separate
// ConformityCriteriaReadout below, since only those numbers (computed from
// each side's own AnalyzeResponse) actually differ per side.
function ConformityCriteriaSelector({
  decisionRule, onDecisionRuleChange,
  toleranceOverrideValue, onToleranceOverrideValueChange,
  toleranceDefault, includeSensorNominalUncertainty, referenceUnit,
}: {
  decisionRule: DecisionRule;
  onDecisionRuleChange: (v: DecisionRule) => void;
  toleranceOverrideValue: string;
  onToleranceOverrideValueChange: (v: string) => void;
  toleranceDefault: number | null;
  includeSensorNominalUncertainty: boolean;
  referenceUnit: string;
}) {
  const t = useTranslations("assets.wizard");
  const tDecisionRule = useTranslations("tokens.decisionRule");

  function handleToleranceRefresh() {
    if (toleranceDefault != null) onToleranceOverrideValueChange(String(toleranceDefault));
  }

  return (
    <div className="flex flex-col gap-3 p-4 bg-og-surface-alt rounded-xl border border-og-border">
      <p className="text-xs font-semibold text-og-text">{t("conformityCriteriaTitle")}</p>
      <div className="flex flex-wrap items-start gap-3">
        <div className="flex flex-col gap-1 w-56 shrink-0">
          <WLabel text={t("decisionRuleLabel")} tooltip={t("tips.decisionRuleCert")} docsHref={STAT_DOCS_LINKS.decision_rule} />
          <Select
            value={decisionRule}
            onChange={(v) => onDecisionRuleChange(v as DecisionRule)}
            options={[
              { value: "simple_acceptance", label: tDecisionRule("simple_acceptance") },
              { value: "guard_band_w_uncertainty", label: tDecisionRule("guard_band_w_uncertainty") },
              { value: "shared_risk", label: tDecisionRule("shared_risk") },
            ]}
          />
        </div>
        <div className="flex flex-col gap-1 w-20">
          <div className="flex items-center gap-1">
            <WLabel text={t("toleranceValueLabel")} tooltip={t("tips.toleranceValueBox")} docsHref={STAT_DOCS_LINKS.conformity_boxes} className="max-w-16" />
            {toleranceDefault != null && !includeSensorNominalUncertainty && (
              <button
                type="button"
                onClick={handleToleranceRefresh}
                title={t("refreshToleranceFromNominal")}
                className="text-gray-400 hover:text-og-text transition-colors shrink-0"
              >
                <RestoreIcon size={11} />
              </button>
            )}
          </div>
          <NumberInput
            value={toleranceOverrideValue}
            onChange={onToleranceOverrideValueChange}
            min={0}
            disabled={includeSensorNominalUncertainty}
            title={includeSensorNominalUncertainty ? t("toleranceLockedFromSensorAccuracy") : undefined}
          />
          <span className="text-[10px] text-gray-400">{referenceUnit}</span>
        </div>
      </div>
    </div>
  );
}

// The read-only "[error] ± [uncertainty] ≤ [tolerance]" criteria expression
// plus the CONFORMS/DOES NOT CONFORM badge, computed from one specific
// AnalyzeResponse — the per-side counterpart to a shared
// ConformityCriteriaSelector above (decision rule and tolerance come from
// there; Tolerance is mirrored read-only here purely so the full expression
// reads at a glance alongside that side's own Error/Uncertainty numbers).
function ConformityCriteriaReadout({
  result, referenceUnit, decisionRule,
}: {
  result: AnalyzeResponse | null;
  referenceUnit: string;
  decisionRule: DecisionRule;
}) {
  const t = useTranslations("assets.wizard");
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-og-surface-alt rounded-xl border border-og-border">
      <div className="flex flex-wrap items-end gap-1.5">
        <div className="flex flex-col gap-1">
          <WLabel text={t("errorValueLabel")} tooltip={t("tips.errorValueBox")} docsHref={STAT_DOCS_LINKS.conformity_boxes} className="max-w-20" />
          <div className={`${IB} border-og-border-md bg-og-surface text-og-text font-mono text-right w-20 py-1.5`}>
            {result ? fmtN(result.max_error) : "–"}
          </div>
        </div>
        <span className="text-xs text-gray-400 pb-2">{referenceUnit}</span>
        {decisionRule !== "simple_acceptance" && (
          <>
            <span className="text-sm text-gray-400 pb-2 px-0.5">{decisionRule === "guard_band_w_uncertainty" ? "+" : "−"}</span>
            <div className="flex flex-col gap-1">
              <WLabel text={t("uncertaintyValueLabel")} tooltip={t("tips.uncertaintyValueBox")} docsHref={STAT_DOCS_LINKS.conformity_boxes} className="max-w-20" />
              <div className={`${IB} border-og-border-md bg-og-surface text-og-text font-mono text-right w-20 py-1.5`}>
                {result?.conformity_statement.expanded_uncertainty_applied != null ? fmtN(result.conformity_statement.expanded_uncertainty_applied) : "–"}
              </div>
            </div>
            <span className="text-xs text-gray-400 pb-2">{referenceUnit}</span>
          </>
        )}
        <span className="text-sm text-gray-400 pb-2 px-0.5">≤</span>
        <div className="flex flex-col gap-1">
          <WLabel text={t("toleranceValueLabel")} tooltip={t("tips.toleranceValueBox")} docsHref={STAT_DOCS_LINKS.conformity_boxes} className="max-w-16" />
          <div className={`${IB} border-og-border-md bg-og-surface text-og-text font-mono text-right w-20 py-1.5`}>
            {result?.conformity_statement.tolerance_value != null ? fmtN(result.conformity_statement.tolerance_value) : "–"}
          </div>
        </div>
        <span className="text-xs text-gray-400 pb-2">{referenceUnit}</span>
      </div>
      {result?.conformity_statement.tolerance_value != null && (
        <span className={`flex items-center gap-1 px-2 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
          result.passed
            ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50"
            : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:border-red-900/50"
        }`}>
          {result.passed ? <CheckIcon size={12} /> : <WarningIcon size={12} />}
          {result.passed ? t("conforms") : t("doesNotConform")}
        </span>
      )}
    </div>
  );
}

// The "Statistics" panel (valid range, R²/RMSE/max error/repeatability/
// hysteresis, uncertainty budget rows, combined/expanded uncertainty) —
// extracted so it can render independently per side of an As-Found/As-Left
// pair as well as once for the single-dataset case. Deliberately excludes
// the chart/table toggle next to it in Step3 — that stays Step3-specific
// (the curve overlay only makes sense for a single dataset at a time).
function StatisticsPanel({
  result, referenceUnit, measuredUnit, secondColumnLabel, isModelDirect, isRawData, className,
}: {
  result: AnalyzeResponse;
  referenceUnit: string;
  measuredUnit: string;
  secondColumnLabel: string;
  isModelDirect: boolean;
  isRawData: boolean;
  className?: string;
}) {
  const t = useTranslations("assets.wizard");
  const tUncertaintySource = useTranslations("tokens.uncertaintySource");
  return (
    <div className={`rounded-xl border border-og-border p-4 bg-og-surface-alt ${className ?? ""}`}>
      <p className="text-xs font-semibold text-og-text mb-2">{t("calibration")}</p>
      <StatRow
        label={`${t("validRange")} (${secondColumnLabel})`}
        value={`${fmtN(Math.min(...result.points.map((p) => p.measured_value)))} ${t("to")} ${fmtN(Math.max(...result.points.map((p) => p.measured_value)))} ${measuredUnit}`}
        tip={t("tips.validRange")}
      />
      <StatRow
        label={`${t("validRange")} (${t("reference")})`}
        value={`${fmtN(result.valid_range_min)} ${t("to")} ${fmtN(result.valid_range_max)} ${referenceUnit}`}
        tip={t("tips.validRange")}
      />
      {/* model_direct's "residuals" are two synthetic zero-error corner
          points — a trivial artifact (1.0, 0, 0, 0%…), not real statistics.
          Lookup Table has the same problem but is excluded entirely by the
          caller, before reaching this panel. Only reference_vs_indicated
          (real, fit-free residuals) and raw_data's Polynomial Fit/Custom
          Formula methods (real, fitted residuals) show them. */}
      {!isModelDirect && (
        <>
          <p className="text-xs font-semibold text-og-text pt-3 border-t border-og-border mb-2">{t("statistics")}</p>
          <StatRow label={t("rSquared")} value={fmtN(result.r_squared, 6)} tip={t("tips.rSquared")} docsHref={STAT_DOCS_LINKS.r_squared} />
          <StatRow label={t("rmse")} value={`${fmtN(result.rmse)} ${referenceUnit}`} tip={t("tips.rmse")} docsHref={STAT_DOCS_LINKS.rmse} />
          <StatRow label={t("maxError")} value={`${fmtN(result.max_error)} ${referenceUnit}`} tip={t("tips.maxError")} docsHref={STAT_DOCS_LINKS.max_error} />
          <StatRow label={t("fsError")} value={`${fmtN(result.full_scale_error_pct, 3)}%`} tip={t("tips.fsError")} docsHref={STAT_DOCS_LINKS.full_scale_error} />
          {isRawData && (
            <StatRow label={t("nonLinearity")} value={`${fmtN(result.non_linearity_pct, 3)}%`} tip={t("tips.nonLinearity")} docsHref={STAT_DOCS_LINKS.non_linearity} />
          )}
          {result.repeatability != null && (
            <StatRow label={t("repeatability")} value={`${fmtN(result.repeatability)} ${referenceUnit}`} tip={t("tips.repeatability")} docsHref={STAT_DOCS_LINKS.repeatability} />
          )}
          {result.hysteresis != null && (
            <StatRow label={t("hysteresis")} value={`${fmtN(result.hysteresis)} ${referenceUnit}`} tip={t("tips.hysteresis")} docsHref={STAT_DOCS_LINKS.hysteresis} />
          )}
        </>
      )}
      <p className="text-xs font-semibold text-og-text pt-3 border-t border-og-border mb-2">{t("uncertaintyBudget")}</p>
      {result.uncertainty_budget.map((c) => (
        <StatRow
          key={c.source}
          label={translateDynamic(tUncertaintySource, c.source)}
          value={`${fmtN(c.standard_uncertainty)} ${referenceUnit}`}
          tip={t("tips.uncertaintyBudgetRow", { description: c.description, distribution: c.distribution, divisor: fmtN(c.divisor, 3) })}
          docsHref={STAT_DOCS_LINKS.uncertainty_budget_row}
        />
      ))}
      <StatRow
        label={t("combinedRss")}
        value={`${fmtN(result.combined_uncertainty)} ${referenceUnit}`}
        tip={t("tips.combinedRss")}
        docsHref={STAT_DOCS_LINKS.combined_uncertainty}
      />
      <StatRow
        label={t("expanded")}
        value={`${fmtN(roundToSigFigs(result.expanded_uncertainty, 2))} ${referenceUnit}`}
        tip={
          (result.effective_degrees_of_freedom != null
            ? t("tips.expandedWithDof", { k: fmtN(result.coverage_factor, 3), confidence: result.confidence_level, dof: fmtN(result.effective_degrees_of_freedom, 1) })
            : t("tips.expandedNoDof", { k: fmtN(result.coverage_factor, 3), confidence: result.confidence_level }))
          + " " + t("tips.expandedRoundedCert")
        }
        docsHref={STAT_DOCS_LINKS.expanded_uncertainty}
      />
    </div>
  );
}

function Step3({
  analyzeParams, onAnalyzeParamsChange, result, analyzing, analyzeError,
  referenceUnit, measuredUnit, hoveredPointIdx, onHoverPoint, dataEntryMode, manualCoeff,
  selectedChannel,
  includeSensorNominalUncertainty, onIncludeSensorNominalUncertaintyChange,
  sensorNominalUncertaintyManual, onSensorNominalUncertaintyManualChange,
  sensorNominalUncertaintyUnit,
  decisionRule, onDecisionRuleChange,
  toleranceOverrideValue, onToleranceOverrideValueChange,
  includeReferenceStandardManual, onIncludeReferenceStandardManualChange,
  referenceStandardAuto, referenceStandardAutoLoading, referenceAssetName,
  referenceStandardManualUncertainty, onReferenceStandardManualUncertaintyChange,
  referenceStandardManualUnit,
  referenceStandardManualCoverageFactor, onReferenceStandardManualCoverageFactorChange,
  curveFitMethod, onCurveFitMethodChange,
  rawCustomFormulaTemplate, onRawCustomFormulaTemplateChange,
  rawCustomFormulaError, onRawCustomFormulaErrorChange,
}: {
  state: Step1State;
  analyzeParams: AnalyzeParams;
  onAnalyzeParamsChange: (p: AnalyzeParams) => void;
  result: AnalyzeResponse | null;
  analyzing: boolean;
  analyzeError: string | null;
  referenceUnit: string;
  measuredUnit: string;
  hoveredPointIdx: number | null;
  onHoverPoint: (i: number | null) => void;
  dataEntryMode: DataEntryMode;
  manualCoeff: ManualCoeffState;
  selectedChannel: SensorChannelFull | undefined;
  includeSensorNominalUncertainty: boolean;
  onIncludeSensorNominalUncertaintyChange: (v: boolean) => void;
  sensorNominalUncertaintyManual: string;
  onSensorNominalUncertaintyManualChange: (v: string) => void;
  sensorNominalUncertaintyUnit: string;
  decisionRule: DecisionRule;
  onDecisionRuleChange: (v: DecisionRule) => void;
  toleranceOverrideValue: string;
  onToleranceOverrideValueChange: (v: string) => void;
  includeReferenceStandardManual: boolean;
  onIncludeReferenceStandardManualChange: (v: boolean) => void;
  referenceStandardAuto: { expandedUncertainty: number; coverageFactor: number } | null;
  referenceStandardAutoLoading: boolean;
  referenceAssetName: string | null;
  referenceStandardManualUncertainty: string;
  onReferenceStandardManualUncertaintyChange: (v: string) => void;
  referenceStandardManualUnit: string;
  referenceStandardManualCoverageFactor: string;
  onReferenceStandardManualCoverageFactorChange: (v: string) => void;
  curveFitMethod: CalibrationMethod;
  onCurveFitMethodChange: (m: CalibrationMethod) => void;
  rawCustomFormulaTemplate: string;
  onRawCustomFormulaTemplateChange: (v: string) => void;
  rawCustomFormulaError: string | null;
  onRawCustomFormulaErrorChange: (e: string | null) => void;
}) {
  const t = useTranslations("assets.wizard");
  const [rightView, setRightView] = useState<"chart" | "table">("chart");
  const plotDivRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import("plotly.js-dist-min").default | null>(null);

  const isRawData = dataEntryMode === "raw_data";
  const isModelDirect = dataEntryMode === "model_direct";
  const isRefVsIndicated = dataEntryMode === "reference_vs_indicated";
  // Reference vs Indicated compares against what the instrument's own
  // display shows — a physical-quantity reading, not the raw measured
  // signal — so its second column reads "Indicated" everywhere, not
  // "Measured" (table header, chart axis/tooltip, valid-range label).
  const secondColumnLabel = isRefVsIndicated ? t("indicatedValue") : t("measured");
  // Only raw_data ever fits a curve — model_direct's "residuals" are the two
  // synthetic zero-error corner points (see the model_direct useEffect), and
  // reference_vs_indicated has no transference function at all.
  const showCurveChart = isRawData;
  // model_direct has no real points to plot/tabulate at all.
  const showChartPanel = !isModelDirect;
  const isLookupTable = isRawData && curveFitMethod === "lookup_table";

  useEffect(() => {
    if (!result) return;
    if (rightView !== "chart") return;
    const div = plotDivRef.current;
    if (!div) return;
    let mounted = true;

    const maxAbs = Math.max(...result.points.map((p) => Math.abs(p.residual_abs ?? 0)), 1e-10);
    const xs = result.points.map((p) => p.measured_value);
    const mn = Math.min(...xs), mx = Math.max(...xs);

    const scatter = result.points.map((p) => ({
      x: p.measured_value,
      y: p.reference_value,
      color: residualColor(p.residual_abs ?? 0, maxAbs),
      residual: p.residual_abs ?? 0,
      idx: p.point_index,
    }));

    // Lookup Table has no coefficients/formula — the model *is* the
    // calibration's own points, linearly interpolated (evaluateModel's
    // "lookup_table" branch); Custom Formula reads the resolved (fitted)
    // formula the server already returned.
    const modelType: ModelType =
      curveFitMethod === "lookup_table" ? "lookup_table"
      : curveFitMethod === "custom_formula" ? "custom_formula"
      : "polynomial";
    const lookupPoints = result.points.map((p) => ({ x: p.measured_value, y: p.reference_value }));
    const curve = Array.from({ length: 81 }, (_, i) => {
      const x = mn + (i * (mx - mn)) / 80;
      return { x, y: evaluateModel(modelType, result.coefficients, result.resolved_custom_formula ?? null, x, lookupPoints) };
    });

    import("plotly.js-dist-min").then((mod) => {
      if (!mounted || !div) return;
      const Plotly = mod.default;
      plotlyRef.current = Plotly;

      const traces: Plotly.Data[] = [
        {
          x: curve.map((d) => d.x),
          y: curve.map((d) => d.y),
          type: "scatter",
          mode: "lines",
          line: { color: COLORS.accent, width: 2 },
          hoverinfo: "skip",
          showlegend: false,
        },
        {
          x: scatter.map((d) => d.x),
          y: scatter.map((d) => d.y),
          type: "scatter",
          mode: "markers",
          marker: {
            color: scatter.map((d) => d.color),
            size: 9,
            line: { color: "rgba(255,255,255,0.5)", width: 1.5 },
          },
          customdata: scatter.map((d) => [d.idx + 1, d.residual] as [number, number]),
          hovertemplate:
            `<b>${t("hoverPoint")} %{customdata[0]}</b><br>` +
            `${secondColumnLabel}: %{x:.4g} ${measuredUnit}<br>` +
            `${t("reference")}: %{y:.4g} ${referenceUnit}<br>` +
            `${t("residual")}: %{customdata[1]:.4g} ${referenceUnit}` +
            `<extra></extra>`,
          showlegend: false,
        },
      ];

      const layout: Partial<Plotly.Layout> = {
        margin: { t: 10, r: 16, b: 48, l: 56 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        xaxis: {
          title: { text: `${secondColumnLabel} (${measuredUnit})`, font: { size: 10, color: "#9ca3af" } },
          tickfont: { size: 10, color: "#9ca3af" },
          gridcolor: "rgba(156,163,175,0.15)",
          linecolor: "rgba(156,163,175,0.3)",
          zerolinecolor: "rgba(156,163,175,0.3)",
          automargin: true,
        },
        yaxis: {
          title: { text: `${t("reference")} (${referenceUnit})`, font: { size: 10, color: "#9ca3af" } },
          tickfont: { size: 10, color: "#9ca3af" },
          gridcolor: "rgba(156,163,175,0.15)",
          linecolor: "rgba(156,163,175,0.3)",
          zerolinecolor: "rgba(156,163,175,0.3)",
          automargin: true,
        },
        hoverlabel: {
          bgcolor: "#1f2937",
          bordercolor: "#374151",
          font: { size: 11, color: "#f9fafb" },
        },
      };

      const config: Partial<Plotly.Config> = {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "select2d", "lasso2d", "hoverClosestCartesian", "hoverCompareCartesian", "toggleSpikelines"],
        scrollZoom: true,
      };

      Plotly.react(div, traces, layout, config);
    });

    return () => {
      mounted = false;
    };
  }, [result, measuredUnit, referenceUnit, rightView, curveFitMethod, secondColumnLabel]);

  useEffect(() => {
    const div = plotDivRef.current;
    return () => {
      if (plotlyRef.current && div) {
        try { plotlyRef.current.purge(div); } catch {}
      }
    };
  }, []);

  return (
    <div className="p-5 space-y-4">
      {/* Controls — split by function: Method (how raw data becomes a
          model), Uncertainty calculation (Type B budget inputs), Conformity
          assessment (decision rule + the numbers it's evaluated against). */}
      <div className="flex flex-col gap-3">
        {isRawData && (
          <CalibrationMethodPanel
            curveFitMethod={curveFitMethod}
            onCurveFitMethodChange={onCurveFitMethodChange}
            analyzeParams={analyzeParams}
            onAnalyzeParamsChange={onAnalyzeParamsChange}
            customFormulaTemplate={rawCustomFormulaTemplate}
            onCustomFormulaTemplateChange={onRawCustomFormulaTemplateChange}
            customFormulaError={rawCustomFormulaError}
            onCustomFormulaErrorChange={onRawCustomFormulaErrorChange}
          />
        )}

        {/* Hidden for Lookup Table: an exact interpolant's own results panel
            doesn't show uncertainty/statistics either (see the results
            section below), so there's nothing for these inputs to feed
            visibly. */}
        {!isLookupTable && (
          <UncertaintyCalculationPanel
            analyzeParams={analyzeParams}
            onAnalyzeParamsChange={onAnalyzeParamsChange}
            result={result}
            referenceUnit={referenceUnit}
            selectedChannel={selectedChannel}
            includeSensorNominalUncertainty={includeSensorNominalUncertainty}
            onIncludeSensorNominalUncertaintyChange={onIncludeSensorNominalUncertaintyChange}
            sensorNominalUncertaintyManual={sensorNominalUncertaintyManual}
            onSensorNominalUncertaintyManualChange={onSensorNominalUncertaintyManualChange}
            sensorNominalUncertaintyUnit={sensorNominalUncertaintyUnit}
            includeReferenceStandardManual={includeReferenceStandardManual}
            onIncludeReferenceStandardManualChange={onIncludeReferenceStandardManualChange}
            referenceStandardAuto={referenceStandardAuto}
            referenceStandardAutoLoading={referenceStandardAutoLoading}
            referenceAssetName={referenceAssetName}
            referenceStandardManualUncertainty={referenceStandardManualUncertainty}
            onReferenceStandardManualUncertaintyChange={onReferenceStandardManualUncertaintyChange}
            referenceStandardManualUnit={referenceStandardManualUnit}
            referenceStandardManualCoverageFactor={referenceStandardManualCoverageFactor}
            onReferenceStandardManualCoverageFactorChange={onReferenceStandardManualCoverageFactorChange}
          />
        )}

        {/* Not shown for Lookup Table: the entered points are exact by
            construction, so comparing them to a spec is trivially always
            true and not a meaningful conformity check (see the Linearity
            deviation chart below instead). */}
        {!isLookupTable && (
          <ConformityAssessmentPanel
            result={result}
            referenceUnit={referenceUnit}
            selectedChannel={selectedChannel}
            decisionRule={decisionRule}
            onDecisionRuleChange={onDecisionRuleChange}
            toleranceOverrideValue={toleranceOverrideValue}
            onToleranceOverrideValueChange={onToleranceOverrideValueChange}
            includeSensorNominalUncertainty={includeSensorNominalUncertainty}
          />
        )}

        {analyzing && (
          <div className="flex items-center gap-2 text-xs text-gray-400 pt-2">
            <span className="w-3.5 h-3.5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
            {t("analyzing")}
          </div>
        )}
      </div>

      {/* Model display — raw_data's Polynomial Fit/Custom Formula methods
          show the fitted model, model_direct shows the declared model
          (formula-aware); reference_vs_indicated has no transference
          function, and Lookup Table has no model at all (the points
          themselves are the model — no panel needed). */}
      {result && !analyzing && isRawData && !isLookupTable && (
        <ModelPanel
          isPolynomial={curveFitMethod === "polynomial_fit"}
          degree={result.poly_degree ?? 0}
          coefficients={result.coefficients}
          formulaTemplate={curveFitMethod === "custom_formula" ? rawCustomFormulaTemplate : null}
          formulaParamValues={result.custom_formula_parameter_values ?? null}
        />
      )}
      {result && !analyzing && isModelDirect && (
        <ModelPanel
          isPolynomial={manualCoeff.model_type === "polynomial"}
          degree={manualCoeff.poly_order}
          coefficients={manualCoeff.coefficients.map((c) => parseFloat(c))}
          formulaTemplate={manualCoeff.model_type === "custom_formula" ? manualCoeff.custom_formula_template : null}
          formulaParamValues={
            manualCoeff.model_type === "custom_formula"
              ? Object.fromEntries(Object.entries(manualCoeff.custom_formula_params).map(([k, v]) => [k, parseFloat(v)]))
              : null
          }
        />
      )}

      {analyzeError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900/30">
          <WarningIcon size={13} />
          {analyzeError}
        </div>
      )}

      {/* Lookup Table: the fit-statistics/uncertainty-budget/conformity panel
          isn't shown here — an exact interpolant's residuals are ~0 by
          construction, so there's nothing informative in it (the same
          numbers are still on the certificate, see the Uncertainty
          calculation panel above). Instead show the calibration's own
          points (the model itself) alongside the interpolated curve. */}
      {result && !analyzing && isLookupTable && (
        <div className="flex gap-4 min-h-0">
          <div className="w-[40%] shrink-0 rounded-xl border border-og-border overflow-hidden" style={{ maxHeight: 440, overflowY: "auto" }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-og-border bg-og-surface-alt">
                  {[
                    "#",
                    `${t("measured")} (${measuredUnit})`,
                    `${t("reference")} (${referenceUnit})`,
                  ].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.points.map((pt) => (
                  <tr
                    key={pt.point_index}
                    onMouseEnter={() => onHoverPoint(pt.point_index)}
                    onMouseLeave={() => onHoverPoint(null)}
                    className={`border-b border-og-border last:border-b-0 cursor-default transition-colors ${
                      hoveredPointIdx === pt.point_index ? "bg-og-accent/10" : "hover:bg-og-surface-alt/50"
                    }`}
                  >
                    <td className="px-3 py-1.5 font-mono text-gray-400">{pt.point_index + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-og-text">{fmtN(pt.measured_value)}</td>
                    <td className="px-3 py-1.5 font-mono text-og-text">{fmtN(pt.reference_value)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex-1 min-w-0 flex flex-col gap-3" style={{ minHeight: 440 }}>
            <div className="flex-1 min-h-0 rounded-xl border border-og-border bg-og-surface relative overflow-hidden">
              <div ref={plotDivRef} style={{ height: "100%", width: "100%" }} />
            </div>
            <LinearityDeviationChart
              className="flex-1 min-h-0"
              points={computeLinearityDeviation(result.points.map((p) => ({ x: p.measured_value, y: p.reference_value })))}
              markerPoints={computeLinearityDeviationAtPoints(result.points.map((p) => ({ x: p.measured_value, y: p.reference_value })))}
              measuredUnit={measuredUnit}
              referenceUnit={referenceUnit}
              measuredLabel={t("measured")}
              deviationLabel={t("linearityDeviation")}
              deviationPercentLabel={t("linearityDeviationPercent")}
            />
          </div>
        </div>
      )}

      {result && !analyzing && !isLookupTable && (
        <div className="flex gap-4 min-h-0">
          {/* Left: stats + uncertainty (40%, full width when there's no chart panel) */}
          <StatisticsPanel
            className={showChartPanel ? "w-[40%] shrink-0" : "w-full max-w-xl"}
            result={result}
            referenceUnit={referenceUnit}
            measuredUnit={measuredUnit}
            secondColumnLabel={secondColumnLabel}
            isModelDirect={isModelDirect}
            isRawData={isRawData}
          />

          {/* Right: chart / table toggle (60%) — no real points for
              model_direct, so this whole panel is skipped for that mode. */}
          {showChartPanel && (
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Toggle tabs */}
            <div className="flex gap-1 p-1 bg-og-surface-alt rounded-lg w-fit border border-og-border">
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRightView(v)}
                  className={`px-4 py-1 rounded text-xs font-medium transition-colors ${
                    rightView === v ? "bg-og-surface text-og-text shadow-xs" : "text-gray-400 hover:text-og-text"
                  }`}
                >
                  {v === "chart" ? t("chart") : t("dataTable")}
                </button>
              ))}
            </div>

            {rightView === "chart" && (
              <div className="flex-1 min-h-0 flex flex-col gap-3">
                {showCurveChart && (
                <div className="rounded-xl border border-og-border bg-og-surface flex-1 min-h-0 relative overflow-hidden">
                  {/* Gradient legend overlay */}
                  <div className="absolute bottom-20 right-3 z-20 pointer-events-none">
                    <div className="bg-og-surface border border-og-border rounded-lg px-2 py-1.5 shadow-xs">
                      <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wide mb-1">{t("residual")}</p>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 rounded-xs" style={{ height: 48, background: "linear-gradient(to bottom, hsl(0,80%,42%), hsl(60,80%,42%), hsl(120,80%,42%))" }} />
                        <div className="flex flex-col justify-between h-12 text-[10px] text-gray-400">
                          <span>{t("high")}</span>
                          <span>{t("low")}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div ref={plotDivRef} style={{ height: "100%", width: "100%" }} />
                </div>
                )}
                <ResidualsChart
                  className="flex-1 min-h-0"
                  points={result.points.map((p) => ({
                    point_index: p.point_index,
                    reference_value: p.reference_value,
                    residual_abs: p.residual_abs,
                    residual_pct: p.residual_pct,
                  }))}
                  referenceUnit={referenceUnit}
                  referenceLabel={t("reference")}
                  residualLabel={t("residual")}
                  residualPercentLabel={t("residualPercent")}
                />
              </div>
            )}

            {rightView === "table" && (
              <div className="rounded-xl border border-og-border overflow-hidden flex-1" style={{ maxHeight: 340, overflowY: "auto" }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-og-border bg-og-surface-alt">
                      {[
                        "#",
                        `${secondColumnLabel} (${measuredUnit})`,
                        `${t("reference")} (${referenceUnit})`,
                        // skip_fit makes calculated_value === measured_value —
                        // a "Fitted" column would just duplicate the Indicated
                        // column under a different unit label, so it's omitted
                        // entirely for this mode rather than showing a
                        // meaningless exact copy.
                        ...(isRefVsIndicated ? [] : [`${t("fitted")} (${referenceUnit})`]),
                        `${t("residual")} (${referenceUnit})`,
                        t("residualPercent"),
                      ].map((h) => (
                        <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.points.map((pt) => (
                      <tr
                        key={pt.point_index}
                        onMouseEnter={() => onHoverPoint(pt.point_index)}
                        onMouseLeave={() => onHoverPoint(null)}
                        className={`border-b border-og-border last:border-b-0 cursor-default transition-colors ${
                          hoveredPointIdx === pt.point_index ? "bg-og-accent/10" : "hover:bg-og-surface-alt/50"
                        }`}
                      >
                        <td className="px-3 py-1.5 font-mono text-gray-400">{pt.point_index + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-og-text">{fmtN(pt.measured_value)}</td>
                        <td className="px-3 py-1.5 font-mono text-og-text">{fmtN(pt.reference_value)}</td>
                        {!isRefVsIndicated && (
                          <td className="px-3 py-1.5 font-mono text-og-text">{fmtN(pt.calculated_value)}</td>
                        )}
                        <td className={`px-3 py-1.5 font-mono ${Math.abs(pt.residual_abs ?? 0) > (result.rmse * 2) ? "text-amber-400 dark:text-amber-300" : "text-og-text"}`}>
                          {fmtN(pt.residual_abs)}
                        </td>
                        <td className="px-3 py-1.5 font-mono text-gray-400">{fmtN(pt.residual_pct, 3)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {!result && !analyzing && !analyzeError && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-sm">{t("waitingForAnalysis")}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 equivalent — data_entry_mode="reference_vs_as_found_as_left": two
// independent skip_fit=true results side by side. As-left is this
// calibration's primary/official result (feeds due-date/approval/Health
// tab); as-found is diagnostic-only (stored into as_found_summary). Both
// share the same Type B uncertainty budget controls raw_data's Step3 uses.
// ---------------------------------------------------------------------------

function AsFoundAsLeftResults({
  asFoundResult, asLeftResult, analyzing, analyzeError, referenceUnit, measuredUnit, selectedChannel,
  isAfalSkipFit,
  afalCurveFitMethod, onAfalCurveFitMethodChange,
  afalCustomFormulaTemplate, onAfalCustomFormulaTemplateChange,
  afalCustomFormulaError, onAfalCustomFormulaErrorChange,
  analyzeParams, onAnalyzeParamsChange,
  afalUncertainty, onAfalUncertaintyChange,
  referenceStandardAuto, referenceStandardAutoLoading, referenceAssetName,
}: {
  asFoundResult: AnalyzeResponse | null;
  asLeftResult: AnalyzeResponse | null;
  analyzing: boolean;
  analyzeError: string | null;
  referenceUnit: string;
  measuredUnit: string;
  selectedChannel: SensorChannelFull | undefined;
  isAfalSkipFit: boolean;
  afalCurveFitMethod: CalibrationMethod;
  onAfalCurveFitMethodChange: (m: CalibrationMethod) => void;
  afalCustomFormulaTemplate: string;
  onAfalCustomFormulaTemplateChange: (v: string) => void;
  afalCustomFormulaError: string | null;
  onAfalCustomFormulaErrorChange: (e: string | null) => void;
  analyzeParams: AnalyzeParams;
  onAnalyzeParamsChange: (p: AnalyzeParams) => void;
  afalUncertainty: UncertaintyConformityState;
  onAfalUncertaintyChange: (updater: (s: UncertaintyConformityState) => UncertaintyConformityState) => void;
  referenceStandardAuto: { expandedUncertainty: number; coverageFactor: number } | null;
  referenceStandardAutoLoading: boolean;
  referenceAssetName: string | null;
}) {
  const t = useTranslations("assets.wizard");
  const secondColumnLabel = isAfalSkipFit ? t("indicatedValue") : t("measured");
  const toleranceDefault = channelToleranceDefault(selectedChannel, referenceUnit);

  function sideColumn(title: string, result: AnalyzeResponse | null, primary: boolean) {
    return (
      <div className="space-y-3 min-w-0">
        <p className="text-xs font-semibold text-og-text flex items-center gap-2">
          {title}
          {!primary && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-og-surface-alt border border-og-border text-gray-400">
              {t("diagnosticOnly")}
            </span>
          )}
        </p>
        <ConformityCriteriaReadout result={result} referenceUnit={referenceUnit} decisionRule={afalUncertainty.decisionRule} />
        {result ? (
          <>
            {!isAfalSkipFit && (
              <ModelPanel
                isPolynomial={afalCurveFitMethod === "polynomial_fit"}
                degree={result.poly_degree ?? 0}
                coefficients={result.coefficients}
                formulaTemplate={afalCurveFitMethod === "custom_formula" ? afalCustomFormulaTemplate : null}
                formulaParamValues={result.custom_formula_parameter_values ?? null}
              />
            )}
            <StatisticsPanel
              result={result}
              referenceUnit={referenceUnit}
              measuredUnit={measuredUnit}
              secondColumnLabel={secondColumnLabel}
              isModelDirect={false}
              isRawData={!isAfalSkipFit}
            />
            <ResidualsChart
              className="h-56"
              points={result.points.map((p) => ({
                point_index: p.point_index,
                reference_value: p.reference_value,
                residual_abs: p.residual_abs,
                residual_pct: p.residual_pct,
              }))}
              referenceUnit={referenceUnit}
              referenceLabel={t("reference")}
              residualLabel={t("residual")}
              residualPercentLabel={t("residualPercent")}
            />
          </>
        ) : (
          <div className="flex items-center justify-center h-40 rounded-xl border border-og-border bg-og-surface-alt text-xs text-gray-400">
            {t("waitingForAnalysis")}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="p-5 space-y-5">
      {/* The curve-fit method is shared across both sides — same physical
          instrument before/after repair, fit with the same method/degree
          for a meaningful comparison. Omitted entirely for the skip_fit
          (Reference vs Indicated) variant, which has no model at all. */}
      {!isAfalSkipFit && (
        <CalibrationMethodPanel
          curveFitMethod={afalCurveFitMethod}
          onCurveFitMethodChange={onAfalCurveFitMethodChange}
          analyzeParams={analyzeParams}
          onAnalyzeParamsChange={onAnalyzeParamsChange}
          customFormulaTemplate={afalCustomFormulaTemplate}
          onCustomFormulaTemplateChange={onAfalCustomFormulaTemplateChange}
          customFormulaError={afalCustomFormulaError}
          onCustomFormulaErrorChange={onAfalCustomFormulaErrorChange}
        />
      )}

      {analyzing && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="w-3.5 h-3.5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
          {t("analyzing")}
        </div>
      )}

      {analyzeError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900/30">
          <WarningIcon size={13} />
          {analyzeError}
        </div>
      )}

      {/* Uncertainty calculation and the conformity criteria (decision rule
          + tolerance) are shared across both sides — same channel/spec
          either side of the repair. Only the resulting Error/Uncertainty
          numbers and statistics differ per side, in the two columns below. */}
      <UncertaintyCalculationPanel
        analyzeParams={analyzeParams}
        onAnalyzeParamsChange={onAnalyzeParamsChange}
        result={asLeftResult}
        referenceUnit={referenceUnit}
        selectedChannel={selectedChannel}
        includeSensorNominalUncertainty={afalUncertainty.includeSensorNominalUncertainty}
        onIncludeSensorNominalUncertaintyChange={(v) => onAfalUncertaintyChange((s) => ({ ...s, includeSensorNominalUncertainty: v }))}
        sensorNominalUncertaintyManual={afalUncertainty.sensorNominalUncertaintyManual}
        onSensorNominalUncertaintyManualChange={(v) => onAfalUncertaintyChange((s) => ({ ...s, sensorNominalUncertaintyManual: v }))}
        sensorNominalUncertaintyUnit={afalUncertainty.sensorNominalUncertaintyUnit}
        includeReferenceStandardManual={afalUncertainty.includeReferenceStandardManual}
        onIncludeReferenceStandardManualChange={(v) => onAfalUncertaintyChange((s) => ({ ...s, includeReferenceStandardManual: v }))}
        referenceStandardAuto={referenceStandardAuto}
        referenceStandardAutoLoading={referenceStandardAutoLoading}
        referenceAssetName={referenceAssetName}
        referenceStandardManualUncertainty={afalUncertainty.referenceStandardManualUncertainty}
        onReferenceStandardManualUncertaintyChange={(v) => onAfalUncertaintyChange((s) => ({ ...s, referenceStandardManualUncertainty: v }))}
        referenceStandardManualUnit={afalUncertainty.referenceStandardManualUnit}
        referenceStandardManualCoverageFactor={afalUncertainty.referenceStandardManualCoverageFactor}
        onReferenceStandardManualCoverageFactorChange={(v) => onAfalUncertaintyChange((s) => ({ ...s, referenceStandardManualCoverageFactor: v }))}
      />

      <ConformityCriteriaSelector
        decisionRule={afalUncertainty.decisionRule}
        onDecisionRuleChange={(v) => onAfalUncertaintyChange((s) => ({ ...s, decisionRule: v }))}
        toleranceOverrideValue={afalUncertainty.toleranceOverrideValue}
        onToleranceOverrideValueChange={(v) => onAfalUncertaintyChange((s) => ({ ...s, toleranceOverrideValue: v }))}
        toleranceDefault={toleranceDefault}
        includeSensorNominalUncertainty={afalUncertainty.includeSensorNominalUncertainty}
        referenceUnit={referenceUnit}
      />

      <div className="grid grid-cols-2 gap-5">
        {sideColumn(t("asFoundData"), asFoundResult, false)}
        {sideColumn(t("asLeftData"), asLeftResult, true)}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Step 3 alternative — data_entry_mode="frequency_response": a single
// sensitivity-model panel (baseline-frequency dropdown, sourced from Step 2's
// own rows, + the computed sensitivity) instead of the raw_data Method/
// Uncertainty/Conformity 3-panel stack — this mode has no curve fit, no
// uncertainty budget, no conformity check (see
// services/frequency_response_analysis.py). A sensitivity-vs-frequency chart
// is always shown; a phase-vs-frequency chart is stacked below it only when
// the offset switch is enabled.
// ---------------------------------------------------------------------------

function FrequencyResponseResults({
  rows, settings, baselineIndex, onBaselineIndexChange, result, analyzing, analyzeError,
}: {
  rows: FreqRow[];
  settings: FreqSweepSettings;
  baselineIndex: number;
  onBaselineIndexChange: (i: number) => void;
  result: AnalyzeFrequencyResponseResponse | null;
  analyzing: boolean;
  analyzeError: string | null;
}) {
  const t = useTranslations("assets.wizard");

  const baselineOptions = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) =>
      row.frequency.trim() !== "" && !isNaN(parseFloat(row.frequency)) &&
      row.reference.trim() !== "" && !isNaN(parseFloat(row.reference)) &&
      row.measured.trim() !== "" && !isNaN(parseFloat(row.measured))
    );

  const sensitivityPoints: SensitivityChartPoint[] = result
    ? result.points.map((p) => ({
        sweep_index: p.sweep_index,
        frequency_value: p.frequency_value,
        sensitivity_value: p.sensitivity_value,
        deviation_pct: p.deviation_pct,
      }))
    : [];

  const phasePoints: PhaseChartPoint[] = (settings.offset_enabled && result)
    ? result.points
        .map((p): PhaseChartPoint | null => {
          const row = rows[p.sweep_index];
          const offsetNum = row ? parseFloat(row.offset) : NaN;
          return isNaN(offsetNum) ? null : { sweep_index: p.sweep_index, frequency_value: p.frequency_value, offset_value: offsetNum };
        })
        .filter((p): p is PhaseChartPoint => p !== null)
    : [];

  const sensitivityUnit = `${settings.measured_unit}/${settings.reference_unit}`;

  return (
    <div className="p-5 space-y-4">
      {analyzing && (
        <div className="flex items-center gap-2 text-xs text-gray-400">
          <span className="w-3.5 h-3.5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
          {t("analyzing")}
        </div>
      )}

      {analyzeError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900/30">
          <WarningIcon size={13} />
          {analyzeError}
        </div>
      )}

      {/* Sensitivity model panel — full width */}
      <div className="w-full space-y-3 rounded-xl border border-og-border bg-og-surface-alt p-4">
        <p className="text-xs font-semibold text-og-text">{t("sensitivityModel")}</p>
        <div className="flex items-end gap-6 flex-wrap">
          <div className="flex flex-col gap-1 w-64">
            <WLabel text={t("baselineFrequency")} tooltip={t("tips.baselineFrequency")} docsHref={WIZARD_DOCS_LINKS.frequency_response_baseline} />
            <Select
              value={String(baselineIndex)}
              onChange={(v) => onBaselineIndexChange(parseInt(v))}
              options={baselineOptions.map(({ row, index }) => ({
                value: String(index),
                label: `${row.frequency} ${settings.frequency_unit} (#${index + 1})`,
              }))}
            />
          </div>

          {result ? (
            <div className="flex flex-col gap-1">
              <WLabel text={t("sensitivityResult")} tooltip={t("tips.sensitivityResult")} docsHref={WIZARD_DOCS_LINKS.frequency_response_sensitivity} />
              <p className="text-lg font-semibold text-og-text font-mono">
                {fmtN(result.gain, 6)} <span className="text-xs text-gray-400 font-normal">{sensitivityUnit}</span>
              </p>
            </div>
          ) : (
            <div className="flex items-center px-3 h-9 rounded-lg border border-og-border bg-og-surface text-xs text-gray-400">
              {t("waitingForAnalysis")}
            </div>
          )}
        </div>
      </div>

      {result && (
        <div className="flex gap-4 min-h-0">
          {/* Left: sweep table — wide enough for every column to read cleanly,
              chart(s) take the remainder */}
          <div className="w-[62%] shrink-0 rounded-xl border border-og-border overflow-auto" style={{ maxHeight: 420 }}>
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="border-b border-og-border bg-og-surface-alt">
                  {[
                    "#",
                    `${t("frequency")}${settings.frequency_unit ? ` (${settings.frequency_unit})` : ""}`,
                    `${t("reference")}${settings.reference_unit ? ` (${settings.reference_unit})` : ""}`,
                    `${t("measured")}${settings.measured_unit ? ` (${settings.measured_unit})` : ""}`,
                    `${t("sensitivityResult")}${sensitivityUnit ? ` (${sensitivityUnit})` : ""}`,
                    t("deviationPercent"),
                  ].map((h) => (
                    <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {result.points.map((p) => (
                  <tr
                    key={p.sweep_index}
                    className={`border-b border-og-border last:border-b-0 transition-colors ${
                      p.sweep_index === baselineIndex ? "bg-og-accent/10" : "hover:bg-og-surface-alt/50"
                    }`}
                  >
                    <td className="px-3 py-1.5 font-mono text-gray-400 whitespace-nowrap">{p.sweep_index + 1}</td>
                    <td className="px-3 py-1.5 font-mono text-og-text whitespace-nowrap">{fmtN(p.frequency_value)}</td>
                    <td className="px-3 py-1.5 font-mono text-og-text whitespace-nowrap">{fmtN(p.reference_value)}</td>
                    <td className="px-3 py-1.5 font-mono text-og-text whitespace-nowrap">{fmtN(p.measured_value)}</td>
                    <td className="px-3 py-1.5 font-mono text-og-text whitespace-nowrap">{fmtN(p.sensitivity_value)}</td>
                    <td className="px-3 py-1.5 font-mono text-gray-400 whitespace-nowrap">{fmtN(p.deviation_pct, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right: sensitivity chart (always) + phase chart (offset only) */}
          <div className="flex-1 min-w-0 flex flex-col gap-3">
            <SensitivityChart
              className="flex-1 min-h-0"
              points={sensitivityPoints}
              frequencyUnit={settings.frequency_unit}
              sensitivityUnit={sensitivityUnit}
              frequencyLabel={t("frequency")}
              sensitivityLabel={t("sensitivityResult")}
              deviationLabel={t("deviationPercent")}
            />
            {settings.offset_enabled && (
              <PhaseChart
                className="flex-1 min-h-0"
                points={phasePoints}
                frequencyUnit={settings.frequency_unit}
                offsetUnit={settings.offset_unit}
                frequencyLabel={t("frequency")}
                phaseLabel={t("phase")}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
