import type Plotly from "plotly.js-dist-min";
import { PLOTLY_AXIS_BASE, PLOTLY_DARK_LAYOUT_BASE, axisTitle } from "@/hooks/use-plotly";
import { COLORS } from "@/lib/tokens";

export interface FrequencyResponsePointLike {
  sweep_index: number;
  frequency_value: number;
  amplitude_value: number | null;
  phase_value: number | null;
}

export interface FrequencyResponseChartConfig {
  frequencyUnit: string;
  amplitudeActive: boolean;
  amplitudeType: string | null; // "dB" | "RMS" | "Peak-to-Peak" | "Peak"
  amplitudeUnit: string | null; // physical unit, only meaningful when amplitudeType !== "dB"
  phaseActive: boolean;
  phaseUnit: string | null; // "°" | "rad"
}

/**
 * Builds a Plotly figure for a frequency-response sweep: amplitude and/or phase vs.
 * frequency, points connected by lines. When both are active, they share one figure
 * as a stacked Bode-style layout (amplitude panel on top, phase panel below, one
 * shared x-axis) via domain-split y-axes — not an overlaid twin-axis, since amplitude
 * and phase have very different scales. The x-axis defaults to log scale when the
 * sweep spans at least one decade (max/min >= 10), the standard convention for
 * frequency-response plots.
 */
export function buildFrequencyResponseFigure(
  points: FrequencyResponsePointLike[],
  config: FrequencyResponseChartConfig,
): { data: Plotly.Data[]; layout: Partial<Plotly.Layout> } | null {
  const sorted = [...points]
    .filter((p) => p.frequency_value != null && !isNaN(p.frequency_value))
    .sort((a, b) => a.frequency_value - b.frequency_value);
  if (sorted.length === 0 || (!config.amplitudeActive && !config.phaseActive)) return null;

  const freqs = sorted.map((p) => p.frequency_value);
  const minF = Math.min(...freqs);
  const maxF = Math.max(...freqs);
  const logX = minF > 0 && maxF / minF >= 10;

  const bothActive = config.amplitudeActive && config.phaseActive;
  const amplitudeYLabel = config.amplitudeType === "dB"
    ? "Amplitude (dB)"
    : `Amplitude${config.amplitudeUnit ? ` (${config.amplitudeUnit})` : ""}`;
  const phaseYLabel = `Phase (${config.phaseUnit ?? "°"})`;

  const data: Plotly.Data[] = [];
  if (config.amplitudeActive) {
    data.push({
      x: freqs,
      y: sorted.map((p) => p.amplitude_value),
      type: "scatter",
      mode: "lines+markers",
      name: "Amplitude",
      yaxis: "y",
      line: { color: COLORS.accent, width: 2 },
      marker: { size: 6 },
      hovertemplate: `%{x} ${config.frequencyUnit}<br>${amplitudeYLabel}: %{y}<extra></extra>`,
    });
  }
  if (config.phaseActive) {
    data.push({
      x: freqs,
      y: sorted.map((p) => p.phase_value),
      type: "scatter",
      mode: "lines+markers",
      name: "Phase",
      yaxis: bothActive ? "y2" : "y",
      line: { color: COLORS.action, width: 2 },
      marker: { size: 6 },
      hovertemplate: `%{x} ${config.frequencyUnit}<br>${phaseYLabel}: %{y}<extra></extra>`,
    });
  }

  const layout: Partial<Plotly.Layout> = {
    ...PLOTLY_DARK_LAYOUT_BASE,
    showlegend: bothActive,
    legend: { font: { size: 10, color: "#9ca3af" } },
    xaxis: {
      ...PLOTLY_AXIS_BASE,
      type: logX ? "log" : "linear",
      title: axisTitle(`Frequency (${config.frequencyUnit})`),
      domain: [0, 1],
      anchor: bothActive ? "y2" : "y",
    },
    yaxis: {
      ...PLOTLY_AXIS_BASE,
      title: axisTitle(config.amplitudeActive ? amplitudeYLabel : phaseYLabel),
      domain: bothActive ? [0.55, 1] : [0, 1],
      anchor: "x",
    },
    ...(bothActive ? {
      yaxis2: {
        ...PLOTLY_AXIS_BASE,
        title: axisTitle(phaseYLabel),
        domain: [0, 0.45],
        anchor: "x",
      },
    } : {}),
  };

  return { data, layout };
}

/** True when the sweep has enough valid frequency points to plot at all. */
export function hasPlottableFrequencyPoints(points: FrequencyResponsePointLike[]): boolean {
  return points.some((p) => p.frequency_value != null && !isNaN(p.frequency_value));
}
