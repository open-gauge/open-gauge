export interface CalibrationStatusCount {
  status: "valid" | "due_soon" | "expired" | "not_calibrated";
  count: number;
}

export interface DashboardSummary {
  registered_assets: number;
  sensors: number;
  daqs: number;
  low_health_assets: number;
  calibration_status_distribution: CalibrationStatusCount[];
  procedures: number;
  procedure_distribution: DistributionItem[];
}

export interface CalibrationEvent {
  id: string;       // asset UUID
  asset_id: string;
  name: string;
  due_date: string; // YYYY-MM-DD
}

export interface CalendarEvent {
  asset_id: string;
  name: string;
  date: string;        // YYYY-MM-DD
  event_type: "performed" | "due";
}

export interface DistributionItem {
  type: string;
  count: number;
}

export interface AssetTypeDistribution {
  sensors: DistributionItem[];
  daqs: DistributionItem[];
}

export interface ActivityItem {
  actor_email: string;
  actor_name: string | null;
  action: string;
  entity_asset_id: string | null;
  created_at: string;
}

export interface RecentAsset {
  id: string;
  asset_id: string;
  name: string;
  manufacturer: string;
  model: string;
  asset_type: string;
  updated_at: string;
}
