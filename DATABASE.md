# DATABASE.md — MAR Schema Reference

All stored numeric values are in SI units. Display units are stored alongside values so the frontend can convert for presentation.

Migrations live in `apps/api/migrations/versions/`. Run them with:

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec api alembic upgrade head
```

---

## Tables

### `organizations`

Tenant root. Every other record belongs to an organization.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| name | VARCHAR(255) | |
| description | TEXT | |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

### `users`

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| email | VARCHAR(255) UNIQUE | |
| name | VARCHAR(255) | |
| hashed_password | VARCHAR(255) | nullable (SSO users) |
| role | ENUM | superadmin / admin / technician / viewer |
| is_active | BOOLEAN | |
| is_superuser | BOOLEAN | |
| last_login_at | TIMESTAMPTZ | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

### `teams`

Groups within an organization; used for asset ownership.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| name | VARCHAR(255) | |
| description | TEXT | |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

### `locations`

Hierarchical location tree (organization → site → building → room → …).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| parent_location_id | UUID FK → locations | nullable = root node |
| name | VARCHAR(255) | |
| description | TEXT | |
| location_type | VARCHAR(255) | organization / site / building / laboratory / … |
| code | VARCHAR(50) | unique per organization |
| address | TEXT | |
| latitude | NUMERIC(10,8) | |
| longitude | NUMERIC(11,8) | |
| is_active | BOOLEAN | soft delete |
| archived_at | TIMESTAMPTZ | |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

### `asset_locations`

Location movement history. Records every assignment of an asset to a location.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| asset_id | UUID FK → assets | |
| location_id | UUID FK → locations | |
| moved_at | TIMESTAMPTZ | |
| moved_by | UUID FK → users | nullable |
| reason | TEXT | |
| notes | TEXT | |

---

### `files`

Metadata for files stored in MinIO (S3-compatible).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| bucket | VARCHAR(255) | MinIO bucket name |
| object_key | VARCHAR(1024) | path within bucket |
| original_filename | VARCHAR(512) | |
| content_type | VARCHAR(255) | MIME type |
| size_bytes | BIGINT | |
| uploaded_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |

---

### `assets`

The central registry entity. Represents a physical instrument or sensor.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| asset_id | VARCHAR(50) UNIQUE | human-readable ID, e.g. MAR-00042 |
| organization_id | UUID FK → organizations | |
| asset_type | ENUM | sensor / daq |
| name | VARCHAR(255) | |
| description | TEXT | |
| manufacturer | VARCHAR(255) | |
| model | VARCHAR(255) | |
| serial_number | VARCHAR(255) | |
| manufacturer_part_number | VARCHAR(255) | |
| location_id | UUID FK → locations | nullable; current location |
| owner | UUID FK → teams | nullable |
| firmware_version | VARCHAR(100) | |
| power_supply | VARCHAR(100) | |
| power_consumption_w | NUMERIC(10,3) | SI: W |
| dimensions | VARCHAR(255) | free-text |
| weight_kg | NUMERIC(10,4) | SI: kg |
| mounting_type | VARCHAR(100) | |
| connection_type | VARCHAR(100) | |
| displays_readings | BOOLEAN | |
| ip_rating | VARCHAR(20) | |
| hazardous_area_rating | VARCHAR(100) | |
| operating_temperature_min | NUMERIC(10,4) | SI: K |
| operating_temperature_max | NUMERIC(10,4) | SI: K |
| operating_humidity_min | NUMERIC(8,4) | SI: %RH |
| operating_humidity_max | NUMERIC(8,4) | SI: %RH |
| health_score | NUMERIC(5,2) | 0–100, computed |
| price_eur | NUMERIC(12,2) | |
| purchase_date | DATE | |
| warranty_expiry_date | DATE | |
| notes | TEXT | |
| pinout_table | JSONB | array of {pin_number, name, description} |
| pinout_image_id | UUID FK → files | |
| sensor_image_id | UUID FK → files | |
| sensor_schematic_id | UUID FK → files | |
| is_active | BOOLEAN | false = retired |
| retired_at | TIMESTAMPTZ | |
| retired_reason | TEXT | |
| version | INTEGER | optimistic-lock counter |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

### `sensors`

Per-channel measurement specification for sensor assets. One asset may have multiple channels.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| asset_id | UUID FK → assets | |
| channel_id | VARCHAR(255) | user-defined label, unique per asset |
| physical_quantity | VARCHAR(255) | e.g. temperature, pressure |
| unit | VARCHAR(50) | display unit |
| technology | VARCHAR(255) | |
| measurement_min | NUMERIC(18,8) | SI units |
| measurement_max | NUMERIC(18,8) | SI units |
| accuracy_value | NUMERIC(18,8) | |
| accuracy_type | VARCHAR(255) | percent_of_reading / percent_of_full_scale / absolute |
| accuracy_unit | VARCHAR(50) | |
| resolution | NUMERIC(18,8) | |
| resolution_unit | VARCHAR(50) | |
| measurement_uncertainty | NUMERIC(18,8) | expanded uncertainty |
| uncertainty_unit | VARCHAR(50) | |
| confidence_level | NUMERIC(5,2) | % |
| coverage_factor | NUMERIC(5,2) | |
| drift_rate | NUMERIC(18,8) | |
| drift_unit | VARCHAR(50) | |
| sensitivity | NUMERIC(18,8) | |
| sensitivity_unit | VARCHAR(100) | |
| response_time_ms | NUMERIC(18,8) | SI: ms |
| bandwidth_hz | NUMERIC(18,8) | SI: Hz |
| output_signal_min | NUMERIC(18,8) | SI units |
| output_signal_max | NUMERIC(18,8) | SI units |
| output_signal_unit | VARCHAR(50) | display unit |
| output_type | VARCHAR(255) | analog / digital / frequency / resistance / capacitance |
| calibration_role | VARCHAR(255) | working / reference / transfer |
| criticality | VARCHAR(255) | non-critical / critical / safety-critical |
| calibration_method_id | UUID FK → calibration_methods | default method for this channel |
| calibration_interval | INTEGER | days |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Unique constraint: `(asset_id, channel_id)`.

---

### `daq_details`

Hardware specification for DAQ-type assets (one row per DAQ asset).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| asset_id | UUID FK → assets | |
| daq_type | VARCHAR(100) | data_logger / signal_conditioner / gateway / other |
| input_channels | INTEGER | |
| output_channels | INTEGER | |
| … | | (remaining DAQ columns omitted for brevity) |

---

### `calibration_methods`

Reusable procedure templates, scoped to a physical quantity.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| physical_quantity | VARCHAR(255) INDEX | |
| name | VARCHAR(255) | |
| description | TEXT | |
| required_equipment | TEXT | |
| steps | JSONB | array of step strings |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

### `calibrations`

One row per calibration event. Immutable after creation.

#### Current columns (migrations 001–003)

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| asset_id | UUID FK → assets | |
| calibration_date | DATE | |
| due_date | DATE | |
| performed_by_user_id | UUID FK → users | nullable |
| performed_by_name | VARCHAR(255) | |
| external_lab_name | VARCHAR(255) | |
| external_lab_accreditation | VARCHAR(255) | |
| result | ENUM | pass / fail / conditional_pass |
| temperature_c | NUMERIC(6,2) | legacy; use temperature_value + unit |
| humidity_pct | NUMERIC(5,2) | legacy; use humidity_value + unit |
| pressure_hpa | NUMERIC(8,2) | legacy; use pressure_value + unit |
| notes | TEXT | |
| calibration_file_id | UUID FK → files | |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |

#### Added in migration 004 (calibration workflow)

| Column | Type | Notes |
|---|---|---|
| sensor_id | UUID FK → sensors | the specific channel calibrated |
| calibration_type | VARCHAR(20) | 'internal' / 'external' |
| reference_asset_id | UUID FK → assets | internal only |
| calibration_method_id | UUID FK → calibration_methods | internal only |
| certificate_number | VARCHAR(255) | external only |
| certificate_expiry_date | DATE | external only |
| calibration_interval | INTEGER | months (overrides sensor default for this event) |
| version | INTEGER | auto-incremented per (asset_id, sensor_id) |
| temperature_value | NUMERIC(10,4) | SI: K |
| temperature_unit | VARCHAR(10) | display unit |
| pressure_value | NUMERIC(12,4) | SI: Pa |
| pressure_unit | VARCHAR(10) | display unit |
| humidity_value | NUMERIC(8,4) | |
| humidity_unit | VARCHAR(10) | '%RH' only for now |

---

### `calibration_coefficients`

Regression result for one calibration. One row per calibration (or per channel if multi-channel calibrations are ever needed).

#### Current columns

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| calibration_id | UUID FK → calibrations | |
| channel | VARCHAR(50) | channel label, mirrors sensor.channel_id |
| coefficient_type | ENUM | linear / polynomial |
| offset_value | NUMERIC(18,8) | for linear: y = gain·x + offset |
| gain | NUMERIC(18,8) | for linear |
| poly_degree | INTEGER | for polynomial |
| poly_coefficients | JSONB | array, highest degree first |
| unit_input | VARCHAR(50) | |
| unit_output | VARCHAR(50) | |
| range_min | NUMERIC(18,4) | |
| range_max | NUMERIC(18,4) | |
| uncertainty | NUMERIC(18,8) | expanded uncertainty |
| uncertainty_coverage_factor | NUMERIC(5,3) | |
| notes | TEXT | |
| created_at | TIMESTAMPTZ | |

#### Added in migration 004

| Column | Type | Notes |
|---|---|---|
| r_squared | NUMERIC(10,8) | coefficient of determination |
| rmse | NUMERIC(18,8) | root mean square error |
| standard_error | NUMERIC(18,8) | standard error of regression |
| max_error | NUMERIC(18,8) | absolute max residual |
| full_scale_error_pct | NUMERIC(8,4) | max error as % of measurement span |
| non_linearity_pct | NUMERIC(8,4) | % FS |
| repeatability | NUMERIC(18,8) | NULL if not detectable |
| hysteresis | NUMERIC(18,8) | NULL if not detectable |
| distribution_type | VARCHAR(20) | 'normal' / 't' / 'chi_squared' |
| confidence_level | NUMERIC(5,2) | % |
| combined_uncertainty | NUMERIC(18,8) | |
| expanded_uncertainty | NUMERIC(18,8) | supersedes `uncertainty` column |
| valid_range_min | NUMERIC(18,8) | |
| valid_range_max | NUMERIC(18,8) | |

---

### `calibration_points` ← New in migration 004

Individual data points collected during a calibration event.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| calibration_id | UUID FK → calibrations ON DELETE CASCADE | |
| point_index | INTEGER | ordering within the calibration |
| reference_value | NUMERIC(18,8) | SI units |
| measured_value | NUMERIC(18,8) | SI units |
| calculated_value | NUMERIC(18,8) | corrected output via fitted model; SI |
| residual_abs | NUMERIC(18,8) | measured − calculated; SI |
| residual_pct | NUMERIC(10,4) | residual as % of calibrated span |
| reference_unit | VARCHAR(50) | display unit shown in UI |
| measured_unit | VARCHAR(50) | display unit shown in UI |
| created_at | TIMESTAMPTZ | |

Index: `(calibration_id)`.

---

### `audit_logs`

Immutable record of every significant state change.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| organization_id | UUID FK → organizations | |
| entity_type | VARCHAR(100) | 'asset', 'calibration', etc. |
| entity_id | UUID | |
| action | VARCHAR(50) | 'create', 'update', 'retire', 'delete' |
| actor_id | UUID FK → users | |
| before | JSONB | state before the change |
| after | JSONB | state after the change |
| created_at | TIMESTAMPTZ | |

---

## Migration History

| ID | Description |
|---|---|
| 001 | Initial schema (organizations, users, assets, sensors, calibrations, etc.) |
| 002 | Restructure assets and locations (add location hierarchy, asset_locations history) |
| 003 | Add calibration_methods, pinout fields on assets, calibration_method_id + calibration_interval on sensors |
| 004 | Calibration workflow (sensor_id on calibrations, calibration_points table, statistics on coefficients) — **pending** |

---

## Design Decisions

- **SI storage**: All numeric physical values (temperatures, pressures, ranges, coefficients) are stored in SI units. Display units are stored alongside them so the UI can convert without re-querying.
- **Soft deletes**: Assets and locations use `is_active + archived_at`. Calibrations, points, and coefficients are never deleted (CASCADE is only on points → calibration to keep them together if a calibration is deleted, which never happens in normal use).
- **Immutable calibrations**: Once a calibration is confirmed and saved it cannot be modified. Version auto-increment ensures each event is uniquely numbered per channel.
- **Versioning**: `assets.version` is an optimistic-lock counter incremented on every PUT. `calibrations.version` numbers calibration events per (asset, channel).
