# DATABASE.md — MAR Schema Reference

All stored numeric physical values are in SI units. Display units are stored alongside values so the frontend can convert for presentation.

Migrations live in `apps/api/migrations/versions/`. Run them with:

```bash
docker compose -f infrastructure/docker/docker-compose.yml exec api alembic upgrade head
```

---

## Tables

### `organizations`

Tenant root.

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
| organization_id | UUID | nullable; not a DB-enforced FK |
| email | VARCHAR(255) UNIQUE | |
| name | VARCHAR(255) | |
| hashed_password | VARCHAR(255) | nullable (SSO users) |
| role | ENUM | superadmin / admin / technician / viewer |
| team | VARCHAR(255) | free-text label, separate from the `teams` table |
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
| created_by | UUID FK → users | |
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
| code | VARCHAR(50) | nullable; unique per organization |
| address | TEXT | |
| latitude | NUMERIC(10,8) | |
| longitude | NUMERIC(11,8) | |
| is_calibration_lab | BOOLEAN | marks a location as a valid calibration site (migration 009) |
| is_active | BOOLEAN | soft delete |
| archived_at | TIMESTAMPTZ | |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Unique constraint: `(organization_id, code)`.

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

Metadata for files stored in MinIO (S3-compatible). Not organization-scoped directly — access is governed by the owning entity (`entity_type` + `entity_id`).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| original_filename | VARCHAR(500) | |
| storage_path | VARCHAR(1000) | path within the bucket |
| bucket | VARCHAR(255) | MinIO bucket name |
| content_type | VARCHAR(100) | MIME type |
| size_bytes | BIGINT | |
| checksum_sha256 | VARCHAR(64) | |
| entity_type | VARCHAR(50) | e.g. 'calibration_certificate', 'asset_datasheet', 'procedure_step' |
| entity_id | UUID | nullable; the owning entity's id |
| step_index | INTEGER | nullable; ordering for multi-file entities (e.g. procedure steps) |
| uploaded_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |

---

### `assets`

The central registry entity. Represents a physical instrument or sensor. Not directly organization-scoped — ownership flows through `owner` (team) and `location_id`.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| asset_id | VARCHAR(20) UNIQUE | human-readable ID, e.g. MAR-00042 |
| asset_type | ENUM | sensor / daq |
| name | VARCHAR(255) | |
| description | TEXT | |
| manufacturer | VARCHAR(255) | |
| model | VARCHAR(255) | |
| serial_number | VARCHAR(255) | |
| manufacturer_part_number | VARCHAR(255) | |
| location_id | UUID FK → locations | nullable; current location |
| owner | UUID FK → teams | nullable |
| datasheet_file_id | UUID FK → files | nullable |
| datasheet_url | TEXT | nullable |
| firmware_version | VARCHAR(100) | |
| power_supply | VARCHAR(100) | |
| power_consumption_w | INTEGER | SI: W |
| dimensions | VARCHAR(100) | free-text |
| weight_kg | NUMERIC(10,3) | SI: kg |
| mounting_type | VARCHAR(100) | |
| connection_type | VARCHAR(100) | |
| displays_readings | BOOLEAN | |
| ip_rating | VARCHAR(20) | |
| hazardous_area_rating | VARCHAR(100) | |
| operating_temperature_min | NUMERIC(18,8) | SI: K |
| operating_temperature_max | NUMERIC(18,8) | SI: K |
| operating_humidity_min | NUMERIC(5,2) | SI: %RH |
| operating_humidity_max | NUMERIC(5,2) | SI: %RH |
| health_score | INTEGER | 0–100, computed |
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
| retired_by | UUID FK → users | |
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
| measurement_type | VARCHAR(50) | *(migration 014)* measurement mode for quantities that need one, e.g. pressure's `absolute` / `gauge` — only shown in the UI for quantities with defined options (`apps/web/src/lib/sensor-options.ts::PHYSICAL_QUANTITY_TYPES`); `null` for quantities that don't need one |
| unit | VARCHAR(50) | display unit |
| technology | VARCHAR(255) | |
| measurement_min | NUMERIC(18,8) | SI units |
| measurement_max | NUMERIC(18,8) | SI units |
| accuracy_value | NUMERIC(18,8) | manufacturer/nominal accuracy spec |
| accuracy_type | VARCHAR(255) | `absolute` / `percent_of_full_scale` (auto-derived from `accuracy_unit`, not directly editable — see `CALIBRATION.md`'s "% FS" convention); `percent_of_reading` remains valid for existing data but isn't offered as a channel-editing option any more |
| accuracy_unit | VARCHAR(50) | a real unit (e.g. °C) or the literal string `%FS` |
| resolution | NUMERIC(18,8) | fed into the calibration uncertainty budget as a Type B (rectangular) contribution |
| resolution_unit | VARCHAR(50) | a real unit or the literal string `%FS` (converted to an absolute value client-side before use — see `CALIBRATION.md`) |
| measurement_uncertainty | NUMERIC(18,8) | nominal/manufacturer expanded uncertainty; pre-fills the wizard's per-calibration "Sensor nominal accuracy" field (editable there, not used silently) as an optional Type B contribution (opt-in, to avoid double-counting against the fit-residual term) — see `CALIBRATION.md` |
| uncertainty_unit | VARCHAR(50) | a real unit or the literal string `%FS` |
| drift_rate | NUMERIC(18,8) | |
| drift_unit | VARCHAR(50) | |
| response_time_ms | NUMERIC(18,8) | SI: ms |
| bandwidth_hz | NUMERIC(18,8) | SI: Hz |
| output_signal_min | NUMERIC(18,8) | SI units |
| output_signal_max | NUMERIC(18,8) | SI units |
| output_signal_unit | VARCHAR(50) | display unit |
| output_type | VARCHAR(255) | analog / digital / frequency / resistance / capacitance |
| calibration_role | VARCHAR(255) | `reference` or `null`/`working`; edited as a checkbox ("Reference standard") rather than a role dropdown — see `CALIBRATION.md` |
| calibration_method_id | UUID FK → procedures | default procedure for this channel |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Legacy columns still in the schema but no longer editable via the channel UI**
(`confidence_level` NUMERIC(5,2), `coverage_factor` NUMERIC(5,2), `sensitivity` NUMERIC(18,8),
`sensitivity_unit` VARCHAR(100), `criticality` VARCHAR(255), `calibration_interval` INTEGER —
days). None of these fed any calculation (confirmed unused by calibration analysis, health
scoring, or certificate generation before removal), so they were dropped from the channel
add/edit form; the columns themselves were left in place rather than migrated away. Saving a
channel through the current UI writes `null` to all of them going forward, since the update
payload no longer sends a value for any of these fields.

Unique constraint: `(asset_id, channel_id)`.

---

### `daq`

Hardware specification for DAQ-type assets (one row per DAQ asset).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| asset_id | UUID FK → assets, UNIQUE | one DAQ row per asset |
| daq_type | VARCHAR(255) | data_logger / signal_conditioner / gateway / other |
| input_channels | INTEGER | |
| output_channels | INTEGER | |
| input_signal_types | VARCHAR(255) | |
| output_signal_types | VARCHAR(255) | |
| sampling_rate_hz | NUMERIC(12,4) | |
| per_channel_sampling_rate_hz | NUMERIC(12,4) | |
| adc_resolution_bits | INTEGER | |
| adc_type | VARCHAR(255) | |
| input_voltage_range_min | NUMERIC(18,8) | |
| input_voltage_range_max | NUMERIC(18,8) | |
| input_impedance_ohm | NUMERIC(18,2) | |
| noise_floor_uv_rms | NUMERIC(18,8) | |
| dynamic_range_db | NUMERIC(10,4) | |
| synchronization_supported | BOOLEAN | |
| clock_source | VARCHAR(255) | |
| time_sync_precision_ns | NUMERIC(18,4) | |
| jitter_ns | NUMERIC(18,4) | |
| communication_protocol | VARCHAR(100) | |
| interface_type | VARCHAR(100) | |
| trigger_modes | VARCHAR(255) | |
| is_active | BOOLEAN | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

### `procedures`

Reusable calibration procedure templates, scoped to a physical quantity. Renamed from `calibration_methods` in migration 005; enriched with rich fields in migration 006.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| proc_id | VARCHAR(20) UNIQUE | human-readable procedure code |
| physical_quantity | VARCHAR(255) INDEX | |
| name | VARCHAR(255) | |
| description | TEXT | |
| version | VARCHAR(20) | free-text version string, e.g. "1.0" |
| difficulty | VARCHAR(20) | |
| standard_ref | VARCHAR(255) | free-text reference to an external standard (e.g. an ISO/ASTM number) |
| author | VARCHAR(255) | |
| duration_min | INTEGER | |
| tags | JSONB | array of strings |
| equipment | JSONB | array of required-equipment entries |
| materials | JSONB | array of material entries |
| environment | JSONB | array of environmental-condition entries |
| safety_notes | JSONB | array of strings |
| steps | JSONB | array of step objects |
| acceptance_criteria | JSONB | array of criteria entries |
| required_equipment | TEXT | legacy free-text field, superseded by `equipment` |
| is_active | BOOLEAN | |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

---

### `calibrations`

One row per calibration event. Immutable after creation — new calibrations create new rows rather than editing existing ones (see `CALIBRATION.md`). All coefficient, regression-statistic, and uncertainty data live directly on this table (flattened here by migration 005; previously split across a separate `calibration_coefficients` table, which was dropped).

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| asset_id | UUID FK → assets | |
| calibration_date | DATE | |
| due_date | DATE | |
| performed_by_user_id | UUID FK → users | nullable |
| performed_by_name | VARCHAR(255) | |
| external_lab_name | VARCHAR(255) | |
| notes | TEXT | |
| calibration_file_id | UUID FK → files | the generated certificate PDF |
| created_by | UUID FK → users | |
| created_at | TIMESTAMPTZ | |

**Metadata**

| Column | Type | Notes |
|---|---|---|
| sensor_id | UUID FK → sensors | nullable; the specific channel calibrated |
| calibration_type | VARCHAR(20) | 'internal' / 'external' |
| calibration_version | INTEGER | auto-incremented per (asset_id, sensor_id) |
| calibration_interval | INTEGER | months (overrides the sensor's default for this event) |
| tolerance_criteria | VARCHAR(50) | how `channel_accuracy_value` is interpreted for this event: percent_fs / absolute / percent_reading |

**Traceability**

| Column | Type | Notes |
|---|---|---|
| internal_reference_asset_id | UUID FK → assets | nullable; the reference standard used (internal calibrations) |
| internal_procedure_id | UUID FK → procedures | nullable |
| external_lab_certificate_number | VARCHAR(255) | nullable; external calibrations |
| daq_id | UUID FK → daq | nullable |
| calibration_data_id | UUID FK → calibration_data | nullable; the first data point row (see below) |
| calibration_location_id | UUID FK → locations | nullable; where the calibration was performed |

**Environmental conditions** (canonical units: °C, %RH, Pa)

| Column | Type | Notes |
|---|---|---|
| temperature | NUMERIC(6,2) | |
| humidity | NUMERIC(5,2) | |
| pressure | NUMERIC(10,2) | widened from NUMERIC(8,2) in migration 008 |

**Polynomial model**

| Column | Type | Notes |
|---|---|---|
| poly_order | INTEGER | |
| poly_coefficients | JSONB | array, highest degree first (`np.polyfit` convention) |
| range_min | NUMERIC(18,4) | |
| range_max | NUMERIC(18,4) | |
| poly_coefficients_covariance | JSONB | *(migration 012)* N×N covariance matrix of the fitted coefficients, N = poly_order + 1. Required to correctly propagate uncertainty when two or more coefficients are used together (GUM Annex H.3, GUM-6 §8.1.6) — `null` when the fit had zero residual degrees of freedom (points ≤ parameters). |

**Regression statistics**

| Column | Type | Notes |
|---|---|---|
| r_squared | NUMERIC(10,8) | coefficient of determination |
| rmse | NUMERIC(18,8) | root mean square error |
| standard_error | NUMERIC(18,8) | |
| max_error | NUMERIC(18,8) | largest absolute residual |
| full_scale_error | NUMERIC(8,4) | max error as % of measurement span |
| non_linearity | NUMERIC(8,4) | % FS |
| repeatability | NUMERIC(18,8) | nullable; requires ≥3 points at the same reference value |
| hysteresis | NUMERIC(18,8) | nullable; requires an up/down sweep |

**Uncertainty** (JCGM 100:2008 / GUM-compliant, see `CALIBRATION.md`)

| Column | Type | Notes |
|---|---|---|
| distribution_type | VARCHAR(20) | 'normal' / 't' / 'chi_squared' — governs the expanded-uncertainty coverage factor |
| confidence_level | NUMERIC(5,2) | % |
| coverage_factor | NUMERIC(5,3) | k, used directly for 'normal'; derived from ν_eff for 't'/'chi_squared' |
| combined_uncertainty | NUMERIC(18,8) | u_c(y): RSS combination of every row in `uncertainty_budget` |
| expanded_uncertainty | NUMERIC(18,8) | U = k·u_c(y) |
| valid_range_min | NUMERIC(18,8) | |
| valid_range_max | NUMERIC(18,8) | |
| uncertainty_budget | JSONB | *(migration 011)* itemized Type A/Type B contributions, GUM Annex H.1 format: array of `{source, description, value, distribution, divisor, standard_uncertainty, degrees_of_freedom}`. `degrees_of_freedom: null` means the contribution is treated as exactly known (drops out of the Welch-Satterthwaite sum). |
| effective_degrees_of_freedom | NUMERIC(18,4) | *(migration 011)* ν_eff via the Welch-Satterthwaite formula; `null` when no budget row has finite degrees of freedom |

**Decision rule / conformity** (ISO/IEC 17025 §7.1.3, §7.8.6 — *migration 013*)

| Column | Type | Notes |
|---|---|---|
| decision_rule | VARCHAR(30) NOT NULL, default `'simple_acceptance'` | `simple_acceptance` (tolerance only) / `guard_band_w_uncertainty` (tolerance shrunk by U) / `shared_risk` (tolerance expanded by U) |
| conformity_statement | JSONB | `{decision_rule, specification, expanded_uncertainty_applied, passed, reason}` — the full pass/fail statement, printed on the certificate. `specification: null` means no accuracy spec was configured, so conformity wasn't evaluated. |

---

### `calibration_data`

Individual data points collected during a calibration event. Renamed from `calibration_points` in migration 005.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| calibration_id | UUID FK → calibrations ON DELETE CASCADE | |
| point_index | INTEGER | ordering within the calibration |
| reference_value | NUMERIC(18,8) | display units (as entered) |
| measured_value | NUMERIC(18,8) | display units |
| calculated_value | NUMERIC(18,8) | fitted/corrected output via the calibration polynomial |
| residual_abs | NUMERIC(18,8) | reference − calculated |
| residual_pct | NUMERIC(10,4) | residual as % of calibrated span |
| reference_unit | VARCHAR(50) | display unit shown in UI |
| measured_unit | VARCHAR(50) | display unit shown in UI |
| created_at | TIMESTAMPTZ | |

Index: `(calibration_id)`.

---

### `audit_logs`

Immutable record of every significant state change. Not organization-scoped as a column — scope is inferred from the actor/entity.

| Column | Type | Notes |
|---|---|---|
| id | UUID PK | |
| actor_id | UUID FK → users | nullable |
| actor_email | VARCHAR(255) | denormalized so the log survives user deletion |
| action | VARCHAR(100) | e.g. 'asset.created', 'calibration.created', 'calibration.deleted' |
| entity_type | VARCHAR(50) | 'asset', 'calibration', 'procedure', 'location', … |
| entity_id | UUID | nullable |
| entity_asset_id | VARCHAR(20) | nullable; the human-readable asset_id, for quick filtering |
| before_state | JSONB | state before the change |
| after_state | JSONB | state after the change |
| ip_address | VARCHAR(45) | |
| user_agent | VARCHAR(500) | |
| created_at | TIMESTAMPTZ | |

---

## Removed tables

- **`calibration_coefficients`** — dropped in migration 005. Its columns (gain/offset, polynomial coefficients, regression statistics, uncertainty) were flattened directly onto `calibrations`. The SQLAlchemy model, schema, and any code referencing this table were dead/orphaned until removed as part of the GUM uncertainty-compliance work (see `CALIBRATION.md`).
- **`certificates`** — dropped in migration 005. Certificates are now generated PDFs stored via `calibration_file_id` on `calibrations` (see `certificate_service.py`), tracked through the `files` table. The old model/schema/repository/router were dead/orphaned until removed as part of the same cleanup.

---

## Migration History

| ID | Description |
|---|---|
| 001 | Initial schema (organizations, users, assets, sensors, calibrations, calibration_coefficients, certificates, files, etc.) |
| 002 | Restructure assets and locations: add teams, hierarchical locations, asset_locations, daq; rewrite assets/sensors for multi-channel support |
| 003 | Add calibration_methods table, pinout fields on assets, calibration_method_id + calibration_interval on sensors |
| 004 | Calibration workflow: sensor_id on calibrations, statistics on calibration_coefficients, calibration_points table |
| 005 | Restructure calibrations: flatten calibration_coefficients onto calibrations, rename calibration_methods → procedures and calibration_points → calibration_data, drop calibration_coefficients and certificates tables |
| 006 | Add rich fields to procedures (equipment, materials, environment, safety_notes, acceptance_criteria as JSONB) |
| 007 | Add step_index column to files (ordering for multi-file entities) |
| 008 | Widen calibrations.pressure column from NUMERIC(8,2) to NUMERIC(10,2) to avoid truncation when converting from hPa |
| 009 | Add is_calibration_lab column to locations |
| 010 | Add calibration_location_id column to calibrations |
| 011 | Add uncertainty_budget (JSONB) and effective_degrees_of_freedom columns to calibrations — GUM Type A + Type B uncertainty combination |
| 012 | Add poly_coefficients_covariance column to calibrations — coefficient covariance for correct downstream uncertainty propagation |
| 013 | Add decision_rule and conformity_statement columns to calibrations — ISO/IEC 17025 §7.1.3/§7.8.6 decision rules |
| 014 | Add measurement_type column to sensors — e.g. absolute vs. gauge pressure |

---

## Design Decisions

- **SI storage**: All numeric physical values (temperatures, pressures, ranges, coefficients) are stored in SI units. Display units are stored alongside them so the UI can convert without re-querying. (`calibration_data` is an exception — points are stored in display units to keep the stored calibration curve and stored points mutually consistent; see `CALIBRATION.md`.)
- **Soft deletes**: Assets and locations use `is_active` + `archived_at`. Calibrations and calibration_data are never soft-deleted — hard delete is an admin-only operation (`DELETE /calibrations/{id}`) and cascades to calibration_data.
- **Immutable calibrations**: Once a calibration is saved it cannot be modified. `calibration_version` auto-increments per (asset, channel), so re-calibrating always creates a new, fully independent row — never an in-place edit.
- **Versioning**: `assets.version` is an optimistic-lock counter incremented on every PUT. `calibrations.calibration_version` numbers calibration events per (asset, channel).
- **Uncertainty as an itemized budget, not a single number**: `calibrations.uncertainty_budget` stores every contribution (Type A fit-residual scatter, Type B reference-standard/resolution/nominal-accuracy) as its own row rather than only the final combined/expanded numbers, so the certificate and UI can show — and a future auditor can verify — exactly how the reported uncertainty was built up (GUM Annex H.1). See `CALIBRATION.md` for the full methodology.
- **Decision rule stored per calibration, not global**: `decision_rule` defaults to `simple_acceptance` (uncertainty-blind tolerance comparison) so existing historical records are not reinterpreted; a calibration technician can opt into `guard_band_w_uncertainty` or `shared_risk` per event, and the choice is persisted and printed on the certificate rather than being an ephemeral UI toggle.
- **`calibrations.coverage_factor` is an output, not an input**: earlier revisions let a user type in an arbitrary coverage factor for the "normal" distribution case; it's now always derived from `confidence_level` (and, for `t`/`chi_squared`, the fit's effective degrees of freedom too), since a hand-picked k disconnected from the stated confidence level isn't statistically meaningful. The column still exists and is still populated — just never from a form field.
- **"% FS" as a unit, not a separate type field**: `sensors.accuracy_unit` / `resolution_unit` / `uncertainty_unit` can hold the literal string `%FS` instead of a physical unit, meaning "value is a percentage of (measurement_max − measurement_min)" rather than introducing a parallel `*_type` column for each of the three fields. `accuracy_type` still exists as a real column (other code depends on its `absolute`/`percent_of_full_scale` values) but is now auto-set from `accuracy_unit` rather than user-editable.
- **Sensor nominal accuracy is per-calibration, not silently channel-fixed**: `sensors.measurement_uncertainty` pre-fills the wizard's Type B "Sensor nominal accuracy" field as a manufacturer-spec default, but the value folded into a given calibration's `uncertainty_budget` is whatever was in that editable wizard field at save time — a technician can override or clear it per event without touching the channel's stored default.
- **Coefficients-only calibrations skip the budget/conformity fields, not fabricate them**: when a calibration is entered from a certificate's stated coefficients (no raw data), `calibrations.r_squared`/`rmse`/`decision_rule`/`conformity_statement` stay `null` — there's no assessed error to compute a fit or a pass/fail statement from. If the certificate also states an expanded uncertainty, it's stored as-is (`expanded_uncertainty`/`coverage_factor`/`combined_uncertainty = expanded/k`) plus a single `uncertainty_budget` row tagged `external_certificate_stated`, rather than decomposed into a fabricated Type A/B breakdown.
