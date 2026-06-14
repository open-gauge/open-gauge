import { apiFetch, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { AssetListItem } from "@/types/asset";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function listAssets(params: {
  limit?: number;
  is_active?: boolean;
} = {}): Promise<AssetListItem[]> {
  const qs = new URLSearchParams();
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.is_active !== undefined) qs.set("is_active", String(params.is_active));
  return apiFetch<AssetListItem[]>(`/api/v1/assets?${qs}`, {
    headers: tokenHeader(),
  });
}
