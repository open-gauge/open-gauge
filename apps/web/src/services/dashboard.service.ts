import { apiFetch } from "@/lib/api";
import type {
  ActivityItem,
  AssetTypeDistribution,
  CalendarEvent,
  CalibrationEvent,
  DashboardSummary,
  DistributionItem,
  RecentAsset,
} from "@/types/dashboard";

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>("/api/v1/dashboard/summary");
}

export function getCalibrationEvents(): Promise<CalibrationEvent[]> {
  return apiFetch<CalibrationEvent[]>("/api/v1/dashboard/calibration-events");
}

export function getCalendarEvents(year: number): Promise<CalendarEvent[]> {
  return apiFetch<CalendarEvent[]>(`/api/v1/dashboard/calendar-events?year=${year}`);
}

export function getAssetDistribution(): Promise<DistributionItem[]> {
  return apiFetch<DistributionItem[]>("/api/v1/dashboard/distribution");
}

export function getAssetTypeDistribution(): Promise<AssetTypeDistribution> {
  return apiFetch<AssetTypeDistribution>("/api/v1/dashboard/asset-type-distribution");
}

export function getActivity(): Promise<ActivityItem[]> {
  return apiFetch<ActivityItem[]>("/api/v1/dashboard/activity");
}

export function getRecentAssets(): Promise<RecentAsset[]> {
  return apiFetch<RecentAsset[]>("/api/v1/dashboard/recent-assets");
}
