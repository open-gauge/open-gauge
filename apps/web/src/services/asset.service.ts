import { apiFetch, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { AssetListItem, AssetProfile, AssetUpdateRequest, LocationOption } from "@/types/asset";
import type { CalibrationRecord, CalibrationCoefficient } from "@/types/calibration";
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
} = {}): Promise<AssetListItem[]> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.is_active !== undefined) qs.set("is_active", String(params.is_active));
  if (params.location_id !== undefined) qs.set("location_id", params.location_id);
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

export async function getCalibrationCoefficients(calId: string): Promise<CalibrationCoefficient[]> {
  return apiFetch<CalibrationCoefficient[]>(`/api/v1/calibrations/${calId}/coefficients`, {
    headers: tokenHeader(),
  });
}

export async function getAssetCertificates(id: string): Promise<{ id: string; calibration_id: string | null; certificate_number: string; issued_by: string; issued_at: string; valid_until: string | null; file_id: string | null }[]> {
  return apiFetch(`/api/v1/assets/${id}/certificates`, {
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

export async function updateAsset(id: string, body: AssetUpdateRequest): Promise<AssetProfile> {
  return apiFetch<AssetProfile>(`/api/v1/assets/${id}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listLocations(): Promise<LocationOption[]> {
  const raw = await apiFetch<{ id: string; name: string; parent_location_id: string | null }[]>(
    `/api/v1/locations?limit=500`,
    { headers: tokenHeader() },
  );
  // Build path labels
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
