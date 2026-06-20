"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  getAssetAuditLogs,
  getAssetCalibrations,
  getAssetCertificates,
  getAssetFiles,
  getAssetProfile,
  getCalibrationCoefficients,
  listLocations,
  listTeams,
  retireAsset,
  updateAsset,
} from "@/services/asset.service";
import type { AssetProfile, AssetUpdateRequest, LocationOption, SensorChannelUpdateInput } from "@/types/asset";
import type { CalibrationRecord, CalibrationCoefficient } from "@/types/calibration";
import type { AuditLogEntry } from "@/types/audit_log";
import type { StoredFile } from "@/types/stored_file";
import {
  CALIBRATION_STATUS_LABEL,
  CALIBRATION_STATUS_STYLE,
  SUBTYPE_LABEL,
} from "@/lib/tokens";
import {
  PHYSICAL_QUANTITIES,
  parseTechnology,
  MOUNTING_TYPE_OPTIONS,
  IP_RATING_OPTIONS,
  HAZARDOUS_AREA_OPTIONS,
  CAL_ROLE_OPTIONS,
  OUTPUT_TYPE_OPTIONS,
  ACCURACY_TYPE_OPTIONS,
  CRITICALITY_OPTIONS,
  getOutputUnits,
} from "@/lib/sensor-options";
import { toSI, fromSI } from "@/lib/unit-conversion";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  DownloadIcon,
  EditIcon,
  InfoIcon,
  MapPinIcon,
  PlusIcon,
  QrCodeIcon,
  TrashIcon,
  WarningIcon,
  XIcon,
} from "@/components/icons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + (iso.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtNum(n: number | null | undefined, decimals = 4): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return n.toExponential(3);
  return parseFloat(n.toFixed(decimals)).toString();
}

function fmtBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileIcon(contentType: string): string {
  if (contentType.includes("pdf")) return "pdf";
  if (contentType.includes("csv") || contentType.includes("text")) return "csv";
  if (contentType.includes("zip") || contentType.includes("archive")) return "zip";
  return "doc";
}

function actionLabel(action: string): string {
  return action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cls = CALIBRATION_STATUS_STYLE[status] ?? CALIBRATION_STATUS_STYLE.not_calibrated;
  const label = CALIBRATION_STATUS_LABEL[status] ?? status;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      ● {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Spec row (display mode)
// ---------------------------------------------------------------------------

function SpecRow({ label, value, accent }: { label: string; value: string | null | undefined; accent?: boolean }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-mar-border last:border-b-0">
      <span className="text-xs text-gray-400">{label}</span>
      <span className={`text-sm ${accent ? "text-mar-accent font-medium" : "text-mar-text"}`}>{value}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit form types
// ---------------------------------------------------------------------------

interface EditChannelForm {
  _key: string;
  channel_id: string;
  physical_quantity: string;
  unit: string;
  _techFamily: string;
  technology: string;
  measurement_min: string;
  measurement_max: string;
  accuracy_value: string;
  accuracy_type: string;
  accuracy_unit: string;
  resolution: string;
  resolution_unit: string;
  measurement_uncertainty: string;
  uncertainty_unit: string;
  confidence_level: string;
  coverage_factor: string;
  drift_rate: string;
  drift_unit: string;
  sensitivity: string;
  sensitivity_unit: string;
  response_time_ms: string;
  bandwidth_hz: string;
  output_signal_min: string;
  output_signal_max: string;
  output_signal_unit: string;
  output_type: string;
  calibration_role: string;
  criticality: string;
  calibration_interval: string;
}

interface EditFormState {
  owner: string;
  name: string;
  description: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  manufacturer_part_number: string;
  location_id: string;
  firmware_version: string;
  power_supply: string;
  power_consumption_w: string;
  dimensions: string;
  weight_kg: string;
  mounting_type: string;
  connection_type: string;
  ip_rating: string;
  hazardous_area_rating: string;
  operating_temperature_min: string;
  operating_temperature_max: string;
  operating_humidity_min: string;
  operating_humidity_max: string;
  price_eur: string;
  purchase_date: string;
  warranty_expiry_date: string;
  notes: string;
  sensor_channels: EditChannelForm[];
}

function s(v: string | number | null | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function profileToForm(profile: AssetProfile): EditFormState {
  return {
    owner: s(profile.owner),
    name: s(profile.name),
    description: s(profile.description),
    manufacturer: s(profile.manufacturer),
    model: s(profile.model),
    serial_number: s(profile.serial_number),
    manufacturer_part_number: s(profile.manufacturer_part_number),
    location_id: s(profile.location_id),
    firmware_version: s(profile.firmware_version),
    power_supply: s(profile.power_supply),
    power_consumption_w: s(profile.power_consumption_w),
    dimensions: s(profile.dimensions),
    weight_kg: s(profile.weight_kg),
    mounting_type: s(profile.mounting_type),
    connection_type: s(profile.connection_type),
    ip_rating: s(profile.ip_rating),
    hazardous_area_rating: s(profile.hazardous_area_rating),
    operating_temperature_min: s(profile.operating_temperature_min),
    operating_temperature_max: s(profile.operating_temperature_max),
    operating_humidity_min: s(profile.operating_humidity_min),
    operating_humidity_max: s(profile.operating_humidity_max),
    price_eur: s(profile.price_eur),
    purchase_date: profile.purchase_date ?? "",
    warranty_expiry_date: profile.warranty_expiry_date ?? "",
    notes: s(profile.notes),
    sensor_channels: profile.sensor_channels.map((ch, i) => {
      const { family } = parseTechnology(ch.physical_quantity, ch.technology ?? "");
      return {
        _key: `existing-${i}`,
        channel_id: s(ch.channel_id),
        physical_quantity: s(ch.physical_quantity),
        unit: s(ch.unit),
        _techFamily: family,
        technology: s(ch.technology),
        measurement_min: s(ch.measurement_min),
        measurement_max: s(ch.measurement_max),
        accuracy_value: s(ch.accuracy_value),
        accuracy_type: s(ch.accuracy_type),
        accuracy_unit: s(ch.accuracy_unit),
        resolution: s(ch.resolution),
        resolution_unit: s(ch.resolution_unit),
        measurement_uncertainty: s(ch.measurement_uncertainty),
        uncertainty_unit: s(ch.uncertainty_unit),
        confidence_level: s(ch.confidence_level),
        coverage_factor: s(ch.coverage_factor),
        drift_rate: s(ch.drift_rate),
        drift_unit: s(ch.drift_unit),
        sensitivity: s(ch.sensitivity),
        sensitivity_unit: s(ch.sensitivity_unit),
        response_time_ms: s(ch.response_time_ms),
        bandwidth_hz: s(ch.bandwidth_hz),
        output_signal_unit: s(ch.output_signal_unit),
        output_signal_min: s(fromSI(ch.output_signal_min, ch.output_signal_unit ?? "")),
        output_signal_max: s(fromSI(ch.output_signal_max, ch.output_signal_unit ?? "")),
        output_type: s(ch.output_type),
        calibration_role: s(ch.calibration_role),
        criticality: s(ch.criticality),
        calibration_interval: s(ch.calibration_interval),
      };
    }),
  };
}

function orNull(v: string): string | null {
  return v.trim() === "" ? null : v.trim();
}

function numOrNull(v: string): number | null {
  if (v.trim() === "") return null;
  const n = parseFloat(v);
  return isNaN(n) ? null : n;
}

function numSI(v: string, unit: string): number | null {
  const n = numOrNull(v);
  return n != null ? toSI(n, unit) : null;
}

function formToUpdate(form: EditFormState): AssetUpdateRequest {
  const channels: SensorChannelUpdateInput[] = form.sensor_channels.map((ch) => ({
    channel_id: ch.channel_id.trim(),
    physical_quantity: ch.physical_quantity,
    unit: ch.unit,
    technology: orNull(ch.technology),
    measurement_min: numOrNull(ch.measurement_min),
    measurement_max: numOrNull(ch.measurement_max),
    accuracy_value: numOrNull(ch.accuracy_value),
    accuracy_type: orNull(ch.accuracy_type),
    accuracy_unit: orNull(ch.accuracy_unit),
    resolution: numOrNull(ch.resolution),
    resolution_unit: orNull(ch.resolution_unit),
    measurement_uncertainty: numOrNull(ch.measurement_uncertainty),
    uncertainty_unit: orNull(ch.uncertainty_unit),
    confidence_level: numOrNull(ch.confidence_level),
    coverage_factor: numOrNull(ch.coverage_factor),
    drift_rate: numOrNull(ch.drift_rate),
    drift_unit: orNull(ch.drift_unit),
    sensitivity: numOrNull(ch.sensitivity),
    sensitivity_unit: orNull(ch.sensitivity_unit),
    response_time_ms: numOrNull(ch.response_time_ms),
    bandwidth_hz: numOrNull(ch.bandwidth_hz),
    output_signal_unit: orNull(ch.output_signal_unit),
    output_signal_min: numSI(ch.output_signal_min, ch.output_signal_unit),
    output_signal_max: numSI(ch.output_signal_max, ch.output_signal_unit),
    output_type: orNull(ch.output_type),
    calibration_role: orNull(ch.calibration_role),
    criticality: orNull(ch.criticality),
    calibration_interval: numOrNull(ch.calibration_interval),
  }));

  return {
    owner: orNull(form.owner),
    name: form.name.trim() || undefined,
    description: orNull(form.description),
    manufacturer: form.manufacturer.trim() || undefined,
    model: form.model.trim() || undefined,
    serial_number: orNull(form.serial_number),
    manufacturer_part_number: orNull(form.manufacturer_part_number),
    location_id: orNull(form.location_id),
    firmware_version: orNull(form.firmware_version),
    power_supply: orNull(form.power_supply),
    power_consumption_w: numOrNull(form.power_consumption_w),
    dimensions: orNull(form.dimensions),
    weight_kg: numOrNull(form.weight_kg),
    mounting_type: orNull(form.mounting_type),
    connection_type: orNull(form.connection_type),
    ip_rating: orNull(form.ip_rating),
    hazardous_area_rating: orNull(form.hazardous_area_rating),
    operating_temperature_min: numOrNull(form.operating_temperature_min),
    operating_temperature_max: numOrNull(form.operating_temperature_max),
    operating_humidity_min: numOrNull(form.operating_humidity_min),
    operating_humidity_max: numOrNull(form.operating_humidity_max),
    price_eur: numOrNull(form.price_eur),
    purchase_date: orNull(form.purchase_date),
    warranty_expiry_date: orNull(form.warranty_expiry_date),
    notes: orNull(form.notes),
    sensor_channels: channels,
  };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validateForm(form: EditFormState): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.owner.trim()) errors.owner = "Owner is required";
  if (!form.name.trim()) errors.name = "Name is required";
  if (!form.manufacturer.trim()) errors.manufacturer = "Manufacturer is required";
  if (!form.model.trim()) errors.model = "Model is required";

  const numFields: (keyof EditFormState)[] = [
    "weight_kg", "power_consumption_w",
    "operating_temperature_min", "operating_temperature_max",
    "operating_humidity_min", "operating_humidity_max",
    "price_eur",
  ];
  for (const f of numFields) {
    const v = form[f] as string;
    if (v && isNaN(parseFloat(v))) errors[f] = "Must be a number";
  }

  if (form.purchase_date && !DATE_RE.test(form.purchase_date))
    errors.purchase_date = "Format: YYYY-MM-DD";
  if (form.warranty_expiry_date && !DATE_RE.test(form.warranty_expiry_date))
    errors.warranty_expiry_date = "Format: YYYY-MM-DD";

  const channelIds = new Set<string>();
  form.sensor_channels.forEach((ch, i) => {
    const p = `ch_${i}_`;
    if (!ch.channel_id.trim()) errors[`${p}channel_id`] = "Required";
    else if (channelIds.has(ch.channel_id.trim().toLowerCase())) errors[`${p}channel_id`] = "Duplicate channel ID";
    else channelIds.add(ch.channel_id.trim().toLowerCase());

    if (!ch.physical_quantity) errors[`${p}physical_quantity`] = "Required";
    if (!ch.unit.trim()) errors[`${p}unit`] = "Required";

    const chNums = [
      "measurement_min", "measurement_max", "accuracy_value", "resolution",
      "drift_rate", "sensitivity", "response_time_ms", "bandwidth_hz",
      "output_signal_min", "output_signal_max", "calibration_interval",
      "measurement_uncertainty", "confidence_level", "coverage_factor",
    ];
    for (const f of chNums) {
      const v = ch[f as keyof EditChannelForm] as string;
      if (v && isNaN(parseFloat(v))) errors[`${p}${f}`] = "Must be a number";
    }
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Edit field components
// ---------------------------------------------------------------------------

const INPUT_BASE = "w-full px-3 py-2 rounded-lg border text-sm text-mar-text bg-mar-surface focus:outline-none focus:ring-1 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600";
const INPUT_OK = "border-mar-border-md focus:border-mar-accent focus:ring-mar-accent/20";
const INPUT_ERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

function Tooltip({ content, children }: { content: string; children: React.ReactNode }) {
  return (
    <span className="relative group/tip">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/tip:block w-64 bg-gray-900 dark:bg-gray-700 text-white text-[11px] rounded-lg px-3 py-2 z-50 shadow-lg leading-relaxed whitespace-normal text-left">
        {content}
      </span>
    </span>
  );
}

function ELabel({ label, required, tooltip }: { label: string; required?: boolean; tooltip?: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-gray-400">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {tooltip && (
        <Tooltip content={tooltip}>
          <InfoIcon size={11} className="text-gray-400 cursor-help flex-shrink-0" />
        </Tooltip>
      )}
    </span>
  );
}

function EError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return <p className="text-xs text-red-500 mt-0.5">{msg}</p>;
}

function EditInput({
  label, value, onChange, error, required, placeholder, type = "text", readOnly, tooltip,
}: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; required?: boolean; placeholder?: string; type?: string; readOnly?: boolean; tooltip?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ELabel label={label} required={required} tooltip={tooltip} />
      <input
        type={type}
        value={value}
        readOnly={readOnly}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_BASE} ${error ? INPUT_ERR : INPUT_OK} ${readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
      />
      <EError msg={error} />
    </div>
  );
}

function EditTextArea({
  label, value, onChange, error, required, placeholder, rows = 3, tooltip,
}: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; required?: boolean; placeholder?: string; rows?: number; tooltip?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ELabel label={label} required={required} tooltip={tooltip} />
      <textarea
        value={value}
        rows={rows}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${INPUT_BASE} resize-none ${error ? INPUT_ERR : INPUT_OK}`}
      />
      <EError msg={error} />
    </div>
  );
}

function EditSelect({
  label, value, onChange, options, error, required, placeholder, tooltip,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string; required?: boolean; placeholder?: string; tooltip?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ELabel label={label} required={required} tooltip={tooltip} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_BASE} ${error ? INPUT_ERR : INPUT_OK}`}
      >
        <option value="">{placeholder ?? "Select…"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <EError msg={error} />
    </div>
  );
}

// Select with "Other" that shows a text input when a non-listed value is active
function EditSelectWithOther({
  label, value, onChange, options, error, required, placeholder, tooltip,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string; required?: boolean; placeholder?: string; tooltip?: string;
}) {
  const [otherMode, setOtherMode] = useState(
    () => value !== "" && !options.some((o) => o.value === value)
  );

  // Sync when the controlled value is reset to a known option from outside (e.g. Cancel)
  useEffect(() => {
    if (value !== "" && options.some((o) => o.value === value)) {
      setOtherMode(false);
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex flex-col gap-1">
      <ELabel label={label} required={required} tooltip={tooltip} />
      <select
        value={otherMode ? "__other__" : value}
        onChange={(e) => {
          if (e.target.value === "__other__") {
            setOtherMode(true);
            onChange("");
          } else {
            setOtherMode(false);
            onChange(e.target.value);
          }
        }}
        className={`${INPUT_BASE} ${error ? INPUT_ERR : INPUT_OK}`}
      >
        <option value="">{placeholder ?? "Select…"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        <option value="__other__">Other…</option>
      </select>
      {otherMode && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Specify…"
          className={`${INPUT_BASE} ${error ? INPUT_ERR : INPUT_OK} mt-1`}
        />
      )}
      <EError msg={error} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Physical quantity cascade (quantity → unit → technology family → subtype)
// ---------------------------------------------------------------------------

function PhysicalQuantityCascade({
  physicalQuantity, unit, techFamily, technology,
  onQuantityChange, onUnitChange, onTechChange,
  errors, prefix,
}: {
  physicalQuantity: string;
  unit: string;
  techFamily: string;
  technology: string;
  onQuantityChange: (q: string) => void;
  onUnitChange: (u: string) => void;
  onTechChange: (family: string, tech: string) => void;
  errors: Record<string, string>;
  prefix: string;
}) {
  const quantityDef = PHYSICAL_QUANTITIES.find((q) => q.value === physicalQuantity);
  const units = quantityDef?.units ?? [];
  const techs = quantityDef?.technologies ?? [];
  const selectedFamily = techs.find((t) => t.value === techFamily);

  function handleQuantityChange(q: string) {
    onQuantityChange(q);
    // Unit reset and tech reset are handled by ChannelEditor's onQuantityChange as a single state update
  }

  function handleFamilyChange(fam: string) {
    if (fam === "" || fam === "__other__") {
      onTechChange(fam, "");
    } else {
      const famDef = techs.find((t) => t.value === fam);
      if (famDef?.subtypes) {
        onTechChange(fam, "");
      } else {
        onTechChange(fam, fam);
      }
    }
  }

  const techSubtypeVal = selectedFamily?.subtypes ? technology : "";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <EditSelect
          label="Physical quantity"
          value={physicalQuantity}
          onChange={handleQuantityChange}
          options={PHYSICAL_QUANTITIES.map((q) => ({ value: q.value, label: q.label }))}
          error={errors[`${prefix}physical_quantity`]}
          required
          tooltip={CHAN_TIPS.physical_quantity}
        />
        <EditSelect
          label="Unit"
          value={unit}
          onChange={onUnitChange}
          options={units.map((u) => ({ value: u.value, label: u.label }))}
          error={errors[`${prefix}unit`]}
          required
        />
      </div>
      {quantityDef && (
        <div className="grid grid-cols-2 gap-3">
          <EditSelectWithOther
            label="Technology"
            value={techFamily}
            onChange={handleFamilyChange}
            options={techs.map((t) => ({ value: t.value, label: t.label }))}
          />
          {selectedFamily?.subtypes && techFamily !== "__other__" && (
            <EditSelect
              label="Type / variant"
              value={techSubtypeVal}
              onChange={(v) => onTechChange(techFamily, v)}
              options={selectedFamily.subtypes.map((s) => ({ value: s.value, label: s.label }))}
            />
          )}
          {techFamily === "__other__" && (
            <EditInput
              label="Technology (custom)"
              value={technology}
              onChange={(v) => onTechChange("__other__", v)}
              placeholder="e.g. optical fiber"
            />
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Channel field tooltips
// ---------------------------------------------------------------------------

const CHAN_TIPS: Record<string, string> = {
  physical_quantity: "The physical quantity defines the type of measurement (e.g., temperature, pressure) and determines the applicable units and calibration procedures. Choose the one that best matches the sensor's primary measurement.",
  accuracy_value: "Maximum deviation between the sensor output and the true value. Smaller means more accurate.",
  resolution: "Smallest change in input the sensor can detect and represent in its output.",
  measurement_uncertainty: "Quantifies doubt about the measurement result. Expressed as ±value at the stated confidence level.",
  confidence_level: "Statistical confidence for the uncertainty statement (typically 95%).",
  coverage_factor: "Multiplier k applied to standard uncertainty to give expanded uncertainty (k=2 ≈ 95%).",
  drift_rate: "Rate at which the sensor output shifts over time without any change in the measured quantity.",
  sensitivity: "Change in output per unit change in input (e.g., mV/°C). Higher means more responsive.",
  response_time_ms: "Time for the sensor output to reach a defined percentage of its final value after a step input change.",
  bandwidth_hz: "Maximum frequency of input changes the sensor can accurately follow.",
};

// ---------------------------------------------------------------------------
// Output unit selector — shows appropriate units based on output type
// ---------------------------------------------------------------------------

function OutputUnitSelector({
  outputType, physicalQuantity, value, onChange,
}: {
  outputType: string;
  physicalQuantity: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const units = getOutputUnits(outputType, physicalQuantity);
  if (!units) {
    return <EditInput label="Output unit" value={value} onChange={onChange} placeholder="e.g. mA" />;
  }
  if (outputType === "digital") {
    return <EditSelectWithOther label="Output unit" value={value} onChange={onChange} options={units} />;
  }
  return <EditSelect label="Output unit" value={value} onChange={onChange} options={units} />;
}

// ---------------------------------------------------------------------------
// Channel editor row
// ---------------------------------------------------------------------------

function ChannelEditor({
  ch, index, onChange, onRemove, errors,
}: {
  ch: EditChannelForm;
  index: number;
  onChange: (updated: EditChannelForm) => void;
  onRemove: () => void;
  errors: Record<string, string>;
}) {
  const p = `ch_${index}_`;
  const set = (field: keyof EditChannelForm) => (v: string) =>
    onChange({ ...ch, [field]: v });

  return (
    <div className="border border-mar-border-md rounded-xl p-4 space-y-4 bg-mar-surface-alt">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-mar-accent uppercase tracking-wide">
          Channel {index + 1}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          title="Remove channel"
        >
          <TrashIcon size={14} />
        </button>
      </div>

      {/* Channel ID + cascade */}
      <EditInput
        label="Channel ID"
        value={ch.channel_id}
        onChange={set("channel_id")}
        error={errors[`${p}channel_id`]}
        placeholder="e.g. CH1, Temperature, Humidity"
        required
      />

      <PhysicalQuantityCascade
        physicalQuantity={ch.physical_quantity}
        unit={ch.unit}
        techFamily={ch._techFamily}
        technology={ch.technology}
        onQuantityChange={(q) => {
          const def = PHYSICAL_QUANTITIES.find((x) => x.value === q);
          onChange({ ...ch, physical_quantity: q, unit: def?.units[0]?.value ?? "", _techFamily: "", technology: "" });
        }}
        onUnitChange={set("unit")}
        onTechChange={(fam, tech) => onChange({ ...ch, _techFamily: fam, technology: tech })}
        errors={errors}
        prefix={p}
      />

      {/* Range */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Range min" value={ch.measurement_min} onChange={set("measurement_min")} error={errors[`${p}measurement_min`]} placeholder="e.g. -200" />
        <EditInput label="Range max" value={ch.measurement_max} onChange={set("measurement_max")} error={errors[`${p}measurement_max`]} placeholder="e.g. 850" />
      </div>

      {/* Accuracy */}
      <div className="grid grid-cols-3 gap-3">
        <EditInput label="Accuracy value" value={ch.accuracy_value} onChange={set("accuracy_value")} error={errors[`${p}accuracy_value`]} placeholder="e.g. 0.5" tooltip={CHAN_TIPS.accuracy_value} />
        <EditSelectWithOther label="Accuracy type" value={ch.accuracy_type} onChange={set("accuracy_type")} options={ACCURACY_TYPE_OPTIONS} />
        <EditInput label="Accuracy unit" value={ch.accuracy_unit} onChange={set("accuracy_unit")} placeholder="e.g. °C, %" />
      </div>

      {/* Resolution */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Resolution" value={ch.resolution} onChange={set("resolution")} error={errors[`${p}resolution`]} placeholder="e.g. 0.01" tooltip={CHAN_TIPS.resolution} />
        <EditInput label="Resolution unit" value={ch.resolution_unit} onChange={set("resolution_unit")} placeholder="e.g. °C" />
      </div>

      {/* Uncertainty */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Uncertainty (±)" value={ch.measurement_uncertainty} onChange={set("measurement_uncertainty")} error={errors[`${p}measurement_uncertainty`]} placeholder="e.g. 0.3" tooltip={CHAN_TIPS.measurement_uncertainty} />
        <EditInput label="Uncertainty unit" value={ch.uncertainty_unit} onChange={set("uncertainty_unit")} placeholder="e.g. °C" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Confidence level (%)" value={ch.confidence_level} onChange={set("confidence_level")} error={errors[`${p}confidence_level`]} placeholder="e.g. 95" tooltip={CHAN_TIPS.confidence_level} />
        <EditInput label="Coverage factor (k)" value={ch.coverage_factor} onChange={set("coverage_factor")} error={errors[`${p}coverage_factor`]} placeholder="e.g. 2" tooltip={CHAN_TIPS.coverage_factor} />
      </div>

      {/* Drift */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Drift rate" value={ch.drift_rate} onChange={set("drift_rate")} error={errors[`${p}drift_rate`]} placeholder="e.g. 0.1" tooltip={CHAN_TIPS.drift_rate} />
        <EditInput label="Drift unit" value={ch.drift_unit} onChange={set("drift_unit")} placeholder="e.g. °C/year" />
      </div>

      {/* Sensitivity */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Sensitivity" value={ch.sensitivity} onChange={set("sensitivity")} error={errors[`${p}sensitivity`]} placeholder="e.g. 10" tooltip={CHAN_TIPS.sensitivity} />
        <EditInput label="Sensitivity unit" value={ch.sensitivity_unit} onChange={set("sensitivity_unit")} placeholder="e.g. mV/V" />
      </div>

      {/* Dynamic */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Response time (ms)" value={ch.response_time_ms} onChange={set("response_time_ms")} error={errors[`${p}response_time_ms`]} placeholder="e.g. 300" tooltip={CHAN_TIPS.response_time_ms} />
        <EditInput label="Bandwidth (Hz)" value={ch.bandwidth_hz} onChange={set("bandwidth_hz")} error={errors[`${p}bandwidth_hz`]} placeholder="e.g. 1000" tooltip={CHAN_TIPS.bandwidth_hz} />
      </div>

      {/* Output — type first, then range */}
      <EditSelectWithOther label="Output type" value={ch.output_type} onChange={(v) => {
        const units = getOutputUnits(v, ch.physical_quantity);
        onChange({ ...ch, output_type: v, output_signal_unit: units?.[0]?.value ?? "" });
      }} options={OUTPUT_TYPE_OPTIONS} />
      <div className="grid grid-cols-3 gap-3">
        <EditInput label="Output min" value={ch.output_signal_min} onChange={set("output_signal_min")} error={errors[`${p}output_signal_min`]} placeholder="e.g. 4" />
        <EditInput label="Output max" value={ch.output_signal_max} onChange={set("output_signal_max")} error={errors[`${p}output_signal_max`]} placeholder="e.g. 20" />
        <OutputUnitSelector outputType={ch.output_type} physicalQuantity={ch.physical_quantity} value={ch.output_signal_unit} onChange={set("output_signal_unit")} />
      </div>

      {/* Role / Criticality */}
      <div className="grid grid-cols-2 gap-3">
        <EditSelectWithOther label="Calibration role" value={ch.calibration_role} onChange={set("calibration_role")} options={CAL_ROLE_OPTIONS} />
        <EditSelectWithOther label="Criticality" value={ch.criticality} onChange={set("criticality")} options={CRITICALITY_OPTIONS} />
      </div>

      {/* Calibration interval */}
      <EditInput label="Calibration interval (days)" value={ch.calibration_interval} onChange={set("calibration_interval")} error={errors[`${p}calibration_interval`]} placeholder="e.g. 365" />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section (forceOpen for edit mode)
// ---------------------------------------------------------------------------

function CollapsibleSection({
  title, children, forceOpen,
}: {
  title: string;
  children: ReactNode;
  forceOpen?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const isOpen = forceOpen || open;

  return (
    <div className="bg-mar-surface border border-mar-border rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => { if (!forceOpen) setOpen((v) => !v); }}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${forceOpen ? "cursor-default" : "hover:bg-mar-surface-alt"}`}
      >
        <span className="text-sm font-semibold text-mar-text">{title}</span>
        {!forceOpen && (
          <span className={`transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}>
            <ChevronDownIcon size={16} />
          </span>
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-4 border-t border-mar-border">
          {children}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers for view mode conditional sections
// ---------------------------------------------------------------------------

function hasAny(...vals: (string | number | boolean | null | undefined)[]): boolean {
  return vals.some((v) => v !== null && v !== undefined && v !== "");
}

// ---------------------------------------------------------------------------
// Retire modal
// ---------------------------------------------------------------------------

function RetireModal({ assetName, onRetire, onClose }: {
  assetName: string;
  onRetire: (reason?: string) => void;
  onClose: () => void;
}) {
  const [reason, setReason] = useState("");
  const [retiring, setRetiring] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <WarningIcon size={20} className="text-red-500 flex-shrink-0" />
          <h2 className="text-base font-semibold text-mar-text">Retire asset?</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          This will mark <span className="font-semibold text-mar-text">{assetName}</span> as retired.
          Retired assets remain visible but are not editable. An admin can reactivate them later.
        </p>
        <div className="flex flex-col gap-1 mb-5">
          <span className="text-xs text-gray-400">Reason (optional)</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="e.g. Equipment failure, end of life…"
            className="w-full px-3 py-2 rounded-lg border border-mar-border-md text-sm text-mar-text bg-mar-surface focus:outline-none focus:ring-1 focus:border-mar-accent focus:ring-mar-accent/20 placeholder:text-gray-400 dark:placeholder:text-gray-600"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={retiring}
            className="px-3 py-1.5 text-sm border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors text-mar-text disabled:opacity-50">
            Cancel
          </button>
          <button
            type="button"
            disabled={retiring}
            onClick={() => { setRetiring(true); onRetire(reason || undefined); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
          >
            {retiring
              ? <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <WarningIcon size={14} />}
            {retiring ? "Retiring…" : "Retire asset"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({
  profile, isEditing, form, onChange, errors, locations, teams,
}: {
  profile: AssetProfile;
  isEditing: boolean;
  form: EditFormState | null;
  onChange: (f: EditFormState) => void;
  errors: Record<string, string>;
  locations: LocationOption[];
  teams: { id: string; name: string }[];
}) {
  const daq = profile.daq_details;

  const operatingTemp =
    profile.operating_temperature_min != null || profile.operating_temperature_max != null
      ? `${profile.operating_temperature_min ?? "—"} to ${profile.operating_temperature_max ?? "—"} °C`
      : null;

  const operatingHumidity =
    profile.operating_humidity_min != null || profile.operating_humidity_max != null
      ? `${profile.operating_humidity_min ?? "—"} to ${profile.operating_humidity_max ?? "—"} %RH`
      : null;

  const locationCoords =
    profile.location_latitude != null || profile.location_longitude != null
      ? `${profile.location_latitude ?? "—"}, ${profile.location_longitude ?? "—"}`
      : null;

  if (isEditing && form) {
    const set = (field: keyof EditFormState) => (v: string) =>
      onChange({ ...form, [field]: v });
    const setChannels = (channels: EditChannelForm[]) =>
      onChange({ ...form, sensor_channels: channels });

    const addChannel = () => {
      if (!form) return;
      const newKey = `new-${Date.now()}`;
      const firstQ = PHYSICAL_QUANTITIES[0];
      setChannels([
        ...form.sensor_channels,
        {
          _key: newKey,
          channel_id: "",
          physical_quantity: firstQ.value,
          unit: firstQ.units[0]?.value ?? "",
          _techFamily: "",
          technology: "",
          measurement_min: "", measurement_max: "",
          accuracy_value: "", accuracy_type: "", accuracy_unit: "",
          resolution: "", resolution_unit: "",
          measurement_uncertainty: "", uncertainty_unit: "",
          confidence_level: "", coverage_factor: "",
          drift_rate: "", drift_unit: "",
          sensitivity: "", sensitivity_unit: "",
          response_time_ms: "", bandwidth_hz: "",
          output_signal_min: "", output_signal_max: "", output_signal_unit: "",
          output_type: "", calibration_role: "", criticality: "",
          calibration_interval: "",
        },
      ]);
    }

    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* Left 2/3: edit sections */}
        <div className="lg:col-span-2 space-y-3">

          {/* General */}
          <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-mar-text mb-4">General</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EditInput label="Asset ID" value={profile.asset_id} onChange={() => {}} readOnly />
              <EditInput label="Name" value={form.name} onChange={set("name")} error={errors.name} required placeholder="e.g. PT100 Temperature Sensor" />
              <EditInput label="Manufacturer" value={form.manufacturer} onChange={set("manufacturer")} error={errors.manufacturer} required placeholder="e.g. WIKA" />
              <EditInput label="Model" value={form.model} onChange={set("model")} error={errors.model} required placeholder="e.g. TF53" />
              <EditInput label="Serial number" value={form.serial_number} onChange={set("serial_number")} placeholder="e.g. SN-20240001" />
              <EditInput label="Part number" value={form.manufacturer_part_number} onChange={set("manufacturer_part_number")} placeholder="e.g. 4250041" />
              <EditSelect
                label="Owner"
                value={form.owner}
                onChange={set("owner")}
                options={teams.map((t) => ({ value: t.id, label: t.name }))}
                error={errors.owner}
                required
                placeholder="Select team…"
              />
              <div className="sm:col-span-2">
                <EditTextArea label="Description" value={form.description} onChange={set("description")} placeholder="Short description of the asset's purpose and context" />
              </div>
            </div>
          </div>

          {/* Location */}
          <CollapsibleSection title="Location" forceOpen={isEditing}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <EditSelect
                label="Location"
                value={form.location_id}
                onChange={set("location_id")}
                options={locations.map((l) => ({ value: l.id, label: l.path }))}
                placeholder="Select location…"
              />
            </div>
          </CollapsibleSection>

          {/* Mechanical */}
          <CollapsibleSection title="Mechanical" forceOpen={isEditing}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <EditInput label="Dimensions" value={form.dimensions} onChange={set("dimensions")} placeholder='e.g. 150×30×30 mm' />
              <EditInput label="Weight (kg)" value={form.weight_kg} onChange={set("weight_kg")} error={errors.weight_kg} placeholder="e.g. 0.45" />
              <EditSelectWithOther label="Mounting type" value={form.mounting_type} onChange={set("mounting_type")} options={MOUNTING_TYPE_OPTIONS} />
              <EditInput label="Connection type" value={form.connection_type} onChange={set("connection_type")} placeholder="e.g. M12 4-pin" />
              <EditSelectWithOther label="IP rating" value={form.ip_rating} onChange={set("ip_rating")} options={IP_RATING_OPTIONS} />
              <EditSelectWithOther label="Hazardous area rating" value={form.hazardous_area_rating} onChange={set("hazardous_area_rating")} options={HAZARDOUS_AREA_OPTIONS} />
              <EditInput label="Operating temp min (°C)" value={form.operating_temperature_min} onChange={set("operating_temperature_min")} error={errors.operating_temperature_min} placeholder="e.g. -40" />
              <EditInput label="Operating temp max (°C)" value={form.operating_temperature_max} onChange={set("operating_temperature_max")} error={errors.operating_temperature_max} placeholder="e.g. 125" />
              <EditInput label="Operating humidity min (%RH)" value={form.operating_humidity_min} onChange={set("operating_humidity_min")} error={errors.operating_humidity_min} placeholder="e.g. 0" />
              <EditInput label="Operating humidity max (%RH)" value={form.operating_humidity_max} onChange={set("operating_humidity_max")} error={errors.operating_humidity_max} placeholder="e.g. 95" />
            </div>
          </CollapsibleSection>

          {/* Electrical */}
          <CollapsibleSection title="Electrical" forceOpen={isEditing}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <EditInput label="Power supply" value={form.power_supply} onChange={set("power_supply")} placeholder="e.g. 24 VDC" />
              <EditInput label="Power consumption (W)" value={form.power_consumption_w} onChange={set("power_consumption_w")} error={errors.power_consumption_w} placeholder="e.g. 2.5" />
              <EditInput label="Firmware version" value={form.firmware_version} onChange={set("firmware_version")} placeholder="e.g. 1.4.2" />
            </div>
          </CollapsibleSection>

          {/* Commercial */}
          <CollapsibleSection title="Commercial" forceOpen={isEditing}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <EditInput label="Purchase date" value={form.purchase_date} onChange={set("purchase_date")} error={errors.purchase_date} placeholder="YYYY-MM-DD" type="date" />
              <EditInput label="Purchase price (€)" value={form.price_eur} onChange={set("price_eur")} error={errors.price_eur} placeholder="e.g. 350.00" />
              <EditInput label="Warranty expiry" value={form.warranty_expiry_date} onChange={set("warranty_expiry_date")} error={errors.warranty_expiry_date} placeholder="YYYY-MM-DD" type="date" />
            </div>
          </CollapsibleSection>

          {/* Notes */}
          <CollapsibleSection title="Notes" forceOpen={isEditing}>
            <div className="mt-4">
              <EditTextArea label="Notes" value={form.notes} onChange={set("notes")} placeholder="Free-form notes, maintenance history, etc." rows={4} />
            </div>
          </CollapsibleSection>
        </div>

        {/* Right 1/3: Specifications (sensor channels edit) */}
        <div className="space-y-4">
          {profile.asset_type === "sensor" && (
            <>
              <div className="bg-mar-surface border border-mar-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-mar-text mb-1">Sensor channels</h3>
                <p className="text-xs text-gray-400">Define measurement channels for this sensor.</p>
              </div>
              <div className="space-y-3">
                {form.sensor_channels.map((ch, i) => (
                  <ChannelEditor
                    key={ch._key}
                    ch={ch}
                    index={i}
                    onChange={(updated) => {
                      const updated_channels = [...form.sensor_channels];
                      updated_channels[i] = updated;
                      setChannels(updated_channels);
                    }}
                    onRemove={() => setChannels(form.sensor_channels.filter((_, j) => j !== i))}
                    errors={errors}
                  />
                ))}
                {form.sensor_channels.length === 0 && (
                  <p className="text-sm text-gray-400 text-center py-4">No channels yet.</p>
                )}
                <button
                  type="button"
                  onClick={addChannel}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-mar-accent border border-dashed border-mar-border rounded-xl px-3 py-3 hover:bg-mar-surface-alt transition-colors"
                >
                  <PlusIcon size={12} />
                  Add channel
                </button>
              </div>
            </>
          )}

          {profile.asset_type === "daq" && daq && (
            <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
              <h3 className="text-sm font-semibold text-mar-text mb-1">DAQ specifications</h3>
              <p className="text-xs text-gray-400">DAQ specifications are managed separately.</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Display mode
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      <div className="lg:col-span-2 space-y-3">
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-mar-text mb-3">General</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <SpecRow label="Asset ID" value={profile.asset_id} accent />
            <SpecRow label="Name" value={profile.name} />
            <SpecRow label="Manufacturer" value={profile.manufacturer} />
            <SpecRow label="Model" value={profile.model} />
            <SpecRow label="Serial number" value={profile.serial_number} />
            <SpecRow label="Part number" value={profile.manufacturer_part_number} />
            <SpecRow label="Description" value={profile.description} />
          </div>
        </div>

        <CollapsibleSection title="Location">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3">
            <SpecRow label="Owner" value={profile.owner_name} />
            <SpecRow label="Site" value={profile.site_name} />
            <SpecRow label="Location" value={profile.location_name} />
            <SpecRow label="Location code" value={profile.location_code} />
            <SpecRow label="Description" value={profile.location_description} />
            {locationCoords && <SpecRow label="Coordinates" value={locationCoords} />}
          </div>
        </CollapsibleSection>

        {hasAny(profile.dimensions, profile.weight_kg, profile.mounting_type, profile.connection_type, profile.ip_rating, profile.hazardous_area_rating, operatingTemp, operatingHumidity) && (
          <CollapsibleSection title="Mechanical">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3">
              <SpecRow label="Dimensions" value={profile.dimensions} />
              {profile.weight_kg != null && <SpecRow label="Weight" value={`${profile.weight_kg} kg`} />}
              <SpecRow label="Mounting type" value={profile.mounting_type} />
              <SpecRow label="Connection type" value={profile.connection_type} />
              <SpecRow label="IP rating" value={profile.ip_rating} />
              <SpecRow label="Hazardous area" value={profile.hazardous_area_rating} />
              {operatingTemp && <SpecRow label="Operating temperature" value={operatingTemp} />}
              {operatingHumidity && <SpecRow label="Operating humidity" value={operatingHumidity} />}
            </div>
          </CollapsibleSection>
        )}

        {hasAny(profile.power_supply, profile.power_consumption_w, profile.firmware_version, profile.pinout_table?.length) && (
          <CollapsibleSection title="Electrical">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3">
              <SpecRow label="Power supply" value={profile.power_supply} />
              {profile.power_consumption_w != null && (
                <SpecRow label="Power consumption" value={`${profile.power_consumption_w} W`} />
              )}
              <SpecRow label="Firmware" value={profile.firmware_version} />
            </div>
            {profile.pinout_table && profile.pinout_table.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-2">Pinout</p>
                <div className="overflow-x-auto rounded-lg border border-mar-border">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-mar-border bg-mar-surface-alt">
                        <th className="px-3 py-2 font-semibold text-gray-400 w-16">Pin</th>
                        <th className="px-3 py-2 font-semibold text-gray-400 w-32">Name</th>
                        <th className="px-3 py-2 font-semibold text-gray-400">Description</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-mar-border">
                      {profile.pinout_table.map((row) => (
                        <tr key={row.pin_number}>
                          <td className="px-3 py-2 font-mono text-mar-text">{row.pin_number}</td>
                          <td className="px-3 py-2 text-mar-text">{row.name}</td>
                          <td className="px-3 py-2 text-gray-400">{row.description}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </CollapsibleSection>
        )}

        {hasAny(profile.purchase_date, profile.price_eur, profile.warranty_expiry_date) && (
          <CollapsibleSection title="Commercial">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3">
              {profile.purchase_date && <SpecRow label="Purchase date" value={fmtDate(profile.purchase_date)} />}
              {profile.price_eur != null && <SpecRow label="Purchase price" value={`€${profile.price_eur.toLocaleString()}`} />}
              {profile.warranty_expiry_date && <SpecRow label="Warranty expires" value={fmtDate(profile.warranty_expiry_date)} />}
            </div>
          </CollapsibleSection>
        )}

        {profile.notes && (
          <CollapsibleSection title="Notes">
            <p className="text-sm text-mar-text mt-3 leading-relaxed whitespace-pre-wrap">{profile.notes}</p>
          </CollapsibleSection>
        )}
      </div>

      <div className="bg-mar-surface border border-mar-border rounded-xl p-6 h-fit">
        {profile.asset_type === "sensor" && (
          <>
            <h3 className="text-sm font-semibold text-mar-text mb-4">Specifications</h3>
            {profile.sensor_channels.length === 0 ? (
              <p className="text-sm text-gray-400">No channel data recorded.</p>
            ) : (
              <div className="space-y-0">
                {profile.sensor_channels.map((ch, i) => (
                  <div key={ch.id} className={i > 0 ? "mt-4 pt-4 border-t border-mar-border" : ""}>
                    <p className="text-[11px] font-semibold text-mar-accent uppercase tracking-wide mb-1">
                      {ch.channel_id}
                    </p>
                    <SpecRow label="Physical quantity" value={SUBTYPE_LABEL[ch.physical_quantity] ?? ch.physical_quantity} />
                    <SpecRow label="Technology" value={ch.technology} />
                    {(ch.measurement_min != null || ch.measurement_max != null) && (
                      <SpecRow label="Range" value={`${ch.measurement_min ?? "—"} – ${ch.measurement_max ?? "—"} ${ch.unit}`} />
                    )}
                    {ch.accuracy_value != null && (
                      <SpecRow label="Accuracy" value={`±${ch.accuracy_value}${ch.accuracy_unit ? " " + ch.accuracy_unit : ""}${ch.accuracy_type ? " (" + ch.accuracy_type + ")" : ""}`} />
                    )}
                    {ch.resolution != null && (
                      <SpecRow label="Resolution" value={`${ch.resolution}${ch.resolution_unit ? " " + ch.resolution_unit : ""}`} />
                    )}
                    {ch.drift_rate != null && (
                      <SpecRow label="Drift rate" value={`${ch.drift_rate}${ch.drift_unit ? " " + ch.drift_unit : ""}`} />
                    )}
                    {ch.sensitivity != null && (
                      <SpecRow label="Sensitivity" value={`${ch.sensitivity}${ch.sensitivity_unit ? " " + ch.sensitivity_unit : ""}`} />
                    )}
                    {ch.response_time_ms != null && <SpecRow label="Response time" value={`${ch.response_time_ms} ms`} />}
                    {ch.bandwidth_hz != null && <SpecRow label="Bandwidth" value={`${ch.bandwidth_hz.toLocaleString()} Hz`} />}
                    {ch.calibration_interval != null && <SpecRow label="Cal. interval" value={`${ch.calibration_interval} days`} />}
                    <SpecRow label="Cal. method" value={ch.calibration_method_name} />
                    <SpecRow label="Cal. role" value={ch.calibration_role} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {profile.asset_type === "daq" && daq && (
          <>
            <h3 className="text-sm font-semibold text-mar-text mb-4">Specifications</h3>
            <SpecRow label="DAQ type" value={daq.daq_type} />
            <SpecRow label="Input channels" value={String(daq.input_channels)} />
            <SpecRow label="Output channels" value={String(daq.output_channels)} />
            <SpecRow label="Input signal types" value={daq.input_signal_types} />
            <SpecRow label="Output signal types" value={daq.output_signal_types} />
            {daq.sampling_rate_hz != null && <SpecRow label="Sampling rate" value={`${daq.sampling_rate_hz.toLocaleString()} Hz`} />}
            {daq.per_channel_sampling_rate_hz != null && <SpecRow label="Per-channel rate" value={`${daq.per_channel_sampling_rate_hz.toLocaleString()} Hz`} />}
            {daq.adc_resolution_bits != null && <SpecRow label="ADC resolution" value={`${daq.adc_resolution_bits}-bit`} />}
            <SpecRow label="ADC type" value={daq.adc_type} />
            {daq.input_voltage_range_min != null && daq.input_voltage_range_max != null && (
              <SpecRow label="Input voltage range" value={`${daq.input_voltage_range_min} – ${daq.input_voltage_range_max} V`} />
            )}
            {daq.noise_floor_uv_rms != null && <SpecRow label="Noise floor" value={`${daq.noise_floor_uv_rms} µV RMS`} />}
            {daq.dynamic_range_db != null && <SpecRow label="Dynamic range" value={`${daq.dynamic_range_db} dB`} />}
            {daq.input_impedance_ohm != null && <SpecRow label="Input impedance" value={`${daq.input_impedance_ohm.toLocaleString()} Ω`} />}
            <SpecRow label="Communication" value={daq.communication_protocol} />
            <SpecRow label="Interface" value={daq.interface_type} accent />
            <SpecRow label="Synchronization" value={daq.synchronization_supported ? "Supported" : null} />
            <SpecRow label="Clock source" value={daq.clock_source} />
          </>
        )}

        {profile.asset_type === "daq" && !daq && (
          <>
            <h3 className="text-sm font-semibold text-mar-text mb-4">Specifications</h3>
            <p className="text-sm text-gray-400">No DAQ data recorded.</p>
          </>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Calibration tab
// ---------------------------------------------------------------------------

interface CertInfo {
  id: string;
  calibration_id: string | null;
  certificate_number: string;
  issued_by: string;
  issued_at: string;
  valid_until: string | null;
  file_id: string | null;
}

interface CalibrationTabProps {
  calibrations: CalibrationRecord[];
  coeffsByCalId: Record<string, CalibrationCoefficient[]>;
  certs: CertInfo[];
}

function CoeffCard({ label, sub, value, unit }: { label: string; sub: string; value: string; unit?: string }) {
  return (
    <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3 min-w-[140px]">
      <p className="text-xs text-gray-400 mb-1">{label} <span className="font-mono text-gray-500">({sub})</span></p>
      <p className="text-lg font-mono font-semibold text-mar-text tabular-nums">
        {value}
        {unit && <span className="text-xs text-gray-400 ml-1 font-normal">{unit}</span>}
      </p>
    </div>
  );
}

function CalibrationFormula({ coeff }: { coeff: CalibrationCoefficient }) {
  let formula = "";
  if (coeff.coefficient_type === "linear") {
    const a = fmtNum(coeff.gain);
    const b = coeff.offset_value ?? 0;
    const bAbs = fmtNum(Math.abs(b));
    const bPart = b >= 0 ? `+ ${bAbs}` : `− ${bAbs}`;
    formula = `f(x) = ${a}·x ${bPart}`;
  } else if (coeff.poly_coefficients && coeff.poly_coefficients.length > 0) {
    const terms = [...coeff.poly_coefficients]
      .map((c, i) => {
        if (i === 0) return fmtNum(c, 6);
        if (i === 1) return `${fmtNum(c, 6)}·x`;
        return `${fmtNum(c, 6)}·x^${i}`;
      })
      .reverse()
      .join(" + ");
    formula = `f(x) = ${terms}`;
  }

  if (!formula) return null;

  const note =
    coeff.unit_input || coeff.unit_output
      ? `Where x is the input in ${coeff.unit_input ?? "—"} and f(x) is the output in ${coeff.unit_output ?? "—"}`
      : null;

  return (
    <div className="mt-4 rounded-lg bg-mar-surface-alt border border-mar-border px-4 py-3">
      <p className="font-mono text-sm text-mar-text">{formula}</p>
      {note && <p className="text-xs text-gray-400 mt-1.5">{note}</p>}
    </div>
  );
}

function CalibrationResultBadge({ result }: { result: string }) {
  const map: Record<string, string> = {
    pass: "bg-emerald-50 text-emerald-600 border-emerald-100",
    conditional_pass: "bg-amber-50 text-amber-600 border-amber-100",
    fail: "bg-red-50 text-red-600 border-red-100",
  };
  const label: Record<string, string> = { pass: "Pass", conditional_pass: "Cond. Pass", fail: "Fail" };
  const cls = map[result] ?? "bg-gray-50 text-gray-500 border-gray-100";
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${cls}`}>
      {label[result] ?? result}
    </span>
  );
}

function CalibrationTab({ calibrations, coeffsByCalId, certs }: CalibrationTabProps) {
  const total = calibrations.length;
  const [selectedCalId, setSelectedCalId] = useState<string | null>(calibrations[0]?.id ?? null);

  const selectedCal = calibrations.find((c) => c.id === selectedCalId) ?? calibrations[0] ?? null;
  const selectedIdx = calibrations.findIndex((c) => c.id === selectedCalId);
  const selectedCoeffs = selectedCal ? (coeffsByCalId[selectedCal.id] ?? []) : [];
  const selectedCert = selectedCal ? certs.find((c) => c.calibration_id === selectedCal.id) : undefined;

  function versionOf(idx: number) { return total - idx; }

  const channelGroups: Record<string, CalibrationCoefficient[]> = {};
  for (const coeff of selectedCoeffs) {
    const key = coeff.channel ?? "Main";
    if (!channelGroups[key]) channelGroups[key] = [];
    channelGroups[key].push(coeff);
  }
  const channelKeys = Object.keys(channelGroups);
  const hasMultipleChannels = channelKeys.length > 1;

  return (
    <div className="space-y-5">
      {selectedCal ? (
        <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-mar-text">Calibration coefficients</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="font-mono font-semibold text-mar-text">v{versionOf(selectedIdx >= 0 ? selectedIdx : 0)}</span>
                {" · "}{fmtDate(selectedCal.calibration_date)}
                {" · "}<span>by {selectedCal.performed_by_name}</span>
              </p>
            </div>
            {selectedCert && (
              <button type="button" className="flex items-center gap-1.5 text-xs text-mar-accent border border-mar-border rounded-lg px-3 py-1.5 hover:bg-mar-surface-alt transition-colors flex-shrink-0">
                <span className="opacity-60">📄</span>
                {selectedCert.certificate_number}
              </button>
            )}
          </div>

          {selectedCoeffs.length > 0 ? (
            <div className="space-y-5">
              {channelKeys.map((chKey, chIdx) => {
                const coeffs = channelGroups[chKey];
                return (
                  <div key={chKey} className={chIdx > 0 ? "pt-5 border-t border-mar-border" : ""}>
                    {hasMultipleChannels && (
                      <p className="text-[11px] font-semibold text-mar-accent uppercase tracking-wide mb-3">{chKey}</p>
                    )}
                    {coeffs.map((coeff) => (
                      <div key={coeff.id}>
                        {coeff.coefficient_type === "linear" && (
                          <div className="flex flex-wrap gap-3">
                            {coeff.gain != null && <CoeffCard label="Gain" sub="a" value={fmtNum(coeff.gain)} />}
                            {coeff.offset_value != null && <CoeffCard label="Offset" sub="b" value={fmtNum(coeff.offset_value)} />}
                          </div>
                        )}
                        {coeff.coefficient_type === "polynomial" && coeff.poly_coefficients && (
                          <div className="flex flex-wrap gap-3">
                            {coeff.poly_coefficients[1] != null && <CoeffCard label="Gain" sub="a" value={fmtNum(coeff.poly_coefficients[1])} />}
                            {coeff.poly_coefficients[0] != null && <CoeffCard label="Offset" sub="b" value={fmtNum(coeff.poly_coefficients[0])} />}
                            {coeff.poly_coefficients[2] != null && <CoeffCard label="Quadratic" sub="a₂" value={fmtNum(coeff.poly_coefficients[2])} />}
                          </div>
                        )}
                        <CalibrationFormula coeff={coeff} />
                        {coeff.notes && <p className="mt-2 text-xs text-gray-400">{coeff.notes}</p>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-gray-400">No coefficients recorded for this calibration.</p>
          )}
        </div>
      ) : (
        <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
          <p className="text-sm text-gray-400">No calibrations recorded for this asset.</p>
        </div>
      )}

      {calibrations.length > 0 && (
        <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
          <h3 className="text-sm font-semibold text-mar-text mb-1">Calibration history</h3>
          <p className="text-xs text-gray-400 mb-4">Select a calibration to view its coefficients.</p>
          <div className="divide-y divide-mar-border">
            {calibrations.map((cal, idx) => {
              const isSelected = cal.id === selectedCalId;
              const certForCal = certs.find((c) => c.calibration_id === cal.id);
              return (
                <button
                  key={cal.id}
                  type="button"
                  onClick={() => setSelectedCalId(cal.id)}
                  className={`w-full flex items-start gap-4 py-3 px-2 -mx-2 text-left rounded-lg transition-colors
                    ${isSelected ? "bg-mar-surface-alt" : "hover:bg-mar-surface-alt/50"}`}
                >
                  <div className={`flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center mt-0.5
                    ${isSelected ? "border-mar-accent text-mar-accent" : "border-mar-border bg-mar-surface-alt text-gray-400"}`}>
                    <span className="text-[10px] font-bold">v{versionOf(idx)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-mar-text">{fmtDate(cal.calibration_date)}</span>
                      <CalibrationResultBadge result={cal.result} />
                      {certForCal && <span className="text-[10px] text-gray-400">{certForCal.certificate_number}</span>}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      by {cal.performed_by_name}{cal.external_lab_name ? ` · ${cal.external_lab_name}` : ""}
                    </p>
                    {cal.notes && <p className="text-xs text-gray-500 mt-1 italic">{cal.notes}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files tab
// ---------------------------------------------------------------------------

function FilesTab({ files }: { files: StoredFile[] }) {
  return (
    <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-mar-text mb-4">Files &amp; attachments</h3>
      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-gray-400">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="mb-3 opacity-40" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          </svg>
          <p className="text-sm">No files attached to this asset.</p>
          <p className="text-xs mt-1">Upload calibration certificates, datasheets, or photos.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => {
            const type = fileIcon(f.content_type);
            const typeLabel: Record<string, string> = { pdf: "PDF", csv: "CSV", zip: "Archive", doc: "File" };
            return (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-mar-border hover:border-mar-border-md hover:bg-mar-surface-alt transition-colors">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 text-[10px] font-bold
                  ${type === "pdf" ? "bg-red-50 text-red-500 dark:bg-red-950/30" :
                    type === "csv" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" :
                    type === "zip" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30" :
                    "bg-mar-surface-alt text-gray-400"}`}>
                  {typeLabel[type]}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-mar-text truncate">{f.original_filename}</p>
                  <p className="text-xs text-gray-400">{typeLabel[type]} · {fmtBytes(f.size_bytes)}</p>
                </div>
                <button type="button" className="p-1.5 rounded hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors flex-shrink-0">
                  <DownloadIcon size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Activity tab
// ---------------------------------------------------------------------------

function ActivityTab({ logs }: { logs: AuditLogEntry[] }) {
  return (
    <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-mar-text mb-4">Audit log</h3>
      {logs.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">No activity recorded for this asset.</p>
      ) : (
        <div className="divide-y divide-mar-border">
          {logs.map((log) => {
            const d = new Date(log.created_at);
            const dateStr = d.toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
            const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
            return (
              <div key={log.id} className="grid grid-cols-[7rem_10rem_1fr] items-start gap-4 py-2.5 text-xs">
                <span className="font-mono text-gray-400">{dateStr} {timeStr}</span>
                <span className="text-gray-500 truncate">{log.actor_email}</span>
                <span className="font-medium text-mar-text">{actionLabel(log.action)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "overview" | "calibration" | "files" | "activity";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "calibration", label: "Calibration" },
  { key: "files", label: "Files" },
  { key: "activity", label: "Activity" },
];

export default function AssetProfilePage() {
  const params = useParams();
  const id = params.id as string;

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [profile, setProfile] = useState<AssetProfile | null>(null);
  const [calibrations, setCalibrations] = useState<CalibrationRecord[]>([]);
  const [coeffsByCalId, setCoeffsByCalId] = useState<Record<string, CalibrationCoefficient[]>>({});
  const [certs, setCerts] = useState<CertInfo[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<EditFormState | null>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [locations, setLocations] = useState<LocationOption[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [retireModalOpen, setRetireModalOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      getAssetProfile(id),
      getAssetCalibrations(id),
      getAssetCertificates(id),
      getAssetAuditLogs(id),
      getAssetFiles(id),
    ])
      .then(async ([profileData, calsData, certsData, logsData, filesData]) => {
        setProfile(profileData);
        setCalibrations(calsData);
        setCerts(certsData as CertInfo[]);
        setAuditLogs(logsData);
        setFiles(filesData);

        if (calsData.length > 0) {
          const coeffResults = await Promise.all(calsData.map((cal) => getCalibrationCoefficients(cal.id)));
          const map: Record<string, CalibrationCoefficient[]> = {};
          calsData.forEach((cal, i) => { map[cal.id] = coeffResults[i]; });
          setCoeffsByCalId(map);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  function handleStartEdit() {
    if (!profile) return;
    setEditForm(profileToForm(profile));
    setEditErrors({});
    setSaveError(null);
    setIsEditing(true);
    setActiveTab("overview");
    listLocations().then(setLocations).catch(() => {});
    listTeams().then(setTeams).catch(() => {});
  }

  async function handleRetire(reason?: string) {
    if (!profile) return;
    try {
      await retireAsset(profile.id, reason);
      const updated = await getAssetProfile(id);
      setProfile(updated);
      setRetireModalOpen(false);
      setIsEditing(false);
      setEditForm(null);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to retire asset.");
      setRetireModalOpen(false);
    }
  }

  function handleCancelEdit() {
    setIsEditing(false);
    setEditForm(null);
    setEditErrors({});
    setSaveError(null);
  }

  function handleFormChange(form: EditFormState) {
    setEditForm(form);
    // Re-validate only if there were previous errors (real-time feedback)
    if (Object.keys(editErrors).length > 0) {
      setEditErrors(validateForm(form));
    }
  }

  async function handleSave() {
    if (!profile || !editForm) return;
    const errors = validateForm(editForm);
    if (Object.keys(errors).length > 0) {
      setEditErrors(errors);
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      await updateAsset(profile.id, formToUpdate(editForm));
      // Reload the full profile + audit logs
      const [updatedProfile, updatedLogs] = await Promise.all([
        getAssetProfile(id),
        getAssetAuditLogs(id),
      ]);
      setProfile(updatedProfile);
      setAuditLogs(updatedLogs);
      setIsEditing(false);
      setEditForm(null);
      setEditErrors({});
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save changes.");
    } finally {
      setIsSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-400">
        <span className="inline-block w-5 h-5 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin mr-3" />
        Loading asset…
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-5 py-4 text-sm text-red-600 dark:text-red-400">
          {error ?? "Asset not found."}
        </div>
      </div>
    );
  }

  const hasErrors = Object.keys(editErrors).length > 0;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

      {retireModalOpen && (
        <RetireModal
          assetName={profile.name}
          onRetire={handleRetire}
          onClose={() => setRetireModalOpen(false)}
        />
      )}

      {!profile.is_active && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-5 py-3 flex items-center gap-3">
          <WarningIcon size={16} className="text-red-500 flex-shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            This asset has been retired{profile.retired_reason ? `: ${profile.retired_reason}` : ""} and is read-only.
          </p>
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-xs text-gray-400">
        <Link href="/assets" className="hover:text-mar-text transition-colors">Assets</Link>
        {profile.site_name && (
          <>
            <ChevronLeftIcon size={10} className="rotate-180 opacity-50" />
            <span>{profile.site_name}</span>
          </>
        )}
        <ChevronLeftIcon size={10} className="rotate-180 opacity-50" />
        <span className="font-mono text-mar-text">{profile.asset_id}</span>
      </nav>

      {/* Header card */}
      <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-mar-text">
                {isEditing && editForm ? (editForm.name || profile.name) : profile.name}
              </h1>
              <StatusBadge status={profile.calibration_status} />
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-400">
              <span className="font-mono text-xs text-mar-accent">{profile.asset_id}</span>
              {(profile.site_name || profile.location_name) && (
                <span className="flex items-center gap-1">
                  <MapPinIcon size={12} className="text-mar-accent" />
                  <span>
                    {profile.location_name}
                    {profile.site_name && profile.site_name !== profile.location_name ? ` · ${profile.site_name}` : ""}
                  </span>
                </span>
              )}
              <span>{profile.manufacturer} · {profile.model}</span>
            </div>
            {isEditing && (
              <p className="text-xs text-amber-500 mt-2 font-medium">● Editing — unsaved changes</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            {!isEditing ? (
              <>
                <button type="button"
                  className="p-2 rounded-lg border border-mar-border hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors"
                  title="QR code">
                  <QrCodeIcon size={16} />
                </button>
                {profile.is_active && (
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <EditIcon size={14} />
                    Edit
                  </button>
                )}
              </>
            ) : (
              <div className="flex flex-col items-end gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCancelEdit}
                    disabled={isSaving}
                    className="flex items-center gap-1.5 px-3 py-2 border border-mar-border-md text-sm font-medium rounded-lg hover:bg-mar-surface-alt text-mar-text transition-colors disabled:opacity-50"
                  >
                    <XIcon size={14} />
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSave}
                    disabled={isSaving || hasErrors}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isSaving ? (
                      <span className="inline-block w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <CheckIcon size={14} />
                    )}
                    {isSaving ? "Saving…" : "Save changes"}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setRetireModalOpen(true)}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:text-red-600 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <WarningIcon size={13} />
                  Retire asset
                </button>
              </div>
            )}
          </div>
        </div>

        {saveError && (
          <div className="mt-3 rounded-lg bg-red-50 dark:bg-red-950/30 border border-red-100 dark:border-red-900/40 px-4 py-2.5 text-sm text-red-600 dark:text-red-400">
            {saveError}
          </div>
        )}
        {hasErrors && isEditing && (
          <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40 px-4 py-2.5 text-sm text-amber-600 dark:text-amber-400">
            Please fix the validation errors before saving.
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Health score</p>
          <p className="text-2xl font-bold text-mar-text">{profile.health_score}%</p>
          <div className="mt-2 h-1.5 rounded-full bg-mar-border overflow-hidden">
            <div className="h-full rounded-full bg-mar-accent transition-all" style={{ width: `${profile.health_score}%` }} />
          </div>
        </div>
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Last calibration</p>
          <p className="text-xl font-semibold font-mono text-mar-text tabular-nums">{fmtDate(profile.last_calibration_date)}</p>
        </div>
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Next due</p>
          <p className="text-xl font-semibold font-mono text-mar-text tabular-nums">{fmtDate(profile.next_due_at)}</p>
        </div>
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Calibrations</p>
          <p className="text-2xl font-bold text-mar-text">{profile.calibration_count}</p>
          <p className="text-xs text-gray-400 mt-1">all-time</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-mar-surface border border-mar-border rounded-xl">
        <div className="flex border-b border-mar-border px-1">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab.key
                  ? "border-mar-accent text-mar-accent"
                  : "border-transparent text-gray-400 hover:text-mar-text"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5">
          {activeTab === "overview" && (
            <OverviewTab
              profile={profile}
              isEditing={isEditing}
              form={editForm}
              onChange={handleFormChange}
              errors={editErrors}
              locations={locations}
              teams={teams}
            />
          )}
          {activeTab === "calibration" && (
            <CalibrationTab calibrations={calibrations} coeffsByCalId={coeffsByCalId} certs={certs} />
          )}
          {activeTab === "files" && <FilesTab files={files} />}
          {activeTab === "activity" && <ActivityTab logs={auditLogs} />}
        </div>
      </div>
    </div>
  );
}
