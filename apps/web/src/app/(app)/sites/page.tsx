"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  CheckIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  LocationBuildingIcon,
  LocationExternalIcon,
  LocationFieldIcon,
  LocationIndustrialIcon,
  LocationLabIcon,
  LocationOfficeIcon,
  LocationOrgIcon,
  LocationOtherIcon,
  LocationProductionIcon,
  LocationSiteIcon,
  LocationStorageIcon,
  LocationTestIcon,
  LocationVehicleIcon,
  MapPinIcon,
  PlusIcon,
  WarningIcon,
  XIcon,
} from "@/components/icons";
import {
  createLocation,
  deleteLocation,
  getMyOrganizationId,
  listAllLocations,
  updateLocation,
} from "@/services/location.service";
import type { LocationUpdateBody } from "@/services/location.service";
import type { LocationItem, LocationTreeNode } from "@/types/location";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const LOCATION_TYPES = [
  { value: "organization",        label: "Organization" },
  { value: "site",                label: "Site" },
  { value: "building",            label: "Building" },
  { value: "laboratory",          label: "Laboratory" },
  { value: "office",              label: "Office" },
  { value: "production",          label: "Production" },
  { value: "industrial_process",  label: "Industrial process" },
  { value: "test_facility",       label: "Test facility" },
  { value: "field",               label: "Field" },
  { value: "vehicle",             label: "Vehicle" },
  { value: "storage",             label: "Storage" },
  { value: "external",            label: "External" },
  { value: "other",               label: "Other" },
];

// ---------------------------------------------------------------------------
// Tree utilities
// ---------------------------------------------------------------------------

function buildTree(items: LocationItem[]): LocationTreeNode[] {
  const map = new Map<string, LocationTreeNode>();
  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
  const roots: LocationTreeNode[] = [];
  for (const item of items) {
    const node = map.get(item.id)!;
    if (node.parent_location_id) {
      const parent = map.get(node.parent_location_id);
      if (parent) parent.children.push(node);
      else roots.push(node);
    } else {
      roots.push(node);
    }
  }
  function sort(nodes: LocationTreeNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sort(n.children);
  }
  sort(roots);
  return roots;
}

function buildPathMap(items: LocationItem[]): Map<string, string> {
  const byId = new Map(items.map((l) => [l.id, l]));
  function path(id: string): string {
    const loc = byId.get(id);
    if (!loc) return "";
    if (!loc.parent_location_id) return loc.name;
    const p = path(loc.parent_location_id);
    return p ? `${p} › ${loc.name}` : loc.name;
  }
  const result = new Map<string, string>();
  for (const item of items) result.set(item.id, path(item.id));
  return result;
}

function computeInheritedCounts(tree: LocationTreeNode[]): Map<string, number> {
  const map = new Map<string, number>();
  function visit(node: LocationTreeNode): number {
    let total = node.asset_count;
    for (const child of node.children) total += visit(child);
    map.set(node.id, total);
    return total;
  }
  for (const root of tree) visit(root);
  return map;
}

// ---------------------------------------------------------------------------
// Type helpers
// ---------------------------------------------------------------------------

function TypeIcon({ type, size = 13 }: { type: string; size?: number }) {
  const t = type.toLowerCase();
  if (t === "organization")      return <LocationOrgIcon size={size} />;
  if (t === "site")              return <LocationSiteIcon size={size} />;
  if (t === "building")          return <LocationBuildingIcon size={size} />;
  if (t === "laboratory")        return <LocationLabIcon size={size} />;
  if (t === "office")            return <LocationOfficeIcon size={size} />;
  if (t === "production")        return <LocationProductionIcon size={size} />;
  if (t === "industrial_process") return <LocationIndustrialIcon size={size} />;
  if (t === "test_facility")     return <LocationTestIcon size={size} />;
  if (t === "field")             return <LocationFieldIcon size={size} />;
  if (t === "vehicle")           return <LocationVehicleIcon size={size} />;
  if (t === "storage")           return <LocationStorageIcon size={size} />;
  if (t === "external")          return <LocationExternalIcon size={size} />;
  return <LocationOtherIcon size={size} />;
}

// ---------------------------------------------------------------------------
// Edit form types and helpers
// ---------------------------------------------------------------------------

interface LocationEditForm {
  name: string;
  description: string;
  location_type: string;
  code: string;
  address: string;
  latitude: string;
  longitude: string;
  parent_location_id: string;
  is_calibration_lab: boolean;
}

function locationToForm(loc: LocationItem): LocationEditForm {
  return {
    name: loc.name,
    description: loc.description ?? "",
    location_type: loc.location_type,
    code: loc.code ?? "",
    address: loc.address ?? "",
    latitude: loc.latitude != null ? String(loc.latitude) : "",
    longitude: loc.longitude != null ? String(loc.longitude) : "",
    parent_location_id: loc.parent_location_id ?? "",
    is_calibration_lab: loc.is_calibration_lab,
  };
}

function formToUpdateBody(form: LocationEditForm): LocationUpdateBody {
  const parseNum = (s: string): number | null => {
    if (!s.trim()) return null;
    const n = parseFloat(s);
    return isNaN(n) ? null : n;
  };
  return {
    name: form.name.trim() || undefined,
    description: form.description.trim() || null,
    location_type: form.location_type || undefined,
    code: form.code.trim() || null,
    address: form.address.trim() || null,
    latitude: parseNum(form.latitude),
    longitude: parseNum(form.longitude),
    parent_location_id: form.parent_location_id || null,
    is_calibration_lab: form.is_calibration_lab,
  };
}

// ---------------------------------------------------------------------------
// Inline edit field components
// ---------------------------------------------------------------------------

const IB = "w-full px-3 py-2 rounded-lg border text-sm text-mar-text bg-mar-surface focus:outline-hidden focus:ring-1 transition-colors placeholder-gray-300";
const IOK = "border-mar-border-md focus:border-mar-accent focus:ring-mar-accent/20";
const IERR = "border-red-400 focus:border-red-400 focus:ring-red-400/20";

function FLabel({ label, required }: { label: string; required?: boolean }) {
  return (
    <span className="text-xs text-gray-400">
      {label}{required && <span className="text-red-400 ml-0.5">*</span>}
    </span>
  );
}

function FInput({ label, value, onChange, error, required, placeholder, type = "text" }: {
  label: string; value: string; onChange: (v: string) => void;
  error?: string; required?: boolean; placeholder?: string; type?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FLabel label={label} required={required} />
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${IB} ${error ? IERR : IOK}`}
      />
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

function FTextArea({ label, value, onChange, placeholder }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FLabel label={label} />
      <textarea
        value={value}
        rows={3}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className={`${IB} resize-none ${IOK}`}
      />
    </div>
  );
}

function FSelect({ label, value, onChange, options, required, placeholder }: {
  label: string; value: string; onChange: (v: string) => void;
  options: { value: string; label: string }[];
  required?: boolean; placeholder?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <FLabel label={label} required={required} />
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`${IB} ${IOK}`}
      >
        <option value="">{placeholder ?? "Select…"}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

function FCheckbox({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="w-4 h-4 rounded-sm border-mar-border-md accent-mar-accent"
      />
      <span className="text-sm text-mar-text">{label}</span>
    </label>
  );
}

// ---------------------------------------------------------------------------
// Tree node component
// ---------------------------------------------------------------------------

function TreeItem({
  node, selectedId, onSelect, expanded, onToggle, depth, inheritedCounts,
}: {
  node: LocationTreeNode;
  selectedId: string | null;
  onSelect: (loc: LocationItem) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  depth: number;
  inheritedCounts: Map<string, number>;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;
  const displayCount = inheritedCounts.get(node.id) ?? node.asset_count;

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          if (hasChildren) onToggle(node.id);
          onSelect(node);
        }}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        className={`w-full flex items-center gap-1.5 pr-3 py-1.5 rounded-md text-left text-sm transition-colors ${
          isSelected
            ? "bg-mar-accent/10 text-mar-accent font-medium dark:bg-mar-accent/20 dark:text-mar-accent"
            : "text-gray-600 dark:text-gray-400 hover:bg-mar-border hover:text-gray-900 dark:hover:text-gray-200"
        }`}
      >
        <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center text-gray-400">
          {hasChildren
            ? isExpanded ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />
            : null}
        </span>
        <span className={`shrink-0 ${isSelected ? "text-mar-accent" : "text-gray-400"}`}>
          <TypeIcon type={node.location_type} size={13} />
        </span>
        <span className="flex-1 truncate text-xs">{node.name}</span>
        {node.is_calibration_lab && (
          <span
            title="This is a location where sensors can be calibrated."
            className="shrink-0 w-2 h-2 rounded-full bg-blue-500 dark:bg-blue-400"
          />
        )}
        {displayCount > 0 && (
          <span className={`text-[10px] tabular-nums shrink-0 ${isSelected ? "text-mar-accent/80" : "text-gray-400"}`}>
            {displayCount}
          </span>
        )}
      </button>

      {hasChildren && isExpanded && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              selectedId={selectedId}
              onSelect={onSelect}
              expanded={expanded}
              onToggle={onToggle}
              depth={depth + 1}
              inheritedCounts={inheritedCounts}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Info card
// ---------------------------------------------------------------------------

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-mar-text">{value}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Remove location confirmation modal
// ---------------------------------------------------------------------------

function RemoveLocationModal({
  locationName,
  open,
  removing,
  onClose,
  onConfirm,
}: {
  locationName: string;
  open: boolean;
  removing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-mar-surface border border-mar-border rounded-xl shadow-xl p-6 w-full max-w-sm mx-4">
        <div className="flex items-center gap-3 mb-4">
          <WarningIcon size={20} className="text-red-500 shrink-0" />
          <h2 className="text-base font-semibold text-mar-text">Remove location?</h2>
        </div>
        <p className="text-sm text-gray-500 mb-2">
          You are about to permanently remove{" "}
          <span className="font-semibold text-mar-text">{locationName}</span>.
        </p>
        <p className="text-sm text-gray-500 mb-5">
          All assets currently assigned to this location will be unassigned. This action cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={removing}
            className="px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={removing}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            {removing
              ? <span className="inline-block w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              : <WarningIcon size={12} />}
            {removing ? "Removing…" : "Remove location"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function LocationDetail({
  location,
  allLocations,
  onEditSaved,
  onRemoved,
  inheritedCount = 0,
}: {
  location: LocationItem;
  allLocations: LocationItem[];
  onEditSaved: (updated: LocationItem[]) => void;
  onRemoved: (fresh: LocationItem[]) => void;
  inheritedCount?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<LocationEditForm>(locationToForm(location));
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [removeModalOpen, setRemoveModalOpen] = useState(false);
  const [removing, setRemoving] = useState(false);

  // Reset edit state when selected location changes
  useEffect(() => {
    setEditing(false);
    setForm(locationToForm(location));
    setSaveError(null);
    setFormError(null);
  }, [location.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function startEdit() {
    setForm(locationToForm(location));
    setSaveError(null);
    setFormError(null);
    setEditing(true);
  }

  function handleCancel() {
    setEditing(false);
    setForm(locationToForm(location));
    setSaveError(null);
    setFormError(null);
  }

  async function handleSave() {
    if (!form.name.trim()) { setFormError("Name is required"); return; }
    if (!form.location_type) { setFormError("Type is required"); return; }
    setFormError(null);
    setSaving(true);
    setSaveError(null);
    try {
      await updateLocation(location.id, formToUpdateBody(form));
      const fresh = await listAllLocations();
      onEditSaved(fresh);
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  async function handleRemove() {
    setRemoving(true);
    try {
      await deleteLocation(location.id);
      const fresh = await listAllLocations();
      onRemoved(fresh);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Failed to remove location.");
      setRemoveModalOpen(false);
    } finally {
      setRemoving(false);
    }
  }

  function field<K extends keyof LocationEditForm>(key: K) {
    return (v: string) => setForm((prev) => ({ ...prev, [key]: v }));
  }

  const hasMap = location.latitude != null && location.longitude != null;
  const mapSrc = hasMap
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.longitude! - 0.02},${location.latitude! - 0.015},${location.longitude! + 0.02},${location.latitude! + 0.015}&layer=mapnik&marker=${location.latitude},${location.longitude}`
    : null;
  const mapLink = hasMap
    ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=15/${location.latitude}/${location.longitude}`
    : null;

  // Parent location options — exclude self
  const pathMap = useMemo(() => buildPathMap(allLocations), [allLocations]);
  const parentOptions = useMemo(
    () =>
      allLocations
        .filter((l) => l.id !== location.id)
        .map((l) => ({ value: l.id, label: pathMap.get(l.id) ?? l.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [allLocations, location.id, pathMap]
  );

  // Visible info cards (only non-empty fields)
  const infoCards: { label: string; value: React.ReactNode }[] = [];
  if (location.location_type) infoCards.push({ label: "Type", value: location.location_type });
  if (location.code)          infoCards.push({ label: "Code", value: <span className="font-mono text-xs">{location.code}</span> });
  if (location.address)       infoCards.push({ label: "Address", value: location.address });
  if (hasMap) infoCards.push({
    label: "GPS Coordinates",
    value: <span className="font-mono text-xs">{location.latitude!.toFixed(5)},&nbsp;{location.longitude!.toFixed(5)}</span>,
  });

  return (
    <>
      <RemoveLocationModal
        locationName={location.name}
        open={removeModalOpen}
        removing={removing}
        onClose={() => setRemoveModalOpen(false)}
        onConfirm={handleRemove}
      />
    <div className="space-y-4">
      {/* Header card */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-5">
        {editing ? (
          /* Edit header */
          <div className="space-y-3">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <FInput
                  label="Name"
                  value={form.name}
                  onChange={field("name")}
                  required
                  placeholder="Location name"
                  error={formError && !form.name.trim() ? formError : undefined}
                />
              </div>
              <div className="flex items-center gap-2 shrink-0 pt-5">
                <button
                  type="button"
                  onClick={handleCancel}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors disabled:opacity-60"
                >
                  <XIcon size={12} />
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
                >
                  <CheckIcon size={12} />
                  {saving ? "Saving…" : "Save"}
                </button>
              </div>
            </div>
            {saveError && (
              <p className="text-xs text-red-500">{saveError}</p>
            )}
          </div>
        ) : (
          /* View header: [asset count] [name + description] [Edit button] */
          <div className="flex items-center gap-4">
            {/* Left: asset count (uses inherited total from all descendants) */}
            <div className="w-20 shrink-0 text-left">
              {inheritedCount > 0 ? (
                <Link
                  href={`/assets?location_id=${location.id}&location_name=${encodeURIComponent(location.name)}&include_descendants=true`}
                  className="group block"
                >
                  <p className="text-3xl font-bold text-mar-text tabular-nums group-hover:text-mar-accent transition-colors">
                    {inheritedCount}
                  </p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 group-hover:text-mar-accent transition-colors">
                    Assets ↗
                  </p>
                </Link>
              ) : (
                <div>
                  <p className="text-3xl font-bold text-gray-300 dark:text-gray-600 tabular-nums">0</p>
                  <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Assets</p>
                </div>
              )}
            </div>

            {/* Center: name + description */}
            <div className="flex-1 text-center min-w-0">
              <h2 className="text-xl font-bold text-mar-text leading-tight">{location.name}</h2>
              {location.is_calibration_lab && (
                <div className="flex justify-center mt-1">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-600 border border-blue-100 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/40">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 dark:bg-blue-400 shrink-0" />
                    Calibration location
                    <span className="pointer-events-none absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover/lab:block w-56 bg-gray-900 dark:bg-gray-700 text-white text-[10px] rounded-lg px-3 py-2 z-50 shadow-lg whitespace-normal text-left leading-relaxed">
                      This is a location where sensors can be calibrated.
                    </span>
                  </span>
                </div>
              )}
              {location.description && (
                <p className="mt-1 text-sm text-gray-500 leading-relaxed">{location.description}</p>
              )}
            </div>

            {/* Right: Edit button */}
            <div className="w-20 shrink-0 flex justify-end">
              <button
                type="button"
                onClick={startEdit}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors"
              >
                <EditIcon size={12} />
                Edit
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Edit form (shown below header when editing) */}
      {editing && (
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-5 space-y-4">
          <FTextArea
            label="Description"
            value={form.description}
            onChange={field("description")}
            placeholder="Optional description"
          />
          <div className="grid grid-cols-2 gap-3">
            <FSelect
              label="Type"
              value={form.location_type}
              onChange={field("location_type")}
              options={LOCATION_TYPES}
              required
            />
            <FInput
              label="Code"
              value={form.code}
              onChange={field("code")}
              placeholder="e.g. LAB-01"
            />
          </div>
          <FInput
            label="Address"
            value={form.address}
            onChange={field("address")}
            placeholder="Street address"
          />
          <div className="grid grid-cols-2 gap-3">
            <FInput
              label="Latitude"
              type="number"
              value={form.latitude}
              onChange={field("latitude")}
              placeholder="e.g. 40.71280"
            />
            <FInput
              label="Longitude"
              type="number"
              value={form.longitude}
              onChange={field("longitude")}
              placeholder="e.g. -74.00600"
            />
          </div>
          <FSelect
            label="Parent Location"
            value={form.parent_location_id}
            onChange={field("parent_location_id")}
            options={parentOptions}
            placeholder="None (root)"
          />
          <FCheckbox
            label="Calibration laboratory"
            checked={form.is_calibration_lab}
            onChange={(v) => setForm((prev) => ({ ...prev, is_calibration_lab: v }))}
          />
          <div className="pt-1 border-t border-mar-border">
            <button
              type="button"
              onClick={() => setRemoveModalOpen(true)}
              disabled={saving || removing}
              className="flex items-center gap-1.5 px-3 py-1.5 text-red-500 hover:text-red-600 border border-red-300 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-950/30 text-xs font-medium rounded-lg transition-colors disabled:opacity-50"
            >
              <WarningIcon size={12} />
              Remove location
            </button>
          </div>
        </div>
      )}

      {/* Info grid (view mode only, non-empty fields) */}
      {!editing && infoCards.length > 0 && (
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-5">
          <div className="grid grid-cols-2 gap-3">
            {infoCards.map((card) => (
              <InfoCard key={card.label} label={card.label} value={card.value} />
            ))}
          </div>
        </div>
      )}

      {/* Map (view mode only) */}
      {!editing && mapSrc && (
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-mar-border">
            <div className="flex items-center gap-2 text-sm font-semibold text-mar-text">
              <MapPinIcon size={14} className="text-mar-accent" />
              Map
            </div>
            <a
              href={mapLink!}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-mar-accent transition-colors"
            >
              Open ↗
            </a>
          </div>
          <div className="h-72">
            <iframe
              src={mapSrc}
              className="w-full h-full border-0"
              loading="lazy"
              title={`Map for ${location.name}`}
            />
          </div>
        </div>
      )}
    </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// New location form
// ---------------------------------------------------------------------------

interface NewLocForm {
  name: string;
  location_type: string;
  description: string;
  code: string;
  address: string;
  latitude: string;
  longitude: string;
  parent_location_id: string;
  is_calibration_lab: boolean;
}

const EMPTY_NEW_FORM: NewLocForm = {
  name: "", location_type: "", description: "",
  code: "", address: "", latitude: "", longitude: "",
  parent_location_id: "", is_calibration_lab: false,
};

function NewLocationForm({
  allLocations,
  onCreated,
  onClose,
}: {
  allLocations: LocationItem[];
  onCreated: (fresh: LocationItem[]) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<NewLocForm>(EMPTY_NEW_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pathMap = useMemo(() => buildPathMap(allLocations), [allLocations]);
  const parentOptions = useMemo(
    () =>
      allLocations
        .map((l) => ({ value: l.id, label: pathMap.get(l.id) ?? l.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [allLocations, pathMap]
  );

  function field<K extends keyof NewLocForm>(key: K) {
    return (v: string) => setForm((prev) => ({ ...prev, [key]: v }));
  }

  async function handleCreate() {
    if (!form.name.trim()) { setError("Name is required"); return; }
    if (!form.location_type) { setError("Type is required"); return; }
    setError(null);
    setSaving(true);
    try {
      const orgId = await getMyOrganizationId();
      if (!orgId) { setError("Could not determine your organization. Contact an admin."); return; }
      const parseNum = (s: string): number | null => {
        if (!s.trim()) return null;
        const n = parseFloat(s);
        return isNaN(n) ? null : n;
      };
      await createLocation({
        organization_id: orgId,
        name: form.name.trim(),
        location_type: form.location_type,
        description: form.description.trim() || null,
        code: form.code.trim() || null,
        address: form.address.trim() || null,
        latitude: parseNum(form.latitude),
        longitude: parseNum(form.longitude),
        parent_location_id: form.parent_location_id || null,
        is_calibration_lab: form.is_calibration_lab,
      });
      const fresh = await listAllLocations();
      onCreated(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to create location");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs">
      {/* Form header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-mar-border">
        <p className="text-sm font-semibold text-mar-text">New Location</p>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-sm text-gray-400 hover:text-mar-text hover:bg-mar-surface-alt transition-colors"
          aria-label="Close"
        >
          <XIcon size={14} />
        </button>
      </div>

      {/* Fields */}
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <FInput
            label="Name"
            value={form.name}
            onChange={field("name")}
            required
            placeholder="Location name"
          />
          <FSelect
            label="Type"
            value={form.location_type}
            onChange={field("location_type")}
            options={LOCATION_TYPES}
            required
          />
        </div>
        <FTextArea
          label="Description"
          value={form.description}
          onChange={field("description")}
          placeholder="Optional description"
        />
        <div className="grid grid-cols-2 gap-3">
          <FInput
            label="Code"
            value={form.code}
            onChange={field("code")}
            placeholder="e.g. LAB-01"
          />
          <FSelect
            label="Parent Location"
            value={form.parent_location_id}
            onChange={field("parent_location_id")}
            options={parentOptions}
            placeholder="None (root)"
          />
        </div>
        <FInput
          label="Address"
          value={form.address}
          onChange={field("address")}
          placeholder="Street address"
        />
        <div className="grid grid-cols-2 gap-3">
          <FInput
            label="Latitude"
            type="number"
            value={form.latitude}
            onChange={field("latitude")}
            placeholder="e.g. 40.71280"
          />
          <FInput
            label="Longitude"
            type="number"
            value={form.longitude}
            onChange={field("longitude")}
            placeholder="e.g. -74.00600"
          />
        </div>
        <FCheckbox
          label="Calibration laboratory"
          checked={form.is_calibration_lab}
          onChange={(v) => setForm((prev) => ({ ...prev, is_calibration_lab: v }))}
        />

        {error && <p className="text-xs text-red-500">{error}</p>}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCreate}
            disabled={saving}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-medium rounded-lg transition-colors disabled:opacity-60"
          >
            <CheckIcon size={12} />
            {saving ? "Creating…" : "Create location"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LocationsPage() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id");

  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());
  const [newLocOpen, setNewLocOpen] = useState(false);

  useEffect(() => {
    listAllLocations()
      .then((data) => {
        setLocations(data);
        const byId = new Map(data.map((l) => [l.id, l]));
        const tree = buildTree(data);
        const ids = new Set<string>();
        for (const root of tree) {
          ids.add(root.id);
          for (const site of root.children) ids.add(site.id);
        }
        // If deep-linking to a specific location, expand all its ancestors
        if (initialId) {
          let cur = byId.get(initialId);
          while (cur?.parent_location_id) {
            ids.add(cur.parent_location_id);
            cur = byId.get(cur.parent_location_id);
          }
        }
        setExpanded(ids);
      })
      .catch(() => setError("Failed to load locations."))
      .finally(() => setLoading(false));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const tree = useMemo(() => buildTree(locations), [locations]);

  const inheritedCounts = useMemo(() => computeInheritedCounts(tree), [tree]);

  const selectedLocation = useMemo(
    () => locations.find((l) => l.id === selectedId) ?? null,
    [locations, selectedId]
  );

  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleEditSaved(fresh: LocationItem[]) {
    setLocations(fresh);
  }

  function handleLocationRemoved(fresh: LocationItem[]) {
    setLocations(fresh);
    setSelectedId(null);
  }

  function handleNewLocCreated(fresh: LocationItem[]) {
    setLocations(fresh);
    setNewLocOpen(false);
    // Auto-select the last item (newly created) and expand its ancestors
    const newest = fresh[fresh.length - 1];
    if (newest) setSelectedId(newest.id);
  }

  return (
    <div className="p-6 space-y-5">
      {/* Page header — floats over grid background */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-mar-text">Locations</h1>
          <p className="text-sm text-gray-400 mt-1">
            {loading
              ? "Loading…"
              : `${locations.length} location${locations.length !== 1 ? "s" : ""} across your organization`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setNewLocOpen(true)}
          className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
        >
          <PlusIcon size={13} />
          New location
        </button>
      </div>

      {/* New location form */}
      {newLocOpen && (
        <NewLocationForm
          allLocations={locations}
          onCreated={handleNewLocCreated}
          onClose={() => setNewLocOpen(false)}
        />
      )}

      {/* Two-panel layout */}
      <div className="flex gap-5 items-start">
        {/* Tree panel — floating card, scrolls independently */}
        <div className="w-72 shrink-0 bg-mar-surface rounded-xl border border-mar-border shadow-xs overflow-y-auto max-h-[calc(100vh-180px)] sticky top-0">

          <div className="p-2">
            {loading && <p className="text-xs text-gray-400 px-3 py-4">Loading…</p>}
            {error && <p className="text-xs text-red-500 px-3 py-4">{error}</p>}
            {!loading && !error && tree.length === 0 && (
              <p className="text-xs text-gray-400 px-3 py-4">No locations found.</p>
            )}
            {tree.map((root) => (
              <TreeItem
                key={root.id}
                node={root}
                selectedId={selectedId}
                onSelect={(loc) => setSelectedId(loc.id)}
                expanded={expanded}
                onToggle={toggleExpand}
                depth={0}
                inheritedCounts={inheritedCounts}
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 min-w-0">
          {selectedLocation ? (
            <LocationDetail
              key={selectedLocation.id}
              location={selectedLocation}
              allLocations={locations}
              onEditSaved={handleEditSaved}
              onRemoved={handleLocationRemoved}
              inheritedCount={inheritedCounts.get(selectedLocation.id) ?? selectedLocation.asset_count}
            />
          ) : (
            <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs flex items-center justify-center py-24">
              <div className="text-center">
                <LocationOrgIcon size={32} className="text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400">Select a location from the tree to view details.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
