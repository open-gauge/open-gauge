"use client";

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  /** "sm" for compact inline filters (matches the old 14px checkbox size);
   * "md" (default) for standalone settings toggles. */
  size?: "sm" | "md";
  className?: string;
  "aria-label"?: string;
}

const TRACK: Record<"sm" | "md", string> = {
  sm: "h-3.5 w-6",
  md: "h-5 w-9",
};
const THUMB: Record<"sm" | "md", string> = {
  sm: "h-2.5 w-2.5",
  md: "h-4 w-4",
};
const THUMB_ON: Record<"sm" | "md", string> = {
  sm: "translate-x-2.5",
  md: "translate-x-4",
};

/**
 * Standard on/off control, replacing raw `<input type="checkbox">` app-wide.
 * See UI.md's Toggle Switch section.
 */
export function ToggleSwitch({
  checked,
  onChange,
  disabled = false,
  size = "md",
  className = "",
  ...rest
}: ToggleSwitchProps) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={(e) => { e.stopPropagation(); onChange(!checked); }}
        className={`relative inline-flex ${TRACK[size]} shrink-0 items-center rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-og-accent/40
          ${checked ? "bg-og-accent" : "bg-gray-300 dark:bg-gray-600"}
          ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
        {...rest}
      >
        <span
          className={`inline-block ${THUMB[size]} transform rounded-full bg-white shadow-sm transition-transform duration-200 ${
            checked ? THUMB_ON[size] : "translate-x-0.5"
          }`}
        />
      </button>
    </span>
  );
}
