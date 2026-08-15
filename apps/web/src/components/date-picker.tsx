"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { CalendarIcon, ChevronLeftIcon, ChevronRightIcon } from "@/components/icons";
import {
  buildCalendarGrid,
  formatDisplayDate,
  monthYearLabel,
  parseISODate,
  sameDay,
  shortMonthLabel,
  toISODate,
  weekdayLabels,
} from "@/lib/date";

interface DatePickerProps {
  /** ISO `YYYY-MM-DD`, or `""` when empty. */
  value: string;
  onChange: (value: string) => void;
  /** ISO `YYYY-MM-DD` bounds — days outside the range render disabled. */
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Switches to the error border/ring, same as the app's IB_ERR pattern. */
  invalid?: boolean;
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * Standard date input, replacing a raw `<input type="date">` app-wide. See UI.md's Date Picker
 * section.
 *
 * A field styled like every other input (calendar icon on the right, same border/focus tokens)
 * that opens a popover calendar on click rather than the OS's native date picker — month
 * navigation, a day grid with circular today/selected markers in `og-accent`, and a month/year
 * quick-jump view. The field itself is a button, not editable text: typing a date directly isn't
 * supported, only picking one from the calendar, which sidesteps locale-format ambiguity
 * (`07/10/2024`: July 10th or 10th of July?) entirely.
 */
export function DatePicker({
  value, onChange, min, max, placeholder, disabled, readOnly, invalid, className = "", id, ...rest
}: DatePickerProps) {
  const locale = useLocale();
  const t = useTranslations("common.datePicker");
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"days" | "months">("days");
  const ref = useRef<HTMLDivElement>(null);

  const selected = parseISODate(value);
  const today = new Date();
  const [cursor, setCursor] = useState(() => selected ?? today);

  useEffect(() => {
    if (!open) setCursor(selected ?? today);
    // Only re-sync from the controlled value while the popover is closed — otherwise
    // navigating months while it's open would keep getting reset.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, open]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
        setView("days");
      }
    };
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        setView("days");
      }
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", escHandler);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", escHandler);
    };
  }, [open]);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const minDate = parseISODate(min);
  const maxDate = parseISODate(max);
  const inactive = disabled || readOnly;

  function isDayDisabled(day: number): boolean {
    const d = new Date(year, month, day);
    if (minDate && d < minDate) return true;
    if (maxDate && d > maxDate) return true;
    return false;
  }

  function selectDay(day: number) {
    onChange(toISODate(year, month, day));
    setOpen(false);
    setView("days");
  }

  function goToday() {
    setCursor(today);
    onChange(toISODate(today.getFullYear(), today.getMonth(), today.getDate()));
    setOpen(false);
    setView("days");
  }

  const displayText = selected ? formatDisplayDate(locale, selected) : "";
  const cells = buildCalendarGrid(year, month);
  const weekdays = weekdayLabels(locale);

  return (
    <div className={`relative w-full max-w-64 ${className}`} ref={ref}>
      <button
        type="button"
        id={id}
        disabled={inactive}
        onClick={() => {
          setOpen((v) => !v);
          setView("days");
        }}
        title={displayText || placeholder}
        className={`w-full flex items-center justify-between gap-2 pl-3 pr-2.5 py-2 rounded-lg border text-sm text-left bg-og-surface focus:outline-hidden focus:ring-1 transition-colors ${
          invalid
            ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
            : "border-og-border-md focus:border-og-accent focus:ring-og-accent/20"
        } ${inactive ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        {...rest}
      >
        <span className={`truncate ${selected ? "text-og-text" : "text-gray-400 dark:text-gray-600"}`}>
          {displayText || placeholder || t("placeholder")}
        </span>
        <CalendarIcon size={14} className="shrink-0 text-gray-400" />
      </button>

      {open && !inactive && (
        <div
          role="dialog"
          aria-label={t("selectDate")}
          className="absolute left-0 top-full mt-1 w-72 bg-og-surface border border-og-border rounded-lg shadow-lg z-50 p-3"
        >
          {view === "days" ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <button
                  type="button"
                  onClick={() => setView("months")}
                  className="text-xs font-semibold text-og-text hover:text-og-accent transition-colors capitalize"
                >
                  {monthYearLabel(locale, year, month)}
                </button>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCursor(new Date(year, month - 1, 1))}
                    aria-label={t("previousMonth")}
                    className="p-1 rounded-md text-gray-400 hover:text-og-accent hover:bg-og-surface-alt transition-colors"
                  >
                    <ChevronLeftIcon size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor(new Date(year, month + 1, 1))}
                    aria-label={t("nextMonth")}
                    className="p-1 rounded-md text-gray-400 hover:text-og-accent hover:bg-og-surface-alt transition-colors"
                  >
                    <ChevronRightIcon size={14} />
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-7 gap-y-1 text-center">
                {weekdays.map((w, i) => (
                  <span key={i} className="text-[10px] font-semibold uppercase text-gray-400 py-1">{w}</span>
                ))}
                {cells.map((day, i) => {
                  if (day == null) return <span key={i} />;
                  const cellDate = new Date(year, month, day);
                  const isSelected = selected != null && sameDay(cellDate, selected);
                  const isToday = sameDay(cellDate, today);
                  const dayDisabled = isDayDisabled(day);
                  return (
                    <button
                      key={i}
                      type="button"
                      disabled={dayDisabled}
                      onClick={() => selectDay(day)}
                      className={`mx-auto flex h-7 w-7 items-center justify-center rounded-full text-xs transition-colors ${
                        isSelected
                          ? "bg-og-accent text-white font-semibold"
                          : dayDisabled
                            ? "text-gray-300 dark:text-gray-700 cursor-not-allowed"
                            : isToday
                              ? "border border-og-accent text-og-accent"
                              : "text-og-text hover:bg-og-surface-alt"
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>

              <div className="flex justify-start mt-2 pt-2 border-t border-og-border">
                <button type="button" onClick={goToday} className="text-xs font-medium text-og-accent hover:underline">
                  {t("today")}
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-semibold text-og-text">{year}</span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCursor(new Date(year - 1, month, 1))}
                    aria-label={t("previousYear")}
                    className="p-1 rounded-md text-gray-400 hover:text-og-accent hover:bg-og-surface-alt transition-colors"
                  >
                    <ChevronLeftIcon size={14} />
                  </button>
                  <button
                    type="button"
                    onClick={() => setCursor(new Date(year + 1, month, 1))}
                    aria-label={t("nextYear")}
                    className="p-1 rounded-md text-gray-400 hover:text-og-accent hover:bg-og-surface-alt transition-colors"
                  >
                    <ChevronRightIcon size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1">
                {Array.from({ length: 12 }, (_, m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setCursor(new Date(year, m, 1));
                      setView("days");
                    }}
                    className={`rounded-md py-2 text-xs transition-colors capitalize ${
                      m === month ? "bg-og-accent text-white font-semibold" : "text-og-text hover:bg-og-surface-alt"
                    }`}
                  >
                    {shortMonthLabel(locale, year, m)}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
