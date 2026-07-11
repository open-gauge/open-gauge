"use client";

import { useState } from "react";
import type { CalendarEvent } from "@/types/dashboard";
import { getCalendarEvents } from "@/services/dashboard.service";
import { ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MONTH_SHORT = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const DAY_LABELS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function formatDisplayDate(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString("en-GB", { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
}

type Grouped = Record<string, CalendarEvent[]>;

function groupByDate(events: CalendarEvent[]): Grouped {
  const map: Grouped = {};
  for (const e of events) {
    if (!map[e.date]) map[e.date] = [];
    map[e.date].push(e);
  }
  return map;
}

// Priority: performed > expired > upcoming > none
function getCellStatus(
  dateStr: string,
  grouped: Grouped,
  todayStr: string,
): "none" | "performed" | "upcoming" | "expired" {
  const events = grouped[dateStr];
  if (!events || events.length === 0) return "none";

  for (const e of events) {
    if (e.event_type === "performed") return "performed";
  }
  for (const e of events) {
    if (e.event_type === "due" && e.date < todayStr) return "expired";
  }
  return "upcoming";
}

const STATUS_BG: Record<string, string> = {
  none:      "bg-mar-border",
  performed: "bg-teal-400",
  upcoming:  "bg-amber-400",
  expired:   "bg-red-400",
};

// Build the 2D grid for a year: weeks[wi][di] = dateStr | null
interface CalendarGrid {
  weeks: (string | null)[][];
  monthLabels: Record<number, string>; // wi → month abbreviation
}

function buildGrid(year: number): CalendarGrid {
  const jan1 = new Date(year, 0, 1);
  const dec31 = new Date(year, 11, 31);

  // Mon=0 … Sun=6
  const jan1Dow = (jan1.getDay() + 6) % 7;
  const dec31Dow = (dec31.getDay() + 6) % 7;

  const start = new Date(jan1);
  start.setDate(jan1.getDate() - jan1Dow);
  const end = new Date(dec31);
  end.setDate(dec31.getDate() + (6 - dec31Dow));

  const weeks: (string | null)[][] = [];
  const monthLabels: Record<number, string> = {};
  let cur = new Date(start);
  let wi = 0;

  while (cur <= end) {
    const week: (string | null)[] = [];
    for (let di = 0; di < 7; di++) {
      if (cur.getFullYear() === year) {
        const ds = toDateStr(cur);
        week.push(ds);
        if (cur.getDate() === 1) monthLabels[wi] = MONTH_SHORT[cur.getMonth()];
      } else {
        week.push(null);
      }
      cur = new Date(cur);
      cur.setDate(cur.getDate() + 1);
    }
    weeks.push(week);
    wi++;
  }

  return { weeks, monthLabels };
}

// ---------------------------------------------------------------------------
// Tooltip state
// ---------------------------------------------------------------------------

interface TooltipState {
  x: number;
  y: number;
  day: string;
  events: CalendarEvent[];
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

interface Props {
  initialEvents: CalendarEvent[];
  initialYear: number;
}

export default function CalibrationCalendar({ initialEvents, initialYear }: Props) {
  const today = new Date();
  const todayStr = toDateStr(today);

  const [year, setYear] = useState(initialYear);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [loading, setLoading] = useState(false);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  const { weeks, monthLabels } = buildGrid(year);
  const grouped = groupByDate(events);

  async function changeYear(newYear: number) {
    setYear(newYear);
    setLoading(true);
    try {
      const data = await getCalendarEvents(newYear);
      setEvents(data);
    } finally {
      setLoading(false);
    }
  }

  function handleCellEnter(e: React.MouseEvent<HTMLDivElement>, day: string, dayEvents: CalendarEvent[]) {
    if (dayEvents.length === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setTooltip({ x: rect.left + rect.width / 2, y: rect.top, day, events: dayEvents });
  }

  return (
    /* w-fit: panel shrinks to the natural calendar width — no wasted space */
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-xs p-5 w-fit flex flex-col">
      {/* Title row */}
      <div className="mb-3 shrink-0">
        <h3 className="text-sm font-semibold text-mar-text">Calibration activity</h3>
        <p className="text-xs text-gray-400 mt-0.5">Performed calibrations and due dates across all assets</p>
      </div>

      {/* Year navigator — right-aligned, sits directly above the grid */}
      <div className="flex justify-end items-center gap-1 mb-1.5 shrink-0">
        <button
          onClick={() => changeYear(year - 1)}
          disabled={loading}
          className="p-1 rounded-sm hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors disabled:opacity-40"
          aria-label="Previous year"
        >
          <ChevronLeftIcon size={13} />
        </button>
        <span className="text-xs font-semibold text-mar-text w-9 text-center tabular-nums">{year}</span>
        <button
          onClick={() => changeYear(year + 1)}
          disabled={loading}
          className="p-1 rounded-sm hover:bg-mar-surface-alt text-gray-400 hover:text-mar-text transition-colors disabled:opacity-40"
          aria-label="Next year"
        >
          <ChevronRightIcon size={13} />
        </button>
      </div>

      {/* Calendar grid */}
      <div className="overflow-x-auto shrink-0">
        <div className="flex gap-2 items-start" style={{ minWidth: "fit-content" }}>
          {/* Day-of-week labels */}
          <div className="flex flex-col" style={{ paddingTop: 20 }}>
            {DAY_LABELS.map((label, di) => (
              <div
                key={di}
                className="text-[10px] text-gray-400 flex items-center justify-end pr-1.5"
                style={{ height: 12, marginBottom: 2 }}
              >
                {label}
              </div>
            ))}
          </div>

          {/* Weeks columns */}
          <div className="flex flex-col gap-0">
            {/* Month labels row */}
            <div className="flex gap-0.5 mb-1">
              {weeks.map((_, wi) => (
                <div
                  key={wi}
                  className="text-[10px] text-gray-400 truncate"
                  style={{ width: 12, height: 16 }}
                >
                  {monthLabels[wi] ?? ""}
                </div>
              ))}
            </div>

            {/* Day cells: render row by row (di=0..6) across all weeks */}
            {Array.from({ length: 7 }, (_, di) => (
              <div key={di} className="flex gap-0.5 mb-0.5">
                {weeks.map((week, wi) => {
                  const dateStr = week[di];
                  if (!dateStr) {
                    return <div key={wi} style={{ width: 12, height: 12 }} />;
                  }

                  const isToday = dateStr === todayStr;
                  const dayEvents = grouped[dateStr] ?? [];
                  const status = getCellStatus(dateStr, grouped, todayStr);
                  const bgClass = STATUS_BG[status];

                  return (
                    <div
                      key={wi}
                      className={[
                        "rounded-xs cursor-default transition-opacity",
                        bgClass,
                        isToday ? "ring-1 ring-offset-1 ring-mar-accent" : "",
                        loading ? "opacity-50" : "opacity-100",
                        dayEvents.length > 0 ? "hover:opacity-80" : "",
                      ].join(" ")}
                      style={{ width: 12, height: 12 }}
                      onMouseEnter={(e) => handleCellEnter(e, dateStr, dayEvents)}
                      onMouseLeave={() => setTooltip(null)}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-5 mt-4 pt-3 border-t border-mar-border">
        <span className="text-[10px] text-gray-400"></span>
        {(["none", "performed", "upcoming", "expired"] as const).map((s) => (
          <span key={s} className="flex items-center gap-1.5 text-[10px] text-gray-400">
            <span className={`w-2.5 h-2.5 rounded-xs ${STATUS_BG[s]}`} />
            {{ none: "No events", performed: "Calibrated", upcoming: "Upcoming due", expired: "Overdue" }[s]}
          </span>
        ))}
        <span className="text-[10px] text-gray-400"></span>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-900 text-white rounded-lg px-3 py-2 shadow-xl pointer-events-none"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            transform: "translate(-50%, calc(-100% - 10px))",
            maxWidth: 260,
            minWidth: 160,
          }}
        >
          <p className="text-[11px] font-semibold mb-1.5 text-gray-200">
            {formatDisplayDate(tooltip.day)}
          </p>
          <div className="space-y-1">
            {tooltip.events.map((e, i) => {
              const isPerformed = e.event_type === "performed";
              const isExpired = e.event_type === "due" && e.date < todayStr;
              const dotCls = isPerformed ? "text-teal-400" : isExpired ? "text-red-400" : "text-amber-400";
              const typeLabel = isPerformed ? "Calibrated" : isExpired ? "Overdue" : "Due";
              return (
                <div key={i} className="flex items-start gap-1.5">
                  <span className={`text-[10px] font-bold mt-px ${dotCls}`}>●</span>
                  <div>
                    <span className="text-[10px] font-mono text-gray-300">{e.asset_id}</span>
                    <span className="text-[10px] text-gray-400"> · {typeLabel}</span>
                    <p className="text-[9px] text-gray-500 leading-tight">{e.name}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
