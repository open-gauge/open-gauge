import { apiBlob, apiBlobPost, apiFetch, apiUpload, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { Procedure, ProcedureCreateBody } from "@/types/procedure";
import type { StoredFile } from "@/types/stored_file";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function listProcedures(q?: string): Promise<Procedure[]> {
  const qs = new URLSearchParams();
  if (q) qs.set("q", q);
  const query = qs.toString() ? `?${qs}` : "";
  return apiFetch<Procedure[]>(`/api/v1/procedures${query}`, {
    headers: tokenHeader(),
  });
}

export async function getProcedure(id: string): Promise<Procedure> {
  return apiFetch<Procedure>(`/api/v1/procedures/${id}`, {
    headers: tokenHeader(),
  });
}

export async function createProcedure(body: ProcedureCreateBody): Promise<Procedure> {
  return apiFetch<Procedure>(`/api/v1/procedures`, {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateProcedure(id: string, body: Partial<ProcedureCreateBody>): Promise<Procedure> {
  return apiFetch<Procedure>(`/api/v1/procedures/${id}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteProcedure(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/procedures/${id}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function listProcedureFiles(procId: string): Promise<StoredFile[]> {
  return apiFetch<StoredFile[]>(`/api/v1/procedures/${procId}/files`, {
    headers: tokenHeader(),
  });
}

export async function uploadProcedureStepFile(procId: string, stepIndex: number, file: File): Promise<StoredFile> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<StoredFile>(
    `/api/v1/procedures/${procId}/files?step_index=${stepIndex}`,
    form,
    { headers: tokenHeader() },
  );
}

export async function deleteProcedureFile(procId: string, fileId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/procedures/${procId}/files/${fileId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

// ---------------------------------------------------------------------------
// Export / import
// ---------------------------------------------------------------------------

export async function fetchProcedureExportBlob(procPk: string): Promise<Blob> {
  return apiBlob(`/api/v1/procedures/${procPk}/export`, { headers: tokenHeader() });
}

export async function fetchBulkExportBlob(procPks: string[]): Promise<Blob> {
  return apiBlobPost(`/api/v1/procedures/export/bulk`, { proc_ids: procPks }, { headers: tokenHeader() });
}

export interface ProcedureImportResult {
  source_folder: string;
  status: "created" | "error";
  proc_id: string | null;
  new_proc_pk: string | null;
  error_message: string | null;
}

export interface ProcedureImportResponse {
  results: ProcedureImportResult[];
}

export async function importProceduresZip(files: File[]): Promise<ProcedureImportResponse> {
  // The backend endpoint takes a single file; bulk import (one or more zips)
  // is handled by calling it once per file and merging the result lists.
  const all: ProcedureImportResult[] = [];
  for (const file of files) {
    const form = new FormData();
    form.append("file", file);
    const res = await apiUpload<ProcedureImportResponse>(`/api/v1/procedures/import`, form, {
      headers: tokenHeader(),
    });
    all.push(...res.results);
  }
  return { results: all };
}

export interface ProcedureImportPreview {
  valid: boolean;
  error_message: string | null;
  proc_id: string | null;
  name: string | null;
  physical_quantity: string | null;
  version: string | null;
  step_count: number;
  file_count: number;
}

export async function validateProcedureImportZip(file: File): Promise<ProcedureImportPreview> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<ProcedureImportPreview>(`/api/v1/procedures/import/validate`, form, {
    headers: tokenHeader(),
  });
}

export async function importProcedureZip(file: File): Promise<ProcedureImportResponse> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<ProcedureImportResponse>(`/api/v1/procedures/import`, form, {
    headers: tokenHeader(),
  });
}

// ---------------------------------------------------------------------------
// Download as PDF
// ---------------------------------------------------------------------------

export interface ProcedureTemplateOption {
  id: string;
  name: string;
  is_enabled: boolean;
}

/** Every published, enabled "procedure"-type document template, for the download button's
 * template picker — includes the built-in Open Gauge template once it's been lazily created
 * (see Admin -> Templates -> Procedures), like any other row. */
export async function listProcedureTemplates(): Promise<ProcedureTemplateOption[]> {
  const all = await apiFetch<ProcedureTemplateOption[]>(`/api/v1/document-templates?type=procedure&status=published`, {
    headers: tokenHeader(),
  });
  return all.filter((t) => t.is_enabled);
}

/** Live-generates and downloads the procedure as PDF, optionally with a specific published
 * template. Omitting `documentTemplateId` renders with whichever template is currently marked
 * default in Admin -> Templates -> Procedures. */
export async function downloadProcedurePdfBlob(procId: string, documentTemplateId?: string | null): Promise<Blob> {
  const qs = documentTemplateId ? `?document_template_id=${encodeURIComponent(documentTemplateId)}` : "";
  return apiBlob(`/api/v1/procedures/${procId}/download${qs}`, {
    headers: tokenHeader(),
  });
}
