import { apiFetch, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { AssetHealthResponse, CurveComparisonResponse } from "@/types/health";
import type { RepairPeriod } from "@/types/calibration";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function getAssetHealth(
  assetId: string,
  sensorId?: string | null,
  after?: string | null,
  before?: string | null,
): Promise<AssetHealthResponse> {
  const qs = new URLSearchParams();
  if (sensorId) qs.set("sensor_id", sensorId);
  if (after) qs.set("after", after);
  if (before) qs.set("before", before);
  const suffix = qs.toString() ? `?${qs.toString()}` : "";
  return apiFetch<AssetHealthResponse>(`/api/v1/assets/${assetId}/health${suffix}`, {
    headers: tokenHeader(),
  });
}

export async function listRepairPeriods(assetId: string): Promise<RepairPeriod[]> {
  return apiFetch<RepairPeriod[]>(`/api/v1/assets/${assetId}/health/repair-periods`, {
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
