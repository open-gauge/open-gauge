# MAR Database Schema

MAR uses PostgreSQL as its authoritative source of truth. The schema is designed around **traceability, auditability, and historical integrity** — calibration data is immutable; records are soft-deleted, never hard-deleted; every important action is logged.

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
└── Site
    └── Laboratory
        └── Asset
            ├── Calibration (append-only)
            │   ├── CalibrationCoefficients
            │   └── Certificate
            │       └── File
            └── File (datasheets, images)
```

---

## Tables

---

### `organizations`

The root grouping. Represents a company, customer, or enterprise running MAR.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `name` | VARCHAR(255) | NOT NULL | Display name |
| `description` | TEXT | nullable | |
| `is_active` | BOOLEAN | NOT NULL, default true | Soft delete flag |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `sites`

Physical or logical locations belonging to an organization.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `organization_id` | UUID | FK → organizations, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | e.g. "Plant A", "Madrid Lab" |
| `description` | TEXT | nullable | |
| `location` | TEXT | nullable | Address or coordinates |
| `is_active` | BOOLEAN | NOT NULL, default true | |
| `archived_at` | TIMESTAMPTZ | nullable | |
| `created_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `laboratories`

Functional groups or rooms within a site.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `site_id` | UUID | FK → sites, NOT NULL | |
| `name` | VARCHAR(255) | NOT NULL | e.g. "Pressure Lab", "Clean Room 1" |
| `description` | TEXT | nullable | |
| `is_active` | BOOLEAN | NOT NULL, default true | |
| `archived_at` | TIMESTAMPTZ | nullable | |
| `created_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

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

### `assets`

Sensors, instruments, reference standards, and data acquisition systems.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | VARCHAR(20) | NOT NULL, UNIQUE, indexed | e.g. `MAR-00421` |
| `laboratory_id` | UUID | FK → laboratories, nullable | Where the asset lives |
| `name` | VARCHAR(255) | NOT NULL | e.g. "Reactor Inlet PT-01" |
| `description` | TEXT | nullable | |
| `category` | ENUM | NOT NULL | `sensor`, `instrument`, `reference_standard`, `data_acquisition` |
| `manufacturer` | VARCHAR(255) | NOT NULL | |
| `model` | VARCHAR(255) | NOT NULL | |
| `serial_number` | VARCHAR(255) | nullable | |
| `firmware_version` | VARCHAR(100) | nullable | For smart/IoT instruments |
| `purchase_date` | DATE | nullable | |
| `warranty_expiry_date` | DATE | nullable | |
| `calibration_status` | ENUM | NOT NULL, default `not_calibrated` | `valid`, `due_soon`, `expired`, `not_calibrated` |
| `calibration_interval_days` | INTEGER | nullable | How often calibration is required |
| `next_due_at` | TIMESTAMPTZ | nullable | Computed from last calibration + interval |
| `power_supply` | VARCHAR(100) | nullable | Power supply requirements, e.g. `24 VDC` |
| `power_consumption_w` | INTEGER | nullable | Power consumption in watts |
| `dimensions` | VARCHAR(100) | nullable | Physical dimensions, e.g. `100×50×30 mm` |
| `weight_kg` | DECIMAL(10,3) | nullable | Weight in kilograms |
| `datasheet_file_id` | UUID | FK → files, nullable | PDF datasheet |
| `notes` | TEXT | nullable | Free-form technician notes |
| `is_active` | BOOLEAN | NOT NULL, default true | |
| `retired_at` | TIMESTAMPTZ | nullable | |
| `retired_by` | UUID | FK → users, nullable | |
| `retired_reason` | TEXT | nullable | |
| `version` | INTEGER | NOT NULL, default 1 | Incremented on each update |
| `created_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |
| `updated_at` | TIMESTAMPTZ | NOT NULL, default now() | |

**Category descriptions:**
- `sensor` — physical transducer measuring a quantity
- `instrument` — device that measures, processes, or indicates a physical quantity (e.g. force gauge, multimeter)
- `reference_standard` — high-accuracy device used for calibration
- `data_acquisition` — DAQ systems, loggers, or IoT gateways

### `sensors`

Sensors and reference standards. It's a subtype of `assets` with additional physical and electrical properties.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | UUID | FK → assets, NOT NULL, UNIQUE | |
| `sensor_type` | ENUM | NOT NULL | See sensor types below |
| `measurement_range` | VARCHAR(100) | nullable | The measurement range of the asset, e.g. `0–100` |
| `measurement_unit` | VARCHAR(50) | nullable | The unit of measurement, e.g. `°C`, `bar` |
| `operating_range` | VARCHAR(100) | nullable | The operating range of the asset without damage, e.g. `0–100` |
| `operating_temperature_range` | VARCHAR(100) | nullable | Operating temperature range in degrees Celsius, e.g. `-20–80 °C` |
| `output_signal` | VARCHAR(100) | nullable | e.g. `4–20` |
| `output_signal_unit` | VARCHAR(50) | nullable | The unit of the output signal, e.g. `mA`, `V` |
| `health_score` | INTEGER | NOT NULL, default 100 | 0–100 composite score |

**Sensor types (`sensor_type`):**
`temperature`, `pressure`, `flow`, `humidity`, `electrical`, `distance`, `angle`, `force`, `angular speed`, `acceleration`, `other`

### `instruments`

Instruments and transducers. It's a subtype of `assets` with additional physical and electrical properties.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | UUID | FK → assets, NOT NULL, UNIQUE | |
| `instrument_type` | ENUM | NOT NULL | See instrument types below |
| `measurement_range` | VARCHAR(100) | nullable | The measurement range of the asset, e.g. `0–100` |
| `measurement_unit` | VARCHAR(50) | nullable | The unit of measurement, e.g. `°C`, `bar` |
| `operating_range` | VARCHAR(100) | nullable | The operating range of the asset without damage, e.g. `0–100` |
| `operating_temperature_range` | VARCHAR(100) | nullable | Operating temperature range in degrees Celsius, e.g. `-20–80 °C` |
| `output_signal` | VARCHAR(100) | nullable | e.g. `4–20` |
| `output_signal_unit` | VARCHAR(50) | nullable | The unit of the output signal, e.g. `mA`, `V` |
| `health_score` | INTEGER | NOT NULL, default 100 | 0–100 composite score |

**Instrument types (`instrument_type`):**
`transmitter`, `controller`, `indicator`, `recorder`, `other`

### `data_acquisition`
Data acquisition systems, loggers, and IoT gateways. It's a subtype of `assets` with additional physical and electrical properties.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `asset_id` | UUID | FK → assets, NOT NULL, UNIQUE | |
| `daq_type` | ENUM | NOT NULL | See DAQ types below |
| `input_channels` | INTEGER | NOT NULL | Number of input channels |
| `output_channels` | INTEGER | NOT NULL | Number of output channels |
| `sampling_rate_hz` | DECIMAL(10,2) | nullable | Maximum sampling rate in Hz |
| `communication_protocol` | VARCHAR(100) | nullable | e.g. `Modbus`, `OPC UA`, `MQTT` |
| `ADC_resolution` | DECIMAL(10,2) | nullable | ADC resolution in bits |


**DAQ types (`daq_type`):**
`data_logger`, `signal_conditioner`, `gateway`, `other`

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
| `performed_by_name` | VARCHAR(255) | NOT NULL | Name of who performed it (denormalized for history) |
| `external_lab_name` | VARCHAR(255) | nullable | If done by external lab |
| `external_lab_accreditation` | VARCHAR(255) | nullable | e.g. ISO 17025 cert number |
| `result` | ENUM | NOT NULL | `pass`, `fail`, `conditional_pass` |
| `temperature_c` | DECIMAL(6,2) | nullable | Environmental condition |
| `humidity_pct` | DECIMAL(5,2) | nullable | Environmental condition |
| `pressure_hpa` | DECIMAL(8,2) | nullable | Environmental condition |
| `notes` | TEXT | nullable | |
| `certificate_id` | UUID | FK → certificates, nullable | The certificate for this calibration |
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
| `channel` | VARCHAR(50) | nullable | For multi-channel instruments (e.g. "CH1", "Axis X") |
| `coefficient_type` | ENUM | NOT NULL | `linear`, `polynomial` |
| `offset` | DECIMAL(18,8) | nullable | For linear: y = gain·x + offset |
| `gain` | DECIMAL(18,8) | nullable | For linear correction |
| `poly_degree` | INTEGER | nullable | Degree for polynomial fit |
| `poly_coefficients` | JSONB | nullable | `[a0, a1, a2, ...]` lowest-to-highest degree |
| `unit_input` | VARCHAR(50) | nullable | e.g. `mV`, `mA` |
| `unit_output` | VARCHAR(50) | nullable | e.g. `°C`, `bar` |
| `range_min` | DECIMAL(18,4) | nullable | Valid range minimum |
| `range_max` | DECIMAL(18,4) | nullable | Valid range maximum |
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
| `calibration_id` | UUID | FK → calibrations, nullable | The calibration this cert belongs to |
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
| `checksum_sha256` | VARCHAR(64) | NOT NULL | For integrity verification |
| `entity_type` | VARCHAR(50) | NOT NULL | `certificate`, `asset_image`, `datasheet`, `raw_calibration` |
| `entity_id` | UUID | nullable | ID of the related entity |
| `uploaded_by` | UUID | FK → users, NOT NULL | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now() | |

---

### `audit_logs`

Immutable append-only audit trail. Captures every significant action in the system.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | UUID | PK | |
| `actor_id` | UUID | FK → users, nullable | null for system actions |
| `actor_email` | VARCHAR(255) | NOT NULL | Denormalized — preserves history if user is deleted |
| `action` | VARCHAR(100) | NOT NULL, indexed | Dot-namespaced: `asset.created`, `calibration.recorded`, `user.login` |
| `entity_type` | VARCHAR(50) | NOT NULL, indexed | `asset`, `calibration`, `certificate`, `user`, `site` |
| `entity_id` | UUID | nullable, indexed | |
| `entity_asset_id` | VARCHAR(20) | nullable | For assets — enables fast lookup by MAR ID |
| `before_state` | JSONB | nullable | Snapshot of entity before change |
| `after_state` | JSONB | nullable | Snapshot of entity after change |
| `ip_address` | VARCHAR(45) | nullable | Supports IPv6 |
| `user_agent` | VARCHAR(500) | nullable | |
| `created_at` | TIMESTAMPTZ | NOT NULL, default now(), indexed | |

**Common action values:**
`asset.created`, `asset.updated`, `asset.archived`, `calibration.recorded`, `certificate.uploaded`, `user.login`, `user.created`, `user.deactivated`

---

### `calibration_throughput`

Pre-aggregated monthly calibration statistics. Used by the dashboard.

| Column | Type | Constraints | Description |
|---|---|---|---|
| `id` | INTEGER | PK, auto-increment | |
| `year` | INTEGER | NOT NULL | |
| `month` | INTEGER | NOT NULL, 1–12 | |
| `completed_count` | INTEGER | NOT NULL, default 0 | Calibrations with result = pass/conditional |
| `expired_count` | INTEGER | NOT NULL, default 0 | Assets that expired in this month |

**Unique constraint:** `(year, month)`

> This table is a materialized aggregate, updated by a background job or trigger. It is not the source of truth — `calibrations` is.

---

## Relationships Summary

```
organizations ─┬─< sites >─< laboratories >─< assets
               │                                 │
               └─< users                         ├─< calibrations >─< calibration_coefficients
                                                 │        │
                                                 │        └─< certificates >─< files
                                                 │
                                                 └─< files (images, datasheets)

audit_logs  →  (references entities loosely by UUID + entity_type)
```

---

## Indexes (beyond PKs and FKs)

| Table | Column(s) | Reason |
|---|---|---|
| `assets` | `asset_id` | Primary lookup key for humans and QR codes |
| `assets` | `calibration_status` | Dashboard filtering |
| `assets` | `next_due_at` | Upcoming calibration queries |
| `assets` | `laboratory_id` | Scoped asset lists |
| `calibrations` | `asset_id` | History lookup |
| `calibrations` | `calibration_date` | Date range queries |
| `certificates` | `asset_id` | Certificate lookup by asset |
| `audit_logs` | `entity_id` | Entity history lookup |
| `audit_logs` | `actor_id` | User activity lookup |
| `audit_logs` | `created_at` | Time-range audit queries |
| `audit_logs` | `action` | Action-type filtering |
| `users` | `email` | Login lookup |

