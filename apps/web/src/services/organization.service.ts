import { apiFetch, apiUpload, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type {
  EligibleUser,
  Organization,
  OrganizationCreateBody,
  OrganizationJoinRequest,
  OrganizationListItem,
  OrganizationMember,
  OrganizationUpdateBody,
  OrgRole,
} from "@/types/organization";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function listOrganizations(): Promise<OrganizationListItem[]> {
  return apiFetch<OrganizationListItem[]>("/api/v1/organizations?limit=200", { headers: tokenHeader() });
}

export async function listMyOrganizations(): Promise<OrganizationListItem[]> {
  return apiFetch<OrganizationListItem[]>("/api/v1/organizations?mine=true", { headers: tokenHeader() });
}

export async function getOrganization(id: string): Promise<Organization> {
  return apiFetch<Organization>(`/api/v1/organizations/${id}`, { headers: tokenHeader() });
}

export async function createOrganization(body: OrganizationCreateBody): Promise<Organization> {
  return apiFetch<Organization>("/api/v1/organizations", {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateOrganization(id: string, body: OrganizationUpdateBody): Promise<Organization> {
  return apiFetch<Organization>(`/api/v1/organizations/${id}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deactivateOrganization(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/organizations/${id}`, { method: "DELETE", headers: tokenHeader() });
}

export async function restoreOrganization(id: string): Promise<Organization> {
  return apiFetch<Organization>(`/api/v1/organizations/${id}/restore`, { method: "POST", headers: tokenHeader() });
}

export async function uploadOrgLogo(id: string, file: File): Promise<Organization> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<Organization>(`/api/v1/organizations/${id}/logo`, form, { headers: tokenHeader() });
}

export async function deleteOrgLogo(id: string): Promise<Organization> {
  return apiFetch<Organization>(`/api/v1/organizations/${id}/logo`, { method: "DELETE", headers: tokenHeader() });
}

export async function listOrgMembers(id: string): Promise<OrganizationMember[]> {
  return apiFetch<OrganizationMember[]>(`/api/v1/organizations/${id}/members`, { headers: tokenHeader() });
}

export async function listEligibleMembers(id: string, q?: string): Promise<EligibleUser[]> {
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  return apiFetch<EligibleUser[]>(`/api/v1/organizations/${id}/eligible-members${qs}`, { headers: tokenHeader() });
}

export async function addMembers(id: string, userIds: string[]): Promise<OrganizationMember[]> {
  return apiFetch<OrganizationMember[]>(`/api/v1/organizations/${id}/members`, {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ user_ids: userIds }),
  });
}

export async function updateMemberRole(id: string, userId: string, role: OrgRole): Promise<OrganizationMember> {
  return apiFetch<OrganizationMember>(`/api/v1/organizations/${id}/members/${userId}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
}

export async function removeMember(id: string, userId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/organizations/${id}/members/${userId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function leaveOrganization(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/organizations/${id}/leave`, { method: "POST", headers: tokenHeader() });
}

export async function requestToJoin(id: string): Promise<OrganizationJoinRequest> {
  return apiFetch<OrganizationJoinRequest>(`/api/v1/organizations/${id}/join-requests`, {
    method: "POST",
    headers: tokenHeader(),
  });
}

export async function listJoinRequests(id: string): Promise<OrganizationJoinRequest[]> {
  return apiFetch<OrganizationJoinRequest[]>(`/api/v1/organizations/${id}/join-requests`, {
    headers: tokenHeader(),
  });
}

export async function approveJoinRequest(id: string, requestId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/organizations/${id}/join-requests/${requestId}/approve`, {
    method: "POST",
    headers: tokenHeader(),
  });
}

export async function rejectJoinRequest(id: string, requestId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/organizations/${id}/join-requests/${requestId}/reject`, {
    method: "POST",
    headers: tokenHeader(),
  });
}
