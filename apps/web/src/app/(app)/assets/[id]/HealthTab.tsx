"use client";

import { useEffect, useRef, useState } from "react";
import type { AssetProfile } from "@/types/asset";
import type {
  AssetHealthResponse,
  CurveComparisonResponse,
  DetailedMetrics,
  DriftEvolution,
  CalibrationStability,
  HealthOverview,
  MetricGroupItem,
  PredictionOut,
  RadarAxis,
} from "@/types/health";
import { getAssetHealth, getCurveComparison } from "@/services/health.service";
import { COLORS, HEALTH_LABEL_STYLE, HEALTH_METRIC_COLOR, STABILITY_STYLE } from "@/lib/tokens";
import { Tooltip } from "@/components/tooltip";
import { usePlotly, PLOTLY_DARK_LAYOUT_BASE, PLOTLY_AXIS_BASE } from "@/hooks/use-plotly";
import { ActivityIcon, InfoIcon, TrendingDownIcon, TrendingUpIcon, WarningIcon } from "@/components/icons";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  return new Date(iso + (iso.includes("T") ? "" : "T00:00:00")).toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function fmtNum(n: number | null | undefined, decimals = 4): string {
  if (n === null || n === undefined) return "—";
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 0.001 || abs >= 100000)) return n.toExponential(3);
  return parseFloat(n.toFixed(decimals)).toString();
}

function fmtUnit(n: number | null | undefined, unit: string, decimals = 4): string {
  const formatted = fmtNum(n, decimals);
  return formatted === "—" ? formatted : unit ? `${formatted} ${unit}` : formatted;
}

// ---------------------------------------------------------------------------
// Card shell
// ---------------------------------------------------------------------------

function Card({ title, tooltip, children }: { title: string; tooltip?: string; children: React.ReactNode }) {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-mar-border">
        <p className="text-xs font-semibold text-mar-text">{title}</p>
        {tooltip && (
          <Tooltip content={tooltip}>
            <InfoIcon size={11} className="text-gray-400 cursor-help" />
          </Tooltip>
        )}
      </div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Empty state
// ---------------------------------------------------------------------------

function HealthEmptyState() {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-12 flex flex-col items-center text-center gap-3">
      <ActivityIcon size={32} className="text-gray-300 dark:text-gray-600" />
      <p className="text-sm text-gray-400 max-w-sm">
        Health insights become available after at least two calibrations.
      </p>
    </div>
  );
}

function HealthError({ message }: { message: string }) {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-8 flex flex-col items-center text-center gap-2">
      <WarningIcon size={24} className="text-red-400" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

function HealthLoading() {
  return (
    <div className="bg-mar-surface rounded-xl border border-mar-border shadow-sm p-12 flex items-center justify-center">
      <p className="text-sm text-gray-400">Loading health data…</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 1 — Health Overview
// ---------------------------------------------------------------------------

const SCORE_TOOLTIP =
  "Weighted composite: Maximum Drift 30%, RMS Drift 20%, RMSE 15%, Uncertainty 10%, Hysteresis 10%, Linearity 10%, Trend 5%.";

function KpiLabel({ text, tooltip }: { text: string; tooltip?: string }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2 flex items-center gap-1">
      {text}
      {tooltip && (
        <Tooltip content={tooltip}>
          <InfoIcon size={11} className="text-gray-400 cursor-help" />
        </Tooltip>
      )}
    </p>
  );
}

function HealthOverviewCard({ overview }: { overview: HealthOverview }) {
  const scoreColor =
    overview.health_score >= 90 ? "#22c55e" :
    overview.health_score >= 75 ? COLORS.accent :
    overview.health_score >= 50 ? "#f59e0b" : "#ef4444";

  return (
    <Card title="Health Overview">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <div>
          <KpiLabel text="Health Score" tooltip={SCORE_TOOLTIP} />
          <p className="text-2xl font-bold text-mar-text tabular-nums">
            {Math.round(overview.health_score)}
            <span className="text-sm text-gray-400 font-normal"> / 100</span>
          </p>
          <div className="mt-2 h-1.5 rounded-full bg-mar-surface-alt overflow-hidden">
            <div
              className="h-full rounded-full transition-all"
              style={{ width: `${Math.round(overview.health_score)}%`, backgroundColor: scoreColor }}
            />
          </div>
          <span className={`inline-flex mt-2 px-2 py-0.5 rounded-full text-[11px] font-semibold border ${HEALTH_LABEL_STYLE[overview.health_label] ?? ""}`}>
            {overview.health_label}
          </span>
        </div>

        <div>
          <KpiLabel text="Stability" tooltip="Classified from the long-term drift rate (relative to the channel's full-scale span) and the drift trend's regression fit quality." />
          <span className={`inline-flex px-2.5 py-1 rounded-full text-sm font-semibold border ${STABILITY_STYLE[overview.stability] ?? ""}`}>
            {overview.stability}
          </span>
        </div>

        <div>
          <KpiLabel text="Average Drift" tooltip="Long-term drift rate from a linear regression over the full calibration history." />
          <p className="text-xl font-bold text-mar-text tabular-nums">
            {fmtNum(overview.average_drift_rate)}
            <span className="text-xs text-gray-400 font-normal ml-1">{overview.drift_rate_unit}</span>
          </p>
        </div>

        <div>
          <KpiLabel text="Recommended Interval" tooltip="Heuristic suggestion based on the current stability classification, starting from the sensor's configured calibration interval." />
          <p className="text-xl font-bold text-mar-text tabular-nums">
            {overview.recommended_interval_months}
            <span className="text-xs text-gray-400 font-normal ml-1">months</span>
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Drift Evolution
// ---------------------------------------------------------------------------

function DriftEvolutionCard({ data, unit }: { data: DriftEvolution; unit: string }) {
  const divRef = useRef<HTMLDivElement>(null);

  usePlotly(
    divRef,
    () => {
      if (data.points.length === 0) return null;
      const dates = data.points.map((p) => p.calibration_date);
      const originMs = new Date(data.regression_origin_date).getTime();
      const regressionY = dates.map((d) => {
        const years = (new Date(d).getTime() - originMs) / (365.25 * 86400000);
        return data.regression_intercept + data.regression_slope * years;
      });

      const traces: Plotly.Data[] = [
        {
          x: dates, y: regressionY, type: "scatter", mode: "lines",
          line: { color: COLORS.accent, width: 2, dash: "dash" },
          hoverinfo: "skip", showlegend: false,
        },
        {
          x: dates,
          y: data.points.map((p) => p.max_drift),
          type: "scatter", mode: "lines+markers",
          line: { color: COLORS.scatter, width: 2 },
          marker: { color: COLORS.scatter, size: 8 },
          customdata: data.points.map((p) => [p.calibration_id, p.operator]),
          hovertemplate:
            `<b>%{customdata[0]}</b><br>Max drift: %{y} ${unit}<br>Date: %{x}<br>Operator: %{customdata[1]}<extra></extra>`,
          showlegend: false,
        },
      ];
      const layout: Partial<Plotly.Layout> = {
        ...PLOTLY_DARK_LAYOUT_BASE,
        xaxis: { ...PLOTLY_AXIS_BASE, title: { text: "Calibration date" } },
        yaxis: { ...PLOTLY_AXIS_BASE, title: { text: `Maximum drift (${unit})` } },
      };
      return { data: traces, layout };
    },
    [data, unit]
  );

  return (
    <Card title="Drift Evolution" tooltip="Maximum drift of each calibration vs. the baseline (first) calibration, with a linear trend line. The primary view of sensor ageing.">
      {data.points.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">No comparable calibrations with a fitted curve yet.</p>
      ) : (
        <>
          <div ref={divRef} style={{ height: 300, width: "100%" }} />
          <div className="grid grid-cols-3 gap-3 mt-4">
            <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Current Drift Rate</p>
              <p className="text-sm text-mar-text tabular-nums">{fmtNum(data.current_drift_rate)} {unit}/yr</p>
            </div>
            <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Slope</p>
              <p className="text-sm text-mar-text tabular-nums">{fmtNum(data.regression_slope)} {unit}/yr</p>
            </div>
            <div className="bg-mar-surface-alt border border-mar-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Regression R²</p>
              <p className="text-sm text-mar-text tabular-nums">{fmtNum(data.regression_r_squared, 3)}</p>
            </div>
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 3 — Calibration Stability
// ---------------------------------------------------------------------------

function StabilityCard({ data }: { data: CalibrationStability }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState<Record<string, boolean>>(
    () => Object.fromEntries(data.series.map((s) => [s.name, true]))
  );

  usePlotly(
    divRef,
    () => {
      const traces: Plotly.Data[] = [];
      for (const series of data.series) {
        if (!enabled[series.name]) continue;
        const color = HEALTH_METRIC_COLOR[series.name] ?? COLORS.accent;
        if (series.smoothed_values) {
          traces.push({
            x: series.dates, y: series.raw_values, type: "scatter", mode: "markers",
            marker: { color, size: 5, opacity: 0.5 }, name: `${series.label} (raw)`,
            showlegend: false,
          });
          traces.push({
            x: series.dates, y: series.smoothed_values, type: "scatter", mode: "lines",
            line: { color, width: 2 }, name: series.label,
          });
        } else {
          traces.push({
            x: series.dates, y: series.raw_values, type: "scatter", mode: "lines+markers",
            line: { color, width: 2 }, marker: { color, size: 6 }, name: series.label,
          });
        }
      }
      const layout: Partial<Plotly.Layout> = {
        ...PLOTLY_DARK_LAYOUT_BASE,
        xaxis: { ...PLOTLY_AXIS_BASE, title: { text: "Calibration date" } },
        yaxis: { ...PLOTLY_AXIS_BASE, title: { text: "Value" } },
        legend: { orientation: "h", y: -0.2, font: { size: 10, color: "#9ca3af" } },
      };
      return { data: traces, layout };
    },
    [data, enabled]
  );

  return (
    <Card title="Calibration Stability" tooltip="Historical evolution of RMSE, Maximum Error, Expanded Uncertainty, Hysteresis, and R². Toggle metrics on/off; use the toolbar to zoom and pan.">
      <div className="flex flex-wrap gap-1.5 mb-3">
        {data.series.map((s) => (
          <button
            key={s.name}
            type="button"
            onClick={() => setEnabled((e) => ({ ...e, [s.name]: !e[s.name] }))}
            className={`px-2.5 py-1 rounded-full text-[11px] font-medium border transition-colors ${
              enabled[s.name]
                ? "border-transparent text-white"
                : "border-mar-border-md text-gray-400 hover:bg-mar-surface-alt"
            }`}
            style={enabled[s.name] ? { backgroundColor: HEALTH_METRIC_COLOR[s.name] ?? COLORS.accent } : undefined}
          >
            {s.label}
          </button>
        ))}
      </div>
      <div ref={divRef} style={{ height: 300, width: "100%" }} />
      {data.smoothing_applied && (
        <p className="text-[11px] text-gray-400 mt-2">
          Solid lines show a 3-point moving average; individual points show the raw values.
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 4 — Calibration Curve Comparison
// ---------------------------------------------------------------------------

const CURVE_METRIC_TIPS: Record<string, string> = {
  max_drift: "Largest absolute difference between the reference and current curves across the shared operating range.",
  mean_drift: "Average absolute difference between the two curves across the shared operating range.",
  rms_drift: "Root-mean-square difference between the two curves — penalizes larger deviations more than Mean Drift.",
  offset: "Difference between the curves at the start of the shared range — a constant (zero-point) shift.",
  gain: "Slope of the difference curve — a change in sensitivity (span) between the two calibrations.",
  residual_drift: "Difference between the curves at the end of the range minus the difference at the start — drift not explained by a constant offset.",
};

function CurveComparisonCard({
  assetId, options, unit,
}: {
  assetId: string;
  options: { id: string; calibration_date: string; calibration_version: number; label: string }[];
  unit: string;
}) {
  const [referenceId, setReferenceId] = useState(options[0]?.id ?? "");
  const [currentId, setCurrentId] = useState(options[options.length - 1]?.id ?? "");
  const [result, setResult] = useState<CurveComparisonResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const curveRef = useRef<HTMLDivElement>(null);
  const deltaRef = useRef<HTMLDivElement>(null);
  const driftRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!referenceId || !currentId) return;
    setError(null);
    getCurveComparison(assetId, referenceId, currentId)
      .then(setResult)
      .catch((e) => { setResult(null); setError(e instanceof Error ? e.message : "Failed to compare curves"); });
  }, [assetId, referenceId, currentId]);

  usePlotly(curveRef, () => {
    if (!result) return null;
    const traces: Plotly.Data[] = [
      { x: result.x, y: result.y_reference, type: "scatter", mode: "lines", line: { color: "#9ca3af", width: 2 }, name: "Reference" },
      { x: result.x, y: result.y_current, type: "scatter", mode: "lines", line: { color: COLORS.accent, width: 2 }, name: "Current" },
    ];
    const layout: Partial<Plotly.Layout> = {
      ...PLOTLY_DARK_LAYOUT_BASE,
      margin: { t: 28, r: 16, b: 40, l: 52 },
      xaxis: { ...PLOTLY_AXIS_BASE, title: { text: "Input" } },
      yaxis: { ...PLOTLY_AXIS_BASE, title: { text: `Output (${unit})` } },
      legend: { orientation: "h", x: 0, y: 1.2, font: { size: 10, color: "#9ca3af" } },
    };
    return { data: traces, layout };
  }, [result, unit]);

  usePlotly(deltaRef, () => {
    if (!result) return null;
    const traces: Plotly.Data[] = [
      { x: result.x, y: result.delta, type: "scatter", mode: "lines", line: { color: "#f59e0b", width: 2 }, fill: "tozeroy", fillcolor: "rgba(245,158,11,0.1)", showlegend: false },
    ];
    const layout: Partial<Plotly.Layout> = {
      ...PLOTLY_DARK_LAYOUT_BASE,
      xaxis: { ...PLOTLY_AXIS_BASE, title: { text: "Input" } },
      yaxis: { ...PLOTLY_AXIS_BASE, title: { text: `ΔT (${unit})` } },
    };
    return { data: traces, layout };
  }, [result, unit]);

  usePlotly(driftRef, () => {
    if (!result) return null;
    const traces: Plotly.Data[] = [
      { x: result.x, y: result.abs_drift, type: "scatter", mode: "lines", line: { color: "#ef4444", width: 2 }, fill: "tozeroy", fillcolor: "rgba(239,68,68,0.1)", showlegend: false },
    ];
    const layout: Partial<Plotly.Layout> = {
      ...PLOTLY_DARK_LAYOUT_BASE,
      xaxis: { ...PLOTLY_AXIS_BASE, title: { text: "Input" } },
      yaxis: { ...PLOTLY_AXIS_BASE, title: { text: `Absolute drift (${unit})` } },
    };
    return { data: traces, layout };
  }, [result, unit]);

  return (
    <Card title="Calibration Curve Comparison" tooltip="Evaluates the fitted polynomials of two calibrations over ~200 points across their shared operating range, to isolate how the curve itself has changed.">
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Reference calibration</span>
          <select
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-mar-border-md text-sm text-mar-text bg-mar-surface focus:outline-none focus:ring-1 focus:border-mar-accent focus:ring-mar-accent/20"
          >
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">Current calibration</span>
          <select
            value={currentId}
            onChange={(e) => setCurrentId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-mar-border-md text-sm text-mar-text bg-mar-surface focus:outline-none focus:ring-1 focus:border-mar-accent focus:ring-mar-accent/20"
          >
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
      </div>

      {error && <p className="text-sm text-red-400 text-center py-4">{error}</p>}

      {result && !error && (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Calibration curves</p>
              <div ref={curveRef} style={{ height: 240, width: "100%" }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Difference (ΔT)</p>
              <div ref={deltaRef} style={{ height: 240, width: "100%" }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Absolute drift</p>
              <div ref={driftRef} style={{ height: 240, width: "100%" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
            {([
              ["max_drift", "Maximum Drift", result.summary.max_drift],
              ["mean_drift", "Mean Drift", result.summary.mean_drift],
              ["rms_drift", "RMS Drift", result.summary.rms_drift],
              ["offset", "Offset Drift", result.summary.offset],
              ["gain", "Gain Drift", result.summary.gain],
              ["residual_drift", "Residual Drift", result.summary.residual_drift],
            ] as [string, string, number][]).map(([key, label, value]) => (
              <div key={key} className="bg-mar-surface-alt border border-mar-border rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-1">
                  {label}
                  <Tooltip content={CURVE_METRIC_TIPS[key]}>
                    <InfoIcon size={10} className="text-gray-400 cursor-help" />
                  </Tooltip>
                </p>
                <p className="text-sm text-mar-text tabular-nums">{fmtUnit(value, unit)}</p>
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 5 — Prediction
// ---------------------------------------------------------------------------

function PredictionCard({ prediction, unit }: { prediction: PredictionOut; unit: string }) {
  const rul = prediction.remaining_useful_life_months != null
    ? prediction.remaining_useful_life_months / 12
    : null;

  return (
    <Card title="Prediction" tooltip="Linear regression on historical maximum drift values, projected forward from today.">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {([
          ["1 year", prediction.projected_drift_1y],
          ["2 years", prediction.projected_drift_2y],
          ["3 years", prediction.projected_drift_3y],
          ["5 years", prediction.projected_drift_5y],
        ] as [string, number | null][]).map(([label, value]) => (
          <div key={label} className="bg-mar-surface-alt border border-mar-border rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Expected drift, {label}</p>
            <p className="text-sm text-mar-text tabular-nums">{fmtUnit(value, unit)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Predicted Remaining Useful Calibration Life</p>
          <p className="text-xl font-bold text-mar-text tabular-nums">
            {rul != null ? `${fmtNum(rul, 1)} years` : "—"}
          </p>
          {prediction.projected_tolerance_exceeded_date && (
            <p className="text-xs text-gray-400 mt-1">
              Projected to exceed tolerance around {fmtDate(prediction.projected_tolerance_exceeded_date)}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">Confidence</p>
          <p className="text-xl font-bold text-mar-text tabular-nums">
            {prediction.confidence_pct != null ? `${Math.round(prediction.confidence_pct)}%` : "—"}
          </p>
          {!prediction.confidence_reliable && (
            <p className="text-xs text-gray-400 mt-1">Based on fewer than 5 calibrations — treat as indicative only.</p>
          )}
        </div>
      </div>

      {prediction.message && (
        <div className="mt-4 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-lg px-3 py-2">
          <WarningIcon size={14} className="text-amber-500 flex-shrink-0" />
          <p className="text-xs text-amber-700 dark:text-amber-400">{prediction.message}</p>
        </div>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 6 — Detailed Metrics + Radar
// ---------------------------------------------------------------------------

function RadarChart({ axes }: { axes: RadarAxis[] }) {
  const divRef = useRef<HTMLDivElement>(null);

  usePlotly(divRef, () => {
    const theta = [...axes.map((a) => a.axis), axes[0]?.axis].filter(Boolean) as string[];
    const r = [...axes.map((a) => a.value), axes[0]?.value].filter((v) => v !== undefined) as number[];
    const traces: Plotly.Data[] = [
      {
        type: "scatterpolar", r, theta, fill: "toself",
        line: { color: COLORS.accent }, fillcolor: "rgba(47,129,155,0.2)",
        marker: { color: COLORS.accent },
      },
    ];
    const layout: Partial<Plotly.Layout> = {
      ...PLOTLY_DARK_LAYOUT_BASE,
      polar: {
        radialaxis: { visible: true, range: [0, 100], tickfont: { size: 9, color: "#9ca3af" }, gridcolor: "rgba(156,163,175,0.15)" },
        angularaxis: { tickfont: { size: 10, color: "#9ca3af" }, gridcolor: "rgba(156,163,175,0.15)" },
      },
      showlegend: false,
    };
    return { data: traces, layout };
  }, [axes]);

  return <div ref={divRef} style={{ height: 280, width: "100%" }} />;
}

function MetricGroup({ title, items }: { title: string; items: MetricGroupItem[] }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-2">{title}</p>
      <div className="space-y-0">
        {items.map((item) => (
          <div key={item.key} className="flex items-center justify-between py-2 border-b border-mar-border last:border-b-0">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              {item.label}
              <Tooltip content={item.tooltip}>
                <InfoIcon size={11} className="text-gray-400 cursor-help" />
              </Tooltip>
            </span>
            <span className="text-sm text-mar-text tabular-nums flex items-center gap-1">
              {item.value === null && item.unit ? (
                <span className="capitalize">{item.unit}</span>
              ) : (
                fmtUnit(item.value, item.unit)
              )}
              {item.key === "trend_classification" && item.unit === "improving" && <TrendingDownIcon size={12} className="text-emerald-500" />}
              {item.key === "trend_classification" && item.unit === "degrading" && <TrendingUpIcon size={12} className="text-red-500" />}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function DetailedMetricsCard({ metrics, radar }: { metrics: DetailedMetrics; radar: RadarAxis[] | null }) {
  return (
    <Card title="Detailed Metrics">
      {radar && radar.length > 0 && (
        <div className="mb-6">
          <RadarChart axes={radar} />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MetricGroup title="Drift" items={metrics.drift_group} />
        <MetricGroup title="Calibration Statistics" items={metrics.statistics_group} />
        <MetricGroup title="Historical Trends" items={metrics.trends_group} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function HealthTab({ assetId, profile }: { assetId: string; profile: AssetProfile }) {
  const channels = profile.asset_type === "sensor" ? profile.sensor_channels : [];
  const hasChannelTabs = channels.length > 1;

  const [activeChannelId, setActiveChannelId] = useState<string | null>(channels[0]?.id ?? null);
  const [health, setHealth] = useState<AssetHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getAssetHealth(assetId, activeChannelId)
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load health data"))
      .finally(() => setLoading(false));
  }, [assetId, activeChannelId]);

  return (
    <div className="space-y-5">
      {hasChannelTabs && (
        <div className="flex items-center gap-1.5 flex-wrap">
          {channels.map((ch) => (
            <button
              key={ch.id}
              type="button"
              onClick={() => setActiveChannelId(ch.id)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                activeChannelId === ch.id
                  ? "bg-mar-accent/10 border-mar-accent text-mar-accent"
                  : "border-mar-border-md text-gray-500 hover:bg-mar-surface-alt"
              }`}
            >
              {ch.channel_id}
            </button>
          ))}
        </div>
      )}

      {loading && <HealthLoading />}
      {!loading && error && <HealthError message={error} />}
      {!loading && !error && health && (
        health.calibration_count < 2 || !health.overview ? (
          <HealthEmptyState />
        ) : (
          <>
            <HealthOverviewCard overview={health.overview} />
            {health.drift_evolution && (
              <DriftEvolutionCard data={health.drift_evolution} unit={health.channel_unit} />
            )}
            {health.stability && <StabilityCard data={health.stability} />}
            {health.calibration_options.length >= 2 && (
              <CurveComparisonCard assetId={assetId} options={health.calibration_options} unit={health.channel_unit} />
            )}
            {health.prediction.available && (
              <PredictionCard prediction={health.prediction} unit={health.channel_unit} />
            )}
            {health.detailed_metrics && (
              <DetailedMetricsCard metrics={health.detailed_metrics} radar={health.radar} />
            )}
          </>
        )
      )}
    </div>
  );
}
