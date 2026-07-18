import { apiBlob, apiBlobPost, apiFetch, apiUpload, authHeader } from "@/lib/api";
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

export async function getAssetCalibrations(id: string, includeVoided = false): Promise<CalibrationRecord[]> {
  const qs = new URLSearchParams({ limit: "50" });
  if (includeVoided) qs.set("include_voided", "true");
  return apiFetch<CalibrationRecord[]>(`/api/v1/assets/${id}/calibrations?${qs}`, {
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

export async function uploadAssetPicture(assetId: string, file: File): Promise<AssetProfile> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<AssetProfile>(`/api/v1/assets/${assetId}/picture`, form, {
    headers: tokenHeader(),
  });
}

export async function deleteAssetPicture(assetId: string): Promise<AssetProfile> {
  return apiFetch<AssetProfile>(`/api/v1/assets/${assetId}/picture`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function fetchAssetExportBlob(assetId: string): Promise<Blob> {
  return apiBlob(`/api/v1/assets/${assetId}/export`, { headers: tokenHeader() });
}

export async function fetchBulkExportBlob(assetIds: string[]): Promise<Blob> {
  return apiBlobPost(`/api/v1/assets/export/bulk`, { asset_ids: assetIds }, { headers: tokenHeader() });
}

export interface AssetImportResult {
  source_folder: string;
  status: "created" | "error";
  asset_id: string | null;
  new_asset_pk: string | null;
  error_message: string | null;
}

export interface AssetImportResponse {
  results: AssetImportResult[];
}

export async function importAssetsZip(files: File[]): Promise<AssetImportResponse> {
  // The backend endpoint takes a single file; bulk import (one or more zips)
  // is handled by calling it once per file and merging the result lists.
  const all: AssetImportResult[] = [];
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiUpload<AssetImportResponse>(`/api/v1/assets/import`, form, {
      headers: tokenHeader(),
    });
    all.push(...res.results);
  }
  return { results: all };
}

export interface AssetImportPreview {
  valid: boolean;
  error_message: string | null;
  asset_id: string | null;
  name: string | null;
  manufacturer: string | null;
  model: string | null;
  asset_type: string | null;
  channel_count: number;
  calibration_count: number;
}

export async function validateImportZip(file: File): Promise<AssetImportPreview> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<AssetImportPreview>(`/api/v1/assets/import/validate`, form, {
    headers: tokenHeader(),
  });
}

export async function importAssetZipWithOverrides(
  file: File,
  overrides: { locationId?: string; owner?: string } = {}
): Promise<AssetImportResponse> {
  const form = new FormData();
  form.append("file", file);
  if (overrides.locationId) form.append("location_id", overrides.locationId);
  if (overrides.owner) form.append("owner", overrides.owner);
  return apiUpload<AssetImportResponse>(`/api/v1/assets/import`, form, {
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

export async function voidCalibration(calId: string, reason?: string): Promise<void> {
  const qs = reason ? `?${new URLSearchParams({ reason })}` : "";
  await apiFetch<void>(`/api/v1/calibrations/${calId}${qs}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function restoreCalibration(calId: string): Promise<CalibrationRecord> {
  return apiFetch<CalibrationRecord>(`/api/v1/calibrations/${calId}/restore`, {
    method: "POST",
    headers: tokenHeader(),
  });
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
  size: "1x0.5" | "2x2" | "4x2",
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

export interface CertificateTemplateOption {
  id: string;
  name: string;
}

export async function listCalibrationCertificateTemplates(calId: string): Promise<CertificateTemplateOption[]> {
  return apiFetch<CertificateTemplateOption[]>(`/api/v1/calibrations/${calId}/certificate-templates`, {
    headers: tokenHeader(),
  });
}

/** Live-generates and downloads the certificate, optionally with a specific template. */
export async function downloadCalibrationCertificateBlob(calId: string, templateId?: string | null): Promise<Blob> {
  const qs = templateId ? `?template_id=${encodeURIComponent(templateId)}` : "";
  return apiBlob(`/api/v1/calibrations/${calId}/certificate/download${qs}`, {
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
