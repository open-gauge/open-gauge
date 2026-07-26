"use client";

import { useLocale, useTranslations } from "next-intl";
import { translateAuditFieldValue } from "@/lib/translate-dynamic";

interface ActivityDiffProps {
  before: Record<string, unknown> | null | undefined;
  after: Record<string, unknown> | null | undefined;
  /** Disambiguates entity-dependent fields, e.g. "role" (org membership role
   * vs. global user role) — see translateAuditFieldValue. */
  entityType?: string;
  /** "compact" shows the first `maxCompact` changes + a "+K more" tail (list
   * contexts); "full" (default) shows every change (detail contexts). */
  variant?: "compact" | "full";
  maxCompact?: number;
  className?: string;
}

interface DiffRow {
  key: string;
  label: string;
  before?: string;
  after?: string;
  isSummary: boolean;
}

// Namespacing convention set by app/utils/audit_diff.py on the backend:
// a matched channel's own field diffs are "channel.<id>.<field>"; a wholly
// added/removed channel is a single "channel.<id>" summary row.
const CHANNEL_FIELD_RE = /^channel\.([^.]+)\.(.+)$/;
const CHANNEL_SUMMARY_RE = /^channel\.([^.]+)$/;
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d+)?)?/;

function formatRawValue(
  value: unknown,
  locale: string,
  none: string,
  yes: string,
  no: string,
): string {
  if (value === null || value === undefined || value === "") return none;
  if (typeof value === "boolean") return value ? yes : no;
  if (typeof value === "string" && ISO_DATE_RE.test(value)) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) {
      return value.length > 10
        ? d.toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })
        : d.toLocaleDateString(locale, { dateStyle: "medium" });
    }
  }
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
}

/**
 * Renders a granular, translated field-level diff from an audit log entry's
 * before_state/after_state — see app/utils/audit_diff.py on the backend for
 * how those are built. Renders nothing if there's no genuine change to show.
 */
export function ActivityDiff({ before, after, entityType, variant = "full", maxCompact = 2, className }: ActivityDiffProps) {
  const tField = useTranslations("tokens.auditField");
  const tValue = useTranslations("tokens");
  const tCommon = useTranslations("common.activityDiff");
  const locale = useLocale();

  const keys = Array.from(
    new Set([...(before ? Object.keys(before) : []), ...(after ? Object.keys(after) : [])])
  );

  const none = tCommon("none");
  const yes = tCommon("yes");
  const no = tCommon("no");

  const rows: DiffRow[] = [];
  for (const key of keys) {
    const oldValue = before?.[key];
    const newValue = after?.[key];
    if (oldValue === newValue) continue; // skip no-op rows (e.g. a context field repeated in both states)

    const channelSummary = CHANNEL_SUMMARY_RE.exec(key);
    if (channelSummary) {
      const channel = channelSummary[1];
      const label = newValue === "added"
        ? tCommon("channelAdded", { channel })
        : tCommon("channelRemoved", { channel });
      rows.push({ key, label, isSummary: true });
      continue;
    }

    const channelField = CHANNEL_FIELD_RE.exec(key);
    const fieldName = channelField ? channelField[2] : key;
    const prefix = channelField ? `${channelField[1]}: ` : "";
    const fk = fieldName as Parameters<typeof tField>[0];
    const fieldLabel = tField.has(fk) ? tField(fk) : fieldName;

    const beforeStr = oldValue == null
      ? none
      : typeof oldValue === "string"
        ? translateAuditFieldValue(tValue, fieldName, oldValue, entityType)
        : formatRawValue(oldValue, locale, none, yes, no);
    const afterStr = newValue == null
      ? none
      : typeof newValue === "string"
        ? translateAuditFieldValue(tValue, fieldName, newValue, entityType)
        : formatRawValue(newValue, locale, none, yes, no);

    rows.push({ key, label: `${prefix}${fieldLabel}`, before: beforeStr, after: afterStr, isSummary: false });
  }

  if (rows.length === 0) return null;

  const visible = variant === "compact" ? rows.slice(0, maxCompact) : rows;
  const hiddenCount = rows.length - visible.length;

  return (
    <div className={`space-y-0.5 ${className ?? ""}`}>
      {visible.map((row) => (
        <div key={row.key} className="text-xs text-gray-500 dark:text-gray-400 truncate">
          {row.isSummary ? (
            row.label
          ) : (
            <>
              <span className="font-medium text-gray-600 dark:text-gray-300">{row.label}:</span>{" "}
              {row.before} → {row.after}
            </>
          )}
        </div>
      ))}
      {hiddenCount > 0 && (
        <div className="text-xs text-gray-400">{tCommon("moreChanges", { count: hiddenCount })}</div>
      )}
    </div>
  );
}
