"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ChevronDownIcon,
  ChevronRightIcon,
  EditIcon,
  LocationLabIcon,
  LocationOrgIcon,
  LocationSiteIcon,
  MapPinIcon,
  PlusIcon,
} from "@/components/icons";
import { listAllLocations } from "@/services/location.service";
import type { LocationItem, LocationTreeNode } from "@/types/location";

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
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  function sortNodes(nodes: LocationTreeNode[]) {
    nodes.sort((a, b) => a.name.localeCompare(b.name));
    for (const n of nodes) sortNodes(n.children);
  }
  sortNodes(roots);
  return roots;
}

// ---------------------------------------------------------------------------
// Location type helpers
// ---------------------------------------------------------------------------

const TYPE_BADGE: Record<string, string> = {
  organization: "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300",
  site:         "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
  laboratory:   "bg-teal-100 text-teal-700 dark:bg-teal-900/30 dark:text-teal-300",
};

function TypeIcon({ type, size = 13 }: { type: string; size?: number }) {
  const t = type.toLowerCase();
  if (t === "organization") return <LocationOrgIcon size={size} />;
  if (t === "site")         return <LocationSiteIcon size={size} />;
  return <LocationLabIcon size={size} />;
}

// ---------------------------------------------------------------------------
// Tree node component
// ---------------------------------------------------------------------------

function TreeItem({
  node,
  selectedId,
  onSelect,
  expanded,
  onToggle,
  depth,
}: {
  node: LocationTreeNode;
  selectedId: string | null;
  onSelect: (loc: LocationItem) => void;
  expanded: Set<string>;
  onToggle: (id: string) => void;
  depth: number;
}) {
  const hasChildren = node.children.length > 0;
  const isExpanded = expanded.has(node.id);
  const isSelected = selectedId === node.id;

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
        <span className="w-3.5 h-3.5 flex-shrink-0 flex items-center justify-center text-gray-400">
          {hasChildren ? (
            isExpanded ? <ChevronDownIcon size={11} /> : <ChevronRightIcon size={11} />
          ) : null}
        </span>

        <span className={`flex-shrink-0 ${isSelected ? "text-mar-accent" : "text-gray-400"}`}>
          <TypeIcon type={node.location_type} size={13} />
        </span>

        <span className="flex-1 truncate text-xs">{node.name}</span>

        {node.asset_count > 0 && (
          <span className={`text-[10px] tabular-nums flex-shrink-0 ${isSelected ? "text-mar-accent/80" : "text-gray-400"}`}>
            {node.asset_count}
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
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Detail panel
// ---------------------------------------------------------------------------

function InfoCard({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-4 py-3">
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className="text-sm text-mar-text">{value}</p>
    </div>
  );
}

function LocationDetail({ location }: { location: LocationItem }) {
  const typeLower = location.location_type.toLowerCase();
  const badgeClass = TYPE_BADGE[typeLower] ?? "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400";
  const hasMap = location.latitude != null && location.longitude != null;

  const mapSrc = hasMap
    ? `https://www.openstreetmap.org/export/embed.html?bbox=${location.longitude! - 0.02},${location.latitude! - 0.015},${location.longitude! + 0.02},${location.latitude! + 0.015}&layer=mapnik&marker=${location.latitude},${location.longitude}`
    : null;

  const mapLink = hasMap
    ? `https://www.openstreetmap.org/?mlat=${location.latitude}&mlon=${location.longitude}#map=15/${location.latitude}/${location.longitude}`
    : null;

  return (
    <div className="flex flex-col gap-5">
      {/* Header card */}
      <div className="bg-mar-surface rounded-xl border border-mar-border p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-3 flex-wrap">
              <span className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wide ${badgeClass}`}>
                {location.location_type}
              </span>
              {location.code && (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-mar-surface-alt border border-mar-border-md text-gray-500">
                  {location.code}
                </span>
              )}
            </div>
            <h2 className="text-xl font-bold text-mar-text leading-tight">{location.name}</h2>
            {location.description && (
              <p className="mt-2 text-sm text-gray-500 leading-relaxed">{location.description}</p>
            )}
          </div>

          <div className="flex items-start gap-2 flex-shrink-0">
            {location.asset_count > 0 && (
              <Link
                href={`/assets?location_id=${location.id}&location_name=${encodeURIComponent(location.name)}`}
                className="text-right hover:opacity-80 transition-opacity group"
              >
                <p className="text-3xl font-bold text-mar-text tabular-nums group-hover:text-mar-accent transition-colors">
                  {location.asset_count}
                </p>
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 group-hover:text-mar-accent transition-colors">
                  Assets ↗
                </p>
              </Link>
            )}
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors"
            >
              <EditIcon size={12} />
              Edit
            </button>
          </div>
        </div>
      </div>

      {/* Info grid */}
      <div className="grid grid-cols-2 gap-3">
        <InfoCard label="Location Type" value={location.location_type} />
        <InfoCard label="Code" value={location.code ?? <span className="text-gray-400">—</span>} />
        <InfoCard
          label="Address"
          value={location.address ?? <span className="text-gray-400">—</span>}
        />
        <InfoCard
          label="GPS Coordinates"
          value={
            hasMap ? (
              <span className="font-mono text-xs">
                {location.latitude!.toFixed(5)},&nbsp;{location.longitude!.toFixed(5)}
              </span>
            ) : (
              <span className="text-gray-400">—</span>
            )
          }
        />
      </div>

      {/* Map */}
      {mapSrc && (
        <div className="bg-mar-surface rounded-xl border border-mar-border overflow-hidden">
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
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LocationsPage() {
  const [locations, setLocations] = useState<LocationItem[]>([]);
  const [loading, setLoading]     = useState(true);
  const [error, setError]         = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [expanded, setExpanded]   = useState<Set<string>>(new Set());

  useEffect(() => {
    listAllLocations()
      .then((data) => {
        setLocations(data);
        const tree = buildTree(data);
        const ids = new Set<string>();
        for (const root of tree) {
          ids.add(root.id);
          for (const site of root.children) ids.add(site.id);
        }
        setExpanded(ids);
      })
      .catch(() => setError("Failed to load locations."))
      .finally(() => setLoading(false));
  }, []);

  const tree = useMemo(() => buildTree(locations), [locations]);

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

  return (
    <div className="flex flex-col h-full">
      {/* Page header */}
      <div className="px-6 py-5 border-b border-mar-border bg-mar-surface flex-shrink-0">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-mar-text">Locations</h1>
            <p className="text-sm text-gray-400 mt-1">
              {loading ? "Loading…" : `${locations.length} location${locations.length !== 1 ? "s" : ""} across your organization`}
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-1.5 px-3 py-2 bg-mar-action hover:bg-mar-action-dark text-white text-xs font-medium rounded-lg transition-colors"
          >
            <PlusIcon size={13} />
            New location
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex overflow-hidden">
        {/* Tree panel */}
        <div className="w-72 flex-shrink-0 border-r border-mar-border bg-mar-surface overflow-y-auto">
          <div className="px-3 py-3 border-b border-mar-border">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400">Hierarchy</p>
          </div>

          <div className="p-2">
            {loading && (
              <p className="text-xs text-gray-400 px-3 py-4">Loading…</p>
            )}
            {error && (
              <p className="text-xs text-red-500 px-3 py-4">{error}</p>
            )}
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
              />
            ))}
          </div>
        </div>

        {/* Detail panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedLocation ? (
            <LocationDetail location={selectedLocation} />
          ) : (
            <div className="h-full flex items-center justify-center">
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
