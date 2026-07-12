"use client";

import type { ComponentProps } from "react";
import { useTheme } from "fumadocs-ui/provider/base";

type ThemeSwitchProps = ComponentProps<"div"> & { mode?: "light-dark" | "light-dark-system" };

function MoonIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="M13.5 9.5A6 6 0 0 1 6.5 2.5a6 6 0 1 0 7 7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg width={15} height={15} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="3" stroke="currentColor" strokeWidth="1.4" />
      <path d="M8 1v2M8 13v2M1 8h2M13 8h2M3.05 3.05l1.42 1.42M11.53 11.53l1.42 1.42M3.05 12.95l1.42-1.42M11.53 4.47l1.42-1.42" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

/** Custom sidebar-footer theme toggle, styled to match Open Gauge's brand
 * accent rather than Fumadocs' default icon-only button. */
export function ThemeToggle({ className }: ThemeSwitchProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const isDark = resolvedTheme === "dark";

  return (
    <button
      type="button"
      suppressHydrationWarning
      onClick={() => setTheme(isDark ? "light" : "dark")}
      aria-label={isDark ? "Switch to light mode" : "Switch to dark mode"}
      className={`flex w-full items-center gap-2 rounded-lg border border-fd-border bg-fd-secondary/50 px-2.5 py-2 text-xs font-medium text-fd-muted-foreground transition-colors hover:bg-fd-accent hover:text-fd-accent-foreground ${className ?? ""}`}
    >
      <span className="text-fd-primary" suppressHydrationWarning>{isDark ? <SunIcon /> : <MoonIcon />}</span>
      <span suppressHydrationWarning>{isDark ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
