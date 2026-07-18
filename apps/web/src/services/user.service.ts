import { apiFetch, apiUpload, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { UserProfile, UserSignature } from "@/types/user";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export interface Team {
  id: string;
  name: string;
  description: string | null;
  is_member: boolean;
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

export async function getMySignature(): Promise<UserSignature | null> {
  return apiFetch<UserSignature | null>("/api/v1/users/me/signature", {
    headers: tokenHeader(),
  });
}

export async function uploadMySignature(file: File | Blob, source: "upload" | "drawn"): Promise<UserSignature> {
  const form = new FormData();
  form.append("file", file, file instanceof File ? file.name : "signature.png");
  form.append("source", source);
  return apiUpload<UserSignature>("/api/v1/users/me/signature", form, {
    headers: tokenHeader(),
  });
}

export async function deleteMySignature(): Promise<void> {
  return apiFetch<void>("/api/v1/users/me/signature", {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export interface SignaturePublicKey {
  algorithm: string;
  public_key_pem: string;
  fingerprint_sha256: string;
}

export async function getUserPublicKey(userId: string): Promise<SignaturePublicKey> {
  return apiFetch<SignaturePublicKey>(`/api/v1/users/${userId}/signature/public-key`, {
    headers: tokenHeader(),
  });
}

export interface SignatureVerifyResult {
  verified: boolean;
  image_hash_match: boolean;
  signature_valid: boolean;
  version: number;
  signed_at: string;
}

export async function verifyUserSignature(userId: string): Promise<SignatureVerifyResult> {
  return apiFetch<SignatureVerifyResult>(`/api/v1/users/${userId}/signature/verify`, {
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

export async function joinTeam(teamId: string): Promise<Team> {
  return apiFetch<Team>(`/api/v1/teams/${teamId}/join`, {
    method: "POST",
    headers: tokenHeader(),
  });
}

export async function leaveTeam(teamId: string): Promise<Team> {
  return apiFetch<Team>(`/api/v1/teams/${teamId}/leave`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}
