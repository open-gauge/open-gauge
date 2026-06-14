export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_asset_id: string | null;
  before_state: unknown | null;
  after_state: unknown | null;
  ip_address: string | null;
  created_at: string;
}
