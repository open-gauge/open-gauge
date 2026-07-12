import { apiFetch } from "@/lib/api";
import { isDemoMode } from "@/lib/demo/is-demo-mode";
import { DEMO_TOKEN } from "@/lib/demo/router";

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export interface RegisterResult {
  access_token: string | null;
  verification_required: boolean;
  message: string;
}

export async function login(email: string, password: string): Promise<string> {
  const data = await apiFetch<TokenResponse>("/api/v1/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  });
  return data.access_token;
}

export async function register(
  email: string,
  name: string,
  password: string
): Promise<RegisterResult> {
  return apiFetch<RegisterResult>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, password }),
  });
}

export async function verifyEmail(token: string): Promise<string> {
  const data = await apiFetch<TokenResponse>(`/api/v1/auth/verify-email?token=${encodeURIComponent(token)}`);
  return data.access_token;
}

export async function resendVerification(email: string): Promise<void> {
  return apiFetch<void>("/api/v1/auth/resend-verification", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function forgotPassword(email: string): Promise<void> {
  return apiFetch<void>("/api/v1/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  });
}

export async function resetPassword(token: string, newPassword: string): Promise<string> {
  const data = await apiFetch<TokenResponse>("/api/v1/auth/reset-password", {
    method: "POST",
    body: JSON.stringify({ token, new_password: newPassword }),
  });
  return data.access_token;
}

export function getToken(): string | null {
  if (isDemoMode()) return DEMO_TOKEN;
  if (typeof window === "undefined") return null;
  return localStorage.getItem("og_token");
}

export function clearToken(): void {
  localStorage.removeItem("og_token");
}
