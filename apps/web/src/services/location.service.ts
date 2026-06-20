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

export interface LocationUpdateBody {
  name?: string;
  description?: string | null;
  location_type?: string;
  code?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  parent_location_id?: string | null;
}

export async function updateLocation(id: string, body: LocationUpdateBody): Promise<LocationItem> {
  return apiFetch<LocationItem>(`/api/v1/locations/${id}`, {
    method: "PUT",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export interface LocationCreateBody {
  organization_id: string;
  name: string;
  location_type: string;
  description?: string | null;
  code?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  parent_location_id?: string | null;
}

export async function createLocation(body: LocationCreateBody): Promise<LocationItem> {
  return apiFetch<LocationItem>("/api/v1/locations", {
    method: "POST",
    headers: { ...tokenHeader(), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function deleteLocation(id: string): Promise<void> {
  return apiFetch<void>(`/api/v1/locations/${id}`, {
    method: "DELETE",
    headers: tokenHeader(),
  });
}

export async function getMyOrganizationId(): Promise<string | null> {
  const me = await apiFetch<{ organization_id: string | null }>("/api/v1/users/me", {
    headers: tokenHeader(),
  });
  return me.organization_id;
}
