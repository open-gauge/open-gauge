"use client";

import { useEffect, useRef } from "react";
import type Plotly from "plotly.js-dist-min";

// Shared dark-theme defaults, extracted from the calibration analysis chart
// in CalibrationWizard.tsx so every Health chart looks consistent.
export const PLOTLY_DARK_LAYOUT_BASE: Partial<Plotly.Layout> = {
  paper_bgcolor: "transparent",
  plot_bgcolor: "transparent",
  hoverlabel: { bgcolor: "#1f2937", bordercolor: "#374151", font: { size: 11, color: "#f9fafb" } },
  margin: { t: 10, r: 16, b: 40, l: 52 },
};

export const PLOTLY_AXIS_BASE: Partial<Plotly.LayoutAxis> = {
  tickfont: { size: 10, color: "#9ca3af" },
  gridcolor: "rgba(156,163,175,0.15)",
  linecolor: "rgba(156,163,175,0.3)",
  zerolinecolor: "rgba(156,163,175,0.3)",
  automargin: true,
};

/**
 * Axis title with the same muted color as `PLOTLY_AXIS_BASE`'s tick labels
 * (matching the calibration-points chart in asset-detail-client.tsx). Use
 * this instead of a bare `{ text }` object — spreading `PLOTLY_AXIS_BASE`
 * into an axis and then setting `title` replaces the whole title object
 * rather than merging into it, so an untinted `{ text }` falls back to
 * Plotly's default (dark, unreadable in dark mode) title color.
 */
export function axisTitle(text: string): Partial<Plotly.DataTitle> {
  return { text, font: { size: 10, color: "#9ca3af" } };
}

export const PLOTLY_CONFIG_BASE: Partial<Plotly.Config> = {
  responsive: true,
  displaylogo: false,
  modeBarButtonsToRemove: [
    "toImage", "sendDataToCloud", "select2d", "lasso2d",
    "hoverClosestCartesian", "hoverCompareCartesian", "toggleSpikelines",
  ],
  scrollZoom: true,
};

type PlotlyModule = typeof import("plotly.js-dist-min").default;
type PlotBuild = { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } | null;

/**
 * Mounts/updates a Plotly chart inside `divRef`. Handles the dynamic import
 * (Plotly is client-only), `Plotly.react()` for updates, and `Plotly.purge()`
 * cleanup on unmount — the same lifecycle CalibrationWizard.tsx implements
 * inline, extracted here since Health uses it 5 times.
 */
export function usePlotly(
  divRef: React.RefObject<HTMLDivElement | null>,
  build: () => PlotBuild,
  deps: React.DependencyList
): void {
  const plotlyRef = useRef<PlotlyModule | null>(null);

  useEffect(() => {
    const div = divRef.current;
    if (!div) return;
    let mounted = true;

    import("plotly.js-dist-min").then((mod) => {
      if (!mounted || !div) return;
      const Plotly = mod.default;
      plotlyRef.current = Plotly;
      const built = build();
      if (!built) return;
      Plotly.react(div, built.data, built.layout, PLOTLY_CONFIG_BASE);
    });

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    const div = divRef.current;
    return () => {
      if (plotlyRef.current && div) {
        try {
          plotlyRef.current.purge(div);
        } catch {
          // chart already gone (e.g. div unmounted before purge)
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
