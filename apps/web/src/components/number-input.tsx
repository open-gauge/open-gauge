"use client";

import { ChevronUpIcon, ChevronDownIcon } from "@/components/icons";

interface NumberInputProps {
  value: string;
  onChange: (v: string) => void;
  min?: number;
  max?: number;
  /** Passed through to the native `step` attribute (keyboard arrow keys and
   * the mouse scroll-wheel honor it natively) — also the increment used by
   * the custom chevron buttons when it's a plain number. `"any"` (the
   * default) keeps free-decimal entry and steps the buttons by 1. */
  step?: number | "any";
  placeholder?: string;
  disabled?: boolean;
  readOnly?: boolean;
  /** Switches to the error border/ring, same as the app's IB_ERR pattern. */
  invalid?: boolean;
  className?: string;
  id?: string;
  title?: string;
  "aria-label"?: string;
}

/**
 * Standard numeric input, replacing a raw `<input type="number">` app-wide.
 * See UI.md's Compact Numeric Inputs section.
 *
 * Hides the browser's native spinner (via the `og-no-spin` utility in
 * globals.css) and renders two small theme-aware chevron buttons instead —
 * the native spinner is unstyleable beyond hide/show, so a custom pair is
 * the only way to make it look like part of the app rather than the OS.
 * Typing, arrow keys, and the scroll-wheel all still work on the input
 * itself; the buttons are an additional pointer-friendly affordance.
 */
export function NumberInput({
  value, onChange, min, max, step = "any", placeholder, disabled, readOnly, invalid, className = "", id,
  ...rest
}: NumberInputProps) {
  const stepAmount = typeof step === "number" ? step : 1;

  function bump(direction: 1 | -1) {
    if (disabled || readOnly) return;
    const current = parseFloat(value);
    const base = Number.isFinite(current) ? current : 0;
    let next = base + direction * stepAmount;
    if (min != null) next = Math.max(min, next);
    if (max != null) next = Math.min(max, next);
    const decimals = (String(stepAmount).split(".")[1] ?? "").length;
    onChange(String(Number(next.toFixed(decimals))));
  }

  return (
    <div className={`relative inline-flex w-full ${className}`}>
      <input
        id={id}
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        min={min}
        max={max}
        step={step}
        placeholder={placeholder}
        disabled={disabled}
        readOnly={readOnly}
        className={`og-no-spin w-full pl-2 pr-5 py-1.5 rounded-lg border text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 transition-colors placeholder:text-gray-400 dark:placeholder:text-gray-600 ${
          invalid
            ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
            : "border-og-border-md focus:border-og-accent focus:ring-og-accent/20"
        } ${disabled || readOnly ? "opacity-60 cursor-not-allowed" : ""}`}
        {...rest}
      />
      {!disabled && !readOnly && (
        <div className="absolute right-0.5 top-0.5 bottom-0.5 flex flex-col justify-center w-4">
          <button
            type="button"
            tabIndex={-1}
            onClick={() => bump(1)}
            aria-label="Increase"
            className="h-1/2 flex items-center justify-center text-gray-400 hover:text-og-accent transition-colors"
          >
            <ChevronUpIcon size={9} />
          </button>
          <button
            type="button"
            tabIndex={-1}
            onClick={() => bump(-1)}
            aria-label="Decrease"
            className="h-1/2 flex items-center justify-center text-gray-400 hover:text-og-accent transition-colors"
          >
            <ChevronDownIcon size={9} />
          </button>
        </div>
      )}
    </div>
  );
}
