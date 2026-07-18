import { apiBlob, apiBlobPost, apiFetch, apiUpload, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { UserProfile } from "@/types/user";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export interface AdminStats {
  assets: number;
  procedures: number;
  calibrations: number;
  users: number;
  organizations: number;
  teams: number;
}

export interface AdminSystem {
  uptime_seconds: number;
  db_status: "ok" | "error";
  api_version: string;
}

export interface Organization {
  id: string;
  name: string;
  description: string | null;
  logo_file_id: string | null;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export async function getAdminStats(): Promise<AdminStats> {
  return apiFetch<AdminStats>("/api/v1/admin/stats", { headers: tokenHeader() });
}

export async function getAdminSystem(): Promise<AdminSystem> {
  return apiFetch<AdminSystem>("/api/v1/admin/system", { headers: tokenHeader() });
}

export async function listAdminUsers(params: {
  skip?: number;
  limit?: number;
  q?: string;
}): Promise<UserProfile[]> {
  const qs = new URLSearchParams();
  if (params.skip != null) qs.set("skip", String(params.skip));
  if (params.limit != null) qs.set("limit", String(params.limit));
  if (params.q) qs.set("q", params.q);
  return apiFetch<UserProfile[]>(`/api/v1/users?${qs}`, { headers: tokenHeader() });
}

export async function countAdminUsers(q?: string): Promise<number> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const res = await apiFetch<{ count: number }>(`/api/v1/users/count${qs}`, { headers: tokenHeader() });
  return res.count;
}

export async function getUserById(id: string): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/api/v1/users/${id}`, { headers: tokenHeader() });
}

export async function updateAdminUser(
  userId: string,
  body: { role?: string; organization_id?: string | null; is_active?: boolean; is_verified?: boolean },
): Promise<UserProfile> {
  return apiFetch<UserProfile>(`/api/v1/users/${userId}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function listOrganizations(): Promise<Organization[]> {
  return apiFetch<Organization[]>("/api/v1/organizations", { headers: tokenHeader() });
}

export async function createOrganization(body: { name: string; description?: string }): Promise<Organization> {
  return apiFetch<Organization>("/api/v1/organizations", {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateOrganization(
  orgId: string,
  body: { name?: string; description?: string },
): Promise<Organization> {
  return apiFetch<Organization>(`/api/v1/organizations/${orgId}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteOrganization(orgId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/organizations/${orgId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function uploadOrgLogo(orgId: string, file: File): Promise<Organization> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<Organization>(`/api/v1/organizations/${orgId}/logo`, form, {
    headers: tokenHeader(),
  });
}

export async function deleteOrgLogo(orgId: string): Promise<Organization> {
  return apiFetch<Organization>(`/api/v1/organizations/${orgId}/logo`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export interface CertificateTemplate {
  id: string;
  organization_id: string | null;
  name: string;
  description: string | null;
  is_default: boolean;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

export async function listCertificateTemplates(organizationId?: string): Promise<CertificateTemplate[]> {
  const qs = organizationId ? `?organization_id=${organizationId}` : "";
  return apiFetch<CertificateTemplate[]>(`/api/v1/certificate-templates${qs}`, { headers: tokenHeader() });
}

export async function uploadCertificateTemplate(body: {
  file: File;
  name: string;
  description?: string;
  organizationId?: string | null;
  isDefault?: boolean;
}): Promise<CertificateTemplate> {
  const form = new FormData();
  form.append("file", body.file);
  form.append("name", body.name);
  if (body.description) form.append("description", body.description);
  if (body.organizationId) form.append("organization_id", body.organizationId);
  form.append("is_default", String(body.isDefault ?? false));
  return apiUpload<CertificateTemplate>("/api/v1/certificate-templates", form, {
    headers: tokenHeader(),
  });
}

export async function updateCertificateTemplate(
  templateId: string,
  body: { name?: string; description?: string; is_default?: boolean; is_active?: boolean },
): Promise<CertificateTemplate> {
  return apiFetch<CertificateTemplate>(`/api/v1/certificate-templates/${templateId}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteCertificateTemplate(templateId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/certificate-templates/${templateId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function previewCertificateTemplate(templateId: string): Promise<Blob> {
  return apiBlobPost(`/api/v1/certificate-templates/${templateId}/preview`, {}, { headers: tokenHeader() });
}

export async function previewBuiltinCertificateTemplate(): Promise<Blob> {
  return apiBlobPost("/api/v1/certificate-templates/preview-builtin", {}, { headers: tokenHeader() });
}

export interface AdminTeam {
  id: string;
  name: string;
  description: string | null;
}

export async function listOrgTeams(orgId: string): Promise<AdminTeam[]> {
  return apiFetch<AdminTeam[]>(`/api/v1/teams?org_id=${orgId}`, { headers: tokenHeader() });
}

export async function createOrgTeam(orgId: string, body: { name: string; description?: string }): Promise<AdminTeam> {
  return apiFetch<AdminTeam>("/api/v1/teams", {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ ...body, organization_id: orgId }),
  });
}

export async function updateOrgTeam(
  teamId: string,
  body: { name?: string; description?: string },
): Promise<AdminTeam> {
  return apiFetch<AdminTeam>(`/api/v1/teams/${teamId}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteOrgTeam(teamId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/teams/${teamId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

// ---------------------------------------------------------------------------
// Email settings
// ---------------------------------------------------------------------------

export interface EmailSettings {
  smtp_host: string | null;
  smtp_port: number;
  smtp_username: string | null;
  has_smtp_password: boolean;
  smtp_use_tls: boolean;
  from_email: string | null;
  from_name: string;
  enabled: boolean;
  calibration_reminder_days: number;
  updated_at: string;
}

export interface EmailSettingsUpdate {
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_password?: string;
  smtp_use_tls?: boolean;
  from_email?: string;
  from_name?: string;
  enabled?: boolean;
  calibration_reminder_days?: number;
}

export async function getEmailSettings(): Promise<EmailSettings> {
  return apiFetch<EmailSettings>("/api/v1/admin/email-settings", { headers: tokenHeader() });
}

export async function updateEmailSettings(body: EmailSettingsUpdate): Promise<EmailSettings> {
  return apiFetch<EmailSettings>("/api/v1/admin/email-settings", {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function sendTestEmail(toEmail: string): Promise<void> {
  return apiFetch<void>("/api/v1/admin/email-settings/test", {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ to_email: toEmail }),
  });
}

// ---------------------------------------------------------------------------
// Database — export/import/reset the whole database. Superadmin only.
// ---------------------------------------------------------------------------

export async function exportDatabase(): Promise<Blob> {
  return apiBlob("/api/v1/admin/database/export", { headers: tokenHeader() });
}

export async function importDatabase(file: File): Promise<void> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<void>("/api/v1/admin/database/import", form, { headers: tokenHeader() });
}

export async function resetDatabase(confirm: string): Promise<void> {
  return apiFetch<void>("/api/v1/admin/database/reset", {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ confirm }),
  });
}
