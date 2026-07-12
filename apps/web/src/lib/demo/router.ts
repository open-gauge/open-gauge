/**
 * Mock REST router for demo mode.
 *
 * Translates the exact request shapes `apps/web/src/lib/api.ts` makes
 * (method + path + query string + JSON body / FormData) into calls against
 * `./store` and `./curve-fit`, mirroring the FastAPI route table that
 * `apps/web/src/services/*.ts` normally calls. This is the seam that lets
 * every service function "just work" in a backend-free static build.
 *
 * Adding a new backend endpoint later means adding one route here — every
 * existing endpoint and all UI keeps working with no other change.
 */
import * as store from "./store";
import { polyfit, polyval, generateXRange, runAnalysis, type AnalyzeCalibrationParams } from "./curve-fit";
import type { AssetCreateBody, AssetProfile, AssetUpdateRequest, SensorChannelFull } from "@/types/asset";
import type { AnalyzeRequest, CalibrationCreateBody, CalibrationRecord } from "@/types/calibration";
import type { CurveComparisonResponse } from "@/types/health";
import type { Procedure } from "@/types/procedure";
import type { StoredFile } from "@/types/stored_file";
import type {
  AdminStats,
  AdminSystem,
  AdminTeam,
  EmailSettings,
  EmailSettingsUpdate,
  Organization,
} from "@/services/admin.service";
import type {
  AssetImportPreview,
  AssetImportResponse,
  ProcedureDetail,
} from "@/services/asset.service";
import type { RegisterResult } from "@/services/auth.service";
import type { LocationCreateBody } from "@/services/location.service";
import type { LocationItem } from "@/types/location";
import type { Team } from "@/services/user.service";

export const DEMO_TOKEN = "demo-token";

class NotFoundError extends Error {}

// ---------------------------------------------------------------------------
// Request plumbing
// ---------------------------------------------------------------------------

interface ParsedRequest {
  method: string;
  pathname: string;
  qs: URLSearchParams;
  body: unknown;
}

function parse(path: string, options: RequestInit): ParsedRequest {
  const [pathname, query = ""] = path.split("?");
  const method = (options.method ?? "GET").toUpperCase();
  let body: unknown = undefined;
  if (typeof options.body === "string") {
    try {
      body = JSON.parse(options.body);
    } catch {
      body = undefined;
    }
  }
  return { method, pathname, qs: new URLSearchParams(query), body };
}

type Handler = (ctx: { params: string[]; qs: URLSearchParams; body: unknown }) => unknown;

interface Route {
  method: string;
  regex: RegExp;
  handler: Handler;
}

const routes: Route[] = [];

function route(method: string, pattern: string, handler: Handler): void {
  // Pattern like "/api/v1/assets/:id/profile" -> capturing regex.
  const regex = new RegExp(
    "^" + pattern.replace(/:[^/]+/g, "([^/]+)").replace(/\//g, "\\/") + "$",
  );
  routes.push({ method, regex, handler });
}

function dispatch(req: ParsedRequest): unknown {
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const match = r.regex.exec(req.pathname);
    if (!match) continue;
    return r.handler({ params: match.slice(1), qs: req.qs, body: req.body });
  }
  throw new NotFoundError(`No demo route for ${req.method} ${req.pathname}`);
}

function bool(v: string | null): boolean | undefined {
  if (v === null) return undefined;
  return v === "true";
}

function num(v: string | null): number | undefined {
  if (v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isNaN(n) ? undefined : n;
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

route("POST", "/api/v1/auth/login", () => ({ access_token: DEMO_TOKEN, token_type: "bearer" }));

route("POST", "/api/v1/auth/register", (): RegisterResult => ({
  access_token: DEMO_TOKEN,
  verification_required: false,
  message: "Account created (demo mode — verification is skipped).",
}));

route("GET", "/api/v1/auth/verify-email", () => ({ access_token: DEMO_TOKEN, token_type: "bearer" }));
route("POST", "/api/v1/auth/resend-verification", () => undefined);
route("POST", "/api/v1/auth/forgot-password", () => undefined);
route("POST", "/api/v1/auth/reset-password", () => ({ access_token: DEMO_TOKEN, token_type: "bearer" }));

// ---------------------------------------------------------------------------
// Users (self + admin)
// ---------------------------------------------------------------------------

route("GET", "/api/v1/users/me", () => store.getDemoUser());

route("PATCH", "/api/v1/users/me", ({ body }) => {
  const patch = body as { name?: string; email?: string };
  return store.updateUser(store.getDemoUser().id, patch);
});

route("DELETE", "/api/v1/users/me", () => undefined);

route("POST", "/api/v1/users/me/change-password", () => undefined);

route("GET", "/api/v1/users/count", ({ qs }) => ({ count: store.countUsers(qs.get("q") ?? undefined) }));

route("GET", "/api/v1/users/me/signature", () => store.getUserSignature(store.getDemoUser().id));

route("DELETE", "/api/v1/users/me/signature", () => {
  store.setUserSignature(store.getDemoUser().id, null);
  return undefined;
});

route("GET", "/api/v1/users/:id/signature/public-key", ({ params }) => {
  const sig = store.getUserSignature(params[0]);
  if (!sig) throw new NotFoundError("user has no signing key");
  return {
    algorithm: "Ed25519",
    public_key_pem: "-----BEGIN PUBLIC KEY-----\nDEMO-MODE-PLACEHOLDER-KEY\n-----END PUBLIC KEY-----",
    fingerprint_sha256: sig.fingerprint_sha256,
  };
});

route("GET", "/api/v1/users/:id/signature/verify", ({ params }) => {
  const sig = store.getUserSignature(params[0]);
  if (!sig) throw new NotFoundError("user has no active signature");
  return {
    verified: true,
    image_hash_match: true,
    signature_valid: true,
    version: sig.version,
    signed_at: sig.created_at,
  };
});

route("GET", "/api/v1/users/:id", ({ params }) => {
  const user = store.getUserById(params[0]);
  if (!user) throw new NotFoundError("user not found");
  return user;
});

route("PUT", "/api/v1/users/:id", ({ params, body }) => {
  const patch = body as { role?: string; organization_id?: string | null; is_active?: boolean; is_verified?: boolean };
  const user = store.updateUser(params[0], patch as Partial<import("@/types/user").UserProfile>);
  if (!user) throw new NotFoundError("user not found");
  return user;
});

route("GET", "/api/v1/users", ({ qs }) =>
  store.listUsers({ skip: num(qs.get("skip")), limit: num(qs.get("limit")), q: qs.get("q") ?? undefined }));

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

route("GET", "/api/v1/admin/stats", (): AdminStats => ({
  assets: store.listAssets({}).length,
  procedures: store.listProcedures().length,
  calibrations: store.listAuditLogs({ limit: 1_000_000 }).filter((l) => l.entity_type === "calibration").length,
  users: store.listUsers({}).length,
  organizations: store.listOrganizations().length,
  teams: store.listTeams().length,
}));

route("GET", "/api/v1/admin/system", (): AdminSystem => ({
  uptime_seconds: 60 * 60 * 24 * 3 + 12_345,
  db_status: "ok",
  api_version: "demo",
}));

route("GET", "/api/v1/admin/email-settings", () => store.getEmailSettings());
route("PUT", "/api/v1/admin/email-settings", ({ body }) => store.updateEmailSettings(body as EmailSettingsUpdate));
route("POST", "/api/v1/admin/email-settings/test", () => undefined);

// ---------------------------------------------------------------------------
// Organizations
// ---------------------------------------------------------------------------

route("GET", "/api/v1/organizations", () => store.listOrganizations());
route("POST", "/api/v1/organizations", ({ body }) =>
  store.createOrganization(body as { name: string; description?: string }));
route("PUT", "/api/v1/organizations/:id", ({ body }) =>
  store.updateOrganization(body as Partial<Organization>));
route("DELETE", "/api/v1/organizations/:id", () => undefined);

// ---------------------------------------------------------------------------
// Teams (shared by admin.service, user.service, asset.service)
// ---------------------------------------------------------------------------

route("GET", "/api/v1/teams", ({ qs }) => store.listTeams(qs.get("org_id") ?? undefined));

route("POST", "/api/v1/teams", ({ body }) => {
  const input = body as { name: string; description?: string; organization_id?: string };
  return store.createTeam({
    name: input.name,
    description: input.description,
    organization_id: input.organization_id ?? store.getOrganization().id,
  });
});

route("PUT", "/api/v1/teams/:id", ({ params, body }) => {
  const team = store.updateTeam(params[0], body as { name?: string; description?: string });
  if (!team) throw new NotFoundError("team not found");
  return team as AdminTeam | Team;
});

route("DELETE", "/api/v1/teams/:id", ({ params }) => {
  store.deleteTeam(params[0]);
  return undefined;
});

// ---------------------------------------------------------------------------
// Locations
// ---------------------------------------------------------------------------

route("GET", "/api/v1/locations", ({ qs }) =>
  store.listLocations({
    isCalibrationLab: bool(qs.get("is_calibration_lab")),
    isActive: bool(qs.get("is_active")),
    limit: num(qs.get("limit")),
  }));

route("GET", "/api/v1/locations/:id", ({ params }) => {
  const loc = store.getLocation(params[0]);
  if (!loc) throw new NotFoundError("location not found");
  return loc;
});

route("POST", "/api/v1/locations", ({ body }) => {
  const input = body as LocationCreateBody;
  return store.createLocation({
    organization_id: input.organization_id,
    parent_location_id: input.parent_location_id ?? null,
    name: input.name,
    description: input.description ?? null,
    location_type: input.location_type,
    code: input.code ?? null,
    address: input.address ?? null,
    latitude: input.latitude ?? null,
    longitude: input.longitude ?? null,
    is_calibration_lab: input.is_calibration_lab ?? false,
    is_active: true,
  });
});

route("PUT", "/api/v1/locations/:id", ({ params, body }) => {
  const loc = store.updateLocation(params[0], body as Partial<LocationItem>);
  if (!loc) throw new NotFoundError("location not found");
  return loc;
});

route("DELETE", "/api/v1/locations/:id", ({ params }) => {
  store.deleteLocation(params[0]);
  return undefined;
});

// ---------------------------------------------------------------------------
// Procedures
// ---------------------------------------------------------------------------

route("GET", "/api/v1/procedures", ({ qs }) => store.listProcedures(qs.get("q") ?? undefined));

route("GET", "/api/v1/procedures/:id", ({ params }) => {
  const proc = store.getProcedure(params[0]);
  if (!proc) throw new NotFoundError("procedure not found");
  return proc as Procedure | ProcedureDetail;
});

route("POST", "/api/v1/procedures", ({ body }) => {
  const input = body as Partial<Procedure>;
  const now = new Date().toISOString();
  const procedure: Procedure = {
    id: store.genId(),
    proc_id: input.proc_id ?? null,
    physical_quantity: input.physical_quantity ?? "other",
    name: input.name ?? "Untitled procedure",
    description: input.description ?? null,
    version: input.version ?? "1.0",
    difficulty: input.difficulty ?? null,
    standard_ref: input.standard_ref ?? null,
    author: input.author ?? null,
    duration_min: input.duration_min ?? null,
    tags: input.tags ?? null,
    equipment: input.equipment ?? null,
    materials: input.materials ?? null,
    environment: input.environment ?? null,
    safety_notes: input.safety_notes ?? null,
    steps: input.steps ?? null,
    acceptance_criteria: input.acceptance_criteria ?? null,
    is_active: true,
    created_by: store.getDemoUser().id,
    created_at: now,
    updated_at: now,
  };
  return store.createProcedure(procedure);
});

route("PUT", "/api/v1/procedures/:id", ({ params, body }) => {
  const proc = store.updateProcedure(params[0], body as Partial<Procedure>);
  if (!proc) throw new NotFoundError("procedure not found");
  return proc;
});

route("DELETE", "/api/v1/procedures/:id", ({ params }) => {
  store.deleteProcedure(params[0]);
  return undefined;
});

route("GET", "/api/v1/procedures/:id/files", ({ params }) => store.listFilesForEntity("procedure", params[0]));

route("DELETE", "/api/v1/procedures/:procId/files/:fileId", ({ params }) => {
  store.deleteStoredFile(params[1]);
  return undefined;
});

// ---------------------------------------------------------------------------
// Calibrations / procedure lookups nested under /calibrations
// ---------------------------------------------------------------------------

route("GET", "/api/v1/calibrations/procedures", ({ qs }) =>
  store.listProceduresByQuantity(qs.get("physical_quantity") ?? undefined)
    .map((p) => ({ id: p.id, name: p.name, physical_quantity: p.physical_quantity })));

route("GET", "/api/v1/calibrations/:id/points", ({ params }) => store.getCalibrationPoints(params[0]));

route("GET", "/api/v1/calibrations/:id/certificate", ({ params }) => {
  const cal = store.getCalibrationById(params[0]);
  const filename = `CERT-DEMO-${(cal?.id ?? params[0]).slice(0, 8)}.txt`;
  const url = makePlaceholderBlobUrl(
    `Open Gauge demo — placeholder certificate.\n\nCalibration ${cal?.id ?? params[0]} for asset ${cal?.asset_id ?? "unknown"}.\n` +
    "In a real deployment this endpoint returns a signed URL to the actual generated PDF certificate.",
    "text/plain",
  );
  return { url, filename };
});

route("POST", "/api/v1/calibrations/analyze", ({ body }): unknown => {
  const req = body as AnalyzeRequest;
  const params: AnalyzeCalibrationParams = {
    points: req.points,
    referenceUnit: req.reference_unit,
    measuredUnit: req.measured_unit,
    polyDegree: req.poly_degree,
    distributionType: req.distribution_type,
    confidenceLevel: req.confidence_level,
    channelAccuracyValue: req.channel_accuracy_value,
    channelAccuracyType: req.channel_accuracy_type,
    decisionRule: req.decision_rule ?? "simple_acceptance",
    referenceStandardUncertainty: req.reference_standard_uncertainty,
    referenceStandardCoverageFactor: req.reference_standard_coverage_factor,
    resolution: req.resolution,
    sensorNominalUncertainty: req.sensor_nominal_uncertainty,
    sensorNominalCoverageFactor: req.sensor_nominal_coverage_factor,
    includeSensorNominalUncertainty: req.include_sensor_nominal_uncertainty,
  };
  return runAnalysis(params);
});

route("POST", "/api/v1/calibrations", ({ body }) => {
  const req = body as CalibrationCreateBody;
  const now = new Date().toISOString();
  const version = store.nextCalibrationVersion(req.asset_id);

  const record: CalibrationRecord = {
    id: store.genId(),
    asset_id: req.asset_id,
    calibration_date: req.calibration_date,
    due_date: req.due_date,
    performed_by_name: req.performed_by_name,
    performed_by_user_id: req.performed_by_user_id ?? store.getDemoUser().id,
    external_lab_name: req.external_lab_name ?? null,
    notes: req.notes ?? null,
    calibration_file_id: null,
    created_by: store.getDemoUser().id,
    created_at: now,
    sensor_id: req.sensor_id ?? null,
    calibration_type: req.calibration_type,
    calibration_version: version,
    calibration_interval: req.calibration_interval ?? null,
    tolerance_criteria: req.tolerance_criteria ?? null,
    internal_reference_asset_id: req.internal_reference_asset_id ?? null,
    internal_procedure_id: req.internal_procedure_id ?? null,
    external_lab_certificate_number: req.external_lab_certificate_number ?? null,
    daq_id: req.daq_id ?? null,
    calibration_data_id: null,
    calibration_location_id: req.calibration_location_id ?? null,
    temperature: req.temperature ?? null,
    humidity: req.humidity ?? null,
    pressure: req.pressure ?? null,
    poly_order: req.poly_order ?? (req.poly_coefficients ? req.poly_coefficients.length - 1 : null),
    poly_coefficients: req.poly_coefficients ?? null,
    range_min: req.range_min ?? null,
    range_max: req.range_max ?? null,
    r_squared: req.r_squared ?? null,
    rmse: req.rmse ?? null,
    standard_error: req.standard_error ?? null,
    max_error: req.max_error ?? null,
    full_scale_error: req.full_scale_error ?? null,
    non_linearity: req.non_linearity ?? null,
    repeatability: req.repeatability ?? null,
    hysteresis: req.hysteresis ?? null,
    distribution_type: req.distribution_type ?? null,
    confidence_level: req.confidence_level ?? null,
    coverage_factor: req.coverage_factor ?? null,
    combined_uncertainty: req.combined_uncertainty ?? null,
    expanded_uncertainty: req.expanded_uncertainty ?? null,
    valid_range_min: req.valid_range_min ?? null,
    valid_range_max: req.valid_range_max ?? null,
    uncertainty_budget: req.uncertainty_budget ?? null,
    effective_degrees_of_freedom: req.effective_degrees_of_freedom ?? null,
    poly_coefficients_covariance: req.poly_coefficients_covariance ?? null,
    decision_rule: req.decision_rule ?? null,
    conformity_statement: req.conformity_statement ?? null,
    is_active: true,
    voided_at: null,
    voided_by: null,
    void_reason: null,
  };

  const points = (req.points ?? []).map((p, i) => ({
    id: store.genId(),
    calibration_id: record.id,
    point_index: p.point_index ?? i,
    reference_value: p.reference_value,
    measured_value: p.measured_value,
    calculated_value: p.calculated_value ?? null,
    residual_abs: p.residual_abs ?? null,
    residual_pct: p.residual_pct ?? null,
    reference_unit: p.reference_unit,
    measured_unit: p.measured_unit,
    created_at: now,
  }));

  const created = store.addCalibration(record, points);
  store.appendAuditLog({
    action: "calibration.recorded",
    entityType: "calibration",
    entityId: created.id,
    entityAssetId: req.asset_id,
  });
  return created;
});

route("DELETE", "/api/v1/calibrations/:id", ({ params, qs }) => {
  const cal = store.voidCalibration(params[0], qs.get("reason") ?? undefined);
  if (cal) {
    store.appendAuditLog({
      action: "calibration.voided",
      entityType: "calibration",
      entityId: cal.id,
      entityAssetId: cal.asset_id,
    });
  }
  return undefined;
});

route("POST", "/api/v1/calibrations/:id/restore", ({ params }) => {
  const cal = store.restoreCalibration(params[0]);
  if (!cal) throw new NotFoundError("calibration not found");
  store.appendAuditLog({
    action: "calibration.restored",
    entityType: "calibration",
    entityId: cal.id,
    entityAssetId: cal.asset_id,
  });
  return cal;
});

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------

route("GET", "/api/v1/assets", ({ qs }) =>
  store.listAssets({
    isActive: bool(qs.get("is_active")),
    locationId: qs.get("location_id") ?? undefined,
    includeDescendants: bool(qs.get("include_descendants")),
    limit: num(qs.get("limit")),
  }));

route("POST", "/api/v1/assets", ({ body }) => {
  const input = body as AssetCreateBody;
  const now = new Date().toISOString();
  const profile: AssetProfile = {
    id: store.genId(),
    asset_id: input.asset_id,
    asset_type: input.asset_type,
    name: input.name,
    description: input.description ?? null,
    manufacturer: input.manufacturer,
    model: input.model,
    serial_number: input.serial_number ?? null,
    manufacturer_part_number: null,
    location_id: input.location_id ?? null,
    firmware_version: null,
    power_supply: null,
    power_consumption_w: null,
    dimensions: null,
    weight_kg: null,
    mounting_type: null,
    connection_type: null,
    displays_readings: false,
    ip_rating: null,
    hazardous_area_rating: null,
    operating_temperature_min: null,
    operating_temperature_max: null,
    operating_humidity_min: null,
    operating_humidity_max: null,
    health_score: 100,
    price_eur: null,
    purchase_date: null,
    warranty_expiry_date: null,
    owner: input.owner ?? null,
    is_active: true,
    retired_at: null,
    retired_reason: null,
    version: 1,
    notes: null,
    pinout_table: null,
    pinout_image_id: null,
    sensor_image_id: null,
    sensor_schematic_id: null,
    picture_id: null,
    picture_url: null,
    created_at: now,
    updated_at: now,
    sensor_channels: [],
    daq_details: input.asset_type === "daq"
      ? {
        id: store.genId(),
        asset_id: "",
        daq_type: "USB",
        input_channels: 0,
        output_channels: 0,
        input_signal_types: null,
        output_signal_types: null,
        sampling_rate_hz: null,
        per_channel_sampling_rate_hz: null,
        adc_resolution_bits: null,
        adc_type: null,
        input_voltage_range_min: null,
        input_voltage_range_max: null,
        noise_floor_uv_rms: null,
        dynamic_range_db: null,
        synchronization_supported: false,
        clock_source: null,
        time_sync_precision_ns: null,
        jitter_ns: null,
        communication_protocol: null,
        interface_type: null,
        trigger_modes: null,
        input_impedance_ohm: null,
        is_active: true,
      }
      : null,
    site_name: null,
    location_name: null,
    location_code: null,
    location_description: null,
    location_latitude: null,
    location_longitude: null,
    calibration_status: "not_calibrated",
    next_due_at: null,
    last_calibration_date: null,
    calibration_count: 0,
    subtype: null,
    technology: null,
    owner_name: null,
    calibration_health_score: null,
  };
  const created = store.createAsset(profile);
  store.appendAuditLog({ action: "asset.created", entityType: "asset", entityId: created.id, entityAssetId: created.asset_id });
  return created;
});

route("POST", "/api/v1/assets/import", () => (({
  results: [{
    source_folder: "demo-upload",
    status: "error",
    asset_id: null,
    new_asset_pk: null,
    error_message: "Bulk asset import isn't available in this demo — try creating an asset manually instead.",
  }],
} as unknown) as AssetImportResponse));

route("POST", "/api/v1/assets/import/validate", (): AssetImportPreview => ({
  valid: false,
  error_message: "Asset import validation isn't available in this demo.",
  asset_id: null,
  name: null,
  manufacturer: null,
  model: null,
  asset_type: null,
  channel_count: 0,
  calibration_count: 0,
}));

route("GET", "/api/v1/assets/:id/profile", ({ params }) => {
  const asset = store.getAssetProfile(params[0]);
  if (!asset) throw new NotFoundError("asset not found");
  return asset;
});

route("GET", "/api/v1/assets/:id/calibrations", ({ params, qs }) =>
  store.listCalibrationsForAsset(params[0], bool(qs.get("include_voided")) ?? false));

route("GET", "/api/v1/assets/:id/audit-logs", ({ params }) => store.listAuditLogsForAsset(params[0]));

route("GET", "/api/v1/assets/:id/files", ({ params }) => store.listFilesForEntity("asset", params[0]));

route("DELETE", "/api/v1/assets/:id/files/:fileId", ({ params }) => {
  store.deleteStoredFile(params[1]);
  return undefined;
});

route("DELETE", "/api/v1/assets/:id/picture", ({ params }) => {
  const asset = store.updateAsset(params[0], { picture_id: null, picture_url: null });
  if (!asset) throw new NotFoundError("asset not found");
  return asset;
});

route("PUT", "/api/v1/assets/:id", ({ params, body }) => {
  const input = body as AssetUpdateRequest;
  const existing = store.getAssetProfile(params[0]);
  if (!existing) throw new NotFoundError("asset not found");

  const patch: Partial<AssetProfile> = { ...input } as Partial<AssetProfile>;
  if (input.sensor_channels) {
    const now = new Date().toISOString();
    const byChannelId = new Map(existing.sensor_channels.map((c) => [c.channel_id, c]));
    patch.sensor_channels = input.sensor_channels.map((c): SensorChannelFull => {
      const prior = byChannelId.get(c.channel_id);
      return {
        id: prior?.id ?? store.genId(),
        asset_id: existing.id,
        channel_id: c.channel_id,
        physical_quantity: c.physical_quantity,
        measurement_type: c.measurement_type ?? prior?.measurement_type ?? null,
        unit: c.unit,
        technology: c.technology ?? prior?.technology ?? null,
        measurement_min: c.measurement_min ?? prior?.measurement_min ?? null,
        measurement_max: c.measurement_max ?? prior?.measurement_max ?? null,
        accuracy_value: c.accuracy_value ?? prior?.accuracy_value ?? null,
        accuracy_type: c.accuracy_type ?? prior?.accuracy_type ?? null,
        accuracy_unit: c.accuracy_unit ?? prior?.accuracy_unit ?? null,
        resolution: c.resolution ?? prior?.resolution ?? null,
        resolution_unit: c.resolution_unit ?? prior?.resolution_unit ?? null,
        measurement_uncertainty: c.measurement_uncertainty ?? prior?.measurement_uncertainty ?? null,
        uncertainty_unit: c.uncertainty_unit ?? prior?.uncertainty_unit ?? null,
        confidence_level: prior?.confidence_level ?? null,
        coverage_factor: prior?.coverage_factor ?? null,
        drift_rate: c.drift_rate ?? prior?.drift_rate ?? null,
        drift_unit: c.drift_unit ?? prior?.drift_unit ?? null,
        sensitivity: prior?.sensitivity ?? null,
        sensitivity_unit: prior?.sensitivity_unit ?? null,
        response_time_ms: c.response_time_ms ?? prior?.response_time_ms ?? null,
        bandwidth_hz: c.bandwidth_hz ?? prior?.bandwidth_hz ?? null,
        output_signal_min: c.output_signal_min ?? prior?.output_signal_min ?? null,
        output_signal_max: c.output_signal_max ?? prior?.output_signal_max ?? null,
        output_signal_unit: c.output_signal_unit ?? prior?.output_signal_unit ?? null,
        output_type: c.output_type ?? prior?.output_type ?? null,
        calibration_role: c.calibration_role ?? prior?.calibration_role ?? null,
        criticality: prior?.criticality ?? null,
        calibration_method_id: prior?.calibration_method_id ?? null,
        calibration_method_name: prior?.calibration_method_name ?? null,
        calibration_interval: prior?.calibration_interval ?? null,
        is_active: true,
        created_at: prior?.created_at ?? now,
        updated_at: now,
      };
    });
  }

  const updated = store.updateAsset(params[0], patch);
  if (!updated) throw new NotFoundError("asset not found");
  store.appendAuditLog({ action: "asset.updated", entityType: "asset", entityId: updated.id, entityAssetId: updated.asset_id });
  return updated;
});

route("POST", "/api/v1/assets/:id/duplicate", ({ params, body }) => {
  const source = store.getAssetProfile(params[0]);
  if (!source) throw new NotFoundError("asset not found");
  const { new_asset_id } = body as { new_asset_id: string };
  const now = new Date().toISOString();
  const clone: AssetProfile = {
    ...source,
    id: store.genId(),
    asset_id: new_asset_id,
    is_active: true,
    retired_at: null,
    retired_reason: null,
    version: 1,
    created_at: now,
    updated_at: now,
    calibration_status: "not_calibrated",
    next_due_at: null,
    last_calibration_date: null,
    calibration_count: 0,
    calibration_health_score: null,
    sensor_channels: source.sensor_channels.map((c) => ({ ...c, id: store.genId(), created_at: now, updated_at: now })),
    daq_details: source.daq_details ? { ...source.daq_details, id: store.genId() } : null,
  };
  const created = store.createAsset(clone);
  store.appendAuditLog({ action: "asset.created", entityType: "asset", entityId: created.id, entityAssetId: created.asset_id });
  return created;
});

route("DELETE", "/api/v1/assets/:id", ({ params, qs }) => {
  const asset = store.retireAsset(params[0], qs.get("reason") ?? undefined);
  if (asset) {
    store.appendAuditLog({ action: "asset.retired", entityType: "asset", entityId: asset.id, entityAssetId: asset.asset_id });
  }
  return undefined;
});

// ---------------------------------------------------------------------------
// Health (precomputed at fixture-generation time)
// ---------------------------------------------------------------------------

route("GET", "/api/v1/assets/:id/health", ({ params }) => {
  const snapshot = store.getHealthSnapshot(params[0]);
  if (!snapshot) throw new NotFoundError("no health snapshot for asset");
  return snapshot;
});

route("GET", "/api/v1/assets/:id/health/curve-comparison", ({ params, qs }): CurveComparisonResponse => {
  const refCal = store.getCalibrationById(qs.get("reference_calibration_id") ?? "");
  const curCal = store.getCalibrationById(qs.get("current_calibration_id") ?? "");
  if (!refCal || !curCal || !refCal.poly_coefficients || !curCal.poly_coefficients) {
    throw new NotFoundError("calibrations not comparable");
  }
  const asset = store.getAssetProfile(params[0]);
  const sensor = asset?.sensor_channels.find((c) => c.id === curCal.sensor_id) ?? asset?.sensor_channels[0];

  const min = Math.min(refCal.range_min ?? 0, curCal.range_min ?? 0);
  const max = Math.max(refCal.range_max ?? 1, curCal.range_max ?? 1);
  const x = generateXRange(min, max, 50);
  const yReference = x.map((v) => polyval(refCal.poly_coefficients as number[], v));
  const yCurrent = x.map((v) => polyval(curCal.poly_coefficients as number[], v));
  const delta = yCurrent.map((v, i) => v - yReference[i]);
  const absDrift = delta.map((d) => Math.abs(d));

  const { coefficients: linear } = polyfit(x, delta, 1);
  const [gain, offset] = linear;
  const linFit = x.map((v) => polyval(linear, v));
  const residualDrift = Math.sqrt(delta.reduce((s, d, i) => s + (d - linFit[i]) ** 2, 0) / x.length);

  return {
    x,
    y_reference: yReference,
    y_current: yCurrent,
    delta,
    abs_drift: absDrift,
    summary: {
      max_drift: Math.max(...absDrift),
      mean_drift: absDrift.reduce((s, d) => s + d, 0) / absDrift.length,
      rms_drift: Math.sqrt(delta.reduce((s, d) => s + d * d, 0) / delta.length),
      offset,
      gain,
      residual_drift: residualDrift,
    },
    unit: sensor?.unit ?? "",
  };
});

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

route("GET", "/api/v1/dashboard/summary", () => {
  const assets = store.listAssets({});
  const sensors = assets.filter((a) => a.asset_type === "sensor").length;
  const daqs = assets.filter((a) => a.asset_type === "daq").length;
  const lowHealth = assets.filter((a) => a.health_score < 50).length;
  const dist = ["valid", "due_soon", "expired", "not_calibrated"].map((status) => ({
    status: status as "valid" | "due_soon" | "expired" | "not_calibrated",
    count: assets.filter((a) => a.calibration_status === status).length,
  }));
  const procedures = store.listProcedures();
  const procDist = Array.from(
    procedures.reduce((m, p) => m.set(p.physical_quantity, (m.get(p.physical_quantity) ?? 0) + 1), new Map<string, number>()),
  ).map(([type, count]) => ({ type, count }));

  return {
    registered_assets: assets.length,
    sensors,
    daqs,
    low_health_assets: lowHealth,
    calibration_status_distribution: dist,
    procedures: procedures.length,
    procedure_distribution: procDist,
  };
});

route("GET", "/api/v1/dashboard/calibration-events", () =>
  store.listAssets({ isActive: true })
    .filter((a) => a.next_due_at)
    .map((a) => ({ id: a.id, asset_id: a.asset_id, name: a.name, due_date: (a.next_due_at as string).slice(0, 10) })));

route("GET", "/api/v1/dashboard/calendar-events", ({ qs }) => {
  const year = qs.get("year") ?? String(new Date().getFullYear());
  const events: { asset_id: string; name: string; date: string; event_type: "performed" | "due" }[] = [];
  for (const asset of store.listAssets({})) {
    for (const cal of store.listCalibrationsForAsset(asset.id, false)) {
      if (cal.calibration_date.startsWith(year)) {
        events.push({ asset_id: asset.asset_id, name: asset.name, date: cal.calibration_date, event_type: "performed" });
      }
      if (cal.due_date.startsWith(year)) {
        events.push({ asset_id: asset.asset_id, name: asset.name, date: cal.due_date, event_type: "due" });
      }
    }
  }
  return events;
});

route("GET", "/api/v1/dashboard/distribution", () => {
  const assets = store.listAssets({});
  return Array.from(
    assets.reduce((m, a) => m.set(a.subtype ?? "other", (m.get(a.subtype ?? "other") ?? 0) + 1), new Map<string, number>()),
  ).map(([type, count]) => ({ type, count }));
});

route("GET", "/api/v1/dashboard/asset-type-distribution", () => {
  const assets = store.listAssets({});
  const bucket = (items: typeof assets) =>
    Array.from(
      items.reduce((m, a) => m.set(a.subtype ?? "other", (m.get(a.subtype ?? "other") ?? 0) + 1), new Map<string, number>()),
    ).map(([type, count]) => ({ type, count }));
  return {
    sensors: bucket(assets.filter((a) => a.asset_type === "sensor")),
    daqs: bucket(assets.filter((a) => a.asset_type === "daq")),
  };
});

route("GET", "/api/v1/dashboard/activity", () =>
  store.listAuditLogs({ limit: 20 }).map((l) => ({
    actor_id: l.actor_id,
    actor_email: l.actor_email,
    actor_name: l.actor_name,
    actor_role: l.actor_role,
    action: l.action,
    entity_asset_id: l.entity_asset_id,
    created_at: l.created_at,
  })));

route("GET", "/api/v1/dashboard/recent-assets", () =>
  store.listAssets({ limit: 8 }).map((a) => ({
    id: a.id,
    asset_id: a.asset_id,
    name: a.name,
    manufacturer: a.manufacturer,
    model: a.model,
    asset_type: a.asset_type,
    updated_at: a.updated_at,
  })));

// ---------------------------------------------------------------------------
// Audit logs
// ---------------------------------------------------------------------------

route("GET", "/api/v1/audit-logs", ({ qs }) =>
  store.listAuditLogs({
    skip: num(qs.get("skip")),
    limit: num(qs.get("limit")),
    entityType: qs.get("entity_type") ?? undefined,
    actorId: qs.get("actor_id") ?? undefined,
  }));

// ---------------------------------------------------------------------------
// Blob / placeholder-file endpoints
// ---------------------------------------------------------------------------

function makePlaceholderBlobUrl(text: string, contentType: string): string {
  const blob = new Blob([text], { type: contentType });
  if (typeof URL !== "undefined" && typeof URL.createObjectURL === "function") {
    return URL.createObjectURL(blob);
  }
  return `data:${contentType};base64,${Buffer.from(text).toString("base64")}`;
}

function placeholderBlob(text: string, contentType: string): Blob {
  return new Blob([text], { type: contentType });
}

const BLOB_NOTICE =
  "Open Gauge demo — this is a placeholder file.\n\n" +
  "In a real deployment this endpoint streams the actual generated document " +
  "(PDF certificate, CSV/ZIP export, or printable label) from the API.";

// ---------------------------------------------------------------------------
// Public entry points (mirroring apps/web/src/lib/api.ts's 4 functions)
// ---------------------------------------------------------------------------

export async function demoFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const req = parse(path, options);
  try {
    return dispatch(req) as T;
  } catch (err) {
    if (err instanceof NotFoundError) throw new Error("Not found");
    throw err;
  }
}

export async function demoBlob(path: string, _options: RequestInit = {}): Promise<Blob> {
  void _options;
  return placeholderBlob(BLOB_NOTICE, "text/plain");
}

export async function demoBlobPost(_path: string, _body: unknown, _options: RequestInit = {}): Promise<Blob> {
  void _path;
  void _body;
  void _options;
  return placeholderBlob(BLOB_NOTICE, "text/plain");
}

export async function demoUpload<T>(path: string, form: FormData, options: RequestInit = {}): Promise<T> {
  const req = parse(path, options);
  const file = form.get("file");

  if (req.pathname === "/api/v1/assets/import" || req.pathname === "/api/v1/assets/import/validate") {
    return dispatch(req) as T;
  }

  if (!(file instanceof File)) {
    throw new Error("Demo upload: no file provided");
  }

  const url = typeof URL !== "undefined" && typeof URL.createObjectURL === "function"
    ? URL.createObjectURL(file)
    : null;

  const now = new Date().toISOString();
  const makeStoredFile = (entityType: string, entityId: string, stepIndex: number | null = null): StoredFile => ({
    id: store.genId(),
    original_filename: file.name,
    content_type: file.type || "application/octet-stream",
    size_bytes: file.size,
    entity_type: entityType,
    entity_id: entityId,
    step_index: stepIndex,
    uploaded_by: store.getDemoUser().id,
    created_at: now,
    url,
  });

  // /api/v1/assets/:id/files
  let m = /^\/api\/v1\/assets\/([^/]+)\/files$/.exec(req.pathname);
  if (m) {
    const stored = store.addStoredFile(makeStoredFile("asset", m[1]));
    return stored as unknown as T;
  }

  // /api/v1/assets/:id/picture
  m = /^\/api\/v1\/assets\/([^/]+)\/picture$/.exec(req.pathname);
  if (m) {
    const asset = store.updateAsset(m[1], { picture_url: url, picture_id: store.genId() });
    if (!asset) throw new Error("asset not found");
    return asset as unknown as T;
  }

  // /api/v1/users/me/picture
  if (req.pathname === "/api/v1/users/me/picture") {
    const user = store.updateUser(store.getDemoUser().id, { profile_picture_url: url, profile_picture_id: store.genId() });
    return user as unknown as T;
  }

  // /api/v1/users/me/signature
  if (req.pathname === "/api/v1/users/me/signature") {
    const userId = store.getDemoUser().id;
    const existing = store.getUserSignature(userId);
    const source = form.get("source");
    const sig = {
      id: store.genId(),
      version: (existing?.version ?? 0) + 1,
      source: source === "drawn" ? "drawn" as const : "upload" as const,
      is_active: true,
      image_url: url,
      fingerprint_sha256: existing?.fingerprint_sha256 ?? store.genId().replace(/-/g, "").slice(0, 64).padEnd(64, "0"),
      created_at: now,
    };
    store.setUserSignature(userId, sig);
    return sig as unknown as T;
  }

  // /api/v1/procedures/:id/files
  m = /^\/api\/v1\/procedures\/([^/]+)\/files$/.exec(req.pathname);
  if (m) {
    const stepIndex = num(req.qs.get("step_index")) ?? null;
    const stored = store.addStoredFile(makeStoredFile("procedure", m[1], stepIndex));
    return stored as unknown as T;
  }

  throw new Error(`Demo upload: no handler for ${req.pathname}`);
}
