import { apiFetch, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { AuditLogEntry } from "@/types/audit_log";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function listAuditLogs(params: {
  skip?: number;
  limit?: number;
  entity_type?: string;
} = {}): Promise<AuditLogEntry[]> {
  const qs = new URLSearchParams();
  if (params.skip !== undefined) qs.set("skip", String(params.skip));
  if (params.limit !== undefined) qs.set("limit", String(params.limit));
  if (params.entity_type) qs.set("entity_type", params.entity_type);
  return apiFetch<AuditLogEntry[]>(`/api/v1/audit-logs?${qs}`, {
    headers: tokenHeader(),
  });
}
