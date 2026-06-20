"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listAssets } from "@/services/asset.service";
import type { AssetListItem, ChannelListItem } from "@/types/asset";
import {
  CALIBRATION_STATUS_LABEL,
  CALIBRATION_STATUS_STYLE,
  SUBTYPE_LABEL,
} from "@/lib/tokens";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  DownloadIcon,
  FilterIcon,
  GridViewIcon,
  ListViewIcon,
  QrCodeIcon,
  SearchIcon,
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
    ? <ChevronUpIcon size={10} className="text-mar-accent" />
    : <ChevronDownIcon size={10} className="text-mar-accent" />;
}

function TypeCell({ subtype, technology }: { subtype: string | null; technology: string | null }) {
  const label = subtype ? (SUBTYPE_LABEL[subtype] ?? subtype) : "—";
  const capitalised = label.charAt(0).toUpperCase() + label.slice(1);
  return (
    <div>
      <p className="text-sm text-mar-text leading-snug">{capitalised}</p>
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
      <p className="text-sm text-mar-text leading-snug">{site}</p>
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
      <div className="relative h-1.5 rounded-full bg-mar-border">
        <div
          className="absolute h-full rounded-full bg-mar-accent"
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
          className="mar-range absolute inset-0"
          style={{ zIndex: from >= to ? 5 : 3 }}
        />
        <input
          type="range"
          min={min} max={max} value={to}
          onChange={(e) => {
            const v = Math.max(Number(e.target.value), from);
            onToChange(v);
          }}
          className="mar-range absolute inset-0"
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
    <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer hover:text-mar-text">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-mar-action" />
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
    <div className="absolute top-full right-0 mt-1 w-80 bg-mar-surface border border-mar-border-md rounded-xl shadow-lg z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
        <span className="text-xs font-semibold text-mar-text">Filters</span>
        {hasFilters && (
          <button type="button" onClick={() => onChange(INITIAL_FILTERS)}
            className="text-[10px] text-mar-accent hover:underline">
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[520px] overflow-y-auto divide-y divide-mar-border">

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
              className="w-full text-xs bg-mar-surface-alt border border-mar-border-md rounded-lg px-2.5 py-1.5 text-mar-text outline-none"
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
                  className="w-full text-xs bg-mar-surface-alt border border-mar-border-md rounded-lg px-2.5 py-1.5 text-mar-text placeholder:text-gray-400 outline-none"
                />
                <span className="text-xs text-gray-400 flex-shrink-0">–</span>
                <input
                  type="number"
                  placeholder="Max"
                  value={filters.rangeMax}
                  onChange={(e) => onChange({ ...filters, rangeMax: e.target.value })}
                  className="w-full text-xs bg-mar-surface-alt border border-mar-border-md rounded-lg px-2.5 py-1.5 text-mar-text placeholder:text-gray-400 outline-none"
                />
                <span className="text-[10px] text-gray-400 flex-shrink-0">{filters.rangeUnit}</span>
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

      <div className="px-4 py-3 border-t border-mar-border">
        <button type="button" onClick={onClose}
          className="w-full py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors">
          Apply
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table rows — supports multichannel expand with HTML rowspan
// ---------------------------------------------------------------------------

const SHARED_TD = "px-4 py-2.5 border-b border-mar-border align-top";
const PER_CH_TD = "px-4 py-2.5 border-b border-mar-border align-top";

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
      className="font-mono text-xs font-semibold text-mar-accent hover:underline whitespace-nowrap">
      {asset.asset_id}
    </a>
  );
  const sharedName = <p className="text-sm font-medium text-mar-text leading-snug">{asset.name}</p>;
  const sharedMfr = (
    <div>
      <p className="text-sm text-mar-text leading-snug">{asset.manufacturer}</p>
      <p className="text-xs text-gray-400 mt-0.5 leading-snug">{asset.model}</p>
    </div>
  );
  const sharedSerial = <span className="font-mono text-xs text-gray-400">{asset.serial_number ?? "—"}</span>;
  const sharedSite = <SiteCell site={asset.site_name} location={asset.location_name} />;
  const sharedChevron = isMulti ? (
    <button type="button" onClick={onToggle}
      className="p-1 rounded hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors">
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
    // Simple single row
    const ch = visibleChannels[0];
    return (
      <tr className="border-b border-mar-border hover:bg-mar-surface-alt transition-colors">
        <td className="px-4 py-2.5 whitespace-nowrap">{sharedId}</td>
        <td className="px-4 py-2.5 max-w-[200px]">{sharedName}</td>
        <td className="px-4 py-2.5">
          <TypeCell subtype={ch.physical_quantity || asset.subtype} technology={ch.technology ?? asset.technology} />
        </td>
        <td className="px-4 py-2.5 whitespace-nowrap">
          {asset.asset_type === "sensor"
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
        <tr key={ch.channel_id} className="border-b border-mar-border hover:bg-mar-surface-alt/60 transition-colors">
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
            {isMulti && (
              <span className="text-[9px] text-gray-400 font-mono leading-none">{ch.channel_id}</span>
            )}
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
  const subtypeLabel = asset.subtype ? (SUBTYPE_LABEL[asset.subtype] ?? asset.subtype) : null;
  const range = formatRange(asset.range_min, asset.range_max, asset.range_unit);
  return (
    <a href={`/assets/${asset.id}`} className="block bg-mar-surface border border-mar-border rounded-xl p-4 hover:border-mar-border-md hover:shadow-sm transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <span className="font-mono text-[10px] font-semibold text-mar-accent">{asset.asset_id}</span>
        <StatusBadge status={asset.calibration_status} />
      </div>
      <p className="text-sm font-semibold text-mar-text leading-tight mb-1">{asset.name}</p>
      <p className="text-xs text-gray-400 truncate">{asset.manufacturer} · {asset.model}</p>
      <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400">
        <span>{subtypeLabel ?? asset.asset_type.toUpperCase()}{asset.technology ? ` · ${asset.technology}` : ""}</span>
        <span>{asset.site_name ?? "—"}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
        <span className="font-mono">{range ?? asset.serial_number ?? "—"}</span>
        <span className="font-mono">{formatDate(asset.next_due_at)}</span>
      </div>
    </a>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AssetsPage() {
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
  const [locationFilter, setLocationFilter] = useState<{ id: string; name: string } | null>(null);
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lid = params.get("location_id");
    const lname = params.get("location_name");
    if (lid) setLocationFilter({ id: lid, name: lname ?? lid });
  }, []);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAssets({ limit: 200, location_id: locationFilter?.id })
      .then(setAssets)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
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
  }, [assets, search, filters, sortCol, sortDir]);

  function handleSort(col: SortKey) {
    if (sortCol === col) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortCol(col); setSortDir("asc"); }
  }

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-mar-text">Asset registry</h1>
          <p className="text-sm text-gray-400 mt-1">
            {loading ? "Loading…" : `${filtered.length} of ${assets.length} assets`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
            <QrCodeIcon size={13} />
            Scan QR
          </button>
          <button type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors">
            <DownloadIcon size={13} />
            Export
          </button>
          <button type="button"
            className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors">
            <span className="text-sm leading-none">+</span>
            New asset
          </button>
        </div>
      </div>

      {/* Toolbar */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-1.5 bg-mar-surface-alt border border-mar-border-md rounded-lg">
            <SearchIcon size={13} className="text-gray-400 flex-shrink-0" />
            <input
              type="text" value={search} onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, serial, model…"
              className="flex-1 bg-transparent text-xs text-mar-text placeholder:text-gray-400 outline-none"
            />
          </div>

          <div className="relative" ref={filterRef}>
            <button type="button" onClick={() => setFilterOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                activeFilterCount > 0
                  ? "border-mar-accent text-mar-accent bg-mar-accent/5"
                  : "text-gray-500 dark:text-gray-400 border-mar-border-md hover:bg-mar-surface-alt"
              }`}>
              <FilterIcon size={13} />
              Filters
              {activeFilterCount > 0 && (
                <span className="bg-mar-accent text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
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

          <div className="flex items-center border border-mar-border-md rounded-lg overflow-hidden">
            <button type="button" onClick={() => setViewMode("list")}
              className={`p-1.5 transition-colors ${
                viewMode === "list" ? "bg-mar-accent/10 text-mar-accent" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              }`}>
              <ListViewIcon size={14} />
            </button>
            <button type="button" onClick={() => setViewMode("grid")}
              className={`p-1.5 transition-colors ${
                viewMode === "grid" ? "bg-mar-accent/10 text-mar-accent" : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              }`}>
              <GridViewIcon size={14} />
            </button>
          </div>
        </div>
      </div>

      {locationFilter && (
        <div className="flex items-center gap-3 rounded-xl bg-mar-accent/5 border border-mar-accent/20 px-4 py-2.5">
          <span className="text-xs text-mar-accent font-medium">
            Filtered by location: <span className="font-semibold">{locationFilter.name}</span>
          </span>
          <button
            type="button"
            onClick={() => setLocationFilter(null)}
            className="ml-auto text-[10px] text-gray-400 hover:text-mar-text transition-colors"
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
          <span className="inline-block w-5 h-5 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin mr-3" />
          Loading assets…
        </div>
      )}

      {!loading && !error && viewMode === "list" && (
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-mar-border">
                {SORT_COLS.map(({ key, label }) => (
                  <th key={key} onClick={() => handleSort(key)}
                    className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-mar-text transition-colors">
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
