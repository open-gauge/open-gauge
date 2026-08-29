import type { GraphKind } from "@/types/template";

export interface GraphSamplePoint {
  x: number;
  y: number;
  y2?: number;
}

/** Illustrative sample series for each predefined graph kind, used only for the editor's own
 * preview — the real PDF renderer will plot actual calibration data at generation time. */
export function sampleSeriesFor(kind: GraphKind): GraphSamplePoint[] {
  switch (kind) {
    case "calibration_curve":
      return Array.from({ length: 11 }, (_, i) => {
        const x = i * 10;
        return { x, y: Number((0.1023 + 0.9987 * x - 0.00004 * x * x).toFixed(3)) };
      });
    case "reference_vs_measured":
      return Array.from({ length: 9 }, (_, i) => {
        const x = i * 12.5;
        return { x, y: Number((x + (Math.sin(i) * 0.4)).toFixed(3)) };
      });
    case "residual_plot":
      return Array.from({ length: 9 }, (_, i) => {
        const x = i * 12.5;
        return { x, y: Number((Math.sin(i * 1.3) * 0.3).toFixed(3)) };
      });
    case "drift_over_time":
      return Array.from({ length: 8 }, (_, i) => ({ x: i, y: Number((0.05 * i + Math.sin(i) * 0.02).toFixed(3)) }));
    case "custom":
    default:
      return Array.from({ length: 6 }, (_, i) => ({ x: i, y: i * i * 0.5 }));
  }
}
