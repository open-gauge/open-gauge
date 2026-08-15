"use client";

import { useEffect, useRef } from "react";
import { COLORS } from "@/lib/tokens";
import { evaluateModel } from "@/lib/evaluate-model";
import type { ModelType } from "@/types/calibration";

/**
 * A declared model (data_entry_mode="model_direct") has no real dataset —
 * just coefficients/formula and a declared valid range — so there's nothing
 * to scatter-plot or compute residuals from. This draws the curve itself,
 * sampled across [xMin, xMax], with a hover tooltip at the nearest sampled
 * point. Shared between the wizard's Step 3 preview (live, from the form's
 * own state) and the saved-calibration detail view (from the persisted
 * record), so both render the curve identically.
 */
export function ModelCurveChart({
  isPolynomial, coefficients, formulaTemplate, xMin, xMax, measuredUnit, referenceUnit, className,
}: {
  isPolynomial: boolean;
  coefficients: number[];
  formulaTemplate: string | null;
  xMin: number;
  xMax: number;
  measuredUnit: string;
  referenceUnit: string;
  className?: string;
}) {
  const plotDivRef = useRef<HTMLDivElement>(null);
  const plotlyRef = useRef<typeof import("plotly.js-dist-min").default | null>(null);

  useEffect(() => {
    const div = plotDivRef.current;
    if (!div || !isFinite(xMin) || !isFinite(xMax) || xMin >= xMax) return;
    let mounted = true;

    const modelType: ModelType = isPolynomial ? "polynomial" : "custom_formula";
    const curve = Array.from({ length: 81 }, (_, i) => {
      const x = xMin + (i * (xMax - xMin)) / 80;
      return { x, y: evaluateModel(modelType, coefficients, formulaTemplate, x) };
    });

    import("plotly.js-dist-min").then((mod) => {
      if (!mounted || !div) return;
      const Plotly = mod.default;
      plotlyRef.current = Plotly;

      const traces: Plotly.Data[] = [
        {
          x: curve.map((d) => d.x),
          y: curve.map((d) => d.y),
          type: "scatter",
          mode: "lines",
          line: { color: COLORS.accent, width: 2 },
          hovertemplate:
            `Measured: %{x:.4g}${measuredUnit ? ` ${measuredUnit}` : ""}<br>` +
            `Reference: %{y:.4g}${referenceUnit ? ` ${referenceUnit}` : ""}` +
            `<extra></extra>`,
          showlegend: false,
        },
      ];

      const layout: Partial<Plotly.Layout> = {
        margin: { t: 10, r: 16, b: 48, l: 56 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        xaxis: {
          title: { text: `Measured${measuredUnit ? ` (${measuredUnit})` : ""}`, font: { size: 10, color: "#9ca3af" } },
          tickfont: { size: 10, color: "#9ca3af" },
          gridcolor: "rgba(156,163,175,0.15)",
          linecolor: "rgba(156,163,175,0.3)",
          zerolinecolor: "rgba(156,163,175,0.3)",
          automargin: true,
        },
        yaxis: {
          title: { text: `Reference${referenceUnit ? ` (${referenceUnit})` : ""}`, font: { size: 10, color: "#9ca3af" } },
          tickfont: { size: 10, color: "#9ca3af" },
          gridcolor: "rgba(156,163,175,0.15)",
          linecolor: "rgba(156,163,175,0.3)",
          zerolinecolor: "rgba(156,163,175,0.3)",
          automargin: true,
        },
        hoverlabel: {
          bgcolor: "#1f2937",
          bordercolor: "#374151",
          font: { size: 11, color: "#f9fafb" },
        },
      };

      Plotly.react(div, traces, layout, {
        responsive: true,
        displaylogo: false,
        modeBarButtonsToRemove: ["toImage", "sendDataToCloud", "select2d", "lasso2d", "hoverClosestCartesian", "hoverCompareCartesian", "toggleSpikelines"],
        scrollZoom: true,
      });
    });

    return () => { mounted = false; };
  }, [isPolynomial, coefficients, formulaTemplate, xMin, xMax, measuredUnit, referenceUnit]);

  useEffect(() => {
    const div = plotDivRef.current;
    return () => {
      if (plotlyRef.current && div) {
        try { plotlyRef.current.purge(div); } catch { /* ignore */ }
      }
    };
  }, []);

  return (
    <div className={`rounded-xl border border-og-border bg-og-surface relative overflow-hidden ${className ?? ""}`}>
      <div ref={plotDivRef} style={{ height: "100%", width: "100%" }} />
    </div>
  );
}
