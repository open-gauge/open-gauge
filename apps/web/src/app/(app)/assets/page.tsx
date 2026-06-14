"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { listAssets } from "@/services/asset.service";
import type { AssetListItem } from "@/types/asset";
import {
  ASSET_CATEGORY_LABEL,
  CALIBRATION_STATUS_LABEL,
  CALIBRATION_STATUS_STYLE,
  SUBTYPE_LABEL,
} from "@/lib/tokens";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  DownloadIcon,
  FilterIcon,
  GridViewIcon,
  ListViewIcon,
  QrCodeIcon,
  SearchIcon,
} from "@/components/icons";

type ViewMode = "list" | "grid";
type SortDir = "asc" | "desc";

const SORT_COLS = [
  { key: "asset_id", label: "Asset ID" },
  { key: "name", label: "Name" },
  { key: "category", label: "Type" },
  { key: "manufacturer", label: "Manufacturer / Model" },
  { key: "serial_number", label: "Serial" },
  { key: "calibration_status", label: "Status" },
  { key: "next_due_at", label: "Next due" },
  { key: "site_name", label: "Site" },
] as const;

type SortKey = (typeof SORT_COLS)[number]["key"];

const NEXT_DUE_OPTIONS = [
  { value: "all", label: "All" },
  { value: "overdue", label: "Overdue" },
  { value: "30d", label: "Due within 30 days" },
  { value: "90d", label: "Due within 90 days" },
] as const;

type NextDueFilter = (typeof NEXT_DUE_OPTIONS)[number]["value"];

interface FilterState {
  statuses: string[];
  categories: string[];
  subtypes: string[];
  nextDue: NextDueFilter;
}

const INITIAL_FILTERS: FilterState = {
  statuses: [],
  categories: [],
  subtypes: [],
  nextDue: "all",
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toISOString().slice(0, 10);
}

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
  if (sortCol !== col) {
    return <ChevronDownIcon size={10} className="opacity-30" />;
  }
  return sortDir === "asc"
    ? <ChevronUpIcon size={10} className="text-mar-accent" />
    : <ChevronDownIcon size={10} className="text-mar-accent" />;
}

// ---------------------------------------------------------------------------
// Table row
// ---------------------------------------------------------------------------

function AssetRow({ asset }: { asset: AssetListItem }) {
  const categoryLabel = ASSET_CATEGORY_LABEL[asset.category] ?? asset.category;
  const subtypeLabel = asset.subtype ? (SUBTYPE_LABEL[asset.subtype] ?? asset.subtype) : null;

  return (
    <tr className="border-b border-mar-border hover:bg-mar-surface-alt transition-colors">
      <td className="px-4 py-3 whitespace-nowrap">
        <a href={`/assets/${asset.id}`} className="font-mono text-xs font-semibold text-mar-accent hover:underline">
          {asset.asset_id}
        </a>
      </td>
      <td className="px-4 py-3">
        <p className="text-sm font-medium text-mar-text leading-snug">{asset.name}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-sm text-mar-text">{categoryLabel}</p>
        {subtypeLabel && <p className="text-xs text-gray-400 mt-0.5">{subtypeLabel}</p>}
      </td>
      <td className="px-4 py-3">
        <p className="text-sm text-mar-text">{asset.manufacturer}</p>
        <p className="text-xs text-gray-400 mt-0.5">{asset.model}</p>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="font-mono text-xs text-gray-400">{asset.serial_number ?? "—"}</span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <StatusBadge status={asset.calibration_status} />
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <span className="text-xs text-gray-500 font-mono">{formatDate(asset.next_due_at)}</span>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <p className="text-sm text-mar-text">{asset.site_name ?? "—"}</p>
        {asset.laboratory_name && (
          <p className="text-xs text-gray-400 mt-0.5">{asset.laboratory_name}</p>
        )}
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Grid card
// ---------------------------------------------------------------------------

function AssetCard({ asset }: { asset: AssetListItem }) {
  const categoryLabel = ASSET_CATEGORY_LABEL[asset.category] ?? asset.category;
  const subtypeLabel = asset.subtype ? (SUBTYPE_LABEL[asset.subtype] ?? asset.subtype) : null;
  return (
    <div className="bg-mar-surface border border-mar-border rounded-xl p-4 hover:border-mar-border-md hover:shadow-sm transition-all cursor-pointer">
      <div className="flex items-start justify-between mb-3">
        <span className="font-mono text-[10px] font-semibold text-mar-accent">{asset.asset_id}</span>
        <StatusBadge status={asset.calibration_status} />
      </div>
      <p className="text-sm font-semibold text-mar-text leading-tight mb-1">{asset.name}</p>
      <p className="text-xs text-gray-400 truncate">{asset.manufacturer} · {asset.model}</p>
      <div className="mt-3 flex items-center justify-between text-[10px] text-gray-400">
        <span>{categoryLabel}{subtypeLabel ? ` · ${subtypeLabel}` : ""}</span>
        <span>{asset.site_name ?? "—"}</span>
      </div>
      <div className="mt-1 flex items-center justify-between text-[10px] text-gray-400">
        <span className="font-mono">{asset.serial_number ?? "—"}</span>
        <span>{asset.laboratory_name ?? formatDate(asset.next_due_at)}</span>
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

function FilterDropdown({
  open,
  filters,
  onChange,
  availableSubtypes,
  onClose,
}: {
  open: boolean;
  filters: FilterState;
  onChange: (f: FilterState) => void;
  availableSubtypes: string[];
  onClose: () => void;
}) {
  if (!open) return null;

  function toggle(key: "statuses" | "categories" | "subtypes", value: string) {
    const current = filters[key];
    const next = current.includes(value)
      ? current.filter((v) => v !== value)
      : [...current, value];
    onChange({ ...filters, [key]: next });
  }

  const hasFilters =
    filters.statuses.length > 0 ||
    filters.categories.length > 0 ||
    filters.subtypes.length > 0 ||
    filters.nextDue !== "all";

  return (
    <div className="absolute top-full right-0 mt-1 w-72 bg-mar-surface border border-mar-border-md rounded-xl shadow-lg z-50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
        <span className="text-xs font-semibold text-mar-text">Filters</span>
        {hasFilters && (
          <button
            type="button"
            onClick={() => onChange(INITIAL_FILTERS)}
            className="text-[10px] text-mar-accent hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      <div className="max-h-[420px] overflow-y-auto divide-y divide-mar-border">
        <FilterSection title="Status">
          {Object.entries(CALIBRATION_STATUS_LABEL).map(([k, label]) => (
            <CheckRow
              key={k}
              label={label}
              checked={filters.statuses.includes(k)}
              onChange={() => toggle("statuses", k)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Next due">
          {NEXT_DUE_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-300 cursor-pointer hover:text-mar-text">
              <input
                type="radio"
                name="nextDue"
                value={opt.value}
                checked={filters.nextDue === opt.value}
                onChange={() => onChange({ ...filters, nextDue: opt.value })}
                className="accent-mar-action"
              />
              {opt.label}
            </label>
          ))}
        </FilterSection>

        <FilterSection title="Asset type">
          {Object.entries(ASSET_CATEGORY_LABEL).map(([k, label]) => (
            <CheckRow
              key={k}
              label={label}
              checked={filters.categories.includes(k)}
              onChange={() => toggle("categories", k)}
            />
          ))}
        </FilterSection>

        {availableSubtypes.length > 0 && (
          <FilterSection title="Sub-asset type">
            {availableSubtypes.map((sub) => (
              <CheckRow
                key={sub}
                label={SUBTYPE_LABEL[sub] ?? sub}
                checked={filters.subtypes.includes(sub)}
                onChange={() => toggle("subtypes", sub)}
              />
            ))}
          </FilterSection>
        )}
      </div>

      <div className="px-4 py-3 border-t border-mar-border">
        <button
          type="button"
          onClick={onClose}
          className="w-full py-1.5 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
        >
          Apply
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function AssetsPage() {
  const [assets, setAssets] = useState<AssetListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(INITIAL_FILTERS);
  const [sortCol, setSortCol] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const filterRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    listAssets({ limit: 200 })
      .then(setAssets)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

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

  const availableSubtypes = useMemo(() => {
    const seen = new Set<string>();
    for (const a of assets) {
      if (a.subtype) seen.add(a.subtype);
    }
    return Array.from(seen).sort();
  }, [assets]);

  const activeFilterCount =
    filters.statuses.length +
    filters.categories.length +
    filters.subtypes.length +
    (filters.nextDue !== "all" ? 1 : 0);

  const filtered = useMemo(() => {
    const now = Date.now();
    const q = search.toLowerCase();

    let list = assets.filter((a) => {
      if (
        q &&
        !(
          a.asset_id.toLowerCase().includes(q) ||
          a.name.toLowerCase().includes(q) ||
          a.manufacturer.toLowerCase().includes(q) ||
          a.model.toLowerCase().includes(q) ||
          (a.serial_number?.toLowerCase().includes(q) ?? false)
        )
      )
        return false;

      if (filters.statuses.length > 0 && !filters.statuses.includes(a.calibration_status))
        return false;

      if (filters.categories.length > 0 && !filters.categories.includes(a.category))
        return false;

      if (filters.subtypes.length > 0 && !(a.subtype && filters.subtypes.includes(a.subtype)))
        return false;

      if (filters.nextDue !== "all") {
        if (!a.next_due_at) return false;
        const due = new Date(a.next_due_at).getTime();
        if (filters.nextDue === "overdue" && due >= now) return false;
        if (filters.nextDue === "30d" && (due < now || due > now + 30 * 86_400_000)) return false;
        if (filters.nextDue === "90d" && (due < now || due > now + 90 * 86_400_000)) return false;
      }

      return true;
    });

    if (sortCol) {
      list = [...list].sort((a, b) => {
        const av = String(a[sortCol as keyof AssetListItem] ?? "");
        const bv = String(b[sortCol as keyof AssetListItem] ?? "");
        const cmp = av.localeCompare(bv);
        return sortDir === "asc" ? cmp : -cmp;
      });
    }

    return list;
  }, [assets, search, filters, sortCol, sortDir]);

  function handleSort(col: SortKey) {
    if (sortCol === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortCol(col);
      setSortDir("asc");
    }
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
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors"
          >
            <QrCodeIcon size={13} />
            Scan QR
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors"
          >
            <DownloadIcon size={13} />
            Export
          </button>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
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
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name, ID, serial, model..."
              className="flex-1 bg-transparent text-xs text-mar-text placeholder:text-gray-400 outline-none"
            />
          </div>

          <div className="relative" ref={filterRef}>
            <button
              type="button"
              onClick={() => setFilterOpen((o) => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium border rounded-lg transition-colors ${
                activeFilterCount > 0
                  ? "border-mar-accent text-mar-accent bg-mar-accent/5"
                  : "text-gray-500 dark:text-gray-400 border-mar-border-md hover:bg-mar-surface-alt"
              }`}
            >
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
              availableSubtypes={availableSubtypes}
              onClose={() => setFilterOpen(false)}
            />
          </div>

          <div className="flex items-center border border-mar-border-md rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setViewMode("list")}
              className={`p-1.5 transition-colors ${
                viewMode === "list"
                  ? "bg-mar-accent/10 text-mar-accent"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              }`}
            >
              <ListViewIcon size={14} />
            </button>
            <button
              type="button"
              onClick={() => setViewMode("grid")}
              className={`p-1.5 transition-colors ${
                viewMode === "grid"
                  ? "bg-mar-accent/10 text-mar-accent"
                  : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              }`}
            >
              <GridViewIcon size={14} />
            </button>
          </div>
        </div>
      </div>

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
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm overflow-hidden">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-mar-border">
                {SORT_COLS.map(({ key, label }) => (
                  <th
                    key={key}
                    onClick={() => handleSort(key)}
                    className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap cursor-pointer select-none hover:text-mar-text transition-colors"
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      <SortIndicator col={key} sortCol={sortCol} sortDir={sortDir} />
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-16 text-center text-sm text-gray-400">
                    No assets match your search.
                  </td>
                </tr>
              ) : (
                filtered.map((a) => <AssetRow key={a.id} asset={a} />)
              )}
            </tbody>
          </table>
        </div>
      )}

      {!loading && !error && viewMode === "grid" && (
        <div className="grid grid-cols-3 gap-4 xl:grid-cols-4">
          {filtered.length === 0 ? (
            <p className="col-span-full text-center text-sm text-gray-400 py-16">
              No assets match your search.
            </p>
          ) : (
            filtered.map((a) => <AssetCard key={a.id} asset={a} />)
          )}
        </div>
      )}
    </div>
  );
}
