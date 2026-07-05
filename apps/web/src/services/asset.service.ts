import { apiBlob, apiFetch, apiUpload, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { AssetCreateBody, AssetListItem, AssetProfile, AssetUpdateRequest, LocationOption } from "@/types/asset";
import type { CalibrationRecord, CalibrationPoint, AnalyzeRequest, AnalyzeResponse, CalibrationCreateBody } from "@/types/calibration";
import type { AuditLogEntry } from "@/types/audit_log";
import type { StoredFile } from "@/types/stored_file";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function listAssets(params: {
  limit?: number;
  is_active?: boolean;
  location_id?: string;
  include_descendants?: boolean;
} = {}): Promise<AssetListItem[]> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.is_active !== undefined) qs.set("is_active", String(params.is_active));
  if (params.location_id !== undefined) qs.set("location_id", params.location_id);
  if (params.include_descendants) qs.set("include_descendants", "true");
  return apiFetch<AssetListItem[]>(`/api/v1/assets?${qs}`, {
    headers: tokenHeader(),
  });
}

export async function getAssetProfile(id: string): Promise<AssetProfile> {
  return apiFetch<AssetProfile>(`/api/v1/assets/${id}/profile`, {
    headers: tokenHeader(),
  });
}

export async function getAssetCalibrations(id: string): Promise<CalibrationRecord[]> {
  return apiFetch<CalibrationRecord[]>(`/api/v1/assets/${id}/calibrations?limit=50`, {
    headers: tokenHeader(),
  });
}

export async function getAssetAuditLogs(id: string): Promise<AuditLogEntry[]> {
  return apiFetch<AuditLogEntry[]>(`/api/v1/assets/${id}/audit-logs`, {
    headers: tokenHeader(),
  });
}

export async function getAssetFiles(id: string): Promise<StoredFile[]> {
  return apiFetch<StoredFile[]>(`/api/v1/assets/${id}/files`, {
    headers: tokenHeader(),
  });
}

export async function uploadAssetFile(assetId: string, file: File): Promise<StoredFile> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<StoredFile>(`/api/v1/assets/${assetId}/files`, form, {
    headers: tokenHeader(),
  });
}

export async function deleteAssetFile(assetId: string, fileId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/assets/${assetId}/files/${fileId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function updateAsset(id: string, body: AssetUpdateRequest): Promise<AssetProfile> {
  return apiFetch<AssetProfile>(`/api/v1/assets/${id}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createAsset(body: AssetCreateBody): Promise<AssetProfile> {
  return apiFetch<AssetProfile>(`/api/v1/assets`, {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function duplicateAsset(sourceId: string, newAssetId: string): Promise<AssetProfile> {
  return apiFetch<AssetProfile>(`/api/v1/assets/${sourceId}/duplicate`, {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ new_asset_id: newAssetId }),
  });
}

export async function retireAsset(id: string, reason?: string): Promise<void> {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : "";
  return apiFetch<void>(`/api/v1/assets/${id}${qs}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function listTeams(): Promise<{ id: string; name: string }[]> {
  return apiFetch<{ id: string; name: string }[]>(`/api/v1/teams`, {
    headers: tokenHeader(),
  });
}

export async function getCalibrationPoints(calId: string): Promise<CalibrationPoint[]> {
  return apiFetch<CalibrationPoint[]>(`/api/v1/calibrations/${calId}/points`, {
    headers: tokenHeader(),
  });
}

export async function analyzeCalibration(body: AnalyzeRequest): Promise<AnalyzeResponse> {
  return apiFetch<AnalyzeResponse>(`/api/v1/calibrations/analyze`, {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function createCalibration(body: CalibrationCreateBody): Promise<CalibrationRecord> {
  return apiFetch<CalibrationRecord>(`/api/v1/calibrations`, {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteCalibration(calId: string): Promise<void> {
  await apiFetch<void>(`/api/v1/calibrations/${calId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function getNextCalibrationVersion(assetId: string, sensorId?: string): Promise<number> {
  const qs = new URLSearchParams({ count: "true" });
  if (sensorId) qs.set("sensor_id", sensorId);
  const cals = await apiFetch<CalibrationRecord[]>(`/api/v1/assets/${assetId}/calibrations?${qs}`, {
    headers: tokenHeader(),
  });
  return cals.length + 1;
}

export interface ProcedureDetail {
  id: string;
  proc_id: string | null;
  physical_quantity: string;
  name: string;
  version: string;
  description: string | null;
  standard_ref: string | null;
  author: string | null;
}

export async function getProcedure(id: string): Promise<ProcedureDetail> {
  return apiFetch<ProcedureDetail>(`/api/v1/procedures/${id}`, {
    headers: tokenHeader(),
  });
}

export async function listProcedures(physicalQuantity?: string): Promise<{ id: string; name: string; physical_quantity: string }[]> {
  const qs = new URLSearchParams();
  if (physicalQuantity) qs.set("physical_quantity", physicalQuantity);
  const query = qs.toString() ? `?${qs}` : "";
  return apiFetch(`/api/v1/calibrations/procedures${query}`, {
    headers: tokenHeader(),
  });
}

export async function fetchAssetLabelBlob(
  assetId: string,
  size: "2x2" | "4x2",
  format: "png" | "jpg" | "pdf",
): Promise<Blob> {
  return apiBlob(
    `/api/v1/assets/${assetId}/label?size=${encodeURIComponent(size)}&format=${format}`,
    { headers: tokenHeader() },
  );
}

export async function getCalibrationCertificateUrl(calId: string): Promise<{ url: string; filename: string }> {
  return apiFetch<{ url: string; filename: string }>(`/api/v1/calibrations/${calId}/certificate`, {
    headers: tokenHeader(),
  });
}

export async function listLocations(): Promise<LocationOption[]> {
  const raw = await apiFetch<{ id: string; name: string; parent_location_id: string | null }[]>(
    `/api/v1/locations?limit=500`,
    { headers: tokenHeader() },
  );
  const byId = new Map(raw.map(l => [l.id, l]));
  function getPath(id: string): string {
    const loc = byId.get(id);
    if (!loc) return "";
    if (!loc.parent_location_id) return loc.name;
    const parent = getPath(loc.parent_location_id);
    return parent ? `${parent} › ${loc.name}` : loc.name;
  }
  return raw.map(l => ({ id: l.id, path: getPath(l.id) })).sort((a, b) => a.path.localeCompare(b.path));
}
