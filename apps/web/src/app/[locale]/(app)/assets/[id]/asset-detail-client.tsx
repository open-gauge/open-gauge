"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  approveCalibration,
  deleteAssetFile,
  downloadCalibrationCertificateBlob,
  fetchAssetLabelBlob,
  getAssetAuditLogs,
  getAssetCalibrations,
  getAssetFiles,
  getAssetProfile,
  getCalibrationCertificateUrl,
  getCalibrationFrequencyPoints,
  getCalibrationPoints,
  listCalibrationCertificateTemplates,
  listLocations,
  rejectCalibration,
  restoreCalibration,
  retireAsset,
  updateAsset,
  deleteAssetPicture,
  fetchAssetExportBlob,
  uploadAssetFile,
  uploadAssetPicture,
  voidCalibration,
  type CertificateTemplateOption,
} from "@/services/asset.service";
import { FrequencyResponseChart } from "@/components/frequency-response-chart";
import { ResidualsChart } from "@/components/residuals-chart";
import { useAuth } from "@/lib/auth-context";
import { listMyOrganizations } from "@/services/organization.service";
import type { OrganizationListItem } from "@/types/organization";
import type { AssetProfile, AssetUpdateRequest, LocationOption, SensorChannelUpdateInput } from "@/types/asset";
import type { CalibrationPoint, CalibrationRecord, FrequencyResponsePoint } from "@/types/calibration";
import type { AuditLogEntry } from "@/types/audit_log";
import type { StoredFile } from "@/types/stored_file";
import {
  CALIBRATION_STATUS_STYLE,
  COLORS,
  HEALTH_LABEL_STYLE,
  STABILITY_STYLE,
} from "@/lib/tokens";
import { translateDynamic } from "@/lib/translate-dynamic";
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
import { ConfirmModal } from "@/components/confirm-modal";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronLeftIcon,
  CopyIcon,
  DownloadIcon,
  EditIcon,
  ExportIcon,
  ImageIcon,
  InfoIcon,
  MapPinIcon,
  PlusIcon,
  QrCodeIcon,
  RestoreIcon,
  ShieldCheckIcon,
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
import { ToggleSwitch } from "@/components/toggle-switch";
import { ImageUploadField } from "@/components/image-upload-field";
import { PdfThumbnail } from "@/components/pdf-thumbnail";
import { StatRow } from "@/components/stat-row";
import { ActivityDiff } from "@/components/activity-diff";
import { ASSET_DOCS_LINKS, CHAN_DOCS_LINKS, STAT_DOCS_LINKS } from "@/lib/docs-links";
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

function humanizeAction(action: string): string {
  return action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Falls back to a humanized version of the raw action code for any value the
 * catalog doesn't have a translation for yet (e.g. a newly added audit action). */
function useActionLabel() {
  const t = useTranslations("tokens.auditAction");
  return (action: string) => {
    const k = action as Parameters<typeof t>[0];
    return t.has(k) ? t(k) : humanizeAction(action);
  };
}

// ---------------------------------------------------------------------------
// Status badge
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("tokens.calibrationStatus");
  const cls = CALIBRATION_STATUS_STYLE[status] ?? CALIBRATION_STATUS_STYLE.not_calibrated;
  const label = translateDynamic(t, status);
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
      ● {label}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Spec row (display mode)
// ---------------------------------------------------------------------------

function SpecRow({
  label, value, accent, tooltip, tooltipDocsHref,
}: {
  label: string;
  value: ReactNode;
  accent?: boolean;
  tooltip?: string;
  tooltipDocsHref?: string;
}) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 py-3 border-b border-og-border last:border-b-0">
      <span className="flex items-center gap-1 text-xs text-gray-400">
        {label}
        {tooltip && (
          <Tooltip content={tooltip} docsHref={tooltipDocsHref}>
            <InfoIcon size={10} className="text-gray-400 cursor-help" />
          </Tooltip>
        )}
      </span>
      <span className={`text-sm ${accent ? "text-og-accent font-medium" : "text-og-text"}`}>{value}</span>
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
  name: string;
  description: string;
  manufacturer: string;
  model: string;
  serial_number: string;
  manufacturer_part_number: string;
  location_id: string;
  organization_id: string;
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
    name: s(profile.name),
    description: s(profile.description),
    manufacturer: s(profile.manufacturer),
    model: s(profile.model),
    serial_number: s(profile.serial_number),
    manufacturer_part_number: s(profile.manufacturer_part_number),
    location_id: s(profile.location_id),
    organization_id: s(profile.organization_id),
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
    name: form.name.trim() || undefined,
    description: orNull(form.description),
    manufacturer: form.manufacturer.trim() || undefined,
    model: form.model.trim() || undefined,
    serial_number: orNull(form.serial_number),
    manufacturer_part_number: orNull(form.manufacturer_part_number),
    location_id: orNull(form.location_id),
    organization_id: orNull(form.organization_id),
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

function validateForm(form: EditFormState, t: ReturnType<typeof useTranslations>): Record<string, string> {
  const errors: Record<string, string> = {};

  if (!form.asset_id.trim()) errors.asset_id = t("validation.assetIdRequired");
  if (!form.name.trim()) errors.name = t("validation.nameRequired");
  if (!form.manufacturer.trim()) errors.manufacturer = t("validation.manufacturerRequired");
  if (!form.model.trim()) errors.model = t("validation.modelRequired");

  const numFields: (keyof EditFormState)[] = [
    "weight_kg", "power_consumption_w",
    "operating_temperature_min", "operating_temperature_max",
    "operating_humidity_min", "operating_humidity_max",
    "price_eur",
  ];
  for (const f of numFields) {
    const v = form[f] as string;
    if (v && isNaN(parseFloat(v))) errors[f] = t("validation.mustBeNumber");
  }

  if (form.purchase_date && !DATE_RE.test(form.purchase_date))
    errors.purchase_date = t("validation.dateFormat");
  if (form.warranty_expiry_date && !DATE_RE.test(form.warranty_expiry_date))
    errors.warranty_expiry_date = t("validation.dateFormat");

  const channelIds = new Set<string>();
  form.sensor_channels.forEach((ch, i) => {
    const p = `ch_${i}_`;
    if (!ch.channel_id.trim()) errors[`${p}channel_id`] = t("validation.required");
    else if (channelIds.has(ch.channel_id.trim().toLowerCase())) errors[`${p}channel_id`] = t("validation.duplicateChannelId");
    else channelIds.add(ch.channel_id.trim().toLowerCase());

    if (!ch.physical_quantity) errors[`${p}physical_quantity`] = t("validation.required");
    if (!ch.unit.trim()) errors[`${p}unit`] = t("validation.required");

    const chNums = [
      "measurement_min", "measurement_max", "accuracy_value", "resolution",
      "drift_rate", "response_time_ms", "bandwidth_hz",
      "output_signal_min", "output_signal_max",
      "measurement_uncertainty",
    ];
    for (const f of chNums) {
      const v = ch[f as keyof EditChannelForm] as string;
      if (v && isNaN(parseFloat(v))) errors[`${p}${f}`] = t("validation.mustBeNumber");
    }
  });

  return errors;
}

// ---------------------------------------------------------------------------
// Edit field components
// ---------------------------------------------------------------------------

const INPUT_BASE = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600";
const INPUT_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";
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
  const t = useTranslations("assets.fields");
  return (
    <div className="flex flex-col gap-1">
      <ELabel label={label} required={required} tooltip={tooltip} tooltipDocsHref={tooltipDocsHref} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${INPUT_BASE} ${error ? INPUT_ERR : INPUT_OK}`}
      >
        <option value="">{placeholder ?? t("select")}</option>
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
  const t = useTranslations("assets.fields");
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
        <option value="">{placeholder ?? t("select")}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
        <option value="__other__">{t("other")}</option>
      </select>
      {otherMode && (
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={t("specify")}
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
  const t = useTranslations("assets.fields");
  const tQuantity = useTranslations("tokens.physicalQuantity");
  const tTech = useTranslations("tokens.sensorTechnology");
  const tTechSubtype = useTranslations("tokens.sensorTechSubtype");
  const tMeasurementType = useTranslations("tokens.measurementType");
  const chanTips = useChanTips();
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
          label={t("physicalQuantity")}
          value={physicalQuantity}
          onChange={onQuantityChange}
          options={PHYSICAL_QUANTITIES.map((q) => ({ value: q.value, label: translateDynamic(tQuantity, q.value) }))}
          error={errors[`${prefix}physical_quantity`]}
          required
          tooltip={chanTips.physical_quantity}
          tooltipDocsHref={CHAN_DOCS_LINKS.physical_quantity}
        />
        {quantityDef && (
          <EditSelectWithOther
            label={t("technology")}
            value={techFamily}
            onChange={handleFamilyChange}
            options={techs.map((tech) => ({ value: tech.value, label: translateDynamic(tTech, tech.value) }))}
          />
        )}
      </div>
      {showSecondRow && (
        <div className="grid grid-cols-2 gap-3">
          {typeOptions.length > 0 ? (
            <EditSelect
              label={t("measurementType")}
              value={measurementType}
              onChange={onMeasurementTypeChange}
              options={typeOptions.map((o) => ({ value: o.value, label: translateDynamic(tMeasurementType, o.value) }))}
              tooltip={chanTips.measurement_type}
              tooltipDocsHref={CHAN_DOCS_LINKS.measurement_type}
            />
          ) : <div />}
          {selectedFamily?.subtypes && techFamily !== "__other__" && (
            <EditSelect
              label={t("typeVariant")}
              value={techSubtypeVal}
              onChange={(v) => onTechChange(techFamily, v)}
              options={selectedFamily.subtypes.map((s) => ({ value: s.value, label: translateDynamic(tTechSubtype, s.value) }))}
            />
          )}
          {techFamily === "__other__" && (
            <EditInput
              label={t("technologyCustom")}
              value={technology}
              onChange={(v) => onTechChange("__other__", v)}
              placeholder={t("technologyCustomPlaceholder")}
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

function useChanTips() {
  const t = useTranslations("assets.tips");
  return {
    physical_quantity: t("physicalQuantity"),
    measurement_type: t("measurementType"),
    accuracy_value: t("accuracyValue"),
    resolution: t("resolution"),
    measurement_uncertainty: t("measurementUncertainty"),
    drift_rate: t("driftRate"),
    response_time_ms: t("responseTimeMs"),
    bandwidth_hz: t("bandwidthHz"),
    calibration_role: t("calibrationRole"),
  };
}

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
  const t = useTranslations("assets.fields");
  const units = getOutputUnits(outputType, physicalQuantity);
  if (!units) {
    return <EditInput label={t("outputUnit")} value={value} onChange={onChange} placeholder={t("outputUnitPlaceholder")} />;
  }
  if (outputType === "digital") {
    return <EditSelectWithOther label={t("outputUnit")} value={value} onChange={onChange} options={units} />;
  }
  return <EditSelect label={t("outputUnit")} value={value} onChange={onChange} options={units} />;
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
  const t = useTranslations("assets.fields");
  const tOutputType = useTranslations("tokens.outputType");
  const chanTips = useChanTips();
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
    <div className="border border-og-border-md rounded-xl p-4 space-y-4 bg-og-surface-alt">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-og-accent uppercase tracking-wide">
          {t("channelN", { index: index + 1 })}
        </span>
        <button
          type="button"
          onClick={onRemove}
          className="p-1.5 rounded-lg text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
          title={t("removeChannel")}
        >
          <TrashIcon size={14} />
        </button>
      </div>

      {/* Channel ID + cascade */}
      <EditInput
        label={t("channelId")}
        value={ch.channel_id}
        onChange={set("channel_id")}
        error={errors[`${p}channel_id`]}
        placeholder={t("channelIdPlaceholder")}
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
        <EditInput label={t("rangeMin")} value={ch.measurement_min} onChange={set("measurement_min")} error={errors[`${p}measurement_min`]} placeholder={t("rangeMinPlaceholder")} />
        <EditInput label={t("rangeMax")} value={ch.measurement_max} onChange={set("measurement_max")} error={errors[`${p}measurement_max`]} placeholder={t("rangeMaxPlaceholder")} />
        <EditSelect label={t("unit")} value={ch.unit} onChange={set("unit")} options={getSpecUnitOptions(ch.physical_quantity, null, null)} error={errors[`${p}unit`]} required />
      </div>

      {/* Output — type first, then range under it in the same column format */}
      <EditSelectWithOther label={t("outputType")} value={ch.output_type} onChange={(v) => {
        const units = getOutputUnits(v, ch.physical_quantity);
        onChange({ ...ch, output_type: v, output_signal_unit: units?.[0]?.value ?? "" });
      }} options={OUTPUT_TYPE_OPTIONS.map((o) => ({ value: o.value, label: translateDynamic(tOutputType, o.value) }))} />
      <div className="grid grid-cols-3 gap-3">
        <EditInput label={t("outputMin")} value={ch.output_signal_min} onChange={set("output_signal_min")} error={errors[`${p}output_signal_min`]} placeholder={t("outputMinPlaceholder")} />
        <EditInput label={t("outputMax")} value={ch.output_signal_max} onChange={set("output_signal_max")} error={errors[`${p}output_signal_max`]} placeholder={t("outputMaxPlaceholder")} />
        <OutputUnitSelector outputType={ch.output_type} physicalQuantity={ch.physical_quantity} value={ch.output_signal_unit} onChange={set("output_signal_unit")} />
      </div>

      {/* Accuracy */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label={t("accuracyValue")} value={ch.accuracy_value} onChange={set("accuracy_value")} error={errors[`${p}accuracy_value`]} placeholder={t("accuracyValuePlaceholder")} tooltip={chanTips.accuracy_value} tooltipDocsHref={CHAN_DOCS_LINKS.accuracy_value} />
        <EditSelect label={t("accuracyUnit")} value={ch.accuracy_unit} onChange={setAccuracyUnit} options={specUnitOptions} />
      </div>

      {/* Resolution */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label={t("resolution")} value={ch.resolution} onChange={set("resolution")} error={errors[`${p}resolution`]} placeholder={t("resolutionPlaceholder")} tooltip={chanTips.resolution} tooltipDocsHref={CHAN_DOCS_LINKS.resolution} />
        <EditSelect label={t("resolutionUnit")} value={ch.resolution_unit} onChange={set("resolution_unit")} options={specUnitOptions} />
      </div>

      {/* Uncertainty */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label={t("uncertainty")} value={ch.measurement_uncertainty} onChange={set("measurement_uncertainty")} error={errors[`${p}measurement_uncertainty`]} placeholder={t("uncertaintyPlaceholder")} tooltip={chanTips.measurement_uncertainty} tooltipDocsHref={CHAN_DOCS_LINKS.measurement_uncertainty} />
        <EditSelect label={t("uncertaintyUnit")} value={ch.uncertainty_unit} onChange={set("uncertainty_unit")} options={specUnitOptions} />
      </div>

      {/* Drift */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label={t("driftRate")} value={ch.drift_rate} onChange={set("drift_rate")} error={errors[`${p}drift_rate`]} placeholder={t("driftRatePlaceholder")} tooltip={chanTips.drift_rate} tooltipDocsHref={CHAN_DOCS_LINKS.drift_rate} />
        <EditInput label={t("driftUnit")} value={ch.drift_unit} onChange={set("drift_unit")} placeholder={t("driftUnitPlaceholder")} />
      </div>

      {/* Dynamic */}
      <div className="grid grid-cols-2 gap-3">
        <EditInput label={t("responseTimeMs")} value={ch.response_time_ms} onChange={set("response_time_ms")} error={errors[`${p}response_time_ms`]} placeholder={t("responseTimeMsPlaceholder")} tooltip={chanTips.response_time_ms} tooltipDocsHref={CHAN_DOCS_LINKS.response_time_ms} />
        <EditInput label={t("bandwidthHz")} value={ch.bandwidth_hz} onChange={set("bandwidth_hz")} error={errors[`${p}bandwidth_hz`]} placeholder={t("bandwidthHzPlaceholder")} tooltip={chanTips.bandwidth_hz} tooltipDocsHref={CHAN_DOCS_LINKS.bandwidth_hz} />
      </div>

      {/* Calibration role */}
      <label className="flex items-center gap-2 text-sm text-og-text cursor-pointer">
        <ToggleSwitch checked={ch.calibration_role} onChange={(v) => onChange({ ...ch, calibration_role: v })} />
        {t("referenceStandard")}
        <Tooltip content={chanTips.calibration_role} docsHref={CHAN_DOCS_LINKS.calibration_role}>
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
    <div className="bg-og-surface border border-og-border rounded-xl">
      <button
        type="button"
        onClick={() => { if (!forceOpen) setOpen((v) => !v); }}
        className={`w-full flex items-center justify-between px-5 py-4 text-left transition-colors ${isOpen ? "rounded-t-xl" : "rounded-xl"} ${forceOpen ? "cursor-default" : "hover:bg-og-surface-alt"}`}
      >
        <span className="text-sm font-semibold text-og-text">{title}</span>
        {!forceOpen && (
          <span className={`transition-transform shrink-0 ${isOpen ? "rotate-180" : ""}`}>
            <ChevronDownIcon size={16} />
          </span>
        )}
      </button>
      {isOpen && (
        <div className="px-5 pb-4 border-t border-og-border">
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
  const t = useTranslations("assets.retire");
  const [reason, setReason] = useState("");
  const [retiring, setRetiring] = useState(false);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xl w-full max-w-md p-6">
        <div className="flex items-center gap-3 mb-4">
          <WarningIcon size={20} className="text-red-500 shrink-0" />
          <h2 className="text-base font-semibold text-og-text">{t("title")}</h2>
        </div>
        <p className="text-sm text-gray-500 mb-4">
          {t("body", { name: assetName })}
        </p>
        <div className="flex flex-col gap-1 mb-5">
          <span className="text-xs text-gray-400">{t("reasonOptional")}</span>
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={t("reasonPlaceholder")}
            className="w-full px-3 py-2 rounded-lg border border-og-border-md text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 focus:border-og-accent focus:ring-og-accent/20 placeholder:text-gray-400 dark:placeholder:text-gray-600"
          />
        </div>
        <div className="flex items-center justify-end gap-2">
          <button type="button" onClick={onClose} disabled={retiring}
            className="px-3 py-1.5 text-sm border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors text-og-text disabled:opacity-50">
            {t("cancel")}
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
            {retiring ? t("retiring") : t("retireAsset")}
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
  profile, isEditing, form, onChange, errors, locations, myOrgs,
}: {
  profile: AssetProfile;
  isEditing: boolean;
  form: EditFormState | null;
  onChange: (f: EditFormState) => void;
  errors: Record<string, string>;
  locations: LocationOption[];
  myOrgs: OrganizationListItem[];
}) {
  const tQuantity = useTranslations("tokens.physicalQuantity");
  const tTech = useTranslations("tokens.sensorTechnology");
  const tMeasurementType = useTranslations("tokens.measurementType");
  const tMountingType = useTranslations("tokens.mountingType");
  const tHazardousArea = useTranslations("tokens.hazardousArea");
  const tOutputType = useTranslations("tokens.outputType");
  const t = useTranslations("assets.detail");
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
          <div className="bg-og-surface border border-og-border rounded-xl p-5">
            <h3 className="text-sm font-semibold text-og-text mb-4">{t("general")}</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <EditInput label={t("assetId")} value={form.asset_id} onChange={set("asset_id")} error={errors.asset_id} required placeholder={t("assetIdPlaceholder")} />
              <EditInput label={t("name")} value={form.name} onChange={set("name")} error={errors.name} required placeholder={t("namePlaceholder")} />
              <EditInput label={t("manufacturer")} value={form.manufacturer} onChange={set("manufacturer")} error={errors.manufacturer} required placeholder={t("manufacturerPlaceholder")} />
              <EditInput label={t("model")} value={form.model} onChange={set("model")} error={errors.model} required placeholder={t("modelPlaceholder")} />
              <EditInput label={t("serialNumber")} value={form.serial_number} onChange={set("serial_number")} placeholder={t("serialNumberPlaceholder")} />
              <EditInput label={t("partNumber")} value={form.manufacturer_part_number} onChange={set("manufacturer_part_number")} placeholder={t("partNumberPlaceholder")} />
              <div className="sm:col-span-2">
                <EditTextArea label={t("description")} value={form.description} onChange={set("description")} placeholder={t("descriptionPlaceholder")} />
              </div>
            </div>
          </div>

          {/* Location */}
          <CollapsibleSection title={t("location")} forceOpen={isEditing}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <EditSelect
                label={t("organization")}
                value={form.organization_id}
                onChange={set("organization_id")}
                options={myOrgs.map((o) => ({ value: o.id, label: o.name }))}
                placeholder={t("selectOrganization")}
              />
              <EditSelect
                label={t("location")}
                value={form.location_id}
                onChange={set("location_id")}
                options={locations.map((l) => ({ value: l.id, label: l.path }))}
                placeholder={t("selectLocation")}
              />
            </div>
          </CollapsibleSection>

          {/* Mechanical */}
          <CollapsibleSection title={t("mechanical")} forceOpen={isEditing}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <EditInput label={t("dimensions")} value={form.dimensions} onChange={set("dimensions")} placeholder={t("dimensionsPlaceholder")} />
              <EditInput label={t("weightKg")} value={form.weight_kg} onChange={set("weight_kg")} error={errors.weight_kg} placeholder={t("weightKgPlaceholder")} />
              <EditSelectWithOther label={t("mountingType")} value={form.mounting_type} onChange={set("mounting_type")} options={MOUNTING_TYPE_OPTIONS.map((o) => ({ value: o.value, label: translateDynamic(tMountingType, o.value) }))} />
              <EditInput label={t("connectionType")} value={form.connection_type} onChange={set("connection_type")} placeholder={t("connectionTypePlaceholder")} />
              <EditSelectWithOther label={t("ipRating")} value={form.ip_rating} onChange={set("ip_rating")} options={IP_RATING_OPTIONS} />
              <EditSelectWithOther label={t("hazardousAreaRating")} value={form.hazardous_area_rating} onChange={set("hazardous_area_rating")} options={HAZARDOUS_AREA_OPTIONS.map((o) => ({ value: o.value, label: translateDynamic(tHazardousArea, o.value) }))} />
              <EditInput label={t("operatingTempMin")} value={form.operating_temperature_min} onChange={set("operating_temperature_min")} error={errors.operating_temperature_min} placeholder={t("operatingTempMinPlaceholder")} />
              <EditInput label={t("operatingTempMax")} value={form.operating_temperature_max} onChange={set("operating_temperature_max")} error={errors.operating_temperature_max} placeholder={t("operatingTempMaxPlaceholder")} />
              <EditInput label={t("operatingHumidityMin")} value={form.operating_humidity_min} onChange={set("operating_humidity_min")} error={errors.operating_humidity_min} placeholder={t("operatingHumidityMinPlaceholder")} />
              <EditInput label={t("operatingHumidityMax")} value={form.operating_humidity_max} onChange={set("operating_humidity_max")} error={errors.operating_humidity_max} placeholder={t("operatingHumidityMaxPlaceholder")} />
            </div>
          </CollapsibleSection>

          {/* Electrical */}
          <CollapsibleSection title={t("electrical")} forceOpen={isEditing}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <EditInput label={t("powerSupply")} value={form.power_supply} onChange={set("power_supply")} placeholder={t("powerSupplyPlaceholder")} />
              <EditInput label={t("powerConsumption")} value={form.power_consumption_w} onChange={set("power_consumption_w")} error={errors.power_consumption_w} placeholder={t("powerConsumptionPlaceholder")} />
              <EditInput label={t("firmwareVersion")} value={form.firmware_version} onChange={set("firmware_version")} placeholder={t("firmwareVersionPlaceholder")} />
            </div>
          </CollapsibleSection>

          {/* Commercial */}
          <CollapsibleSection title={t("commercial")} forceOpen={isEditing}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
              <EditInput label={t("purchaseDate")} value={form.purchase_date} onChange={set("purchase_date")} error={errors.purchase_date} placeholder="YYYY-MM-DD" type="date" />
              <EditInput label={t("purchasePrice")} value={form.price_eur} onChange={set("price_eur")} error={errors.price_eur} placeholder={t("purchasePricePlaceholder")} />
              <EditInput label={t("warrantyExpiry")} value={form.warranty_expiry_date} onChange={set("warranty_expiry_date")} error={errors.warranty_expiry_date} placeholder="YYYY-MM-DD" type="date" />
            </div>
          </CollapsibleSection>

          {/* Notes */}
          <CollapsibleSection title={t("notes")} forceOpen={isEditing}>
            <div className="mt-4">
              <EditTextArea label={t("notes")} value={form.notes} onChange={set("notes")} placeholder={t("notesPlaceholder")} rows={4} />
            </div>
          </CollapsibleSection>
        </div>

        {/* Right 1/3: Specifications (sensor channels edit) */}
        <div className="space-y-4">
          {profile.asset_type === "sensor" && (
            <>
              <div className="bg-og-surface border border-og-border rounded-xl p-4">
                <h3 className="text-sm font-semibold text-og-text mb-1">{t("sensorChannels")}</h3>
                <p className="text-xs text-gray-400">{t("sensorChannelsHint")}</p>
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
                  <p className="text-sm text-gray-400 text-center py-4">{t("noChannelsYet")}</p>
                )}
                <button
                  type="button"
                  onClick={addChannel}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-og-accent border border-dashed border-og-border rounded-xl px-3 py-3 hover:bg-og-surface-alt transition-colors"
                >
                  <PlusIcon size={12} />
                  {t("addChannel")}
                </button>
              </div>
            </>
          )}

          {profile.asset_type === "daq" && daq && (
            <div className="bg-og-surface border border-og-border rounded-xl p-6">
              <h3 className="text-sm font-semibold text-og-text mb-1">{t("daqSpecifications")}</h3>
              <p className="text-xs text-gray-400">{t("daqSpecificationsHint")}</p>
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
        <div className="bg-og-surface border border-og-border rounded-xl p-5">
          <h3 className="text-sm font-semibold text-og-text mb-3">{t("general")}</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
            <SpecRow label={t("assetId")} value={profile.asset_id} accent tooltip={t("tips.assetId")} tooltipDocsHref={ASSET_DOCS_LINKS.asset_id} />
            <SpecRow
              label={t("organization")}
              value={profile.organization_id && profile.organization_name ? (
                <Link href={`/organizations/${profile.organization_id}`} className="text-og-accent hover:underline">
                  {profile.organization_name}
                </Link>
              ) : profile.organization_name}
              tooltip={t("tips.organization")}
              tooltipDocsHref={ASSET_DOCS_LINKS.organization}
            />
            <SpecRow label={t("name")} value={profile.name} tooltip={t("tips.name")} tooltipDocsHref={ASSET_DOCS_LINKS.identity} />
            <SpecRow label={t("manufacturer")} value={profile.manufacturer} tooltip={t("tips.manufacturer")} tooltipDocsHref={ASSET_DOCS_LINKS.identity} />
            <SpecRow label={t("model")} value={profile.model} tooltip={t("tips.model")} tooltipDocsHref={ASSET_DOCS_LINKS.identity} />
            <SpecRow label={t("serialNumber")} value={profile.serial_number} tooltip={t("tips.serialNumber")} tooltipDocsHref={ASSET_DOCS_LINKS.identity} />
            <SpecRow label={t("partNumber")} value={profile.manufacturer_part_number} tooltip={t("tips.partNumber")} tooltipDocsHref={ASSET_DOCS_LINKS.part_number} />
            <SpecRow label={t("description")} value={profile.description} tooltip={t("tips.description")} tooltipDocsHref={ASSET_DOCS_LINKS.description} />
          </div>
        </div>

        <CollapsibleSection title={t("location")}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3">
            <SpecRow label={t("site")} value={profile.site_name} tooltip={t("tips.site")} tooltipDocsHref={ASSET_DOCS_LINKS.location} />
            <SpecRow label={t("location")} value={profile.location_name} tooltip={t("tips.location")} tooltipDocsHref={ASSET_DOCS_LINKS.location} />
            <SpecRow label={t("locationCode")} value={profile.location_code} tooltip={t("tips.locationCode")} tooltipDocsHref={ASSET_DOCS_LINKS.location} />
            <SpecRow label={t("description")} value={profile.location_description} tooltip={t("tips.locationDescription")} tooltipDocsHref={ASSET_DOCS_LINKS.location} />
            {locationCoords && <SpecRow label={t("coordinates")} value={locationCoords} tooltip={t("tips.coordinates")} tooltipDocsHref={ASSET_DOCS_LINKS.location} />}
          </div>
        </CollapsibleSection>

        {hasAny(profile.dimensions, profile.weight_kg, profile.mounting_type, profile.connection_type, profile.ip_rating, profile.hazardous_area_rating, operatingTemp, operatingHumidity) && (
          <CollapsibleSection title={t("mechanical")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3">
              <SpecRow label={t("dimensions")} value={profile.dimensions} tooltip={t("tips.dimensions")} tooltipDocsHref={ASSET_DOCS_LINKS.dimensions_weight} />
              {profile.weight_kg != null && <SpecRow label={t("weight")} value={`${profile.weight_kg} kg`} tooltip={t("tips.weight")} tooltipDocsHref={ASSET_DOCS_LINKS.dimensions_weight} />}
              <SpecRow label={t("mountingType")} value={profile.mounting_type ? translateDynamic(tMountingType, profile.mounting_type) : profile.mounting_type} tooltip={t("tips.mountingType")} tooltipDocsHref={ASSET_DOCS_LINKS.mounting_type} />
              <SpecRow label={t("connectionType")} value={profile.connection_type} tooltip={t("tips.connectionType")} tooltipDocsHref={ASSET_DOCS_LINKS.connection_type} />
              <SpecRow label={t("ipRating")} value={profile.ip_rating} tooltip={t("tips.ipRating")} tooltipDocsHref={ASSET_DOCS_LINKS.ip_rating} />
              <SpecRow label={t("hazardousArea")} value={profile.hazardous_area_rating ? translateDynamic(tHazardousArea, profile.hazardous_area_rating) : profile.hazardous_area_rating} tooltip={t("tips.hazardousArea")} tooltipDocsHref={ASSET_DOCS_LINKS.hazardous_area_rating} />
              {operatingTemp && <SpecRow label={t("operatingTemperature")} value={operatingTemp} tooltip={t("tips.operatingTemperature")} tooltipDocsHref={ASSET_DOCS_LINKS.operating_range} />}
              {operatingHumidity && <SpecRow label={t("operatingHumidity")} value={operatingHumidity} tooltip={t("tips.operatingHumidity")} tooltipDocsHref={ASSET_DOCS_LINKS.operating_range} />}
            </div>
          </CollapsibleSection>
        )}

        {hasAny(profile.power_supply, profile.power_consumption_w, profile.firmware_version, profile.pinout_table?.length) && (
          <CollapsibleSection title={t("electrical")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3">
              <SpecRow label={t("powerSupply")} value={profile.power_supply} tooltip={t("tips.powerSupply")} tooltipDocsHref={ASSET_DOCS_LINKS.power} />
              {profile.power_consumption_w != null && (
                <SpecRow label={t("powerConsumptionDisplay")} value={`${profile.power_consumption_w} W`} tooltip={t("tips.powerConsumption")} tooltipDocsHref={ASSET_DOCS_LINKS.power} />
              )}
              <SpecRow label={t("firmware")} value={profile.firmware_version} tooltip={t("tips.firmware")} tooltipDocsHref={ASSET_DOCS_LINKS.firmware_version} />
            </div>
            {profile.pinout_table && profile.pinout_table.length > 0 && (
              <div className="mt-4">
                <p className="text-xs text-gray-400 mb-2">{t("pinout")}</p>
                <div className="overflow-x-auto rounded-lg border border-og-border">
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-og-border bg-og-surface-alt">
                        <th className="px-3 py-2 font-semibold text-gray-400 w-16">{t("pin")}</th>
                        <th className="px-3 py-2 font-semibold text-gray-400 w-32">{t("name")}</th>
                        <th className="px-3 py-2 font-semibold text-gray-400">{t("description")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-og-border">
                      {profile.pinout_table.map((row) => (
                        <tr key={row.pin_number}>
                          <td className="px-3 py-2 font-mono text-og-text">{row.pin_number}</td>
                          <td className="px-3 py-2 text-og-text">{row.name}</td>
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
          <CollapsibleSection title={t("commercial")}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 mt-3">
              {profile.purchase_date && <SpecRow label={t("purchaseDate")} value={fmtDate(profile.purchase_date)} tooltip={t("tips.purchaseDate")} tooltipDocsHref={ASSET_DOCS_LINKS.commercial} />}
              {profile.price_eur != null && <SpecRow label={t("purchasePriceDisplay")} value={`€${profile.price_eur.toLocaleString()}`} tooltip={t("tips.purchasePrice")} tooltipDocsHref={ASSET_DOCS_LINKS.commercial} />}
              {profile.warranty_expiry_date && <SpecRow label={t("warrantyExpires")} value={fmtDate(profile.warranty_expiry_date)} tooltip={t("tips.warrantyExpires")} tooltipDocsHref={ASSET_DOCS_LINKS.commercial} />}
            </div>
          </CollapsibleSection>
        )}

        {profile.notes && (
          <CollapsibleSection title={t("notes")}>
            <p className="text-sm text-og-text mt-3 leading-relaxed whitespace-pre-wrap">{profile.notes}</p>
          </CollapsibleSection>
        )}
      </div>

      <div className="bg-og-surface border border-og-border rounded-xl p-6 h-fit">
        {profile.asset_type === "sensor" && (
          <>
            <h3 className="text-sm font-semibold text-og-text mb-4">{t("specifications")}</h3>
            {profile.sensor_channels.length === 0 ? (
              <p className="text-sm text-gray-400">{t("noChannelData")}</p>
            ) : (
              <div className="space-y-0">
                {profile.sensor_channels.map((ch, i) => (
                  <div key={ch.id} className={i > 0 ? "mt-4 pt-4 border-t border-og-border" : ""}>
                    <p className="text-[11px] font-semibold text-og-accent uppercase tracking-wide mb-1">
                      {ch.channel_id}
                    </p>
                    <SpecRow label={t("physicalQuantity")} value={translateDynamic(tQuantity, ch.physical_quantity)} tooltip={t("tips.channelPhysicalQuantity")} tooltipDocsHref={CHAN_DOCS_LINKS.physical_quantity} />
                    <SpecRow
                      label={t("measurementType")}
                      value={ch.measurement_type ? translateDynamic(tMeasurementType, ch.measurement_type) : ch.measurement_type}
                      tooltip={t("tips.channelMeasurementType")}
                      tooltipDocsHref={CHAN_DOCS_LINKS.measurement_type}
                    />
                    <SpecRow label={t("technology")} value={ch.technology ? translateDynamic(tTech, ch.technology) : ch.technology} tooltip={t("tips.channelTechnology")} tooltipDocsHref={CHAN_DOCS_LINKS.technology} />
                    {(ch.measurement_min != null || ch.measurement_max != null) && (
                      <SpecRow label={t("range")} value={`${ch.measurement_min ?? "—"} – ${ch.measurement_max ?? "—"} ${ch.unit}`} tooltip={t("tips.channelRange")} tooltipDocsHref={CHAN_DOCS_LINKS.measurement_range} />
                    )}
                    {ch.accuracy_value != null && (
                      <SpecRow label={t("accuracy")} value={`±${ch.accuracy_value}${ch.accuracy_unit ? " " + ch.accuracy_unit : ""}`} tooltip={t("tips.channelAccuracy")} tooltipDocsHref={CHAN_DOCS_LINKS.accuracy_value} />
                    )}
                    {ch.resolution != null && (
                      <SpecRow label={t("resolution")} value={`${ch.resolution}${ch.resolution_unit ? " " + ch.resolution_unit : ""}`} tooltip={t("tips.channelResolution")} tooltipDocsHref={CHAN_DOCS_LINKS.resolution} />
                    )}
                    {ch.measurement_uncertainty != null && (
                      <SpecRow label={t("uncertainty")} value={`±${ch.measurement_uncertainty}${ch.uncertainty_unit ? " " + ch.uncertainty_unit : ""}`} tooltip={t("tips.channelUncertainty")} tooltipDocsHref={CHAN_DOCS_LINKS.measurement_uncertainty} />
                    )}
                    {ch.drift_rate != null && (
                      <SpecRow label={t("driftRate")} value={`${ch.drift_rate}${ch.drift_unit ? " " + ch.drift_unit : ""}`} tooltip={t("tips.channelDriftRate")} tooltipDocsHref={CHAN_DOCS_LINKS.drift_rate} />
                    )}
                    {ch.response_time_ms != null && <SpecRow label={t("responseTime")} value={`${ch.response_time_ms} ms`} tooltip={t("tips.channelResponseTime")} tooltipDocsHref={CHAN_DOCS_LINKS.response_time_ms} />}
                    {ch.bandwidth_hz != null && <SpecRow label={t("bandwidth")} value={`${ch.bandwidth_hz.toLocaleString()} Hz`} tooltip={t("tips.channelBandwidth")} tooltipDocsHref={CHAN_DOCS_LINKS.bandwidth_hz} />}
                    <SpecRow label={t("outputType")} value={ch.output_type ? translateDynamic(tOutputType, ch.output_type) : ch.output_type} tooltip={t("tips.channelOutputType")} tooltipDocsHref={CHAN_DOCS_LINKS.output_signal} />
                    {(ch.output_signal_min != null || ch.output_signal_max != null) && (
                      <SpecRow label={t("outputRange")} value={`${ch.output_signal_min ?? "—"} – ${ch.output_signal_max ?? "—"}${ch.output_signal_unit ? " " + ch.output_signal_unit : ""}`} tooltip={t("tips.channelOutputRange")} tooltipDocsHref={CHAN_DOCS_LINKS.output_signal} />
                    )}
                    <SpecRow label={t("calMethod")} value={ch.calibration_method_name} tooltip={t("tips.channelCalMethod")} tooltipDocsHref={CHAN_DOCS_LINKS.calibration_method} />
                    <SpecRow label={t("calRole")} value={ch.calibration_role === "reference" ? t("referenceStandard") : null} tooltip={t("tips.channelCalRole")} tooltipDocsHref={CHAN_DOCS_LINKS.calibration_role} />
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {profile.asset_type === "daq" && daq && (
          <>
            <h3 className="text-sm font-semibold text-og-text mb-4">{t("specifications")}</h3>
            <SpecRow label={t("daqType")} value={daq.daq_type} />
            <SpecRow label={t("inputChannels")} value={String(daq.input_channels)} />
            <SpecRow label={t("outputChannels")} value={String(daq.output_channels)} />
            <SpecRow label={t("inputSignalTypes")} value={daq.input_signal_types} />
            <SpecRow label={t("outputSignalTypes")} value={daq.output_signal_types} />
            {daq.sampling_rate_hz != null && <SpecRow label={t("samplingRate")} value={`${daq.sampling_rate_hz.toLocaleString()} Hz`} />}
            {daq.per_channel_sampling_rate_hz != null && <SpecRow label={t("perChannelRate")} value={`${daq.per_channel_sampling_rate_hz.toLocaleString()} Hz`} />}
            {daq.adc_resolution_bits != null && <SpecRow label={t("adcResolution")} value={t("bitSuffix", { bits: daq.adc_resolution_bits })} />}
            <SpecRow label={t("adcType")} value={daq.adc_type} />
            {daq.input_voltage_range_min != null && daq.input_voltage_range_max != null && (
              <SpecRow label={t("inputVoltageRange")} value={`${daq.input_voltage_range_min} – ${daq.input_voltage_range_max} V`} />
            )}
            {daq.noise_floor_uv_rms != null && <SpecRow label={t("noiseFloor")} value={`${daq.noise_floor_uv_rms} µV RMS`} />}
            {daq.dynamic_range_db != null && <SpecRow label={t("dynamicRange")} value={`${daq.dynamic_range_db} dB`} />}
            {daq.input_impedance_ohm != null && <SpecRow label={t("inputImpedance")} value={`${daq.input_impedance_ohm.toLocaleString()} Ω`} />}
            <SpecRow label={t("communication")} value={daq.communication_protocol} />
            <SpecRow label={t("interface")} value={daq.interface_type} accent />
            <SpecRow label={t("synchronization")} value={daq.synchronization_supported ? t("supported") : null} />
            <SpecRow label={t("clockSource")} value={daq.clock_source} />
          </>
        )}

        {profile.asset_type === "daq" && !daq && (
          <>
            <h3 className="text-sm font-semibold text-og-text mb-4">{t("specifications")}</h3>
            <p className="text-sm text-gray-400">{t("noDaqData")}</p>
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
  currentUserId: string;
  /** Any role but Viewer may register a calibration. */
  canRegisterCalibration: boolean;
  /** From the page's ?cal=<id> query param (a checker-assigned/decision
   * notification link) — pre-selects that calibration and reveals it even if
   * hidden by the "Show Valid Calibrations" toggle. Null on a normal visit. */
  deepLinkCalId: string | null;
  /** Wraps any action that would open the wizard so unsaved asset-edit changes
   * (if any) can be saved or discarded first — see guardBeforeLeavingEdit. */
  guardBeforeLeavingEdit: (action: () => void) => void;
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
  cal, points, measuredUnit, referenceUnit, className,
}: {
  cal: CalibrationRecord;
  points: CalibrationPoint[];
  measuredUnit: string;
  referenceUnit: string;
  className?: string;
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
    <div className={`rounded-xl border border-og-border bg-og-surface relative overflow-hidden ${className ?? ""}`}>
      <div className="absolute bottom-16 right-3 z-20 pointer-events-none">
        <div className="bg-og-surface border border-og-border rounded-lg px-2 py-1.5 shadow-xs">
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
      <div ref={plotDivRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}

// Coefficient exponent descriptions (ascending: exp 0 = constant, exp 1 = linear, …)
function useCoeffDesc() {
  const t = useTranslations("assets.calibration");
  const desc: Record<number, string> = {
    0: t("coeffOffset"),
    1: t("coeffGain"),
    2: t("coeffQuadratic"),
    3: t("coeffCubic"),
    4: t("coeffQuartic"),
    5: t("coeffQuintic"),
  };
  return desc;
}

type ResultView = "equation" | "coefficients";

function CalibrationTab({ calibrations, profile, onCalibrationSaved, onCalibrationDeleted, isAdmin, currentUserId, canRegisterCalibration, deepLinkCalId, guardBeforeLeavingEdit }: CalibrationTabProps) {
  const tUncertaintySource = useTranslations("tokens.uncertaintySource");
  const tDecisionRule = useTranslations("tokens.decisionRule");
  const t = useTranslations("assets.calibration");
  const coeffDesc = useCoeffDesc();
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
  const [freqPoints, setFreqPoints] = useState<FrequencyResponsePoint[]>([]);
  const [loadingFreqPoints, setLoadingFreqPoints] = useState(false);
  const [rightView, setRightView] = useState<"chart" | "table">("chart");
  const [resultView, setResultView] = useState<ResultView>("equation");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [calLocation, setCalLocation] = useState<LocationItem | null>(null);
  const [deletingCalId, setDeletingCalId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [voidReason, setVoidReason] = useState("");
  const [showVoided, setShowVoided] = useState(false);
  const [allCals, setAllCals] = useState<CalibrationRecord[] | null>(null);
  const [restoringCalId, setRestoringCalId] = useState<string | null>(null);
  const [approvingCalId, setApprovingCalId] = useState<string | null>(null);
  const [rejectConfirmId, setRejectConfirmId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [rejectingCalId, setRejectingCalId] = useState<string | null>(null);

  const sourceCals = showVoided && allCals ? allCals : calibrations;
  const filteredCals = hasChannelTabs && activeChannelId
    ? sourceCals.filter((c) => c.sensor_id === activeChannelId)
    : sourceCals;

  const selectedCal = filteredCals.find((c) => c.id === selectedCalId) ?? filteredCals[0] ?? null;

  function refetchVoided() {
    getAssetCalibrations(profile.id, true).then(setAllCals).catch(() => {});
  }

  useEffect(() => {
    if (showVoided) refetchVoided();
  }, [showVoided]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    setSelectedCalId(null);
    setPoints([]);
  }, [activeChannelId]);

  // A checker-assigned/decision notification links here with ?cal=<id>, read
  // once at the page level and passed down — see deepLinkCalId. Selecting it
  // also forces showVoided so a pending/rejected row is visible even though
  // it's hidden by default.
  useEffect(() => {
    if (!deepLinkCalId) return;
    setSelectedCalId(deepLinkCalId);
    setShowVoided(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkCalId]);

  useEffect(() => {
    if (!selectedCal) { setPoints([]); return; }
    setLoadingPoints(true);
    getCalibrationPoints(selectedCal.id)
      .then(setPoints)
      .catch(() => setPoints([]))
      .finally(() => setLoadingPoints(false));
  }, [selectedCal?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Separate from the points fetch above so calibrations without a frequency
  // response never issue the extra request.
  useEffect(() => {
    if (!selectedCal?.has_frequency_response) { setFreqPoints([]); return; }
    setLoadingFreqPoints(true);
    getCalibrationFrequencyPoints(selectedCal.id)
      .then(setFreqPoints)
      .catch(() => setFreqPoints([]))
      .finally(() => setLoadingFreqPoints(false));
  }, [selectedCal?.id, selectedCal?.has_frequency_response]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const locId = selectedCal?.calibration_location_id;
    if (!locId) { setCalLocation(null); return; }
    getLocation(locId).then(setCalLocation).catch(() => setCalLocation(null));
  }, [selectedCal?.calibration_location_id]);

  async function handleVoidCal(calId: string) {
    setDeletingCalId(calId);
    try {
      await voidCalibration(calId, voidReason.trim() || undefined);
      setDeleteConfirmId(null);
      setVoidReason("");
      if (selectedCalId === calId) setSelectedCalId(null);
      onCalibrationDeleted();
      if (showVoided) refetchVoided();
    } catch {
      // leave modal open so user sees error feedback via disabled state
    } finally {
      setDeletingCalId(null);
    }
  }

  async function handleRestoreCal(calId: string) {
    setRestoringCalId(calId);
    try {
      await restoreCalibration(calId);
      onCalibrationDeleted();
      if (showVoided) refetchVoided();
    } catch {
      // no-op — row stays as-is, admin can retry
    } finally {
      setRestoringCalId(null);
    }
  }

  async function handleApproveCal(calId: string) {
    setApprovingCalId(calId);
    try {
      await approveCalibration(calId);
      onCalibrationDeleted();
      if (showVoided) refetchVoided();
    } catch {
      // no-op — row stays as-is, checker/admin can retry
    } finally {
      setApprovingCalId(null);
    }
  }

  async function handleRejectCal(calId: string) {
    setRejectingCalId(calId);
    try {
      await rejectCalibration(calId, rejectReason.trim() || undefined);
      setRejectConfirmId(null);
      setRejectReason("");
      onCalibrationDeleted();
      if (showVoided) refetchVoided();
    } catch {
      // leave modal open so user sees error feedback via disabled state
    } finally {
      setRejectingCalId(null);
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
        calibrations={calibrations}
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
            onClick={() => { if (!isDeleting) { setDeleteConfirmId(null); setVoidReason(""); } }}
          />
          <div className="relative bg-og-surface border border-og-border rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <TrashIcon size={16} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-og-text">{t("voidCalibration")}</h3>
                {calToDelete && (
                  <p className="text-xs text-gray-400">
                    {t("version")} {calToDelete.calibration_version} · {fmtDate(calToDelete.calibration_date)}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("voidHint")}
            </p>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("reasonOptional")}</label>
              <textarea
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                rows={2}
                placeholder={t("voidReasonPlaceholder")}
                className="w-full px-3 py-2 text-sm border border-og-border-md bg-og-surface rounded-lg outline-hidden focus:border-og-accent focus:ring-2 focus:ring-og-accent/20 transition-all placeholder:text-gray-400 text-og-text"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setDeleteConfirmId(null); setVoidReason(""); }}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleVoidCal(deleteConfirmId)}
                disabled={isDeleting}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {isDeleting ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("voiding")}
                  </>
                ) : t("voidCalibration")}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    {rejectConfirmId && (() => {
      const calToReject = filteredCals.find((c) => c.id === rejectConfirmId);
      const isRejecting = !!rejectingCalId;
      return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50"
            onClick={() => { if (!isRejecting) { setRejectConfirmId(null); setRejectReason(""); } }}
          />
          <div className="relative bg-og-surface border border-og-border rounded-xl shadow-xl p-6 w-full max-w-sm space-y-4">
            <div className="flex items-center gap-3">
              <div className="shrink-0 w-9 h-9 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <XIcon size={16} className="text-red-600 dark:text-red-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-og-text">{t("rejectCalibration")}</h3>
                {calToReject && (
                  <p className="text-xs text-gray-400">
                    {t("version")} {calToReject.calibration_version} · {fmtDate(calToReject.calibration_date)}
                  </p>
                )}
              </div>
            </div>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {t("rejectHint")}
            </p>
            <div className="space-y-1">
              <label className="text-xs text-gray-400">{t("reasonOptional")}</label>
              <textarea
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                rows={2}
                placeholder={t("rejectReasonPlaceholder")}
                className="w-full px-3 py-2 text-sm border border-og-border-md bg-og-surface rounded-lg outline-hidden focus:border-og-accent focus:ring-2 focus:ring-og-accent/20 transition-all placeholder:text-gray-400 text-og-text"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setRejectConfirmId(null); setRejectReason(""); }}
                disabled={isRejecting}
                className="px-3 py-1.5 text-xs font-medium text-gray-500 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-60"
              >
                {t("cancel")}
              </button>
              <button
                type="button"
                onClick={() => handleRejectCal(rejectConfirmId)}
                disabled={isRejecting}
                className="px-3 py-1.5 text-xs font-medium bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors disabled:opacity-60 flex items-center gap-1.5"
              >
                {isRejecting ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    {t("rejecting")}
                  </>
                ) : t("rejectCalibration")}
              </button>
            </div>
          </div>
        </div>
      );
    })()}
    <div className="flex gap-5 items-start">
      <div className="flex-1 min-w-0 space-y-5">
      {selectedCal ? (
        <div className="bg-og-surface border border-og-border rounded-xl p-5 space-y-4">
          {/* Header row — version / date / performed by (left) + approve/reject + certificate download (right) */}
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-og-accent">v{selectedCal.calibration_version}</span>
                <span className="text-sm font-semibold text-og-text">{fmtDate(selectedCal.calibration_date)}</span>
                <span className="text-xs text-gray-400">{t("by", { name: selectedCal.performed_by_name })}{selectedCal.external_lab_name ? ` · ${selectedCal.external_lab_name}` : ""}</span>
              </div>
              {selectedCal.external_lab_certificate_number && (
                <p className="text-xs text-gray-400 mt-0.5">
                  <span className="opacity-60">📄</span>
                  {" "}{selectedCal.external_lab_certificate_number}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {selectedCal.status === "pending_approval" && (currentUserId === selectedCal.checked_by_user_id || isAdmin) && (
                <>
                  <button
                    type="button"
                    onClick={() => handleApproveCal(selectedCal.id)}
                    disabled={approvingCalId === selectedCal.id}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
                  >
                    <CheckIcon size={12} />
                    {t("approve")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRejectConfirmId(selectedCal.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 border border-og-border-md text-gray-600 dark:text-gray-300 hover:bg-og-surface-alt text-xs font-medium rounded-lg transition-colors"
                  >
                    <XIcon size={12} />
                    {t("reject")}
                  </button>
                </>
              )}
              <CertificateDownloadButton
                calibrationId={selectedCal.id}
                assetTag={profile.asset_id}
                calibrationVersion={selectedCal.calibration_version}
                disabled={!selectedCal.poly_coefficients}
              />
            </div>
          </div>

          {/* Result view: Equation / Coefficients */}
          {selectedCal.poly_coefficients && selectedCal.poly_order != null && (
            <div className="rounded-lg bg-og-surface-alt border border-og-border overflow-hidden">
              <div className="flex items-center px-3 pt-2 pb-0 border-b border-og-border gap-0.5">
                {(["equation", "coefficients"] as const).map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => setResultView(v)}
                    className={`px-3 py-1.5 text-xs font-medium transition-colors rounded-t-md -mb-px capitalize
                      ${resultView === v
                        ? "bg-og-surface border border-og-border text-og-text"
                        : "text-gray-400 hover:text-og-text"
                      }`}
                  >
                    {v === "equation" ? t("equation") : t("coefficients")}
                  </button>
                ))}
              </div>
              <div className="px-4 py-3">
                {resultView === "equation" && (
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 flex-wrap min-w-0">
                      <span className="text-xs font-mono text-og-text">
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
                      title={t("copy")}
                      className="shrink-0 p-1 text-gray-400 hover:text-og-text rounded-sm transition-colors"
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
                                {coeffDesc[exp] ?? t("orderNTerm", { exp })}
                              </p>
                              <p className="font-mono text-xs text-og-text">{fmtNum(val, 6)}</p>
                            </div>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(fmtNum(val, 6)).then(() => {
                                  setCopiedKey(ck);
                                  setTimeout(() => setCopiedKey(null), 1500);
                                });
                              }}
                              title={t("copy")}
                              className="shrink-0 mt-3 p-1 text-gray-400 hover:text-og-text rounded-sm transition-colors"
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
              <div className="w-[38%] shrink-0 rounded-xl border border-og-border p-4 bg-og-surface-alt space-y-0">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{t("calibration")}</p>
                <StatRow label={t("polyDegree")} value={String(selectedCal.poly_order ?? "—")} />
                {(selectedCal.valid_range_min != null || selectedCal.range_min != null) && (
                  <StatRow
                    label={t("validRange")}
                    value={`${fmtNum(selectedCal.valid_range_min ?? selectedCal.range_min)} – ${fmtNum(selectedCal.valid_range_max ?? selectedCal.range_max)}${referenceUnit ? ` ${referenceUnit}` : ""}`}
                  />
                )}
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 pt-3 border-t border-og-border mb-2 mt-2">{t("statistics")}</p>
                <StatRow label={t("rSquared")} value={fmtNum(selectedCal.r_squared, 6)} tip={t("tips.rSquared")} docsHref={STAT_DOCS_LINKS.r_squared} />
                <StatRow label={t("rmse")} value={selectedCal.rmse != null ? `${fmtNum(selectedCal.rmse)}${referenceUnit ? ` ${referenceUnit}` : ""}` : null} tip={t("tips.rmse")} docsHref={STAT_DOCS_LINKS.rmse} />
                <StatRow label={t("maxError")} value={selectedCal.max_error != null ? `${fmtNum(selectedCal.max_error)}${referenceUnit ? ` ${referenceUnit}` : ""}` : null} tip={t("tips.maxError")} docsHref={STAT_DOCS_LINKS.max_error} />
                <StatRow label={t("fsError")} value={selectedCal.full_scale_error != null ? `${fmtNum(selectedCal.full_scale_error, 3)}%` : null} tip={t("tips.fsError")} docsHref={STAT_DOCS_LINKS.full_scale_error} />
                <StatRow label={t("nonLinearity")} value={selectedCal.non_linearity != null ? `${fmtNum(selectedCal.non_linearity, 3)}%` : null} tip={t("tips.nonLinearity")} docsHref={STAT_DOCS_LINKS.non_linearity} />
                {selectedCal.repeatability != null && (
                  <StatRow label={t("repeatability")} value={`${fmtNum(selectedCal.repeatability)}${referenceUnit ? ` ${referenceUnit}` : ""}`} tip={t("tips.repeatability")} docsHref={STAT_DOCS_LINKS.repeatability} />
                )}
                {selectedCal.hysteresis != null && (
                  <StatRow label={t("hysteresis")} value={`${fmtNum(selectedCal.hysteresis)}${referenceUnit ? ` ${referenceUnit}` : ""}`} tip={t("tips.hysteresis")} docsHref={STAT_DOCS_LINKS.hysteresis} />
                )}
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 pt-3 border-t border-og-border mb-2 mt-2">{t("uncertaintyBudget")}</p>
                {selectedCal.uncertainty_budget?.map((c) => (
                  <StatRow
                    key={c.source}
                    label={translateDynamic(tUncertaintySource, c.source)}
                    value={`${fmtNum(c.standard_uncertainty)}${referenceUnit ? ` ${referenceUnit}` : ""}`}
                    tip={t("tips.uncertaintyBudgetRow", { description: c.description, distribution: c.distribution, divisor: fmtNum(c.divisor, 3) })}
                    docsHref={STAT_DOCS_LINKS.uncertainty_budget_row}
                  />
                ))}
                <StatRow label={t("combinedRss")} value={selectedCal.combined_uncertainty != null ? `${fmtNum(selectedCal.combined_uncertainty)}${referenceUnit ? ` ${referenceUnit}` : ""}` : null} tip={t("tips.combinedRss")} docsHref={STAT_DOCS_LINKS.combined_uncertainty} />
                <StatRow
                  label={t("expanded")}
                  value={selectedCal.expanded_uncertainty != null ? `${fmtNum(roundToSigFigs(selectedCal.expanded_uncertainty, 2))}${referenceUnit ? ` ${referenceUnit}` : ""}` : null}
                  tip={
                    (selectedCal.effective_degrees_of_freedom != null
                      ? t("tips.expandedWithDof", { k: selectedCal.coverage_factor ?? "?", confidence: selectedCal.confidence_level ?? "?", dof: fmtNum(selectedCal.effective_degrees_of_freedom, 1) })
                      : t("tips.expandedNoDof", { k: selectedCal.coverage_factor ?? "?", confidence: selectedCal.confidence_level ?? "?" }))
                    + " " + t("tips.expandedRounded")
                  }
                  docsHref={STAT_DOCS_LINKS.expanded_uncertainty}
                />
                {selectedCal.conformity_statement?.specification && (
                  <>
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 pt-3 border-t border-og-border mb-2 mt-2">{t("conformity")}</p>
                    <div className="flex items-center justify-between gap-2 py-1">
                      <span className="text-xs text-gray-400">{t("statement")}</span>
                      <span className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-semibold border whitespace-nowrap ${
                        selectedCal.conformity_statement.passed
                          ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/30 dark:border-emerald-900/50"
                          : "bg-red-50 text-red-700 border-red-200 dark:bg-red-950/30 dark:border-red-900/50"
                      }`}>
                        {selectedCal.conformity_statement.passed ? t("conforms") : t("doesNotConform")}
                      </span>
                    </div>
                    <StatRow label={t("specification")} value={selectedCal.conformity_statement.specification} />
                    <StatRow
                      label={t("decisionRule")}
                      value={translateDynamic(tDecisionRule, selectedCal.conformity_statement.decision_rule)}
                      tip={t("tips.decisionRule")}
                      docsHref={STAT_DOCS_LINKS.decision_rule}
                    />
                  </>
                )}
              </div>

              {/* Right: chart/table toggle (60%) */}
              <div className="flex-1 min-w-0 flex flex-col gap-2">
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

                {loadingPoints ? (
                  <div className="flex items-center justify-center flex-1 text-gray-400 gap-2 text-xs py-10">
                    <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
                    {t("loadingData")}
                  </div>
                ) : points.length === 0 ? (
                  <div className="flex items-center justify-center flex-1 text-gray-400 text-sm py-10">
                    {t("noPointData")}
                  </div>
                ) : rightView === "chart" ? (
                  <div className="flex-1 min-h-0 flex flex-col gap-3">
                    <CalibrationChart
                      className="flex-1 min-h-0"
                      cal={selectedCal}
                      points={points}
                      measuredUnit={measuredUnit}
                      referenceUnit={referenceUnit}
                    />
                    <ResidualsChart
                      className="flex-1 min-h-0"
                      points={points.map((p) => ({
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
                ) : (
                  <div className="rounded-xl border border-og-border overflow-hidden" style={{ maxHeight: 340, overflowY: "auto" }}>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-og-border bg-og-surface-alt">
                          {[
                            "#",
                            `${t("measured")}${measuredUnit ? ` (${measuredUnit})` : ""}`,
                            `${t("reference")}${referenceUnit ? ` (${referenceUnit})` : ""}`,
                            `${t("fitted")}${referenceUnit ? ` (${referenceUnit})` : ""}`,
                            `${t("residual")}${referenceUnit ? ` (${referenceUnit})` : ""}`,
                            t("residualPercent"),
                          ].map((h) => (
                            <th key={h} className="text-left px-3 py-2 text-gray-400 font-medium whitespace-nowrap">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {points.map((pt) => (
                          <tr key={pt.point_index} className="border-b border-og-border last:border-b-0 hover:bg-og-surface-alt/50 transition-colors">
                            <td className="px-3 py-1.5 font-mono text-gray-400">{pt.point_index + 1}</td>
                            <td className="px-3 py-1.5 font-mono text-og-text">{fmtNum(pt.measured_value)}</td>
                            <td className="px-3 py-1.5 font-mono text-og-text">{fmtNum(pt.reference_value)}</td>
                            <td className="px-3 py-1.5 font-mono text-og-text">{fmtNum(pt.calculated_value)}</td>
                            <td className={`px-3 py-1.5 font-mono ${selectedCal.rmse != null && Math.abs(pt.residual_abs ?? 0) > selectedCal.rmse * 2 ? "text-amber-400 dark:text-amber-300" : "text-og-text"}`}>
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
            <p className="text-sm text-gray-400">{t("noPolyModel")}</p>
          )}

          {/* Conditions & Notes */}
          {(selectedCal.temperature != null || selectedCal.humidity != null || selectedCal.pressure != null || selectedCal.notes || calLocation) && (
            <div className="rounded-xl border border-og-border bg-og-surface-alt p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("conditionsAndNotes")}</p>
              {calLocation && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("calibrationLab")}</p>
                  <Link
                    href={`/sites?id=${calLocation.id}`}
                    className="text-xs text-og-accent hover:underline inline-flex items-center gap-1"
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
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("temperature")}</p>
                      <p className="font-mono text-xs text-og-text">
                        {fmtNum(selectedCal.temperature, 2)}
                        {selectedCal.temperature_uncertainty != null && ` ± ${fmtNum(selectedCal.temperature_uncertainty, 2)}`}
                        {" "}<span className="text-gray-400">°C</span>
                      </p>
                    </div>
                  )}
                  {selectedCal.humidity != null && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("humidity")}</p>
                      <p className="font-mono text-xs text-og-text">
                        {fmtNum(selectedCal.humidity, 2)}
                        {selectedCal.humidity_uncertainty != null && ` ± ${fmtNum(selectedCal.humidity_uncertainty, 2)}`}
                        {" "}<span className="text-gray-400">%RH</span>
                      </p>
                    </div>
                  )}
                  {selectedCal.pressure != null && (
                    <div>
                      <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("pressure")}</p>
                      <p className="font-mono text-xs text-og-text">
                        {fmtNum(selectedCal.pressure, 2)}
                        {selectedCal.pressure_uncertainty != null && ` ± ${fmtNum(selectedCal.pressure_uncertainty, 2)}`}
                        {" "}<span className="text-gray-400">Pa</span>
                      </p>
                    </div>
                  )}
                </div>
              )}
              {selectedCal.notes && (
                <div>
                  <p className="text-[10px] text-gray-400 uppercase tracking-wider mb-0.5">{t("notes")}</p>
                  <p className="text-xs text-og-text leading-relaxed">{selectedCal.notes}</p>
                </div>
              )}
            </div>
          )}

          {/* Frequency Response */}
          {selectedCal.has_frequency_response && (
            <div className="rounded-xl border border-og-border bg-og-surface-alt p-4 space-y-3">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">{t("frequencyResponse")}</p>
              {loadingFreqPoints ? (
                <div className="flex items-center justify-center text-gray-400 gap-2 text-xs py-10">
                  <span className="w-4 h-4 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
                  {t("loadingData")}
                </div>
              ) : (
                <div className="grid grid-cols-2 gap-4">
                  <FrequencyResponseChart
                    points={freqPoints}
                    frequencyUnit={selectedCal.frequency_response_frequency_unit ?? ""}
                    amplitudeActive={selectedCal.frequency_response_amplitude_type != null}
                    amplitudeType={selectedCal.frequency_response_amplitude_type}
                    amplitudeUnit={selectedCal.frequency_response_amplitude_unit}
                    phaseActive={selectedCal.frequency_response_phase_unit != null}
                    phaseUnit={selectedCal.frequency_response_phase_unit}
                    height={300}
                  />
                  <div className="rounded-lg border border-og-border overflow-hidden" style={{ maxHeight: 300, overflowY: "auto" }}>
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 z-10">
                        <tr className="border-b border-og-border bg-og-surface-alt">
                          <th className="text-left px-3 py-2 text-gray-400 font-medium">#</th>
                          <th className="text-left px-3 py-2 text-gray-400 font-medium">
                            {t("frequency")} ({selectedCal.frequency_response_frequency_unit})
                          </th>
                          {selectedCal.frequency_response_amplitude_type != null && (
                            <th className="text-left px-3 py-2 text-gray-400 font-medium">
                              {t("amplitude")} ({selectedCal.frequency_response_amplitude_type === "dB"
                                ? "dB" : selectedCal.frequency_response_amplitude_unit})
                            </th>
                          )}
                          {selectedCal.frequency_response_phase_unit != null && (
                            <th className="text-left px-3 py-2 text-gray-400 font-medium">
                              {t("phase")} ({selectedCal.frequency_response_phase_unit})
                            </th>
                          )}
                        </tr>
                      </thead>
                      <tbody>
                        {freqPoints.map((p) => (
                          <tr key={p.id} className="border-b border-og-border last:border-b-0 hover:bg-og-surface-alt/50 transition-colors">
                            <td className="px-3 py-1.5 font-mono text-gray-400">{p.sweep_index + 1}</td>
                            <td className="px-3 py-1.5 font-mono text-og-text">{fmtNum(p.frequency_value)}</td>
                            {selectedCal.frequency_response_amplitude_type != null && (
                              <td className="px-3 py-1.5 font-mono text-og-text">{fmtNum(p.amplitude_value)}</td>
                            )}
                            {selectedCal.frequency_response_phase_unit != null && (
                              <td className="px-3 py-1.5 font-mono text-og-text">{fmtNum(p.phase_value)}</td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="bg-og-surface border border-og-border rounded-xl p-6">
          <p className="text-sm text-gray-400">{hasChannelTabs ? t("noCalibrationsChannel") : t("noCalibrations")}</p>
        </div>
      )}
      </div>

      {/* Calibration history — right-side navigator */}
      <div className="w-80 shrink-0 flex flex-col bg-og-surface border border-og-border rounded-xl">
        <div className="p-3 border-b border-og-border space-y-2">
          <div className="flex items-center justify-between gap-2">
            {hasChannelTabs ? (
              <select
                value={activeChannelId ?? ""}
                onChange={(e) => setActiveChannelId(e.target.value || null)}
                className="flex-1 min-w-0 px-2 py-1.5 rounded-lg border border-og-border-md bg-og-surface text-xs text-og-text focus:outline-hidden focus:ring-1 focus:border-og-accent focus:ring-og-accent/20"
              >
                {channelIdsWithCals.map((chId) => {
                  const ch = profile.sensor_channels.find((c) => c.id === chId);
                  const label = ch ? `${ch.channel_id} — ${ch.physical_quantity}` : chId;
                  return <option key={chId} value={chId}>{label}</option>;
                })}
              </select>
            ) : (
              <p className="text-xs font-semibold text-og-text">{t("calibrationHistory")}</p>
            )}
            {canRegisterCalibration && (
              <label className="flex items-center gap-1.5 text-[10px] text-gray-400 cursor-pointer shrink-0">
                <ToggleSwitch checked={showVoided} onChange={setShowVoided} size="sm" />
                {t("showValidOnly")}
              </label>
            )}
          </div>
          {canRegisterCalibration && (
            <button
              type="button"
              onClick={() => guardBeforeLeavingEdit(() => setWizardOpen(true))}
              className="flex items-center justify-center gap-1.5 w-full px-3 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors"
            >
              <PlusIcon size={12} />
              {t("addCalibration")}
            </button>
          )}
        </div>
        <div className="flex-1 overflow-y-auto divide-y divide-og-border">
          {filteredCals.length === 0 && (
            <p className="text-xs text-gray-400 text-center py-8 px-4">
              {hasChannelTabs ? t("noCalibrationsChannel") : t("noCalibrations")}
            </p>
          )}
            {filteredCals.map((cal) => {
              const isSelected = cal.id === (selectedCal?.id ?? null);
              const isVoided = !cal.is_active;
              return (
                <div
                  key={cal.id}
                  className={`flex items-start gap-2 px-3 py-2.5 transition-colors
                    ${isVoided ? "opacity-60" : ""}
                    ${isSelected ? "bg-og-surface-alt" : "hover:bg-og-surface-alt/50"}`}
                >
                  {/* Clickable row content */}
                  <button
                    type="button"
                    onClick={() => setSelectedCalId(cal.id)}
                    className="flex items-start gap-2 flex-1 min-w-0 text-left"
                  >
                    <div className={`shrink-0 w-6 h-6 rounded-full border-2 flex items-center justify-center mt-0.5
                      ${isSelected ? "border-og-accent text-og-accent" : "border-og-border bg-og-surface-alt text-gray-400"}`}>
                      <span className="text-[9px] font-bold">v{cal.calibration_version}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="text-xs font-medium text-og-text">{fmtDate(cal.calibration_date)}</span>
                        {cal.status === "void" && (
                          <span
                            className="inline-flex items-center px-1 py-0.5 rounded-sm text-[9px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                            title={cal.void_reason ?? undefined}
                          >
                            {t("voided")}
                          </span>
                        )}
                        {cal.status === "pending_approval" && (
                          <span className="inline-flex items-center px-1 py-0.5 rounded-sm text-[9px] font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                            {t("statusPendingApproval")}
                          </span>
                        )}
                        {cal.status === "rejected" && (
                          <span
                            className="inline-flex items-center px-1 py-0.5 rounded-sm text-[9px] font-medium bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                            title={cal.decision_reason ?? undefined}
                          >
                            {t("statusRejected")}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400 mt-0.5 truncate">
                        {t("by", { name: cal.performed_by_name })}
                      </p>
                      {cal.due_date && (
                        <p className="text-[10px] text-gray-400">{t("due")}: {fmtDate(cal.due_date)}</p>
                      )}
                      {cal.status === "void" && cal.void_reason && (
                        <p className="text-[10px] text-red-500 mt-0.5 italic truncate">{t("reason", { reason: cal.void_reason })}</p>
                      )}
                      {cal.status === "rejected" && cal.decision_reason && (
                        <p className="text-[10px] text-red-500 mt-0.5 italic truncate">{t("reason", { reason: cal.decision_reason })}</p>
                      )}
                    </div>
                  </button>

                  {/* Admin void / restore */}
                  {isAdmin && (
                    isVoided ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); handleRestoreCal(cal.id); }}
                        disabled={restoringCalId === cal.id}
                        title={t("restoreCalibration")}
                        className="shrink-0 self-center p-1 text-gray-300 hover:text-emerald-500 transition-colors rounded-sm disabled:opacity-50"
                      >
                        <RestoreIcon size={13} />
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirmId(cal.id); }}
                        title={t("voidCalibration")}
                        className="shrink-0 self-center p-1 text-gray-300 hover:text-red-500 transition-colors rounded-sm"
                      >
                        <TrashIcon size={13} />
                      </button>
                    )
                  )}
                </div>
              );
            })}
        </div>
      </div>
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Certificate download split button — main button downloads with the
// currently selected template (the org/global default unless the dropdown
// picked a specific one); the chevron opens the template picker.
// ---------------------------------------------------------------------------

function CertificateDownloadButton({
  calibrationId, assetTag, calibrationVersion, disabled,
}: {
  calibrationId: string;
  assetTag: string;
  calibrationVersion: number;
  disabled: boolean;
}) {
  const t = useTranslations("assets.calibration");
  const [templates, setTemplates] = useState<CertificateTemplateOption[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setSelectedTemplateId(null);
    listCalibrationCertificateTemplates(calibrationId).then(setTemplates).catch(() => setTemplates([]));
  }, [calibrationId]);

  useEffect(() => {
    if (!menuOpen) return;
    function onClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [menuOpen]);

  async function handleDownload() {
    setDownloading(true);
    try {
      if (selectedTemplateId) {
        const blob = await downloadCalibrationCertificateBlob(calibrationId, selectedTemplateId);
        const blobUrl = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = blobUrl;
        a.download = `certificate_${assetTag}_v${calibrationVersion}.pdf`;
        a.click();
        URL.revokeObjectURL(blobUrl);
      } else {
        const { url, filename } = await getCalibrationCertificateUrl(calibrationId);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        a.click();
      }
    } catch {
      alert(t("certNotAvailable"));
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div ref={menuRef} className="relative flex items-stretch shrink-0">
      <button
        type="button"
        disabled={disabled || downloading}
        onClick={handleDownload}
        title={selectedTemplateId ? t("downloadUsing", { template: templates.find((tpl) => tpl.id === selectedTemplateId)?.name ?? t("selectedTemplate") }) : t("downloadUsingDefault")}
        className="flex items-center gap-1.5 pl-3 pr-2.5 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-l-lg hover:bg-og-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {downloading ? (
          <span className="inline-block w-3 h-3 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
        ) : (
          <DownloadIcon size={12} />
        )}
        {downloading ? t("generating") : t("downloadCertificate")}
      </button>
      <button
        type="button"
        disabled={disabled || downloading}
        onClick={() => setMenuOpen((v) => !v)}
        title={t("chooseTemplate")}
        className="flex items-center px-1.5 py-1.5 text-gray-600 dark:text-gray-300 border border-l-0 border-og-border-md rounded-r-lg hover:bg-og-surface-alt transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        <ChevronDownIcon size={12} />
      </button>
      {menuOpen && (
        <div className="absolute right-0 top-full mt-1 z-20 w-56 bg-og-surface border border-og-border rounded-lg shadow-lg py-1">
          <button
            type="button"
            onClick={() => { setSelectedTemplateId(null); setMenuOpen(false); }}
            className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left text-og-text hover:bg-og-surface-alt transition-colors"
          >
            {t("defaultTemplate")}
            {selectedTemplateId === null && <CheckIcon size={12} className="text-og-accent shrink-0" />}
          </button>
          {templates.length > 0 && <div className="my-1 border-t border-og-border" />}
          {templates.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => { setSelectedTemplateId(tpl.id); setMenuOpen(false); }}
              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-xs text-left text-og-text hover:bg-og-surface-alt transition-colors"
            >
              <span className="truncate">{tpl.name}</span>
              {selectedTemplateId === tpl.id && <CheckIcon size={12} className="text-og-accent shrink-0" />}
            </button>
          ))}
          {templates.length === 0 && (
            <p className="px-3 py-1.5 text-xs text-gray-400">{t("noCustomTemplates")}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Files tab
// ---------------------------------------------------------------------------

const CALIBRATION_CERTIFICATE_ENTITY_TYPES = new Set(["calibration_certificate", "calibration_uploaded_certificate"]);

function FilesTab({
  files,
  isEditing,
  assetId,
  calibrations,
  onFilesChange,
}: {
  files: StoredFile[];
  isEditing: boolean;
  assetId: string;
  calibrations: CalibrationRecord[];
  onFilesChange: (files: StoredFile[]) => void;
}) {
  const t = useTranslations("assets.files");
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
      setUploadError(e instanceof Error ? e.message : t("errorUpload"));
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

  const typeLabel: Record<string, string> = { pdf: t("typePdf"), csv: t("typeCsv"), zip: t("typeArchive"), doc: t("typeFile") };

  return (
    <div className="bg-og-surface border border-og-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-og-text mb-4">{t("title")}</h3>

      {/* Drop zone — only shown in edit mode */}
      {isEditing && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`mb-4 border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 transition-colors cursor-pointer
            ${isDragging
              ? "border-og-accent bg-og-accent/5"
              : "border-og-border hover:border-og-accent/50 hover:bg-og-surface-alt"}`}
          onClick={() => fileInputRef.current?.click()}
        >
          <UploadCloudIcon size={24} className={isDragging ? "text-og-accent" : "text-gray-400"} />
          <p className="text-sm text-gray-500">
            {uploading ? t("uploading") : t("dropHint")}
          </p>
          <p className="text-xs text-gray-400">{t("supportedTypes")}</p>
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
          <p className="text-sm">{isEditing ? t("noFilesEdit") : t("noFilesView")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {files.map((f) => {
            const isImage = f.content_type.startsWith("image/");
            const type = fileIcon(f.content_type);
            const isCalCert = CALIBRATION_CERTIFICATE_ENTITY_TYPES.has(f.entity_type);
            const certCal = isCalCert ? calibrations.find((c) => c.id === f.entity_id) : undefined;
            return (
              <div key={f.id} className="flex items-center gap-3 p-3 rounded-lg border border-og-border hover:border-og-border-md hover:bg-og-surface-alt transition-colors">
                {/* Thumbnail or type badge */}
                {isImage && f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={f.url}
                    alt={f.original_filename}
                    className="w-9 h-9 rounded-lg object-cover shrink-0 border border-og-border"
                  />
                ) : type === "pdf" && f.url ? (
                  <PdfThumbnail
                    fetchPdf={() => fetch(f.url!).then((r) => r.blob())}
                    title={f.original_filename}
                  />
                ) : (
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 text-[10px] font-bold
                    ${type === "csv" ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30" :
                      type === "zip" ? "bg-amber-50 text-amber-600 dark:bg-amber-950/30" :
                      "bg-og-surface-alt text-gray-400"}`}>
                    {typeLabel[type]}
                  </div>
                )}

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-og-text truncate">{f.original_filename}</p>
                  <div className="flex items-center gap-2">
                    <p className="text-xs text-gray-400">{fmtBytes(f.size_bytes)}</p>
                    {isCalCert && (
                      <span className="px-1.5 py-0.5 rounded-sm text-[10px] font-medium bg-og-accent/10 text-og-accent">
                        {t("calibrationCertificateBadge", { version: certCal?.calibration_version ?? "?" })}
                      </span>
                    )}
                  </div>
                </div>

                {f.url && (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded-sm hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors shrink-0"
                    title={t("download")}
                  >
                    <DownloadIcon size={14} />
                  </a>
                )}

                {isEditing && !isCalCert && (
                  <button
                    type="button"
                    onClick={() => handleDelete(f.id)}
                    className="p-1.5 rounded-sm hover:bg-red-50 dark:hover:bg-red-950/30 text-gray-400 hover:text-red-500 transition-colors shrink-0"
                    title={t("removeFile")}
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
  const t = useTranslations("assets.activity");
  const actionLabel = useActionLabel();
  return (
    <div className="bg-og-surface border border-og-border rounded-xl p-6">
      <h3 className="text-sm font-semibold text-og-text mb-4">{t("title")}</h3>
      {logs.length === 0 ? (
        <p className="text-sm text-gray-400 py-4">{t("empty")}</p>
      ) : (
        <div className="divide-y divide-og-border">
          {logs.map((log) => {
            const d = new Date(log.created_at);
            const dateStr = d.toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
            const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
            return (
              <div key={log.id} className="grid grid-cols-[7rem_12rem_1fr] items-start gap-4 py-2.5 text-xs">
                <span className="font-mono text-gray-400">{dateStr} {timeStr}</span>
                <UserMention
                  actorId={log.actor_id}
                  actorEmail={log.actor_email}
                  actorName={log.actor_name}
                  actorRole={log.actor_role}
                  actorProfilePictureUrl={log.actor_profile_picture_url}
                  className="text-xs"
                />
                <div>
                  <span className="font-medium text-og-text">{actionLabel(log.action)}</span>
                  <ActivityDiff
                    before={log.before_state as Record<string, unknown> | null}
                    after={log.after_state as Record<string, unknown> | null}
                    entityType={log.entity_type}
                    variant="full"
                    className="mt-1"
                  />
                </div>
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

const TABS: Tab[] = ["overview", "health", "calibration", "files", "activity"];

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
  const t = useTranslations("assets.detail");
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
    <div className="bg-og-surface border border-og-border rounded-xl p-4">
      <div className="flex items-stretch gap-3">
        {/* Dates — left column */}
        <div className="w-2/3 space-y-1.5 flex flex-col items-center text-center">
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">{t("last")}</p>
            <p className="text-sm font-semibold font-mono text-og-text tabular-nums">{fmtDate(lastCal)}</p>
          </div>
          <div>
            <p className="text-[10px] text-gray-400 uppercase tracking-wide leading-none mb-0.5">{t("due")}</p>
            <p className="text-sm font-semibold font-mono text-og-text tabular-nums">{fmtDate(dueAt)}</p>
          </div>
        </div>
        {/* 270° arc ring — right column, centered */}
        <div className="w-1/3 flex items-center justify-center">
          <div className="relative" style={{ width: SIZE, height: SIZE }}>
            <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ display: "block" }}>
              <path d={trackPath} fill="none" stroke="var(--og-border-md, #d1d5db)" strokeWidth={7} strokeLinecap="round" />
              {progressSweep > 0 && (
                <path d={arcPath(progressSweep)} fill="none" stroke={ringColor} strokeWidth={7} strokeLinecap="round" />
              )}
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ paddingBottom: "10px" }}>
              <span className="text-l font-bold tabular-nums leading-none" style={{ color: ringColor }}>
                {days !== null ? String(days) : "—"}
              </span>
              <span className="text-xs text-gray-400 mt-0.5 leading-none">{t("days")}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sticker modal — shows 1×0.5, 2×2, and 4×2 label previews with download buttons
// ---------------------------------------------------------------------------
type StickerSize = "1x0.5" | "2x2" | "4x2";

function StickerModal({ assetId, assetTag, onClose }: { assetId: string; assetTag: string; onClose: () => void }) {
  const t = useTranslations("assets.sticker");
  const [preview1, setPreview1] = useState<string | null>(null);
  const [preview2, setPreview2] = useState<string | null>(null);
  const [preview4, setPreview4] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);
  const backdropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchAssetLabelBlob(assetId, "1x0.5", "png"),
      fetchAssetLabelBlob(assetId, "2x2", "png"),
      fetchAssetLabelBlob(assetId, "4x2", "png"),
    ])
      .then(([b1, b2, b4]) => {
        if (cancelled) return;
        setPreview1(URL.createObjectURL(b1));
        setPreview2(URL.createObjectURL(b2));
        setPreview4(URL.createObjectURL(b4));
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [assetId]);

  async function download(size: StickerSize, fmt: "png" | "jpg" | "pdf") {
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
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xl w-full max-w-xl mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border">
          <h2 className="text-sm font-semibold text-og-text">{t("title", { assetTag })}</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-sm hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors">
            <XIcon size={15} />
          </button>
        </div>
        <div className="p-5 space-y-5">
          <StickerRow size="1x0.5" label={t("size1")} preview={preview1} aspect="w-28 h-14" loading={loading} downloading={downloading} onDownload={download} />
          <div className="border-t border-og-border" />
          <StickerRow size="2x2" label={t("size2")} preview={preview2} aspect="w-28 h-28" loading={loading} downloading={downloading} onDownload={download} />
          <div className="border-t border-og-border" />
          <StickerRow size="4x2" label={t("size4")} preview={preview4} aspect="w-56 h-28" loading={loading} downloading={downloading} onDownload={download} />
        </div>
      </div>
    </div>
  );
}

function StickerRow({
  size, label, preview, aspect, loading, downloading, onDownload,
}: {
  size: StickerSize; label: string; preview: string | null; aspect: string;
  loading: boolean; downloading: string | null; onDownload: (size: StickerSize, fmt: "png" | "jpg" | "pdf") => void;
}) {
  const t = useTranslations("assets.sticker");
  return (
    <div className="flex items-center gap-4">
      <div className={`shrink-0 bg-og-surface-alt rounded-lg border border-og-border overflow-hidden flex items-center justify-center ${aspect}`}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={t("stickerAlt", { label })} className="w-full h-full object-contain" />
        ) : loading ? (
          <span className="w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />
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
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-40"
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

export default function AssetDetailClient() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter();
  const t = useTranslations("assets.detail");
  const tHealthLabel = useTranslations("tokens.healthLabel");
  const tStability = useTranslations("tokens.stability");
  const coeffDesc = useCoeffDesc();
  const { user } = useAuth();
  const isAdmin = user.role === "superadmin" || user.role === "admin";
  const canEdit = user.role !== "viewer";

  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [deepLinkCalId, setDeepLinkCalId] = useState<string | null>(null);
  // A checker-assigned/decision notification links here with ?cal=<id> —
  // switch straight to the Calibration tab; CalibrationTab itself reads
  // deepLinkCalId to select the row and reveal it if hidden by default.
  useEffect(() => {
    const calId = new URLSearchParams(window.location.search).get("cal");
    if (calId) {
      setDeepLinkCalId(calId);
      setActiveTab("calibration");
    }
  }, []);
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
  const [myOrgs, setMyOrgs] = useState<OrganizationListItem[]>([]);
  const [retireModalOpen, setRetireModalOpen] = useState(false);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [exporting, setExporting] = useState(false);

  // Asset picture
  const [pictureUploading, setPictureUploading] = useState(false);

  // Unsaved-changes guard: snapshot the form at edit-start so any action that
  // would otherwise discard in-progress edits (e.g. opening the calibration
  // wizard) can offer to save first instead of silently losing them.
  const originalFormRef = useRef<EditFormState | null>(null);
  const pendingActionRef = useRef<(() => void) | null>(null);
  const [guardOpen, setGuardOpen] = useState(false);

  function isFormDirty(): boolean {
    return isEditing && editForm != null &&
      JSON.stringify(editForm) !== JSON.stringify(originalFormRef.current);
  }

  function guardBeforeLeavingEdit(action: () => void) {
    if (isFormDirty()) {
      pendingActionRef.current = action;
      setGuardOpen(true);
    } else {
      action();
    }
  }

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
    const initial = profileToForm(profile);
    setEditForm(initial);
    originalFormRef.current = initial;
    setEditErrors({});
    setSaveError(null);
    setIsEditing(true);
    listLocations().then(setLocations).catch(() => {});
    listMyOrganizations().then(setMyOrgs).catch(() => {});
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
      setSaveError(e instanceof Error ? e.message : t("errorRetireAsset"));
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
      setEditErrors(validateForm(form, t));
    }
  }

  async function handleSave() {
    if (!profile || !editForm) return;
    const errors = validateForm(editForm, t);
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
      setSaveError(e instanceof Error ? e.message : t("errorSaveChanges"));
    } finally {
      setIsSaving(false);
    }
  }

  async function handleExportAsset() {
    if (!profile) return;
    setExporting(true);
    try {
      const blob = await fetchAssetExportBlob(profile.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${profile.asset_id}.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("errorExportAsset"));
    } finally {
      setExporting(false);
    }
  }

  async function handlePictureChange(file: File) {
    if (!profile) return;
    setPictureUploading(true);
    setSaveError(null);
    try {
      const updated = await uploadAssetPicture(profile.id, file);
      setProfile(updated);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("errorUploadPicture"));
    } finally {
      setPictureUploading(false);
    }
  }

  async function handlePictureRemove() {
    if (!profile) return;
    setPictureUploading(true);
    setSaveError(null);
    try {
      const updated = await deleteAssetPicture(profile.id);
      setProfile(updated);
    } catch (err: unknown) {
      setSaveError(err instanceof Error ? err.message : t("errorRemovePicture"));
    } finally {
      setPictureUploading(false);
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
        <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
        {t("loadingAsset")}
      </div>
    );
  }

  if (error || !profile) {
    return (
      <div className="p-6">
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-5 py-4 text-sm text-red-600 dark:text-red-400">
          {error ?? t("assetNotFound")}
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

      {guardOpen && (
        <ConfirmModal
          title={t("unsavedChangesTitle")}
          message={t("unsavedChangesMessage")}
          confirmLabel={t("saveAndContinue")}
          cancelLabel={t("discardAndContinue")}
          onConfirm={async () => { await handleSave(); }}
          onClose={() => {
            // Fires both after a successful onConfirm (Save) and on a raw Cancel
            // click — handleSave() already sets isEditing=false when it succeeds,
            // so only discard here if we're still mid-edit (i.e. Cancel was clicked
            // directly, not routed through a successful save).
            setGuardOpen(false);
            const action = pendingActionRef.current;
            pendingActionRef.current = null;
            if (isEditing) handleCancelEdit();
            if (action) action();
          }}
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
            {profile.retired_reason ? t("retiredWithReason", { reason: profile.retired_reason }) : t("retiredNoReason")}
          </p>
        </div>
      )}

      {/* Back button */}
      <button
        type="button"
        onClick={() => router.back()}
        className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-og-text transition-colors"
      >
        <ChevronLeftIcon size={13} />
        {t("back")}
      </button>

      {/* Header card */}
      <div className="bg-og-surface border border-og-border rounded-xl p-6">
        <div className="flex items-start justify-between gap-4">
          {/* Picture */}
          <ImageUploadField
            imageUrl={profile.picture_url}
            alt={profile.name}
            editable={isEditing}
            uploading={pictureUploading}
            onUpload={handlePictureChange}
            onRemove={handlePictureRemove}
            size={80}
          >
            {profile.picture_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.picture_url} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full bg-og-surface-alt border border-og-border flex items-center justify-center">
                <ImageIcon size={28} className="text-gray-300" />
              </div>
            )}
          </ImageUploadField>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-og-text">
                {isEditing && editForm ? (editForm.name || profile.name) : profile.name}
              </h1>
              {profile.sensor_channels.some((ch) => ch.calibration_role === "reference") && (
                <Tooltip content={t("referenceStandard")}>
                  <ShieldCheckIcon size={16} className="text-og-accent shrink-0" />
                </Tooltip>
              )}
              <StatusBadge status={profile.calibration_status} />
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-400">
              <span className="font-mono text-xs text-og-accent">{profile.asset_id}</span>
              {(profile.site_name || profile.location_name) && (
                <span className="flex items-center gap-1">
                  <MapPinIcon size={12} className="text-og-accent" />
                  <span>
                    {profile.location_name}
                    {profile.site_name && profile.site_name !== profile.location_name ? ` · ${profile.site_name}` : ""}
                  </span>
                </span>
              )}
              <span>{profile.manufacturer} · {profile.model}</span>
            </div>
            {isEditing && (
              <p className="text-xs text-amber-500 mt-2 font-medium">● {t("editingUnsaved")}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing ? (
              <>
                {canEdit && (
                  <button type="button"
                    onClick={handleExportAsset}
                    disabled={exporting}
                    className="flex items-center gap-1.5 px-3 py-2 border border-og-border rounded-lg hover:bg-og-surface-alt text-gray-500 hover:text-og-text text-sm font-medium transition-colors disabled:opacity-50">
                    <ExportIcon size={15} />
                    {exporting ? t("exporting") : t("export")}
                  </button>
                )}
                <button type="button"
                  onClick={() => setStickerOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-2 border border-og-border rounded-lg hover:bg-og-surface-alt text-gray-500 hover:text-og-text text-sm font-medium transition-colors">
                  <QrCodeIcon size={15} />
                  {t("sticker")}
                </button>
                {profile.is_active && canEdit && (
                  <button
                    type="button"
                    onClick={handleStartEdit}
                    className="flex items-center gap-1.5 px-3 py-2 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <EditIcon size={14} />
                    {t("edit")}
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
                    className="flex items-center gap-1.5 px-3 py-2 border border-og-border-md text-sm font-medium rounded-lg hover:bg-og-surface-alt text-og-text transition-colors disabled:opacity-50"
                  >
                    <XIcon size={14} />
                    {t("cancel")}
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
                    {isSaving ? t("saving") : t("saveChanges")}
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => setRetireModalOpen(true)}
                  disabled={isSaving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:text-red-600 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  <WarningIcon size={13} />
                  {t("retireAsset")}
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
            {t("fixValidationErrors")}
          </div>
        )}
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Health panel */}
        <div className="bg-og-surface border border-og-border rounded-xl p-5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">{t("healthScore")}</p>
          {healthOverview ? (
            <div className="space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-2xl font-bold text-og-text tabular-nums">
                    {Math.round(healthOverview.health_score)}
                    <span className="text-sm text-gray-400 font-normal"> / 100</span>
                  </span>
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${HEALTH_LABEL_STYLE[healthOverview.health_label] ?? ""}`}>
                    {translateDynamic(tHealthLabel, healthOverview.health_label)}
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 rounded-full bg-og-border overflow-hidden">
                  {(() => {
                    const sc = healthOverview.health_score;
                    const barColor = sc >= 90 ? "#22c55e" : sc >= 75 ? COLORS.accent : sc >= 50 ? "#f59e0b" : "#ef4444";
                    return <div className="h-full rounded-full transition-all" style={{ width: `${sc}%`, backgroundColor: barColor }} />;
                  })()}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] text-gray-400 uppercase tracking-wide w-16 shrink-0">{t("stability")}</span>
                <span className={`inline-flex px-2 py-0.5 rounded-full text-[11px] font-semibold border ${STABILITY_STYLE[healthOverview.stability] ?? ""}`}>
                  {translateDynamic(tStability, healthOverview.stability)}
                </span>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-2xl font-bold text-og-text">{Math.round(profile.calibration_health_score ?? profile.health_score)}%</p>
              <div className="mt-2 h-1.5 rounded-full bg-og-border overflow-hidden">
                <div className="h-full rounded-full bg-og-accent transition-all" style={{ width: `${profile.calibration_health_score ?? profile.health_score}%` }} />
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
        <div className="bg-og-surface border border-og-border rounded-xl p-5">
          <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-3">{t("calibrations")}</p>
          <div className="flex gap-4">
            <div className="flex flex-col">
              <p className="text-2xl font-bold text-og-text tabular-nums">{profile.calibration_count}</p>
              <p className="text-xs text-gray-400 mt-1">{t("allTime")}</p>
            </div>
            {calibrations[0]?.poly_coefficients && calibrations[0].poly_coefficients.length > 0 && (
              <div className="flex-1 min-w-0 border-l border-og-border pl-4">
                <p className="text-[10px] text-gray-400 uppercase tracking-wide mb-1.5">{t("latestCoefficients")}</p>
                <table className="w-full text-xs">
                  <tbody>
                    {calibrations[0].poly_coefficients
                      .map((v, i) => ({ exp: calibrations[0].poly_order! - i, val: v }))
                      .reverse()
                      .map(({ exp, val }) => (
                        <tr key={exp} className="border-b border-og-border last:border-b-0">
                          <td className="py-0.5 pr-2 text-gray-400 whitespace-nowrap">
                            {coeffDesc[exp] ?? t("orderNTerm", { exp })}
                          </td>
                          <td className="py-0.5 text-og-text font-mono tabular-nums text-right whitespace-nowrap">
                            {fmtNum(val)}
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
      <div className="bg-og-surface border border-og-border rounded-xl">
        <div className="flex border-b border-og-border px-1">
          {TABS.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-5 py-3.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
                activeTab === tab
                  ? "border-og-accent text-og-accent"
                  : "border-transparent text-gray-400 hover:text-og-text"
              }`}
            >
              {t(`tabs.${tab}`)}
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
              myOrgs={myOrgs}
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
              currentUserId={user.id}
              canRegisterCalibration={user.role !== "viewer"}
              deepLinkCalId={deepLinkCalId}
              guardBeforeLeavingEdit={guardBeforeLeavingEdit}
            />
          )}
          {activeTab === "files" && (
            <FilesTab
              files={files}
              isEditing={isEditing}
              assetId={id}
              calibrations={calibrations}
              onFilesChange={setFiles}
            />
          )}
          {activeTab === "activity" && <ActivityTab logs={auditLogs} />}
        </div>
      </div>
    </div>
  );
}
