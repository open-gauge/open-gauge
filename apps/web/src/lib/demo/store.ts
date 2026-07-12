/**
 * In-memory (session-mirrored) data store for demo mode.
 *
 * Hydrates once from the committed fixture (`fixtures/data.json`), then holds
 * a mutable working copy for the lifetime of the module. Client-side, every
 * mutation is mirrored into `sessionStorage` (guarded the same way
 * `services/auth.service.ts`'s `getToken()` guards `localStorage`) so
 * navigating between pages during one visit preserves simulated edits — a
 * hard reload or new tab re-hydrates from the pristine fixture, since
 * `sessionStorage` is itself per-tab and never shared.
 *
 * Server-side (this module is also imported during `next build`'s static
 * generation pass), no `window`/`sessionStorage` access is ever attempted.
 *
 * `router.ts` is the only other module that should import from here — it
 * implements every mock endpoint on top of the accessors/mutators below.
 */
import rawFixture from "./fixtures/data.json";
import type { AssetListItem, AssetProfile, ChannelListItem } from "@/types/asset";
import type { AuditLogEntry } from "@/types/audit_log";
import type { CalibrationPoint, CalibrationRecord } from "@/types/calibration";
import type { AssetHealthResponse } from "@/types/health";
import type { LocationItem } from "@/types/location";
import type { Procedure } from "@/types/procedure";
import type { StoredFile } from "@/types/stored_file";
import type { UserProfile, UserSignature } from "@/types/user";
import type { EmailSettings, Organization } from "@/services/admin.service";
import type { Team } from "@/services/user.service";

// ---------------------------------------------------------------------------
// Fixture shape (widened by resolveJsonModule) -> strongly-typed store shape
// ---------------------------------------------------------------------------

interface StoredTeam extends Team {
  organization_id: string;
  created_at: string;
}

interface DemoState {
  generatedAt: string;
  demoUserId: string;
  organization: Organization;
  users: UserProfile[];
  teams: StoredTeam[];
  locations: LocationItem[];
  procedures: Procedure[];
  assets: AssetProfile[];
  calibrations: CalibrationRecord[];
  calibrationPoints: Record<string, CalibrationPoint[]>;
  auditLogs: AuditLogEntry[];
  storedFiles: StoredFile[];
  healthSnapshots: Record<string, AssetHealthResponse>;
  emailSettings: EmailSettings;
  // Optional: absent in the committed fixture (added after it was generated), so every
  // accessor below must tolerate `signatures` being undefined at runtime.
  signatures?: Record<string, UserSignature>;
}

const FIXTURE = rawFixture as unknown as DemoState;
const SESSION_KEY = "og_demo_store_v1";

let cache: DemoState | null = null;

function cloneFixture(): DemoState {
  if (typeof structuredClone === "function") return structuredClone(FIXTURE);
  return JSON.parse(JSON.stringify(FIXTURE)) as DemoState;
}

function hydrate(): DemoState {
  if (typeof window === "undefined") return cloneFixture();
  try {
    const saved = window.sessionStorage.getItem(SESSION_KEY);
    if (saved) return JSON.parse(saved) as DemoState;
  } catch {
    // sessionStorage unavailable (private browsing, quota, etc.) — fall through to a fresh copy.
  }
  return cloneFixture();
}

function getState(): DemoState {
  if (!cache) cache = hydrate();
  return cache;
}

function persist(): void {
  if (typeof window === "undefined" || !cache) return;
  try {
    window.sessionStorage.setItem(SESSION_KEY, JSON.stringify(cache));
  } catch {
    // Ignore quota/serialization errors — the in-memory copy is still correct
    // for the rest of this page view, it just won't survive navigation.
  }
}

/** Resets the working copy back to the pristine fixture (used only by tests/dev tools, if ever wired up). */
export function resetDemoStore(): void {
  cache = cloneFixture();
  persist();
}

// ---------------------------------------------------------------------------
// Id generation for session-created records
// ---------------------------------------------------------------------------

export function genId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const hex = () => Math.floor(Math.random() * 16).toString(16);
  const seg = (n: number) => Array.from({ length: n }, hex).join("");
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${seg(4)}-${seg(12)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// Location path resolution + asset enrichment (recomputed on every read so
// session-created calibrations/moves/etc. are always reflected consistently)
// ---------------------------------------------------------------------------

function locationById(id: string | null): LocationItem | undefined {
  if (!id) return undefined;
  return getState().locations.find((l) => l.id === id);
}

function resolveLocationPath(locationId: string | null): { siteName: string | null; locationName: string | null } {
  if (!locationId) return { siteName: null, locationName: null };
  const path: string[] = [];
  let current = locationById(locationId);
  while (current) {
    path.push(current.name);
    current = current.parent_location_id ? locationById(current.parent_location_id) : undefined;
  }
  path.reverse();
  return { siteName: path[0] ?? null, locationName: path[path.length - 1] ?? null };
}

function teamNameById(teamId: string | null): string | null {
  if (!teamId) return null;
  return getState().teams.find((t) => t.id === teamId)?.name ?? null;
}

const DUE_SOON_WINDOW_DAYS = 30;

/** Recomputes every derived field on an asset from its current calibrations/location — mirrors apps/api/app/repositories/asset.py. */
export function recomputeAssetDerived(asset: AssetProfile): AssetProfile {
  const cals = getState().calibrations
    .filter((c) => c.asset_id === asset.id && c.is_active)
    .sort((a, b) => (a.calibration_date < b.calibration_date ? 1 : -1));

  const today = nowIso().slice(0, 10);
  const soon = new Date(Date.now() + DUE_SOON_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10);
  const latestDue = cals.reduce<string | null>((max, c) => (max === null || c.due_date > max ? c.due_date : max), null);

  let status: AssetProfile["calibration_status"];
  if (!asset.is_active) status = "retired";
  else if (!cals.length) status = "not_calibrated";
  else if (latestDue !== null && latestDue < today) status = "expired";
  else if (latestDue !== null && latestDue <= soon) status = "due_soon";
  else status = "valid";

  const { siteName, locationName } = resolveLocationPath(asset.location_id);
  const loc = locationById(asset.location_id);

  asset.calibration_status = status;
  asset.next_due_at = latestDue;
  asset.last_calibration_date = cals[0]?.calibration_date ?? null;
  asset.calibration_count = cals.length;
  asset.site_name = siteName;
  asset.location_name = locationName;
  asset.location_code = loc?.code ?? null;
  asset.location_description = loc?.description ?? null;
  asset.location_latitude = loc?.latitude ?? null;
  asset.location_longitude = loc?.longitude ?? null;
  asset.owner_name = teamNameById(asset.owner);
  asset.subtype = asset.asset_type === "sensor" ? (asset.sensor_channels[0]?.physical_quantity ?? null) : (asset.daq_details?.daq_type ?? null);
  asset.technology = asset.asset_type === "sensor" ? (asset.sensor_channels[0]?.technology ?? null) : null;

  const snapshot = getState().healthSnapshots[asset.id];
  asset.calibration_health_score = snapshot?.overview ? Math.round(snapshot.overview.health_score) : null;

  return asset;
}

function toListItem(asset: AssetProfile): AssetListItem {
  const channels: ChannelListItem[] = asset.sensor_channels.map((c) => ({
    channel_id: c.channel_id,
    physical_quantity: c.physical_quantity,
    technology: c.technology,
    measurement_min: c.measurement_min,
    measurement_max: c.measurement_max,
    unit: c.unit,
    calibration_role: c.calibration_role,
  }));
  const first = channels[0];
  return {
    id: asset.id,
    asset_id: asset.asset_id,
    asset_type: asset.asset_type,
    name: asset.name,
    manufacturer: asset.manufacturer,
    model: asset.model,
    serial_number: asset.serial_number,
    health_score: asset.health_score,
    is_active: asset.is_active,
    updated_at: asset.updated_at,
    site_name: asset.site_name,
    location_name: asset.location_name,
    calibration_status: asset.calibration_status,
    next_due_at: asset.next_due_at,
    subtype: asset.subtype,
    technology: asset.technology,
    range_min: first?.measurement_min ?? null,
    range_max: first?.measurement_max ?? null,
    range_unit: first?.unit ?? null,
    channels,
  };
}

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

export interface ListAssetsFilter {
  isActive?: boolean;
  locationId?: string;
  includeDescendants?: boolean;
  limit?: number;
}

function descendantLocationIds(rootId: string): Set<string> {
  const all = getState().locations;
  const children = new Map<string, string[]>();
  for (const l of all) {
    if (l.parent_location_id) {
      const arr = children.get(l.parent_location_id) ?? [];
      arr.push(l.id);
      children.set(l.parent_location_id, arr);
    }
  }
  const result = new Set<string>();
  const queue = [rootId];
  while (queue.length) {
    const id = queue.shift() as string;
    if (result.has(id)) continue;
    result.add(id);
    queue.push(...(children.get(id) ?? []));
  }
  return result;
}

export function listAssets(filter: ListAssetsFilter = {}): AssetListItem[] {
  let assets = getState().assets.map(recomputeAssetDerived);
  if (filter.isActive !== undefined) assets = assets.filter((a) => a.is_active === filter.isActive);
  if (filter.locationId) {
    const ids = filter.includeDescendants ? descendantLocationIds(filter.locationId) : new Set([filter.locationId]);
    assets = assets.filter((a) => a.location_id !== null && ids.has(a.location_id));
  }
  assets = [...assets].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  if (filter.limit !== undefined) assets = assets.slice(0, filter.limit);
  return assets.map(toListItem);
}

export function getAssetProfile(id: string): AssetProfile | undefined {
  const asset = getState().assets.find((a) => a.id === id);
  return asset ? recomputeAssetDerived(asset) : undefined;
}

export function updateAsset(id: string, patch: Partial<AssetProfile>): AssetProfile | undefined {
  const asset = getState().assets.find((a) => a.id === id);
  if (!asset) return undefined;
  Object.assign(asset, patch, { updated_at: nowIso(), version: asset.version + 1 });
  recomputeAssetDerived(asset);
  persist();
  return asset;
}

export function createAsset(profile: AssetProfile): AssetProfile {
  getState().assets.push(profile);
  recomputeAssetDerived(profile);
  persist();
  return profile;
}

export function retireAsset(id: string, reason?: string): AssetProfile | undefined {
  const asset = getState().assets.find((a) => a.id === id);
  if (!asset) return undefined;
  asset.is_active = false;
  asset.retired_at = nowIso();
  asset.retired_reason = reason ?? null;
  asset.updated_at = nowIso();
  recomputeAssetDerived(asset);
  persist();
  return asset;
}

export function listTeamsLite(): { id: string; name: string }[] {
  return getState().teams.map((t) => ({ id: t.id, name: t.name }));
}

// ---------------------------------------------------------------------------
// Calibrations
// ---------------------------------------------------------------------------

export function listCalibrationsForAsset(assetId: string, includeVoided: boolean): CalibrationRecord[] {
  return getState().calibrations
    .filter((c) => c.asset_id === assetId && (includeVoided || c.is_active))
    .sort((a, b) => (a.calibration_date < b.calibration_date ? 1 : -1));
}

export function getCalibrationById(id: string): CalibrationRecord | undefined {
  return getState().calibrations.find((c) => c.id === id);
}

export function getCalibrationPoints(calId: string): CalibrationPoint[] {
  return getState().calibrationPoints[calId] ?? [];
}

export function nextCalibrationVersion(assetId: string): number {
  const versions = getState().calibrations.filter((c) => c.asset_id === assetId).map((c) => c.calibration_version);
  return versions.length ? Math.max(...versions) + 1 : 1;
}

export function addCalibration(record: CalibrationRecord, points: CalibrationPoint[]): CalibrationRecord {
  const state = getState();
  state.calibrations.push(record);
  state.calibrationPoints[record.id] = points;
  const asset = state.assets.find((a) => a.id === record.asset_id);
  if (asset) recomputeAssetDerived(asset);
  persist();
  return record;
}

export function voidCalibration(id: string, reason?: string): CalibrationRecord | undefined {
  const cal = getState().calibrations.find((c) => c.id === id);
  if (!cal) return undefined;
  cal.is_active = false;
  cal.voided_at = nowIso();
  cal.void_reason = reason ?? null;
  const asset = getState().assets.find((a) => a.id === cal.asset_id);
  if (asset) recomputeAssetDerived(asset);
  persist();
  return cal;
}

export function restoreCalibration(id: string): CalibrationRecord | undefined {
  const cal = getState().calibrations.find((c) => c.id === id);
  if (!cal) return undefined;
  cal.is_active = true;
  cal.voided_at = null;
  cal.voided_by = null;
  cal.void_reason = null;
  const asset = getState().assets.find((a) => a.id === cal.asset_id);
  if (asset) recomputeAssetDerived(asset);
  persist();
  return cal;
}

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

export interface ListLocationsFilter {
  isCalibrationLab?: boolean;
  isActive?: boolean;
  limit?: number;
}

function withAssetCount(loc: LocationItem): LocationItem {
  const count = getState().assets.filter((a) => a.location_id === loc.id).length;
  return { ...loc, asset_count: count };
}

export function listLocations(filter: ListLocationsFilter = {}): LocationItem[] {
  let locs = getState().locations;
  if (filter.isCalibrationLab !== undefined) locs = locs.filter((l) => l.is_calibration_lab === filter.isCalibrationLab);
  if (filter.isActive !== undefined) locs = locs.filter((l) => l.is_active === filter.isActive);
  if (filter.limit !== undefined) locs = locs.slice(0, filter.limit);
  return locs.map(withAssetCount);
}

export function getLocation(id: string): LocationItem | undefined {
  const loc = getState().locations.find((l) => l.id === id);
  return loc ? withAssetCount(loc) : undefined;
}

export function createLocation(input: Omit<LocationItem, "id" | "asset_count">): LocationItem {
  const loc: LocationItem = { ...input, id: genId(), asset_count: 0 };
  getState().locations.push(loc);
  persist();
  return loc;
}

export function updateLocation(id: string, patch: Partial<LocationItem>): LocationItem | undefined {
  const loc = getState().locations.find((l) => l.id === id);
  if (!loc) return undefined;
  Object.assign(loc, patch);
  persist();
  return withAssetCount(loc);
}

export function deleteLocation(id: string): void {
  const state = getState();
  state.locations = state.locations.filter((l) => l.id !== id);
  persist();
}

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

export function listProcedures(q?: string): Procedure[] {
  let procs = getState().procedures;
  if (q) {
    const needle = q.toLowerCase();
    procs = procs.filter((p) => p.name.toLowerCase().includes(needle) || (p.proc_id ?? "").toLowerCase().includes(needle));
  }
  return procs;
}

export function listProceduresByQuantity(physicalQuantity?: string): Procedure[] {
  const procs = getState().procedures;
  return physicalQuantity ? procs.filter((p) => p.physical_quantity === physicalQuantity) : procs;
}

export function getProcedure(id: string): Procedure | undefined {
  return getState().procedures.find((p) => p.id === id);
}

export function createProcedure(procedure: Procedure): Procedure {
  getState().procedures.push(procedure);
  persist();
  return procedure;
}

export function updateProcedure(id: string, patch: Partial<Procedure>): Procedure | undefined {
  const proc = getState().procedures.find((p) => p.id === id);
  if (!proc) return undefined;
  Object.assign(proc, patch, { updated_at: nowIso() });
  persist();
  return proc;
}

export function deleteProcedure(id: string): void {
  const state = getState();
  state.procedures = state.procedures.filter((p) => p.id !== id);
  persist();
}

// ---------------------------------------------------------------------------
// Stored files
// ---------------------------------------------------------------------------

export function listFilesForEntity(entityType: string, entityId: string): StoredFile[] {
  return getState().storedFiles.filter((f) => f.entity_type === entityType && f.entity_id === entityId);
}

export function addStoredFile(file: StoredFile): StoredFile {
  getState().storedFiles.push(file);
  persist();
  return file;
}

export function deleteStoredFile(id: string): void {
  const state = getState();
  state.storedFiles = state.storedFiles.filter((f) => f.id !== id);
  persist();
}

// ---------------------------------------------------------------------------
// Users / admin
// ---------------------------------------------------------------------------

export function getDemoUser(): UserProfile {
  const state = getState();
  return state.users.find((u) => u.id === state.demoUserId) as UserProfile;
}

export interface ListUsersFilter {
  skip?: number;
  limit?: number;
  q?: string;
}

export function listUsers(filter: ListUsersFilter = {}): UserProfile[] {
  let users = getState().users;
  if (filter.q) {
    const needle = filter.q.toLowerCase();
    users = users.filter((u) => u.name.toLowerCase().includes(needle) || u.email.toLowerCase().includes(needle));
  }
  const skip = filter.skip ?? 0;
  const limit = filter.limit ?? users.length;
  return users.slice(skip, skip + limit);
}

export function countUsers(q?: string): number {
  return listUsers({ q }).length;
}

export function getUserById(id: string): UserProfile | undefined {
  return getState().users.find((u) => u.id === id);
}

export function updateUser(id: string, patch: Partial<UserProfile>): UserProfile | undefined {
  const user = getState().users.find((u) => u.id === id);
  if (!user) return undefined;
  Object.assign(user, patch, { updated_at: nowIso() });
  persist();
  return user;
}

export function getUserSignature(userId: string): UserSignature | null {
  return getState().signatures?.[userId] ?? null;
}

export function setUserSignature(userId: string, signature: UserSignature | null): void {
  const state = getState();
  if (!state.signatures) state.signatures = {};
  if (signature) {
    state.signatures[userId] = signature;
  } else {
    delete state.signatures[userId];
  }
  persist();
}

// ---------------------------------------------------------------------------
// Organizations / teams
// ---------------------------------------------------------------------------

export function getOrganization(): Organization {
  return getState().organization;
}

export function listOrganizations(): Organization[] {
  return [getState().organization];
}

export function updateOrganization(patch: Partial<Organization>): Organization {
  const org = getState().organization;
  Object.assign(org, patch, { updated_at: nowIso() });
  persist();
  return org;
}

export function createOrganization(input: { name: string; description?: string }): Organization {
  // Organizations aren't calibration-traceability data — a second org can genuinely
  // exist for the rest of the session, it just won't have any assets/locations in it.
  const org: Organization = {
    id: genId(),
    name: input.name,
    description: input.description ?? null,
    is_active: true,
    created_at: nowIso(),
    updated_at: nowIso(),
  };
  persist();
  return org;
}

export function listTeams(orgId?: string): StoredTeam[] {
  const teams = getState().teams;
  return orgId ? teams.filter((t) => t.organization_id === orgId) : teams;
}

export function createTeam(input: { name: string; description?: string; organization_id: string }): StoredTeam {
  const team: StoredTeam = {
    id: genId(),
    organization_id: input.organization_id,
    name: input.name,
    description: input.description ?? null,
    created_at: nowIso(),
  };
  getState().teams.push(team);
  persist();
  return team;
}

export function updateTeam(id: string, patch: { name?: string; description?: string }): StoredTeam | undefined {
  const team = getState().teams.find((t) => t.id === id);
  if (!team) return undefined;
  Object.assign(team, patch);
  persist();
  return team;
}

export function deleteTeam(id: string): void {
  const state = getState();
  state.teams = state.teams.filter((t) => t.id !== id);
  persist();
}

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

export interface ListAuditLogsFilter {
  skip?: number;
  limit?: number;
  entityType?: string;
  actorId?: string;
}

export function listAuditLogs(filter: ListAuditLogsFilter = {}): AuditLogEntry[] {
  let logs = getState().auditLogs;
  if (filter.entityType) logs = logs.filter((l) => l.entity_type === filter.entityType);
  if (filter.actorId) logs = logs.filter((l) => l.actor_id === filter.actorId);
  const skip = filter.skip ?? 0;
  const limit = filter.limit ?? 50;
  return logs.slice(skip, skip + limit);
}

export function listAuditLogsForAsset(assetId: string): AuditLogEntry[] {
  return getState().auditLogs.filter((l) => l.entity_asset_id === assetId);
}

export function appendAuditLog(entry: {
  action: string;
  entityType: string;
  entityId: string | null;
  entityAssetId: string | null;
  beforeState?: unknown;
  afterState?: unknown;
}): AuditLogEntry {
  const actor = getDemoUser();
  const log: AuditLogEntry = {
    id: genId(),
    actor_id: actor.id,
    actor_email: actor.email,
    actor_name: actor.name,
    actor_role: actor.role,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId,
    entity_asset_id: entry.entityAssetId,
    before_state: entry.beforeState ?? null,
    after_state: entry.afterState ?? null,
    ip_address: null,
    created_at: nowIso(),
  };
  getState().auditLogs.unshift(log);
  persist();
  return log;
}

// ---------------------------------------------------------------------------
// Health snapshots (precomputed at fixture-generation time — see AGENTS/task
// notes: the demo intentionally does not recompute Health after new session
// calibrations, only the fixture's baked-in history is reflected here)
// ---------------------------------------------------------------------------

export function getHealthSnapshot(assetId: string): AssetHealthResponse | undefined {
  return getState().healthSnapshots[assetId];
}

// ---------------------------------------------------------------------------
// Email settings
// ---------------------------------------------------------------------------

export function getEmailSettings(): EmailSettings {
  return getState().emailSettings;
}

export function updateEmailSettings(patch: Partial<EmailSettings>): EmailSettings {
  const settings = getState().emailSettings;
  Object.assign(settings, patch, { updated_at: nowIso() });
  persist();
  return settings;
}
