import { apiFetch, apiUpload, authHeader } from "@/lib/api";
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
