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
import type { CalibrationPoint, CalibrationRecord, FrequencyResponsePoint } from "@/types/calibration";
import type { AssetHealthResponse } from "@/types/health";
import type { LocationItem } from "@/types/location";
import type { Procedure } from "@/types/procedure";
import type { StoredFile } from "@/types/stored_file";
import type { UserProfile, UserSignature } from "@/types/user";
import type { EmailSettings } from "@/services/admin.service";
import type {
  EligibleUser,
  Organization,
  OrganizationJoinRequest,
  OrganizationListItem,
  OrganizationMember,
  OrgRole,
} from "@/types/organization";
import type { Notification, NotificationPreference } from "@/types/notification";
import { NOTIFICATION_CATEGORIES } from "@/constants/notifications";

// ---------------------------------------------------------------------------
// Fixture shape (widened by resolveJsonModule) -> strongly-typed store shape
// ---------------------------------------------------------------------------

/** Raw organization row as stored — the viewer-relative fields on the
 * `Organization` API type (is_member/my_role/can_manage/asset_count/
 * member_count/location_name/logo_url) are computed per-request, mirroring
 * apps/api/app/api/v1/organizations.py's _build_org_response. */
interface StoredOrganization {
  id: string;
  name: string;
  full_name: string | null;
  description: string | null;
  website: string | null;
  location_id: string | null;
  email: string | null;
  phone: string | null;
  private: boolean;
  logo_file_id: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  org_category: "internal" | "external";
  org_type: "provider" | "customer" | null;
  contact_email: string | null;
  contact_phone: string | null;
  vat_number: string | null;
  address_street: string | null;
  address_city: string | null;
  address_state: string | null;
  address_postal_code: string | null;
  address_country: string | null;
}

interface StoredOrgMember {
  id: string;
  organization_id: string;
  user_id: string;
  role: OrgRole;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface StoredJoinRequest {
  id: string;
  organization_id: string;
  user_id: string;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  updated_at: string;
  decided_by: string | null;
  decided_at: string | null;
}

interface StoredNotification {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  updated_at: string;
}

interface StoredNotificationPreference {
  user_id: string;
  category: string;
  email_enabled: boolean;
  in_app_enabled: boolean;
}

interface DemoState {
  generatedAt: string;
  demoUserId: string;
  organizations: StoredOrganization[];
  organizationMembers: StoredOrgMember[];
  joinRequests: StoredJoinRequest[];
  users: UserProfile[];
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
  // accessor below must tolerate `signatures`/`notifications`/`notificationPreferences`
  // being undefined at runtime.
  signatures?: Record<string, UserSignature>;
  notifications?: StoredNotification[];
  notificationPreferences?: StoredNotificationPreference[];
  calibrationFrequencyResponsePoints?: Record<string, FrequencyResponsePoint[]>;
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

function organizationNameById(id: string | null): string | null {
  if (!id) return null;
  return getState().organizations.find((o) => o.id === id)?.name ?? null;
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
  asset.subtype = asset.asset_type === "sensor" ? (asset.sensor_channels[0]?.physical_quantity ?? null) : (asset.daq_details?.daq_type ?? null);
  asset.technology = asset.asset_type === "sensor" ? (asset.sensor_channels[0]?.technology ?? null) : null;
  asset.organization_name = organizationNameById(asset.organization_id);

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
  organizationId?: string;
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
  if (filter.organizationId) assets = assets.filter((a) => a.organization_id === filter.organizationId);
  assets = [...assets].sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  if (filter.limit !== undefined) assets = assets.slice(0, filter.limit);
  return assets.map(toListItem);
}

// Resolves an asset from whichever identifier the URL carries — the human-readable
// asset_id (what the app now navigates and links with) or, for old links, the internal
// id. Mirrors the real backend's asset_repo.get_by_ref.
function findAssetByRef(ref: string): AssetProfile | undefined {
  return getState().assets.find((a) => a.id === ref || a.asset_id === ref);
}

export function getAssetProfile(ref: string): AssetProfile | undefined {
  const asset = findAssetByRef(ref);
  return asset ? recomputeAssetDerived(asset) : undefined;
}

export function updateAsset(ref: string, patch: Partial<AssetProfile>): AssetProfile | undefined {
  const asset = findAssetByRef(ref);
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

export function retireAsset(ref: string, reason?: string): AssetProfile | undefined {
  const asset = findAssetByRef(ref);
  if (!asset) return undefined;
  asset.is_active = false;
  asset.retired_at = nowIso();
  asset.retired_reason = reason ?? null;
  asset.updated_at = nowIso();
  recomputeAssetDerived(asset);
  persist();
  return asset;
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

export function getCalibrationPoints(calId: string, pointRole: "primary" | "as_found" = "primary"): CalibrationPoint[] {
  return (getState().calibrationPoints[calId] ?? []).filter((p) => (p.point_role ?? "primary") === pointRole);
}

export function getCalibrationFrequencyResponsePoints(calId: string): FrequencyResponsePoint[] {
  return getState().calibrationFrequencyResponsePoints?.[calId] ?? [];
}

export function nextCalibrationVersion(assetId: string): number {
  const versions = getState().calibrations.filter((c) => c.asset_id === assetId).map((c) => c.calibration_version);
  return versions.length ? Math.max(...versions) + 1 : 1;
}

export function addCalibration(
  record: CalibrationRecord,
  points: CalibrationPoint[],
  frequencyResponsePoints: FrequencyResponsePoint[] = [],
): CalibrationRecord {
  const state = getState();
  state.calibrations.push(record);
  state.calibrationPoints[record.id] = points;
  if (frequencyResponsePoints.length) {
    state.calibrationFrequencyResponsePoints ??= {};
    state.calibrationFrequencyResponsePoints[record.id] = frequencyResponsePoints;
  }
  const asset = state.assets.find((a) => a.id === record.asset_id);
  if (asset) recomputeAssetDerived(asset);
  persist();
  return record;
}

export function voidCalibration(id: string, reason?: string): CalibrationRecord | undefined {
  const cal = getState().calibrations.find((c) => c.id === id);
  if (!cal) return undefined;
  cal.status = "void";
  cal.is_active = false;
  cal.voided_at = nowIso();
  cal.void_reason = reason ?? null;
  const asset = getState().assets.find((a) => a.id === cal.asset_id);
  if (asset) recomputeAssetDerived(asset);
  persist();
  return cal;
}

export function approveCalibration(id: string, decidedBy: string): CalibrationRecord | undefined {
  const cal = getState().calibrations.find((c) => c.id === id);
  if (!cal) return undefined;
  cal.status = "valid";
  cal.is_active = true;
  cal.decided_by = decidedBy;
  cal.decided_at = nowIso();
  const asset = getState().assets.find((a) => a.id === cal.asset_id);
  if (asset) recomputeAssetDerived(asset);
  persist();
  return cal;
}

export function rejectCalibration(id: string, decidedBy: string, reason?: string): CalibrationRecord | undefined {
  const cal = getState().calibrations.find((c) => c.id === id);
  if (!cal) return undefined;
  cal.status = "rejected";
  cal.is_active = false;
  cal.decided_by = decidedBy;
  cal.decided_at = nowIso();
  cal.decision_reason = reason ?? null;
  const asset = getState().assets.find((a) => a.id === cal.asset_id);
  if (asset) recomputeAssetDerived(asset);
  persist();
  return cal;
}

export function restoreCalibration(id: string): CalibrationRecord | undefined {
  const cal = getState().calibrations.find((c) => c.id === id);
  if (!cal) return undefined;
  cal.status = "valid";
  cal.is_active = true;
  cal.voided_at = null;
  cal.voided_by = null;
  cal.void_reason = null;
  const asset = getState().assets.find((a) => a.id === cal.asset_id);
  if (asset) recomputeAssetDerived(asset);
  persist();
  return cal;
}

export function setUploadedCertificate(calId: string, fileId: string): CalibrationRecord | undefined {
  const cal = getState().calibrations.find((c) => c.id === calId);
  if (!cal) return undefined;
  cal.uploaded_certificate_file_id = fileId;
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

export function getStoredFile(id: string): StoredFile | undefined {
  return getState().storedFiles.find((f) => f.id === id);
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
// Organizations
// ---------------------------------------------------------------------------
//
// Demo mode has exactly one real "current user" (getDemoUser()), so every
// viewer-relative field below (is_member/my_role/can_manage, and the private-
// org redaction) is computed relative to that one identity — there's no need
// to thread a viewer id through, unlike the real multi-user backend.

function membershipFor(orgId: string, userId: string): StoredOrgMember | undefined {
  return getState().organizationMembers.find((m) => m.organization_id === orgId && m.user_id === userId);
}

function isOrgAdmin(org: StoredOrganization, userId: string): boolean {
  const user = getState().users.find((u) => u.id === userId);
  if (user?.role === "viewer") return false;
  if (user?.role === "superadmin") return true;
  const m = membershipFor(org.id, userId);
  return !!(m && m.active && m.role === "admin");
}

function isOrgMember(org: StoredOrganization, userId: string): boolean {
  const user = getState().users.find((u) => u.id === userId);
  if (user?.role === "superadmin") return true;
  const m = membershipFor(org.id, userId);
  return !!(m && m.active);
}

export function countActiveAdmins(orgId: string): number {
  return getState().organizationMembers.filter((m) => m.organization_id === orgId && m.active && m.role === "admin").length;
}

function isLastAdmin(org: StoredOrganization, userId: string): boolean {
  const m = membershipFor(org.id, userId);
  if (!m || !m.active || m.role !== "admin") return false;
  return countActiveAdmins(org.id) <= 1;
}

function countAssetsForOrg(orgId: string): number {
  return getState().assets.filter((a) => a.organization_id === orgId && a.is_active).length;
}

function countMembersForOrg(orgId: string): number {
  return getState().organizationMembers.filter((m) => m.organization_id === orgId && m.active).length;
}

function buildOrgListItem(org: StoredOrganization, userId: string): OrganizationListItem {
  const member = isOrgMember(org, userId);
  const membership = membershipFor(org.id, userId);
  return {
    id: org.id, name: org.name, private: org.private, logo_url: org.private ? null : orgLogoUrl(org),
    is_active: org.is_active,
    org_category: org.org_category,
    org_type: org.org_type,
    is_member: member,
    my_role: membership && membership.active ? membership.role : null,
    is_last_admin: isLastAdmin(org, userId),
    has_pending_join_request: !member && hasPendingJoinRequest(org.id, userId),
    member_count: member ? countMembersForOrg(org.id) : null,
  };
}

function isDemoGlobalAdmin(userId: string): boolean {
  const user = getState().users.find((u) => u.id === userId);
  return user?.role === "admin" || user?.role === "superadmin";
}

// Demo mode has no presigned-URL storage backend — the "logo_url" is just
// whatever blob URL the upload handler stashed alongside logo_file_id.
const orgLogoUrls = new Map<string, string>();
function orgLogoUrl(org: StoredOrganization): string | null {
  return org.logo_file_id ? (orgLogoUrls.get(org.id) ?? null) : null;
}

function buildOrgResponse(org: StoredOrganization, userId: string): Organization {
  const member = isOrgMember(org, userId);
  const canManage = isOrgAdmin(org, userId);
  const membership = membershipFor(org.id, userId);
  const myRole = membership && membership.active ? membership.role : null;

  const base: Organization = {
    id: org.id, name: org.name, private: org.private, is_active: org.is_active,
    created_at: org.created_at, updated_at: org.updated_at,
    org_category: org.org_category,
    full_name: null, description: null, website: null, location_id: null, location_name: null,
    email: null, phone: null, logo_file_id: null, logo_url: null,
    asset_count: null, member_count: null,
    org_type: null, contact_email: null, contact_phone: null, vat_number: null,
    address_street: null, address_city: null, address_state: null, address_postal_code: null, address_country: null,
    is_member: member, my_role: myRole, can_manage: canManage,
    is_last_admin: isLastAdmin(org, userId),
    has_pending_join_request: !member && hasPendingJoinRequest(org.id, userId),
  };
  // Private redaction only applies to internal (joinable) orgs — an external
  // org's is_member is always false, so this must not fire for those.
  if (org.private && org.org_category === "internal" && !member) return base;

  return {
    ...base,
    full_name: org.full_name,
    description: org.description,
    website: org.website,
    location_id: org.location_id,
    location_name: org.location_id ? (locationById(org.location_id)?.name ?? null) : null,
    email: org.email,
    phone: org.phone,
    logo_file_id: org.logo_file_id,
    logo_url: orgLogoUrl(org),
    asset_count: countAssetsForOrg(org.id),
    member_count: countMembersForOrg(org.id),
    org_type: org.org_type,
    contact_email: org.contact_email,
    contact_phone: org.contact_phone,
    vat_number: org.vat_number,
    address_street: org.address_street,
    address_city: org.address_city,
    address_state: org.address_state,
    address_postal_code: org.address_postal_code,
    address_country: org.address_country,
  };
}

export interface ListOrganizationsFilter {
  org_category?: "internal" | "external";
  org_type?: "provider" | "customer";
}

export function listOrganizations(
  userId: string = getDemoUser().id, filter: ListOrganizationsFilter = {}
): OrganizationListItem[] {
  const user = getState().users.find((u) => u.id === userId);
  let orgs = user?.role === "superadmin" ? getState().organizations : getState().organizations.filter((o) => o.is_active);
  // External organizations are only ever visible to a global Admin/Super
  // Admin — a non-admin's category filter is silently forced to internal,
  // same as the real backend, rather than erroring.
  const orgCategory = isDemoGlobalAdmin(userId) ? filter.org_category : "internal";
  const orgType = isDemoGlobalAdmin(userId) ? filter.org_type : undefined;
  if (orgCategory) orgs = orgs.filter((o) => o.org_category === orgCategory);
  if (orgType) orgs = orgs.filter((o) => o.org_type === orgType);
  return orgs.map((o) => buildOrgListItem(o, userId));
}

/** Minimal {id, name} picker for the calibration wizard's Calibration Lab
 * field (External Accredited Lab / Customer's Asset types) — deliberately
 * open to any non-Viewer, unlike listOrganizations' admin-only external-org
 * gating, since the full org profile stays admin-only but this picker must
 * still work for Technicians recording a calibration. */
export function listCalibrationLabCandidates(orgType: "provider" | "customer"): { id: string; name: string }[] {
  return getState()
    .organizations.filter((o) => o.is_active && o.org_category === "external" && o.org_type === orgType)
    .map((o) => ({ id: o.id, name: o.name }));
}

export function listUserOrganizations(userId: string): OrganizationListItem[] {
  const myOrgIds = new Set(
    getState().organizationMembers.filter((m) => m.user_id === userId && m.active).map((m) => m.organization_id)
  );
  return getState().organizations.filter((o) => o.is_active && myOrgIds.has(o.id)).map((o) => buildOrgListItem(o, userId));
}

export function getOrganizationRaw(id: string): StoredOrganization | undefined {
  return getState().organizations.find((o) => o.id === id);
}

export function getOrganization(id: string, userId: string): Organization | undefined {
  const org = getOrganizationRaw(id);
  if (!org) return undefined;
  const user = getState().users.find((u) => u.id === userId);
  if (!org.is_active && user?.role !== "superadmin") return undefined;
  if (org.org_category === "external" && !isDemoGlobalAdmin(userId)) return undefined;
  return buildOrgResponse(org, userId);
}

export interface OrganizationCreateInput {
  name: string;
  full_name?: string | null;
  description?: string | null;
  website?: string | null;
  location_id?: string | null;
  email?: string | null;
  phone?: string | null;
  private?: boolean;
  org_category?: "internal" | "external";
  org_type?: "provider" | "customer" | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  vat_number?: string | null;
  address_street?: string | null;
  address_city?: string | null;
  address_state?: string | null;
  address_postal_code?: string | null;
  address_country?: string | null;
}

export function createOrganization(input: OrganizationCreateInput, creatorId: string): Organization {
  const now = nowIso();
  const orgCategory = input.org_category ?? "internal";
  const org: StoredOrganization = {
    id: genId(),
    name: input.name,
    full_name: input.full_name ?? null,
    description: input.description ?? null,
    website: input.website ?? null,
    location_id: input.location_id ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    private: input.private ?? false,
    logo_file_id: null,
    is_active: true,
    created_at: now,
    updated_at: now,
    org_category: orgCategory,
    org_type: orgCategory === "external" ? (input.org_type ?? null) : null,
    contact_email: input.contact_email ?? null,
    contact_phone: input.contact_phone ?? null,
    vat_number: input.vat_number ?? null,
    address_street: input.address_street ?? null,
    address_city: input.address_city ?? null,
    address_state: input.address_state ?? null,
    address_postal_code: input.address_postal_code ?? null,
    address_country: input.address_country ?? null,
  };
  getState().organizations.push(org);
  if (orgCategory === "internal") {
    getState().organizationMembers.push({
      id: genId(), organization_id: org.id, user_id: creatorId, role: "admin", active: true, created_at: now, updated_at: now,
    });
  }
  persist();
  return buildOrgResponse(org, creatorId);
}

export function updateOrganization(
  id: string, patch: Partial<Omit<StoredOrganization, "id" | "created_at">>, userId: string
): Organization | undefined {
  const org = getOrganizationRaw(id);
  if (!org) return undefined;
  Object.assign(org, patch, { updated_at: nowIso() });
  persist();
  return buildOrgResponse(org, userId);
}

export function setOrgLogo(id: string, logoUrl: string | null, userId: string): Organization | undefined {
  if (logoUrl) orgLogoUrls.set(id, logoUrl);
  else orgLogoUrls.delete(id);
  return updateOrganization(id, { logo_file_id: logoUrl ? genId() : null }, userId);
}

export function deactivateOrganization(id: string): void {
  const org = getOrganizationRaw(id);
  if (!org) return;
  org.is_active = false;
  getState().organizationMembers
    .filter((m) => m.organization_id === id && m.active)
    .forEach((m) => { m.active = false; });
  persist();
}

export function restoreOrganization(id: string, userId: string): Organization | undefined {
  const org = getOrganizationRaw(id);
  if (!org) return undefined;
  org.is_active = true;
  persist();
  return buildOrgResponse(org, userId);
}

// --- Members ---------------------------------------------------------------

export function listCalibrationUsers(assetId: string): { id: string; name: string; email: string; profile_picture_url: string | null }[] {
  const orgId = getAssetProfile(assetId)?.organization_id ?? null;
  const memberIds = orgId
    ? new Set(getState().organizationMembers.filter((m) => m.organization_id === orgId && m.active).map((m) => m.user_id))
    : new Set(getState().users.map((u) => u.id));
  return getState().users
    .filter((u) => memberIds.has(u.id) && u.is_active && u.role !== "viewer")
    .map((u) => ({ id: u.id, name: u.name, email: u.email, profile_picture_url: u.profile_picture_url ?? null }));
}

export function listOrgMembers(orgId: string): OrganizationMember[] {
  const usersById = new Map(getState().users.map((u) => [u.id, u]));
  return getState().organizationMembers
    .filter((m) => m.organization_id === orgId && m.active)
    .map((m) => {
      const u = usersById.get(m.user_id);
      return { user_id: m.user_id, name: u?.name ?? "Unknown", email: u?.email ?? "", profile_picture_url: u?.profile_picture_url ?? null, role: m.role, active: m.active, created_at: m.created_at };
    });
}

export function updateMemberRole(orgId: string, userId: string, role: OrgRole): OrganizationMember | undefined {
  const m = membershipFor(orgId, userId);
  if (!m) return undefined;
  m.role = role;
  m.updated_at = nowIso();
  persist();
  const u = getState().users.find((x) => x.id === userId);
  return { user_id: userId, name: u?.name ?? "", email: u?.email ?? "", profile_picture_url: u?.profile_picture_url ?? null, role: m.role, active: m.active, created_at: m.created_at };
}

export function removeMember(orgId: string, userId: string): void {
  const m = membershipFor(orgId, userId);
  if (!m) return;
  m.active = false;
  m.updated_at = nowIso();
  persist();
}

export function listNonMembers(orgId: string, q?: string): EligibleUser[] {
  const activeMemberIds = new Set(
    getState().organizationMembers.filter((m) => m.organization_id === orgId && m.active).map((m) => m.user_id)
  );
  const pattern = q?.trim().toLowerCase();
  return getState().users
    .filter((u) => u.is_active && !activeMemberIds.has(u.id))
    .filter((u) => !pattern || u.name.toLowerCase().includes(pattern) || u.email.toLowerCase().includes(pattern))
    .map((u) => ({ id: u.id, name: u.name, email: u.email, profile_picture_url: u.profile_picture_url ?? null }));
}

export function addMembers(orgId: string, userIds: string[]): OrganizationMember[] {
  const now = nowIso();
  for (const userId of userIds) {
    if (!getState().users.some((u) => u.id === userId)) continue;
    const existing = membershipFor(orgId, userId);
    if (existing) {
      existing.active = true;
      existing.role = "member";
      existing.updated_at = now;
    } else {
      getState().organizationMembers.push({
        id: genId(), organization_id: orgId, user_id: userId, role: "member", active: true, created_at: now, updated_at: now,
      });
    }
  }
  persist();
  return listOrgMembers(orgId);
}

// --- Join requests -----------------------------------------------------------

export function hasPendingJoinRequest(orgId: string, userId: string): boolean {
  return getState().joinRequests.some((r) => r.organization_id === orgId && r.user_id === userId && r.status === "pending");
}

export function createJoinRequest(orgId: string, userId: string): OrganizationJoinRequest {
  const now = nowIso();
  const req: StoredJoinRequest = {
    id: genId(), organization_id: orgId, user_id: userId, status: "pending",
    created_at: now, updated_at: now, decided_by: null, decided_at: null,
  };
  getState().joinRequests.push(req);
  persist();
  const u = getState().users.find((x) => x.id === userId);
  return { id: req.id, organization_id: orgId, user_id: userId, user_name: u?.name ?? "", user_email: u?.email ?? "", user_profile_picture_url: u?.profile_picture_url ?? null, status: req.status, created_at: req.created_at };
}

export function listPendingJoinRequests(orgId: string): OrganizationJoinRequest[] {
  const usersById = new Map(getState().users.map((u) => [u.id, u]));
  return getState().joinRequests
    .filter((r) => r.organization_id === orgId && r.status === "pending")
    .map((r) => {
      const u = usersById.get(r.user_id);
      return { id: r.id, organization_id: r.organization_id, user_id: r.user_id, user_name: u?.name ?? "", user_email: u?.email ?? "", user_profile_picture_url: u?.profile_picture_url ?? null, status: r.status, created_at: r.created_at };
    });
}

export function decideJoinRequest(orgId: string, requestId: string, approve: boolean, decidedBy: string): void {
  const req = getState().joinRequests.find((r) => r.id === requestId && r.organization_id === orgId);
  if (!req) return;
  const now = nowIso();
  req.status = approve ? "approved" : "rejected";
  req.decided_by = decidedBy;
  req.decided_at = now;
  req.updated_at = now;
  if (approve) {
    const existing = membershipFor(orgId, req.user_id);
    if (existing) {
      existing.active = true;
      existing.role = "member";
      existing.updated_at = now;
    } else {
      getState().organizationMembers.push({
        id: genId(), organization_id: orgId, user_id: req.user_id, role: "member", active: true, created_at: now, updated_at: now,
      });
    }
  }
  persist();
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export function createNotification(input: { userId: string; type: string; title: string; body?: string | null; link?: string | null }): void {
  const state = getState();
  if (!state.notifications) state.notifications = [];
  const now = nowIso();
  state.notifications.push({
    id: genId(), user_id: input.userId, type: input.type, title: input.title,
    body: input.body ?? null, link: input.link ?? null, is_read: false, created_at: now, updated_at: now,
  });
  persist();
}

export function listNotificationsForUser(userId: string): Notification[] {
  return (getState().notifications ?? [])
    .filter((n) => n.user_id === userId)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
    .map((n) => ({ id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, is_read: n.is_read, created_at: n.created_at }));
}

export function countUnreadNotifications(userId: string): number {
  return (getState().notifications ?? []).filter((n) => n.user_id === userId && !n.is_read).length;
}

export function markNotificationRead(id: string, userId: string): Notification | undefined {
  const n = (getState().notifications ?? []).find((x) => x.id === id && x.user_id === userId);
  if (!n) return undefined;
  n.is_read = true;
  n.updated_at = nowIso();
  persist();
  return { id: n.id, type: n.type, title: n.title, body: n.body, link: n.link, is_read: n.is_read, created_at: n.created_at };
}

export function markAllNotificationsRead(userId: string): void {
  (getState().notifications ?? []).forEach((n) => { if (n.user_id === userId) n.is_read = true; });
  persist();
}

export function deleteNotification(id: string, userId: string): boolean {
  const state = getState();
  const list = state.notifications ?? [];
  const idx = list.findIndex((n) => n.id === id && n.user_id === userId);
  if (idx === -1) return false;
  list.splice(idx, 1);
  persist();
  return true;
}

export function deleteAllNotificationsForUser(userId: string): void {
  const state = getState();
  state.notifications = (state.notifications ?? []).filter((n) => n.user_id !== userId);
  persist();
}

export function getNotificationPreferences(userId: string): NotificationPreference[] {
  const saved = new Map(
    (getState().notificationPreferences ?? [])
      .filter((p) => p.user_id === userId)
      .map((p) => [p.category, p] as const)
  );
  return NOTIFICATION_CATEGORIES.map((category) => {
    const pref = saved.get(category);
    return pref
      ? { category, email_enabled: pref.email_enabled, in_app_enabled: pref.in_app_enabled }
      : { category, email_enabled: true, in_app_enabled: true };
  });
}

export function updateNotificationPreferences(userId: string, preferences: NotificationPreference[]): NotificationPreference[] {
  const state = getState();
  if (!state.notificationPreferences) state.notificationPreferences = [];
  for (const item of preferences) {
    const existing = state.notificationPreferences.find((p) => p.user_id === userId && p.category === item.category);
    if (existing) {
      existing.email_enabled = item.email_enabled;
      existing.in_app_enabled = item.in_app_enabled;
    } else {
      state.notificationPreferences.push({ user_id: userId, category: item.category, email_enabled: item.email_enabled, in_app_enabled: item.in_app_enabled });
    }
  }
  persist();
  return getNotificationPreferences(userId);
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
    actor_profile_picture_url: actor.profile_picture_url ?? null,
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
