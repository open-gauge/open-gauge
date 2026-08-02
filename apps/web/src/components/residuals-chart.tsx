"use client";

import { useRef, useState } from "react";
import type { ResidualPoint } from "@/types/calibration";
import { COLORS } from "@/lib/tokens";
import { usePlotly, PLOTLY_DARK_LAYOUT_BASE, PLOTLY_AXIS_BASE, axisTitle } from "@/hooks/use-plotly";
import { ToggleSwitch } from "@/components/toggle-switch";

/**
 * Residuals of a fitted calibration model — reference standard measurement on
 * the x-axis, residual (absolute or relative %, toggled) on the y-axis, with a
 * dashed y=0 reference line. Shared between the wizard's live analysis review
 * and the saved-calibration detail view, since both render the exact same
 * data shape under their existing fitted-curve chart.
 */
export function ResidualsChart({
  points, referenceUnit, referenceLabel, residualLabel, residualPercentLabel, className,
}: {
  points: ResidualPoint[];
  referenceUnit: string;
  referenceLabel: string;
  residualLabel: string;
  residualPercentLabel: string;
  className?: string;
}) {
  const [mode, setMode] = useState<"abs" | "pct">("abs");
  const divRef = useRef<HTMLDivElement>(null);

  usePlotly(
    divRef,
    () => {
      if (points.length === 0) return null;
      const xs = points.map((p) => p.reference_value);
      const ys = points.map((p) => (mode === "abs" ? p.residual_abs ?? 0 : p.residual_pct ?? 0));
      const mn = Math.min(...xs), mx = Math.max(...xs);

      const traces: Plotly.Data[] = [
        {
          x: [mn, mx],
          y: [0, 0],
          type: "scatter",
          mode: "lines",
          line: { color: "rgba(156,163,175,0.5)", width: 1.5, dash: "dash" },
          hoverinfo: "skip",
          showlegend: false,
        },
        {
          x: xs,
          y: ys,
          type: "scatter",
          mode: "markers",
          marker: { color: COLORS.accent, size: 8, line: { color: "rgba(255,255,255,0.5)", width: 1.5 } },
          customdata: points.map((p) => [p.point_index + 1, p.residual_abs ?? 0, p.residual_pct ?? 0]),
          hovertemplate:
            `<b>Point %{customdata[0]}</b><br>` +
            `${referenceLabel}: %{x:.4g}${referenceUnit ? ` ${referenceUnit}` : ""}<br>` +
            `${residualLabel}: %{customdata[1]:.4g} ${referenceUnit}<br>` +
            `${residualPercentLabel}: %{customdata[2]:.3g}%` +
            `<extra></extra>`,
          showlegend: false,
        },
      ];

      const layout: Partial<Plotly.Layout> = {
        ...PLOTLY_DARK_LAYOUT_BASE,
        xaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(`${referenceLabel}${referenceUnit ? ` (${referenceUnit})` : ""}`) },
        yaxis: {
          ...PLOTLY_AXIS_BASE,
          // residualPercentLabel already reads "Residual (%)" — appending another
          // unit suffix here would double it up (e.g. "Residual (%)(%)").
          title: axisTitle(mode === "abs" ? `${residualLabel}${referenceUnit ? ` (${referenceUnit})` : ""}` : residualPercentLabel),
        },
      };
      return { data: traces, layout };
    },
    [points, mode, referenceUnit, residualLabel, residualPercentLabel]
  );

  return (
    <div className={`rounded-xl border border-og-border bg-og-surface relative overflow-hidden ${className ?? ""}`}>
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400">{residualLabel}</span>
        <ToggleSwitch checked={mode === "pct"} onChange={(v) => setMode(v ? "pct" : "abs")} size="sm" />
        <span className="text-[10px] text-gray-400">{residualPercentLabel}</span>
      </div>
      <div ref={divRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
