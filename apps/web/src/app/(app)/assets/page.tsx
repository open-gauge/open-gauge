"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  createAsset,
  duplicateAsset,
  fetchBulkExportBlob,
  importAssetZipWithOverrides,
  importAssetsZip,
  listAssets,
  listLocations,
  listTeams,
  validateImportZip,
  type AssetImportPreview,
  type AssetImportResult,
} from "@/services/asset.service";
import type { AssetCreateBody, AssetListItem, ChannelListItem, LocationOption } from "@/types/asset";
import {
  CALIBRATION_STATUS_LABEL,
  CALIBRATION_STATUS_STYLE,
  SUBTYPE_LABEL,
} from "@/lib/tokens";
import {
  CheckCircleIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  CopyIcon,
  ExportIcon,
  FilterIcon,
  GridViewIcon,
  ImportIcon,
  ListViewIcon,
  PlusIcon,
  SearchIcon,
  WarningIcon,
  XIcon,
} from "@/components/icons";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ViewMode = "list" | "grid";
type SortDir = "asc" | "desc";

interface FilterState {
  statuses: string[];
  subtypes: string[];
  technologies: string[];
  rangeUnit: string;
  rangeMin: string;
  rangeMax: string;
  nextDueFrom: number | null; // epoch day; null = global min
  nextDueTo: number | null;   // epoch day; null = global max
}

const INITIAL_FILTERS: FilterState = {
  statuses: [],
  subtypes: [],
  technologies: [],
  rangeUnit: "",
  rangeMin: "",
  rangeMax: "",
  nextDueFrom: null,
  nextDueTo: null,
};

const SORT_COLS = [
  { key: "asset_id",          label: "Asset ID" },
  { key: "name",              label: "Name" },
  { key: "subtype",           label: "Type" },
  { key: "range_min",         label: "Range" },
  { key: "manufacturer",      label: "Mfr / Model" },
  { key: "serial_number",     label: "Serial" },
  { key: "calibration_status",label: "Status" },
  { key: "next_due_at",       label: "Next due" },
  { key: "site_name",         label: "Site" },
] as const;

type SortKey = (typeof SORT_COLS)[number]["key"];

const STATUS_SORT: Record<string, string> = {
  expired: "0", due_soon: "1", valid: "2", not_calibrated: "3", retired: "4",
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

function dateToDays(iso: string): number {
  return Math.floor(new Date(iso + "T00:00:00").getTime() / 86_400_000);
}

function daysToIso(days: number): string {
  return new Date(days * 86_400_000).toISOString().slice(0, 10);
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function formatDayLabel(days: number): string {
  return formatDate(daysToIso(days));
}

// ---------------------------------------------------------------------------
// Range formatting
// ---------------------------------------------------------------------------

function formatRange(min: number | null, max: number | null, unit: string | null): string | null {
  if (min === null && max === null) return null;
  const lo = min !== null ? String(min) : "—";
  const hi = max !== null ? String(max) : "—";
  return `${lo} – ${hi}${unit ? " " + unit : ""}`;
}

// ---------------------------------------------------------------------------
// Sorting
// ---------------------------------------------------------------------------

function getSortValue(a: AssetListItem, col: SortKey): string {
  switch (col) {
    case "asset_id":           return a.asset_id;
    case "name":               return a.name.toLowerCase();
    case "subtype":            return (a.subtype ?? "").toLowerCase();
    case "range_min":          return a.range_min !== null ? String(a.range_min).padStart(20, "0") : "z";
    case "manufacturer":       return `${a.manufacturer} ${a.model}`.toLowerCase();
    case "serial_number":      return a.serial_number ?? "";
    case "calibration_status": return STATUS_SORT[a.calibration_status] ?? "9";
    case "next_due_at":        return a.next_due_at ?? "9999-99-99";
    case "site_name":          return (a.site_name ?? "").toLowerCase();
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const cls = CALIBRATION_STATUS_STYLE[status] ?? CALIBRATION_STATUS_STYLE.not_calibrated;
  const label = CALIBRATION_STATUS_LABEL[status] ?? status;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${cls}`}>
      ● {label}
    </span>
  );
}

function SortIndicator({ col, sortCol, sortDir }: { col: string; sortCol: SortKey | null; sortDir: SortDir }) {
  if (sortCol !== col) return <ChevronDownIcon size={10} className="opacity-30" />;
  return sortDir === "asc"
    ? <ChevronUpIcon size={10} className="text-og-accent" />
    : <ChevronDownIcon size={10} className="text-og-accent" />;
}

function TypeCell({ subtype, technology }: { subtype: string | null; technology: string | null }) {
  const label = subtype ? (SUBTYPE_LABEL[subtype] ?? subtype) : "—";
  const capitalised = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <div>
      <p className="text-sm text-og-text leading-snug">{capitalised}</p>
      {technology && <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{technology}</p>}
    </div>
  );
}

function RangeCell({ min, max, unit }: { min: number | null; max: number | null; unit: string | null }) {
  const str = formatRange(min, max, unit);
  if (!str) return <span className="text-xs text-gray-400">—</span>;
  return <span className="text-xs font-mono text-gray-500 whitespace-nowrap">{str}</span>;
}

function SiteCell({ site, location }: { site: string | null; location: string | null }) {
  if (!site) return <span className="text-sm text-gray-400">—</span>;
  const showSecond = location && location !== site;
  return (
    <div>
      <p className="text-sm text-og-text leading-snug">{site}</p>
      {showSecond && <p className="text-xs text-gray-400 mt-0.5 leading-snug">{location}</p>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Dual-range slider
// ---------------------------------------------------------------------------

interface DualRangeProps {
  min: number;
  max: number;
  from: number;
  to: number;
  onFromChange: (v: number) => void;
  onToChange: (v: number) => void;
}

function DualRangeSlider({ min, max, from, to, onFromChange, onToChange }: DualRangeProps) {
  const range = max - min || 1;
  const fromPct = ((from - min) / range) * 100;
  const toPct = ((to - min) / range) * 100;

  return (
    <div className="px-1 pt-2 pb-1">
      <div className="relative h-1.5 rounded-full bg-og-border">
        <div
          className="absolute h-full rounded-full bg-og-accent"
          style={{ left: `${fromPct}%`, right: `${100 - toPct}%` }}
        />
      </div>
      <div className="relative -mt-3 h-3">
        <input
          type="range"
          min={min} max={max} value={from}
          onChange={(e) => {
            const v = Math.min(Number(e.target.value), to);
            onFromChange(v);
          }}
          className="og-range absolute inset-0"
          style={{ zIndex: from >= to ? 5 : 3 }}
        />
        <input
          type="range"
          min={min} max={max} value={to}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), from);
            onToChange(v);
          }}
          className="og-range absolute inset-0"
          style={{ zIndex: 4 }}
        />
      </div>
      <div className="flex justify-between mt-1.5 text-[10px] text-gray-400">
        <span>{formatDayLabel(from)}</span>
        <span>{formatDayLabel(to)}</span>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Filter dropdown
// ---------------------------------------------------------------------------

function FilterSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-3 space-y-2">
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</p>
      {children}
    </div>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer hover:text-og-text">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-og-action" />
      {label}
    </label>
  );
}

interface FilterOptions {
  subtypes: string[];
  technologies: string[];
  units: string[];
  minDay: number;
  maxDay: number;
  hasDateRange: boolean;
}

interface FilterDropdownProps {
  open: boolean;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  options: FilterOptions;
  onClose: () => void;
}

function FilterDropdown({ open, filters, onChange, options, onClose }: FilterDropdownProps) {
  if (!open) return null;

  function toggle(key: "statuses" | "subtypes" | "technologies", value: string) {
    const next = filters[key].includes(value)
      ? filters[key].filter((v) => v !== value)
      : [...filters[key], value];
    onChange({ ...filters, [key]: next });
  }

  const hasFilters =
    filters.statuses.length > 0 ||
    filters.subtypes.length > 0 ||
    filters.technologies.length > 0 ||
    filters.rangeUnit !== "" ||
    filters.nextDueFrom !== null ||
    filters.nextDueTo !== null;

  const fromDay = filters.nextDueFrom ?? options.minDay;
  const toDay   = filters.nextDueTo   ?? options.maxDay;

  return (
    <div className="absolute top-full right-0 mt-1 w-80 bg-og-surface border border-og-border-md rounded-xl shadow-lg z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-og-border">
        <span className="text-xs font-semibold text-og-text">Filters</span>
        {hasFilters && (
          <button type="button" onClick={() => onChange(INITIAL_FILTERS)}
            className="text-[10px] text-og-accent hover:underline">
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[520px] overflow-y-auto divide-y divide-og-border">

        {/* Status */}
        <FilterSection title="Status">
          {Object.entries(CALIBRATION_STATUS_LABEL).map(([k, label]) => (
            <CheckRow key={k} label={label} checked={filters.statuses.includes(k)}
              onChange={() => toggle("statuses", k)} />
          ))}
        </FilterSection>

        {/* Type */}
        {options.subtypes.length > 0 && (
          <FilterSection title="Type">
            {options.subtypes.map((sub) => (
              <CheckRow key={sub} label={SUBTYPE_LABEL[sub] ?? sub}
                checked={filters.subtypes.includes(sub)}
                onChange={() => toggle("subtypes", sub)} />
            ))}
          </FilterSection>
        )}

        {/* Technology */}
        {options.technologies.length > 0 && (
          <FilterSection title="Technology (sensors only)">
            {options.technologies.map((tech) => (
              <CheckRow key={tech} label={tech}
                checked={filters.technologies.includes(tech)}
                onChange={() => toggle("technologies", tech)} />
            ))}
          </FilterSection>
        )}

        {/* Range */}
        {options.units.length > 0 && (
          <FilterSection title="Measurement range">
            <select
              value={filters.rangeUnit}
              onChange={(e) => onChange({ ...filters, rangeUnit: e.target.value, rangeMin: "", rangeMax: "" })}
              className="w-full text-xs bg-og-surface-alt border border-og-border-md rounded-lg px-2.5 py-1.5 text-og-text outline-hidden"
            >
              <option value="">Select unit…</option>
              {options.units.map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
            {filters.rangeUnit && (
              <div className="flex items-center gap-2 mt-1.5">
                <input
                  type="number"
                  placeholder="Min"
                  value={filters.rangeMin}
                  onChange={(e) => onChange({ ...filters, rangeMin: e.target.value })}
                  className="w-full text-xs bg-og-surface-alt border border-og-border-md rounded-lg px-2.5 py-1.5 text-og-text placeholder:text-gray-400 outline-hidden"
                />
                <span className="text-xs text-gray-400 shrink-0">–</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.rangeMax}
                  onChange={(e) => onChange({ ...filters, rangeMax: e.target.value })}
                  className="w-full text-xs bg-og-surface-alt border border-og-border-md rounded-lg px-2.5 py-1.5 text-og-text placeholder:text-gray-400 outline-hidden"
                />
                <span className="text-[10px] text-gray-400 shrink-0">{filters.rangeUnit}</span>
              </div>
            )}
          </FilterSection>
        )}

        {/* Next due date */}
        {options.hasDateRange && (
          <FilterSection title="Next due date">
            <DualRangeSlider
              min={options.minDay}
              max={options.maxDay}
              from={fromDay}
              to={toDay}
              onFromChange={(v) => onChange({ ...filters, nextDueFrom: v === options.minDay ? null : v })}
              onToChange={(v) => onChange({ ...filters, nextDueTo: v === options.maxDay ? null : v })}
            />
          </FilterSection>
        )}
      </div>

      <div className="px-4 py-3 border-t border-og-border">
        <button type="button" onClick={onClose}
          className="w-full py-1.5 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors">
          Apply
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table rows — supports multichannel expand with HTML rowspan
// ---------------------------------------------------------------------------

const SHARED_TD = "px-4 py-2.5 border-b border-og-border align-top";
const PER_CH_TD = "px-4 py-2.5 border-b border-og-border align-top";

interface RowProps {
  asset: AssetListItem;
  expanded: boolean;
  onToggle: () => void;
}

function AssetRow({ asset, expanded, onToggle }: RowProps) {
  const isMulti = asset.asset_type === "sensor" && asset.channels.length > 1;
  const rowCount = expanded && isMulti ? asset.channels.length : 1;

  // Shared cell content
  const sharedId = (
    <a href={`/assets/${asset.id}`}
      className="font-mono text-xs font-semibold text-og-accent hover:underline whitespace-nowrap">
      {asset.asset_id}
    </a>
  );
  const sharedName = <p className="text-sm font-medium text-og-text leading-snug">{asset.name}</p>;
  const sharedMfr = (
    <div>
      <p className="text-sm text-og-text leading-snug">{asset.manufacturer}</p>
      <p className="text-xs text-gray-400 mt-0.5 leading-snug">{asset.model}</p>
    </div>
  );
  const sharedSerial = <span className="font-mono text-xs text-gray-400">{asset.serial_number ?? "—"}</span>;
  const sharedSite = <SiteCell site={asset.site_name} location={asset.location_name} />;
  const sharedChevron = isMulti ? (
    <button type="button" onClick={onToggle}
      className="p-1 rounded-sm hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors">
      {expanded ? <ChevronUpIcon size={12} /> : <ChevronRightIcon size={12} />}
    </button>
  ) : null;

  // Per-channel data
  const channels = asset.asset_type === "sensor" && asset.channels.length > 0
    ? asset.channels
    : [{
        channel_id: "__default__",
        physical_quantity: asset.subtype ?? "",
        technology: asset.technology,
        measurement_min: asset.range_min,
        measurement_max: asset.range_max,
        unit: asset.range_unit ?? "",
      } as ChannelListItem];

  const visibleChannels = expanded && isMulti ? channels : [channels[0]];

  if (!expanded || !isMulti) {
    // Single row — for multi-channel collapsed, show summary instead of first channel details
    const ch = visibleChannels[0];
    return (
      <tr className="border-b border-og-border hover:bg-og-surface-alt transition-colors">
        <td className="px-4 py-2.5 whitespace-nowrap">{sharedId}</td>
        <td className="px-4 py-2.5 max-w-[200px]">{sharedName}</td>
        <td className="px-4 py-2.5">
          {isMulti
            ? <p className="text-sm text-og-text leading-snug">{asset.channels.length} channels</p>
            : <TypeCell subtype={ch.physical_quantity || asset.subtype} technology={ch.technology ?? asset.technology} />}
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap">
          {isMulti
            ? <span className="text-xs text-gray-400">—</span>
            : asset.asset_type === "sensor"
              ? <RangeCell min={ch.measurement_min} max={ch.measurement_max} unit={ch.unit || null} />
              : <span className="text-xs text-gray-400">—</span>}
        </td>
        <td className="px-4 py-2.5">{sharedMfr}</td>
        <td className="px-4 py-2.5 whitespace-nowrap">{sharedSerial}</td>
        <td className="px-4 py-2.5 whitespace-nowrap"><StatusBadge status={asset.calibration_status} /></td>
        <td className="px-4 py-2.5 whitespace-nowrap">
          <span className="text-xs text-gray-500 font-mono">{formatDate(asset.next_due_at)}</span>
        </td>
        <td className="px-4 py-2.5">{sharedSite}</td>
        <td className="px-4 py-2.5 w-8 text-center">{sharedChevron}</td>
      </tr>
    );
  }

  // Expanded multi-channel: rowspan on shared cells
  return (
    <>
      {visibleChannels.map((ch, idx) => (
        <tr key={ch.channel_id} className="border-b border-og-border hover:bg-og-surface-alt/60 transition-colors">
          {idx === 0 && (
            <td className={SHARED_TD} rowSpan={rowCount} style={{ verticalAlign: "top" }}>
              {sharedId}
            </td>
          )}
          {idx === 0 && (
            <td className={`${SHARED_TD} max-w-[160px]`} rowSpan={rowCount}>{sharedName}</td>
          )}
          <td className={PER_CH_TD}>
            <TypeCell subtype={ch.physical_quantity} technology={ch.technology} />
          </td>
          <td className={`${PER_CH_TD} whitespace-nowrap`}>
            <RangeCell min={ch.measurement_min} max={ch.measurement_max} unit={ch.unit || null} />
          </td>
          {idx === 0 && (
            <td className={SHARED_TD} rowSpan={rowCount}>{sharedMfr}</td>
          )}
          {idx === 0 && (
            <td className={`${SHARED_TD} whitespace-nowrap`} rowSpan={rowCount}>{sharedSerial}</td>
          )}
          <td className={`${PER_CH_TD} whitespace-nowrap`}>
            <StatusBadge status={asset.calibration_status} />
          </td>
          <td className={`${PER_CH_TD} whitespace-nowrap`}>
            <span className="text-xs text-gray-500 font-mono">{formatDate(asset.next_due_at)}</span>
          </td>
          {idx === 0 && (
            <td className={SHARED_TD} rowSpan={rowCount}>{sharedSite}</td>
          )}
          {idx === 0 && (
            <td className={`${SHARED_TD} w-8 text-center`} rowSpan={rowCount}>{sharedChevron}</td>
          )}
        </tr>
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function AssetCard({ asset }: { asset: AssetListItem }) {
  const isMulti = asset.asset_type === "sensor" && asset.channels.length > 1;
  const subtypeLabel = asset.subtype ? (SUBTYPE_LABEL[asset.subtype] ?? asset.subtype) : null;
  const range = isMulti ? null : formatRange(asset.range_min, asset.range_max, asset.range_unit);
  return (
    <a href={`/assets/${asset.id}`} className="block bg-og-surface border border-og-border rounded-xl p-4 hover:border-og-border-md hover:shadow-xs transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <span className="font-mono text-[10px] font-semibold text-og-accent">{asset.asset_id}</span>
        <StatusBadge status={asset.calibration_status} />
      </div>
      <p className="text-sm font-semibold text-og-text leading-tight mb-1">{asset.name}</p>
      <p className="text-xs text-gray-400 truncate">{asset.manufacturer} · {asset.model}</p>
      <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400">
        <span>
          {isMulti
            ? `${asset.channels.length} channels`
            : `${subtypeLabel ?? asset.asset_type.toUpperCase()}${asset.technology ? ` · ${asset.technology}` : ""}`}
        </span>
        <span>{asset.site_name ?? "—"}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
        <span className="font-mono">{range ?? (isMulti ? "—" : (asset.serial_number ?? "—"))}</span>
        <span className="font-mono">{formatDate(asset.next_due_at)}</span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Bulk export modal
// ---------------------------------------------------------------------------

interface BulkExportModalProps {
  assets: AssetListItem[];
  onClose: () => void;
}

function BulkExportModal({ assets, onClose }: BulkExportModalProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allSelected = assets.length > 0 && selected.size === assets.length;

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(assets.map((a) => a.id)));
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleExport() {
    setExporting(true);
    setError(null);
    try {
      const blob = await fetchBulkExportBlob([...selected]);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `assets-export-${new Date().toISOString().slice(0, 10)}.zip`;
      a.click();
      URL.revokeObjectURL(url);
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to export assets");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-og-surface border border-og-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border">
          <h2 className="text-sm font-semibold text-og-text">Export assets</h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors">
            <XIcon size={15} />
          </button>
        </div>

        <div className="px-5 py-3 border-b border-og-border">
          <CheckRow label={`Select all (${assets.length})`} checked={allSelected} onChange={toggleAll} />
        </div>

        <div className="overflow-y-auto max-h-96 divide-y divide-og-border">
          {assets.map((a) => (
            <label key={a.id} className="flex items-center gap-3 px-5 py-2.5 cursor-pointer hover:bg-og-surface-alt transition-colors">
              <input type="checkbox" checked={selected.has(a.id)} onChange={() => toggleOne(a.id)} className="accent-og-action shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-og-text truncate">{a.name}</p>
                <p className="text-xs font-mono text-gray-400">{a.asset_id}</p>
              </div>
            </label>
          ))}
        </div>

        {error && <p className="px-5 pt-3 text-xs text-red-500">{error}</p>}

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-og-border">
          <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
            Cancel
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={selected.size === 0 || exporting}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
          >
            {exporting && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
            Export selected ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk import modal
// ---------------------------------------------------------------------------

interface BulkImportModalProps {
  onClose: () => void;
  onImported: () => void;
}

function BulkImportModal({ onClose, onImported }: BulkImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [importing, setImporting] = useState(false);
  const [results, setResults] = useState<AssetImportResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    setFiles(Array.from(e.target.files ?? []));
  }

  async function handleImport() {
    if (files.length === 0) return;
    setImporting(true);
    setError(null);
    try {
      const res = await importAssetsZip(files);
      setResults(res.results);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to import assets");
    } finally {
      setImporting(false);
    }
  }

  function handleDone() {
    onImported();
    onClose();
  }

  const createdCount = results?.filter((r) => r.status === "created").length ?? 0;
  const failedCount = results ? results.length - createdCount : 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={results ? undefined : onClose} />
      <div className="relative z-10 w-full max-w-lg bg-og-surface border border-og-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border">
          <h2 className="text-sm font-semibold text-og-text">Import assets</h2>
          {!results && (
            <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors">
              <XIcon size={15} />
            </button>
          )}
        </div>

        <div className="p-5 overflow-y-auto max-h-[60vh]">
          {!results ? (
            <div className="space-y-3">
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer border-og-border hover:border-og-accent/50 hover:bg-og-surface-alt transition-colors"
              >
                <ImportIcon size={24} className="text-gray-400" />
                <p className="text-sm text-gray-500">
                  {files.length > 0 ? `${files.length} file(s) selected` : "Click to select one or more ZIP files"}
                </p>
                <p className="text-xs text-gray-400">Each ZIP can contain one or more exported assets.</p>
                <input ref={fileInputRef} type="file" accept=".zip" multiple className="hidden" onChange={handleFileChange} />
              </div>
              {files.length > 0 && (
                <ul className="text-xs text-gray-500 space-y-1">
                  {files.map((f) => <li key={f.name} className="font-mono truncate">{f.name}</li>)}
                </ul>
              )}
              {error && <p className="text-xs text-red-500">{error}</p>}
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-og-text">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">{createdCount} created</span>
                {failedCount > 0 && <span className="text-red-500 font-medium">, {failedCount} failed</span>}
              </p>
              <div className="divide-y divide-og-border rounded-lg border border-og-border overflow-hidden">
                {results.map((r, i) => (
                  <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                    {r.status === "created" ? (
                      <CheckCircleIcon size={14} className="text-emerald-500 shrink-0 mt-0.5" />
                    ) : (
                      <WarningIcon size={14} className="text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-og-text truncate">
                        {r.asset_id ?? r.source_folder}
                      </p>
                      {r.status === "error" && r.error_message && (
                        <p className="text-xs text-red-500 mt-0.5">{r.error_message}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-5 py-4 border-t border-og-border">
          {!results ? (
            <>
              <button type="button" onClick={onClose} className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImport}
                disabled={files.length === 0 || importing}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {importing && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Import
              </button>
            </>
          ) : (
            <button type="button" onClick={handleDone} className="px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg transition-colors">
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// New Asset Modal
// ---------------------------------------------------------------------------

function suggestNextId(assets: AssetListItem[]): string {
  let max = 0;
  for (const a of assets) {
    const m = a.asset_id.match(/^Open Gauge-(\d{5})$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `Open Gauge-${String(max + 1).padStart(5, "0")}`;
}

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400";
const IB_OK = "border-og-border-md focus:border-og-accent focus:ring-og-accent/20";
const IB_ERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

interface NewAssetModalProps {
  existingAssets: AssetListItem[];
  onClose: () => void;
  onCreated: (newId: string) => void;
}

function NewAssetModal({ existingAssets, onClose, onCreated }: NewAssetModalProps) {
  const [mode, setMode] = useState<"choose" | "new" | "copy" | "import">("choose");

  // --- "import from file" state ---
  const importFileInputRef = useRef<HTMLInputElement>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importDragging, setImportDragging] = useState(false);
  const [importValidating, setImportValidating] = useState(false);
  const [importPreview, setImportPreview] = useState<AssetImportPreview | null>(null);
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLocations, setImportLocations] = useState<LocationOption[]>([]);
  const [importTeams, setImportTeams] = useState<{ id: string; name: string }[]>([]);
  const [importLocationId, setImportLocationId] = useState("");
  const [importOwnerId, setImportOwnerId] = useState("");

  // --- "new from scratch" state ---
  const [form, setForm] = useState({
    asset_id: suggestNextId(existingAssets),
    asset_type: "sensor" as "sensor" | "daq",
    name: "",
    manufacturer: "",
    model: "",
    serial_number: "",
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // --- "copy" state ---
  const [copySearch, setCopySearch] = useState("");
  const [selectedSource, setSelectedSource] = useState<AssetListItem | null>(null);
  const [newCopyId, setNewCopyId] = useState("");
  const [copyIdError, setCopyIdError] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);
  const [copyError, setCopyError] = useState<string | null>(null);

  const filteredSources = existingAssets.filter((a) => {
    const q = copySearch.toLowerCase();
    return (
      a.asset_id.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q) ||
      a.manufacturer.toLowerCase().includes(q) ||
      a.model.toLowerCase().includes(q)
    );
  });

  function validateNew() {
    const errs: Record<string, string> = {};
    if (!form.asset_id.trim()) errs.asset_id = "Required";
    else if (existingAssets.some((a) => a.asset_id === form.asset_id.trim())) errs.asset_id = "Asset ID already exists";
    if (!form.name.trim()) errs.name = "Required";
    if (!form.manufacturer.trim()) errs.manufacturer = "Required";
    if (!form.model.trim()) errs.model = "Required";
    return errs;
  }

  async function handleCreate() {
    const errs = validateNew();
    if (Object.keys(errs).length > 0) { setFormErrors(errs); return; }
    setSaving(true);
    setSaveError(null);
    try {
      const body: AssetCreateBody = {
        asset_id: form.asset_id,
        asset_type: form.asset_type,
        name: form.name.trim(),
        manufacturer: form.manufacturer.trim(),
        model: form.model.trim(),
        serial_number: form.serial_number.trim() || null,
      };
      const created = await createAsset(body);
      onCreated(created.id);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to create asset");
    } finally {
      setSaving(false);
    }
  }

  function validateCopyId() {
    if (!newCopyId.trim()) return "Required";
    if (existingAssets.some((a) => a.asset_id === newCopyId.trim())) return "Asset ID already exists";
    return null;
  }

  async function handleDuplicate() {
    if (!selectedSource) return;
    const err = validateCopyId();
    if (err) { setCopyIdError(err); return; }
    setCopyIdError(null);
    setCopying(true);
    setCopyError(null);
    try {
      const created = await duplicateAsset(selectedSource.id, newCopyId);
      onCreated(created.id);
    } catch (e: unknown) {
      setCopyError(e instanceof Error ? e.message : "Failed to duplicate asset");
    } finally {
      setCopying(false);
    }
  }

  async function handleImportFileSelected(file: File) {
    setImportFile(file);
    setImportPreview(null);
    setImportError(null);
    setImportLocationId("");
    setImportOwnerId("");
    setImportValidating(true);
    try {
      const preview = await validateImportZip(file);
      if (!preview.valid) {
        setImportError("The file is not a valid asset. Please check the file and try again.");
        return;
      }
      setImportPreview(preview);
      if (importLocations.length === 0) listLocations().then(setImportLocations).catch(() => {});
      if (importTeams.length === 0) listTeams().then(setImportTeams).catch(() => {});
    } catch {
      setImportError("The file is not a valid asset. Please check the file and try again.");
    } finally {
      setImportValidating(false);
    }
  }

  function handleImportDragOver(e: React.DragEvent) {
    e.preventDefault();
    setImportDragging(true);
  }

  function handleImportDragLeave(e: React.DragEvent) {
    if (!e.currentTarget.contains(e.relatedTarget as Node)) setImportDragging(false);
  }

  function handleImportDrop(e: React.DragEvent) {
    e.preventDefault();
    setImportDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleImportFileSelected(file);
  }

  async function handleImportSubmit() {
    if (!importFile || !importPreview?.valid) return;
    setImporting(true);
    setImportError(null);
    try {
      const res = await importAssetZipWithOverrides(importFile, {
        locationId: importLocationId || undefined,
        owner: importOwnerId || undefined,
      });
      if (res.results.length !== 1) {
        setImportError(`Expected exactly one asset in the file, found ${res.results.length}.`);
        return;
      }
      const [only] = res.results;
      if (only.status === "error" || !only.new_asset_pk) {
        setImportError(only.error_message ?? "Import failed");
        return;
      }
      onCreated(only.new_asset_pk);
    } catch (e: unknown) {
      setImportError(e instanceof Error ? e.message : "Failed to import asset");
    } finally {
      setImporting(false);
    }
  }

  const set = (k: keyof typeof form) => (v: string) => {
    setForm((f) => ({ ...f, [k]: v }));
    setFormErrors((e) => { const n = { ...e }; delete n[k]; return n; });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 w-full max-w-lg bg-og-surface border border-og-border rounded-xl shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-og-border">
          <h2 className="text-sm font-semibold text-og-text">
            {mode === "choose" ? "Add asset"
              : mode === "new" ? "New asset"
              : mode === "copy" ? "Copy from existing"
              : "Import from file"}
          </h2>
          <button type="button" onClick={onClose} className="p-1.5 rounded-lg hover:bg-og-surface-alt text-gray-400 hover:text-og-text transition-colors">
            <XIcon size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto max-h-[70vh]">

          {/* Step 1: choose mode */}
          {mode === "choose" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setMode("import"); setImportFile(null); setImportError(null); setImportPreview(null); setImportLocationId(""); setImportOwnerId(""); }}
                className="col-span-2 flex items-center gap-3 p-4 rounded-xl border-2 border-og-border hover:border-og-accent hover:bg-og-accent/5 transition-colors group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-og-accent/10 flex items-center justify-center shrink-0 group-hover:bg-og-accent/20 transition-colors">
                  <ImportIcon size={18} className="text-og-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-og-text">Import from file</p>
                  <p className="text-xs text-gray-400 mt-0.5">Restore an asset from a previously exported ZIP.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-og-border hover:border-og-accent hover:bg-og-accent/5 transition-colors group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-og-action/10 flex items-center justify-center group-hover:bg-og-action/20 transition-colors">
                  <PlusIcon size={18} className="text-og-action" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-og-text">New asset</p>
                  <p className="text-xs text-gray-400 mt-0.5">Start from scratch with a blank record.</p>
                </div>
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode("copy");
                  setNewCopyId(suggestNextId(existingAssets));
                }}
                className="flex flex-col items-center gap-3 p-5 rounded-xl border-2 border-og-border hover:border-og-accent hover:bg-og-accent/5 transition-colors group text-left"
              >
                <div className="w-10 h-10 rounded-full bg-og-accent/10 flex items-center justify-center group-hover:bg-og-accent/20 transition-colors">
                  <CopyIcon size={18} className="text-og-accent" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-og-text">Copy existing</p>
                  <p className="text-xs text-gray-400 mt-0.5">Duplicate a registered asset&apos;s metadata.</p>
                </div>
              </button>
            </div>
          )}

          {/* Step 2a: new from scratch */}
          {mode === "new" && (
            <div className="space-y-4">
              {/* Asset ID */}
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Asset ID <span className="text-red-400">*</span></label>
                <input
                  value={form.asset_id}
                  onChange={(e) => set("asset_id")(e.target.value)}
                  placeholder="e.g. OG-00001"
                  className={`${IB} ${formErrors.asset_id ? IB_ERR : IB_OK} font-mono`}
                />
                {formErrors.asset_id && <p className="text-xs text-red-500">{formErrors.asset_id}</p>}
                <p className="text-[10px] text-gray-400">Any unique identifier — letters, numbers and symbols are allowed.</p>
              </div>

              {/* Type */}
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Asset type <span className="text-red-400">*</span></label>
                <div className="flex gap-2">
                  {(["sensor", "daq"] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => set("asset_type")(t)}
                      className={`flex-1 py-2 rounded-lg border text-xs font-medium transition-colors capitalize ${
                        form.asset_type === t
                          ? "border-og-accent bg-og-accent/10 text-og-accent"
                          : "border-og-border-md text-gray-400 hover:bg-og-surface-alt"
                      }`}
                    >
                      {t === "daq" ? "DAQ" : "Sensor"}
                    </button>
                  ))}
                </div>
              </div>

              {/* Name */}
              <div className="space-y-1">
                <label className="text-xs text-gray-400">Name <span className="text-red-400">*</span></label>
                <input value={form.name} onChange={(e) => set("name")(e.target.value)} placeholder="e.g. PT100 Temperature Sensor" className={`${IB} ${formErrors.name ? IB_ERR : IB_OK}`} />
                {formErrors.name && <p className="text-xs text-red-500">{formErrors.name}</p>}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Manufacturer <span className="text-red-400">*</span></label>
                  <input value={form.manufacturer} onChange={(e) => set("manufacturer")(e.target.value)} placeholder="e.g. WIKA" className={`${IB} ${formErrors.manufacturer ? IB_ERR : IB_OK}`} />
                  {formErrors.manufacturer && <p className="text-xs text-red-500">{formErrors.manufacturer}</p>}
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-gray-400">Model <span className="text-red-400">*</span></label>
                  <input value={form.model} onChange={(e) => set("model")(e.target.value)} placeholder="e.g. TF53" className={`${IB} ${formErrors.model ? IB_ERR : IB_OK}`} />
                  {formErrors.model && <p className="text-xs text-red-500">{formErrors.model}</p>}
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-gray-400">Serial number <span className="text-gray-400 font-normal">(optional)</span></label>
                <input value={form.serial_number} onChange={(e) => set("serial_number")(e.target.value)} placeholder="e.g. SN-20240001" className={`${IB} ${IB_OK}`} />
              </div>

              {saveError && <p className="text-xs text-red-500 mt-1">{saveError}</p>}
            </div>
          )}

          {/* Step 2b: copy from existing */}
          {mode === "copy" && (
            <div className="space-y-4">
              {!selectedSource ? (
                <>
                  <div className="relative">
                    <SearchIcon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                    <input
                      value={copySearch}
                      onChange={(e) => setCopySearch(e.target.value)}
                      placeholder="Search by ID, name, manufacturer…"
                      className={`${IB} ${IB_OK} pl-8`}
                      autoFocus
                    />
                  </div>
                  <div className="rounded-xl border border-og-border overflow-hidden max-h-72 overflow-y-auto">
                    {filteredSources.length === 0 ? (
                      <p className="px-4 py-6 text-sm text-gray-400 text-center">No assets found.</p>
                    ) : (
                      <div className="divide-y divide-og-border">
                        {filteredSources.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            onClick={() => setSelectedSource(a)}
                            className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-og-surface-alt transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-og-text truncate">{a.name}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                <span className="font-mono">{a.asset_id}</span>
                                {" · "}{a.manufacturer} {a.model}
                                {a.serial_number && ` · ${a.serial_number}`}
                              </p>
                            </div>
                            <ChevronRightIcon size={13} className="text-gray-400 shrink-0" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {/* Selected source summary */}
                  <div className="flex items-center gap-3 px-4 py-3 rounded-lg bg-og-surface-alt border border-og-border">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-gray-400">Copying from</p>
                      <p className="text-sm font-semibold text-og-text">{selectedSource.name}</p>
                      <p className="text-xs font-mono text-gray-400 mt-0.5">{selectedSource.asset_id} · {selectedSource.manufacturer} {selectedSource.model}</p>
                    </div>
                    <button type="button" onClick={() => setSelectedSource(null)} className="text-xs text-gray-400 hover:text-og-text transition-colors shrink-0">
                      Change
                    </button>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">New asset ID <span className="text-red-400">*</span></label>
                    <input
                      value={newCopyId}
                      onChange={(e) => { setNewCopyId(e.target.value); setCopyIdError(null); }}
                      placeholder="e.g. OG-00002"
                      className={`${IB} ${copyIdError ? IB_ERR : IB_OK} font-mono`}
                    />
                    {copyIdError && <p className="text-xs text-red-500">{copyIdError}</p>}
                    <p className="text-[10px] text-gray-400">
                      The new asset will copy all specifications and sensor channels. Calibration history is not copied.
                    </p>
                  </div>

                  {copyError && <p className="text-xs text-red-500">{copyError}</p>}
                </>
              )}
            </div>
          )}

          {/* Step 2c: import from file */}
          {mode === "import" && (
            <div className="space-y-3">
              <div
                onClick={() => importFileInputRef.current?.click()}
                onDragOver={handleImportDragOver}
                onDragLeave={handleImportDragLeave}
                onDrop={handleImportDrop}
                className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors
                  ${importDragging
                    ? "border-og-accent bg-og-accent/5"
                    : "border-og-border hover:border-og-accent/50 hover:bg-og-surface-alt"}`}
              >
                <ImportIcon size={24} className={importDragging ? "text-og-accent" : "text-gray-400"} />
                <p className="text-sm text-gray-500">
                  {importValidating
                    ? "Checking file…"
                    : importFile
                    ? importFile.name
                    : "Drop a ZIP file here or click to browse"}
                </p>
                <input
                  ref={importFileInputRef}
                  type="file"
                  accept=".zip"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleImportFileSelected(file);
                  }}
                />
              </div>
              <p className="text-[10px] text-gray-400">
                The ZIP must contain exactly one asset folder (as produced by the asset Export feature).
              </p>

              {importError && <p className="text-xs text-red-500">{importError}</p>}

              {importPreview?.valid && (
                <div className="space-y-3">
                  <div className="rounded-lg bg-og-surface-alt border border-og-border px-4 py-3">
                    <p className="text-sm font-semibold text-og-text">{importPreview.name}</p>
                    <p className="text-xs font-mono text-gray-400 mt-0.5">
                      {importPreview.asset_id} · {importPreview.manufacturer} {importPreview.model}
                    </p>
                    <p className="text-[10px] text-gray-400 mt-1">
                      {importPreview.asset_type === "daq" ? "DAQ" : "Sensor"}
                      {" · "}{importPreview.channel_count} channel(s)
                      {" · "}{importPreview.calibration_count} calibration(s)
                    </p>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">Location <span className="text-gray-400 font-normal">(optional)</span></label>
                    <select
                      value={importLocationId}
                      onChange={(e) => setImportLocationId(e.target.value)}
                      className={`${IB} ${IB_OK}`}
                    >
                      <option value="">Unassigned</option>
                      {importLocations.map((loc) => (
                        <option key={loc.id} value={loc.id}>{loc.path}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs text-gray-400">Owning team <span className="text-gray-400 font-normal">(optional)</span></label>
                    <select
                      value={importOwnerId}
                      onChange={(e) => setImportOwnerId(e.target.value)}
                      className={`${IB} ${IB_OK}`}
                    >
                      <option value="">Unassigned</option>
                      {importTeams.map((team) => (
                        <option key={team.id} value={team.id}>{team.name}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        {mode !== "choose" && (
          <div className="flex items-center justify-between gap-3 px-5 py-4 border-t border-og-border">
            <button
              type="button"
              onClick={() => { setMode("choose"); setSaveError(null); setCopyError(null); setFormErrors({}); setImportError(null); }}
              className="px-3 py-1.5 text-sm text-gray-500 dark:text-gray-400 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors"
            >
              Back
            </button>
            {mode === "new" ? (
              <button
                type="button"
                onClick={handleCreate}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {saving && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Create asset
              </button>
            ) : mode === "copy" && selectedSource ? (
              <button
                type="button"
                onClick={handleDuplicate}
                disabled={copying}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {copying && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Duplicate asset
              </button>
            ) : mode === "import" ? (
              <button
                type="button"
                onClick={handleImportSubmit}
                disabled={!importPreview?.valid || importing}
                className="flex items-center gap-1.5 px-4 py-1.5 bg-og-action hover:bg-og-action-dark text-white text-sm font-medium rounded-lg disabled:opacity-50 transition-colors"
              >
                {importing && <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                Import asset
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AssetsPage() {
  const router = useRouter();
  const [assets, setAssets]       = useState<AssetListItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [search, setSearch]       = useState("");
  const [viewMode, setViewMode]   = useState<ViewMode>("list");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters]     = useState<FilterState>(INITIAL_FILTERS);
  const [sortCol, setSortCol]     = useState<SortKey | null>(null);
  const [sortDir, setSortDir]     = useState<SortDir>("asc");
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [locationFilter, setLocationFilter] = useState<{ id: string; name: string; includeDescendants?: boolean } | null>(null);
  const [quickFilter, setQuickFilter] = useState<{ label: string; type: "asset_type" | "health_max"; value: string } | null>(null);
  const [newAssetOpen, setNewAssetOpen] = useState(false);
  const [bulkExportOpen, setBulkExportOpen] = useState(false);
  const [bulkImportOpen, setBulkImportOpen] = useState(false);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lid = params.get("location_id");
    const lname = params.get("location_name");
    const inclDes = params.get("include_descendants") === "true";
    if (lid) setLocationFilter({ id: lid, name: lname ?? lid, includeDescendants: inclDes });
    const at = params.get("asset_type");
    if (at === "sensor") setQuickFilter({ type: "asset_type", value: "sensor", label: "Sensors only" });
    if (at === "daq")    setQuickFilter({ type: "asset_type", value: "daq",    label: "DAQ units only" });
    const hm = params.get("health_max");
    if (hm) setQuickFilter({ type: "health_max", value: hm, label: `Health score ≤ ${hm}%` });
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("new") === "1") {
      setNewAssetOpen(true);
      router.replace("/assets");
    }
  }, [router]);

  function loadAssets() {
    setLoading(true);
    setError(null);
    return listAssets({ limit: 200, location_id: locationFilter?.id, include_descendants: locationFilter?.includeDescendants })
      .then(setAssets)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadAssets();
  }, [locationFilter]);

  useEffect(() => {
    if (!filterOpen) return;
    function handleClick(e: MouseEvent) {
      if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
        setFilterOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [filterOpen]);

  function toggleExpand(id: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  // Derive filter option lists from the loaded data
  const filterOptions = useMemo((): FilterOptions => {
    const subtypes    = new Set<string>();
    const technologies = new Set<string>();
    const units       = new Set<string>();
    const days: number[] = [];

    for (const a of assets) {
      if (a.asset_type === "sensor") {
        for (const ch of a.channels) {
          subtypes.add(ch.physical_quantity);
          if (ch.technology) technologies.add(ch.technology);
          if (ch.unit) units.add(ch.unit);
        }
      } else if (a.subtype) {
        subtypes.add(a.subtype);
      }
      if (a.next_due_at) days.push(dateToDays(a.next_due_at));
    }

    const minDay = days.length > 0 ? Math.min(...days) : 0;
    const maxDay = days.length > 0 ? Math.max(...days) : 0;

    return {
      subtypes:     Array.from(subtypes).sort(),
      technologies: Array.from(technologies).sort(),
      units:        Array.from(units).sort(),
      minDay,
      maxDay,
      hasDateRange: days.length >= 2 && minDay !== maxDay,
    };
  }, [assets]);

  const activeFilterCount =
    filters.statuses.length +
    filters.subtypes.length +
    filters.technologies.length +
    (filters.rangeUnit ? 1 : 0) +
    (filters.nextDueFrom !== null || filters.nextDueTo !== null ? 1 : 0);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();

    let list = assets.filter((a) => {
      // Quick filter (from URL param: ?asset_type or ?health_max)
      if (quickFilter) {
        if (quickFilter.type === "asset_type" && a.asset_type !== quickFilter.value) return false;
        if (quickFilter.type === "health_max"  && a.health_score > Number(quickFilter.value)) return false;
      }

      // Search
      if (q && !(
        a.asset_id.toLowerCase().includes(q) ||
        a.name.toLowerCase().includes(q) ||
        a.manufacturer.toLowerCase().includes(q) ||
        a.model.toLowerCase().includes(q) ||
        (a.serial_number?.toLowerCase().includes(q) ?? false)
      )) return false;

      // Status
      if (filters.statuses.length > 0 && !filters.statuses.includes(a.calibration_status))
        return false;

      // Subtype — match any channel for sensors
      if (filters.subtypes.length > 0) {
        const assetSubtypes = a.asset_type === "sensor"
          ? a.channels.map((ch) => ch.physical_quantity)
          : a.subtype ? [a.subtype] : [];
        if (!assetSubtypes.some((s) => filters.subtypes.includes(s))) return false;
      }

      // Technology — sensors only
      if (filters.technologies.length > 0) {
        if (a.asset_type !== "sensor") return false;
        const techs = a.channels.map((ch) => ch.technology).filter((t): t is string => t !== null);
        if (!techs.some((t) => filters.technologies.includes(t))) return false;
      }

      // Range — unit must match, range must overlap
      if (filters.rangeUnit) {
        if (a.asset_type !== "sensor") return false;
        const filterMin = filters.rangeMin !== "" ? Number(filters.rangeMin) : -Infinity;
        const filterMax = filters.rangeMax !== "" ? Number(filters.rangeMax) : Infinity;
        const matches = a.channels.some((ch) => {
          if (ch.unit !== filters.rangeUnit) return false;
          const assetMin = ch.measurement_min ?? -Infinity;
          const assetMax = ch.measurement_max ?? Infinity;
          return assetMin <= filterMax && assetMax >= filterMin;
        });
        if (!matches) return false;
      }

      // Next due date
      if (filters.nextDueFrom !== null || filters.nextDueTo !== null) {
        if (!a.next_due_at) return false;
        const day = dateToDays(a.next_due_at);
        if (filters.nextDueFrom !== null && day < filters.nextDueFrom) return false;
        if (filters.nextDueTo   !== null && day > filters.nextDueTo)   return false;
      }

      return true;
    });

    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = getSortValue(a, sortCol);
        const bv = getSortValue(b, sortCol);
        const cmp = av.localeCompare(bv, undefined, { numeric: true });
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [assets, search, filters, sortCol, sortDir, quickFilter]);

  function handleSort(col: SortKey) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  function handleAssetCreated(newId: string) {
    setNewAssetOpen(false);
    router.push(`/assets/${newId}`);
  }

  return (
    <div className="p-6 space-y-5">
      {newAssetOpen && (
        <NewAssetModal
          existingAssets={assets}
          onClose={() => setNewAssetOpen(false)}
          onCreated={handleAssetCreated}
        />
      )}
      {bulkExportOpen && (
        <BulkExportModal assets={assets} onClose={() => setBulkExportOpen(false)} />
      )}
      {bulkImportOpen && (
        <BulkImportModal
          onClose={() => setBulkImportOpen(false)}
          onImported={loadAssets}
        />
      )}
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-og-text">Asset registry</h1>
          <p className="text-sm text-gray-400 mt-1">
            {loading ? "Loading…" : `${filtered.length} of ${assets.length} assets`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            onClick={() => setBulkExportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
            <ExportIcon size={13} />
            Export
          </button>
          <button type="button"
            onClick={() => setBulkImportOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors">
            <ImportIcon size={13} />
            Import
          </button>
          <button type="button"
            onClick={() => setNewAssetOpen(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-og-action hover:bg-og-action-dark text-white text-xs font-medium rounded-lg transition-colors">
            <PlusIcon size={13} />
            New asset
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-1.5 bg-og-surface-alt border border-og-border-md rounded-lg">
            <SearchIcon size={13} className="text-gray-400 shrink-0" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, serial, model…"
              className="flex-1 bg-transparent text-xs text-og-text placeholder:text-gray-400 outline-hidden"
            />
          </div>

          <div className="relative" ref={filterRef}>
            <button type="button" onClick={() => setFilterOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                activeFilterCount > 0
                  ? "border-og-accent text-og-accent bg-og-accent/5"
                  : "text-gray-500 dark:text-gray-400 border-og-border-md hover:bg-og-surface-alt"
              }`}>
              <FilterIcon size={13} />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-og-accent text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                  {activeFilterCount}
                </span>
              )}
            </button>

            <FilterDropdown
              open={filterOpen}
              filters={filters}
              onChange={setFilters}
              options={filterOptions}
              onClose={() => setFilterOpen(false)}
            />
          </div>

          <div className="flex items-center border border-og-border-md rounded-lg overflow-hidden">
            <button type="button" onClick={() => setViewMode("list")}
              className={`p-1.5 transition-colors ${
                viewMode === "list" ? "bg-og-accent/10 text-og-accent" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              }`}>
              <ListViewIcon size={14} />
            </button>
            <button type="button" onClick={() => setViewMode("grid")}
              className={`p-1.5 transition-colors ${
                viewMode === "grid" ? "bg-og-accent/10 text-og-accent" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              }`}>
              <GridViewIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {locationFilter && (
        <div className="flex items-center gap-3 rounded-xl bg-og-accent/5 border border-og-accent/20 px-4 py-2.5">
          <span className="text-xs text-og-accent font-medium">
            Filtered by location: <span className="font-semibold">{locationFilter.name}</span>
            {locationFilter.includeDescendants && <span className="font-normal text-gray-500"> (including sub-locations)</span>}
          </span>
          <button
            type="button"
            onClick={() => setLocationFilter(null)}
            className="ml-auto text-[10px] text-gray-400 hover:text-og-text transition-colors"
          >
            View all ✕
          </button>
        </div>
      )}

      {quickFilter && (
        <div className="flex items-center gap-3 rounded-xl bg-og-accent/5 border border-og-accent/20 px-4 py-2.5">
          <span className="text-xs text-og-accent font-medium">
            Showing: <span className="font-semibold">{quickFilter.label}</span>
          </span>
          <button
            type="button"
            onClick={() => setQuickFilter(null)}
            className="ml-auto text-[10px] text-gray-400 hover:text-og-text transition-colors"
          >
            View all ✕
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          Failed to load assets: {error}
        </div>
      )}

      {loading && (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
          Loading assets…
        </div>
      )}

      {!loading && !error && viewMode === "list" && (
        <div className="bg-og-surface rounded-xl border border-og-border shadow-xs overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-og-border">
                {SORT_COLS.map(({ key, label }) => (
                  <th key={key} onClick={() => handleSort(key)}
                    className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-og-text transition-colors">
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <SortIndicator col={key} sortCol={sortCol} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
                <th className="px-4 py-2.5 w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-16 text-center text-sm text-gray-400">
                    No assets match your search or filters.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => (
                  <AssetRow
                    key={a.id}
                    asset={a}
                    expanded={expandedIds.has(a.id)}
                    onToggle={() => toggleExpand(a.id)}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && viewMode === "grid" && (
        <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
          {filtered.length === 0 ? (
            <p className="col-span-full text-center text-sm text-gray-400 py-16">
              No assets match your search or filters.
            </p>
          ) : (
            filtered.map((a) => <AssetCard key={a.id} asset={a} />)
          )}
        </div>
      )}
    </div>
  );
}
