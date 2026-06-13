# Database Architecture

MAR (Measurement Asset Registry) uses PostgreSQL as its absolute source of truth. The database design prioritizes traceability, auditability, and historical integrity above all else. 

## Core Principles

1. **UUIDv4 Primary Keys**: We use UUIDs across the board to prevent measurable entity counts and enable predictable offline ID generation (such as creating asset tags prior to DB sync).
2. **Traceability Mixin**: Every critical table contains foundational tracking:
   - `created_at` (Timestamp)
   - `updated_at` (Timestamp)
   - `created_by` (UUID reference to User)
   - `is_active` (Boolean, defaults to True for soft deletion)
3. **Optimistic Concurrency & Auditability**: Critical tables containing measurement configuration or hardware statuses include a `version` (Integer) column.
4. **Immutability of Calibration Data**: Calibrations and coefficients are treated as point-in-time facts (like git commits). Previous versions are retained, not overwritten.

## Schema Hierarchy

The relational hierarchy maps strictly to modern industrial and lab environments:

### 1. Organizations
The root grouping layer. Represents the top-level company, customer, or enterprise managing the platform.
- **`id`**: UUID
- **`name`**: String
- *Has many Sites.*

### 2. Sites
Physical or logical locations operating under an Organization.
- **`id`**: UUID
- **`organization_id`**: UUID (Foreign Key)
- **`name`**: String
- **`location`**: Text
- *Has many Laboratories.*

### 3. Laboratories
Distinct functional groups or rooms within a Site where assets reside or are managed.
- **`id`**: UUID
- **`site_id`**: UUID (Foreign Key)
- **`name`**: String
- *Has many Assets.*

### 4. Assets
The actual sensors, data acquisition systems, measuring instruments, or reference standards.
- **`id`**: UUID
- **`laboratory_id`**: UUID (Foreign Key)
- **`name`**: String
- **`description`**: Text
- **`asset_tag`**: String (Unique, indexed. Used for physical QR code mapping.)
- **`manufacturer`**: String
- **`model`**: String
- **`serial_number`**: String
- **`status`**: String (Enum representing state: `active`, `in_calibration`, `out_of_service`)
- **`asset_type`**: String (Enum representing class: `sensor`, `instrument`, `reference_standard`)
- **`version`**: Integer (Monotonically approaches for auditing asset updates)
- **`archived_at`**: Timestamp (Optional, populated on decommission/soft-deletion status)

## Design Decisions

* **Normalization**: The schema is strictly normalized up to the `Asset`. We avoid JSONB columns for standard relational properties, keeping queries fast and easily exportable.
* **Database Enums**: String fields such as `status` and `asset_type` will use application-enforced values or PostgreSQL `ENUM` types to maintain rigid data consistency.
* **Soft Deletes**: Implementing `is_active = false` allows the system to maintain foreign key integrity on historical calibration records while hiding the asset from primary views. Hard deletes are explicitly disallowed by the business logic tier.