"use client";

import { useRef } from "react";
import { usePlotly } from "@/hooks/use-plotly";
import {
  buildFrequencyResponseFigure,
  type FrequencyResponseChartConfig,
  type FrequencyResponsePointLike,
} from "@/lib/frequency-response-chart";

interface FrequencyResponseChartProps extends FrequencyResponseChartConfig {
  points: FrequencyResponsePointLike[];
  height?: number;
}

/** Interactive (zoom/pan/hover) frequency-response chart, shared by the calibration
 * wizard's live entry step and the read-only calibration-detail panel. */
export function FrequencyResponseChart({ points, height = 340, ...config }: FrequencyResponseChartProps) {
  const divRef = useRef<HTMLDivElement>(null);

  usePlotly(
    divRef,
    () => buildFrequencyResponseFigure(points, config),
    [
      points,
      config.frequencyUnit,
      config.amplitudeActive,
      config.amplitudeType,
      config.amplitudeUnit,
      config.phaseActive,
      config.phaseUnit,
    ],
  );

  return <div ref={divRef} style={{ height, width: "100%" }} />;
}
