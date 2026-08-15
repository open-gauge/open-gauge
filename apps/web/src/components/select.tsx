"use client";

import { ChevronDownIcon } from "@/components/icons";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  disabled?: boolean;
  /** Switches to the error border/ring, same as the app's IB_ERR pattern. */
  invalid?: boolean;
  /** Sets the trigger's width — always capped at `max-w-64` regardless (see UI.md's
   * Dropdown / Select Inputs section for the standard width tiers to pass here). */
  className?: string;
  id?: string;
  "aria-label"?: string;
}

/**
 * Standard dropdown, replacing a raw `<select>` app-wide. See UI.md's
 * Dropdown / Select Inputs section.
 *
 * Stays a native `<select>` — full keyboard navigation, mobile picker, and screen-reader
 * behavior come for free, and the browser already sizes its native option popup to fit the
 * widest option regardless of the trigger's own width, so long option text is never cut off
 * there. Only the trigger is restyled: the native arrow is hidden (`appearance-none`) in favor
 * of a theme-aware chevron, and the trigger caps at a fixed max width with an ellipsis + a
 * native `title` tooltip once the selected label overflows it.
 */
export function Select({
  value, onChange, options, placeholder, disabled, invalid, className = "", id, ...rest
}: SelectProps) {
  const selected = options.find((o) => o.value === value);

  return (
    <div className={`relative w-full max-w-64 ${className}`}>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        title={selected?.label ?? placeholder}
        className={`w-full appearance-none overflow-hidden text-ellipsis whitespace-nowrap pl-3 pr-7 py-2 rounded-lg border text-sm bg-og-surface focus:outline-hidden focus:ring-1 transition-colors ${
          selected ? "text-og-text" : "text-gray-400 dark:text-gray-600"
        } ${
          invalid
            ? "border-red-400 focus:border-red-400 focus:ring-red-400/20"
            : "border-og-border-md focus:border-og-accent focus:ring-og-accent/20"
        } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
        {...rest}
      >
        {placeholder != null && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      {!disabled && (
        <ChevronDownIcon
          size={12}
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-gray-400"
        />
      )}
    </div>
  );
}
