"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getAssetAuditLogs,
  getAssetCalibrations,
  getAssetCertificates,
  getAssetFiles,
  getAssetProfile,
  getCalibrationCoefficients,
} from "@/services/asset.service";
import type { AssetProfile } from "@/types/asset";
import type { CalibrationRecord, CalibrationCoefficient } from "@/types/calibration";
import type { AuditLogEntry } from "@/types/audit_log";
import type { StoredFile } from "@/types/stored_file";
import {
  CALIBRATION_STATUS_LABEL,
  CALIBRATION_STATUS_STYLE,
  SUBTYPE_LABEL,
} from "@/lib/tokens";
import {
  ChevronLeftIcon,
  DownloadIcon,
  EditIcon,
  MapPinIcon,
  QrCodeIcon,
  ShareIcon,
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
// Spec row
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
// Overview tab
// ---------------------------------------------------------------------------

function OverviewTab({ profile }: { profile: AssetProfile }) {
  const ch = profile.sensor_channels[0];
  const daq = profile.daq_details;

  const measurementRange = ch
    ? `${ch.measurement_min ?? "—"} – ${ch.measurement_max ?? "—"} ${ch.unit}`
    : null;

  const accuracyStr = ch?.accuracy_value != null
    ? `±${ch.accuracy_value}${ch.accuracy_unit ? " " + ch.accuracy_unit : ""}${ch.accuracy_type ? " (" + ch.accuracy_type + ")" : ""}`
    : null;

  const outputSignal = ch?.output_signal_min != null
    ? `${ch.output_signal_min}–${ch.output_signal_max} ${ch.output_signal_unit ?? ""}${ch.output_type ? " / " + ch.output_type : ""}`.trim()
    : null;

  const operatingTemp =
    profile.operating_temperature_min != null || profile.operating_temperature_max != null
      ? `${profile.operating_temperature_min ?? "—"} to ${profile.operating_temperature_max ?? "—"} °C`
      : null;

  const samplingRate = daq?.sampling_rate_hz != null ? `${daq.sampling_rate_hz.toLocaleString()} Hz` : null;
  const adcBits = daq?.adc_resolution_bits != null ? `${daq.adc_resolution_bits}-bit` : null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
      {/* Technical specs */}
      <div className="lg:col-span-2 bg-mar-surface border border-mar-border rounded-xl p-6">
        <h3 className="text-sm font-semibold text-mar-text mb-1">Technical specifications</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8">
          {profile.asset_type === "sensor" && (
            <>
              <SpecRow label="Sensor type" value={ch ? (SUBTYPE_LABEL[ch.physical_quantity] ?? ch.physical_quantity) : null} />
              <SpecRow label="Manufacturer" value={profile.manufacturer} />
              <SpecRow label="Model" value={profile.model} />
              <SpecRow label="Serial number" value={profile.serial_number} />
              <SpecRow label="Technology" value={ch?.technology} />
              <SpecRow label="Measurement range" value={measurementRange} />
              <SpecRow label="Accuracy class" value={accuracyStr} />
              <SpecRow label="Output signal" value={outputSignal} />
              <SpecRow label="Ingress protection" value={profile.ip_rating} accent />
              <SpecRow label="Hazardous area" value={profile.hazardous_area_rating} />
              <SpecRow label="Operating temperature" value={operatingTemp} />
              <SpecRow label="Power supply" value={profile.power_supply} />
              {profile.power_consumption_w != null && (
                <SpecRow label="Power consumption" value={`${profile.power_consumption_w} W`} />
              )}
              <SpecRow label="Firmware" value={profile.firmware_version} />
              <SpecRow label="Mounting" value={profile.mounting_type} />
              <SpecRow label="Connection" value={profile.connection_type} />
              <SpecRow label="Dimensions" value={profile.dimensions} />
              {profile.weight_kg != null && (
                <SpecRow label="Weight" value={`${profile.weight_kg} kg`} />
              )}
              <SpecRow label="Notes" value={profile.notes} />
            </>
          )}
          {profile.asset_type === "daq" && daq && (
            <>
              <SpecRow label="Type" value={daq.daq_type} />
              <SpecRow label="Manufacturer" value={profile.manufacturer} />
              <SpecRow label="Model" value={profile.model} />
              <SpecRow label="Serial number" value={profile.serial_number} />
              <SpecRow label="Input channels" value={String(daq.input_channels)} />
              <SpecRow label="Output channels" value={String(daq.output_channels)} />
              <SpecRow label="Input signal types" value={daq.input_signal_types} />
              <SpecRow label="Output signal types" value={daq.output_signal_types} />
              <SpecRow label="Sampling rate" value={samplingRate} />
              <SpecRow label="ADC resolution" value={adcBits} />
              <SpecRow label="ADC type" value={daq.adc_type} />
              {daq.input_voltage_range_min != null && daq.input_voltage_range_max != null && (
                <SpecRow label="Input voltage range" value={`${daq.input_voltage_range_min} – ${daq.input_voltage_range_max} V`} />
              )}
              <SpecRow label="Communication" value={daq.communication_protocol} />
              <SpecRow label="Interface" value={daq.interface_type} accent />
              <SpecRow label="Synchronization" value={daq.synchronization_supported ? "Supported" : null} />
              <SpecRow label="Power supply" value={profile.power_supply} />
              <SpecRow label="Ingress protection" value={profile.ip_rating} />
              <SpecRow label="Firmware" value={profile.firmware_version} />
              <SpecRow label="Notes" value={profile.notes} />
            </>
          )}
        </div>
      </div>

      {/* Installation */}
      <div className="bg-mar-surface border border-mar-border rounded-xl p-6 h-fit">
        <h3 className="text-sm font-semibold text-mar-text mb-1">Installation</h3>
        <div className="divide-y divide-mar-border">
          <SpecRow label="Site" value={profile.site_name} />
          <SpecRow label="Location" value={profile.location_name} />
          <SpecRow label="Commissioned" value={fmtDate(profile.purchase_date)} />
          <SpecRow label="Owner" value={profile.owner_name} />
          {profile.warranty_expiry_date && (
            <SpecRow label="Warranty expires" value={fmtDate(profile.warranty_expiry_date)} />
          )}
          {profile.price_eur != null && (
            <SpecRow label="Purchase price" value={`€${profile.price_eur.toLocaleString()}`} />
          )}
          <SpecRow label="Version" value={`v${profile.version}`} />
        </div>
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
  const unitOut = coeff.unit_output ?? "";
  const unitIn = coeff.unit_input ?? "x";

  let formula = "";
  if (coeff.coefficient_type === "linear") {
    const a1 = fmtNum(coeff.gain);
    const b = fmtNum(coeff.offset_value);
    formula = `y = ${a1}·${unitIn} + ${b}`;
  } else if (coeff.poly_coefficients && coeff.poly_coefficients.length > 0) {
    const terms = coeff.poly_coefficients
      .map((c, i) => {
        const val = fmtNum(c, 6);
        if (i === 0) return `${val}`;
        if (i === 1) return `${val}·${unitIn}`;
        return `${val}·${unitIn}^${i}`;
      })
      .reverse()
      .join(" + ");
    formula = `y = ${terms}`;
  }

  if (!formula) return null;

  return (
    <div className="mt-4 rounded-lg bg-mar-surface-alt border border-mar-border px-4 py-3 font-mono text-sm text-mar-text">
      {unitOut && <p className="text-xs text-gray-400 mb-1">Output unit: {unitOut}</p>}
      <p className="whitespace-pre-wrap break-all">{formula}</p>
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
  // Calibrations arrive sorted newest → oldest from the API (order_by date desc)
  const total = calibrations.length;
  const latest = calibrations[0];
  const latestCoeffs = latest ? (coeffsByCalId[latest.id] ?? []) : [];
  const latestCert = latest ? certs.find((c) => c.calibration_id === latest.id) : undefined;

  // Version numbers: newest = vN (total), oldest = v1
  function versionOf(idx: number) {
    return total - idx;
  }

  return (
    <div className="space-y-5">
      {/* Coefficients for latest calibration */}
      {latest ? (
        <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-sm font-semibold text-mar-text">Calibration coefficients</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                <span className="font-mono font-semibold text-mar-text">v{versionOf(0)}</span>
                {" · "}{fmtDate(latest.calibration_date)}
                {" · "}<span>by {latest.performed_by_name}</span>
              </p>
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-emerald-50 text-emerald-600 border border-emerald-100">
                ACTIVE
              </span>
              {latestCert && (
                <button type="button"
                  className="flex items-center gap-1.5 text-xs text-mar-accent border border-mar-border rounded-lg px-3 py-1.5 hover:bg-mar-surface-alt transition-colors">
                  <span className="text-mar-accent opacity-60">📄</span>
                  {latestCert.certificate_number}
                </button>
              )}
            </div>
          </div>

          {latestCoeffs.length > 0 ? (
            <>
              <div className="flex flex-wrap gap-3">
                {latestCoeffs.map((coeff) => {
                  if (coeff.coefficient_type === "linear") {
                    return (
                      <div key={coeff.id} className="flex gap-3 flex-wrap">
                        {coeff.offset_value != null && (
                          <CoeffCard label="Offset" sub="b" value={fmtNum(coeff.offset_value)} unit={coeff.unit_output ?? undefined} />
                        )}
                        {coeff.gain != null && (
                          <CoeffCard label="Gain" sub="a₁" value={fmtNum(coeff.gain)} />
                        )}
                      </div>
                    );
                  }
                  if (coeff.coefficient_type === "polynomial" && coeff.poly_coefficients) {
                    return (
                      <div key={coeff.id} className="flex gap-3 flex-wrap">
                        {coeff.poly_coefficients[0] != null && (
                          <CoeffCard label="Offset" sub="b" value={fmtNum(coeff.poly_coefficients[0])} unit={coeff.unit_output ?? undefined} />
                        )}
                        {coeff.poly_coefficients[1] != null && (
                          <CoeffCard label="Gain" sub="a₁" value={fmtNum(coeff.poly_coefficients[1])} />
                        )}
                        {coeff.poly_coefficients[2] != null && (
                          <CoeffCard label="Quadratic" sub="a₂" value={fmtNum(coeff.poly_coefficients[2])} unit={coeff.unit_output ? `${coeff.unit_output}⁻¹` : undefined} />
                        )}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
              {latestCoeffs[0] && <CalibrationFormula coeff={latestCoeffs[0]} />}
              {latestCoeffs[0]?.notes && (
                <p className="mt-3 text-xs text-gray-400">{latestCoeffs[0].notes}</p>
              )}
            </>
          ) : (
            <p className="text-sm text-gray-400">No coefficients recorded for this calibration.</p>
          )}
        </div>
      ) : (
        <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
          <p className="text-sm text-gray-400">No calibrations recorded for this asset.</p>
        </div>
      )}

      {/* Calibration history */}
      {calibrations.length > 0 && (
        <div className="bg-mar-surface border border-mar-border rounded-xl p-6">
          <h3 className="text-sm font-semibold text-mar-text mb-4">Calibration history</h3>
          <p className="text-xs text-gray-400 mb-3">Select an entry to view its details.</p>
          <div className="space-y-0 divide-y divide-mar-border">
            {calibrations.map((cal, idx) => {
              const isLatest = idx === 0;
              const coeffs = coeffsByCalId[cal.id] ?? [];
              const offsetVal = coeffs[0]?.offset_value;
              const certForCal = certs.find((c) => c.calibration_id === cal.id);

              return (
                <div key={cal.id}
                  className={`flex items-start gap-4 py-3 ${isLatest ? "opacity-100" : "opacity-80"}`}>
                  <div className="flex-shrink-0 w-8 h-8 rounded-full border-2 flex items-center justify-center mt-0.5
                    border-mar-border bg-mar-surface-alt text-mar-accent">
                    <span className="text-[10px] font-bold">v{versionOf(idx)}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium text-mar-text">{fmtDate(cal.calibration_date)}</span>
                      <CalibrationResultBadge result={cal.result} />
                      {certForCal && (
                        <span className="text-[10px] text-gray-400">{certForCal.certificate_number}</span>
                      )}
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">
                      by {cal.performed_by_name}
                      {cal.external_lab_name ? ` · ${cal.external_lab_name}` : ""}
                    </p>
                    {cal.notes && (
                      <p className="text-xs text-gray-500 mt-1 italic">{cal.notes}</p>
                    )}
                  </div>
                  {offsetVal != null && (
                    <div className="flex-shrink-0 text-right">
                      <span className="text-xs font-mono text-gray-400">
                        Δ offset {offsetVal >= 0 ? "+" : ""}{fmtNum(offsetVal)} {coeffs[0]?.unit_output ?? ""}
                      </span>
                    </div>
                  )}
                </div>
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
              <div key={f.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-mar-border hover:border-mar-border-md hover:bg-mar-surface-alt transition-colors">
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
                <button type="button"
                  className="p-1.5 rounded hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors flex-shrink-0">
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
        <div className="space-y-0 divide-y divide-mar-border">
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

        // Load coefficients for all calibrations in parallel
        if (calsData.length > 0) {
          const coeffResults = await Promise.all(
            calsData.map((cal) => getCalibrationCoefficients(cal.id))
          );
          const map: Record<string, CalibrationCoefficient[]> = {};
          calsData.forEach((cal, i) => { map[cal.id] = coeffResults[i]; });
          setCoeffsByCalId(map);
        }
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

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

  const subtypeLabel = profile.subtype ? (SUBTYPE_LABEL[profile.subtype] ?? profile.subtype) : null;

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-5">

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
              <h1 className="text-2xl font-bold text-mar-text">{profile.name}</h1>
              <StatusBadge status={profile.calibration_status} />
            </div>
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1.5 text-sm text-gray-400">
              <span className="font-mono text-xs text-mar-accent">{profile.asset_id}</span>
              {(profile.site_name || profile.location_name) && (
                <span className="flex items-center gap-1">
                  <MapPinIcon size={12} className="text-mar-accent" />
                  <span>
                    {profile.location_name}
                    {profile.site_name && profile.site_name !== profile.location_name
                      ? ` · ${profile.site_name}` : ""}
                  </span>
                </span>
              )}
              <span>{profile.manufacturer} · {profile.model}</span>
            </div>
            {/* Technology / subtype tags */}
            <div className="flex items-center gap-2 mt-2.5 flex-wrap">
              {profile.technology && (
                <span className="px-2 py-0.5 rounded bg-mar-surface-alt border border-mar-border text-xs text-gray-500">
                  {profile.technology}
                </span>
              )}
              {subtypeLabel && (
                <span className="px-2 py-0.5 rounded bg-mar-surface-alt border border-mar-border text-xs text-gray-500">
                  {subtypeLabel}
                </span>
              )}
              {!profile.is_active && (
                <span className="px-2 py-0.5 rounded bg-gray-100 dark:bg-gray-800 border border-mar-border text-xs text-gray-400">
                  Retired
                </span>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-shrink-0">
            <button type="button"
              className="p-2 rounded-lg border border-mar-border hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors"
              title="QR code">
              <QrCodeIcon size={16} />
            </button>
            <button type="button"
              className="flex items-center gap-1.5 px-3 py-2 text-sm border border-mar-border-md rounded-lg text-gray-500 hover:bg-mar-surface-alt transition-colors">
              <ShareIcon size={14} />
              Share
            </button>
            <button type="button"
              className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-sm font-medium rounded-lg transition-colors">
              <EditIcon size={14} />
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Health score */}
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Health score</p>
          <p className="text-2xl font-bold text-mar-text">{profile.health_score}%</p>
          <div className="mt-2 h-1.5 rounded-full bg-mar-border overflow-hidden">
            <div
              className="h-full rounded-full bg-mar-accent transition-all"
              style={{ width: `${profile.health_score}%` }}
            />
          </div>
        </div>

        {/* Last calibration */}
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Last calibration</p>
          <p className="text-xl font-semibold font-mono text-mar-text tabular-nums">
            {fmtDate(profile.last_calibration_date)}
          </p>
        </div>

        {/* Next due */}
        <div className="bg-mar-surface border border-mar-border rounded-xl p-5">
          <p className="text-xs text-gray-400 mb-1">Next due</p>
          <p className="text-xl font-semibold font-mono text-mar-text tabular-nums">
            {fmtDate(profile.next_due_at)}
          </p>
        </div>

        {/* Calibrations count */}
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
              }`}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab content */}
        <div className="p-5">
          {activeTab === "overview" && <OverviewTab profile={profile} />}
          {activeTab === "calibration" && (
            <CalibrationTab
              calibrations={calibrations}
              coeffsByCalId={coeffsByCalId}
              certs={certs}
            />
          )}
          {activeTab === "files" && <FilesTab files={files} />}
          {activeTab === "activity" && <ActivityTab logs={auditLogs} />}
        </div>
      </div>
    </div>
  );
}
