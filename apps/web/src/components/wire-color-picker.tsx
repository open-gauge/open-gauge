"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { translateDynamic } from "@/lib/translate-dynamic";

// Fixed palette rather than a full HSV picker — a wire is one of a small, known
// set of standard colors (some multi-colored, e.g. a green/yellow ground wire),
// not an arbitrary RGB value. Matches AGENTS.md's "boring, reliable" preference.
export const WIRE_COLOR_PALETTE: { hex: string; key: string }[] = [
  { hex: "#000000", key: "black" },
  { hex: "#8b4513", key: "brown" },
  { hex: "#dc2626", key: "red" },
  { hex: "#f97316", key: "orange" },
  { hex: "#eab308", key: "yellow" },
  { hex: "#16a34a", key: "green" },
  { hex: "#2563eb", key: "blue" },
  { hex: "#7c3aed", key: "violet" },
  { hex: "#6b7280", key: "gray" },
  { hex: "#ffffff", key: "white" },
  { hex: "#ec4899", key: "pink" },
  { hex: "#0891b2", key: "cyan" },
];

interface WireColorPickerProps {
  value: string[] | null;
  onChange: (colors: string[]) => void;
  disabled?: boolean;
}

/** CSS `background` for the swatch: a solid fill for one color, or a 45°
 * repeating diagonal stripe for multiple (e.g. a green/yellow ground wire) —
 * mirrors how multi-colored wire insulation actually looks, rather than a
 * row of separate dots. */
function colorSwatchBackground(colors: string[]): string | undefined {
  if (colors.length === 0) return undefined;
  if (colors.length === 1) return colors[0];
  const stripe = 3;
  const stops = colors.flatMap((c, i) => [`${c} ${i * stripe}px`, `${c} ${(i + 1) * stripe}px`]);
  return `repeating-linear-gradient(45deg, ${stops.join(", ")})`;
}

/** Multi-select swatch picker for wire color(s) — some wires (e.g. striped ground
 * wires) carry more than one color, so this toggles membership rather than
 * picking a single value.
 *
 * The palette pops out through a portal into `document.body` with a
 * viewport-fixed position computed from the trigger button — this table cell
 * normally sits inside a horizontally-scrollable table wrapper
 * (`overflow-x-auto`), and CSS forces `overflow-y` to `auto` too whenever
 * `overflow-x` is anything but `visible`, which would otherwise clip the
 * popover instead of letting it float above the table. */
export function WireColorPicker({ value, onChange, disabled }: WireColorPickerProps) {
  const t = useTranslations("assets.interface.wireColors");
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const selected = value ?? [];

  useLayoutEffect(() => {
    if (!open || !buttonRef.current) return;
    const rect = buttonRef.current.getBoundingClientRect();
    setCoords({ top: rect.bottom + 4, left: rect.left });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || popoverRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onScrollOrResize() {
      setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    window.addEventListener("scroll", onScrollOrResize, true);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      document.removeEventListener("mousedown", onClickOutside);
      window.removeEventListener("scroll", onScrollOrResize, true);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [open]);

  function toggle(hex: string) {
    const next = selected.includes(hex) ? selected.filter((c) => c !== hex) : [...selected, hex];
    onChange(next);
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className={`w-9 h-6 rounded-md border transition-colors flex items-center justify-center shrink-0 ${
          selected.length ? "border-og-border" : "border-og-border-md bg-og-surface"
        } ${disabled ? "cursor-default" : "cursor-pointer hover:border-og-accent/50"}`}
        style={selected.length ? { background: colorSwatchBackground(selected) } : undefined}
        title={selected.length ? selected.map((hex) => translateDynamic(t, WIRE_COLOR_PALETTE.find((c) => c.hex === hex)?.key ?? "black")).join(" / ") : t("none")}
      >
        {selected.length === 0 && (
          <span className="w-4 h-4 rounded-full border border-dashed border-gray-300 dark:border-gray-600" />
        )}
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popoverRef}
          style={{ position: "fixed", top: coords.top, left: coords.left }}
          className="z-50 p-2 grid grid-cols-4 gap-1.5 bg-og-surface border border-og-border rounded-lg shadow-lg w-32"
        >
          {WIRE_COLOR_PALETTE.map((c) => (
            <button
              key={c.hex}
              type="button"
              onClick={() => toggle(c.hex)}
              title={translateDynamic(t, c.key)}
              className={`w-6 h-6 rounded-full border transition-all ${
                selected.includes(c.hex) ? "ring-2 ring-og-accent ring-offset-1 ring-offset-og-surface" : "border-og-border"
              }`}
              style={{ backgroundColor: c.hex }}
            />
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}
