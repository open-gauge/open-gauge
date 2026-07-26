"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/navigation";
import { listAuditLogs } from "@/services/audit_log.service";
import type { AuditLogEntry } from "@/types/audit_log";
import { AUDIT_ENTITY_STYLE } from "@/lib/tokens";
import { translateDynamic } from "@/lib/translate-dynamic";
import { ActivityDiff } from "@/components/activity-diff";
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

const ENTITY_FILTER_VALUES = ["", "asset", "calibration", "procedure", "location"] as const;

const ENTITY_ICON: Record<string, ReactNode> = {
  asset:       <AssetRegistryIcon size={11} />,
  calibration: <CheckCircleIcon size={11} />,
  procedure:   <ProceduresIcon size={11} />,
  location:    <MapPinIcon size={11} />,
};

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

function describeLog(log: AuditLogEntry): string {
  if (log.entity_asset_id) return log.entity_asset_id;
  const after = log.after_state as Record<string, unknown> | null;
  const before = log.before_state as Record<string, unknown> | null;
  const name = (after?.name as string | undefined) ?? (before?.name as string | undefined);
  if (name) return name;
  return log.entity_id ? `${log.entity_type} · ${log.entity_id.slice(0, 8)}` : log.entity_type;
}

function EntityBadge({ entityType }: { entityType: string }) {
  const t = useTranslations("tokens.auditEntity");
  const style = AUDIT_ENTITY_STYLE[entityType] ?? "bg-gray-50 text-gray-500 border-gray-100";
  const label = translateDynamic(t, entityType);
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border whitespace-nowrap ${style}`}>
      {ENTITY_ICON[entityType] ?? <ActivityIcon size={11} />}
      {label}
    </span>
  );
}

export default function ActivityPage() {
  const t = useTranslations("activity");
  const tEntity = useTranslations("tokens.auditEntity");
  const actionLabel = useActionLabel();
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
      setError(e instanceof Error ? e.message : t("errorLoadMore"));
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
          <h1 className="text-xl font-bold text-og-text">{t("title")}</h1>
          <p className="text-sm text-gray-400 mt-1">
            {loading ? t("loading") : t("entriesLoaded", { filtered: filtered.length, total: logs.length })}
          </p>
        </div>
      </div>

      {actorIdParam && (
        <div className="rounded-lg bg-og-surface border border-og-accent/30 px-4 py-2 flex items-center gap-2 text-xs text-og-text">
          <span className="text-og-accent font-semibold">{t("filteredByUser")}</span>
          <span className="text-gray-400">{t("filteredByUserHint")}</span>
          <Link href="/activity" className="ml-auto text-og-accent hover:underline">{t("clearFilter")}</Link>
        </div>
      )}

      {/* Toolbar */}
      <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="flex items-center gap-2 flex-1 px-3 py-1.5 bg-og-surface-alt border border-og-border-md rounded-lg">
            <SearchIcon size={13} className="text-gray-400 shrink-0" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={t("searchPlaceholder")}
              className="flex-1 bg-transparent text-xs text-og-text placeholder:text-gray-400 outline-hidden"
            />
          </div>
          <div className="flex items-center gap-1 p-1 bg-og-surface-alt border border-og-border rounded-lg">
            {ENTITY_FILTER_VALUES.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setEntityType(value)}
                className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                  entityType === value
                    ? "bg-og-surface text-og-text shadow-xs border border-og-border"
                    : "text-gray-400 hover:text-og-text"
                }`}
              >
                {value === "" ? t("allEntities") : tEntity(value)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-100 dark:border-red-900/50 px-4 py-3 text-sm text-red-600 dark:text-red-400">
          {t("errorLoad", { error })}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-gray-400">
          <span className="inline-block w-5 h-5 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin mr-3" />
          {t("loadingActivity")}
        </div>
      ) : (
        <div className="bg-og-surface rounded-xl border border-og-border shadow-xs overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-og-border">
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t("columnDate")}</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t("columnUser")}</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t("columnEntity")}</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider whitespace-nowrap">{t("columnAction")}</th>
                <th className="px-4 py-2.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{t("columnDescription")}</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-16 text-center text-sm text-gray-400">
                    {t("empty")}
                  </td>
                </tr>
              ) : (
                filtered.map((log) => {
                  const d = new Date(log.created_at);
                  const dateStr = d.toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" });
                  const timeStr = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
                  return (
                    <tr key={log.id} className="border-b border-og-border hover:bg-og-surface-alt transition-colors">
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="font-mono text-xs text-gray-500">{dateStr} {timeStr}</span>
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <UserMention
                          actorId={log.actor_id}
                          actorEmail={log.actor_email}
                          actorName={log.actor_name}
                          actorRole={log.actor_role}
                          actorProfilePictureUrl={log.actor_profile_picture_url}
                          className="text-xs"
                        />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <EntityBadge entityType={log.entity_type} />
                      </td>
                      <td className="px-4 py-2.5 whitespace-nowrap">
                        <span className="text-sm font-medium text-og-text">{actionLabel(log.action)}</span>
                      </td>
                      <td className="px-4 py-2.5 max-w-xs">
                        {log.before_state || log.after_state ? (
                          <ActivityDiff
                            before={log.before_state as Record<string, unknown> | null}
                            after={log.after_state as Record<string, unknown> | null}
                            entityType={log.entity_type}
                            variant="compact"
                          />
                        ) : (
                          <span className="text-xs font-mono text-gray-500">{describeLog(log)}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex items-center justify-center py-4 border-t border-og-border">
              <button
                type="button"
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium text-gray-600 dark:text-gray-300 border border-og-border-md rounded-lg hover:bg-og-surface-alt transition-colors disabled:opacity-50"
              >
                {loadingMore && <span className="w-3 h-3 border-2 border-og-accent/30 border-t-og-accent rounded-full animate-spin" />}
                {loadingMore ? t("loading") : t("loadMore")}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
