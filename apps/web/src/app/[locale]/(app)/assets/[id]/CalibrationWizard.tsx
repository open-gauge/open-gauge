"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetProfile } from "@/types/asset";
import type {
  AnalyzeRequest, AnalyzeResponse, CalibrationCreateBody, CalibrationLabCandidate,
  CalibrationPointInline, CalibrationPurpose, CalibrationRecord, CalibrationType, CalibrationUser,
  DataEntryMode, DecisionRule, DistributionType, ModelType,
  FrequencyResponsePointInline, ResidualPoint, WizardRawPoint,
} from "@/types/calibration";
import {
  analyzeCalibration, createCalibration, getAssetCalibrations,
  listAssets, listCalibrationUsers, listProcedures, uploadCalibrationCertificate,
} from "@/services/asset.service";
import { evaluateModel, evalPolynomial, validateCustomFormula } from "@/lib/evaluate-model";
import { listCalibrationLabs } from "@/services/location.service";
import { listCalibrationLabCandidates } from "@/services/organization.service";
import { useTranslations } from "next-intl";
import { COLORS } from "@/lib/tokens";
import { translateDynamic } from "@/lib/translate-dynamic";
import { roundToSigFigs } from "@/lib/uncertainty-format";
import { getUnitsForQuantity, getOutputUnits, resolveSpecValue, FREQUENCY_OUTPUT_UNITS } from "@/lib/sensor-options";
import { useAuth } from "@/lib/auth-context";
import { STAT_DOCS_LINKS, WIZARD_DOCS_LINKS } from "@/lib/docs-links";
import { StatRow } from "@/components/stat-row";
import { ToggleSwitch } from "@/components/toggle-switch";
import { Tooltip } from "@/components/tooltip";
import { FrequencyResponseChart } from "@/components/frequency-response-chart";
import { ResidualsChart } from "@/components/residuals-chart";
import { hasPlottableFrequencyPoints } from "@/lib/frequency-response-chart";
import {
  CheckIcon, ChevronDownIcon, InfoIcon, PlusIcon, TrashIcon, WarningIcon, XIcon,
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

function WLabel({
  text, required, tooltip, docsHref,
}: { text: string; required?: boolean; tooltip?: string; docsHref?: string }) {
  return (
    <span className="text-xs text-gray-400 inline-flex items-center gap-1">
      {text}{required && <span className="text-red-400 ml-0.5">*</span>}
      <FieldTooltip tooltip={tooltip} docsHref={docsHref} />
    </span>
  );
}

function WInput({
  label, value, onChange, type = "text", placeholder, required, readOnly, error, tooltip, docsHref,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; readOnly?: boolean; error?: string;
  tooltip?: string; docsHref?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <WLabel text={label} required={required} tooltip={tooltip} docsHref={docsHref} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        className={`${IB} ${error ? IB_ERR : IB_OK} ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
      />
      {error && <p className="text-xs text-red-500 mt-0.5">{error}</p>}
    </div>
  );
}

function WSelect({
  label, value, onChange, options, required, placeholder, tooltip, docsHref,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean; placeholder?: string; tooltip?: string; docsHref?: string;
}) {
  const t = useTranslations("assets.fields");
  return (
    <div className="flex flex-col gap-1">
      <WLabel text={label} required={required} tooltip={tooltip} docsHref={docsHref} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${IB} ${IB_OK}`}
      >
        <option value="">{placeholder ?? t("select")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
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
  data_entry_mode: DataEntryMode;
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
  add_frequency_response: boolean;
}

// Frequency response: sweep-level settings, chosen once for the whole sweep (not
// per-point) in the new step's "first row".
interface FrequencyResponseSettings {
  frequency_unit: string;
  amplitude_active: boolean;
  amplitude_type: string; // "dB" | "RMS" | "Peak-to-Peak" | "Peak"
  amplitude_unit: string; // physical unit, meaningful only when amplitude_type !== "dB"
  phase_active: boolean;
  phase_unit: string; // "°" | "rad"
}

interface FrequencyResponseRow {
  frequency: string;
  amplitude: string;
  phase: string;
}

const AMPLITUDE_TYPE_OPTIONS = [
  { value: "dB", label: "dB" },
  { value: "RMS", label: "RMS" },
  { value: "Peak-to-Peak", label: "Peak-to-Peak" },
  { value: "Peak", label: "Peak" },
];

const PHASE_UNIT_OPTIONS = [
  { value: "°", label: "°" },
  { value: "rad", label: "rad" },
];

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
  custom_formula: string;
  poly_order: number;
  coefficients: string[];
  range_min: string;
  range_max: string;
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
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

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
    data_entry_mode: "raw_data",
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
    add_frequency_response: false,
  });

  // Which of the 4 data-entry mechanisms is active — see Step1State.data_entry_mode.
  const isModelDirect = step1.data_entry_mode === "model_direct";
  const isRefVsIndicated = step1.data_entry_mode === "reference_vs_indicated";
  const isRefVsAsFoundAsLeft = step1.data_entry_mode === "reference_vs_as_found_as_left";

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
    custom_formula: "",
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

  // Optional frequency-response step (inserted between raw data and analysis when
  // step1.add_frequency_response is checked). Pure client-side — no /analyze round-trip.
  const [freqSettings, setFreqSettings] = useState<FrequencyResponseSettings>({
    frequency_unit: "Hz",
    amplitude_active: true,
    amplitude_type: "dB",
    amplitude_unit: "",
    phase_active: false,
    phase_unit: "°",
  });
  const [freqInputMode, setFreqInputMode] = useState<"manual" | "csv">("manual");
  const [freqPoints, setFreqPoints] = useState<FrequencyResponseRow[]>([
    { frequency: "", amplitude: "", phase: "" },
    { frequency: "", amplitude: "", phase: "" },
  ]);
  const [freqCsvError, setFreqCsvError] = useState<string | null>(null);
  const freqFileInputRef = useRef<HTMLInputElement>(null);

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
  // ISO/IEC 17025 §7.1.3/§7.8.6 decision rule — how measurement uncertainty is
  // factored into the pass/fail conformity statement. This is the value that
  // gets stored and printed on the certificate (unlike the ad-hoc tolerance
  // preview below, which is just for exploring "what if" thresholds).
  const [decisionRule, setDecisionRule] = useState<DecisionRule>("simple_acceptance");
  // Type B: uncertainty of the reference standard used for this calibration.
  // For an internal reference asset, auto-fetched from its own most recent
  // calibration; otherwise (external labs, or an internal asset with no prior
  // calibration on record) the technician can enter it manually from the
  // reference standard's own certificate.
  const [referenceStandardAuto, setReferenceStandardAuto] = useState<{ expandedUncertainty: number; coverageFactor: number } | null>(null);
  const [referenceStandardAutoLoading, setReferenceStandardAutoLoading] = useState(false);
  const [referenceStandardManualUncertainty, setReferenceStandardManualUncertainty] = useState<string>("");
  const [referenceStandardManualCoverageFactor, setReferenceStandardManualCoverageFactor] = useState<string>("2");

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

  const manualCoeffValid =
    (manualCoeff.model_type === "polynomial"
      ? manualCoeff.coefficients.every((c) => c.trim() !== "" && !isNaN(parseFloat(c)))
      : manualCoeff.custom_formula.trim() !== "" && customFormulaError === null) &&
    manualCoeff.range_min.trim() !== "" && !isNaN(parseFloat(manualCoeff.range_min)) &&
    manualCoeff.range_max.trim() !== "" && !isNaN(parseFloat(manualCoeff.range_max));

  const validRefPoints = (pts: WizardRawPoint[]) => pts.filter(
    (p) => p.reference.trim() !== "" && p.measured.trim() !== "" &&
      !isNaN(parseFloat(p.reference)) && !isNaN(parseFloat(p.measured))
  );
  const validAsFoundPoints = validRefPoints(asFoundPoints);
  const validAsLeftPoints = validRefPoints(asLeftPoints);

  const step2Valid =
    isModelDirect ? manualCoeffValid
    : isRefVsIndicated ? validPoints.length >= 2
    : isRefVsAsFoundAsLeft ? (validAsFoundPoints.length >= 2 && validAsLeftPoints.length >= 2)
    : validPoints.length >= 2;

  // Whether the final step's analysis has produced a result that's actually
  // ready to save — mirrors handleSave's own guard so the Confirm & Save
  // button's disabled state never drifts out of sync with it.
  const canSave =
    isModelDirect ? manualCoeffValid
    : isRefVsAsFoundAsLeft ? (asFoundResult != null && asLeftResult != null && !asFoundAsLeftAnalyzing)
    : (analysisResult != null && !analyzing);

  // When frequency response is enabled, it becomes step 3 and analysis moves to step 4;
  // otherwise the wizard is unchanged (analysis stays at step 3).
  const lastStep = step1.add_frequency_response ? 4 : 3;
  const validFreqRows = freqPoints.filter(
    (p) => p.frequency.trim() !== "" && !isNaN(parseFloat(p.frequency))
  );
  const freqResponseValid = !step1.add_frequency_response || validFreqRows.length >= 2;

  // Pre-fill the sensor nominal accuracy input from the channel's manufacturer
  // spec whenever the selected channel changes; still freely editable per
  // calibration afterwards (the value used belongs to this calibration event).
  useEffect(() => {
    const defaultVal = resolveSpecValue(
      selectedChannel?.measurement_uncertainty ?? null, selectedChannel?.uncertainty_unit ?? null,
      selectedChannel?.measurement_min ?? null, selectedChannel?.measurement_max ?? null,
    );
    setSensorNominalUncertaintyManual(defaultVal != null ? String(defaultVal) : "");
    setIncludeSensorNominalUncertainty(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedChannel?.id]);

  const sensorNominalUncertaintyNum = (() => {
    const v = parseFloat(sensorNominalUncertaintyManual);
    return sensorNominalUncertaintyManual.trim() !== "" && !isNaN(v) ? v : null;
  })();

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

  const referenceStandardManualUncertaintyNum = (() => {
    const v = parseFloat(referenceStandardManualUncertainty);
    return referenceStandardManualUncertainty.trim() !== "" && !isNaN(v) ? v : null;
  })();
  const referenceStandardUncertainty = referenceStandardAuto
    ? referenceStandardAuto.expandedUncertainty
    : referenceStandardManualUncertaintyNum;
  const referenceStandardCoverageFactor = referenceStandardAuto
    ? referenceStandardAuto.coverageFactor
    : (parseFloat(referenceStandardManualCoverageFactor) || 2.0);

  // ---------------------------------------------------------------------------
  // Analysis debounce (Step 3) — stable, no blinking
  // ---------------------------------------------------------------------------

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnalysisKeyRef = useRef<string>("");

  // Trigger analysis when entering step 3 or when inputs change — covers both
  // raw_data (fitted) and reference_vs_indicated (skip_fit, no curve) modes,
  // since both share the exact same live /analyze pipeline over rawPoints.
  useEffect(() => {
    if (step !== lastStep || !(step1.data_entry_mode === "raw_data" || isRefVsIndicated)) return;

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
      referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum,
      skipFit: isRefVsIndicated,
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
  }, [step, lastStep, rawPoints, referenceUnit, measuredUnit, analyzeParams, step1.data_entry_mode, isRefVsIndicated, selectedChannel, includeSensorNominalUncertainty, decisionRule, referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum]);

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
      referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum,
      accV: selectedChannel?.accuracy_value, accT: selectedChannel?.accuracy_type,
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
  }, [step, lastStep, isModelDirect, manualCoeffValid, manualCoeff.range_min, manualCoeff.range_max, referenceUnit, analyzeParams, selectedChannel, includeSensorNominalUncertainty, decisionRule, referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum]);

  // data_entry_mode="reference_vs_as_found_as_left": two independent
  // skip_fit=true /analyze calls (no curve, direct reference/indicated
  // residuals) — as-left is this calibration's primary/official result
  // (feeds due-date/approval/Health tab); as-found is diagnostic-only,
  // stored into as_found_summary rather than the record's primary fields.
  useEffect(() => {
    if (step !== lastStep || !isRefVsAsFoundAsLeft) return;
    if (validAsFoundPoints.length < 2 || validAsLeftPoints.length < 2) return;

    const key = JSON.stringify({
      mode: "as_found_as_left", validAsFoundPoints, validAsLeftPoints, referenceUnit, measuredUnit,
      analyzeParams, includeSensorNominalUncertainty, decisionRule,
      referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum,
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
  }, [step, lastStep, isRefVsAsFoundAsLeft, validAsFoundPoints, validAsLeftPoints, referenceUnit, measuredUnit, analyzeParams, selectedChannel, includeSensorNominalUncertainty, decisionRule, referenceStandardUncertainty, referenceStandardCoverageFactor, sensorNominalUncertaintyNum]);

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

  function parseFrequencyCSV(text: string) {
    const lines = text.trim().split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) { setFreqCsvError(t("csvNeedHeaderAndRow")); return; }

    const header = lines[0].split(",").map((h) => h.trim().toLowerCase());
    const freqIdx = header.findIndex((h) => h.includes("freq"));
    if (freqIdx === -1) { setFreqCsvError(t("csvMissingFrequencyColumn")); return; }

    const ampIdx = freqSettings.amplitude_active ? header.findIndex((h) => h.includes("amp")) : -1;
    if (freqSettings.amplitude_active && ampIdx === -1) { setFreqCsvError(t("csvMissingAmplitudeColumn")); return; }

    const phaseIdx = freqSettings.phase_active ? header.findIndex((h) => h.includes("phase")) : -1;
    if (freqSettings.phase_active && phaseIdx === -1) { setFreqCsvError(t("csvMissingPhaseColumn")); return; }

    const rows: FrequencyResponseRow[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = lines[i].split(",");
      const freq = cols[freqIdx]?.trim() ?? "";
      if (freq === "") continue;
      if (isNaN(parseFloat(freq))) {
        setFreqCsvError(t("csvNonNumericRow", { row: i + 1 }));
        continue;
      }
      const amp = ampIdx >= 0 ? (cols[ampIdx]?.trim() ?? "") : "";
      const phase = phaseIdx >= 0 ? (cols[phaseIdx]?.trim() ?? "") : "";
      rows.push({ frequency: freq, amplitude: amp, phase: phase });
    }

    if (rows.length < 2) { setFreqCsvError(t("csvNeedTwoRows")); return; }
    setFreqCsvError(null);
    setFreqPoints(rows);
    setFreqInputMode("manual"); // switch to manual to allow editing
  }

  function handleFreqFileUpload(file: File) {
    const reader = new FileReader();
    reader.onload = (e) => parseFrequencyCSV((e.target?.result as string) ?? "");
    reader.readAsText(file);
  }

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    const mode = step1.data_entry_mode;
    if (!canSave) return;
    if (!freqResponseValid) return;

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

      // Frequency response points/settings — stored exactly as entered (see
      // frequency-response-chart.ts's doc comment for the same rationale applied
      // to the live chart).
      const freqRespPoints: FrequencyResponsePointInline[] = step1.add_frequency_response
        ? validFreqRows.map((p, i) => ({
            sweep_index: i,
            frequency_value: parseFloat(p.frequency),
            amplitude_value: freqSettings.amplitude_active && p.amplitude.trim() !== "" && !isNaN(parseFloat(p.amplitude))
              ? parseFloat(p.amplitude) : null,
            phase_value: freqSettings.phase_active && p.phase.trim() !== "" && !isNaN(parseFloat(p.phase))
              ? parseFloat(p.phase) : null,
          }))
        : [];

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
        has_frequency_response: step1.add_frequency_response,
        frequency_response_frequency_unit: step1.add_frequency_response ? freqSettings.frequency_unit : null,
        frequency_response_amplitude_type: step1.add_frequency_response && freqSettings.amplitude_active ? freqSettings.amplitude_type : null,
        frequency_response_amplitude_unit: step1.add_frequency_response && freqSettings.amplitude_active && freqSettings.amplitude_type !== "dB" ? freqSettings.amplitude_unit : null,
        frequency_response_phase_unit: step1.add_frequency_response && freqSettings.phase_active ? freqSettings.phase_unit : null,
        frequency_response_points: freqRespPoints,
        data_entry_mode: mode,
        model_type: mode === "model_direct" ? manualCoeff.model_type : "polynomial",
        custom_formula: mode === "model_direct" && manualCoeff.model_type === "custom_formula" ? manualCoeff.custom_formula : null,
        as_found_points: asFoundPointsBody,
        as_found_summary: asFoundSummaryBody,
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
                isModelDirect ? t("stepCoefficients")
                  : isRefVsAsFoundAsLeft ? t("stepAsFoundAsLeftData")
                  : t("stepRawData"),
                ...(step1.add_frequency_response ? [t("stepFrequencyResponse")] : []),
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
              />
            )
          )}
          {step === 3 && step1.add_frequency_response && (
            <FrequencyResponseStep
              settings={freqSettings}
              onSettingsChange={setFreqSettings}
              points={freqPoints}
              onPointsChange={setFreqPoints}
              physicalQuantity={selectedChannel?.physical_quantity ?? ""}
              inputMode={freqInputMode}
              onInputModeChange={setFreqInputMode}
              csvError={freqCsvError}
              onFileUpload={handleFreqFileUpload}
              fileInputRef={freqFileInputRef}
            />
          )}
          {step === lastStep && (
            isRefVsAsFoundAsLeft ? (
              <AsFoundAsLeftResults
                asFoundResult={asFoundResult}
                asLeftResult={asLeftResult}
                analyzing={asFoundAsLeftAnalyzing}
                analyzeError={asFoundAsLeftError}
                referenceUnit={referenceUnit}
                analyzeParams={analyzeParams}
                onAnalyzeParamsChange={setAnalyzeParams}
                includeSensorNominalUncertainty={includeSensorNominalUncertainty}
                onIncludeSensorNominalUncertaintyChange={setIncludeSensorNominalUncertainty}
                sensorNominalUncertaintyManual={sensorNominalUncertaintyManual}
                onSensorNominalUncertaintyManualChange={setSensorNominalUncertaintyManual}
                decisionRule={decisionRule}
                onDecisionRuleChange={setDecisionRule}
                referenceStandardAuto={referenceStandardAuto}
                referenceStandardAutoLoading={referenceStandardAutoLoading}
                referenceAssetName={referenceAssets.find((a) => a.id === step1.internal_reference_asset_id)?.name ?? null}
                referenceStandardManualUncertainty={referenceStandardManualUncertainty}
                onReferenceStandardManualUncertaintyChange={setReferenceStandardManualUncertainty}
                referenceStandardManualCoverageFactor={referenceStandardManualCoverageFactor}
                onReferenceStandardManualCoverageFactorChange={setReferenceStandardManualCoverageFactor}
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
                dataEntryMode={step1.data_entry_mode}
                manualCoeff={manualCoeff}
                includeSensorNominalUncertainty={includeSensorNominalUncertainty}
                onIncludeSensorNominalUncertaintyChange={setIncludeSensorNominalUncertainty}
                sensorNominalUncertaintyManual={sensorNominalUncertaintyManual}
                onSensorNominalUncertaintyManualChange={setSensorNominalUncertaintyManual}
                decisionRule={decisionRule}
                onDecisionRuleChange={setDecisionRule}
                referenceStandardAuto={referenceStandardAuto}
                referenceStandardAutoLoading={referenceStandardAutoLoading}
                referenceAssetName={referenceAssets.find((a) => a.id === step1.internal_reference_asset_id)?.name ?? null}
                referenceStandardManualUncertainty={referenceStandardManualUncertainty}
                onReferenceStandardManualUncertaintyChange={setReferenceStandardManualUncertainty}
                referenceStandardManualCoverageFactor={referenceStandardManualCoverageFactor}
                onReferenceStandardManualCoverageFactorChange={setReferenceStandardManualCoverageFactor}
              />
            )
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-og-border shrink-0">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3 | 4)}
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
                if (step === 3 && step1.add_frequency_response && !freqResponseValid) return;
                setStep((s) => (s + 1) as 2 | 3 | 4);
              }}
              disabled={
                (step === 1 && !step1Valid) ||
                (step === 2 && !step2Valid) ||
                (step === 3 && step1.add_frequency_response && !freqResponseValid)
              }
              className="px-5 py-2 text-sm font-medium rounded-lg bg-og-action hover:bg-og-action-dark text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {t("next")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!canSave || !freqResponseValid}
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
  // model_direct is the successor of the original "coefficients only" mode —
  // same calibration_type gate (a lab/manufacturer delivering a model instead
  // of raw data). reference_vs_indicated/reference_vs_as_found_as_left are
  // gated on calibration_purpose instead (see DATA_ENTRY_MODE_OPTIONS below).
  const allowsModelDirect = state.calibration_type === "oem" || state.calibration_type === "external_accredited_lab" || state.calibration_type === "customer_asset";
  const DATA_ENTRY_MODE_OPTIONS: { value: DataEntryMode; label: string }[] = [
    { value: "raw_data", label: t("dataEntryModeRawData") },
    ...(allowsModelDirect ? [{ value: "model_direct" as DataEntryMode, label: t("dataEntryModeModelDirect") }] : []),
    ...(state.calibration_purpose === "verification"
      ? [{ value: "reference_vs_indicated" as DataEntryMode, label: t("dataEntryModeReferenceVsIndicated") }]
      : []),
    ...(state.calibration_purpose === "after_repair"
      ? [{ value: "reference_vs_as_found_as_left" as DataEntryMode, label: t("dataEntryModeReferenceVsAsFoundAsLeft") }]
      : []),
  ];

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
          onChange={(v) => {
            const newType = v as CalibrationType;
            const stillAllowsModelDirect = newType === "oem" || newType === "external_accredited_lab" || newType === "customer_asset";
            onChange({
              ...state,
              calibration_type: newType,
              data_entry_mode: state.data_entry_mode === "model_direct" && !stillAllowsModelDirect ? "raw_data" : state.data_entry_mode,
            });
          }}
          options={CALIBRATION_TYPE_OPTIONS}
          required
          tooltip={t("tips.calibrationType")}
          docsHref={WIZARD_DOCS_LINKS.calibration_type}
        />
        <WSelect
          label={t("calibrationPurpose")}
          value={state.calibration_purpose}
          onChange={(v) => {
            const newPurpose = v as CalibrationPurpose;
            let mode = state.data_entry_mode;
            if (mode === "reference_vs_indicated" && newPurpose !== "verification") mode = "raw_data";
            if (mode === "reference_vs_as_found_as_left" && newPurpose !== "after_repair") mode = "raw_data";
            onChange({ ...state, calibration_purpose: newPurpose, data_entry_mode: mode });
          }}
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

      {/* Mode switches, right above Environmental Conditions / Notes */}
      <div className="grid grid-cols-2 gap-4 items-end pt-1">
        <WSelect
          label={t("dataEntryMode")}
          value={state.data_entry_mode}
          onChange={(v) => onChange({ ...state, data_entry_mode: v as DataEntryMode })}
          options={DATA_ENTRY_MODE_OPTIONS}
          tooltip={t("tips.dataEntryMode")}
          docsHref={WIZARD_DOCS_LINKS.data_entry_mode}
        />
        <WCheckbox
          label={t("addFrequencyResponseLabel")}
          checked={state.add_frequency_response}
          onChange={set("add_frequency_response") as (v: boolean) => void}
          tooltip={t("tips.addFrequencyResponse")}
          docsHref={WIZARD_DOCS_LINKS.add_frequency_response}
        />
      </div>

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
            {(() => {
              const numErr = (v: string) =>
                v.trim() !== "" && isNaN(parseFloat(v.trim())) ? t("mustBeNumber") : undefined;
              return (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <WInput label={t("temperature")} value={state.temperature_value}
                      onChange={set("temperature_value") as (v: string) => void}
                      placeholder="e.g. 23" error={numErr(state.temperature_value)} />
                    <div className="flex flex-col gap-1">
                      <WLabel text={t("uncertainty")} />
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-400">±</span>
                        <input type="text" value={state.temperature_uncertainty}
                          onChange={(e) => set("temperature_uncertainty")(e.target.value)}
                          placeholder="e.g. 0.1"
                          className={`${IB} ${numErr(state.temperature_uncertainty) ? IB_ERR : IB_OK}`} />
                      </div>
                    </div>
                    <WSelect label={t("unit")} value={state.temperature_unit}
                      onChange={set("temperature_unit") as (v: string) => void}
                      options={[{ value: "°C", label: "°C" }, { value: "K", label: "K" }, { value: "°F", label: "°F" }]} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <WInput label={t("pressure")} value={state.pressure_value}
                      onChange={set("pressure_value") as (v: string) => void}
                      placeholder="e.g. 1013.25" error={numErr(state.pressure_value)} />
                    <div className="flex flex-col gap-1">
                      <WLabel text={t("uncertainty")} />
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-400">±</span>
                        <input type="text" value={state.pressure_uncertainty}
                          onChange={(e) => set("pressure_uncertainty")(e.target.value)}
                          placeholder="e.g. 0.5"
                          className={`${IB} ${numErr(state.pressure_uncertainty) ? IB_ERR : IB_OK}`} />
                      </div>
                    </div>
                    <WSelect label={t("unit")} value={state.pressure_unit}
                      onChange={set("pressure_unit") as (v: string) => void}
                      options={[{ value: "hPa", label: "hPa" }, { value: "Pa", label: "Pa" }, { value: "bar", label: "bar" }, { value: "psi", label: "psi" }]} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <WInput label={t("humidity")} value={state.humidity_value}
                      onChange={set("humidity_value") as (v: string) => void}
                      placeholder="e.g. 45" error={numErr(state.humidity_value)} />
                    <div className="flex flex-col gap-1">
                      <WLabel text={t("uncertainty")} />
                      <div className="flex items-center gap-1">
                        <span className="text-sm text-gray-400">±</span>
                        <input type="text" value={state.humidity_uncertainty}
                          onChange={(e) => set("humidity_uncertainty")(e.target.value)}
                          placeholder="e.g. 2"
                          className={`${IB} ${numErr(state.humidity_uncertainty) ? IB_ERR : IB_OK}`} />
                      </div>
                    </div>
                    <WSelect label={t("unit")} value={state.humidity_unit}
                      onChange={set("humidity_unit") as (v: string) => void}
                      options={[{ value: "%RH", label: "%RH" }]} />
                  </div>
                </>
              );
            })()}
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
// Step 2 — Raw Data
// ---------------------------------------------------------------------------

function Step2({
  points, onPointsChange, referenceUnit, measuredUnit,
  onReferenceUnitChange, onMeasuredUnitChange, physicalQuantity, outputType,
  inputMode, onInputModeChange, csvError, onFileUpload, fileInputRef,
  title, showUnitSelectors = true, measuredLabel,
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

  const refUnitOpts = (() => {
    const base = getUnitsForQuantity(physicalQuantity);
    const opts = base.length > 0 ? base : [{ value: referenceUnit, label: referenceUnit }];
    return opts.some(u => u.value === referenceUnit) ? opts : [{ value: referenceUnit, label: referenceUnit }, ...opts];
  })();

  const measUnitOpts = (() => {
    const fromOutput = outputType ? (getOutputUnits(outputType, physicalQuantity) ?? []) : [];
    const base = fromOutput.length > 0 ? fromOutput : getUnitsForQuantity(physicalQuantity);
    const opts = base.length > 0 ? base : [{ value: measuredUnit, label: measuredUnit }];
    return opts.some(u => u.value === measuredUnit) ? opts : [{ value: measuredUnit, label: measuredUnit }, ...opts];
  })();

  return (
    <div className="p-6 space-y-4">
      {title && <p className="text-xs font-semibold text-og-text -mb-1">{title}</p>}
      {/* Unit selectors */}
      {showUnitSelectors && (
        <div className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1">
            <WLabel text={t("referenceUnit")} />
            <select
              value={referenceUnit}
              onChange={(e) => onReferenceUnitChange(e.target.value)}
              className={`${IB} ${IB_OK} py-1.5`}
            >
              {refUnitOpts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex flex-col gap-1">
            <WLabel text={measuredLabel ?? t("measuredUnit")} />
            <select
              value={measuredUnit}
              onChange={(e) => onMeasuredUnitChange(e.target.value)}
              className={`${IB} ${IB_OK} py-1.5`}
            >
              {measUnitOpts.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
        </div>
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
                      <input
                        type="number"
                        value={pt.reference}
                        onChange={(e) => updatePoint(i, "reference", e.target.value)}
                        step="any"
                        className={`${IB} ${IB_OK} py-1.5`}
                        placeholder="0.0"
                      />
                    </td>
                    <td className="px-2 py-1">
                      <input
                        type="number"
                        value={pt.measured}
                        onChange={(e) => updatePoint(i, "measured", e.target.value)}
                        step="any"
                        className={`${IB} ${IB_OK} py-1.5`}
                        placeholder="0.0"
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
  physicalQuantity, outputType,
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
  return (
    <div className="divide-y divide-og-border">
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
        inputMode={asFoundInputMode}
        onInputModeChange={onAsFoundInputModeChange}
        csvError={asFoundCsvError}
        onFileUpload={onAsFoundFileUpload}
        fileInputRef={asFoundFileInputRef}
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
        inputMode={asLeftInputMode}
        onInputModeChange={onAsLeftInputModeChange}
        csvError={asLeftCsvError}
        onFileUpload={onAsLeftFileUpload}
        fileInputRef={asLeftFileInputRef}
        showUnitSelectors={false}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Optional step — Frequency Response (inserted between Step 2 and Step 3 when
// step1.add_frequency_response is checked). Left: data entry. Right: live chart —
// pure client-side plotting of the entered points, no /analyze round-trip.
// ---------------------------------------------------------------------------

function FrequencyResponseStep({
  settings, onSettingsChange, points, onPointsChange, physicalQuantity,
  inputMode, onInputModeChange, csvError, onFileUpload, fileInputRef,
}: {
  settings: FrequencyResponseSettings;
  onSettingsChange: (s: FrequencyResponseSettings) => void;
  points: FrequencyResponseRow[];
  onPointsChange: (p: FrequencyResponseRow[]) => void;
  physicalQuantity: string;
  inputMode: "manual" | "csv";
  onInputModeChange: (m: "manual" | "csv") => void;
  csvError: string | null;
  onFileUpload: (f: File) => void;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
}) {
  const t = useTranslations("assets.wizard");
  const [dragging, setDragging] = useState(false);

  const amplitudeUnitOpts = getUnitsForQuantity(physicalQuantity);

  function updatePoint(idx: number, key: keyof FrequencyResponseRow, val: string) {
    const next = [...points];
    next[idx] = { ...next[idx], [key]: val };
    onPointsChange(next);
  }

  function addRow() {
    onPointsChange([...points, { frequency: "", amplitude: "", phase: "" }]);
  }

  function removeRow(idx: number) {
    if (points.length <= 2) return;
    onPointsChange(points.filter((_, i) => i !== idx));
  }

  const chartPoints = points
    .map((p, i) => ({
      sweep_index: i,
      frequency_value: parseFloat(p.frequency),
      amplitude_value: settings.amplitude_active && p.amplitude.trim() !== "" && !isNaN(parseFloat(p.amplitude))
        ? parseFloat(p.amplitude) : null,
      phase_value: settings.phase_active && p.phase.trim() !== "" && !isNaN(parseFloat(p.phase))
        ? parseFloat(p.phase) : null,
    }))
    .filter((p) => !isNaN(p.frequency_value));

  return (
    <div className="p-6 grid grid-cols-2 gap-6">
      {/* Left: data entry */}
      <div className="space-y-4 min-w-0">
        {/* First row: frequency / amplitude / phase settings */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <WLabel text={t("frequency")} required />
            <select
              value={settings.frequency_unit}
              onChange={(e) => onSettingsChange({ ...settings, frequency_unit: e.target.value })}
              className={`${IB} ${IB_OK} py-1.5`}
            >
              {FREQUENCY_OUTPUT_UNITS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <WCheckbox
              label={t("amplitude")}
              checked={settings.amplitude_active}
              onChange={(v) => onSettingsChange({ ...settings, amplitude_active: v })}
            />
            {settings.amplitude_active && (
              <>
                <select
                  value={settings.amplitude_type}
                  onChange={(e) => onSettingsChange({ ...settings, amplitude_type: e.target.value })}
                  className={`${IB} ${IB_OK} py-1.5`}
                >
                  {AMPLITUDE_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {settings.amplitude_type !== "dB" && (
                  <select
                    value={settings.amplitude_unit}
                    onChange={(e) => onSettingsChange({ ...settings, amplitude_unit: e.target.value })}
                    className={`${IB} ${IB_OK} py-1.5`}
                  >
                    <option value="">{t("selectUnit")}</option>
                    {amplitudeUnitOpts.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                )}
              </>
            )}
          </div>
          <div className="space-y-2">
            <WCheckbox
              label={t("phase")}
              checked={settings.phase_active}
              onChange={(v) => onSettingsChange({ ...settings, phase_active: v })}
            />
            {settings.phase_active && (
              <select
                value={settings.phase_unit}
                onChange={(e) => onSettingsChange({ ...settings, phase_unit: e.target.value })}
                className={`${IB} ${IB_OK} py-1.5`}
              >
                {PHASE_UNIT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            )}
          </div>
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
            <div className="rounded-lg border border-og-border overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-og-border bg-og-surface-alt">
                    <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium w-10">#</th>
                    <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                      {t("frequency")} <span className="font-mono ml-1">({settings.frequency_unit})</span>
                    </th>
                    {settings.amplitude_active && (
                      <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                        {t("amplitude")}
                        <span className="font-mono ml-1">
                          ({settings.amplitude_type === "dB" ? "dB" : (settings.amplitude_unit || "—")})
                        </span>
                      </th>
                    )}
                    {settings.phase_active && (
                      <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                        {t("phase")} <span className="font-mono ml-1">({settings.phase_unit})</span>
                      </th>
                    )}
                    <th className="w-10" />
                  </tr>
                </thead>
                <tbody>
                  {points.map((pt, i) => (
                    <tr key={i} className="border-b border-og-border last:border-b-0 hover:bg-og-surface-alt/50 transition-colors">
                      <td className="px-3 py-1.5 text-xs text-gray-400 font-mono">{i + 1}</td>
                      <td className="px-2 py-1">
                        <input
                          type="number"
                          value={pt.frequency}
                          onChange={(e) => updatePoint(i, "frequency", e.target.value)}
                          step="any"
                          className={`${IB} ${IB_OK} py-1.5`}
                          placeholder="0.0"
                        />
                      </td>
                      {settings.amplitude_active && (
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={pt.amplitude}
                            onChange={(e) => updatePoint(i, "amplitude", e.target.value)}
                            step="any"
                            className={`${IB} ${IB_OK} py-1.5`}
                            placeholder="0.0"
                          />
                        </td>
                      )}
                      {settings.phase_active && (
                        <td className="px-2 py-1">
                          <input
                            type="number"
                            value={pt.phase}
                            onChange={(e) => updatePoint(i, "phase", e.target.value)}
                            step="any"
                            className={`${IB} ${IB_OK} py-1.5`}
                            placeholder="0.0"
                          />
                        </td>
                      )}
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

      {/* Right: live chart */}
      <div className="min-w-0">
        {hasPlottableFrequencyPoints(chartPoints) ? (
          <FrequencyResponseChart
            points={chartPoints}
            frequencyUnit={settings.frequency_unit}
            amplitudeActive={settings.amplitude_active}
            amplitudeType={settings.amplitude_active ? settings.amplitude_type : null}
            amplitudeUnit={settings.amplitude_active && settings.amplitude_type !== "dB" ? settings.amplitude_unit : null}
            phaseActive={settings.phase_active}
            phaseUnit={settings.phase_active ? settings.phase_unit : null}
            height={420}
          />
        ) : (
          <div className="flex items-center justify-center h-full min-h-[300px] rounded-xl border border-og-border bg-og-surface-alt text-sm text-gray-400">
            {t("waitingForFrequencyData")}
          </div>
        )}
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

  function setCustomFormula(formula: string) {
    onChange({ ...state, custom_formula: formula });
    if (formula.trim() === "") { onCustomFormulaErrorChange(null); return; }
    try {
      validateCustomFormula(formula);
      onCustomFormulaErrorChange(null);
    } catch {
      onCustomFormulaErrorChange(t("customFormulaInvalid"));
    }
  }

  const numericCoeffs = state.coefficients.map((c) => parseFloat(c));
  const previewValid = numericCoeffs.every((c) => !isNaN(c));

  return (
    <div className="p-6 space-y-5">
      <p className="text-xs text-gray-400">
        {t("manualCoeffHint")}
      </p>

      <div className="flex flex-col gap-1 w-56">
        <WLabel text={t("modelType")} required tooltip={t("tips.modelType")} />
        <select
          value={state.model_type}
          onChange={(e) => onChange({ ...state, model_type: e.target.value as ModelType })}
          className={`${IB} ${IB_OK}`}
        >
          <option value="polynomial">{t("modelTypePolynomial")}</option>
          <option value="custom_formula">{t("modelTypeCustomFormula")}</option>
        </select>
      </div>

      {state.model_type === "polynomial" ? (
        <>
          <div className="flex flex-col gap-1 w-40">
            <WLabel text={t("polynomialOrder")} required />
            <select
              value={state.poly_order}
              onChange={(e) => setOrder(parseInt(e.target.value))}
              className={`${IB} ${IB_OK}`}
            >
              {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-3 gap-3">
            {state.coefficients.map((c, i) => {
              const power = state.poly_order - i;
              return (
                <WInput
                  key={i}
                  label={t("coefficientLabel", { power: coeffPowerLabel(power, t) })}
                  type="number"
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
        <div className="flex flex-col gap-1">
          <WInput
            label={t("customFormula")}
            value={state.custom_formula}
            onChange={setCustomFormula}
            placeholder={t("customFormulaPlaceholder")}
            required
            error={customFormulaError ?? undefined}
            tooltip={t("tips.customFormula")}
          />
          <p className="text-xs text-gray-400">{t("customFormulaHint")}</p>
          {customFormulaError && <p className="text-xs text-red-500">{customFormulaError}</p>}
          {!customFormulaError && state.custom_formula.trim() !== "" && (
            <div className="px-4 py-2 rounded-lg bg-og-surface-alt border border-og-border mt-1">
              <span className="text-[11px] text-gray-400 mr-2">{t("equation")}</span>
              <span className="text-xs font-mono text-og-text">f(x) = {state.custom_formula}</span>
            </div>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <WInput
          label={referenceUnit ? t("validRangeMinUnit", { unit: referenceUnit }) : t("validRangeMin")}
          type="number"
          value={state.range_min}
          onChange={(v) => onChange({ ...state, range_min: v })}
          required
        />
        <WInput
          label={referenceUnit ? t("validRangeMaxUnit", { unit: referenceUnit }) : t("validRangeMax")}
          type="number"
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
// Step 3 — Analysis & Results
// ---------------------------------------------------------------------------

function evalPoly(coefficients: number[], x: number): number {
  let y = 0;
  const deg = coefficients.length - 1;
  for (let j = 0; j <= deg; j++) y += coefficients[j] * Math.pow(x, deg - j);
  return y;
}

function residualColor(residual: number, maxAbsResidual: number): string {
  const t = Math.min(Math.abs(residual) / (maxAbsResidual || 1), 1);
  const hue = Math.round(120 * (1 - t)); // green(120) → yellow(60) → red(0)
  return `hsl(${hue},80%,42%)`;
}

function Step3({
  analyzeParams, onAnalyzeParamsChange, result, analyzing, analyzeError,
  referenceUnit, measuredUnit, hoveredPointIdx, onHoverPoint, dataEntryMode, manualCoeff,
  includeSensorNominalUncertainty, onIncludeSensorNominalUncertaintyChange,
  sensorNominalUncertaintyManual, onSensorNominalUncertaintyManualChange,
  decisionRule, onDecisionRuleChange,
  referenceStandardAuto, referenceStandardAutoLoading, referenceAssetName,
  referenceStandardManualUncertainty, onReferenceStandardManualUncertaintyChange,
  referenceStandardManualCoverageFactor, onReferenceStandardManualCoverageFactorChange,
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
  includeSensorNominalUncertainty: boolean;
  onIncludeSensorNominalUncertaintyChange: (v: boolean) => void;
  sensorNominalUncertaintyManual: string;
  onSensorNominalUncertaintyManualChange: (v: string) => void;
  decisionRule: DecisionRule;
  onDecisionRuleChange: (v: DecisionRule) => void;
  referenceStandardAuto: { expandedUncertainty: number; coverageFactor: number } | null;
  referenceStandardAutoLoading: boolean;
  referenceAssetName: string | null;
  referenceStandardManualUncertainty: string;
  onReferenceStandardManualUncertaintyChange: (v: string) => void;
  referenceStandardManualCoverageFactor: string;
  onReferenceStandardManualCoverageFactorChange: (v: string) => void;
}) {
  const t = useTranslations("assets.wizard");
  const tUncertaintySource = useTranslations("tokens.uncertaintySource");
  const tDecisionRule = useTranslations("tokens.decisionRule");
  const [rightView, setRightView] = useState<"chart" | "table">("chart");
  const plotDivRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import("plotly.js-dist-min").default | null>(null);

  const setParam = <K extends keyof AnalyzeParams>(key: K) => (value: AnalyzeParams[K]) =>
    onAnalyzeParamsChange({ ...analyzeParams, [key]: value });

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

    const curve = Array.from({ length: 81 }, (_, i) => {
      const x = mn + (i * (mx - mn)) / 80;
      return { x, y: evalPoly(result.coefficients, x) };
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
            `${t("measured")}: %{x:.4g} ${measuredUnit}<br>` +
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
          title: { text: `${t("measured")} (${measuredUnit})`, font: { size: 10, color: "#9ca3af" } },
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
  }, [result, measuredUnit, referenceUnit, rightView]);

  useEffect(() => {
    const div = plotDivRef.current;
    return () => {
      if (plotlyRef.current && div) {
        try { plotlyRef.current.purge(div); } catch {}
      }
    };
  }, []);

  const isRawData = dataEntryMode === "raw_data";
  const isModelDirect = dataEntryMode === "model_direct";
  // Only raw_data ever fits a curve — model_direct's "residuals" are the two
  // synthetic zero-error corner points (see the model_direct useEffect), and
  // reference_vs_indicated has no transference function at all.
  const showCurveChart = isRawData;
  // model_direct has no real points to plot/tabulate at all.
  const showChartPanel = !isModelDirect;

  return (
    <div className="p-5 space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap gap-3 p-4 bg-og-surface-alt rounded-xl border border-og-border">
        {isRawData && (
        <div className="flex flex-col gap-1 min-w-[120px]">
          <WLabel text={t("regressionDegree")} />
          <select
            value={analyzeParams.poly_degree === null ? "auto" : String(analyzeParams.poly_degree)}
            onChange={(e) => setParam("poly_degree")(e.target.value === "auto" ? null : parseInt(e.target.value))}
            className={`${IB} ${IB_OK} py-1.5`}
          >
            <option value="auto">{t("auto")}</option>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        )}
        <div className="flex flex-col gap-1 min-w-[130px]">
          <WLabel text={t("distribution")} />
          <select
            value={analyzeParams.distribution_type}
            onChange={(e) => setParam("distribution_type")(e.target.value as DistributionType)}
            className={`${IB} ${IB_OK} py-1.5`}
          >
            <option value="normal">{t("distributionNormal")}</option>
            <option value="t">{t("distributionT")}</option>
            <option value="chi_squared">{t("distributionChiSquared")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 w-24">
          <WLabel text={t("confidencePercent")} />
          <input
            type="number"
            value={analyzeParams.confidence_level}
            onChange={(e) => setParam("confidence_level")(parseFloat(e.target.value) || 95)}
            min={50} max={99.99} step={0.5}
            className={`${IB} ${IB_OK} py-1.5`}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[170px]">
          <WLabel text={t("decisionRuleLabel")} />
          <select
            value={decisionRule}
            onChange={(e) => onDecisionRuleChange(e.target.value as DecisionRule)}
            className={`${IB} ${IB_OK} py-1.5`}
          >
            <option value="simple_acceptance">{tDecisionRule("simple_acceptance")}</option>
            <option value="guard_band_w_uncertainty">{tDecisionRule("guard_band_w_uncertainty")}</option>
            <option value="shared_risk">{tDecisionRule("shared_risk")}</option>
          </select>
        </div>
        {/* Sensor nominal accuracy (Type B) — pre-filled from the channel's
            manufacturer spec but editable per calibration; the uncertainty
            actually used belongs to this calibration event, not the channel. */}
        <div className="flex flex-col gap-1 w-36">
          <WLabel text={t("sensorNominalAccuracy")} />
          <input
            type="number"
            value={sensorNominalUncertaintyManual}
            onChange={(e) => onSensorNominalUncertaintyManualChange(e.target.value)}
            min={0} step="any"
            placeholder={t("fromDatasheet")}
            className={`${IB} ${IB_OK} py-1.5`}
          />
        </div>
        {sensorNominalUncertaintyManual.trim() !== "" && !isNaN(parseFloat(sensorNominalUncertaintyManual)) && (
          <div className="flex flex-col gap-1 justify-end pb-1.5">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <ToggleSwitch checked={includeSensorNominalUncertainty} onChange={onIncludeSensorNominalUncertaintyChange} size="sm" />
              {t("includeInBudget")}
            </label>
          </div>
        )}
        {/* Reference standard uncertainty (Type B) — auto-fetched from the
            selected reference asset's last calibration when available;
            otherwise a manual fallback for external reference standards. */}
        {referenceStandardAutoLoading ? (
          <div className="flex flex-col gap-1 justify-end pb-1.5">
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
              {t("loadingReferenceStandard")}
            </span>
          </div>
        ) : referenceStandardAuto ? (
          <div className="flex flex-col gap-1 justify-end pb-1.5">
            <span className="text-xs text-gray-400">
              {t("refStandardU")}: <span className="font-mono text-og-text">{fmtN(referenceStandardAuto.expandedUncertainty)}</span> {referenceUnit}
              {referenceAssetName && <span className="text-gray-400"> {t("lastCalibrationOf", { name: referenceAssetName })}</span>}
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1 w-36">
              <WLabel text={t("refStandardUManual")} />
              <input
                type="number"
                value={referenceStandardManualUncertainty}
                onChange={(e) => onReferenceStandardManualUncertaintyChange(e.target.value)}
                min={0} step="any"
                placeholder={t("fromCert")}
                className={`${IB} ${IB_OK} py-1.5`}
              />
            </div>
            {referenceStandardManualUncertainty.trim() !== "" && (
              <div className="flex flex-col gap-1 w-20">
                <WLabel text={t("refStdK")} />
                <input
                  type="number"
                  value={referenceStandardManualCoverageFactor}
                  onChange={(e) => onReferenceStandardManualCoverageFactorChange(e.target.value)}
                  min={1} max={5} step={0.1}
                  className={`${IB} ${IB_OK} py-1.5`}
                />
              </div>
            )}
          </>
        )}
        {analyzing && (
          <div className="ml-auto flex items-end">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-3.5 h-3.5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
              {t("analyzing")}
            </div>
          </div>
        )}
      </div>

      {/* Equation display — raw_data shows the fitted curve; model_direct
          shows the declared model (formula-aware); reference_vs_indicated
          has no transference function, so no equation at all. */}
      {result && !analyzing && isRawData && (
        <div className="px-4 py-2 rounded-lg bg-og-surface-alt border border-og-border">
          <span className="text-[11px] text-gray-400 mr-2">{t("equation")}</span>
          <span className="text-xs font-mono text-og-text">
            {formatEquation(result.coefficients, result.poly_degree ?? 0)}
          </span>
          <span className="text-[11px] text-gray-400 ml-2">
            ({measuredUnit} → {referenceUnit})
          </span>
        </div>
      )}
      {result && !analyzing && isModelDirect && (
        <div className="px-4 py-2 rounded-lg bg-og-surface-alt border border-og-border">
          <span className="text-[11px] text-gray-400 mr-2">{t("equation")}</span>
          <span className="text-xs font-mono text-og-text">
            {manualCoeff.model_type === "custom_formula"
              ? `f(x) = ${manualCoeff.custom_formula}`
              : formatEquation(manualCoeff.coefficients.map((c) => parseFloat(c)), manualCoeff.poly_order)}
          </span>
          {referenceUnit && <span className="text-[11px] text-gray-400 ml-2">({referenceUnit})</span>}
        </div>
      )}

      {analyzeError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900/30">
          <WarningIcon size={13} />
          {analyzeError}
        </div>
      )}

      {result && !analyzing && (
        <div className="flex gap-4 min-h-0">
          {/* Left: stats + uncertainty (40%, full width when there's no chart panel) */}
          <div className={`${showChartPanel ? "w-[40%] shrink-0" : "w-full max-w-xl"} rounded-xl border border-og-border p-4 bg-og-surface-alt`}>
            <p className="text-xs font-semibold text-og-text mb-2">{t("calibration")}</p>
            <StatRow label={t("validRange")} value={`${fmtN(result.valid_range_min)} – ${fmtN(result.valid_range_max)} ${referenceUnit}`} />
            {isRawData && <StatRow label={t("polynomialDegree")} value={String(result.poly_degree)} />}
            {/* model_direct's "residuals" are two synthetic zero-error corner
                points — r²/RMSE/max error/%FS/repeatability/hysteresis would
                all be trivial artifacts of that (1.0, 0, 0, 0%…), not real
                statistics, so only reference_vs_indicated (real, fit-free
                residuals) and raw_data (real, fitted residuals) show them. */}
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
            {result.conformity_statement.specification && (
              <>
                <p className="text-xs font-semibold text-og-text pt-3 border-t border-og-border mb-2">{t("conformity")}</p>
                <div className="flex items-center justify-between gap-2 py-1">
                  <span className="text-xs text-gray-400">{t("statement")}</span>
                  <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                    result.passed
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50"
                      : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:border-red-900/50"
                  }`}>
                    {result.passed ? <CheckIcon size={12} /> : <WarningIcon size={12} />}
                    {result.passed ? t("conforms") : t("doesNotConform")}
                  </span>
                </div>
                <StatRow label={t("specification")} value={result.conformity_statement.specification} />
                <StatRow
                  label={t("decisionRuleLabel")}
                  value={translateDynamic(tDecisionRule, result.conformity_statement.decision_rule)}
                  tip={t("tips.decisionRuleCert")}
                  docsHref={STAT_DOCS_LINKS.decision_rule}
                />
              </>
            )}
          </div>

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
                        `${t("measured")} (${measuredUnit})`,
                        `${t("reference")} (${referenceUnit})`,
                        `${t("fitted")} (${referenceUnit})`,
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
                        <td className="px-3 py-1.5 font-mono text-og-text">{fmtN(pt.calculated_value)}</td>
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
  asFoundResult, asLeftResult, analyzing, analyzeError, referenceUnit,
  analyzeParams, onAnalyzeParamsChange,
  includeSensorNominalUncertainty, onIncludeSensorNominalUncertaintyChange,
  sensorNominalUncertaintyManual, onSensorNominalUncertaintyManualChange,
  decisionRule, onDecisionRuleChange,
  referenceStandardAuto, referenceStandardAutoLoading, referenceAssetName,
  referenceStandardManualUncertainty, onReferenceStandardManualUncertaintyChange,
  referenceStandardManualCoverageFactor, onReferenceStandardManualCoverageFactorChange,
}: {
  asFoundResult: AnalyzeResponse | null;
  asLeftResult: AnalyzeResponse | null;
  analyzing: boolean;
  analyzeError: string | null;
  referenceUnit: string;
  analyzeParams: AnalyzeParams;
  onAnalyzeParamsChange: (p: AnalyzeParams) => void;
  includeSensorNominalUncertainty: boolean;
  onIncludeSensorNominalUncertaintyChange: (v: boolean) => void;
  sensorNominalUncertaintyManual: string;
  onSensorNominalUncertaintyManualChange: (v: string) => void;
  decisionRule: DecisionRule;
  onDecisionRuleChange: (v: DecisionRule) => void;
  referenceStandardAuto: { expandedUncertainty: number; coverageFactor: number } | null;
  referenceStandardAutoLoading: boolean;
  referenceAssetName: string | null;
  referenceStandardManualUncertainty: string;
  onReferenceStandardManualUncertaintyChange: (v: string) => void;
  referenceStandardManualCoverageFactor: string;
  onReferenceStandardManualCoverageFactorChange: (v: string) => void;
}) {
  const t = useTranslations("assets.wizard");
  const tUncertaintySource = useTranslations("tokens.uncertaintySource");
  const tDecisionRule = useTranslations("tokens.decisionRule");
  const setParam = <K extends keyof AnalyzeParams>(key: K) => (value: AnalyzeParams[K]) =>
    onAnalyzeParamsChange({ ...analyzeParams, [key]: value });

  function panel(label: string, result: AnalyzeResponse | null, primary: boolean) {
    return (
      <div className="flex-1 min-w-0 space-y-3">
        <p className="text-xs font-semibold text-og-text flex items-center gap-2">
          {label}
          {!primary && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-og-surface-alt border border-og-border text-gray-400">
              {t("diagnosticOnly")}
            </span>
          )}
        </p>
        {result ? (
          <>
            <div className="rounded-xl border border-og-border p-4 bg-og-surface-alt">
              <StatRow label={t("validRange")} value={`${fmtN(result.valid_range_min)} – ${fmtN(result.valid_range_max)} ${referenceUnit}`} />
              <p className="text-xs font-semibold text-og-text pt-3 border-t border-og-border mb-2">{t("statistics")}</p>
              <StatRow label={t("rSquared")} value={fmtN(result.r_squared, 6)} tip={t("tips.rSquared")} docsHref={STAT_DOCS_LINKS.r_squared} />
              <StatRow label={t("rmse")} value={`${fmtN(result.rmse)} ${referenceUnit}`} tip={t("tips.rmse")} docsHref={STAT_DOCS_LINKS.rmse} />
              <StatRow label={t("maxError")} value={`${fmtN(result.max_error)} ${referenceUnit}`} tip={t("tips.maxError")} docsHref={STAT_DOCS_LINKS.max_error} />
              <StatRow label={t("fsError")} value={`${fmtN(result.full_scale_error_pct, 3)}%`} tip={t("tips.fsError")} docsHref={STAT_DOCS_LINKS.full_scale_error} />
              {result.repeatability != null && (
                <StatRow label={t("repeatability")} value={`${fmtN(result.repeatability)} ${referenceUnit}`} tip={t("tips.repeatability")} docsHref={STAT_DOCS_LINKS.repeatability} />
              )}
              {result.hysteresis != null && (
                <StatRow label={t("hysteresis")} value={`${fmtN(result.hysteresis)} ${referenceUnit}`} tip={t("tips.hysteresis")} docsHref={STAT_DOCS_LINKS.hysteresis} />
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
              <StatRow label={t("combinedRss")} value={`${fmtN(result.combined_uncertainty)} ${referenceUnit}`} tip={t("tips.combinedRss")} docsHref={STAT_DOCS_LINKS.combined_uncertainty} />
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
              {result.conformity_statement.specification && (
                <>
                  <p className="text-xs font-semibold text-og-text pt-3 border-t border-og-border mb-2">{t("conformity")}</p>
                  <div className="flex items-center justify-between gap-2 py-1">
                    <span className="text-xs text-gray-400">{t("statement")}</span>
                    <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                      result.passed
                        ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50"
                        : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:border-red-900/50"
                    }`}>
                      {result.passed ? <CheckIcon size={12} /> : <WarningIcon size={12} />}
                      {result.passed ? t("conforms") : t("doesNotConform")}
                    </span>
                  </div>
                  <StatRow label={t("specification")} value={result.conformity_statement.specification} />
                  <StatRow
                    label={t("decisionRuleLabel")}
                    value={translateDynamic(tDecisionRule, result.conformity_statement.decision_rule)}
                    tip={t("tips.decisionRuleCert")}
                    docsHref={STAT_DOCS_LINKS.decision_rule}
                  />
                </>
              )}
            </div>
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
    <div className="p-5 space-y-4">
      {/* Controls row — shared Type B budget, same as raw_data's Step3 */}
      <div className="flex flex-wrap gap-3 p-4 bg-og-surface-alt rounded-xl border border-og-border">
        <div className="flex flex-col gap-1 min-w-[130px]">
          <WLabel text={t("distribution")} />
          <select
            value={analyzeParams.distribution_type}
            onChange={(e) => setParam("distribution_type")(e.target.value as DistributionType)}
            className={`${IB} ${IB_OK} py-1.5`}
          >
            <option value="normal">{t("distributionNormal")}</option>
            <option value="t">{t("distributionT")}</option>
            <option value="chi_squared">{t("distributionChiSquared")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 w-24">
          <WLabel text={t("confidencePercent")} />
          <input
            type="number"
            value={analyzeParams.confidence_level}
            onChange={(e) => setParam("confidence_level")(parseFloat(e.target.value) || 95)}
            min={50} max={99.99} step={0.5}
            className={`${IB} ${IB_OK} py-1.5`}
          />
        </div>
        <div className="flex flex-col gap-1 min-w-[170px]">
          <WLabel text={t("decisionRuleLabel")} />
          <select
            value={decisionRule}
            onChange={(e) => onDecisionRuleChange(e.target.value as DecisionRule)}
            className={`${IB} ${IB_OK} py-1.5`}
          >
            <option value="simple_acceptance">{tDecisionRule("simple_acceptance")}</option>
            <option value="guard_band_w_uncertainty">{tDecisionRule("guard_band_w_uncertainty")}</option>
            <option value="shared_risk">{tDecisionRule("shared_risk")}</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 w-36">
          <WLabel text={t("sensorNominalAccuracy")} />
          <input
            type="number"
            value={sensorNominalUncertaintyManual}
            onChange={(e) => onSensorNominalUncertaintyManualChange(e.target.value)}
            min={0} step="any"
            placeholder={t("fromDatasheet")}
            className={`${IB} ${IB_OK} py-1.5`}
          />
        </div>
        {sensorNominalUncertaintyManual.trim() !== "" && !isNaN(parseFloat(sensorNominalUncertaintyManual)) && (
          <div className="flex flex-col gap-1 justify-end pb-1.5">
            <label className="flex items-center gap-1.5 text-xs text-gray-400 cursor-pointer">
              <ToggleSwitch checked={includeSensorNominalUncertainty} onChange={onIncludeSensorNominalUncertaintyChange} size="sm" />
              {t("includeInBudget")}
            </label>
          </div>
        )}
        {referenceStandardAutoLoading ? (
          <div className="flex flex-col gap-1 justify-end pb-1.5">
            <span className="text-xs text-gray-400 flex items-center gap-1.5">
              <span className="w-3 h-3 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
              {t("loadingReferenceStandard")}
            </span>
          </div>
        ) : referenceStandardAuto ? (
          <div className="flex flex-col gap-1 justify-end pb-1.5">
            <span className="text-xs text-gray-400">
              {t("refStandardU")}: <span className="font-mono text-og-text">{fmtN(referenceStandardAuto.expandedUncertainty)}</span> {referenceUnit}
              {referenceAssetName && <span className="text-gray-400"> {t("lastCalibrationOf", { name: referenceAssetName })}</span>}
            </span>
          </div>
        ) : (
          <>
            <div className="flex flex-col gap-1 w-36">
              <WLabel text={t("refStandardUManual")} />
              <input
                type="number"
                value={referenceStandardManualUncertainty}
                onChange={(e) => onReferenceStandardManualUncertaintyChange(e.target.value)}
                min={0} step="any"
                placeholder={t("fromCert")}
                className={`${IB} ${IB_OK} py-1.5`}
              />
            </div>
            {referenceStandardManualUncertainty.trim() !== "" && (
              <div className="flex flex-col gap-1 w-20">
                <WLabel text={t("refStdK")} />
                <input
                  type="number"
                  value={referenceStandardManualCoverageFactor}
                  onChange={(e) => onReferenceStandardManualCoverageFactorChange(e.target.value)}
                  min={1} max={5} step={0.1}
                  className={`${IB} ${IB_OK} py-1.5`}
                />
              </div>
            )}
          </>
        )}
        {analyzing && (
          <div className="ml-auto flex items-end">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-3.5 h-3.5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
              {t("analyzing")}
            </div>
          </div>
        )}
      </div>

      {analyzeError && (
        <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 dark:bg-red-950/20 rounded-lg px-3 py-2 border border-red-200 dark:border-red-900/30">
          <WarningIcon size={13} />
          {analyzeError}
        </div>
      )}

      <div className="flex gap-4">
        {panel(t("asFoundData"), asFoundResult, false)}
        {panel(t("asLeftData"), asLeftResult, true)}
      </div>
    </div>
  );
}
