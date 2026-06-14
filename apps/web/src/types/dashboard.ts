export interface DashboardSummary {
  registered_assets: number;
  sensors: number;
  daqs: number;
  low_health_assets: number;
}

export interface CalibrationEvent {
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
  action: string;
  entity_asset_id: string | null;
  created_at: string;
}

export interface RecentAsset {
  asset_id: string;
  name: string;
  manufacturer: string;
  model: string;
  asset_type: string;
  updated_at: string;
}
