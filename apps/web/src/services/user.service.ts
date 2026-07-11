import { apiFetch, apiUpload, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { UserProfile } from "@/types/user";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
}

export async function updateMe(body: { name?: string; email?: string }): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/users/me", {
    method: "PATCH",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function uploadMyPicture(file: File): Promise<UserProfile> {
  const form = new FormData();
  form.append("file", file);
  return apiUpload<UserProfile>("/api/v1/users/me/picture", form, {
    headers: tokenHeader(),
  });
}

export async function deleteMyPicture(): Promise<UserProfile> {
  return apiFetch<UserProfile>("/api/v1/users/me/picture", {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<void> {
  return apiFetch<void>("/api/v1/users/me/change-password", {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
  });
}

export async function deleteMe(): Promise<void> {
  return apiFetch<void>("/api/v1/users/me", {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function listTeams(): Promise<Team[]> {
  return apiFetch<Team[]>("/api/v1/teams", { headers: tokenHeader() });
}

export async function createTeam(body: { name: string; description?: string }): Promise<Team> {
  return apiFetch<Team>("/api/v1/teams", {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function updateTeam(teamId: string, body: { name?: string; description?: string }): Promise<Team> {
  return apiFetch<Team>(`/api/v1/teams/${teamId}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteTeam(teamId: string): Promise<void> {
  return apiFetch<void>(`/api/v1/teams/${teamId}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}
