export interface LocationItem {
  id: string;
  organization_id: string;
  parent_location_id: string | null;
  name: string;
  description: string | null;
  location_type: string;
  code: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  is_calibration_lab: boolean;
  is_active: boolean;
  asset_count: number;
}

export interface LocationTreeNode extends LocationItem {
  children: LocationTreeNode[];
}
