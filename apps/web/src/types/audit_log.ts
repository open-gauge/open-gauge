export interface AuditLogEntry {
  id: string;
  actor_id: string | null;
  actor_email: string;
  actor_name: string | null;
  actor_role: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  entity_asset_id: string | null;
  before_state: unknown | null;
  after_state: unknown | null;
  ip_address: string | null;
  created_at: string;
}
