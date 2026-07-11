"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { listAuditLogs } from "@/services/audit_log.service";
import type { AuditLogEntry } from "@/types/audit_log";
import { AUDIT_ENTITY_LABEL, AUDIT_ENTITY_STYLE } from "@/lib/tokens";
import {
  ActivityIcon,
  AssetRegistryIcon,
  CheckCircleIcon,
  MapPinIcon,
  ProceduresIcon,
  SearchIcon,
} from "@/components/icons";
import { UserMention } from "@/components/user-mention";

const LIMIT = 50;

const ENTITY_FILTERS: { value: string; label: string }[] = [
  { value: "",            label: "All" },
  { value: "asset",       label: "Asset" },
  { value: "calibration", label: "Calibration" },
  { value: "procedure",   label: "Procedure" },
  { value: "location",    label: "Location" },
];

const ENTITY_ICON: Record<string, ReactNode> = {
  asset:       <AssetRegistryIcon size={11} />,
  calibration: <CheckCircleIcon size={11} />,
  procedure:   <ProceduresIcon size={11} />,
  location:    <MapPinIcon size={11} />,
};

function actionLabel(action: string): string {
  return action
    .replace(/\./g, " ")
    .replace(/_/g, " ")
    .split(" ")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

function describeLog(log: AuditLogEntry): string {
  if (log.entity_asset_id) return log.entity_asset_id;
  const after = log.after_state as Record<string, unknown> | null;
  const before = log.before_state as Record<string, unknown> | null;
  const name = (after?.name as string | undefined) ?? (before?.name as string | undefined);
  if (name) return name;
  return log.entity_id ? `${log.entity_type} · ${log.entity_id.slice(0, 8)}` : log.entity_type;
}

function EntityBadge({ entityType }: { entityType: string }) {
  const style = AUDIT_ENTITY_STYLE[entityType] ?? "bg-gray-50 text-gray-500 border-gray-100";
  const label = AUDIT_ENTITY_LABEL[entityType] ?? entityType;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${style}`}>
      {ENTITY_ICON[entityType] ?? <ActivityIcon size={11} />}
      {label}
    </span>
  );
}

export default function ActivityPage() {
  const searchParams = useSearchParams();
  const actorIdParam = searchParams.get("actor_id") ?? undefined;

  const [logs, setLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [entityType, setEntityType] = useState("");
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError(null);
    listAuditLogs({ skip: 0, limit: LIMIT, entity_type: entityType || undefined, actor_id: actorIdParam })
      .then((data) => {
        setLogs(data);
        setHasMore(data.length === LIMIT);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [entityType, actorIdParam]);

  async function handleLoadMore() {
    setLoadingMore(true);
    try {
      const next = await listAuditLogs({ skip: logs.length, limit: LIMIT, entity_type: entityType || undefined, actor_id: actorIdParam });
      setLogs((prev) => [...prev, ...next]);
      setHasMore(next.length === LIMIT);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load more entries");
    } finally {
      setLoadingMore(false);
    }
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    if (!q) return logs;
    return logs.filter((log) =>
      log.actor_email.toLowerCase().includes(q) ||
      (log.actor_name?.toLowerCase().includes(q) ?? false) ||
      log.action.toLowerCase().includes(q) ||
      (log.entity_asset_id?.toLowerCase().includes(q) ?? false) ||
      log.entity_type.toLowerCase().includes(q)
    );
  }, [logs, search]);

  return (
    <div className="p-6 space-y-5">
      {/* Page header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-mar-text">Activity log</h1>
          <p className="text-sm text-gray-400 mt-1">
            {loading ? "Loading…" : `${filtered.length} of ${logs.length} entries loaded`}
          </p>
        </div>
      </div>

      {actorIdParam && (
        <div className="rounded-lg bg-mar-surface border border-mar-accent/30 px-4 py-2 flex items-center gap-2 text-xs text-mar-text">
          <span className="text-mar-accent font-semibold">Filtered by user</span>
          <span className="text-gray-400">Showing activity for a specific user.</span>
          <a href="/activity" className="ml-auto text-mar-accent hover:underline">Clear filter</a>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-1.5 bg-mar-surface-alt border border-mar-border-md rounded-lg">
            <SearchIcon size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by user, action, asset ID…"
              className="flex-1 bg-transparent text-xs text-mar-text placeholder:text-gray-400 outline-hidden"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-mar-surface-alt border border-mar-border rounded-lg">
            {ENTITY_FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setEntityType(f.value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  entityType === f.value
                    ? "bg-mar-surface text-mar-text shadow-xs border border-mar-border"
                    : "text-gray-400 hover:text-mar-text"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          Failed to load activity: {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span className="inline-block w-5 h-5 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin mr-3" />
          Loading activity…
        </div>
      ) : (
        <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-mar-border">
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Date</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">User</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Entity</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">Action</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-sm text-gray-400">
                    No activity recorded yet.
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const d = new Date(log.created_at);
                  const dateStr = d.toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
                  const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <tr key={log.id} className="border-b border-mar-border hover:bg-mar-surface-alt transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-500">{dateStr} {timeStr}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <UserMention
                          actorId={log.actor_id}
                          actorEmail={log.actor_email}
                          actorName={log.actor_name}
                          actorRole={log.actor_role}
                          className="text-xs"
                        />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <EntityBadge entityType={log.entity_type} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-sm font-medium text-mar-text">{actionLabel(log.action)}</span>
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-xs font-mono text-gray-500">{describeLog(log)}</span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex items-center justify-center py-4 border-t border-mar-border">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-mar-border-md rounded-lg hover:bg-mar-surface-alt transition-colors disabled:opacity-50"
              >
                {loadingMore && <span className="w-3 h-3 border-2 border-mar-accent/30 border-t-mar-accent rounded-full animate-spin" />}
                {loadingMore ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
