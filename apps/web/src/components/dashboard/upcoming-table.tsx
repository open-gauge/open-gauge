import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { CalibrationEvent } from "@/types/dashboard";
import { ExternalLinkIcon } from "@/components/icons";

function formatDaysUntil(
  dateStr: string,
  todayStr: string,
  t: ReturnType<typeof useTranslations>,
): { label: string; cls: string } {
  const todayMs = new Date(todayStr + "T00:00:00").getTime();
  const dueMs   = new Date(dateStr  + "T00:00:00").getTime();
  const diff    = Math.round((dueMs - todayMs) / 86_400_000);
  if (diff < 0)   return { label: t("overdue", { days: Math.abs(diff) }), cls: "text-red-500" };
  if (diff === 0) return { label: t("dueToday"),                         cls: "text-red-400" };
  if (diff <= 30) return { label: t("inDays", { days: diff }),           cls: "text-amber-500" };
  return               { label: t("inDays", { days: diff }),            cls: "text-gray-400" };
}

function toTodayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export default function UpcomingTable({ data }: { data: CalibrationEvent[] }) {
  const t = useTranslations("dashboard.upcoming");
  const todayStr = toTodayStr();
  // Closest due date first
  const sorted = [...data].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-5 h-full flex flex-col">
      <div className="flex items-start justify-between mb-4 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-og-text">{t("title")}</h3>
          <p className="text-xs text-gray-400 mt-0.5">{t("subtitle")}</p>
        </div>
        <Link
          href="/assets"
          className="text-xs text-gray-400 hover:text-og-accent flex items-center gap-1 transition-colors shrink-0"
        >
          {t("viewAll")}
          <ExternalLinkIcon />
        </Link>
      </div>

      {/* Scrollable list fills remaining panel height */}
      <div className="overflow-y-auto overflow-x-hidden flex-1 min-h-0 pr-1">
        {sorted.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">{t("empty")}</p>
        ) : (
          sorted.map((event, i) => {
            const { label, cls } = formatDaysUntil(event.due_date, todayStr, t);
            const dueDate = new Date(event.due_date + "T00:00:00");
            return (
              <Link
                key={i}
                href={`/assets/${event.id}`}
                className="flex items-center gap-4 py-3 border-b border-og-border last:border-0 hover:bg-og-surface-alt rounded-lg px-2 -mx-2 transition-colors"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-og-text truncate">{event.name}</span>
                    <span className="text-[10px] font-mono text-gray-400 bg-og-surface-alt px-1.5 py-0.5 rounded-sm shrink-0">
                      {event.asset_id}
                    </span>
                  </div>
                </div>
                <div className="shrink-0 text-right pr-2">
                  <p className="text-xs text-gray-500">
                    {dueDate.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}
                  </p>
                  <p className={`text-[11px] font-medium ${cls}`}>{label}</p>
                </div>
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}
