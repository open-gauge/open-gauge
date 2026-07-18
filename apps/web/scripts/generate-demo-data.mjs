#!/usr/bin/env node
/**
 * Generates the committed demo fixture at
 * `apps/web/src/lib/demo/fixtures/data.json` — a fictional calibration lab
 * ("Meridian Calibration Labs") with ~50 assets, 3-6 calibrations each,
 * locations, teams, users, procedures, audit logs, and precomputed Health
 * snapshots.
 *
 * Run once and commit the output:
 *   node apps/web/scripts/generate-demo-data.mjs
 *
 * Deterministic: seeded PRNG (mulberry32), so re-running produces identical
 * output byte-for-byte (safe to re-run after editing this script).
 *
 * This script is plain Node ESM — it cannot import the app's TypeScript
 * modules, so the polynomial fit core is mirrored in ./curve-fit.mjs (twin
 * of ../src/lib/demo/curve-fit.ts) and the Health-tab math is ported once
 * here in ./health-engine.mjs (runtime never recomputes Health — see
 * router.ts — so there is no TS twin of that module).
 */
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { polyfit, polyval } from "./curve-fit.mjs";
import { computeAssetHealth } from "./health-engine.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.join(__dirname, "..", "src", "lib", "demo", "fixtures", "data.json");

// ---------------------------------------------------------------------------
// Seeded PRNG (mulberry32) + helpers
// ---------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260713);

function randInt(min, max) {
  return Math.floor(rand() * (max - min + 1)) + min;
}
function randFloat(min, max) {
  return rand() * (max - min) + min;
}
function randNormal(mean, stdDev) {
  // Box-Muller transform.
  const u1 = Math.max(rand(), 1e-12);
  const u2 = rand();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stdDev;
}
function choice(arr) {
  return arr[Math.floor(rand() * arr.length)];
}
function shuffled(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function round(n, decimals = 4) {
  const f = 10 ** decimals;
  return Math.round(n * f) / f;
}
function genId() {
  const hex = () => Math.floor(rand() * 16).toString(16);
  const seg = (n) => Array.from({ length: n }, hex).join("");
  return `${seg(8)}-${seg(4)}-4${seg(3)}-${(8 + Math.floor(rand() * 4)).toString(16)}${seg(3)}-${seg(12)}`;
}

const NOW = new Date("2026-07-13T09:00:00.000Z"); // fixed "generation instant" for reproducible output
function isoDate(d) {
  return d.toISOString().slice(0, 10);
}
function isoDateTime(d) {
  return d.toISOString();
}
function addMonths(d, months) {
  const copy = new Date(d);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}
function addDays(d, days) {
  return new Date(d.getTime() + days * 86_400_000);
}

let idCounter = 1000;
function nextAssetCode() {
  idCounter += 1;
  return `MCL-${idCounter}`;
}

// ---------------------------------------------------------------------------
// Organization / Users / Teams
// ---------------------------------------------------------------------------

const orgId = genId();
const organization = {
  id: orgId,
  name: "Meridian Calibration Labs",
  description: "Independent metrology and instrumentation calibration laboratory serving industrial process customers.",
  is_active: true,
  created_at: isoDateTime(addMonths(NOW, -30)),
  updated_at: isoDateTime(addMonths(NOW, -1)),
};

const teamDefs = [
  { name: "Instrumentation & Controls", description: "Owns field sensors, transmitters, and process instrumentation." },
  { name: "Metrology Lab", description: "Reference standards, primary calibration lab, and traceability chain." },
  { name: "Process Engineering", description: "Process design support and instrumentation specification." },
  { name: "Reliability & Maintenance", description: "Preventive maintenance and asset reliability programs." },
  { name: "Quality Assurance", description: "ISO/IEC 17025 quality system, audits, and document control." },
];
const teams = teamDefs.map((t) => ({
  id: genId(),
  organization_id: orgId,
  name: t.name,
  description: t.description,
  created_at: isoDateTime(addMonths(NOW, -28)),
}));
const teamByName = Object.fromEntries(teams.map((t) => [t.name, t]));

// Fixed demo identity (superadmin, can reach every page including /admin).
const DEMO_USER_ID = genId();
const userDefs = [
  { id: DEMO_USER_ID, name: "Jordan Avery", email: "jordan.avery@meridiancal.example", role: "superadmin", team: null },
  { name: "Priya Natarajan", email: "priya.natarajan@meridiancal.example", role: "admin", team: "Metrology Lab" },
  { name: "Marcus Webb", email: "marcus.webb@meridiancal.example", role: "technician", team: "Instrumentation & Controls" },
  { name: "Elena Kowalski", email: "elena.kowalski@meridiancal.example", role: "technician", team: "Instrumentation & Controls" },
  { name: "Tomasz Riedel", email: "tomasz.riedel@meridiancal.example", role: "technician", team: "Metrology Lab" },
  { name: "Sarah Lindqvist", email: "sarah.lindqvist@meridiancal.example", role: "admin", team: "Quality Assurance" },
  { name: "David Chen", email: "david.chen@meridiancal.example", role: "viewer", team: "Process Engineering" },
  { name: "Amara Okafor", email: "amara.okafor@meridiancal.example", role: "viewer", team: "Reliability & Maintenance" },
];
const users = userDefs.map((u) => ({
  id: u.id ?? genId(),
  email: u.email,
  name: u.name,
  role: u.role,
  // Membership is opt-in and modeled as a list — each demo user belongs to
  // at most one team here, matching the pre-existing team assignments.
  teams: u.team ? [{ id: teamByName[u.team].id, name: u.team }] : [],
  is_active: true,
  is_superuser: u.role === "superadmin",
  is_verified: true,
  profile_picture_id: null,
  profile_picture_url: null,
  organization_id: orgId,
  created_at: isoDateTime(addMonths(NOW, -randInt(6, 27))),
  updated_at: isoDateTime(addMonths(NOW, -randInt(0, 5))),
}));
const demoUser = users.find((u) => u.id === DEMO_USER_ID);
const technicianNames = users.filter((u) => u.role === "technician" || u.role === "admin" || u.role === "superadmin").map((u) => u.name);

// ---------------------------------------------------------------------------
// Locations (3 sites -> 12 total)
// ---------------------------------------------------------------------------

function makeLocation({ name, type, code, parentId, isCalLab = false, lat = null, lng = null, address = null }) {
  return {
    id: genId(),
    organization_id: orgId,
    parent_location_id: parentId,
    name,
    description: null,
    location_type: type,
    code,
    address,
    latitude: lat,
    longitude: lng,
    is_calibration_lab: isCalLab,
    is_active: true,
    asset_count: 0, // recomputed live by the store on every read
  };
}

const locations = [];
const siteA = makeLocation({ name: "Riverside Manufacturing Campus", type: "site", code: "SITE-RVS", parentId: null, address: "4 Riverside Industrial Way", lat: 51.05, lng: -0.12 });
const siteB = makeLocation({ name: "Northgate Process Plant", type: "site", code: "SITE-NGP", parentId: null, address: "88 Northgate Road", lat: 52.48, lng: -1.9 });
const siteC = makeLocation({ name: "Harborview R&D Center", type: "site", code: "SITE-HBV", parentId: null, address: "12 Harborview Terrace", lat: 53.4, lng: -2.98 });
locations.push(siteA, siteB, siteC);

const metrologyLab = makeLocation({ name: "Metrology Lab", type: "laboratory", code: "LAB-METRO", parentId: siteA.id, isCalLab: true });
const reactorBay2 = makeLocation({ name: "Reactor Bay 2", type: "laboratory", code: "LAB-RB2", parentId: siteA.id });
const boilerHouse = makeLocation({ name: "Boiler House", type: "laboratory", code: "LAB-BOIL", parentId: siteA.id });
const controlRoomA = makeLocation({ name: "Control Room", type: "room", code: "RM-CTRL-A", parentId: siteA.id });

const cleanroomSuite = makeLocation({ name: "Cleanroom Suite", type: "laboratory", code: "LAB-CR", parentId: siteB.id });
const pipelineCorridor4 = makeLocation({ name: "Pipeline Corridor 4", type: "laboratory", code: "LAB-PIPE4", parentId: siteB.id });
const fieldCalShop = makeLocation({ name: "Field Calibration Shop", type: "laboratory", code: "LAB-FCS", parentId: siteB.id, isCalLab: true });

const instrumentationLab = makeLocation({ name: "Instrumentation Lab", type: "laboratory", code: "LAB-INST", parentId: siteC.id, isCalLab: true });
const testCell3 = makeLocation({ name: "Test Cell 3", type: "laboratory", code: "LAB-TC3", parentId: siteC.id });

locations.push(metrologyLab, reactorBay2, boilerHouse, controlRoomA, cleanroomSuite, pipelineCorridor4, fieldCalShop, instrumentationLab, testCell3);

const workingLocations = [reactorBay2, boilerHouse, controlRoomA, cleanroomSuite, pipelineCorridor4, instrumentationLab, testCell3];
const calibrationLabLocations = [metrologyLab, fieldCalShop, instrumentationLab];

// ---------------------------------------------------------------------------
// Procedures (11) — extends apps/api/app/seeds/seed.py's 4 templates
// ---------------------------------------------------------------------------

function makeProcedure(p) {
  return {
    id: genId(),
    proc_id: p.proc_id,
    physical_quantity: p.physical_quantity,
    name: p.name,
    description: p.description,
    version: p.version,
    difficulty: p.difficulty,
    standard_ref: p.standard_ref,
    author: p.author,
    duration_min: p.duration_min,
    tags: p.tags,
    equipment: p.equipment,
    materials: p.materials,
    environment: p.environment,
    safety_notes: p.safety_notes,
    steps: p.steps,
    acceptance_criteria: p.acceptance_criteria,
    is_active: true,
    created_by: DEMO_USER_ID,
    created_at: isoDateTime(addMonths(NOW, -randInt(12, 26))),
    updated_at: isoDateTime(addMonths(NOW, -randInt(0, 8))),
  };
}

const procedures = [
  makeProcedure({
    proc_id: "PROC-PT-001", physical_quantity: "pressure", name: "Pressure transmitter — 5-point linearity",
    description: "Five-point ascending and descending calibration of a pressure transmitter against a dead-weight tester or reference gauge.",
    version: "3.2", difficulty: "Intermediate", standard_ref: "IEC 60770-1", author: "Priya Natarajan", duration_min: 45,
    tags: ["Pressure", "#5-point", "#linearity"],
    equipment: [{ name: "Dead-weight tester", model: "Fluke P3100" }, { name: "Reference multimeter", model: "Fluke 87V" }, { name: "Loop calibrator", model: "Fluke 705" }],
    materials: [{ name: "Hydraulic oil", quantity: "500 ml" }, { name: "PTFE thread tape", quantity: "1 roll" }],
    environment: [{ parameter: "Ambient temperature", value: "20 ± 2 °C" }, { parameter: "Supply voltage", value: "24 VDC ± 0.5" }],
    safety_notes: ["Maximum system pressure must not exceed rated range of the DUT.", "Depressurize system fully before disconnecting fittings."],
    steps: [
      { title: "Connect DUT", description: "Flush lines. Secure all fittings. Verify no leaks.", duration_min: 5 },
      { title: "Zero check", description: "Vent to atmosphere. Record zero output. Adjust if outside ±0.03% FS.", duration_min: 5 },
      { title: "Ascending points 25-100% span", description: "Apply 25%, 50%, 75%, and 100% span. Allow 2 min per point.", duration_min: 20 },
      { title: "Descending points 75-0% span", description: "Step down through 75%, 50%, 25%, 0%. Record output.", duration_min: 10 },
      { title: "Compute & sign", description: "Calculate linearity and hysteresis errors. Sign calibration report.", duration_min: 5 },
    ],
    acceptance_criteria: [{ label: "Linearity error", limit: "≤ 0.10% FS" }, { label: "Hysteresis", limit: "≤ 0.05% FS" }],
  }),
  makeProcedure({
    proc_id: "PROC-TT-002", physical_quantity: "temperature", name: "RTD PT100 — ice point + dry-block",
    description: "Three-point temperature calibration: 0 °C ice bath plus two dry-block points. Validates PT100 conformance to class A.",
    version: "2.1", difficulty: "Basic", standard_ref: "IEC 60751 · ITS-90", author: "Tomasz Riedel", duration_min: 75,
    tags: ["Temperature", "#PT100", "#rtd"],
    equipment: [{ name: "Reference thermometer", model: "Fluke 1524 + 5615 probe" }, { name: "Dry-block calibrator", model: "Fluke 9144" }],
    materials: [{ name: "Distilled water", quantity: "500 ml" }, { name: "Crushed ice", quantity: "1 L" }],
    environment: [{ parameter: "Ambient temperature", value: "20 ± 5 °C" }, { parameter: "Draft-free location", value: "required" }],
    safety_notes: ["Dry-block surfaces exceed 200 °C — use insulated handling tools.", "Allow 20 min cool-down before removing probes."],
    steps: [
      { title: "Build the ice point", description: "Pack crushed ice in a Dewar, add distilled water until slushy.", duration_min: 10 },
      { title: "Insert reference & DUT", description: "Submerge both probes to 150 mm depth, separated by 20 mm.", duration_min: 5 },
      { title: "Record 0 °C", description: "Capture 5 readings at 10 s intervals.", duration_min: 5 },
      { title: "Dry-block points", description: "Ramp through 100 °C and 200 °C. Stabilize, then record.", duration_min: 45 },
      { title: "Compute & sign", description: "Compute residuals. Upload certificate.", duration_min: 10 },
    ],
    acceptance_criteria: [{ label: "0 °C deviation", limit: "≤ ±0.15 °C (Class A)" }, { label: "200 °C deviation", limit: "≤ ±0.55 °C" }],
  }),
  makeProcedure({
    proc_id: "PROC-RH-003", physical_quantity: "humidity", name: "Humidity sensor — saturated salt solution",
    description: "Multi-point calibration of capacitive humidity sensors using saturated salt solutions to generate reference RH conditions.",
    version: "1.5", difficulty: "Basic", standard_ref: "ASTM E104", author: "Marcus Webb", duration_min: 1440,
    tags: ["Humidity", "#rh", "#salt-solution"],
    equipment: [{ name: "Humidity reference chamber", model: "Rotronic HC2-C05" }, { name: "Reference hygro-thermometer", model: "Vaisala HMT310" }],
    materials: [{ name: "Lithium chloride (LiCl)", quantity: "200 g" }, { name: "Sodium chloride (NaCl)", quantity: "200 g" }],
    environment: [{ parameter: "Ambient temperature", value: "23 ± 1 °C" }],
    safety_notes: ["LiCl is hygroscopic and irritating — wear gloves and lab coat."],
    steps: [
      { title: "Prepare salt solutions", description: "Prepare saturated solutions of LiCl, NaCl, and KCl.", duration_min: 30 },
      { title: "Seal DUT in chambers", description: "Place DUT and reference probe in the first chamber.", duration_min: 10 },
      { title: "Equilibrate & record", description: "Allow 6-12 h equilibration per chamber. Record readings.", duration_min: 1370 },
      { title: "Compute & sign", description: "Calculate offset and gain errors.", duration_min: 30 },
    ],
    acceptance_criteria: [{ label: "Error at 11% RH", limit: "≤ ±2.0% RH" }, { label: "Error at 85% RH", limit: "≤ ±1.5% RH" }],
  }),
  makeProcedure({
    proc_id: "PROC-FT-004", physical_quantity: "flow", name: "Flow meter — zero and span verification",
    description: "Zero-flow and full-span verification for electromagnetic and vortex flow meters installed in closed-loop pipelines.",
    version: "1.2", difficulty: "Advanced", standard_ref: "ISO 6817", author: "Elena Kowalski", duration_min: 30,
    tags: ["Flow", "#zero-verification"],
    equipment: [{ name: "Reference flow transmitter", model: "Endress+Hauser Proline" }, { name: "Valve lockout kit", model: "Brady" }],
    materials: [{ name: "Lockout/tagout labels", quantity: "1 set" }],
    environment: [{ parameter: "Flow condition", value: "zero flow (isolation valves closed)" }],
    safety_notes: ["Ensure isolation valves are locked out per site LOTO procedure before entering flow path.", "Pressurized pipes — never break connections without full depressurization."],
    steps: [
      { title: "Isolate flow path", description: "Close isolation valves. Apply LOTO.", duration_min: 10 },
      { title: "Record zero output", description: "Monitor flow transmitter output for 5 min.", duration_min: 5 },
      { title: "Evaluate zero offset", description: "Adjust zero trim if drift > 0.5% FS.", duration_min: 5 },
      { title: "Restore flow", description: "Remove LOTO. Confirm return to normal flow reading.", duration_min: 5 },
      { title: "Document & sign", description: "Record zero offset and sign the verification record.", duration_min: 5 },
    ],
    acceptance_criteria: [{ label: "Zero offset", limit: "≤ 0.5% FS" }],
  }),
  makeProcedure({
    proc_id: "PROC-LV-005", physical_quantity: "level", name: "Level transmitter — hydrostatic head verification",
    description: "Multi-point level calibration using a graduated head-height rig to verify radar, ultrasonic, and hydrostatic level transmitters.",
    version: "1.0", difficulty: "Intermediate", standard_ref: "IEC 61298-2", author: "Priya Natarajan", duration_min: 60,
    tags: ["Level"],
    equipment: [{ name: "Head-height calibration rig", model: "In-house" }, { name: "Reference tape measure", model: "Class I" }],
    materials: [{ name: "Water (or process fluid analog)", quantity: "as required" }],
    environment: [{ parameter: "Ambient temperature", value: "20 ± 3 °C" }],
    safety_notes: ["Confirm tank/vessel is depressurized and isolated before entry."],
    steps: [
      { title: "Set zero level", description: "Drain to empty. Record zero output.", duration_min: 10 },
      { title: "Ascending head points", description: "Fill to 25%, 50%, 75%, 100% of span. Record output at each.", duration_min: 30 },
      { title: "Compute & sign", description: "Calculate linearity error. Sign calibration report.", duration_min: 20 },
    ],
    acceptance_criteria: [{ label: "Linearity error", limit: "≤ 0.25% FS" }],
  }),
  makeProcedure({
    proc_id: "PROC-FR-006", physical_quantity: "force", name: "Load cell — deadweight force calibration",
    description: "Deadweight-based force calibration of strain-gauge and piezoelectric load cells across their rated range.",
    version: "1.3", difficulty: "Advanced", standard_ref: "ISO 376", author: "Sarah Lindqvist", duration_min: 90,
    tags: ["Force"],
    equipment: [{ name: "Deadweight force standard", model: "Morehouse 4215" }, { name: "Digital indicator", model: "HBM DMP41" }],
    materials: [],
    environment: [{ parameter: "Ambient temperature", value: "20 ± 2 °C" }],
    safety_notes: ["Deadweight stacks are heavy — use mechanical hoist for masses above 25 kg."],
    steps: [
      { title: "Mounting & zero", description: "Mount load cell per manufacturer spec. Record zero.", duration_min: 15 },
      { title: "Ascending points", description: "Apply 20%, 40%, 60%, 80%, 100% of rated capacity.", duration_min: 45 },
      { title: "Descending points", description: "Remove weights in reverse order. Record output.", duration_min: 20 },
      { title: "Compute & sign", description: "Calculate linearity, hysteresis, and repeatability.", duration_min: 10 },
    ],
    acceptance_criteria: [{ label: "Combined error", limit: "≤ 0.05% FS" }],
  }),
  makeProcedure({
    proc_id: "PROC-TQ-007", physical_quantity: "torque", name: "Torque transducer — reference torque calibration",
    description: "Static torque calibration using a reference torque wrench/transducer and calibrated lever-arm weights.",
    version: "1.1", difficulty: "Intermediate", standard_ref: "ISO 6789", author: "Marcus Webb", duration_min: 60,
    tags: ["Torque"],
    equipment: [{ name: "Reference torque standard", model: "HBM T40B" }],
    materials: [],
    environment: [{ parameter: "Ambient temperature", value: "20 ± 3 °C" }],
    safety_notes: ["Secure the lever arm before releasing counterweights."],
    steps: [
      { title: "Zero check", description: "Record zero-torque output.", duration_min: 10 },
      { title: "Ascending points", description: "Apply 25%, 50%, 75%, 100% of rated torque, both directions.", duration_min: 40 },
      { title: "Compute & sign", description: "Calculate linearity and reversal error.", duration_min: 10 },
    ],
    acceptance_criteria: [{ label: "Linearity error", limit: "≤ 0.2% FS" }],
  }),
  makeProcedure({
    proc_id: "PROC-MA-008", physical_quantity: "mass", name: "Precision balance — OIML weight set calibration",
    description: "Calibration of precision balances and platform scales against a traceable OIML Class E2/F1 weight set.",
    version: "2.0", difficulty: "Basic", standard_ref: "OIML R111", author: "Tomasz Riedel", duration_min: 50,
    tags: ["Mass"],
    equipment: [{ name: "OIML weight set", model: "Class F1, 1 mg - 20 kg" }],
    materials: [],
    environment: [{ parameter: "Ambient temperature", value: "20 ± 1 °C" }, { parameter: "Draft-free enclosure", value: "required" }],
    safety_notes: ["Handle weights with gloves/forceps only — skin oils affect mass over time."],
    steps: [
      { title: "Zero / tare", description: "Record zero reading with empty pan.", duration_min: 5 },
      { title: "Ascending points", description: "Apply weights at 20%, 40%, 60%, 80%, 100% of capacity.", duration_min: 30 },
      { title: "Compute & sign", description: "Calculate linearity and eccentricity error.", duration_min: 15 },
    ],
    acceptance_criteria: [{ label: "Linearity error", limit: "≤ 0.02% FS" }],
  }),
  makeProcedure({
    proc_id: "PROC-EL-009", physical_quantity: "voltage", name: "Multifunction calibrator — DC voltage/current/resistance verification",
    description: "Verification of DC voltage, current, and resistance measurement channels against a traceable multifunction calibrator.",
    version: "1.4", difficulty: "Intermediate", standard_ref: "IEC 61010-1", author: "Sarah Lindqvist", duration_min: 40,
    tags: ["Electrical", "#voltage", "#current", "#resistance"],
    equipment: [{ name: "Multifunction calibrator", model: "Fluke 5522A" }],
    materials: [],
    environment: [{ parameter: "Ambient temperature", value: "23 ± 2 °C" }],
    safety_notes: ["De-energize circuits before connecting/disconnecting test leads."],
    steps: [
      { title: "Zero check", description: "Verify zero reading with inputs shorted/open as applicable.", duration_min: 5 },
      { title: "Ascending points", description: "Source 25%, 50%, 75%, 100% of range. Record indicated value.", duration_min: 25 },
      { title: "Compute & sign", description: "Calculate error at each point against tolerance.", duration_min: 10 },
    ],
    acceptance_criteria: [{ label: "Reading error", limit: "≤ 0.1% of reading" }],
  }),
  makeProcedure({
    proc_id: "PROC-DA-010", physical_quantity: "displacement", name: "Displacement & angle sensor — laser interferometer verification",
    description: "High-accuracy linear displacement and angular position verification using a laser interferometer reference.",
    version: "1.0", difficulty: "Advanced", standard_ref: "ISO 230-2", author: "Priya Natarajan", duration_min: 70,
    tags: ["Displacement", "Angle"],
    equipment: [{ name: "Laser interferometer", model: "Renishaw XL-80" }],
    materials: [],
    environment: [{ parameter: "Ambient temperature", value: "20 ± 0.5 °C" }],
    safety_notes: ["Laser class 2 — avoid direct beam viewing."],
    steps: [
      { title: "Align reference", description: "Align interferometer optics to the travel/rotation axis.", duration_min: 20 },
      { title: "Ascending points", description: "Step through 20%, 40%, 60%, 80%, 100% of travel/range.", duration_min: 35 },
      { title: "Compute & sign", description: "Calculate linearity error against travel/rotation.", duration_min: 15 },
    ],
    acceptance_criteria: [{ label: "Linearity error", limit: "≤ 0.1% FS" }],
  }),
  makeProcedure({
    proc_id: "PROC-AC-011", physical_quantity: "acceleration", name: "Accelerometer — back-to-back comparison calibration",
    description: "Back-to-back comparison calibration of piezoelectric/MEMS accelerometers against a reference accelerometer on a shaker table.",
    version: "1.2", difficulty: "Advanced", standard_ref: "ISO 16063-21", author: "Elena Kowalski", duration_min: 55,
    tags: ["Acceleration"],
    equipment: [{ name: "Reference accelerometer", model: "PCB Piezotronics 356A16" }, { name: "Shaker table", model: "Data Physics GW-V4" }],
    materials: [],
    environment: [{ parameter: "Ambient temperature", value: "20 ± 3 °C" }],
    safety_notes: ["Secure test fixture before energizing the shaker table."],
    steps: [
      { title: "Mount DUT & reference", description: "Mount both accelerometers back-to-back on the shaker table.", duration_min: 15 },
      { title: "Sweep points", description: "Apply reference acceleration at 20%, 40%, 60%, 80%, 100% of range.", duration_min: 30 },
      { title: "Compute & sign", description: "Calculate sensitivity deviation against reference.", duration_min: 10 },
    ],
    acceptance_criteria: [{ label: "Sensitivity deviation", limit: "≤ 1.0% of reading" }],
  }),
];
const procedureByQuantity = new Map();
for (const p of procedures) {
  if (!procedureByQuantity.has(p.physical_quantity)) procedureByQuantity.set(p.physical_quantity, []);
  procedureByQuantity.get(p.physical_quantity).push(p);
}

// ---------------------------------------------------------------------------
// Physical quantity catalog (manufacturers/models/units/technologies/ranges)
// ---------------------------------------------------------------------------

const CRITICALITY = ["non-critical", "critical", "safety-critical"];
const MOUNTING = ["wall", "ceiling", "pole", "din rail"];
const IP_RATINGS = ["IP65", "IP66", "IP67", "IP68"];
const CONNECTION_TYPES = ["1/2\" NPT", "Tri-clamp 2\"", "Flanged DN50", "M12 connector", "Terminal block"];
const AREA_TAGS = [
  "Reactor Feed", "Reactor Outlet", "Boiler Drum", "Cooling Loop", "Pipeline Segment 4", "Tank 12",
  "Compressor Stage 2", "Filter Skid", "Mixing Vessel", "Heat Exchanger 3", "Distillation Column",
  "Utility Header", "Test Bench 2", "Field Station 7", "Furnace Zone 1", "Cleanroom Module", "Pump Station 5",
  "Chiller Loop", "Conveyor Line 2", "Effluent Sump", "Steam Header", "Feedwater Line", "Vent Stack",
];

const QUANTITIES = [
  {
    key: "temperature", unit: "°C", count: 5, abbrev: "TT",
    technologies: ["RTD PT100", "thermocouple type K", "thermistor NTC", "infrared"],
    rangePresets: [[-50, 150], [-20, 600], [-200, 420]],
    accuracyType: "absolute", accuracyAbsRange: [0.05, 0.5],
    outputType: "analog", manufacturers: [
      { name: "Omega", models: ["PR-21SL-3-100-A", "HH806AU"] },
      { name: "Fluke", models: ["1524", "1502A"] },
      { name: "WIKA", models: ["TR10-B", "TR75"] },
      { name: "Yokogawa", models: ["EJX910A"] },
      { name: "Honeywell", models: ["STT25H", "STT750"] },
    ],
  },
  {
    key: "pressure", unit: "bar", count: 5, abbrev: "PT",
    technologies: ["strain gauge", "piezoresistive", "capacitive", "resonant"],
    rangePresets: [[0, 10], [0, 25], [0, 100]],
    accuracyType: "percent_of_full_scale", accuracyPctRange: [0.025, 0.5],
    outputType: "analog", manufacturers: [
      { name: "Endress+Hauser", models: ["Cerabar PMP55", "Cerabar PMC71"] },
      { name: "WIKA", models: ["S-20", "CPH7600", "UPT-20"] },
      { name: "Yokogawa", models: ["EJX530A"] },
      { name: "Fluke", models: ["700G29"] },
    ],
  },
  {
    key: "flow", unit: "m³/h", count: 3, abbrev: "FT",
    technologies: ["electromagnetic", "vortex", "coriolis", "ultrasonic", "differential pressure"],
    rangePresets: [[0, 300], [0, 500]],
    accuracyType: "percent_of_reading", accuracyPctRange: [0.1, 0.5],
    outputType: "analog", manufacturers: [
      { name: "Siemens", models: ["SITRANS F M MAG 5100", "SITRANS FUE950"] },
      { name: "Endress+Hauser", models: ["Promag 50W", "Prosonic Flow 93"] },
      { name: "Yokogawa", models: ["ADMAG AXR"] },
    ],
  },
  {
    key: "humidity", unit: "%RH", count: 3, abbrev: "RH",
    technologies: ["capacitive", "resistive", "thermal conductivity"],
    rangePresets: [[0, 100]],
    accuracyType: "absolute", accuracyAbsRange: [0.5, 2.0],
    outputType: "analog", manufacturers: [
      { name: "Vaisala", models: ["HMP110", "HMT330", "HMT120"] },
      { name: "Rotronic", models: ["HC2A", "HygroClip2"] },
      { name: "Honeywell", models: ["HIH8000"] },
    ],
  },
  {
    key: "level", unit: "m", count: 3, abbrev: "LT",
    technologies: ["radar", "ultrasonic", "hydrostatic", "capacitive"],
    rangePresets: [[0, 5], [0, 10]],
    accuracyType: "percent_of_full_scale", accuracyPctRange: [0.1, 0.5],
    outputType: "analog", manufacturers: [
      { name: "Endress+Hauser", models: ["Micropilot FMR50", "Levelflex FMP51"] },
      { name: "Siemens", models: ["Sitrans LR250"] },
      { name: "VEGA", models: ["VEGAPULS 64", "VEGAFLEX 81"] },
    ],
  },
  {
    key: "force", unit: "N", count: 3, abbrev: "FC",
    technologies: ["strain gauge", "piezoelectric"],
    rangePresets: [[0, 5000], [0, 20000]],
    accuracyType: "percent_of_full_scale", accuracyPctRange: [0.02, 0.2],
    outputType: "analog", manufacturers: [
      { name: "HBM", models: ["C6A", "U10M"] },
      { name: "Interface", models: ["1200 Standard Precision"] },
    ],
  },
  {
    key: "torque", unit: "Nm", count: 2, abbrev: "TQ",
    technologies: ["strain gauge", "magnetoelastic"],
    rangePresets: [[0, 500], [0, 1000]],
    accuracyType: "percent_of_full_scale", accuracyPctRange: [0.05, 0.3],
    outputType: null, manufacturers: [
      { name: "HBM", models: ["T40B"] },
      { name: "Interface", models: ["T8"] },
    ],
  },
  {
    key: "mass", unit: "kg", count: 2, abbrev: "WT",
    technologies: ["strain gauge", "electromagnetic force restoration"],
    rangePresets: [[0, 50], [0, 1000]],
    accuracyType: "percent_of_full_scale", accuracyPctRange: [0.01, 0.05],
    outputType: null, manufacturers: [
      { name: "Mettler Toledo", models: ["XPR205", "IND560"] },
      { name: "Sartorius", models: ["Cubis II"] },
    ],
  },
  {
    key: "voltage", unit: "V", count: 2, abbrev: "VT",
    technologies: ["resistive divider", "isolation amplifier"],
    rangePresets: [[0, 10], [0, 300]],
    accuracyType: "percent_of_reading", accuracyPctRange: [0.02, 0.1],
    outputType: null, manufacturers: [
      { name: "Fluke", models: ["8846A", "789 ProcessMeter"] },
      { name: "Keysight", models: ["34465A", "U1273A"] },
    ],
  },
  {
    key: "current", unit: "A", count: 2, abbrev: "CT",
    technologies: ["shunt resistor", "hall effect"],
    rangePresets: [[0, 20], [0, 100]],
    accuracyType: "percent_of_reading", accuracyPctRange: [0.05, 0.2],
    outputType: null, manufacturers: [
      { name: "Fluke", models: ["789 ProcessMeter"] },
      { name: "National Instruments", models: ["PXIe-4139"] },
    ],
  },
  {
    key: "resistance", unit: "Ω", count: 2, abbrev: "RT",
    technologies: ["four wire", "three wire"],
    rangePresets: [[0, 400], [0, 10000]],
    accuracyType: "percent_of_reading", accuracyPctRange: [0.05, 0.2],
    outputType: null, manufacturers: [
      { name: "Keysight", models: ["34465A"] },
      { name: "Yokogawa", models: ["WT310"] },
    ],
  },
  {
    key: "displacement", unit: "mm", count: 3, abbrev: "DT",
    technologies: ["laser", "LVDT", "eddy current"],
    rangePresets: [[0, 100], [0, 500]],
    accuracyType: "percent_of_full_scale", accuracyPctRange: [0.01, 0.1],
    outputType: null, manufacturers: [
      { name: "Keyence", models: ["LK-G5000", "IL-600"] },
      { name: "Micro-Epsilon", models: ["optoNCDT 1420"] },
    ],
  },
  {
    key: "angle", unit: "°", count: 2, abbrev: "AT",
    technologies: ["optical encoder", "magnetic encoder", "resolver"],
    rangePresets: [[0, 90], [0, 360]],
    accuracyType: "absolute", accuracyAbsRange: [0.01, 0.3],
    outputType: null, manufacturers: [
      { name: "Renishaw", models: ["RESOLUTE"] },
      { name: "Heidenhain", models: ["ERN 1387"] },
    ],
  },
  {
    key: "angular_velocity", unit: "rpm", count: 2, abbrev: "ST",
    technologies: ["optical encoder", "hall effect", "tachometer"],
    rangePresets: [[0, 3000], [0, 10000]],
    accuracyType: "percent_of_reading", accuracyPctRange: [0.1, 0.5],
    outputType: null, manufacturers: [
      { name: "Monarch Instrument", models: ["ROLS-W"] },
      { name: "Compact Instruments", models: ["Tach-Trig-2"] },
    ],
  },
  {
    key: "acceleration", unit: "m/s²", count: 3, abbrev: "AC",
    technologies: ["piezoelectric", "MEMS", "piezoresistive"],
    rangePresets: [[0, 50], [0, 500]],
    accuracyType: "percent_of_reading", accuracyPctRange: [1.0, 3.0],
    outputType: null, manufacturers: [
      { name: "PCB Piezotronics", models: ["352C33"] },
      { name: "Bruel & Kjaer", models: ["4507 B"] },
    ],
  },
];
const TOTAL_SENSORS = QUANTITIES.reduce((s, q) => s + q.count, 0); // 42

const DAQ_TYPES = [
  { daq_type: "USB", manufacturers: [{ name: "National Instruments", models: ["USB-6341"] }, { name: "Honeywell", models: ["DL06"] }] },
  { daq_type: "Wireless", manufacturers: [{ name: "ABB", models: ["Wireless HART Bridge"] }] },
  { daq_type: "Ethernet", manufacturers: [{ name: "Siemens", models: ["SIMATIC ET 200SP"] }, { name: "Yokogawa", models: ["DX1000"] }] },
  { daq_type: "PCIe", manufacturers: [{ name: "National Instruments", models: ["PCIe-6363"] }] },
  { daq_type: "PXI", manufacturers: [{ name: "National Instruments", models: ["PXIe-6368"] }] },
];
const TOTAL_DAQS = 8;
const TOTAL_ASSETS = TOTAL_SENSORS + TOTAL_DAQS; // 50

// ---------------------------------------------------------------------------
// Asset generation
// ---------------------------------------------------------------------------

const assets = [];
const assetSpecByAssetPk = new Map(); // asset.id -> { quantitySpec, channel, span }

let sensorSerial = 40000;
for (const q of QUANTITIES) {
  for (let i = 0; i < q.count; i++) {
    const isReference = i === 0 && ["temperature", "pressure", "voltage"].includes(q.key);
    const manuf = choice(q.manufacturers);
    const model = choice(manuf.models);
    const [rangeMin, rangeMax] = choice(q.rangePresets);
    const span = rangeMax - rangeMin;
    const location = isReference ? metrologyLab : choice(workingLocations);
    const areaTag = choice(AREA_TAGS);
    const assetCode = nextAssetCode();
    const assetPk = genId();

    let accuracyValue;
    let accuracyUnit = null;
    if (q.accuracyType === "absolute") {
      accuracyValue = round(randFloat(...q.accuracyAbsRange) * (isReference ? 0.15 : 1), 4);
      accuracyUnit = q.unit;
    } else {
      accuracyValue = round(randFloat(...q.accuracyPctRange) * (isReference ? 0.15 : 1), 4);
    }

    const channel = {
      id: genId(),
      asset_id: assetPk,
      channel_id: q.abbrev,
      physical_quantity: q.key,
      measurement_type: null,
      unit: q.unit,
      technology: choice(q.technologies),
      measurement_min: rangeMin,
      measurement_max: rangeMax,
      accuracy_value: accuracyValue,
      accuracy_type: q.accuracyType,
      accuracy_unit: accuracyUnit,
      resolution: round(span * 0.0005, 5),
      resolution_unit: q.unit,
      measurement_uncertainty: isReference ? round(span * 0.0002, 5) : null,
      uncertainty_unit: isReference ? q.unit : null,
      confidence_level: isReference ? 95.0 : null,
      coverage_factor: isReference ? 2.0 : null,
      drift_rate: null,
      drift_unit: null,
      sensitivity: null,
      sensitivity_unit: null,
      response_time_ms: q.outputType === "analog" ? randInt(100, 2000) : null,
      bandwidth_hz: null,
      output_signal_min: q.outputType === "analog" ? 4 : null,
      output_signal_max: q.outputType === "analog" ? 20 : null,
      output_signal_unit: q.outputType === "analog" ? "mA" : null,
      output_type: q.outputType,
      calibration_role: isReference ? "reference" : "working",
      criticality: choice(CRITICALITY),
      calibration_method_id: null,
      calibration_method_name: null,
      calibration_interval: isReference ? 6 : 12,
      is_active: true,
      created_at: isoDateTime(addMonths(NOW, -randInt(14, 30))),
      updated_at: isoDateTime(addMonths(NOW, -randInt(0, 6))),
    };

    const asset = {
      id: assetPk,
      asset_id: assetCode,
      asset_type: "sensor",
      name: `${areaTag} ${q.abbrev}-${String(idCounter).slice(-2)}`,
      description: null,
      manufacturer: manuf.name,
      model,
      serial_number: `${manuf.name.slice(0, 2).toUpperCase()}-${sensorSerial++}`,
      manufacturer_part_number: null,
      location_id: location.id,
      firmware_version: null,
      power_supply: q.outputType === "analog" ? "24 VDC" : null,
      power_consumption_w: q.outputType === "analog" ? randInt(1, 10) : null,
      dimensions: null,
      weight_kg: null,
      mounting_type: choice(MOUNTING),
      connection_type: choice(CONNECTION_TYPES),
      displays_readings: rand() < 0.3,
      ip_rating: rand() < 0.6 ? choice(IP_RATINGS) : null,
      hazardous_area_rating: null,
      operating_temperature_min: -20.0,
      operating_temperature_max: 80.0,
      operating_humidity_min: null,
      operating_humidity_max: null,
      health_score: 80, // recomputed below once calibrations exist
      price_eur: round(randFloat(300, 8000), 2),
      purchase_date: isoDate(addMonths(NOW, -randInt(14, 30))),
      warranty_expiry_date: isoDate(addMonths(NOW, randInt(6, 24))),
      owner: (isReference ? teamByName["Metrology Lab"] : teamByName["Instrumentation & Controls"]).id,
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
      created_at: channel.created_at,
      updated_at: channel.updated_at,
      sensor_channels: [channel],
      daq_details: null,
      site_name: null, location_name: null, location_code: null, location_description: null,
      location_latitude: null, location_longitude: null,
      calibration_status: "not_calibrated", next_due_at: null, last_calibration_date: null,
      calibration_count: 0, subtype: q.key, technology: channel.technology, owner_name: null,
      calibration_health_score: null,
    };

    assets.push(asset);
    assetSpecByAssetPk.set(assetPk, { quantitySpec: q, channel, span, isReference });
  }
}

let daqSerial = 50000;
for (let i = 0; i < TOTAL_DAQS; i++) {
  const daqDef = DAQ_TYPES[i % DAQ_TYPES.length];
  const manuf = choice(daqDef.manufacturers);
  const model = choice(manuf.models);
  const location = choice(workingLocations.concat([metrologyLab]));
  const areaTag = choice(AREA_TAGS);
  const assetCode = nextAssetCode();
  const assetPk = genId();

  const daqDetails = {
    id: genId(),
    asset_id: assetPk,
    daq_type: daqDef.daq_type,
    input_channels: randInt(4, 32),
    output_channels: randInt(0, 4),
    input_signal_types: "4-20mA, 0-10V, Thermocouple",
    output_signal_types: rand() < 0.5 ? "Analog, Digital" : null,
    sampling_rate_hz: choice([1.0, 1000.0, 10000.0, 500000.0]),
    per_channel_sampling_rate_hz: null,
    adc_resolution_bits: choice([12, 16, 24]),
    adc_type: "successive_approximation",
    input_voltage_range_min: -10.0,
    input_voltage_range_max: 10.0,
    noise_floor_uv_rms: round(randFloat(1, 10), 2),
    dynamic_range_db: round(randFloat(80, 100), 1),
    synchronization_supported: rand() < 0.5,
    clock_source: "internal",
    time_sync_precision_ns: null,
    jitter_ns: null,
    communication_protocol: daqDef.daq_type === "Wireless" ? "HART" : daqDef.daq_type,
    interface_type: daqDef.daq_type,
    trigger_modes: null,
    input_impedance_ohm: null,
    is_active: true,
  };

  const asset = {
    id: assetPk,
    asset_id: assetCode,
    asset_type: "daq",
    name: `${areaTag} DAQ-${String(idCounter).slice(-2)}`,
    description: null,
    manufacturer: manuf.name,
    model,
    serial_number: `${manuf.name.slice(0, 2).toUpperCase()}-${daqSerial++}`,
    manufacturer_part_number: null,
    location_id: location.id,
    firmware_version: `v${randInt(1, 4)}.${randInt(0, 9)}`,
    power_supply: "24 VDC",
    power_consumption_w: randInt(3, 15),
    dimensions: null,
    weight_kg: null,
    mounting_type: choice(MOUNTING),
    connection_type: null,
    displays_readings: false,
    ip_rating: rand() < 0.4 ? choice(IP_RATINGS) : null,
    hazardous_area_rating: null,
    operating_temperature_min: -20.0,
    operating_temperature_max: 70.0,
    operating_humidity_min: null,
    operating_humidity_max: null,
    health_score: 90,
    price_eur: round(randFloat(500, 6000), 2),
    purchase_date: isoDate(addMonths(NOW, -randInt(14, 30))),
    warranty_expiry_date: isoDate(addMonths(NOW, randInt(6, 24))),
    owner: teamByName["Metrology Lab"].id,
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
    created_at: isoDateTime(addMonths(NOW, -randInt(14, 30))),
    updated_at: isoDateTime(addMonths(NOW, -randInt(0, 6))),
    sensor_channels: [],
    daq_details: daqDetails,
    site_name: null, location_name: null, location_code: null, location_description: null,
    location_latitude: null, location_longitude: null,
    calibration_status: "not_calibrated", next_due_at: null, last_calibration_date: null,
    calibration_count: 0, subtype: daqDef.daq_type, technology: null, owner_name: null,
    calibration_health_score: null,
  };

  assets.push(asset);
  assetSpecByAssetPk.set(assetPk, { quantitySpec: null, channel: null, span: null, isReference: false });
}

// Reference-standard asset ids per quantity, for internal_reference_asset_id links.
const referenceAssetIdByQuantity = new Map();
for (const a of assets) {
  const spec = assetSpecByAssetPk.get(a.id);
  if (spec?.isReference) referenceAssetIdByQuantity.set(spec.quantitySpec.key, a.id);
}

// ---------------------------------------------------------------------------
// Calibrations + points + Health snapshots
// ---------------------------------------------------------------------------

const calibrations = [];
const calibrationPoints = {}; // calibration id -> CalibrationPoint[]
const healthSnapshots = {}; // asset id -> AssetHealthResponse

const shuffledAssets = shuffled(assets);
const fewCalAssetIds = new Set(shuffledAssets.slice(0, 8).map((a) => a.id));

// Quality tiers — deliberately vary calibration quality/drift so health
// scores/stability classifications span the full range the UI can show,
// instead of every asset looking uniformly perfect.
const nonReferenceSensors = shuffled(assets.filter((a) => assetSpecByAssetPk.get(a.id)?.quantitySpec && !assetSpecByAssetPk.get(a.id)?.isReference));
const unstableAssetIds = new Set(nonReferenceSensors.slice(0, 4).map((a) => a.id));
const driftingAssetIds = new Set(nonReferenceSensors.slice(4, 9).map((a) => a.id));
function qualityOf(assetId) {
  if (unstableAssetIds.has(assetId)) return "unstable";
  if (driftingAssetIds.has(assetId)) return "drifting";
  return "excellent";
}
const retiredAssetIds = new Set(
  shuffled(assets.filter((a) => !assetSpecByAssetPk.get(a.id)?.isReference)).slice(0, 2).map((a) => a.id),
);

function buildHysteresisAdjustedGroup(ref, fitted) {
  const rounded = ref.map((r) => Math.round(r * 1e6) / 1e6);
  const groups = new Map();
  rounded.forEach((r, i) => {
    const g = groups.get(r) ?? [];
    g.push(fitted[i]);
    groups.set(r, g);
  });
  let maxSpan = 0;
  let found = false;
  for (const values of groups.values()) {
    if (values.length >= 2) {
      found = true;
      maxSpan = Math.max(maxSpan, Math.max(...values) - Math.min(...values));
    }
  }
  return found ? maxSpan : null;
}

for (const asset of assets) {
  const spec = assetSpecByAssetPk.get(asset.id);
  const isSensor = asset.asset_type === "sensor";
  const quality = isSensor ? qualityOf(asset.id) : "excellent";
  const troubled = quality !== "excellent"; // kept for audit-log / notes flavor text below
  const calCount = fewCalAssetIds.has(asset.id) ? 3 : randInt(5, 6);
  const intervalMonths = isSensor && spec.isReference ? 6 : 12;

  const mostRecentOffsetMonths = intervalMonths === 6 ? randInt(1, 7) : randInt(1, 13);
  const mostRecentDate = addDays(addMonths(NOW, -mostRecentOffsetMonths), randInt(-10, 10));

  const calDates = [];
  for (let i = calCount - 1; i >= 0; i--) {
    calDates.push(addDays(addMonths(mostRecentDate, -intervalMonths * i), randInt(-5, 5)));
  }
  calDates.sort((a, b) => a.getTime() - b.getTime());

  const assetCalIds = [];
  const chronologicalSummaries = [];

  calDates.forEach((calDate, k) => {
    const calId = genId();
    assetCalIds.push(calId);
    const isExternal = rand() < 0.4;
    const performer = isExternal ? null : choice(technicianNames);
    const externalLab = isExternal ? choice(["PTB Germany", "NMI Netherlands", "NIST-Traceable Labs Inc.", "Fluke Calibration Services"]) : null;
    const calLocation = isExternal ? null : choice(calibrationLabLocations).id;
    const dueDate = addMonths(calDate, intervalMonths);
    const procList = isSensor ? procedureByQuantity.get(spec.quantitySpec.key) : null;
    const procedure = isSensor && !isExternal && procList && rand() < 0.7 ? choice(procList) : null;
    const refAssetId = isSensor && !isExternal && rand() < 0.5 ? (referenceAssetIdByQuantity.get(spec.quantitySpec.key) ?? null) : null;

    let record = {
      id: calId,
      asset_id: asset.id,
      calibration_date: isoDate(calDate),
      due_date: isoDate(dueDate),
      performed_by_name: performer ?? `${externalLab} Technician`,
      performed_by_user_id: performer ? users.find((u) => u.name === performer).id : null,
      external_lab_name: externalLab,
      notes: troubled && k === calDates.length - 1 ? "Elevated drift observed versus previous cycle — recommend shortened interval." : null,
      calibration_file_id: null,
      created_by: DEMO_USER_ID,
      created_at: isoDateTime(calDate),
      sensor_id: isSensor ? spec.channel.id : null,
      calibration_type: isExternal ? "external" : "internal",
      calibration_version: k + 1,
      calibration_interval: intervalMonths,
      tolerance_criteria: null,
      internal_reference_asset_id: refAssetId,
      internal_procedure_id: procedure ? procedure.id : null,
      external_lab_certificate_number: isExternal ? `CERT-${calDate.getUTCFullYear()}-${randInt(1000, 9999)}` : null,
      daq_id: !isSensor ? asset.id : null,
      calibration_data_id: null,
      calibration_location_id: calLocation,
      temperature: round(randNormal(21, 1.5), 1),
      humidity: round(randNormal(48, 5), 1),
      pressure: round(randNormal(101325, 150), 0),
      poly_order: null, poly_coefficients: null, range_min: null, range_max: null,
      r_squared: null, rmse: null, standard_error: null, max_error: null, full_scale_error: null,
      non_linearity: null, repeatability: null, hysteresis: null,
      distribution_type: null, confidence_level: null, coverage_factor: null,
      combined_uncertainty: null, expanded_uncertainty: null,
      valid_range_min: null, valid_range_max: null,
      uncertainty_budget: null, effective_degrees_of_freedom: null, poly_coefficients_covariance: null,
      decision_rule: null, conformity_statement: null,
      is_active: true, voided_at: null, voided_by: null, void_reason: null,
    };

    if (isSensor) {
      const { channel, span } = spec;
      const { measurement_min: rangeMin, measurement_max: rangeMax } = channel;
      const outputAnalog = channel.output_type === "analog";
      const baseSlope = outputAnalog ? (channel.output_signal_max - channel.output_signal_min) / span : 1;
      const baseIntercept = outputAnalog ? channel.output_signal_min - baseSlope * rangeMin : 0;

      // Cumulative gain/offset drift + per-point noise, tuned per quality tier so the
      // resulting drift-vs-time trend (evaluated by health-engine.mjs) lands in the
      // intended stability bucket:
      //   excellent — tiny, monotonic drift dominates over noise -> high R², "Stable"
      //   drifting  — moderate, monotonic drift, magnitude in the 0.5-2% FS/yr band -> "Drifting"
      //   unstable  — large and/or non-monotonic (sign-flipping) drift + noisy fits -> low R² or
      //               large magnitude -> "Unstable"
      // Reference-grade standards are held to a much tighter tolerance than working
      // instruments (see accuracyValue scaling above) — scale their synthetic drift/noise
      // down to match, so reference assets don't spuriously fail their own tight spec.
      const referenceFactor = spec.isReference ? 0.15 : 1;
      const gainDrift = 1 + { excellent: 0.00015, drifting: 0.0022, unstable: 0.004 }[quality] * k * referenceFactor;
      const offsetSign = quality === "unstable" && k % 2 === 1 ? -0.4 : 1;
      const offsetDrift = { excellent: 0.0002, drifting: 0.0028, unstable: 0.006 }[quality] * span * k * offsetSign * referenceFactor;
      const noiseSigma = span * { excellent: 0.00025, drifting: 0.0012, unstable: 0.01 }[quality] * referenceFactor;
      const hystGapEngUnits = quality !== "excellent" ? span * randFloat(0.006, 0.02) * referenceFactor : 0;

      const fractions = [0, 0.25, 0.5, 0.75, 1.0];
      const sweeps = quality !== "excellent"
        ? [...fractions, ...[0.75, 0.5, 0.25, 0].map((f) => ({ f, descending: true }))].map((f) =>
            typeof f === "object" ? f : { f, descending: false })
        : fractions.map((f) => ({ f, descending: false }));

      const refValues = [];
      const measValues = [];
      for (const s of sweeps) {
        const refVal = rangeMin + s.f * span;
        const idealMeasured = baseSlope * refVal * gainDrift + baseIntercept + offsetDrift;
        const hystShift = s.descending ? hystGapEngUnits * baseSlope : 0;
        const noisy = idealMeasured + hystShift + randNormal(0, noiseSigma * (outputAnalog ? baseSlope : 1));
        refValues.push(round(refVal, 5));
        measValues.push(round(noisy, 6));
      }

      const { coefficients, covariance } = polyfit(measValues, refValues, 1);
      const fitted = measValues.map((m) => polyval(coefficients, m));
      const residuals = refValues.map((r, i) => r - fitted[i]);
      const n = refValues.length;
      const kParams = 2;
      const ssRes = residuals.reduce((s, r) => s + r * r, 0);
      const refMean = refValues.reduce((s, r) => s + r, 0) / n;
      const ssTot = refValues.reduce((s, r) => s + (r - refMean) ** 2, 0);
      const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 1;
      const rmse = Math.sqrt(ssRes / n);
      const standardError = Math.sqrt(ssRes / Math.max(n - kParams, 1));
      const maxError = Math.max(...residuals.map((r) => Math.abs(r)));
      const fullScaleError = round((maxError / span) * 100, 4);
      const hysteresis = troubled ? buildHysteresisAdjustedGroup(refValues, fitted) : null;

      const refStdUncertainty = span * 0.0006; // small Type B guess (reference standard cert)
      const stdResidual = Math.sqrt(ssRes / Math.max(n - 1, 1));
      const combinedUncertainty = Math.sqrt(stdResidual ** 2 + refStdUncertainty ** 2);
      const expandedUncertainty = combinedUncertainty * 2;

      const accuracyValue = channel.accuracy_value;
      const accuracyType = channel.accuracy_type;
      let tolerance = null;
      if (accuracyType === "percent_of_full_scale") tolerance = (accuracyValue / 100) * span;
      else if (accuracyType === "percent_of_reading") tolerance = (accuracyValue / 100) * refMean;
      else tolerance = accuracyValue;
      const passed = maxError <= tolerance;

      record = {
        ...record,
        poly_order: 1,
        poly_coefficients: coefficients.map((c) => round(c, 8)),
        range_min: round(rangeMin, 5), range_max: round(rangeMax, 5),
        r_squared: round(rSquared, 6), rmse: round(rmse, 8), standard_error: round(standardError, 8),
        max_error: round(maxError, 8), full_scale_error: fullScaleError,
        non_linearity: round(randFloat(...{ excellent: [0.01, 0.08], drifting: [0.1, 0.4], unstable: [0.3, 1.2] }[quality]), 4),
        repeatability: null,
        hysteresis: hysteresis != null ? round(hysteresis, 8) : null,
        distribution_type: "normal", confidence_level: 95.0, coverage_factor: 2.0,
        combined_uncertainty: round(combinedUncertainty, 8), expanded_uncertainty: round(expandedUncertainty, 8),
        valid_range_min: round(Math.min(...refValues), 5), valid_range_max: round(Math.max(...refValues), 5),
        uncertainty_budget: [
          {
            source: "fit_residuals", description: "Type A: standard deviation of calibration-fit residuals",
            value: round(stdResidual, 8), distribution: "normal", divisor: 1.0,
            standard_uncertainty: round(stdResidual, 8), degrees_of_freedom: n - kParams > 0 ? n - kParams : null,
          },
          {
            source: "reference_standard", description: "Type B: uncertainty of the reference standard used for this calibration",
            value: round(refStdUncertainty * 2, 8), distribution: "normal", divisor: 2.0,
            standard_uncertainty: round(refStdUncertainty, 8), degrees_of_freedom: null,
          },
        ],
        effective_degrees_of_freedom: n - kParams > 0 ? n - kParams : null,
        poly_coefficients_covariance: covariance,
        decision_rule: "simple_acceptance",
        conformity_statement: {
          decision_rule: "simple_acceptance",
          specification: accuracyType === "percent_of_full_scale" ? `±${accuracyValue}% of full scale`
            : accuracyType === "percent_of_reading" ? `±${accuracyValue}% of reading`
            : `±${accuracyValue} (absolute)`,
          expanded_uncertainty_applied: null,
          passed,
          reason: null,
        },
      };

      calibrationPoints[calId] = refValues.map((refVal, i) => ({
        id: genId(),
        calibration_id: calId,
        point_index: i,
        reference_value: refVal,
        measured_value: measValues[i],
        calculated_value: round(fitted[i], 6),
        residual_abs: round(residuals[i], 8),
        residual_pct: span > 0 ? round((residuals[i] / span) * 100, 4) : 0,
        reference_unit: channel.unit,
        measured_unit: outputAnalog ? channel.output_signal_unit : channel.unit,
        created_at: isoDateTime(calDate),
      }));

      chronologicalSummaries.push({
        id: calId, calibration_date: calDate, performed_by_name: record.performed_by_name,
        poly_coefficients: record.poly_coefficients, valid_range_min: record.valid_range_min, valid_range_max: record.valid_range_max,
        r_squared: record.r_squared, rmse: record.rmse, max_error: record.max_error,
        expanded_uncertainty: record.expanded_uncertainty, hysteresis: record.hysteresis,
        non_linearity: record.non_linearity, repeatability: record.repeatability,
        calibration_interval: record.calibration_interval, calibration_version: record.calibration_version,
      });
    } else {
      calibrationPoints[calId] = [];
      chronologicalSummaries.push({
        id: calId, calibration_date: calDate, performed_by_name: record.performed_by_name,
        poly_coefficients: null, valid_range_min: null, valid_range_max: null,
        r_squared: null, rmse: null, max_error: null, expanded_uncertainty: null, hysteresis: null,
        non_linearity: null, repeatability: null,
        calibration_interval: record.calibration_interval, calibration_version: record.calibration_version,
      });
    }

    calibrations.push(record);
  });

  // --- Enrich asset from its calibrations (mirrors apps/api/app/repositories/asset.py) ---
  const activeCals = assetCalIds.map((id) => calibrations.find((c) => c.id === id));
  const lastCalDate = activeCals.reduce((max, c) => (c.calibration_date > max ? c.calibration_date : max), activeCals[0].calibration_date);
  const latestDue = activeCals.reduce((max, c) => (c.due_date > max ? c.due_date : max), activeCals[0].due_date);
  const todayIso = isoDate(NOW);
  const soonIso = isoDate(addDays(NOW, 30));
  let calStatus;
  if (retiredAssetIds.has(asset.id)) calStatus = "retired";
  else if (latestDue < todayIso) calStatus = "expired";
  else if (latestDue <= soonIso) calStatus = "due_soon";
  else calStatus = "valid";

  asset.calibration_status = calStatus;
  asset.next_due_at = latestDue;
  asset.last_calibration_date = lastCalDate;
  asset.calibration_count = activeCals.length;

  const channelUnit = isSensor ? spec.channel.unit : "";
  const span = isSensor ? spec.span : null;
  const accuracyValue = isSensor ? spec.channel.accuracy_value : null;
  const accuracyType = isSensor ? spec.channel.accuracy_type : null;
  const healthResponse = computeAssetHealth(chronologicalSummaries, channelUnit, span, accuracyValue, accuracyType);
  healthSnapshots[asset.id] = healthResponse;

  const computedHealthScore = healthResponse.overview ? Math.round(healthResponse.overview.health_score) : null;
  asset.calibration_health_score = computedHealthScore;
  asset.health_score = computedHealthScore ?? 75;

  if (retiredAssetIds.has(asset.id)) {
    asset.is_active = false;
    asset.retired_at = isoDateTime(addDays(NOW, -randInt(2, 60)));
    asset.retired_reason = "Decommissioned — replaced by newer instrumentation.";
  }
}

// ---------------------------------------------------------------------------
// Stored files (metadata only — no real backend to hold bytes)
// ---------------------------------------------------------------------------

const storedFiles = [];
const filedAssets = shuffled(assets.filter((a) => a.asset_type === "sensor")).slice(0, 10);
filedAssets.forEach((asset, i) => {
  storedFiles.push({
    id: genId(),
    original_filename: i % 2 === 0 ? `Calibration-Certificate-${asset.asset_id}.pdf` : `${asset.manufacturer.replace(/\s+/g, "")}-${asset.model.replace(/\s+/g, "")}-Datasheet.pdf`,
    content_type: "application/pdf",
    size_bytes: randInt(80_000, 1_800_000),
    entity_type: "asset",
    entity_id: asset.id,
    step_index: null,
    uploaded_by: DEMO_USER_ID,
    created_at: isoDateTime(addMonths(NOW, -randInt(1, 18))),
    url: null,
  });
});
procedures.slice(0, 3).forEach((proc, i) => {
  storedFiles.push({
    id: genId(),
    original_filename: `${proc.proc_id}-reference-sheet.pdf`,
    content_type: "application/pdf",
    size_bytes: randInt(50_000, 400_000),
    entity_type: "procedure",
    entity_id: proc.id,
    step_index: i === 0 ? 0 : null,
    uploaded_by: DEMO_USER_ID,
    created_at: isoDateTime(addMonths(NOW, -randInt(1, 12))),
    url: null,
  });
});

// ---------------------------------------------------------------------------
// Audit logs (150+, backdated ~24 months)
// ---------------------------------------------------------------------------

const auditLogs = [];
function pushAudit({ actor, action, entityType, entityId, entityAssetId, createdAt, before = null, after = null }) {
  auditLogs.push({
    id: genId(),
    actor_id: actor ? actor.id : null,
    actor_email: actor ? actor.email : (action.startsWith("system.") || action.includes("flagged") ? "system" : "api:ci-runner"),
    actor_name: actor ? actor.name : null,
    actor_role: actor ? actor.role : null,
    action,
    entity_type: entityType,
    entity_id: entityId,
    entity_asset_id: entityAssetId,
    before_state: before,
    after_state: after,
    ip_address: actor ? `10.20.${randInt(0, 254)}.${randInt(1, 254)}` : null,
    created_at: isoDateTime(createdAt),
  });
}

for (const asset of assets) {
  pushAudit({
    actor: demoUser, action: "asset.created", entityType: "asset", entityId: asset.id,
    entityAssetId: asset.asset_id, createdAt: new Date(asset.created_at),
  });
}
for (const cal of calibrations) {
  const actor = cal.performed_by_user_id ? users.find((u) => u.id === cal.performed_by_user_id) : null;
  pushAudit({
    actor, action: "calibration.recorded", entityType: "calibration", entityId: cal.id,
    entityAssetId: assets.find((a) => a.id === cal.asset_id).asset_id, createdAt: new Date(cal.created_at),
  });
}
for (const asset of assets) {
  if (retiredAssetIds.has(asset.id)) {
    pushAudit({
      actor: demoUser, action: "asset.retired", entityType: "asset", entityId: asset.id,
      entityAssetId: asset.asset_id, createdAt: new Date(asset.retired_at),
      before: { is_active: true }, after: { is_active: false, retired_reason: asset.retired_reason },
    });
  }
  if (unstableAssetIds.has(asset.id)) {
    pushAudit({
      actor: null, action: "asset.flagged_low_health", entityType: "asset", entityId: asset.id,
      entityAssetId: asset.asset_id, createdAt: addDays(NOW, -randInt(1, 40)),
    });
  }
}
// A round of asset moves.
shuffled(assets).slice(0, 12).forEach((asset) => {
  const fromLoc = choice(workingLocations);
  pushAudit({
    actor: choice(users.filter((u) => u.role !== "viewer")), action: "asset.moved", entityType: "asset", entityId: asset.id,
    entityAssetId: asset.asset_id, createdAt: addDays(NOW, -randInt(5, 400)),
    before: { location_id: fromLoc.id }, after: { location_id: asset.location_id },
  });
});
// Procedure edits.
procedures.forEach((proc) => {
  pushAudit({
    actor: users.find((u) => u.name === proc.author) ?? demoUser, action: "procedure.created", entityType: "procedure",
    entityId: proc.id, entityAssetId: null, createdAt: new Date(proc.created_at),
  });
  if (rand() < 0.5) {
    pushAudit({
      actor: users.find((u) => u.name === proc.author) ?? demoUser, action: "procedure.updated", entityType: "procedure",
      entityId: proc.id, entityAssetId: null, createdAt: addDays(NOW, -randInt(5, 200)),
    });
  }
});
// User logins, spread over the last ~60 days.
for (let i = 0; i < 30; i++) {
  pushAudit({
    actor: choice(users), action: "user.login", entityType: "user", entityId: choice(users).id,
    entityAssetId: null, createdAt: addDays(NOW, -randInt(0, 60)),
  });
}
// A few voided/restored calibrations for traceability variety.
shuffled(calibrations.filter((c) => c.calibration_version > 1)).slice(0, 3).forEach((cal) => {
  pushAudit({
    actor: demoUser, action: "calibration.voided", entityType: "calibration", entityId: cal.id,
    entityAssetId: assets.find((a) => a.id === cal.asset_id).asset_id, createdAt: addDays(new Date(cal.created_at), 2),
    before: { is_active: true }, after: { is_active: false },
  });
});
// Org/team edits.
pushAudit({ actor: demoUser, action: "organization.updated", entityType: "organization", entityId: orgId, entityAssetId: null, createdAt: addMonths(NOW, -3) });
teams.forEach((t) => {
  pushAudit({ actor: demoUser, action: "team.created", entityType: "team", entityId: t.id, entityAssetId: null, createdAt: new Date(t.created_at) });
});

auditLogs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

// ---------------------------------------------------------------------------
// Email settings
// ---------------------------------------------------------------------------

const emailSettings = {
  smtp_host: "smtp.meridiancal.example",
  smtp_port: 587,
  smtp_username: "notifications@meridiancal.example",
  has_smtp_password: true,
  smtp_use_tls: true,
  from_email: "notifications@meridiancal.example",
  from_name: "Meridian Calibration Labs",
  enabled: true,
  calibration_reminder_days: 30,
  updated_at: isoDateTime(addMonths(NOW, -2)),
};

// ---------------------------------------------------------------------------
// Assemble + write
// ---------------------------------------------------------------------------

const dataset = {
  generatedAt: isoDateTime(NOW),
  demoUserId: DEMO_USER_ID,
  organization,
  users,
  teams,
  locations,
  procedures,
  assets,
  calibrations,
  calibrationPoints,
  auditLogs,
  storedFiles,
  healthSnapshots,
  emailSettings,
};

writeFileSync(OUTPUT_PATH, JSON.stringify(dataset, null, 2) + "\n", "utf-8");

// eslint-disable-next-line no-console
console.log(`Wrote ${assets.length} assets, ${calibrations.length} calibrations, ${auditLogs.length} audit logs to ${OUTPUT_PATH}`);
