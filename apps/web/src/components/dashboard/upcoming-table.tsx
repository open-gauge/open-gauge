import type { CalibrationEvent } from "@/types/dashboard";
import { ExternalLinkIcon } from "@/components/icons";

function formatDaysUntil(dateStr: string, todayStr: string): { label: string; cls: string } {
  const todayMs = new Date(todayStr + "T00:00:00").getTime();
  const dueMs   = new Date(dateStr  + "T00:00:00").getTime();
  const diff = Math.round((dueMs - todayMs) / 86_400_000);
  if (diff < 0)  return { label: `${Math.abs(diff)}d overdue`, cls: "text-red-500" };
  if (diff === 0) return { label: "Due today",                 cls: "text-red-400" };
  if (diff <= 30) return { label: `In ${diff} days`,           cls: "text-amber-500" };
  return               { label: `In ${diff} days`,             cls: "text-gray-400" };
}

function toTodayStr(): string {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
}

export default function UpcomingTable({ data }: { data: CalibrationEvent[] }) {
  const todayStr = toTodayStr();
  const sorted = [...data].sort((a, b) => a.due_date.localeCompare(b.due_date));

  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-5">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-mar-text">Upcoming calibrations</h3>
          <p className="text-xs text-gray-400 mt-0.5">Scheduled due dates across all assets</p>
        </div>
        <a
          href="/assets"
          className="text-xs text-gray-400 hover:text-mar-accent flex items-center gap-1 transition-colors"
        >
          View assets
          <ExternalLinkIcon />
        </a>
      </div>

      <div className="space-y-0">
        {sorted.length === 0 ? (
          <p className="text-center text-xs text-gray-400 py-6">No calibrations scheduled</p>
        ) : (
          sorted.map((event, i) => {
            const { label, cls } = formatDaysUntil(event.due_date, todayStr);
            const dueDate = new Date(event.due_date + "T00:00:00");
            return (
              <div
                key={i}
                className="flex items-center gap-4 py-3 border-b border-mar-border last:border-0"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-mar-text truncate">{event.name}</span>
                    <span className="text-[10px] font-mono text-gray-400 bg-mar-surface-alt px-1.5 py-0.5 rounded flex-shrink-0">
                      {event.asset_id}
                    </span>
                  </div>
                </div>
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs text-gray-500">
                    {dueDate.toLocaleDateString("en-GB", {
                      day: "2-digit",
                      month: "short",
                      year: "numeric",
                    })}
                  </p>
                  <p className={`text-[11px] font-medium ${cls}`}>{label}</p>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
