"use client";

import { useRef } from "react";
import type { SensitivityChartPoint } from "@/types/calibration";
import { COLORS } from "@/lib/tokens";
import { usePlotly, PLOTLY_DARK_LAYOUT_BASE, PLOTLY_AXIS_BASE, axisTitle } from "@/hooks/use-plotly";

/**
 * Sensitivity (measured/reference) vs. frequency for a data_entry_mode=
 * "frequency_response" sweep, round markers connected by lines. X-axis
 * switches to log scale automatically when the sweep spans a decade or more
 * (matching how such sweeps are conventionally plotted), otherwise linear.
 * Shared between the wizard's live Step 3 preview and the saved-calibration
 * detail view, same split as ResidualsChart.
 */
export function SensitivityChart({
  points, frequencyUnit, sensitivityUnit, frequencyLabel, sensitivityLabel, deviationLabel, className,
}: {
  points: SensitivityChartPoint[];
  frequencyUnit: string;
  sensitivityUnit: string;
  frequencyLabel: string;
  sensitivityLabel: string;
  deviationLabel: string;
  className?: string;
}) {
  const divRef = useRef<HTMLDivElement>(null);

  usePlotly(
    divRef,
    () => {
      if (points.length === 0) return null;
      const sorted = [...points].sort((a, b) => a.frequency_value - b.frequency_value);
      const xs = sorted.map((p) => p.frequency_value);
      const ys = sorted.map((p) => p.sensitivity_value);
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
          customdata: sorted.map((p) => [p.deviation_pct]),
          hovertemplate:
            `<b>${frequencyLabel}: %{x:.4g}${frequencyUnit ? ` ${frequencyUnit}` : ""}</b><br>` +
            `${sensitivityLabel}: %{y:.4g}${sensitivityUnit ? ` ${sensitivityUnit}` : ""}<br>` +
            `${deviationLabel}: %{customdata[0]:.3g}%` +
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
          title: axisTitle(`${sensitivityLabel}${sensitivityUnit ? ` (${sensitivityUnit})` : ""}`),
        },
      };
      return { data: traces, layout };
    },
    [points, frequencyUnit, sensitivityUnit, frequencyLabel, sensitivityLabel, deviationLabel]
  );

  return (
    <div className={`rounded-xl border border-og-border bg-og-surface relative overflow-hidden ${className ?? ""}`}>
      <div ref={divRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
