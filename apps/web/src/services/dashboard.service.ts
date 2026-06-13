import { apiFetch } from "@/lib/api";
import type {
  ActivityItem,
  CategoryDistribution,
  DashboardSummary,
  DistributionItem,
  RecentAsset,
  ThroughputPoint,
  UpcomingAsset,
} from "@/types/dashboard";

export function getDashboardSummary(): Promise<DashboardSummary> {
  return apiFetch<DashboardSummary>("/api/v1/dashboard/summary");
}

export function getCalibrationThroughput(): Promise<ThroughputPoint[]> {
  return apiFetch<ThroughputPoint[]>("/api/v1/dashboard/throughput");
}

export function getAssetDistribution(): Promise<DistributionItem[]> {
  return apiFetch<DistributionItem[]>("/api/v1/dashboard/distribution");
}

export function getCategoryDistribution(): Promise<CategoryDistribution[]> {
  return apiFetch<CategoryDistribution[]>("/api/v1/dashboard/category-distribution");
}

export function getUpcomingAssets(): Promise<UpcomingAsset[]> {
  return apiFetch<UpcomingAsset[]>("/api/v1/dashboard/upcoming");
}

export function getActivity(): Promise<ActivityItem[]> {
  return apiFetch<ActivityItem[]>("/api/v1/dashboard/activity");
}

export function getRecentAssets(): Promise<RecentAsset[]> {
  return apiFetch<RecentAsset[]>("/api/v1/dashboard/recent-assets");
}
