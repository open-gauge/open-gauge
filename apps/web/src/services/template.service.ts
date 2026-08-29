import { apiFetch, apiUpload, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { StoredFile } from "@/types/stored_file";
import type {
  Template,
  TemplateCreateBody,
  TemplateListItem,
  TemplateStatus,
  TemplateType,
  TemplateUpdateBody,
} from "@/types/template";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export interface ListTemplatesParams {
  type?: TemplateType;
  status?: TemplateStatus;
  q?: string;
  includeArchived?: boolean;
}

export async function listTemplates(params: ListTemplatesParams = {}): Promise<TemplateListItem[]> {
  const qs = new URLSearchParams();
  if (params.type) qs.set("type", params.type);
  if (params.status) qs.set("status", params.status);
  if (params.q) qs.set("q", params.q);
  if (params.includeArchived) qs.set("include_archived", "true");
  const query = qs.toString() ? `?${qs}` : "";
  return apiFetch<TemplateListItem[]>(`/api/v1/document-templates${query}`, { headers: tokenHeader() });
}

export async function getTemplate(id: string): Promise<Template> {
  return apiFetch<Template>(`/api/v1/document-templates/${id}`, { headers: tokenHeader() });
}

export async function listTemplateVersions(id: string): Promise<TemplateListItem[]> {
  return apiFetch<TemplateListItem[]>(`/api/v1/document-templates/${id}/versions`, { headers: tokenHeader() });
}

export async function createTemplate(body: TemplateCreateBody): Promise<Template> {
  return apiFetch<Template>(`/api/v1/document-templates`, {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateTemplate(id: string, body: TemplateUpdateBody): Promise<Template> {
  return apiFetch<Template>(`/api/v1/document-templates/${id}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function branchNewTemplateVersion(id: string): Promise<Template> {
  return apiFetch<Template>(`/api/v1/document-templates/${id}/new-version`, {
    method: "POST",
    headers: tokenHeader(),
  });
}

export async function publishTemplate(id: string): Promise<Template> {
  return apiFetch<Template>(`/api/v1/document-templates/${id}/publish`, {
    method: "POST",
    headers: tokenHeader(),
  });
}

export async function archiveTemplate(id: string): Promise<Template> {
  return apiFetch<Template>(`/api/v1/document-templates/${id}/archive`, {
    method: "POST",
    headers: tokenHeader(),
  });
}

export async function duplicateTemplate(id: string, name?: string): Promise<Template> {
  return apiFetch<Template>(`/api/v1/document-templates/${id}/duplicate`, {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(name ? { name } : {}),
  });
}

export async function uploadTemplateImage(id: string, file: File): Promise<StoredFile> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<StoredFile>(`/api/v1/document-templates/${id}/files`, form, { headers: tokenHeader() });
}

export async function deleteTemplateImage(id: string, fileId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/document-templates/${id}/files/${fileId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}
