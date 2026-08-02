"use client";

import { useRef, useState } from "react";
import type { LinearityDeviationPoint } from "@/lib/evaluate-model";
import { COLORS } from "@/lib/tokens";
import { usePlotly, PLOTLY_DARK_LAYOUT_BASE, PLOTLY_AXIS_BASE, axisTitle } from "@/hooks/use-plotly";
import { ToggleSwitch } from "@/components/toggle-switch";

/**
 * A Lookup Table's linearity deviation — how far the piecewise-linear
 * interpolation between calibrated points strays from an ideal straight-line
 * reference fit, sampled continuously across the measured range (a smooth
 * line — see evaluate-model.ts's computeLinearityDeviation for how the
 * samples are computed), with round markers at the calibration's own
 * entered points (computeLinearityDeviationAtPoints) so it reads the same
 * way the main calibration chart does: real points connected by the curve.
 * The x-axis is the measured signal (the interpolation's own domain); the
 * deviation itself is a reference-value-scale quantity (the LUT curve and
 * the reference line are both f(measured) -> reference), so it's reported
 * in reference units. Absolute or relative (%FS) display, toggled — mirrors
 * ResidualsChart's abs/pct pattern.
 */
export function LinearityDeviationChart({
  points, markerPoints, measuredUnit, referenceUnit, measuredLabel, deviationLabel, deviationPercentLabel, className,
}: {
  points: LinearityDeviationPoint[];
  markerPoints: LinearityDeviationPoint[];
  measuredUnit: string;
  referenceUnit: string;
  measuredLabel: string;
  deviationLabel: string;
  deviationPercentLabel: string;
  className?: string;
}) {
  const [mode, setMode] = useState<"abs" | "pct">("abs");
  const divRef = useRef<HTMLDivElement>(null);

  usePlotly(
    divRef,
    () => {
      if (points.length === 0) return null;
      const xs = points.map((p) => p.x);
      const ys = points.map((p) => (mode === "abs" ? p.deviationAbs : p.deviationPct));
      const mn = Math.min(...xs), mx = Math.max(...xs);
      const hovertemplate =
        `${measuredLabel}: %{x:.4g}${measuredUnit ? ` ${measuredUnit}` : ""}<br>` +
        `${deviationLabel}: %{customdata[0]:.4g} ${referenceUnit}<br>` +
        `${deviationPercentLabel}: %{customdata[1]:.3g}%` +
        `<extra></extra>`;

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
          mode: "lines",
          line: { color: COLORS.accent, width: 2 },
          customdata: points.map((p) => [p.deviationAbs, p.deviationPct]),
          hovertemplate,
          showlegend: false,
        },
        {
          x: markerPoints.map((p) => p.x),
          y: markerPoints.map((p) => (mode === "abs" ? p.deviationAbs : p.deviationPct)),
          type: "scatter",
          mode: "markers",
          marker: { color: COLORS.accent, size: 8, line: { color: "rgba(255,255,255,0.5)", width: 1.5 } },
          customdata: markerPoints.map((p) => [p.deviationAbs, p.deviationPct]),
          hovertemplate,
          showlegend: false,
        },
      ];

      const layout: Partial<Plotly.Layout> = {
        ...PLOTLY_DARK_LAYOUT_BASE,
        xaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(`${measuredLabel}${measuredUnit ? ` (${measuredUnit})` : ""}`) },
        yaxis: {
          ...PLOTLY_AXIS_BASE,
          title: axisTitle(mode === "abs" ? `${deviationLabel}${referenceUnit ? ` (${referenceUnit})` : ""}` : deviationPercentLabel),
        },
      };
      return { data: traces, layout };
    },
    [points, markerPoints, mode, measuredUnit, referenceUnit, measuredLabel, deviationLabel, deviationPercentLabel]
  );

  return (
    <div className={`rounded-xl border border-og-border bg-og-surface relative overflow-hidden ${className ?? ""}`}>
      <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400">{deviationLabel}</span>
        <ToggleSwitch checked={mode === "pct"} onChange={(v) => setMode(v ? "pct" : "abs")} size="sm" />
        <span className="text-[10px] text-gray-400">{deviationPercentLabel}</span>
      </div>
      <div ref={divRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
