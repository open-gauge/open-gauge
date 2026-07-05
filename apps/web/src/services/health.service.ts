import { apiFetch, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { AssetHealthResponse, CurveComparisonResponse } from "@/types/health";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function getAssetHealth(
  assetId: string,
  sensorId?: string | null
): Promise<AssetHealthResponse> {
  const qs = sensorId ? `?sensor_id=${sensorId}` : "";
  return apiFetch<AssetHealthResponse>(`/api/v1/assets/${assetId}/health${qs}`, {
    headers: tokenHeader(),
  });
}

export async function getCurveComparison(
  assetId: string,
  referenceCalibrationId: string,
  currentCalibrationId: string
): Promise<CurveComparisonResponse> {
  const qs = `?reference_calibration_id=${referenceCalibrationId}&current_calibration_id=${currentCalibrationId}`;
  return apiFetch<CurveComparisonResponse>(
    `/api/v1/assets/${assetId}/health/curve-comparison${qs}`,
    { headers: tokenHeader() }
  );
}
