"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetProfile } from "@/types/asset";
import type {
  AnalyzeRequest, AnalyzeResponse, CalibrationCreateBody,
  CalibrationPointInline,
  DistributionType, WizardRawPoint,
} from "@/types/calibration";
import { analyzeCalibration, createCalibration, listAssets, listProcedures } from "@/services/asset.service";
import { listCalibrationLabs } from "@/services/location.service";
import { COLORS } from "@/lib/tokens";
import { getUnitsForQuantity, getOutputUnits } from "@/lib/sensor-options";
import { useAuth } from "@/lib/auth-context";
import {
  CheckIcon, ChevronDownIcon, InfoIcon, PlusIcon, TrashIcon, WarningIcon, XIcon,
} from "@/components/icons";

// ---------------------------------------------------------------------------
// Shared mini-field components (inlined to avoid page.tsx coupling)
// ---------------------------------------------------------------------------

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-mar-text bg-mar-surface focus:outline-none focus:ring-1 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600";
const IB_OK = "border-mar-border-md focus:border-mar-accent focus:ring-mar-accent/20";
const IB_ERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

function WLabel({ text, required }: { text: string; required?: boolean }) {
  return (
    <span className="text-xs text-gray-400">
      {text}{required && <span className="text-red-400 ml-0.5">*</span>}
    </span>
  );
}

function WInput({
  label, value, onChange, type = "text", placeholder, required, readOnly, error,
}: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; placeholder?: string; required?: boolean; readOnly?: boolean; error?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <WLabel text={label} required={required} />
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
  label, value, onChange, options, required, placeholder,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <WLabel text={label} required={required} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${IB} ${IB_OK}`}
      >
        <option value="">{placeholder ?? "Select…"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function WCheckbox({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded border-mar-border-md accent-mar-accent"
      />
      <span className="text-sm text-mar-text">{label}</span>
    </label>
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
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-semibold flex-shrink-0
                ${done ? "bg-mar-accent text-white" : active ? "bg-mar-action text-white" : "bg-mar-surface-alt text-gray-400 border border-mar-border-md"}`}>
                {done ? <CheckIcon size={12} /> : n}
              </div>
              <span className={`text-xs font-medium hidden sm:block ${active ? "text-mar-text" : done ? "text-mar-accent" : "text-gray-400"}`}>
                {label}
              </span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-8 h-px mx-2 ${done ? "bg-mar-accent" : "bg-mar-border-md"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stat row (for the summary panel in Step 3)
// ---------------------------------------------------------------------------

function StatRow({ label, value, tip }: { label: string; value: string | null | undefined; tip?: string }) {
  if (value == null) return null;
  return (
    <div className="flex items-center justify-between gap-2 py-1.5 border-b border-mar-border last:border-b-0">
      <span className="flex items-center gap-1 text-xs text-gray-400">
        {label}
        {tip && (
          <span className="relative group/t">
            <InfoIcon size={10} className="cursor-help" />
            <span className="pointer-events-none absolute bottom-full left-0 mb-1.5 hidden group-hover/t:block w-56 bg-gray-900 text-white text-[10px] rounded px-2 py-1.5 z-50 shadow-lg whitespace-normal">
              {tip}
            </span>
          </span>
        )}
      </span>
      <span className="text-xs font-mono text-mar-text">{value}</span>
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

// Format polynomial as human-readable equation string — ascending order: a₀ + a₁·x + a₂·x² + …
function formatEquation(coefficients: number[], degree: number): string {
  const SUPERS: Record<number, string> = { 2: "²", 3: "³", 4: "⁴", 5: "⁵" };
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
  calibration_type: "internal" | "external";
  performed_by_name: string;
  performed_by_other: boolean;
  calibration_interval: string;
  external_lab_name: string;
  external_lab_certificate_number: string;
  coefficients_only: boolean;
  internal_procedure_id: string;
  internal_reference_asset_id: string;
  calibration_location_id: string;
  temperature_value: string;
  temperature_unit: string;
  pressure_value: string;
  pressure_unit: string;
  humidity_value: string;
  humidity_unit: string;
  notes: string;
  env_expanded: boolean;
}

interface AnalyzeParams {
  poly_degree: number | null;
  distribution_type: DistributionType;
  confidence_level: number;
  coverage_factor: number;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface CalibrationWizardProps {
  assetId: string;
  profile: AssetProfile;
  onClose: () => void;
  onSaved: () => void;
}

export function CalibrationWizard({ assetId, profile, onClose, onSaved }: CalibrationWizardProps) {
  const { user } = useAuth();
  const [step, setStep] = useState<1 | 2 | 3>(1);

  const [step1, setStep1] = useState<Step1State>({
    sensor_id: profile.sensor_channels[0]?.id ?? "",
    calibration_date: todayIso(),
    calibration_type: "internal",
    performed_by_name: user.name,
    performed_by_other: false,
    calibration_interval: "12",
    external_lab_name: "",
    external_lab_certificate_number: "",
    coefficients_only: false,
    internal_procedure_id: "",
    internal_reference_asset_id: "",
    calibration_location_id: "",
    temperature_value: "",
    temperature_unit: "°C",
    pressure_value: "",
    pressure_unit: "Pa",
    humidity_value: "",
    humidity_unit: "%RH",
    notes: "",
    env_expanded: false,
  });

  // Reference assets, calibration methods, and calibration labs (loaded once)
  const [referenceAssets, setReferenceAssets] = useState<{ id: string; name: string; asset_id: string }[]>([]);
  const [calibrationMethods, setCalibrationMethods] = useState<{ id: string; name: string }[]>([]);
  const [calibrationLabs, setCalibrationLabs] = useState<{ id: string; name: string }[]>([]);

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

  // Step 3: analysis
  const [analyzeParams, setAnalyzeParams] = useState<AnalyzeParams>({
    poly_degree: null,
    distribution_type: "normal",
    confidence_level: 95.0,
    coverage_factor: 2.0,
  });
  const [analysisResult, setAnalysisResult] = useState<AnalyzeResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  // Tolerance criteria (lifted from Step3 so the confirm modal can use uiPassed)
  const [toleranceCriteria, setToleranceCriteria] = useState<ToleranceCriteria>("percent_fs");
  const [toleranceThreshold, setToleranceThreshold] = useState<string>("1");

  const uiPassed = (() => {
    if (!analysisResult || !toleranceThreshold.trim()) return null;
    const t = parseFloat(toleranceThreshold);
    if (isNaN(t) || t <= 0) return null;
    switch (toleranceCriteria) {
      case "absolute": return analysisResult.max_error <= t;
      case "percent_reading": return analysisResult.points.every((p) =>
        Math.abs(p.reference_value) > 0
          ? Math.abs(p.residual_abs ?? 0) / Math.abs(p.reference_value) * 100 <= t
          : true
      );
      case "percent_fs": return analysisResult.full_scale_error_pct <= t;
      case "with_uncertainty": return analysisResult.max_error + analysisResult.expanded_uncertainty <= t;
    }
  })();

  // Confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Validation helpers
  // ---------------------------------------------------------------------------

  const selectedChannel = profile.sensor_channels.find((c) => c.id === step1.sensor_id)
    ?? profile.sensor_channels[0];

  const validPoints = rawPoints.filter(
    (p) => p.reference.trim() !== "" && p.measured.trim() !== "" &&
      !isNaN(parseFloat(p.reference)) && !isNaN(parseFloat(p.measured))
  );

  function isNumOrEmpty(v: string): boolean {
    return v.trim() === "" || !isNaN(parseFloat(v.trim()));
  }

  const step1Valid =
    step1.performed_by_name.trim() !== "" &&
    step1.sensor_id !== "" &&
    step1.calibration_interval.trim() !== "" &&
    !isNaN(parseInt(step1.calibration_interval)) &&
    isNumOrEmpty(step1.temperature_value) &&
    isNumOrEmpty(step1.pressure_value) &&
    isNumOrEmpty(step1.humidity_value);
  const step2Valid = step1.coefficients_only || validPoints.length >= 2;

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

  // ---------------------------------------------------------------------------
  // Analysis debounce (Step 3) — stable, no blinking
  // ---------------------------------------------------------------------------

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAnalysisKeyRef = useRef<string>("");

  // Trigger analysis when entering step 3 or when inputs change
  useEffect(() => {
    if (step !== 3 || step1.coefficients_only) return;

    const vp = rawPoints.filter(
      (p) =>
        p.reference.trim() !== "" &&
        p.measured.trim() !== "" &&
        !isNaN(parseFloat(p.reference)) &&
        !isNaN(parseFloat(p.measured))
    );
    if (vp.length < 2) return;

    const key = JSON.stringify({ vp, referenceUnit, measuredUnit, analyzeParams });
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
        distribution_type: analyzeParams.distribution_type,
        confidence_level: analyzeParams.confidence_level,
        coverage_factor: analyzeParams.coverage_factor,
        channel_accuracy_value: selectedChannel?.accuracy_value ?? null,
        channel_accuracy_type: selectedChannel?.accuracy_type ?? null,
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
  }, [step, rawPoints, referenceUnit, measuredUnit, analyzeParams, step1.coefficients_only, selectedChannel]);

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

  // ---------------------------------------------------------------------------
  // Save
  // ---------------------------------------------------------------------------

  async function handleSave() {
    if (!analysisResult && !step1.coefficients_only) return;

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

      // Convert to canonical units: °C, %RH, Pa
      const temperatureCelsius: number | null = (() => {
        if (tempVal == null) return null;
        const unit = step1.temperature_unit;
        if (unit === "°F") return Math.round(((tempVal - 32) * 5 / 9) * 100) / 100;
        if (unit === "K") return Math.round((tempVal - 273.15) * 100) / 100;
        return tempVal;
      })();
      const pressurePa: number | null = (() => {
        if (pressVal == null) return null;
        const unit = step1.pressure_unit;
        if (unit === "hPa" || unit === "mbar") return Math.round(pressVal * 100 * 100) / 100;
        if (unit === "kPa") return Math.round(pressVal * 1000 * 100) / 100;
        if (unit === "bar") return Math.round(pressVal * 100000 * 100) / 100;
        if (unit === "psi") return Math.round(pressVal * 6894.757 * 100) / 100;
        return pressVal;
      })();

      let points: CalibrationPointInline[] = [];
      let polyStats: Partial<CalibrationCreateBody> = {};

      if (!step1.coefficients_only && analysisResult) {
        // Store point values and ranges in the display units that were used for regression.
        // The polynomial coefficients are fitted in display units (f(measured_display) = ref_display),
        // so all stored values must stay in display units — converting to SI would break
        // the stored curve vs. stored points consistency shown in the calibration chart.
        polyStats = {
          poly_order: analysisResult.poly_degree,
          poly_coefficients: analysisResult.coefficients,
          range_min: analysisResult.valid_range_min,
          range_max: analysisResult.valid_range_max,
          r_squared: analysisResult.r_squared,
          rmse: analysisResult.rmse,
          standard_error: analysisResult.standard_error,
          max_error: analysisResult.max_error,
          full_scale_error: analysisResult.full_scale_error_pct,
          non_linearity: analysisResult.non_linearity_pct,
          repeatability: analysisResult.repeatability,
          hysteresis: analysisResult.hysteresis,
          distribution_type: analysisResult.distribution_type,
          confidence_level: analysisResult.confidence_level,
          coverage_factor: analysisResult.coverage_factor,
          combined_uncertainty: analysisResult.combined_uncertainty,
          expanded_uncertainty: analysisResult.expanded_uncertainty,
          valid_range_min: analysisResult.valid_range_min,
          valid_range_max: analysisResult.valid_range_max,
        };
        points = analysisResult.points.map((p) => ({
          point_index: p.point_index,
          reference_value: p.reference_value,
          measured_value: p.measured_value,
          calculated_value: p.calculated_value ?? null,
          residual_abs: p.residual_abs,
          residual_pct: p.residual_pct,
          reference_unit: referenceUnit,
          measured_unit: measuredUnit,
        }));
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
        calibration_type: step1.calibration_type,
        calibration_version: 1,
        external_lab_name: step1.external_lab_name || null,
        external_lab_certificate_number: step1.external_lab_certificate_number || null,
        internal_procedure_id: step1.internal_procedure_id || null,
        internal_reference_asset_id: step1.internal_reference_asset_id || null,
        calibration_location_id: step1.calibration_location_id || null,
        calibration_interval: parseInt(step1.calibration_interval) || null,
        temperature: temperatureCelsius,
        humidity: humVal,
        pressure: pressurePa,
        notes: step1.notes || null,
        ...polyStats,
        points,
      };

      await createCalibration(body);
      setConfirmOpen(false);
      onSaved();
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save calibration");
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
      <div className="relative z-10 w-full max-w-5xl max-h-[92vh] bg-mar-surface border border-mar-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-mar-border flex-shrink-0">
          <div>
            <h2 className="text-base font-semibold text-mar-text">Add Calibration Record</h2>
            <p className="text-xs text-gray-400 mt-0.5">{profile.name} · {profile.asset_id}</p>
          </div>
          <div className="flex items-center gap-6">
            <StepIndicator step={step} steps={["General Info", "Raw Data", "Analysis"]} />
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors"
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
              currentUserName={user.name}
              referenceAssets={referenceAssets}
              calibrationMethods={calibrationMethods}
              calibrationLabs={calibrationLabs}
              onReferenceUnitChange={setReferenceUnit}
              onMeasuredUnitChange={setMeasuredUnit}
            />
          )}
          {step === 2 && (
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
            />
          )}
          {step === 3 && (
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
              coefficientsOnly={step1.coefficients_only}
              toleranceCriteria={toleranceCriteria}
              onToleranceCriteriaChange={setToleranceCriteria}
              toleranceThreshold={toleranceThreshold}
              onToleranceThresholdChange={setToleranceThreshold}
              uiPassed={uiPassed}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-mar-border flex-shrink-0">
          <button
            type="button"
            onClick={() => setStep((s) => Math.max(1, s - 1) as 1 | 2 | 3)}
            disabled={step === 1}
            className="px-4 py-2 text-sm font-medium rounded-lg border border-mar-border-md text-mar-text hover:bg-mar-surface-alt disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Back
          </button>

          {step < 3 ? (
            <button
              type="button"
              onClick={() => {
                if (step === 1 && !step1Valid) return;
                if (step === 2 && !step2Valid) return;
                // Skip step 2 if coefficients_only
                if (step === 1 && step1.coefficients_only) {
                  setStep(3);
                } else {
                  setStep((s) => (s + 1) as 2 | 3);
                }
              }}
              disabled={(step === 1 && !step1Valid) || (step === 2 && !step2Valid)}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-mar-action hover:bg-mar-action-dark text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              disabled={!step1.coefficients_only && (analyzing || !analysisResult)}
              className="px-5 py-2 text-sm font-medium rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Confirm &amp; Save
            </button>
          )}
        </div>
      </div>

      {/* Confirm dialog */}
      {confirmOpen && (
        <div className="absolute inset-0 z-20 flex items-center justify-center">
          <div className="bg-mar-surface border border-mar-border rounded-xl shadow-2xl p-6 w-96 mx-auto">
            <h3 className="text-sm font-semibold text-mar-text mb-3">Save calibration record?</h3>
            {uiPassed === true && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-900/30 mb-3">
                <CheckIcon size={13} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-700 dark:text-emerald-400">
                  Calibration meets the tolerance criteria. You can safely save this record.
                </p>
              </div>
            )}
            {uiPassed === false && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 mb-3">
                <WarningIcon size={13} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-xs text-amber-700 dark:text-amber-400">
                  This calibration does not meet the tolerance criteria. Do you want to save it anyway?
                </p>
              </div>
            )}
            <p className="text-xs text-gray-400 mb-4">
              This will permanently create a new calibration version. Calibration records cannot be modified after creation.
            </p>
            {saveError && <p className="text-xs text-red-500 mb-3">{saveError}</p>}
            <div className="flex gap-2 justify-end">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                disabled={saving}
                className="px-3 py-1.5 text-sm rounded-lg border border-mar-border-md text-mar-text hover:bg-mar-surface-alt transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className={`px-3 py-1.5 text-sm rounded-lg text-white flex items-center gap-1.5 transition-colors disabled:opacity-50 ${
                  uiPassed === false
                    ? "bg-amber-600 hover:bg-amber-700"
                    : "bg-emerald-600 hover:bg-emerald-700"
                }`}
              >
                {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {uiPassed === false ? "Save anyway" : "Save"}
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
  state, onChange, profile, currentUserName, referenceAssets, calibrationMethods,
  calibrationLabs, onReferenceUnitChange, onMeasuredUnitChange,
}: {
  state: Step1State;
  onChange: (s: Step1State) => void;
  profile: AssetProfile;
  currentUserName: string;
  referenceAssets: { id: string; name: string; asset_id: string }[];
  calibrationMethods: { id: string; name: string }[];
  calibrationLabs: { id: string; name: string }[];
  onReferenceUnitChange: (u: string) => void;
  onMeasuredUnitChange: (u: string) => void;
}) {
  const set = (key: keyof Step1State) => (value: string | boolean) =>
    onChange({ ...state, [key]: value });

  const selectedChannel = profile.sensor_channels.find((c) => c.id === state.sensor_id);

  return (
    <div className="p-6 space-y-5">
      {/* Channel + date row */}
      <div className={`grid gap-4 ${profile.sensor_channels.length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
        {profile.sensor_channels.length > 1 && (
          <WSelect
            label="Channel"
            value={state.sensor_id}
            onChange={(v) => {
              const ch = profile.sensor_channels.find((c) => c.id === v);
              onChange({ ...state, sensor_id: v });
              onReferenceUnitChange(ch?.unit ?? "");
              onMeasuredUnitChange(ch?.output_signal_unit ?? ch?.unit ?? "");
            }}
            options={profile.sensor_channels.map((c) => ({
              value: c.id,
              label: `${c.channel_id} — ${c.physical_quantity}`,
            }))}
            required
          />
        )}
        <WInput
          label="Calibration date"
          type="date"
          value={state.calibration_date}
          onChange={set("calibration_date")}
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* Performed by: dropdown with current user + Other */}
        <div className="flex flex-col gap-1">
          <WLabel text="Performed by" required />
          {!state.performed_by_other ? (
            <select
              value={state.performed_by_name || currentUserName}
              onChange={(e) => {
                if (e.target.value === "__other__") {
                  onChange({ ...state, performed_by_other: true, performed_by_name: "" });
                } else {
                  onChange({ ...state, performed_by_name: e.target.value });
                }
              }}
              className={`${IB} ${IB_OK}`}
            >
              <option value={currentUserName}>{currentUserName}</option>
              <option value="__other__">Other…</option>
            </select>
          ) : (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={state.performed_by_name}
                onChange={(e) => onChange({ ...state, performed_by_name: e.target.value })}
                placeholder="Name or organization"
                className={`${IB} ${IB_OK} flex-1`}
                autoFocus
              />
              <button
                type="button"
                title="Use my name"
                onClick={() => onChange({ ...state, performed_by_other: false, performed_by_name: currentUserName })}
                className="shrink-0 text-gray-400 hover:text-mar-text text-lg leading-none px-1"
              >
                ×
              </button>
            </div>
          )}
        </div>
        <WInput
          label="Calibration interval (months)"
          type="number"
          value={state.calibration_interval}
          onChange={set("calibration_interval") as (v: string) => void}
          placeholder={String(selectedChannel?.calibration_interval ?? 12)}
          required
        />
      </div>

      {/* Calibration type + lab */}
      <div className="grid grid-cols-2 gap-4">
        <WSelect
          label="Calibration type"
          value={state.calibration_type}
          onChange={set("calibration_type") as (v: string) => void}
          options={[
            { value: "external", label: "External" },
            { value: "internal", label: "Internal" },
          ]}
          required
        />
        <WSelect
          label="Calibration lab"
          value={state.calibration_location_id}
          onChange={set("calibration_location_id") as (v: string) => void}
          options={calibrationLabs.map((l) => ({ value: l.id, label: l.name }))}
          placeholder={calibrationLabs.length === 0 ? "No calibration labs configured" : "Select lab…"}
        />
      </div>

      {/* External fields */}
      {state.calibration_type === "external" && (
        <div className="space-y-4 pl-4 border-l-2 border-mar-border">
          <div className="grid grid-cols-2 gap-4">
            <WInput label="Calibration provider" value={state.external_lab_name} onChange={set("external_lab_name") as (v: string) => void} />
            <WInput label="Certificate number" value={state.external_lab_certificate_number} onChange={set("external_lab_certificate_number") as (v: string) => void} />
          </div>
          <div className="flex items-center pt-1">
            <WCheckbox
              label="Coefficients only (no raw data)"
              checked={state.coefficients_only}
              onChange={set("coefficients_only") as (v: boolean) => void}
            />
          </div>
        </div>
      )}

      {/* Internal fields */}
      {state.calibration_type === "internal" && (
        <div className="space-y-4 pl-4 border-l-2 border-mar-border">
          <div className="grid grid-cols-2 gap-4">
            <WSelect
              label="Reference asset"
              value={state.internal_reference_asset_id}
              onChange={set("internal_reference_asset_id") as (v: string) => void}
              options={referenceAssets.map((a) => ({ value: a.id, label: `${a.name} (${a.asset_id})` }))}
              placeholder="Select reference…"
            />
            <WSelect
              label="Calibration method"
              value={state.internal_procedure_id}
              onChange={set("internal_procedure_id") as (v: string) => void}
              options={calibrationMethods.map((m) => ({ value: m.id, label: m.name }))}
              placeholder="Select method…"
            />
          </div>
        </div>
      )}

      {/* Environmental conditions */}
      <div className="border border-mar-border rounded-lg overflow-hidden">
        <button
          type="button"
          onClick={() => onChange({ ...state, env_expanded: !state.env_expanded })}
          className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-mar-text hover:bg-mar-surface-alt transition-colors"
        >
          <span>Environmental conditions <span className="text-xs text-gray-400 font-normal ml-1">(optional)</span></span>
          <ChevronDownIcon size={14} className={`text-gray-400 transition-transform ${state.env_expanded ? "rotate-180" : ""}`} />
        </button>
        {state.env_expanded && (
          <div className="px-4 pb-4 pt-2 space-y-4 border-t border-mar-border">
            {(() => {
              const numErr = (v: string) =>
                v.trim() !== "" && isNaN(parseFloat(v.trim())) ? "Must be a number" : undefined;
              return (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <WInput label="Temperature" value={state.temperature_value}
                      onChange={set("temperature_value") as (v: string) => void}
                      placeholder="e.g. 23" error={numErr(state.temperature_value)} />
                    <WSelect label="Unit" value={state.temperature_unit}
                      onChange={set("temperature_unit") as (v: string) => void}
                      options={[{ value: "°C", label: "°C" }, { value: "K", label: "K" }, { value: "°F", label: "°F" }]} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <WInput label="Pressure" value={state.pressure_value}
                      onChange={set("pressure_value") as (v: string) => void}
                      placeholder="e.g. 1013.25" error={numErr(state.pressure_value)} />
                    <WSelect label="Unit" value={state.pressure_unit}
                      onChange={set("pressure_unit") as (v: string) => void}
                      options={[{ value: "hPa", label: "hPa" }, { value: "Pa", label: "Pa" }, { value: "bar", label: "bar" }, { value: "psi", label: "psi" }]} />
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <WInput label="Humidity" value={state.humidity_value}
                      onChange={set("humidity_value") as (v: string) => void}
                      placeholder="e.g. 45" error={numErr(state.humidity_value)} />
                    <WSelect label="Unit" value={state.humidity_unit}
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
        <WLabel text="Notes" />
        <textarea
          value={state.notes}
          onChange={(e) => set("notes")(e.target.value)}
          rows={2}
          placeholder="Any additional notes…"
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
}) {
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
      {/* Unit selectors */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex flex-col gap-1">
          <WLabel text="Reference unit" />
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
          <WLabel text="Measured unit" />
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

      {/* Mode tabs */}
      <div className="flex gap-1 p-1 bg-mar-surface-alt rounded-lg w-fit">
        {(["manual", "csv"] as const).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onInputModeChange(m)}
            className={`px-4 py-1.5 rounded text-sm font-medium transition-colors ${
              inputMode === m ? "bg-mar-surface text-mar-text shadow-sm" : "text-gray-400 hover:text-mar-text"
            }`}
          >
            {m === "manual" ? "Manual entry" : "CSV upload"}
          </button>
        ))}
      </div>

      {inputMode === "manual" && (
        <div className="space-y-3">
          {/* Data table */}
          <div className="rounded-lg border border-mar-border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-mar-border bg-mar-surface-alt">
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium w-10">#</th>
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                    Reference {referenceUnit && <span className="font-mono ml-1">({referenceUnit})</span>}
                  </th>
                  <th className="text-left px-3 py-2 text-xs text-gray-400 font-medium">
                    Measured {measuredUnit && <span className="font-mono ml-1">({measuredUnit})</span>}
                  </th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {points.map((pt, i) => (
                  <tr key={i} className="border-b border-mar-border last:border-b-0 hover:bg-mar-surface-alt/50 transition-colors">
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
                        className="p-1 rounded text-gray-400 hover:text-red-500 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
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
            className="flex items-center gap-1.5 text-xs text-mar-accent hover:text-mar-accent-dark font-medium transition-colors"
          >
            <PlusIcon size={13} />
            Add row
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
              dragging ? "border-mar-accent bg-mar-accent/5" : "border-mar-border-md hover:border-mar-accent hover:bg-mar-surface-alt"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.txt"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) onFileUpload(f); }}
            />
            <p className="text-sm font-medium text-mar-text">Drop CSV file here or click to browse</p>
            <p className="text-xs text-gray-400 mt-1">Expected format: header row (Reference, Measured), then data rows</p>
          </div>
          {csvError && (
            <div className="flex items-start gap-2 text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/20 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-900/30">
              <WarningIcon size={13} className="flex-shrink-0 mt-0.5" />
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

type ToleranceCriteria = "absolute" | "percent_reading" | "percent_fs" | "with_uncertainty";

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
  referenceUnit, measuredUnit, hoveredPointIdx, onHoverPoint, coefficientsOnly,
  toleranceCriteria, onToleranceCriteriaChange, toleranceThreshold, onToleranceThresholdChange, uiPassed,
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
  coefficientsOnly: boolean;
  toleranceCriteria: ToleranceCriteria;
  onToleranceCriteriaChange: (v: ToleranceCriteria) => void;
  toleranceThreshold: string;
  onToleranceThresholdChange: (v: string) => void;
  uiPassed: boolean | null;
}) {
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
            `<b>Point %{customdata[0]}</b><br>` +
            `Measured: %{x:.4g} ${measuredUnit}<br>` +
            `Reference: %{y:.4g} ${referenceUnit}<br>` +
            `Residual: %{customdata[1]:.4g} ${referenceUnit}` +
            `<extra></extra>`,
          showlegend: false,
        },
      ];

      const layout: Partial<Plotly.Layout> = {
        margin: { t: 10, r: 16, b: 48, l: 56 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        xaxis: {
          title: { text: `Measured (${measuredUnit})`, font: { size: 10, color: "#9ca3af" } },
          tickfont: { size: 10, color: "#9ca3af" },
          gridcolor: "rgba(156,163,175,0.15)",
          linecolor: "rgba(156,163,175,0.3)",
          zerolinecolor: "rgba(156,163,175,0.3)",
          automargin: true,
        },
        yaxis: {
          title: { text: `Reference (${referenceUnit})`, font: { size: 10, color: "#9ca3af" } },
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

  if (coefficientsOnly) {
    return (
      <div className="p-6">
        <p className="text-sm text-gray-400">Coefficients-only mode — no analysis. Fill in the coefficient values directly after saving.</p>
      </div>
    );
  }

  const toleranceUnit = toleranceCriteria === "percent_reading" || toleranceCriteria === "percent_fs"
    ? "%" : referenceUnit;

  return (
    <div className="p-5 space-y-4">
      {/* Controls row */}
      <div className="flex flex-wrap gap-3 p-4 bg-mar-surface-alt rounded-xl border border-mar-border">
        <div className="flex flex-col gap-1 min-w-[120px]">
          <WLabel text="Regression degree" />
          <select
            value={analyzeParams.poly_degree === null ? "auto" : String(analyzeParams.poly_degree)}
            onChange={(e) => setParam("poly_degree")(e.target.value === "auto" ? null : parseInt(e.target.value))}
            className={`${IB} ${IB_OK} py-1.5`}
          >
            <option value="auto">Auto</option>
            {[1, 2, 3, 4, 5].map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1 min-w-[130px]">
          <WLabel text="Distribution" />
          <select
            value={analyzeParams.distribution_type}
            onChange={(e) => setParam("distribution_type")(e.target.value as DistributionType)}
            className={`${IB} ${IB_OK} py-1.5`}
          >
            <option value="normal">Normal</option>
            <option value="t">t-distribution</option>
            <option value="chi_squared">Chi-squared</option>
          </select>
        </div>
        <div className="flex flex-col gap-1 w-24">
          <WLabel text="Confidence %" />
          <input
            type="number"
            value={analyzeParams.confidence_level}
            onChange={(e) => setParam("confidence_level")(parseFloat(e.target.value) || 95)}
            min={50} max={99.99} step={0.5}
            className={`${IB} ${IB_OK} py-1.5`}
          />
        </div>
        <div className="flex flex-col gap-1 w-20">
          <WLabel text="Coverage k" />
          <input
            type="number"
            value={analyzeParams.coverage_factor}
            onChange={(e) => setParam("coverage_factor")(parseFloat(e.target.value) || 2)}
            min={1} max={5} step={0.1}
            className={`${IB} ${IB_OK} py-1.5`}
          />
        </div>
        {/* Divider */}
        <div className="w-px bg-mar-border-md self-stretch hidden sm:block" />
        {/* Tolerance criteria */}
        <div className="flex flex-col gap-1 min-w-[160px]">
          <WLabel text="Tolerance criteria" />
          <select
            value={toleranceCriteria}
            onChange={(e) => onToleranceCriteriaChange(e.target.value as ToleranceCriteria)}
            className={`${IB} ${IB_OK} py-1.5`}
          >
            <option value="percent_fs">% Full Scale</option>
            <option value="absolute">Absolute error</option>
            <option value="percent_reading">% of Reading</option>
            <option value="with_uncertainty">Incl. uncertainty</option>
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <WLabel text="Tolerance threshold" />
          <div className="flex items-center gap-1.5">
            <div className="w-20 flex-shrink-0">
              <input
                type="number"
                value={toleranceThreshold}
                onChange={(e) => onToleranceThresholdChange(e.target.value)}
                min={0}
                step="any"
                className={`${IB} ${IB_OK} py-1.5`}
                placeholder="1"
              />
            </div>
            <span className="text-xs text-gray-400 whitespace-nowrap">{toleranceUnit}</span>
            {result && !analyzing && uiPassed !== null && (
              <div className={`flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold border whitespace-nowrap ${
                uiPassed
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50"
                  : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:border-red-900/50"
              }`}>
                {uiPassed ? <CheckIcon size={12} /> : <WarningIcon size={12} />}
                {uiPassed ? "PASS" : "FAIL"}
              </div>
            )}
          </div>
        </div>
        {analyzing && (
          <div className="ml-auto flex items-end">
            <div className="flex items-center gap-2 text-xs text-gray-400">
              <span className="w-3.5 h-3.5 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
              Analyzing…
            </div>
          </div>
        )}
      </div>

      {/* Equation display */}
      {result && !analyzing && (
        <div className="px-4 py-2 rounded-lg bg-mar-surface-alt border border-mar-border">
          <span className="text-[11px] text-gray-400 mr-2">Equation</span>
          <span className="text-xs font-mono text-mar-text">
            {formatEquation(result.coefficients, result.poly_degree)}
          </span>
          <span className="text-[11px] text-gray-400 ml-2">
            ({measuredUnit} → {referenceUnit})
          </span>
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
          {/* Left: stats + uncertainty (40%) */}
          <div className="w-[40%] flex-shrink-0 rounded-xl border border-mar-border p-4 bg-mar-surface-alt">
            <p className="text-xs font-semibold text-mar-text mb-2">Calibration</p>
            <StatRow label="Valid range" value={`${fmtN(result.valid_range_min)} – ${fmtN(result.valid_range_max)} ${referenceUnit}`} />
            <StatRow label="Polynomial degree" value={String(result.poly_degree)} />
            <p className="text-xs font-semibold text-mar-text pt-3 border-t border-mar-border mb-2">Statistics</p>
            <StatRow label="R²" value={fmtN(result.r_squared, 6)} tip="Coefficient of determination — 1.0 is perfect." />
            <StatRow label="RMSE" value={`${fmtN(result.rmse)} ${referenceUnit}`} tip="Root mean square error — typical magnitude of residuals." />
            <StatRow label="Max error" value={`${fmtN(result.max_error)} ${referenceUnit}`} tip="Largest absolute residual." />
            <StatRow label="%FS error" value={`${fmtN(result.full_scale_error_pct, 3)}%`} tip="Max error as % of full measurement span." />
            <StatRow label="Non-linearity" value={`${fmtN(result.non_linearity_pct, 3)}%`} tip="Max deviation of fitted curve from a straight line, as % FS." />
            {result.repeatability != null && (
              <StatRow label="Repeatability†" value={`${fmtN(result.repeatability)} ${referenceUnit}`} tip="Std deviation at repeated reference values." />
            )}
            {result.hysteresis != null && (
              <StatRow label="Hysteresis†" value={`${fmtN(result.hysteresis)} ${referenceUnit}`} tip="Max difference between ascending and descending sweeps." />
            )}
            <p className="text-xs font-semibold text-mar-text pt-3 border-t border-mar-border mb-2">Uncertainty</p>
            <StatRow label="Combined" value={`${fmtN(result.combined_uncertainty)} ${referenceUnit}`} tip="Standard deviation of residuals." />
            <StatRow label="Expanded (±)" value={`${fmtN(result.expanded_uncertainty)} ${referenceUnit}`} tip={`k=${result.coverage_factor} at ${result.confidence_level}% confidence.`} />
          </div>

          {/* Right: chart / table toggle (60%) */}
          <div className="flex-1 min-w-0 flex flex-col gap-2">
            {/* Toggle tabs */}
            <div className="flex gap-1 p-1 bg-mar-surface-alt rounded-lg w-fit border border-mar-border">
              {(["chart", "table"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setRightView(v)}
                  className={`px-4 py-1 rounded text-xs font-medium transition-colors ${
                    rightView === v ? "bg-mar-surface text-mar-text shadow-sm" : "text-gray-400 hover:text-mar-text"
                  }`}
                >
                  {v === "chart" ? "Chart" : "Data Table"}
                </button>
              ))}
            </div>

            {rightView === "chart" && (
              <div className="rounded-xl border border-mar-border bg-mar-surface flex-1 relative overflow-hidden" style={{ minHeight: 340 }}>
                {/* Gradient legend overlay */}
                <div className="absolute bottom-20 right-3 z-20 pointer-events-none">
                  <div className="bg-mar-surface border border-mar-border rounded-lg px-2 py-1.5 shadow-sm">
                    <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wide mb-1">Residual</p>
                    <div className="flex items-center gap-1.5">
                      <div className="w-3 rounded-sm" style={{ height: 48, background: "linear-gradient(to bottom, hsl(0,80%,42%), hsl(60,80%,42%), hsl(120,80%,42%))" }} />
                      <div className="flex flex-col justify-between h-12 text-[10px] text-gray-400">
                        <span>High</span>
                        <span>Low</span>
                      </div>
                    </div>
                  </div>
                </div>
                <div ref={plotDivRef} style={{ height: 340, width: "100%" }} />
              </div>
            )}

            {rightView === "table" && (
              <div className="rounded-xl border border-mar-border overflow-hidden flex-1" style={{ maxHeight: 340, overflowY: "auto" }}>
                <table className="w-full text-xs">
                  <thead className="sticky top-0 z-10">
                    <tr className="border-b border-mar-border bg-mar-surface-alt">
                      {[
                        "#",
                        `Measured (${measuredUnit})`,
                        `Reference (${referenceUnit})`,
                        `Fitted (${referenceUnit})`,
                        `Residual (${referenceUnit})`,
                        "Residual (%)",
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
                        className={`border-b border-mar-border last:border-b-0 cursor-default transition-colors ${
                          hoveredPointIdx === pt.point_index ? "bg-mar-accent/10" : "hover:bg-mar-surface-alt/50"
                        }`}
                      >
                        <td className="px-3 py-1.5 font-mono text-gray-400">{pt.point_index + 1}</td>
                        <td className="px-3 py-1.5 font-mono text-mar-text">{fmtN(pt.measured_value)}</td>
                        <td className="px-3 py-1.5 font-mono text-mar-text">{fmtN(pt.reference_value)}</td>
                        <td className="px-3 py-1.5 font-mono text-mar-text">{fmtN(pt.calculated_value)}</td>
                        <td className={`px-3 py-1.5 font-mono ${Math.abs(pt.residual_abs ?? 0) > (result.rmse * 2) ? "text-amber-400 dark:text-amber-300" : "text-mar-text"}`}>
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
        </div>
      )}

      {!result && !analyzing && !analyzeError && (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <p className="text-sm">Waiting for analysis…</p>
        </div>
      )}
    </div>
  );
}
