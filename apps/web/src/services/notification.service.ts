import { apiFetch, authHeader } from "@/lib/api";
import { getToken } from "@/services/auth.service";
import type { Notification } from "@/types/notification";

function tokenHeader(): Record<string, string> {
  const token = getToken();
  if (!token) throw new Error("Not authenticated");
  return authHeader(token);
}

export async function listNotifications(): Promise<Notification[]> {
  return apiFetch<Notification[]>("/api/v1/notifications", { headers: tokenHeader() });
}

export async function getUnreadCount(): Promise<number> {
  const res = await apiFetch<{ count: number }>("/api/v1/notifications/unread-count", { headers: tokenHeader() });
  return res.count;
}

export async function markNotificationRead(id: string): Promise<Notification> {
  return apiFetch<Notification>(`/api/v1/notifications/${id}/read`, { method: "POST", headers: tokenHeader() });
}

export async function markAllRead(): Promise<void> {
  return apiFetch<void>("/api/v1/notifications/read-all", { method: "POST", headers: tokenHeader() });
}
