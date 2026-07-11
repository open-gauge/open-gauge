"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  deleteAssetFile,
  deleteCalibration,
  fetchAssetLabelBlob,
  getAssetAuditLogs,
  getAssetCalibrations,
  getAssetFiles,
  getAssetProfile,
  getCalibrationCertificateUrl,
  getCalibrationPoints,
  listLocations,
  listTeams,
  retireAsset,
  updateAsset,
  uploadAssetFile,
} from "@/services/asset.service";
import { useAuth } from "@/lib/auth-context";
import type { AssetProfile, AssetUpdateRequest, LocationOption, SensorChannelUpdateInput } from "@/types/asset";
import type { CalibrationPoint, CalibrationRecord } from "@/types/calibration";
import type { AuditLogEntry } from "@/types/audit_log";
import type { StoredFile } from "@/types/stored_file";
import {
  CALIBRATION_STATUS_LABEL,
  CALIBRATION_STATUS_STYLE,
  COLORS,
  DECISION_RULE_LABEL,
  HEALTH_LABEL_STYLE,
  STABILITY_STYLE,
  SUBTYPE_LABEL,
  UNCERTAINTY_SOURCE_LABEL,
} from "@/lib/tokens";
import { getAssetHealth } from "@/services/health.service";
import type { HealthOverview } from "@/types/health";
import {
  PHYSICAL_QUANTITIES,
  parseTechnology,
  MOUNTING_TYPE_OPTIONS,
  IP_RATING_OPTIONS,
  HAZARDOUS_AREA_OPTIONS,
  OUTPUT_TYPE_OPTIONS,
  getOutputUnits,
  getTypesForQuantity,
  getSpecUnitOptions,
  PERCENT_FS_UNIT,
} from "@/lib/sensor-options";
import { toSI, fromSI } from "@/lib/unit-conversion";
import { roundToSigFigs } from "@/lib/uncertainty-format";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  InfoIcon,
  MapPinIcon,
  PlusIcon,
  QrCodeIcon,
  TrashIcon,
  UploadCloudIcon,
  WarningIcon,
  XIcon,
} from "@/components/icons";
import { CalibrationWizard } from "./CalibrationWizard";
import { getLocation } from "@/services/location.service";
import type { LocationItem } from "@/types/location";
import { UserMention } from "@/components/user-mention";
import { Tooltip } from "@/components/tooltip";
import { StatRow } from "@/components/stat-row";
import { CHAN_DOCS_LINKS, STAT_DOCS_LINKS } from "@/lib/docs-links";
import { HealthTab } from "./HealthTab";

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
  sensor_id: string | null;
  channel_id: string;
  physical_quantity: string;
  measurement_type: string;
  unit: string;
  _techFamily: string;
  technology: string;
  measurement_min: string;
  measurement_max: string;
  accuracy_value: string;
  accuracy_type: string;  // derived from accuracy_unit; not directly editable
  accuracy_unit: string;
  resolution: string;
  resolution_unit: string;
  measurement_uncertainty: string;
  uncertainty_unit: string;
  drift_rate: string;
  drift_unit: string;
  response_time_ms: string;
  bandwidth_hz: string;
  output_signal_min: string;
  output_signal_max: string;
  output_signal_unit: string;
  output_type: string;
  calibration_role: boolean;  // checkbox: true = "reference" standard
}

interface EditFormState {
  asset_id: string;
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
    asset_id: s(profile.asset_id),
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
        sensor_id: ch.id,
        channel_id: s(ch.channel_id),
        physical_quantity: s(ch.physical_quantity),
        measurement_type: s(ch.measurement_type),
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
        drift_rate: s(ch.drift_rate),
        drift_unit: s(ch.drift_unit),
        response_time_ms: s(ch.response_time_ms),
        bandwidth_hz: s(ch.bandwidth_hz),
        output_signal_unit: s(ch.output_signal_unit),
        output_signal_min: s(fromSI(ch.output_signal_min, ch.output_signal_unit ?? "")),
        output_signal_max: s(fromSI(ch.output_signal_max, ch.output_signal_unit ?? "")),
        output_type: s(ch.output_type),
        calibration_role: ch.calibration_role === "reference",
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
    sensor_id: ch.sensor_id ?? null,
    channel_id: ch.channel_id.trim(),
    physical_quantity: ch.physical_quantity,
    measurement_type: orNull(ch.measurement_type),
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
    drift_rate: numOrNull(ch.drift_rate),
    drift_unit: orNull(ch.drift_unit),
    response_time_ms: numOrNull(ch.response_time_ms),
    bandwidth_hz: numOrNull(ch.bandwidth_hz),
    output_signal_unit: orNull(ch.output_signal_unit),
    output_signal_min: numSI(ch.output_signal_min, ch.output_signal_unit),
    output_signal_max: numSI(ch.output_signal_max, ch.output_signal_unit),
    output_type: orNull(ch.output_type),
    calibration_role: ch.calibration_role ? "reference" : null,
  }));

  return {
    asset_id: form.asset_id.trim() || undefined,
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

  if (!form.asset_id.trim()) errors.asset_id = "Asset ID is required";
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
      "drift_rate", "response_time_ms", "bandwidth_hz",
      "output_signal_min", "output_signal_max",
      "measurement_uncertainty",
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

const INPUT_BASE = "w-full px-3 py-2 rounded-lg border text-sm text-mar-text bg-mar-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600";
const INPUT_OK = "border-mar-border-md focus:border-mar-accent focus:ring-mar-accent/20";
const INPUT_ERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

function ELabel({ label, required, tooltip, tooltipDocsHref }: { label: string; required?: boolean; tooltip?: string; tooltipDocsHref?: string }) {
  return (
    <span className="flex items-center gap-1">
      <span className="text-xs text-gray-400">
        {label}{required && <span className="text-red-400 ml-0.5">*</span>}
      </span>
      {tooltip && (
        <Tooltip content={tooltip} docsHref={tooltipDocsHref}>
          <InfoIcon size={11} className="text-gray-400 cursor-help shrink-0" />
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
  label, value, onChange, error, required, placeholder, type = "text", readOnly, tooltip, tooltipDocsHref,
}: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; required?: boolean; placeholder?: string; type?: string; readOnly?: boolean; tooltip?: string; tooltipDocsHref?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ELabel label={label} required={required} tooltip={tooltip} tooltipDocsHref={tooltipDocsHref} />
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
  label, value, onChange, options, error, required, placeholder, tooltip, tooltipDocsHref,
}: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  error?: string; required?: boolean; placeholder?: string; tooltip?: string; tooltipDocsHref?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <ELabel label={label} required={required} tooltip={tooltip} tooltipDocsHref={tooltipDocsHref} />
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
  physicalQuantity, measurementType, techFamily, technology,
  onQuantityChange, onMeasurementTypeChange, onTechChange,
  errors, prefix,
}: {
  physicalQuantity: string;
  measurementType: string;
  techFamily: string;
  technology: string;
  onQuantityChange: (q: string) => void;
  onMeasurementTypeChange: (t: string) => void;
  onTechChange: (family: string, tech: string) => void;
  errors: Record<string, string>;
  prefix: string;
}) {
  const quantityDef = PHYSICAL_QUANTITIES.find((q) => q.value === physicalQuantity);
  const techs = quantityDef?.technologies ?? [];
  const selectedFamily = techs.find((t) => t.value === techFamily);
  const typeOptions = getTypesForQuantity(physicalQuantity);

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
  const showSecondRow = typeOptions.length > 0 || (selectedFamily?.subtypes && techFamily !== "__other__") || techFamily === "__other__";

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <EditSelect
          label="Physical quantity"
          value={physicalQuantity}
          onChange={onQuantityChange}
          options={PHYSICAL_QUANTITIES.map((q) => ({ value: q.value, label: q.label }))}
          error={errors[`${prefix}physical_quantity`]}
          required
          tooltip={CHAN_TIPS.physical_quantity}
          tooltipDocsHref={CHAN_DOCS_LINKS.physical_quantity}
        />
        {quantityDef && (
          <EditSelectWithOther
            label="Technology"
            value={techFamily}
            onChange={handleFamilyChange}
            options={techs.map((t) => ({ value: t.value, label: t.label }))}
          />
        )}
      </div>
      {showSecondRow && (
        <div className="grid grid-cols-2 gap-3">
          {typeOptions.length > 0 ? (
            <EditSelect
              label="Measurement type"
              value={measurementType}
              onChange={onMeasurementTypeChange}
              options={typeOptions}
              tooltip={CHAN_TIPS.measurement_type}
              tooltipDocsHref={CHAN_DOCS_LINKS.measurement_type}
            />
          ) : <div />}
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
  measurement_type: "Measurement mode for physical quantities that need one — e.g. a pressure sensor reading absolute pressure vs. gauge (relative to atmosphere).",
  accuracy_value: "Maximum deviation between the sensor output and the true value. Smaller means more accurate. Choose \"% FS\" as the unit to express this as a percentage of the measurable range instead of an absolute value.",
  resolution: "Smallest change in input the sensor can detect and represent in its output.",
  measurement_uncertainty: "Quantifies doubt about the measurement result. Expressed as ±value; folded into a calibration's uncertainty budget as an optional Type B contribution.",
  drift_rate: "Rate at which the sensor output shifts over time without any change in the measured quantity.",
  response_time_ms: "Time for the sensor output to reach a defined percentage of its final value after a step input change.",
  bandwidth_hz: "Maximum frequency of input changes the sensor can accurately follow.",
  calibration_role: "Marks this channel as a reference standard, so it can be selected as the traceability reference when calibrating other assets.",
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

  // Accuracy/resolution/uncertainty share the same "unit dropdown, %FS first
  // when a range is set" pattern instead of a separate type field.
  const specUnitOptions = getSpecUnitOptions(ch.physical_quantity, ch.measurement_min, ch.measurement_max);
  const setAccuracyUnit = (v: string) => onChange({
    ...ch,
    accuracy_unit: v,
    accuracy_type: v === "" ? "" : v === PERCENT_FS_UNIT ? "percent_of_full_scale" : "absolute",
  });

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
        measurementType={ch.measurement_type}
        techFamily={ch._techFamily}
        technology={ch.technology}
        onQuantityChange={(q) => {
          const def = PHYSICAL_QUANTITIES.find((x) => x.value === q);
          onChange({ ...ch, physical_quantity: q, unit: def?.units[0]?.value ?? "", measurement_type: "", _techFamily: "", technology: "" });
        }}
        onMeasurementTypeChange={set("measurement_type")}
        onTechChange={(fam, tech) => onChange({ ...ch, _techFamily: fam, technology: tech })}
        errors={errors}
        prefix={p}
      />

      {/* Range + unit */}
      <div className="grid grid-cols-3 gap-3">
        <EditInput label="Range min" value={ch.measurement_min} onChange={set("measurement_min")} error={errors[`${p}measurement_min`]} placeholder="e.g. -200" />
        <EditInput label="Range max" value={ch.measurement_max} onChange={set("measurement_max")} error={errors[`${p}measurement_max`]} placeholder="e.g. 850" />
        <EditSelect label="Unit" value={ch.unit} onChange={set("unit")} options={getSpecUnitOptions(ch.physical_quantity, null, null)} error={errors[`${p}unit`]} required />
      </div>

      {/* Output — type first, then range under it in the same column format */}
      <EditSelectWithOther label="Output type" value={ch.output_type} onChange={(v) => {
        const units = getOutputUnits(v, ch.physical_quantity);
        onChange({ ...ch, output_type: v, output_signal_unit: units?.[0]?.value ?? "" });
      }} options={OUTPUT_TYPE_OPTIONS} />
      <div className="grid grid-cols-3 gap-3">
        <EditInput label="Output min" value={ch.output_signal_min} onChange={set("output_signal_min")} error={errors[`${p}output_signal_min`]} placeholder="e.g. 4" />
        <EditInput label="Output max" value={ch.output_signal_max} onChange={set("output_signal_max")} error={errors[`${p}output_signal_max`]} placeholder="e.g. 20" />
        <OutputUnitSelector outputType={ch.output_type} physicalQuantity={ch.physical_quantity} value={ch.output_signal_unit} onChange={set("output_signal_unit")} />
      </div>

      {/* Accuracy */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Accuracy value" value={ch.accuracy_value} onChange={set("accuracy_value")} error={errors[`${p}accuracy_value`]} placeholder="e.g. 0.5" tooltip={CHAN_TIPS.accuracy_value} tooltipDocsHref={CHAN_DOCS_LINKS.accuracy_value} />
        <EditSelect label="Accuracy unit" value={ch.accuracy_unit} onChange={setAccuracyUnit} options={specUnitOptions} />
      </div>

      {/* Resolution */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Resolution" value={ch.resolution} onChange={set("resolution")} error={errors[`${p}resolution`]} placeholder="e.g. 0.01" tooltip={CHAN_TIPS.resolution} tooltipDocsHref={CHAN_DOCS_LINKS.resolution} />
        <EditSelect label="Resolution unit" value={ch.resolution_unit} onChange={set("resolution_unit")} options={specUnitOptions} />
      </div>

      {/* Uncertainty */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Uncertainty (±)" value={ch.measurement_uncertainty} onChange={set("measurement_uncertainty")} error={errors[`${p}measurement_uncertainty`]} placeholder="e.g. 0.3" tooltip={CHAN_TIPS.measurement_uncertainty} tooltipDocsHref={CHAN_DOCS_LINKS.measurement_uncertainty} />
        <EditSelect label="Uncertainty unit" value={ch.uncertainty_unit} onChange={set("uncertainty_unit")} options={specUnitOptions} />
      </div>

      {/* Drift */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Drift rate" value={ch.drift_rate} onChange={set("drift_rate")} error={errors[`${p}drift_rate`]} placeholder="e.g. 0.1" tooltip={CHAN_TIPS.drift_rate} tooltipDocsHref={CHAN_DOCS_LINKS.drift_rate} />
        <EditInput label="Drift unit" value={ch.drift_unit} onChange={set("drift_unit")} placeholder="e.g. °C/year" />
      </div>

      {/* Dynamic */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label="Response time (ms)" value={ch.response_time_ms} onChange={set("response_time_ms")} error={errors[`${p}response_time_ms`]} placeholder="e.g. 300" tooltip={CHAN_TIPS.response_time_ms} tooltipDocsHref={CHAN_DOCS_LINKS.response_time_ms} />
        <EditInput label="Bandwidth (Hz)" value={ch.bandwidth_hz} onChange={set("bandwidth_hz")} error={errors[`${p}bandwidth_hz`]} placeholder="e.g. 1000" tooltip={CHAN_TIPS.bandwidth_hz} tooltipDocsHref={CHAN_DOCS_LINKS.bandwidth_hz} />
      </div>

      {/* Calibration role */}
      <label className="flex items-center gap-2 text-sm text-mar-text cursor-pointer">
        <input
          type="checkbox"
          checked={ch.calibration_role}
          onChange={(e) => onChange({ ...ch, calibration_role: e.target.checked })}
          className="rounded-sm border-mar-border-md"
        />
        Reference standard
        <Tooltip content={CHAN_TIPS.calibration_role} docsHref={CHAN_DOCS_LINKS.calibration_role}>
          <InfoIcon size={11} className="text-gray-400 cursor-help shrink-0" />
        </Tooltip>
      </label>
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
          <span className={`transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}>
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
          <WarningIcon size={20} className="text-red-500 shrink-0" />
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
            className="w-full px-3 py-2 rounded-lg border border-mar-border-md text-sm text-mar-text bg-mar-surface focus:outline-hidden focus:ring-1 focus:border-mar-accent focus:ring-mar-accent/20 placeholder:text-gray-400 dark:placeholder:text-gray-600"
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
          sensor_id: null,
          channel_id: "",
          physical_quantity: firstQ.value,
          measurement_type: "",
          unit: firstQ.units[0]?.value ?? "",
          _techFamily: "",
          technology: "",
          measurement_min: "", measurement_max: "",
          accuracy_value: "", accuracy_type: "", accuracy_unit: "",
          resolution: "", resolution_unit: "",
          measurement_uncertainty: "", uncertainty_unit: "",
          drift_rate: "", drift_unit: "",
          response_time_ms: "", bandwidth_hz: "",
          output_signal_min: "", output_signal_max: "", output_signal_unit: "",
          output_type: "", calibration_role: false,
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
              <EditInput label="Asset ID" value={form.asset_id} onChange={set("asset_id")} error={errors.asset_id} required placeholder="e.g. MAR-00001" />
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
                    <SpecRow
                      label="Measurement type"
                      value={getTypesForQuantity(ch.physical_quantity).find((t) => t.value === ch.measurement_type)?.label ?? ch.measurement_type}
                    />
                    <SpecRow label="Technology" value={ch.technology} />
                    {(ch.measurement_min != null || ch.measurement_max != null) && (
                      <SpecRow label="Range" value={`${ch.measurement_min ?? "—"} – ${ch.measurement_max ?? "—"} ${ch.unit}`} />
                    )}
                    {ch.accuracy_value != null && (
                      <SpecRow label="Accuracy" value={`±${ch.accuracy_value}${ch.accuracy_unit ? " " + ch.accuracy_unit : ""}`} />
                    )}
                    {ch.resolution != null && (
                      <SpecRow label="Resolution" value={`${ch.resolution}${ch.resolution_unit ? " " + ch.resolution_unit : ""}`} />
                    )}
                    {ch.measurement_uncertainty != null && (
                      <SpecRow label="Uncertainty" value={`±${ch.measurement_uncertainty}${ch.uncertainty_unit ? " " + ch.uncertainty_unit : ""}`} />
                    )}
                    {ch.drift_rate != null && (
                      <SpecRow label="Drift rate" value={`${ch.drift_rate}${ch.drift_unit ? " " + ch.drift_unit : ""}`} />
                    )}
                    {ch.response_time_ms != null && <SpecRow label="Response time" value={`${ch.response_time_ms} ms`} />}
                    {ch.bandwidth_hz != null && <SpecRow label="Bandwidth" value={`${ch.bandwidth_hz.toLocaleString()} Hz`} />}
                    <SpecRow label="Output type" value={ch.output_type} />
                    {(ch.output_signal_min != null || ch.output_signal_max != null) && (
                      <SpecRow label="Output range" value={`${ch.output_signal_min ?? "—"} – ${ch.output_signal_max ?? "—"}${ch.output_signal_unit ? " " + ch.output_signal_unit : ""}`} />
                    )}
                    <SpecRow label="Cal. method" value={ch.calibration_method_name} />
                    <SpecRow label="Cal. role" value={ch.calibration_role === "reference" ? "Reference standard" : null} />
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

interface CalibrationTabProps {
  calibrations: CalibrationRecord[];
  profile: AssetProfile;
  onCalibrationSaved: () => void;
  onCalibrationDeleted: () => void;
  isAdmin: boolean;
}

// Format polynomial equation — coefficients are highest-degree first (numpy convention)
function formatCalEquation(coefficients: number[], degree: number): string {
  const SUPERS: Record<number, string> = { 2: "²", 3: "³", 4: "⁴", 5: "⁵" };
  const parts: string[] = [];
  for (let exp = 0; exp <= degree; exp++) {
    const c = coefficients[degree - exp];
    if (Math.abs(c) < 1e-15) continue;
    const sign = c < 0 ? (parts.length === 0 ? "−" : " − ") : (parts.length === 0 ? "" : " + ");
    const absStr = fmtNum(Math.abs(c), 4);
    if (exp === 0) parts.push(sign + absStr);
    else if (exp === 1) parts.push(sign + absStr + "·x");
    else parts.push(sign + absStr + "·x" + (SUPERS[exp] ?? `^${exp}`));
  }
  return "f(x) = " + (parts.join("") || "0");
}

function evalCalPoly(coefficients: number[], x: number): number {
  let y = 0;
  const deg = coefficients.length - 1;
  for (let j = 0; j <= deg; j++) y += coefficients[j] * Math.pow(x, deg - j);
  return y;
}

function calResidualColor(residual: number, maxAbsResidual: number): string {
  const t = Math.min(Math.abs(residual) / (maxAbsResidual || 1), 1);
  const hue = Math.round(120 * (1 - t));
  return `hsl(${hue},80%,42%)`;
}

// Chart panel — renders Plotly scatter + fit curve from saved CalibrationPoint data
function CalibrationChart({
  cal, points, measuredUnit, referenceUnit,
}: {
  cal: CalibrationRecord;
  points: CalibrationPoint[];
  measuredUnit: string;
  referenceUnit: string;
}) {
  const plotDivRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import("plotly.js-dist-min").default | null>(null);

  useEffect(() => {
    const div = plotDivRef.current;
    if (!div || points.length === 0 || !cal.poly_coefficients) return;
    let mounted = true;

    const maxAbs = Math.max(...points.map((p) => Math.abs(p.residual_abs ?? 0)), 1e-10);
    const xs = points.map((p) => p.measured_value);
    const mn = Math.min(...xs), mx = Math.max(...xs);

    const scatter = points.map((p) => ({
      x: p.measured_value,
      y: p.reference_value,
      color: calResidualColor(p.residual_abs ?? 0, maxAbs),
      residual: p.residual_abs ?? 0,
      idx: p.point_index,
    }));

    const curve = Array.from({ length: 81 }, (_, i) => {
      const x = mn + (i * (mx - mn)) / 80;
      return { x, y: evalCalPoly(cal.poly_coefficients!, x) };
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

      Plotly.react(div, traces, layout, {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "select2d", "lasso2d", "hoverClosestCartesian", "hoverCompareCartesian", "toggleSpikelines"],
        scrollZoom: true,
      });
    });

    return () => { mounted = false; };
  }, [cal.poly_coefficients, points, measuredUnit, referenceUnit]);

  useEffect(() => {
    const div = plotDivRef.current;
    return () => {
      if (plotlyRef.current && div) {
        try { plotlyRef.current.purge(div); } catch { /* ignore */ }
      }
    };
  }, []);

  return (
    <div className="rounded-xl border border-mar-border bg-mar-surface relative overflow-hidden" style={{ minHeight: 320 }}>
      <div className="absolute bottom-16 right-3 z-20 pointer-events-none">
        <div className="bg-mar-surface border border-mar-border rounded-lg px-2 py-1.5 shadow-xs">
          <p className="text-[9px] text-gray-400 font-medium uppercase tracking-wide mb-1">Residual</p>
          <div className="flex items-center gap-1.5">
            <div className="w-3 rounded-xs" style={{ height: 44, background: "linear-gradient(to bottom, hsl(0,80%,42%), hsl(60,80%,42%), hsl(120,80%,42%))" }} />
            <div className="flex flex-col justify-between h-11 text-[10px] text-gray-400">
              <span>High</span>
              <span>Low</span>
            </div>
          </div>
        </div>
      </div>
      <div ref={plotDivRef} style={{ height: 320, width: "100%" }} />
    </div>
  );
}

// Coefficient exponent descriptions (ascending: exp 0 = constant, exp 1 = linear, …)
const COEFF_DESC: Record<number, string> = {
  0: "Offset (constant)",
  1: "Gain (slope)",
  2: "Quadratic correction",
  3: "Cubic correction",
  4: "Quartic correction",
  5: "Quintic correction",
};

type ResultView = "equation" | "coefficients";

function CalibrationTab({ calibrations, profile, onCalibrationSaved, onCalibrationDeleted, isAdmin }: CalibrationTabProps) {
  // --- channel logic ---
  const channelIdsWithCals = profile.sensor_channels
    .map((ch) => ch.id)
    .filter((id) => calibrations.some((c) => c.sensor_id === id));
  const hasChannelTabs = channelIdsWithCals.length > 1;
  const firstChannelId = channelIdsWithCals[0] ?? null;

  const [activeChannelId, setActiveChannelId] = useState<string | null>(firstChannelId);
  const [selectedCalId, setSelectedCalId] = useState<string | null>(null);
  const [points, setPoints] = useState<CalibrationPoint[]>([]);
  const [loadingPoints, setLoadingPoints] = useState(false);
  const [rightView, setRightView] = useState<"chart" | "table">("chart");
  const [resultView, setResultView] = useState<ResultView>("equation");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [certLoading, setCertLoading] = useState(false);
  const [calLocation, setCalLocation] = useState<LocationItem | null>(null);
  const [deletingCalId, setDeletingCalId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const filteredCals = hasChannelTabs && activeChannelId
    ? calibrations.filter((c) => c.sensor_id === activeChannelId)
    : calibrations;

  const selectedCal = filteredCals.find((c) => c.id === selectedCalId) ?? filteredCals[0] ?? null;
  const total = filteredCals.length;

  useEffect(() => {
    setSelectedCalId(null);
    setPoints([]);
  }, [activeChannelId]);

  useEffect(() => {
    if (!selectedCal) { setPoints([]); return; }
    setLoadingPoints(true);
    getCalibrationPoints(selectedCal.id)
      .then(setPoints)
      .catch(() => setPoints([]))
      .finally(() => setLoadingPoints(false));
  }, [selectedCal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const locId = selectedCal?.calibration_location_id;
    if (!locId) { setCalLocation(null); return; }
    getLocation(locId).then(setCalLocation).catch(() => setCalLocation(null));
  }, [selectedCal?.calibration_location_id]);

  function versionOf(cal: CalibrationRecord): number {
    const idx = filteredCals.findIndex((c) => c.id === cal.id);
    return total - idx;
  }

  async function handleDeleteCal(calId: string) {
    setDeletingCalId(calId);
    try {
      await deleteCalibration(calId);
      setDeleteConfirmId(null);
      if (selectedCalId === calId) setSelectedCalId(null);
      onCalibrationDeleted();
    } catch {
      // leave modal open so user sees error feedback via disabled state
    } finally {
      setDeletingCalId(null);
    }
  }

  const referenceUnit = points[0]?.reference_unit ?? "";
  const measuredUnit = points[0]?.measured_unit ?? "";

  return (
    <>
    {wizardOpen && (
      <CalibrationWizard
        assetId={profile.id}
        profile={profile}
        onClose={() => setWizardOpen(false)}
        onSaved={() => { setWizardOpen(false); onCalibrationSaved(); }}
      />
    )}

    {deleteConfirmId && (() => {
      const calToDelete = filteredCals.find((c) => c.id === deleteConfirmId);
      const isDeleting = !!deletingCalId;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { if (!isDeleting) setDeleteConfirmId(null); }}
          />
          <div className="relative bg-mar-surface border border-mar-border rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <TrashIcon size={16} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-mar-text">Remove calibration</h3>
                {calToDelete && (
                  <p className="text-xs text-gray-400">
                    Version {calToDelete.calibration_version} · {fmtDate(calToDelete.calibration_date)}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              This will permanently delete the calibration record and its certificate. This action cannot be undone.
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setDeleteConfirmId(null)}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleDeleteCal(deleteConfirmId)}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Removing…
                  </>
                ) : "Remove permanently"}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    <div className="space-y-5">

      {/* Top bar: channel tabs (left) + PDF + Add Calibration (right) */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {hasChannelTabs ? (
          <div className="flex gap-1 p-1 bg-mar-surface-alt border border-mar-border rounded-xl w-fit">
            {channelIdsWithCals.map((chId) => {
              const ch = profile.sensor_channels.find((c) => c.id === chId);
              const label = ch ? `${ch.channel_id} — ${ch.physical_quantity}` : chId;
              const isActive = activeChannelId === chId;
              return (
                <button
                  key={chId}
                  type="button"
                  onClick={() => setActiveChannelId(chId)}
                  className={`px-4 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                    isActive
                      ? "bg-mar-surface text-mar-text shadow-xs border border-mar-border"
                      : "text-gray-400 hover:text-mar-text"
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        ) : <div />}

        <div className="flex items-center gap-2">
          {selectedCal && (
            <button
              type="button"
              disabled={certLoading}
              onClick={async () => {
                setCertLoading(true);
                try {
                  const { url, filename } = await getCalibrationCertificateUrl(selectedCal.id);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = filename;
                  a.click();
                } catch {
                  alert("Certificate not available yet. Please try again shortly.");
                } finally {
                  setCertLoading(false);
                }
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <DownloadIcon size={12} />
              {certLoading ? "Generating…" : "Download Certificate"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setWizardOpen(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={12} />
            Add Calibration
          </button>
        </div>
      </div>

      {selectedCal ? (
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5 space-y-4">
          {/* Header row — version / date / performed by */}
          <div className="flex items-start gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-mar-accent">v{versionOf(selectedCal)}</span>
                <span className="text-sm font-semibold text-mar-text">{fmtDate(selectedCal.calibration_date)}</span>
                <span className="text-xs text-gray-400">by {selectedCal.performed_by_name}{selectedCal.external_lab_name ? ` · ${selectedCal.external_lab_name}` : ""}</span>
              </div>
              {selectedCal.external_lab_certificate_number && (
                <p className="text-xs text-gray-400 mt-0.5">
                  <span className="opacity-60">📄</span>
                  {" "}{selectedCal.external_lab_certificate_number}
                </p>
              )}
            </div>
          </div>

          {/* Result view: Equation / Coefficients */}
          {selectedCal.poly_coefficients && selectedCal.poly_order != null && (
            <div className="rounded-lg bg-mar-surface-alt border border-mar-border overflow-hidden">
              <div className="flex items-center px-3 pt-2 pb-0 border-b border-mar-border gap-0.5">
                {(["equation", "coefficients"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setResultView(v)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors rounded-t-md -mb-px capitalize
                      ${resultView === v
                        ? "bg-mar-surface border border-mar-border text-mar-text"
                        : "text-gray-400 hover:text-mar-text"
                      }`}
                  >
                    {v === "equation" ? "Equation" : "Coefficients"}
                  </button>
                ))}
              </div>
              <div className="px-4 py-3">
                {resultView === "equation" && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-xs font-mono text-mar-text">
                        {formatCalEquation(selectedCal.poly_coefficients, selectedCal.poly_order)}
                      </span>
                      {(measuredUnit || referenceUnit) && (
                        <span className="text-[10px] text-gray-400">
                          ({measuredUnit} → {referenceUnit})
                        </span>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const text = `${formatCalEquation(selectedCal.poly_coefficients!, selectedCal.poly_order!)} (${measuredUnit} → ${referenceUnit})`;
                        navigator.clipboard.writeText(text).then(() => {
                          setCopiedKey("equation");
                          setTimeout(() => setCopiedKey(null), 1500);
                        });
                      }}
                      title="Copy"
                      className="shrink-0 p-1 text-gray-400 hover:text-mar-text rounded-sm transition-colors"
                    >
                      {copiedKey === "equation" ? <CheckIcon size={12} /> : <CopyIcon size={12} />}
                    </button>
                  </div>
                )}
                {resultView === "coefficients" && (
                  <div className="grid grid-cols-2 gap-x-6 gap-y-3">
                    {selectedCal.poly_coefficients
                      .map((c, i) => ({ exp: selectedCal.poly_order! - i, val: c }))
                      .reverse()
                      .map(({ exp, val }) => {
                        const ck = `coeff:${exp}`;
                        return (
                          <div key={exp} className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">
                                {COEFF_DESC[exp] ?? `Order-${exp} term`}
                              </p>
                              <p className="font-mono text-xs text-mar-text">{fmtNum(val, 6)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(fmtNum(val, 6)).then(() => {
                                  setCopiedKey(ck);
                                  setTimeout(() => setCopiedKey(null), 1500);
                                });
                              }}
                              title="Copy"
                              className="shrink-0 mt-3 p-1 text-gray-400 hover:text-mar-text rounded-sm transition-colors"
                            >
                              {copiedKey === ck ? <CheckIcon size={11} /> : <CopyIcon size={11} />}
                            </button>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Stats + chart/table */}
          {selectedCal.poly_coefficients ? (
            <div className="flex gap-4 min-h-0">
              {/* Left: stats panel (40%) */}
              <div className="w-[38%] shrink-0 rounded-xl border border-mar-border p-4 bg-mar-surface-alt space-y-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">Calibration</p>
                <StatRow label="Poly degree" value={String(selectedCal.poly_order ?? "—")} />
                {(selectedCal.valid_range_min != null || selectedCal.range_min != null) && (
                  <StatRow
                    label="Valid range"
                    value={`${fmtNum(selectedCal.valid_range_min ?? selectedCal.range_min)} – ${fmtNum(selectedCal.valid_range_max ?? selectedCal.range_max)}${referenceUnit ? ` ${referenceUnit}` : ""}`}
                  />
                )}
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 pt-3 border-t border-mar-border mb-2 mt-2">Statistics</p>
                <StatRow label="R²" value={fmtNum(selectedCal.r_squared, 6)} tip="Coefficient of determination — 1.0 is perfect." docsHref={STAT_DOCS_LINKS.r_squared} />
                <StatRow label="RMSE" value={selectedCal.rmse != null ? `${fmtNum(selectedCal.rmse)}${referenceUnit ? ` ${referenceUnit}` : ""}` : null} tip="Root mean square error." docsHref={STAT_DOCS_LINKS.rmse} />
                <StatRow label="Max error" value={selectedCal.max_error != null ? `${fmtNum(selectedCal.max_error)}${referenceUnit ? ` ${referenceUnit}` : ""}` : null} tip="Largest absolute residual." docsHref={STAT_DOCS_LINKS.max_error} />
                <StatRow label="%FS error" value={selectedCal.full_scale_error != null ? `${fmtNum(selectedCal.full_scale_error, 3)}%` : null} tip="Max error as % of full measurement span." docsHref={STAT_DOCS_LINKS.full_scale_error} />
                <StatRow label="Non-linearity" value={selectedCal.non_linearity != null ? `${fmtNum(selectedCal.non_linearity, 3)}%` : null} tip="Max deviation from ideal line, as %FS." docsHref={STAT_DOCS_LINKS.non_linearity} />
                {selectedCal.repeatability != null && (
                  <StatRow label="Repeatability†" value={`${fmtNum(selectedCal.repeatability)}${referenceUnit ? ` ${referenceUnit}` : ""}`} tip="Std deviation at repeated reference values." docsHref={STAT_DOCS_LINKS.repeatability} />
                )}
                {selectedCal.hysteresis != null && (
                  <StatRow label="Hysteresis†" value={`${fmtNum(selectedCal.hysteresis)}${referenceUnit ? ` ${referenceUnit}` : ""}`} tip="Max difference ascending vs. descending." docsHref={STAT_DOCS_LINKS.hysteresis} />
                )}
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 pt-3 border-t border-mar-border mb-2 mt-2">Uncertainty budget</p>
                {selectedCal.uncertainty_budget?.map((c) => (
                  <StatRow
                    key={c.source}
                    label={UNCERTAINTY_SOURCE_LABEL[c.source] ?? c.source}
                    value={`${fmtNum(c.standard_uncertainty)}${referenceUnit ? ` ${referenceUnit}` : ""}`}
                    tip={`${c.description} (${c.distribution} distribution, divisor=${fmtNum(c.divisor, 3)}).`}
                    docsHref={STAT_DOCS_LINKS.uncertainty_budget_row}
                  />
                ))}
                <StatRow label="Combined (RSS)" value={selectedCal.combined_uncertainty != null ? `${fmtNum(selectedCal.combined_uncertainty)}${referenceUnit ? ` ${referenceUnit}` : ""}` : null} tip="Root-sum-square of the budget rows above (GUM Eq. 10)." docsHref={STAT_DOCS_LINKS.combined_uncertainty} />
                <StatRow
                  label="Expanded (±)"
                  value={selectedCal.expanded_uncertainty != null ? `${fmtNum(roundToSigFigs(selectedCal.expanded_uncertainty, 2))}${referenceUnit ? ` ${referenceUnit}` : ""}` : null}
                  tip={
                    (selectedCal.effective_degrees_of_freedom != null
                      ? `k=${selectedCal.coverage_factor ?? "?"} at ${selectedCal.confidence_level ?? "?"}% confidence, ν_eff=${fmtNum(selectedCal.effective_degrees_of_freedom, 1)} (Welch-Satterthwaite).`
                      : `k=${selectedCal.coverage_factor ?? "?"} at ${selectedCal.confidence_level ?? "?"}% confidence.`)
                    + " Rounded to 2 significant figures (GUM §7.2.6)."
                  }
                  docsHref={STAT_DOCS_LINKS.expanded_uncertainty}
                />
                {selectedCal.conformity_statement?.specification && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 pt-3 border-t border-mar-border mb-2 mt-2">Conformity</p>
                    <div className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs text-gray-400">Statement</span>
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                        selectedCal.conformity_statement.passed
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50"
                          : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:border-red-900/50"
                      }`}>
                        {selectedCal.conformity_statement.passed ? "CONFORMS" : "DOES NOT CONFORM"}
                      </span>
                    </div>
                    <StatRow label="Specification" value={selectedCal.conformity_statement.specification} />
                    <StatRow
                      label="Decision rule"
                      value={DECISION_RULE_LABEL[selectedCal.conformity_statement.decision_rule] ?? selectedCal.conformity_statement.decision_rule}
                      tip="How measurement uncertainty is factored into this conformity statement, per ISO/IEC 17025 §7.1.3 and §7.8.6."
                      docsHref={STAT_DOCS_LINKS.decision_rule}
                    />
                  </>
                )}
              </div>

              {/* Right: chart/table toggle (60%) */}
              <div className="flex-1 min-w-0 flex flex-col gap-2">
                <div className="flex gap-1 p-1 bg-mar-surface-alt rounded-lg w-fit border border-mar-border">
                  {(["chart", "table"] as const).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setRightView(v)}
                      className={`px-4 py-1 rounded text-xs font-medium transition-colors ${
                        rightView === v ? "bg-mar-surface text-mar-text shadow-xs" : "text-gray-400 hover:text-mar-text"
                      }`}
                    >
                      {v === "chart" ? "Chart" : "Data Table"}
                    </button>
                  ))}
                </div>

                {loadingPoints ? (
                  <div className="flex items-center justify-center flex-1 text-gray-400 gap-2 text-xs py-10">
                    <span className="w-4 h-4 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
                    Loading data…
                  </div>
                ) : points.length === 0 ? (
                  <div className="flex items-center justify-center flex-1 text-gray-400 text-sm py-10">
                    No calibration point data stored.
                  </div>
                ) : rightView === "chart" ? (
                  <CalibrationChart
                    cal={selectedCal}
                    points={points}
                    measuredUnit={measuredUnit}
                    referenceUnit={referenceUnit}
                  />
                ) : (
                  <div className="rounded-xl border border-mar-border overflow-hidden" style={{ maxHeight: 340, overflowY: "auto" }}>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-mar-border bg-mar-surface-alt">
                          {[
                            "#",
                            `Measured${measuredUnit ? ` (${measuredUnit})` : ""}`,
                            `Reference${referenceUnit ? ` (${referenceUnit})` : ""}`,
                            `Fitted${referenceUnit ? ` (${referenceUnit})` : ""}`,
                            `Residual${referenceUnit ? ` (${referenceUnit})` : ""}`,
                            "Residual (%)",
                          ].map((h) => (
                            <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {points.map((pt) => (
                          <tr key={pt.point_index} className="border-b border-mar-border last:border-b-0 hover:bg-mar-surface-alt/50 transition-colors">
                            <td className="px-3 py-1.5 font-mono text-gray-400">{pt.point_index + 1}</td>
                            <td className="px-3 py-1.5 font-mono text-mar-text">{fmtNum(pt.measured_value)}</td>
                            <td className="px-3 py-1.5 font-mono text-mar-text">{fmtNum(pt.reference_value)}</td>
                            <td className="px-3 py-1.5 font-mono text-mar-text">{fmtNum(pt.calculated_value)}</td>
                            <td className={`px-3 py-1.5 font-mono ${selectedCal.rmse != null && Math.abs(pt.residual_abs ?? 0) > selectedCal.rmse * 2 ? "text-amber-400 dark:text-amber-300" : "text-mar-text"}`}>
                              {fmtNum(pt.residual_abs)}
                            </td>
                            <td className="px-3 py-1.5 font-mono text-gray-400">{fmtNum(pt.residual_pct, 3)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-400">No polynomial model recorded for this calibration.</p>
          )}

          {/* Conditions & Notes */}
          {(selectedCal.temperature != null || selectedCal.humidity != null || selectedCal.pressure != null || selectedCal.notes || calLocation) && (
            <div className="rounded-xl border border-mar-border bg-mar-surface-alt p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Conditions &amp; Notes</p>
              {calLocation && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Calibration Lab</p>
                  <Link
                    href={`/sites?id=${calLocation.id}`}
                    className="text-xs text-mar-accent hover:underline inline-flex items-center gap-1"
                  >
                    <MapPinIcon size={11} />
                    {calLocation.name}
                  </Link>
                </div>
              )}
              {(selectedCal.temperature != null || selectedCal.humidity != null || selectedCal.pressure != null) && (
                <div className="grid grid-cols-3 gap-4">
                  {selectedCal.temperature != null && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Temperature</p>
                      <p className="font-mono text-xs text-mar-text">
                        {fmtNum(selectedCal.temperature, 2)} <span className="text-gray-400">°C</span>
                      </p>
                    </div>
                  )}
                  {selectedCal.humidity != null && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Humidity</p>
                      <p className="font-mono text-xs text-mar-text">
                        {fmtNum(selectedCal.humidity, 2)} <span className="text-gray-400">%RH</span>
                      </p>
                    </div>
                  )}
                  {selectedCal.pressure != null && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Pressure</p>
                      <p className="font-mono text-xs text-mar-text">
                        {fmtNum(selectedCal.pressure, 2)} <span className="text-gray-400">Pa</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
              {selectedCal.notes && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">Notes</p>
                  <p className="text-xs text-mar-text leading-relaxed">{selectedCal.notes}</p>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
          <p className="text-sm text-gray-400">No calibrations recorded{hasChannelTabs ? " for this channel" : ""}.</p>
        </div>
      )}

      {/* Calibration history */}
      {filteredCals.length > 0 && (
        <div className="bg-mar-surface border border-mar-border rounded-xl">
          <div className="flex items-center justify-between px-5 py-3 border-b border-mar-border">
            <p className="text-xs font-semibold text-mar-text">Calibration history</p>
            <p className="text-xs text-gray-400">{filteredCals.length} record{filteredCals.length !== 1 ? "s" : ""}</p>
          </div>
          <div className="divide-y divide-mar-border">
            {filteredCals.map((cal) => {
              const isSelected = cal.id === (selectedCal?.id ?? null);
              return (
                <div
                  key={cal.id}
                  className={`flex items-start gap-4 px-5 py-3 transition-colors
                    ${isSelected ? "bg-mar-surface-alt" : "hover:bg-mar-surface-alt/50"}`}
                >
                  {/* Clickable row content */}
                  <button
                    type="button"
                    onClick={() => setSelectedCalId(cal.id)}
                    className="flex items-start gap-4 flex-1 min-w-0 text-left"
                  >
                    <div className={`shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center mt-0.5
                      ${isSelected ? "border-mar-accent text-mar-accent" : "border-mar-border bg-mar-surface-alt text-gray-400"}`}>
                      <span className="text-[10px] font-bold">v{versionOf(cal)}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-mar-text">{fmtDate(cal.calibration_date)}</span>
                        {cal.r_squared != null && (
                          <span className="text-[10px] font-mono text-gray-400">R²={fmtNum(cal.r_squared, 4)}</span>
                        )}
                        {cal.poly_order != null && (
                          <span className="text-[10px] text-gray-400">deg-{cal.poly_order}</span>
                        )}
                        {cal.external_lab_certificate_number && (
                          <span className="text-[10px] text-gray-400">📄 {cal.external_lab_certificate_number}</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {cal.calibration_type === "external" ? "External" : "Internal"}
                        {" · "}by {cal.performed_by_name}
                        {cal.external_lab_name ? ` · ${cal.external_lab_name}` : ""}
                      </p>
                      {cal.notes && <p className="text-xs text-gray-500 mt-1 italic truncate">{cal.notes}</p>}
                    </div>
                    {cal.due_date && (
                      <div className="shrink-0 text-right hidden sm:block">
                        <p className="text-[10px] text-gray-400">Due</p>
                        <p className="text-xs text-mar-text font-mono">{fmtDate(cal.due_date)}</p>
                      </div>
                    )}
                  </button>

                  {/* Admin delete */}
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(cal.id); }}
                      title="Remove calibration"
                      className="shrink-0 self-center p-1 text-gray-300 hover:text-red-500 transition-colors rounded-sm"
                    >
                      <TrashIcon size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Files tab
// ---------------------------------------------------------------------------

function FilesTab({
  files,
  isEditing,
  assetId,
  onFilesChange,
}: {
  files: StoredFile[];
  isEditing: boolean;
  assetId: string;
  onFilesChange: (files: StoredFile[]) => void;
}) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function handleUpload(file: File) {
    setUploading(true);
    setUploadError(null);
    try {
      const uploaded = await uploadAssetFile(assetId, file);
      onFilesChange([...files, uploaded]);
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    if (isEditing) setIsDragging(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
  }

  async function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setIsDragging(false);
    if (!isEditing) return;
    const file = e.dataTransfer.files[0];
    if (file) await handleUpload(file);
  }

  async function handleFileInput(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (file) await handleUpload(file);
    e.target.value = "";
  }

  async function handleDelete(fileId: string) {
    try {
      await deleteAssetFile(assetId, fileId);
      onFilesChange(files.filter((f) => f.id !== fileId));
    } catch {
      // silent — file may already be gone
    }
  }

  const typeLabel: Record<string, string> = { pdf: "PDF", csv: "CSV", zip: "Archive", doc: "File" };

  return (
    <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-mar-text mb-4">Files &amp; attachments</h3>

      {/* Drop zone — only shown in edit mode */}
      {isEditing && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mb-4 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer
            ${isDragging
              ? "border-mar-accent bg-mar-accent/5"
              : "border-mar-border hover:border-mar-accent/50 hover:bg-mar-surface-alt"}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloudIcon size={24} className={isDragging ? "text-mar-accent" : "text-gray-400"} />
          <p className="text-sm text-gray-500">
            {uploading ? "Uploading…" : "Drop a file here or click to browse"}
          </p>
          <p className="text-xs text-gray-400">PDF, images supported</p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,application/pdf"
            className="hidden"
            onChange={handleFileInput}
          />
        </div>
      )}

      {uploadError && (
        <p className="mb-3 text-xs text-red-500 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/40 rounded-lg px-3 py-2">
          {uploadError}
        </p>
      )}

      {files.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 text-gray-400">
          <p className="text-sm">{isEditing ? "No files yet. Upload one above." : "No files attached to this asset."}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => {
            const isImage = f.content_type.startsWith("image/");
            const type = fileIcon(f.content_type);
            return (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-mar-border hover:border-mar-border-md hover:bg-mar-surface-alt transition-colors">
                {/* Thumbnail or type badge */}
                {isImage && f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.url}
                    alt={f.original_filename}
                    className="w-9 h-9 rounded-lg object-cover shrink-0 border border-mar-border"
                  />
                ) : (
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold
                    ${type === "pdf" ? "bg-red-50 text-red-500 dark:bg-red-950/30" :
                      type === "csv" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" :
                      type === "zip" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30" :
                      "bg-mar-surface-alt text-gray-400"}`}>
                    {typeLabel[type]}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-mar-text truncate">{f.original_filename}</p>
                  <p className="text-xs text-gray-400">{fmtBytes(f.size_bytes)}</p>
                </div>

                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-sm hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors shrink-0"
                    title="Download"
                  >
                    <DownloadIcon size={14} />
                  </a>
                )}

                {isEditing && (
                  <button
                    type="button"
                    onClick={() => handleDelete(f.id)}
                    className="p-1.5 rounded-sm hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    title="Remove file"
                  >
                    <TrashIcon size={14} />
                  </button>
                )}
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
                <UserMention
                  actorId={log.actor_id}
                  actorEmail={log.actor_email}
                  actorName={log.actor_name}
                  actorRole={log.actor_role}
                  className="text-xs truncate"
                />
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

type Tab = "overview" | "health" | "calibration" | "files" | "activity";

const TABS: { key: Tab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "health", label: "Health" },
  { key: "calibration", label: "Calibration" },
  { key: "files", label: "Files" },
  { key: "activity", label: "Activity" },
];

// ---------------------------------------------------------------------------
// Calibration ring card — 2/3 dates + 1/3 270° arc ring, color per remaining days
// ---------------------------------------------------------------------------
function CalibrationRingCard({
  lastCal,
  dueAt,
}: {
  lastCal: string | null;
  dueAt: string | null;
  status: string;
}) {
  const { days, gaugeValue, ringColor } = useMemo(() => {
    if (!dueAt) return { days: null, gaugeValue: 0, ringColor: "#9ca3af" };

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueAt.includes("T") ? dueAt : dueAt + "T00:00:00");
    due.setHours(0, 0, 0, 0);

    const daysUntil = Math.round((due.getTime() - today.getTime()) / 86400000);

    let prog = 0;
    if (lastCal) {
      const last = new Date(lastCal.includes("T") ? lastCal : lastCal + "T00:00:00");
      last.setHours(0, 0, 0, 0);
      const totalDays = Math.round((due.getTime() - last.getTime()) / 86400000);
      if (totalDays > 0) prog = Math.max(0, Math.min(1, daysUntil / totalDays));
    }

    const color =
      daysUntil > 90 ? "#22c55e" :
      daysUntil > 30 ? "#f59e0b" : "#ef4444";

    return { days: daysUntil, gaugeValue: Math.max(0, Math.min(100, prog * 100)), ringColor: color };
  }, [lastCal, dueAt]);

  // 270° arc ring: gap at bottom (6 o'clock). Arc starts at 135° and sweeps 270° clockwise to 45°.
  const SIZE = 100;
  const cx = SIZE / 2;
  const R = 38;
  const START_DEG = 135;
  const SWEEP_DEG = 270;

  function polar(angleDeg: number) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + R * Math.cos(a), y: cx + R * Math.sin(a) };
  }

  function arcPath(sweepDeg: number): string {
    if (sweepDeg <= 0) return "";
    const clampedSweep = Math.min(sweepDeg, 359.99);
    const endDeg = START_DEG + clampedSweep;
    const start = polar(START_DEG);
    const end = polar(endDeg);
    const largeArc = clampedSweep > 180 ? 1 : 0;
    return `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${R} ${R} 0 ${largeArc} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`;
  }

  const trackPath = arcPath(SWEEP_DEG);
  const progressSweep = (gaugeValue / 100) * SWEEP_DEG;

  return (
    <div className="bg-mar-surface border border-mar-border rounded-xl p-4">
      <div className="flex items-stretch gap-3">
        {/* Dates — left column */}
        <div className="w-2/3 space-y-1.5 flex flex-col items-center text-center">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Last</p>
            <p className="text-sm font-semibold font-mono text-mar-text tabular-nums">{fmtDate(lastCal)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">Due</p>
            <p className="text-sm font-semibold font-mono text-mar-text tabular-nums">{fmtDate(dueAt)}</p>
          </div>
        </div>
        {/* 270° arc ring — right column, centered */}
        <div className="w-1/3 flex items-center justify-center">
          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block" }}>
              <path d={trackPath} fill="none" stroke="var(--mar-border-md, #d1d5db)" strokeWidth={7} strokeLinecap="round" />
              {progressSweep > 0 && (
                <path d={arcPath(progressSweep)} fill="none" stroke={ringColor} strokeWidth={7} strokeLinecap="round" />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: "10px" }}>
              <span className="text-xs font-bold tabular-nums leading-none" style={{ color: ringColor }}>
                {days !== null ? String(days) : "—"}
              </span>
              <span className="text-[9px] text-gray-400 mt-0.5 leading-none">days</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticker modal — shows 2×2 and 4×2 label previews with download buttons
// ---------------------------------------------------------------------------
function StickerModal({ assetId, assetTag, onClose }: { assetId: string; assetTag: string; onClose: () => void }) {
  const [preview2, setPreview2] = useState<string | null>(null);
  const [preview4, setPreview4] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAssetLabelBlob(assetId, "2x2", "png"),
      fetchAssetLabelBlob(assetId, "4x2", "png"),
    ])
      .then(([b2, b4]) => {
        if (cancelled) return;
        setPreview2(URL.createObjectURL(b2));
        setPreview4(URL.createObjectURL(b4));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assetId]);

  async function download(size: "2x2" | "4x2", fmt: "png" | "jpg" | "pdf") {
    const key = `${size}-${fmt}`;
    setDownloading(key);
    try {
      const blob = await fetchAssetLabelBlob(assetId, size, fmt);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `sticker-${assetTag}-${size}.${fmt}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* ignore */ } finally { setDownloading(null); }
  }

  return (
    <div
      ref={backdropRef}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs"
      onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
    >
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xl w-full max-w-xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-mar-border">
          <h2 className="text-sm font-semibold text-mar-text">Asset Sticker — {assetTag}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-sm hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors">
            <XIcon size={15} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <StickerRow size="2x2" label="2×2 inches" preview={preview2} aspect="w-28 h-28" loading={loading} downloading={downloading} onDownload={download} />
          <div className="border-t border-mar-border" />
          <StickerRow size="4x2" label="4×2 inches" preview={preview4} aspect="w-56 h-28" loading={loading} downloading={downloading} onDownload={download} />
        </div>
      </div>
    </div>
  );
}

function StickerRow({
  size, label, preview, aspect, loading, downloading, onDownload,
}: {
  size: "2x2" | "4x2"; label: string; preview: string | null; aspect: string;
  loading: boolean; downloading: string | null; onDownload: (size: "2x2" | "4x2", fmt: "png" | "jpg" | "pdf") => void;
}) {
  return (
    <div className="flex items-center gap-4">
      <div className={`shrink-0 bg-mar-surface-alt rounded-lg border border-mar-border overflow-hidden flex items-center justify-center ${aspect}`}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={`${label} sticker`} className="w-full h-full object-contain" />
        ) : loading ? (
          <span className="w-5 h-5 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />
        ) : (
          <QrCodeIcon size={24} className="text-gray-300" />
        )}
      </div>
      <div className="flex-1">
        <p className="text-xs text-gray-400 mb-2">{label}</p>
        <div className="flex gap-2 flex-wrap">
          {(["pdf", "jpg", "png"] as const).map((fmt) => {
            const key = `${size}-${fmt}`;
            return (
              <button
                key={fmt}
                type="button"
                disabled={downloading === key}
                onClick={() => onDownload(size, fmt)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors disabled:opacity-40"
              >
                <DownloadIcon size={11} />
                {downloading === key ? "…" : fmt.toUpperCase()}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function AssetProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const { user } = useAuth();
  const isAdmin = user.is_superuser || user.role === "superadmin" || user.role === "admin";

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [profile, setProfile] = useState<AssetProfile | null>(null);
  const [calibrations, setCalibrations] = useState<CalibrationRecord[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [files, setFiles] = useState<StoredFile[]>([]);
  const [healthOverview, setHealthOverview] = useState<HealthOverview | null>(null);
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
  const [stickerOpen, setStickerOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    setLoading(true);

    Promise.all([
      getAssetProfile(id),
      getAssetCalibrations(id),
      getAssetAuditLogs(id),
      getAssetFiles(id),
    ])
      .then(([profileData, calsData, logsData, filesData]) => {
        setProfile(profileData);
        setCalibrations(calsData);
        setAuditLogs(logsData);
        setFiles(filesData);
        getAssetHealth(id).then((h) => setHealthOverview(h.overview)).catch(() => {});
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

  async function handleCalibrationSaved() {
    const [calsData, updatedProfile] = await Promise.all([
      getAssetCalibrations(id),
      getAssetProfile(id),
    ]);
    setCalibrations(calsData);
    setProfile(updatedProfile);
    getAssetHealth(id).then((h) => setHealthOverview(h.overview)).catch(() => {});
  }

  async function handleCalibrationDeleted() {
    const [calsData, updatedProfile] = await Promise.all([
      getAssetCalibrations(id),
      getAssetProfile(id),
    ]);
    setCalibrations(calsData);
    setProfile(updatedProfile);
    getAssetHealth(id).then((h) => setHealthOverview(h.overview)).catch(() => {});
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

      {stickerOpen && (
        <StickerModal
          assetId={profile.id}
          assetTag={profile.asset_id}
          onClose={() => setStickerOpen(false)}
        />
      )}

      {!profile.is_active && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 px-5 py-3 flex items-center gap-3">
          <WarningIcon size={16} className="text-red-500 shrink-0" />
          <p className="text-sm text-red-700 dark:text-red-400 font-medium">
            This asset has been retired{profile.retired_reason ? `: ${profile.retired_reason}` : ""} and is read-only.
          </p>
        </div>
      )}

      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-mar-text transition-colors"
      >
        <ChevronLeftIcon size={13} />
        Back
      </button>

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
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing ? (
              <>
                <button type="button"
                  onClick={() => setStickerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-mar-border rounded-lg hover:bg-mar-surface-alt text-gray-500 hover:text-mar-text text-sm font-medium transition-colors">
                  <QrCodeIcon size={15} />
                  Sticker
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
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Health panel */}
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">Health Score</p>
          {healthOverview ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-mar-text tabular-nums">
                    {Math.round(healthOverview.health_score)}
                    <span className="text-sm text-gray-400 font-normal"> / 100</span>
                  </span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${HEALTH_LABEL_STYLE[healthOverview.health_label] ?? ""}`}>
                    {healthOverview.health_label}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-mar-border overflow-hidden">
                  {(() => {
                    const sc = healthOverview.health_score;
                    const barColor = sc >= 90 ? "#22c55e" : sc >= 75 ? COLORS.accent : sc >= 50 ? "#f59e0b" : "#ef4444";
                    return <div className="h-full rounded-full transition-all" style={{ width: `${sc}%`, backgroundColor: barColor }} />;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide w-16 shrink-0">Stability</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STABILITY_STYLE[healthOverview.stability] ?? ""}`}>
                  {healthOverview.stability}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold text-mar-text">{Math.round(profile.calibration_health_score ?? profile.health_score)}%</p>
              <div className="mt-2 h-1.5 rounded-full bg-mar-border overflow-hidden">
                <div className="h-full rounded-full bg-mar-accent transition-all" style={{ width: `${profile.calibration_health_score ?? profile.health_score}%` }} />
              </div>
            </div>
          )}
        </div>
        {/* Date ring panel */}
        <CalibrationRingCard
          lastCal={profile.last_calibration_date}
          dueAt={profile.next_due_at}
          status={profile.calibration_status}
        />
        {/* Calibrations panel */}
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">Calibrations</p>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <p className="text-2xl font-bold text-mar-text tabular-nums">{profile.calibration_count}</p>
              <p className="text-xs text-gray-400 mt-1">all-time</p>
            </div>
            {calibrations[0]?.poly_coefficients && calibrations[0].poly_coefficients.length > 0 && (
              <div className="flex-1 min-w-0 border-l border-mar-border pl-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">Latest coefficients</p>
                <table className="w-full text-xs">
                  <tbody>
                    {calibrations[0].poly_coefficients.map((v, i) => (
                      <tr key={i} className="border-b border-mar-border last:border-b-0">
                        <td className="py-0.5 pr-2 text-gray-400 whitespace-nowrap">
                          {COEFF_DESC[i] ?? `Order-${i} term`}
                        </td>
                        <td className="py-0.5 text-mar-text font-mono tabular-nums text-right whitespace-nowrap">
                          {fmtNum(v)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
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
          {activeTab === "health" && (
            <HealthTab assetId={id} profile={profile} />
          )}
          {activeTab === "calibration" && (
            <CalibrationTab
              calibrations={calibrations}
              profile={profile}
              onCalibrationSaved={handleCalibrationSaved}
              onCalibrationDeleted={handleCalibrationDeleted}
              isAdmin={isAdmin}
            />
          )}
          {activeTab === "files" && (
            <FilesTab
              files={files}
              isEditing={isEditing}
              assetId={id}
              onFilesChange={setFiles}
            />
          )}
          {activeTab === "activity" && <ActivityTab logs={auditLogs} />}
        </div>
      </div>
    </div>
  );
}
