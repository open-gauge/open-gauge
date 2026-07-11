import { apiFetch } from "@/lib/api";

interface TokenResponse {
  access_token: string;
  token_type: string;
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
): Promise<string> {
  const data = await apiFetch<TokenResponse>("/api/v1/auth/register", {
    method: "POST",
    body: JSON.stringify({ email, name, password }),
  });
  return data.access_token;
}

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem("og_token");
}

export function clearToken(): void {
  localStorage.removeItem("og_token");
}
