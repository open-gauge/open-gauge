/**
 * Fluid typography for pie / ring / gauge center labels.
 *
 * Uses CSS container query units (`cqw`) so values scale with the center
 * hole — not the viewport — which keeps stat text readable on small charts.
 */
export const chartCenterContainerClassName =
  "@container/chart-center size-full min-w-0";

/** Primary stat — ~15% of center width, clamped between text-sm and text-2xl. */
export const chartCenterValueClassName =
  "font-bold tabular-nums leading-none text-[clamp(0.75rem,15cqw,1.5rem)] text-mar-text dark:text-white";

/** Supporting label — ~9% of center width, clamped between 10px and text-xs. */
export const chartCenterLabelClassName =
  "max-w-full truncate leading-none text-[clamp(0.625rem,9cqw,0.75rem)] text-mar-text dark:text-white";
