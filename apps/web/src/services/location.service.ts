import { apiFetch, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { LocationItem } from "@/types/location";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function listAllLocations(): Promise<LocationItem[]> {
  return apiFetch<LocationItem[]>("/api/v1/locations?limit=500", {
    headers: tokenHeader(),
  });
}

export async function getLocation(id: string): Promise<LocationItem> {
  return apiFetch<LocationItem>(`/api/v1/locations/${id}`, {
    headers: tokenHeader(),
  });
}
