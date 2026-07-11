# Open Gauge Database Schema

Open Gauge uses PostgreSQL as its authoritative source of truth. The schema is designed around **traceability, auditability, and historical integrity** — calibration data is immutable; records are soft-deleted, never hard-deleted; every important action is logged.

---

## Design Principles

| Principle | Implementation |
|---|---|
| Traceability | Every table that owns data has `created_at`, `updated_at`, `created_by` |
| Immutability | Calibration records are append-only — no `updated_at`, no overwrite |
| Soft deletion | Use `is_active` + `archived_at` instead of hard deletes |
| Auditability | `audit_logs` captures actor, action, entity, before/after state |
| Optimistic concurrency | `version` integer on mutable critical entities (assets) |
| No binary blobs | Files stored in MinIO; PostgreSQL holds metadata only |
| UUID primary keys | Prevent entity-count enumeration; enable offline ID generation |

> **Note on current state:** The initial implementation uses integer PKs and denormalized `site_name`/`lab_name` strings on `assets`. This schema describes the target state. Migration from current → target will be done incrementally via Alembic.

---

## Entity Hierarchy

```
Organization
└── Location (self-referencing hierarchy: site → building → lab → bench…)
    └── Asset
        ├── Sensor (subtype, multi-channel via sensor_channels)
        │   └── CalibrationMethod (FK — calibration procedure for the channel)
        ├── DAQ (subtype)
        ├── Calibration (append-only)
        │   ├── CalibrationCoefficients
        │   └── Certificate
        │       └── File
        └── File (datasheets, images, pinout diagrams, schematics)

asset_locations      →  movement history (asset × location × timestamp)
calibration_methods  →  reusable calibration procedure definitions
```

---

## Tables

---

### `organizations`

The root grouping. Represents a company, customer, or enterprise running Open Gauge.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `name` | VARCHAR(255) | NOT NULL | Display name |
| `description` | TEXT | nullable | |
| `is_active` | BOOLEAN | NOT NULL, default true | Soft delete flag |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `locations`

Unified hierarchical location table. Replaces the former `sites` + `laboratories` split. Any node in the tree can be a site, building, floor, lab, bench, etc.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `organization_id` | UUID | FK → organizations, NOT NULL | |
| `parent_location_id` | UUID | FK → locations, nullable, indexed | Parent node — null for top-level |
| `name` | VARCHAR(255) | NOT NULL | e.g. "Vienna Plant", "Pressure Lab", "Bench 3" |
| `description` | TEXT | nullable | |
| `location_type` | VARCHAR(255) | NOT NULL | `site`, `building`, `floor`, `laboratory`, `room`, `test_bench`, `production_line`, `warehouse`, `office`, `field`, `vehicle`, `other` |
| `code` | VARCHAR(50) | nullable | Short identifier, e.g. `LAB-PRES-01` — unique per organization |
| `address` | TEXT | nullable | Physical address |
| `latitude` | DECIMAL(10,8) | nullable | |
| `longitude` | DECIMAL(11,8) | nullable | |
| `is_active` | BOOLEAN | NOT NULL, default true | |
| `archived_at` | TIMESTAMPTZ | nullable | |
| `created_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

> **Unique constraint on `code`:** must be enforced as `UNIQUE(organization_id, code)` — a simple column-level UNIQUE would incorrectly block the same code across different organizations.

---

### `asset_locations`

Movement history for assets. Every time an asset changes location a new row is inserted; the current location is the row with the latest `moved_at`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | UUID | FK → assets, NOT NULL, indexed | |
| `location_id` | UUID | FK → locations, NOT NULL, indexed | |
| `moved_at` | TIMESTAMPTZ | NOT NULL, default now() | When the asset arrived at this location |
| `moved_by` | UUID | FK → users, nullable | |
| `reason` | TEXT | nullable | Relocation reason |
| `notes` | TEXT | nullable | |

---

### `users`

Platform users. Supports local credentials and future OAuth/SSO.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `organization_id` | UUID | FK → organizations, nullable | null = superadmin / no org |
| `email` | VARCHAR(255) | NOT NULL, UNIQUE, indexed | |
| `name` | VARCHAR(255) | NOT NULL | Display name |
| `hashed_password` | VARCHAR(255) | nullable | null when auth is delegated (OAuth/SSO) |
| `role` | ENUM | NOT NULL | `superadmin`, `admin`, `technician`, `viewer` |
| `team` | VARCHAR(255) | nullable | |
| `is_active` | BOOLEAN | NOT NULL, default true | |
| `is_superuser` | BOOLEAN | NOT NULL, default false | Bypasses org scoping |
| `last_login_at` | TIMESTAMPTZ | nullable | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

**Role descriptions:**
- `superadmin` — full platform access, manages organizations
- `admin` — manages users and assets within their organization
- `technician` — can record calibrations and upload certificates
- `viewer` — read-only access

---

### `teams`

Organizational teams or groups. Assets can be assigned to a team as the responsible owner.

> **Note:** Schema not yet fully defined. Required because `assets.owner` references this table.

---

### `assets`

Top-level table for all physical assets (sensors and DAQ systems). Subtype-specific fields live in `sensors` or `daq`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | VARCHAR(20) | NOT NULL, UNIQUE, indexed | Human-readable ID, e.g. `OG-00421` |
| `asset_type` | ENUM | NOT NULL | `sensor`, `daq` |
| `name` | VARCHAR(255) | NOT NULL | |
| `description` | TEXT | nullable | |
| `manufacturer` | VARCHAR(255) | NOT NULL | |
| `model` | VARCHAR(255) | NOT NULL | |
| `serial_number` | VARCHAR(255) | nullable | |
| `manufacturer_part_number` | VARCHAR(255) | nullable | |
| `location_id` | UUID | FK → locations, nullable | Current location (denormalized for fast lookup — keep in sync with `asset_locations`) |
| `owner` | UUID | FK → teams, nullable | Responsible team |
| `datasheet_file_id` | UUID | FK → files, nullable | |
| `datasheet_url` | TEXT | nullable | |
| `firmware_version` | VARCHAR(100) | nullable | |
| `power_supply` | VARCHAR(100) | nullable | e.g. `24 VDC` |
| `power_consumption_w` | INTEGER | nullable | |
| `dimensions` | VARCHAR(100) | nullable | |
| `weight_kg` | DECIMAL(10,3) | nullable | |
| `mounting_type` | VARCHAR(100) | nullable | |
| `connection_type` | VARCHAR(100) | nullable | |
| `displays_readings` | BOOLEAN | NOT NULL, default false | Whether the device has a local display |
| `ip_rating` | VARCHAR(20) | nullable | e.g. `IP67` |
| `hazardous_area_rating` | VARCHAR(100) | nullable | e.g. `ATEX Zone 1` |
| `operating_temperature_min` | DECIMAL(18,8) | nullable | °C |
| `operating_temperature_max` | DECIMAL(18,8) | nullable | °C |
| `operating_humidity_min` | DECIMAL(5,2) | nullable | %RH |
| `operating_humidity_max` | DECIMAL(5,2) | nullable | %RH |
| `health_score` | INTEGER | NOT NULL, default 100 | 0–100 composite score |
| `price_eur` | DECIMAL(12,2) | nullable | |
| `purchase_date` | DATE | nullable | |
| `warranty_expiry_date` | DATE | nullable | |
| `is_active` | BOOLEAN | NOT NULL, default true | |
| `retired_at` | TIMESTAMPTZ | nullable | |
| `retired_by` | UUID | FK → users, nullable | |
| `retired_reason` | TEXT | nullable | |
| `version` | INTEGER | NOT NULL, default 1 | Incremented on each update (optimistic concurrency) |
| `created_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `notes` | TEXT | nullable | |
| `pinout_table` | JSONB | nullable | Array of `{pin_number, name, description}` objects describing connector pinout |
| `pinout_image_id` | UUID | FK → files, nullable | Reference to a pinout diagram image |
| `sensor_image_id` | UUID | FK → files, nullable | Reference to a sensor/instrument photo |
| `sensor_schematic_id` | UUID | FK → files, nullable | Reference to a wiring or block diagram schematic |

---

### `sensors`

Sensor subtype. One row per measurement channel. An asset with `asset_type = sensor` may have multiple rows in this table (one per channel, e.g. Temperature + Humidity for a combo sensor).

> **Constraint note:** `asset_id` is **NOT** UNIQUE here — a single sensor asset can expose multiple channels.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | UUID | FK → assets, NOT NULL, indexed | |
| `channel_id` | VARCHAR(255) | NOT NULL | Channel identifier, e.g. `Temperature`, `Humidity`, `X Axis` |
| `physical_quantity` | VARCHAR(255) | NOT NULL | e.g. `temperature`, `pressure`, `acceleration` |
| `unit` | VARCHAR(50) | NOT NULL | e.g. `°C`, `bar`, `m/s²` |
| `technology` | VARCHAR(255) | nullable | e.g. `RTD`, `strain gauge`, `piezoelectric`, `capacitive` |
| `measurement_min` | DECIMAL(18,8) | nullable | Lower measurement limit |
| `measurement_max` | DECIMAL(18,8) | nullable | Upper measurement limit |
| `accuracy_value` | DECIMAL(18,8) | nullable | |
| `accuracy_type` | VARCHAR(255) | nullable | `absolute`, `percent_of_reading`, `percent_of_span`, `full_scale` |
| `accuracy_unit` | VARCHAR(50) | nullable | |
| `resolution` | DECIMAL(18,8) | nullable | |
| `resolution_unit` | VARCHAR(50) | nullable | |
| `measurement_uncertainty` | DECIMAL(18,8) | nullable | Expanded uncertainty |
| `uncertainty_unit` | VARCHAR(50) | nullable | |
| `confidence_level` | DECIMAL(5,2) | nullable | e.g. `95.00` |
| `coverage_factor` | DECIMAL(5,2) | nullable | e.g. `2.00` (k=2) |
| `drift_rate` | DECIMAL(18,8) | nullable | |
| `drift_unit` | VARCHAR(50) | nullable | e.g. `°C/year`, `%RH/year` |
| `sensitivity` | DECIMAL(18,8) | nullable | |
| `sensitivity_unit` | VARCHAR(100) | nullable | e.g. `mV/V`, `pC/g` |
| `response_time_ms` | DECIMAL(18,8) | nullable | |
| `bandwidth_hz` | DECIMAL(18,8) | nullable | |
| `output_signal_min` | DECIMAL(18,8) | nullable | |
| `output_signal_max` | DECIMAL(18,8) | nullable | |
| `output_signal_unit` | VARCHAR(50) | nullable | e.g. `mA`, `V` |
| `output_type` | VARCHAR(255) | nullable | `analog`, `digital`, `pulse`, `frequency`, `resistance`, `capacitance` |
| `calibration_method_id` | UUID | FK → calibration_methods, nullable, indexed | Procedure used to calibrate this channel |
| `calibration_interval` | INTEGER | nullable | Recommended recalibration interval in days |
| `calibration_role` | VARCHAR(255) | nullable | `working`, `reference`, `transfer`, `master` |
| `criticality` | VARCHAR(255) | nullable | `critical`, `non-critical`, `safety-related` |
| `is_active` | BOOLEAN | NOT NULL, default true | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

**Unique constraint:** `UNIQUE(asset_id, channel_id)` — prevents duplicate channel names on the same asset.

---

### `daq`

Data acquisition system subtype. One row per asset with `asset_type = daq`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | UUID | FK → assets, NOT NULL, UNIQUE | One DAQ config per asset |
| `daq_type` | VARCHAR(255) | NOT NULL | e.g. `USB`, `Ethernet`, `PCIe`, `WiFi` |
| `input_channels` | INTEGER | NOT NULL | |
| `output_channels` | INTEGER | NOT NULL | |
| `input_signal_types` | VARCHAR(255) | nullable | |
| `output_signal_types` | VARCHAR(255) | nullable | |
| `sampling_rate_hz` | DECIMAL(12,4) | nullable | Aggregate sampling rate |
| `per_channel_sampling_rate_hz` | DECIMAL(12,4) | nullable | |
| `adc_resolution_bits` | INTEGER | nullable | |
| `adc_type` | VARCHAR(255) | nullable | `successive_approximation`, `sigma_delta`, `pipeline` |
| `input_voltage_range_min` | DECIMAL(18,8) | nullable | |
| `input_voltage_range_max` | DECIMAL(18,8) | nullable | |
| `input_impedance_ohm` | DECIMAL(18,2) | nullable | |
| `noise_floor_uv_rms` | DECIMAL(18,8) | nullable | |
| `dynamic_range_db` | DECIMAL(10,4) | nullable | |
| `synchronization_supported` | BOOLEAN | NOT NULL, default false | |
| `clock_source` | VARCHAR(255) | nullable | `internal`, `external`, `gps`, `ptp`, `ieee1588` |
| `time_sync_precision_ns` | DECIMAL(18,4) | nullable | |
| `jitter_ns` | DECIMAL(18,4) | nullable | |
| `communication_protocol` | VARCHAR(100) | nullable | e.g. `Modbus`, `OPC UA`, `MQTT` |
| `interface_type` | VARCHAR(100) | nullable | `USB`, `Ethernet`, `PCIe`, `WiFi` |
| `trigger_modes` | VARCHAR(255) | nullable | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `calibration_methods`

Reusable calibration procedure definitions. Describes how to calibrate a sensor channel — the equipment required and the step-by-step procedure. Referenced from `sensors.calibration_method_id`.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `physical_quantity` | VARCHAR(255) | NOT NULL, indexed | e.g. `temperature`, `pressure` — for filtering by measurand |
| `name` | VARCHAR(255) | NOT NULL | Short procedure name, e.g. `PT100 Comparison Calibration` |
| `description` | TEXT | nullable | Full prose description of the procedure |
| `required_equipment` | TEXT | nullable | List of required reference standards and tools |
| `steps` | JSONB | nullable | Ordered array of `{step_number: int, description: str}` objects |
| `created_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `calibrations`

Point-in-time calibration records. **Immutable — never updated after creation.**

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | UUID | FK → assets, NOT NULL, indexed | |
| `calibration_date` | DATE | NOT NULL | When calibration was performed |
| `due_date` | DATE | NOT NULL | Next calibration due date |
| `performed_by_user_id` | UUID | FK → users, nullable | Internal technician |
| `performed_by_name` | VARCHAR(255) | NOT NULL | Denormalized — preserves history if user is deleted |
| `external_lab_name` | VARCHAR(255) | nullable | If done by external lab |
| `external_lab_accreditation` | VARCHAR(255) | nullable | e.g. ISO 17025 cert number |
| `result` | ENUM | NOT NULL | `pass`, `fail`, `conditional_pass` |
| `temperature_c` | DECIMAL(6,2) | nullable | Environmental condition |
| `humidity_pct` | DECIMAL(5,2) | nullable | Environmental condition |
| `pressure_hpa` | DECIMAL(8,2) | nullable | Environmental condition |
| `notes` | TEXT | nullable | |
| `certificate_id` | UUID | FK → certificates, nullable | |
| `calibration_file_id` | UUID | FK → files, nullable | Raw calibration data file |
| `created_by` | UUID | FK → users, NOT NULL | User who recorded this entry |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

> No `updated_at` — calibration records are immutable by design.

---

### `calibration_coefficients`

Correction coefficients derived from a calibration. Stored per channel.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `calibration_id` | UUID | FK → calibrations, NOT NULL, indexed | |
| `channel` | VARCHAR(50) | nullable | Should match `sensors.channel_id` for sensor assets |
| `coefficient_type` | ENUM | NOT NULL | `linear`, `polynomial` |
| `offset` | DECIMAL(18,8) | nullable | For linear: y = gain·x + offset |
| `gain` | DECIMAL(18,8) | nullable | |
| `poly_degree` | INTEGER | nullable | |
| `poly_coefficients` | JSONB | nullable | `[a0, a1, a2, …]` lowest-to-highest degree |
| `unit_input` | VARCHAR(50) | nullable | e.g. `mV`, `mA` |
| `unit_output` | VARCHAR(50) | nullable | e.g. `°C`, `bar` |
| `range_min` | DECIMAL(18,4) | nullable | |
| `range_max` | DECIMAL(18,4) | nullable | |
| `uncertainty` | DECIMAL(18,8) | nullable | Expanded measurement uncertainty |
| `uncertainty_coverage_factor` | DECIMAL(5,3) | nullable | Coverage factor k (usually 2 for 95%) |
| `notes` | TEXT | nullable | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `certificates`

Calibration certificates and compliance documents.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | UUID | FK → assets, NOT NULL, indexed | |
| `calibration_id` | UUID | FK → calibrations, nullable | |
| `certificate_number` | VARCHAR(255) | NOT NULL, UNIQUE | Official cert number |
| `issued_by` | VARCHAR(255) | NOT NULL | Issuing lab or organization |
| `accreditation_body` | VARCHAR(255) | nullable | e.g. ENAC, UKAS, A2LA |
| `accreditation_number` | VARCHAR(255) | nullable | |
| `issued_at` | DATE | NOT NULL | |
| `valid_until` | DATE | nullable | |
| `file_id` | UUID | FK → files, nullable | Attached PDF |
| `is_active` | BOOLEAN | NOT NULL, default true | |
| `created_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `files`

Metadata for all files stored in MinIO. Binary content never touches PostgreSQL.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `original_filename` | VARCHAR(500) | NOT NULL | |
| `storage_path` | VARCHAR(1000) | NOT NULL | Path within the MinIO bucket |
| `bucket` | VARCHAR(255) | NOT NULL | MinIO bucket name |
| `content_type` | VARCHAR(100) | NOT NULL | MIME type (e.g. `application/pdf`) |
| `size_bytes` | BIGINT | NOT NULL | |
| `checksum_sha256` | VARCHAR(64) | NOT NULL | Integrity verification |
| `entity_type` | VARCHAR(50) | NOT NULL | `certificate`, `asset_image`, `datasheet`, `raw_calibration` |
| `entity_id` | UUID | nullable | ID of the related entity |
| `uploaded_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `audit_logs`

Immutable append-only audit trail.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `actor_id` | UUID | FK → users, nullable | null for system actions |
| `actor_email` | VARCHAR(255) | NOT NULL | Denormalized — preserves history if user is deleted |
| `action` | VARCHAR(100) | NOT NULL, indexed | Dot-namespaced: `asset.created`, `calibration.recorded`, `user.login` |
| `entity_type` | VARCHAR(50) | NOT NULL, indexed | `asset`, `calibration`, `certificate`, `user`, `location` |
| `entity_id` | UUID | nullable, indexed | |
| `entity_asset_id` | VARCHAR(20) | nullable | For assets — fast lookup by Open Gauge ID |
| `before_state` | JSONB | nullable | Snapshot before change |
| `after_state` | JSONB | nullable | Snapshot after change |
| `ip_address` | VARCHAR(45) | nullable | Supports IPv6 |
| `user_agent` | VARCHAR(500) | nullable | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now(), indexed | |

**Common action values:**
`asset.created`, `asset.updated`, `asset.archived`, `asset.moved`, `calibration.recorded`, `certificate.uploaded`, `user.login`, `user.created`, `user.deactivated`

---

## Relationships Summary

```
organizations ─┬─< locations (self-referencing hierarchy)
               │       └─< assets (location_id — current)
               │             ├─< sensors ─────────────────> calibration_methods
               │             │   (multi-channel, asset_id + channel_id)
               │             ├─< daq
               │             ├─< calibrations >─< calibration_coefficients
               │             │        └─< certificates >─< files
               │             └─< files (datasheets, images, pinout, schematics)
               │
               └─< users ──> calibration_methods (created_by)
                     └─< teams

asset_locations      →  (asset × location × timestamp — movement history)
audit_logs           →  (references entities loosely by UUID + entity_type)
calibration_methods  →  (procedure library, referenced by sensors.calibration_method_id)
```

---

## Indexes (beyond PKs and FKs)

| Table | Column(s) | Reason |
|---|---|---|
| `assets` | `asset_id` | Primary human/QR lookup key |
| `assets` | `location_id` | Scoped asset lists by location |
| `sensors` | `asset_id` | Channel lookup by asset |
| `calibrations` | `asset_id` | History lookup |
| `calibrations` | `calibration_date` | Date range queries |
| `certificates` | `asset_id` | Certificate lookup by asset |
| `locations` | `parent_location_id` | Tree traversal queries |
| `locations` | `organization_id` | Org-scoped location lists |
| `asset_locations` | `asset_id` | Movement history per asset |
| `asset_locations` | `location_id` | Assets currently at a location |
| `audit_logs` | `entity_id` | Entity history lookup |
| `audit_logs` | `actor_id` | User activity lookup |
| `audit_logs` | `created_at` | Time-range audit queries |
| `audit_logs` | `action` | Action-type filtering |
| `users` | `email` | Login lookup |
| `calibration_methods` | `physical_quantity` | Filter by measurand |
| `sensors` | `calibration_method_id` | Procedure lookup per channel |

---

## Weak Points & Design Risks

### W1 — `sensors.asset_id` uniqueness in original spec
The MODIFICATIONS.md spec defines `asset_id` on `sensors` with `UNIQUE`, but describes multi-channel support via `channel_id`. These are contradictory: a sensor with Temperature and Humidity channels would need two rows and thus a non-unique `asset_id`. **Resolution adopted here:** the UNIQUE constraint is dropped in favor of `UNIQUE(asset_id, channel_id)`. Confirm this is intentional before migration.

### W2 — `teams` table undefined
`assets.owner` references `teams`, but no `teams` table is defined in the schema. Any FK enforcement will fail until this table is created. Consider whether `team` is a simple VARCHAR (like `users.team`) or a full normalized entity. If the latter, define `teams` before writing the Alembic migration.

### W3 — `locations.code` uniqueness scope
The spec says "unique per organization", but a bare column-level `UNIQUE` on `code` would make the same code globally unique. The constraint must be `UNIQUE(organization_id, code)` at the table level (and should be partial to exclude NULLs).

### W4 — Dual-write risk: `assets.location_id` vs `asset_locations`
`assets.location_id` is a denormalized pointer to the current location. Every asset move must update **both** this column and insert into `asset_locations`. If either write fails or is omitted, the tables diverge. Mitigate by wrapping moves in a transaction and preferably in a single stored procedure or service method — never rely on callers to do both.

### W5 — `daq` table missing `is_active`
`sensors` has `is_active` but `daq` does not. If a DAQ configuration needs to be logically disabled without retiring the parent asset, there is no mechanism for it. Add `is_active BOOLEAN NOT NULL DEFAULT true` to `daq` for symmetry unless DAQ configs are always active if the parent asset is active.

### W6 — `calibration_coefficients.channel` not FK-linked to `sensors.channel_id`
Calibration coefficients reference a channel by a free-text `channel` string. There is no FK to `sensors(channel_id)`, so it is possible to record coefficients for a channel name that does not exist in `sensors`. This is intentional for flexibility (DAQ channels, external instrument channels) but should be validated at the application layer, not left entirely unchecked.

### W7 — `asset_type` ENUM drops `reference_standard`
The old schema had `sensor`, `instrument`, `reference_standard`, `data_acquisition`. The new schema collapses to `sensor` and `daq`. Reference standards (high-accuracy devices used for calibration) no longer have a dedicated type. If reference standards need to be traceable (as required by ISO 17025), their `calibration_role` can be captured on the `sensors` row — but verify this satisfies your compliance requirements before the old `reference_standard` type is retired.

### W8 — No `updated_by` audit field on `assets`
`assets` tracks `created_by` and `retired_by` but not who last updated it. The `version` counter shows *that* something changed, and `audit_logs` shows *who* changed it, but the asset row itself has no quick `updated_by` pointer. This is acceptable if audit_logs is always queried for attribution — but if direct queries against the asset table need the last editor, add `updated_by UUID FK → users`.
