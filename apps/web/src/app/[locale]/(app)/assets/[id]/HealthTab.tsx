"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { AssetProfile } from "@/types/asset";
import type {
  AssetHealthResponse,
  CurveComparisonResponse,
  DetailedMetrics,
  DriftEvolution,
  CalibrationStability,
  StabilityMetricSeries,
  MetricGroupItem,
  PredictionOut,
  RadarAxis,
} from "@/types/health";
import type { RepairPeriod } from "@/types/calibration";
import { getAssetHealth, getCurveComparison, listRepairPeriods } from "@/services/health.service";
import { COLORS, HEALTH_METRIC_COLOR } from "@/lib/tokens";
import { Tooltip } from "@/components/tooltip";
import { CURVE_METRIC_DOCS_LINKS, DETAILED_METRIC_DOCS_LINKS, HEALTH_DOCS_LINKS } from "@/lib/docs-links";
import { usePlotly, PLOTLY_DARK_LAYOUT_BASE, PLOTLY_AXIS_BASE, axisTitle } from "@/hooks/use-plotly";
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

function Card({ title, tooltip, tooltipDocsHref, children }: { title: string; tooltip?: string; tooltipDocsHref?: string; children: React.ReactNode }) {
  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs">
      <div className="flex items-center gap-1.5 px-4 py-3 border-b border-og-border">
        <p className="text-xs font-semibold text-og-text">{title}</p>
        {tooltip && (
          <Tooltip content={tooltip} docsHref={tooltipDocsHref}>
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
  const t = useTranslations("assets.health");
  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-12 flex flex-col items-center text-center gap-3">
      <ActivityIcon size={32} className="text-gray-300 dark:text-gray-600" />
      <p className="text-sm text-gray-400 max-w-sm">
        {t("emptyState")}
      </p>
    </div>
  );
}

function HealthError({ message }: { message: string }) {
  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-8 flex flex-col items-center text-center gap-2">
      <WarningIcon size={24} className="text-red-400" />
      <p className="text-sm text-gray-400">{message}</p>
    </div>
  );
}

function HealthLoading() {
  const t = useTranslations("assets.health");
  return (
    <div className="bg-og-surface rounded-xl border border-og-border shadow-xs p-12 flex items-center justify-center">
      <p className="text-sm text-gray-400">{t("loadingHealthData")}</p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section 2 — Drift Evolution
// ---------------------------------------------------------------------------

function DriftEvolutionCard({
  data, unit, averageDriftRate,
}: {
  data: DriftEvolution;
  unit: string;
  averageDriftRate: number;
}) {
  const t = useTranslations("assets.health");
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
            `<b>%{customdata[0]}</b><br>${t("hoverMaxDrift")}: %{y} ${unit}<br>${t("hoverDate")}: %{x}<br>${t("hoverOperator")}: %{customdata[1]}<extra></extra>`,
          showlegend: false,
        },
      ];
      const layout: Partial<Plotly.Layout> = {
        ...PLOTLY_DARK_LAYOUT_BASE,
        xaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(t("calibrationDate")) },
        yaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(t("maximumDriftUnit", { unit })) },
      };
      return { data: traces, layout };
    },
    [data, unit]
  );

  return (
    <Card title={t("driftEvolution")} tooltip={t("tips.driftEvolution")} tooltipDocsHref={HEALTH_DOCS_LINKS.drift_evolution}>
      {data.points.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{t("noComparableCalibrations")}</p>
      ) : (
        <>
          <div ref={divRef} style={{ height: 300, width: "100%" }} />
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
            <div className="bg-og-surface-alt border border-og-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-1">
                {t("averageDrift")}
                <Tooltip content={t("tips.averageDrift")} docsHref={HEALTH_DOCS_LINKS.average_drift}>
                  <InfoIcon size={10} className="text-gray-400 cursor-help" />
                </Tooltip>
              </p>
              <p className="text-sm text-og-text tabular-nums">{fmtNum(averageDriftRate)} {unit}/{t("perYear")}</p>
            </div>
            <div className="bg-og-surface-alt border border-og-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{t("currentDriftRate")}</p>
              <p className="text-sm text-og-text tabular-nums">{fmtNum(data.current_drift_rate)} {unit}/{t("perYear")}</p>
            </div>
            <div className="bg-og-surface-alt border border-og-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-1">
                {t("slope")}
                <Tooltip content={t("tips.slope")} docsHref={HEALTH_DOCS_LINKS.average_drift}>
                  <InfoIcon size={10} className="text-gray-400 cursor-help" />
                </Tooltip>
              </p>
              <p className="text-sm text-og-text tabular-nums">{fmtNum(data.regression_slope)} {unit}/{t("perYear")}</p>
            </div>
            <div className="bg-og-surface-alt border border-og-border rounded-lg px-3 py-2">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-1">
                {t("regressionRSquared")}
                <Tooltip content={t("tips.regressionRSquared")} docsHref={HEALTH_DOCS_LINKS.prediction}>
                  <InfoIcon size={10} className="text-gray-400 cursor-help" />
                </Tooltip>
              </p>
              <p className="text-sm text-og-text tabular-nums">{fmtNum(data.regression_r_squared, 3)}</p>
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

/** Sorts a metric series' parallel (date, raw, smoothed) arrays chronologically — the API
 * doesn't guarantee calibration order, and Plotly's "lines" mode connects points in array
 * order (not x-value order), so an unsorted series renders as disconnected/zigzagging segments. */
function sortSeriesChronologically(series: StabilityMetricSeries): StabilityMetricSeries {
  const order = series.dates
    .map((date, i) => ({ date, i }))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))
    .map(({ i }) => i);

  return {
    ...series,
    dates: order.map((i) => series.dates[i]),
    raw_values: order.map((i) => series.raw_values[i]),
    smoothed_values: series.smoothed_values ? order.map((i) => series.smoothed_values![i]) : null,
  };
}

function StabilityCard({ data }: { data: CalibrationStability }) {
  const t = useTranslations("assets.health");
  const divRef = useRef<HTMLDivElement>(null);

  usePlotly(
    divRef,
    () => {
      const traces: Plotly.Data[] = [];
      for (const raw of data.series) {
        const series = sortSeriesChronologically(raw);
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
        xaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(t("calibrationDate")) },
        yaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(t("value")) },
        legend: { orientation: "h", y: -0.2, font: { size: 10, color: "#9ca3af" } },
      };
      return { data: traces, layout };
    },
    [data]
  );

  return (
    <Card title={t("calibrationStability")} tooltip={t("tips.calibrationStability")} tooltipDocsHref={HEALTH_DOCS_LINKS.calibration_stability}>
      <div ref={divRef} style={{ height: 300, width: "100%" }} />
      {data.smoothing_applied && (
        <p className="text-[11px] text-gray-400 mt-2">
          {t("smoothingHint")}
        </p>
      )}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Section 4 — Calibration Curve Comparison
// ---------------------------------------------------------------------------

function useCurveMetricTips() {
  const t = useTranslations("assets.health.tips");
  const tips: Record<string, string> = {
    max_drift: t("maxDrift"),
    mean_drift: t("meanDrift"),
    rms_drift: t("rmsDrift"),
    offset: t("offset"),
    gain: t("gain"),
    residual_drift: t("residualDrift"),
  };
  return tips;
}

function CurveComparisonCard({
  assetId, options, unit,
}: {
  assetId: string;
  options: { id: string; calibration_date: string; calibration_version: number; label: string }[];
  unit: string;
}) {
  const t = useTranslations("assets.health");
  const curveMetricTips = useCurveMetricTips();
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
      .catch((e) => { setResult(null); setError(e instanceof Error ? e.message : t("errorCompareCurves")); });
  }, [assetId, referenceId, currentId]);

  usePlotly(curveRef, () => {
    if (!result) return null;
    const traces: Plotly.Data[] = [
      { x: result.x, y: result.y_reference, type: "scatter", mode: "lines", line: { color: "#9ca3af", width: 2 }, name: t("reference") },
      { x: result.x, y: result.y_current, type: "scatter", mode: "lines", line: { color: COLORS.accent, width: 2 }, name: t("current") },
    ];
    const layout: Partial<Plotly.Layout> = {
      ...PLOTLY_DARK_LAYOUT_BASE,
      margin: { t: 28, r: 16, b: 40, l: 52 },
      xaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(t("input")) },
      yaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(`${t("output")} (${unit})`) },
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
      xaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(t("input")) },
      yaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(`ΔT (${unit})`) },
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
      xaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(t("input")) },
      yaxis: { ...PLOTLY_AXIS_BASE, title: axisTitle(`${t("absoluteDrift")} (${unit})`) },
    };
    return { data: traces, layout };
  }, [result, unit]);

  return (
    <Card title={t("curveComparison")} tooltip={t("tips.curveComparison")} tooltipDocsHref={HEALTH_DOCS_LINKS.curve_comparison}>
      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">{t("referenceCalibration")}</span>
          <select
            value={referenceId}
            onChange={(e) => setReferenceId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-og-border-md text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 focus:border-og-accent focus:ring-og-accent/20"
          >
            {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
          </select>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-xs text-gray-400">{t("currentCalibration")}</span>
          <select
            value={currentId}
            onChange={(e) => setCurrentId(e.target.value)}
            className="w-full px-3 py-2 rounded-lg border border-og-border-md text-sm text-og-text bg-og-surface focus:outline-hidden focus:ring-1 focus:border-og-accent focus:ring-og-accent/20"
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
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{t("calibrationCurves")}</p>
              <div ref={curveRef} style={{ height: 240, width: "100%" }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{t("differenceDeltaT")}</p>
              <div ref={deltaRef} style={{ height: 240, width: "100%" }} />
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{t("absoluteDrift")}</p>
              <div ref={driftRef} style={{ height: 240, width: "100%" }} />
            </div>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4">
            {([
              ["max_drift", t("maximumDrift"), result.summary.max_drift],
              ["mean_drift", t("meanDrift"), result.summary.mean_drift],
              ["rms_drift", t("rmsDrift"), result.summary.rms_drift],
              ["offset", t("offsetDrift"), result.summary.offset],
              ["gain", t("gainDrift"), result.summary.gain],
              ["residual_drift", t("residualDriftLabel"), result.summary.residual_drift],
            ] as [string, string, number][]).map(([key, label, value]) => (
              <div key={key} className="bg-og-surface-alt border border-og-border rounded-lg px-3 py-2">
                <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-1">
                  {label}
                  <Tooltip content={curveMetricTips[key]} docsHref={CURVE_METRIC_DOCS_LINKS[key]}>
                    <InfoIcon size={10} className="text-gray-400 cursor-help" />
                  </Tooltip>
                </p>
                <p className="text-sm text-og-text tabular-nums">{fmtUnit(value, unit)}</p>
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

function PredictionCard({
  prediction, unit, recommendedIntervalMonths,
}: {
  prediction: PredictionOut;
  unit: string;
  recommendedIntervalMonths: number;
}) {
  const t = useTranslations("assets.health");
  const rul = prediction.remaining_useful_life_months != null
    ? prediction.remaining_useful_life_months / 12
    : null;

  return (
    <Card title={t("prediction")} tooltip={t("tips.prediction")} tooltipDocsHref={HEALTH_DOCS_LINKS.prediction}>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        {([
          [t("year1"), prediction.projected_drift_1y],
          [t("years2"), prediction.projected_drift_2y],
          [t("years3"), prediction.projected_drift_3y],
          [t("years5"), prediction.projected_drift_5y],
        ] as [string, number | null][]).map(([label, value]) => (
          <div key={label} className="bg-og-surface-alt border border-og-border rounded-lg px-3 py-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{t("expectedDrift", { period: label })}</p>
            <p className="text-sm text-og-text tabular-nums">{fmtUnit(value, unit)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{t("predictedRul")}</p>
          <p className="text-xl font-bold text-og-text tabular-nums">
            {rul != null ? t("yearsValue", { years: fmtNum(rul, 1) }) : "—"}
          </p>
          {prediction.projected_tolerance_exceeded_date && (
            <p className="text-xs text-gray-400 mt-1">
              {t("projectedToExceed", { date: fmtDate(prediction.projected_tolerance_exceeded_date) })}
            </p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1">{t("confidence")}</p>
          <p className="text-xl font-bold text-og-text tabular-nums">
            {prediction.confidence_pct != null ? `${Math.round(prediction.confidence_pct)}%` : "—"}
          </p>
          {!prediction.confidence_reliable && (
            <p className="text-xs text-gray-400 mt-1">{t("lowConfidenceHint")}</p>
          )}
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-gray-400 mb-1 flex items-center gap-1">
            {t("recommendedInterval")}
            <Tooltip content={t("tips.recommendedInterval")} docsHref={HEALTH_DOCS_LINKS.recommended_interval}>
              <InfoIcon size={10} className="text-gray-400 cursor-help" />
            </Tooltip>
          </p>
          <p className="text-xl font-bold text-og-text tabular-nums">
            {recommendedIntervalMonths}
            <span className="text-xs text-gray-400 font-normal ml-1">{t("monthsUnit")}</span>
          </p>
        </div>
      </div>

      {prediction.message && (
        <div className="mt-4 flex items-center gap-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/40 rounded-lg px-3 py-2">
          <WarningIcon size={14} className="text-amber-500 shrink-0" />
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
          <div key={item.key} className="flex items-center justify-between py-2 border-b border-og-border last:border-b-0">
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              {item.label}
              <Tooltip content={item.tooltip} docsHref={DETAILED_METRIC_DOCS_LINKS[item.key]}>
                <InfoIcon size={11} className="text-gray-400 cursor-help" />
              </Tooltip>
            </span>
            <span className="text-sm text-og-text tabular-nums flex items-center gap-1">
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
  const t = useTranslations("assets.health");
  return (
    <Card title={t("detailedMetrics")}>
      {radar && radar.length > 0 && (
        <div className="mb-6">
          <RadarChart axes={radar} />
        </div>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <MetricGroup title={t("drift")} items={metrics.drift_group} />
        <MetricGroup title={t("calibrationStatistics")} items={metrics.statistics_group} />
        <MetricGroup title={t("historicalTrends")} items={metrics.trends_group} />
      </div>
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Root
// ---------------------------------------------------------------------------

export function HealthTab({ assetId, profile }: { assetId: string; profile: AssetProfile }) {
  const t = useTranslations("assets.health");
  const channels = profile.asset_type === "sensor" ? profile.sensor_channels : [];
  const hasChannelTabs = channels.length > 1;

  const [activeChannelId, setActiveChannelId] = useState<string | null>(channels[0]?.id ?? null);
  const [health, setHealth] = useState<AssetHealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Before/after-repair comparison — the dropdown always defaults to the last
  // ("Currently") period; it's only shown when there's at least one repair on
  // record, since with none it would just be a single, always-selected option.
  const [repairPeriods, setRepairPeriods] = useState<RepairPeriod[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<RepairPeriod | null>(null);
  const [periodsLoaded, setPeriodsLoaded] = useState(false);

  useEffect(() => {
    setPeriodsLoaded(false);
    listRepairPeriods(assetId)
      .then((periods) => {
        setRepairPeriods(periods);
        setSelectedPeriod(periods[periods.length - 1] ?? null);
      })
      .catch(() => setRepairPeriods([]))
      .finally(() => setPeriodsLoaded(true));
  }, [assetId]);

  useEffect(() => {
    if (!periodsLoaded) return;
    setLoading(true);
    setError(null);
    getAssetHealth(assetId, activeChannelId, selectedPeriod?.after, selectedPeriod?.before)
      .then(setHealth)
      .catch((e) => setError(e instanceof Error ? e.message : t("errorLoadHealthData")))
      .finally(() => setLoading(false));
  }, [assetId, activeChannelId, selectedPeriod, periodsLoaded]);

  return (
    <div className="space-y-5">
      {(hasChannelTabs || repairPeriods.length > 1) && (
        <div className="flex items-center justify-between flex-wrap gap-3">
          {hasChannelTabs ? (
            <div className="flex items-center gap-1.5 flex-wrap">
              {channels.map((ch) => (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => setActiveChannelId(ch.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    activeChannelId === ch.id
                      ? "bg-og-accent/10 border-og-accent text-og-accent"
                      : "border-og-border-md text-gray-500 hover:bg-og-surface-alt"
                  }`}
                >
                  {ch.channel_id}
                </button>
              ))}
            </div>
          ) : <div />}
          {repairPeriods.length > 1 && (
            <select
              value={repairPeriods.findIndex((p) => p === selectedPeriod)}
              onChange={(e) => setSelectedPeriod(repairPeriods[parseInt(e.target.value)] ?? null)}
              className="px-3 py-1.5 rounded-lg border border-og-border-md text-xs text-og-text bg-og-surface focus:outline-hidden focus:ring-1 focus:border-og-accent focus:ring-og-accent/20"
            >
              {repairPeriods.map((p, i) => (
                <option key={i} value={i}>
                  {p.before ? t("beforeRepair", { date: fmtDate(p.before) }) : t("currentlyPeriod")}
                </option>
              ))}
            </select>
          )}
        </div>
      )}

      {loading && <HealthLoading />}
      {!loading && error && <HealthError message={error} />}
      {!loading && !error && health && (
        health.calibration_count < 2 || !health.overview ? (
          <HealthEmptyState />
        ) : (
          <>
            {health.drift_evolution && (
              <DriftEvolutionCard
                data={health.drift_evolution}
                unit={health.channel_unit}
                averageDriftRate={health.overview.average_drift_rate}
              />
            )}
            {health.stability && <StabilityCard data={health.stability} />}
            {health.calibration_options.length >= 2 && (
              <CurveComparisonCard assetId={assetId} options={health.calibration_options} unit={health.channel_unit} />
            )}
            {health.prediction.available && (
              <PredictionCard
                prediction={health.prediction}
                unit={health.channel_unit}
                recommendedIntervalMonths={health.overview.recommended_interval_months}
              />
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
