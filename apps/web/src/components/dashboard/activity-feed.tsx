"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";

import type { ActivityItem } from "@/types/dashboard";
import { ExternalLinkIcon } from "@/components/icons";
import { UserMention } from "@/components/user-mention";

function timeAgo(iso: string, t: ReturnType<typeof useTranslations>): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return t("minAgo", { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t("hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  return days === 1 ? t("yesterday") : t("daysAgo", { count: days });
}

function humanAction(action: string): string {
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
    return t.has(k) ? t(k) : humanAction(action);
  };
}

export default function ActivityFeed({ data }: { data: ActivityItem[] }) {
  const t = useTranslations("dashboard.activity");
  const actionLabel = useActionLabel();
  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-5 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-og-text">{t("title")}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t("subtitle")}</p>
        </div>
        <Link
          href="/activity"
          className="text-xs text-gray-400 hover:text-og-accent flex items-center gap-1 transition-colors shrink-0"
        >
          {t("viewAll")}
          <ExternalLinkIcon />
        </Link>
      </div>

      {/* Scrollable list */}
      <ul className="space-y-3 overflow-y-auto flex-1 pr-0.5">
        {data.map((item, i) => (
          <li key={i} className="flex gap-3 text-xs">
            <span className="mt-1.5 w-1.5 h-1.5 shrink-0 rounded-full bg-og-accent" />
            <div className="leading-relaxed min-w-0">
              <UserMention
                actorId={item.actor_id}
                actorEmail={item.actor_email}
                actorName={item.actor_name}
                actorRole={item.actor_role}
              />{" "}
              <span className="text-gray-500">{actionLabel(item.action)}</span>
              {item.entity_asset_id && (
                <span className="ml-1 font-mono text-[10px] text-gray-400 bg-og-surface-alt px-1 rounded-sm">
                  {item.entity_asset_id}
                </span>
              )}
              <p className="text-gray-400 mt-0.5">{timeAgo(item.created_at, t)}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
