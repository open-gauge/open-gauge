export interface DashboardSummary {
  registered_assets: number;
  valid_calibrations: number;
  valid_coverage_pct: number;
  due_within_30_days: number;
  expired: number;
}

export interface ThroughputPoint {
  month: string;
  completed: number;
  expired: number;
}

export interface DistributionItem {
  type: string;
  count: number;
}

export interface SubtypeItem {
  type: string;
  count: number;
}

export interface CategoryDistribution {
  category: string;
  total: number;
  items: SubtypeItem[];
}

export interface UpcomingAsset {
  asset_id: string;
  name: string;
  category: string;
  next_due_at: string | null;
  health_score: number;
  calibration_status: string;
}

export interface ActivityItem {
  actor_email: string;
  action: string;
  entity_asset_id: string | null;
  created_at: string;
}

export interface RecentAsset {
  asset_id: string;
  name: string;
  manufacturer: string;
  model: string;
  calibration_status: string;
  updated_at: string;
}
