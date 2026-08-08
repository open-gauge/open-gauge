"use client";

import { useRef } from "react";
import type { PhaseChartPoint } from "@/types/calibration";
import { COLORS } from "@/lib/tokens";
import { usePlotly, PLOTLY_DARK_LAYOUT_BASE, PLOTLY_AXIS_BASE, axisTitle } from "@/hooks/use-plotly";

/**
 * Phase offset vs. frequency for a data_entry_mode="frequency_response" sweep
 * with the offset switch enabled, round markers connected by lines — stacked
 * below SensitivityChart, never shown on its own (offset is optional; when
 * disabled there's no phase data to plot at all). Same log/linear x-axis
 * auto-detection as SensitivityChart.
 */
export function PhaseChart({
  points, frequencyUnit, offsetUnit, frequencyLabel, phaseLabel, className,
}: {
  points: PhaseChartPoint[];
  frequencyUnit: string;
  offsetUnit: string;
  frequencyLabel: string;
  phaseLabel: string;
  className?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);

  usePlotly(
    divRef,
    () => {
      if (points.length === 0) return null;
      const sorted = [...points].sort((a, b) => a.frequency_value - b.frequency_value);
      const xs = sorted.map((p) => p.frequency_value);
      const ys = sorted.map((p) => p.offset_value);
      const minFreq = Math.min(...xs), maxFreq = Math.max(...xs);
      const useLog = minFreq > 0 && maxFreq / minFreq >= 10;

      const traces: Plotly.Data[] = [
        {
          x: xs,
          y: ys,
          type: "scatter",
          mode: "lines+markers",
          line: { color: COLORS.accent, width: 1.5 },
          marker: { color: COLORS.accent, size: 8, line: { color: "rgba(255,255,255,0.5)", width: 1.5 } },
          hovertemplate:
            `<b>${frequencyLabel}: %{x:.4g}${frequencyUnit ? ` ${frequencyUnit}` : ""}</b><br>` +
            `${phaseLabel}: %{y:.4g}${offsetUnit ? ` ${offsetUnit}` : ""}` +
            `<extra></extra>`,
          showlegend: false,
        },
      ];

      const layout: Partial<Plotly.Layout> = {
        ...PLOTLY_DARK_LAYOUT_BASE,
        xaxis: {
          ...PLOTLY_AXIS_BASE,
          type: useLog ? "log" : "linear",
          title: axisTitle(`${frequencyLabel}${frequencyUnit ? ` (${frequencyUnit})` : ""}`),
        },
        yaxis: {
          ...PLOTLY_AXIS_BASE,
          title: axisTitle(`${phaseLabel}${offsetUnit ? ` (${offsetUnit})` : ""}`),
        },
      };
      return { data: traces, layout };
    },
    [points, frequencyUnit, offsetUnit, frequencyLabel, phaseLabel]
  );

  return (
    <div className={`rounded-xl border border-og-border bg-og-surface relative overflow-hidden ${className ?? ""}`}>
      <div ref={divRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
