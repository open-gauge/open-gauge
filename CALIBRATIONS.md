# Calibration Feature — Requirements & Implementation Plan

## Overview

A calibration record captures a full metrological event for a specific sensor channel: the raw measurement data collected against a reference, the regression model fitted to that data, the statistical analysis of the fit, and the resulting pass/fail decision.

Calibrations are immutable once confirmed. Every calibration creates a new version; nothing is ever overwritten. This matches the Git-like traceability principle in AGENTS.md.

---

## Terminology

| Term | Meaning |
|---|---|
| Calibration | A full metrological event: one channel, one date, one result |
| Version | Auto-incremented integer per (asset, channel) pair |
| Raw data | The set of (reference, measured) point pairs collected during the event |
| Coefficients | Polynomial or linear correction coefficients derived from the regression |
| Analysis | Statistical evaluation of the fit quality and measurement uncertainty |
| Pass/Fail | Decision based on whether the fitted error falls within the allowed accuracy of the channel |

---

## Data Model

### Schema additions required (migration 004)

#### `calibrations` table — new and modified columns

```sql
-- New columns
sensor_id          UUID REFERENCES sensors(id)              -- specific channel
calibration_type   VARCHAR(20) NOT NULL DEFAULT 'external'  -- 'internal' | 'external'
reference_asset_id UUID REFERENCES assets(id)               -- internal only
calibration_method_id UUID REFERENCES calibration_methods(id) -- internal only
certificate_number VARCHAR(255)                             -- external only
certificate_expiry_date DATE                                -- external only
calibration_interval INTEGER                                -- months (not days)
version            INTEGER NOT NULL DEFAULT 1               -- per (asset, sensor_id)

-- Modified: environmental conditions now carry explicit units
temperature_value  NUMERIC(10, 4) DEFAULT 'K'                 -- SI unit
pressure_value     NUMERIC(12, 4) DEFAULT 'Pa'
humidity_value     NUMERIC(8, 4) DEFAULT '%RH'
```
> No need to keep the backward-compatible columns as they haven't been used yet. We can remove them in a future migration. Values are stored in SI and convert on the frontend. This simplifies the backend logic and storage, and since the UI already has the `toSI` conversion function, it can handle any unit conversions before sending data to the API.

#### `calibration_coefficients` table — additional statistics columns

```sql
-- Regression quality
r_squared              NUMERIC(10, 8)
rmse                   NUMERIC(18, 8)
standard_error         NUMERIC(18, 8)
max_error              NUMERIC(18, 8)
full_scale_error_pct   NUMERIC(8, 4)
non_linearity_pct      NUMERIC(8, 4)
repeatability          NUMERIC(18, 8)   -- NULL if not detectable
hysteresis             NUMERIC(18, 8)   -- NULL if not detectable

-- Uncertainty
distribution_type      VARCHAR(20)      -- 'normal' | 't' | 'chi_squared'
confidence_level       NUMERIC(5, 2)    -- e.g. 95.0
combined_uncertainty   NUMERIC(18, 8)
expanded_uncertainty   NUMERIC(18, 8)

-- Valid range (where the fit was applied)
valid_range_min        NUMERIC(18, 8)
valid_range_max        NUMERIC(18, 8)
```

#### New table: `calibration_points`

Stores the raw and derived data for each calibration event.

```sql
CREATE TABLE calibration_points (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    calibration_id   UUID NOT NULL REFERENCES calibrations(id) ON DELETE CASCADE,
    point_index      INTEGER NOT NULL,           -- ordering
    reference_value  NUMERIC(18, 8) NOT NULL,   -- in SI units
    measured_value   NUMERIC(18, 8) NOT NULL,   -- in SI units
    calculated_value NUMERIC(18, 8),            -- corrected output from model
    residual_abs     NUMERIC(18, 8),            -- measured - calculated
    residual_pct     NUMERIC(10, 4),            -- residual as % of span
    reference_unit   VARCHAR(50) NOT NULL,      -- display unit used in UI
    measured_unit    VARCHAR(50) NOT NULL,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX ix_calibration_points_calibration_id ON calibration_points(calibration_id);
```

---

## API Endpoints

### New endpoint: analyze (ephemeral, not stored)

```
POST /api/v1/calibrations/analyze
```

Accepts raw data + analysis parameters and returns regression results in real time. Nothing is saved.

**Request body:**

```json
{
  "points": [
    { "reference": 0.0, "measured": 0.01 },
    { "reference": 25.0, "measured": 25.12 }
  ],
  "reference_unit": "°C",
  "measured_unit": "°C",
  "physical_quantity": "temperature",
  "poly_degree": null,           // null = auto-select
  "distribution_type": "normal",
  "confidence_level": 95.0,
  "coverage_factor": 2.0,
  "channel_accuracy_value": 0.5,
  "channel_accuracy_type": "absolute"
}
```

**Response:**

```json
{
  "poly_degree": 1,
  "coefficients": [0.9985, 0.023],
  "r_squared": 0.99998,
  "rmse": 0.012,
  "standard_error": 0.011,
  "max_error": 0.025,
  "full_scale_error_pct": 0.10,
  "non_linearity_pct": 0.05,
  "repeatability": null,
  "hysteresis": null,
  "combined_uncertainty": 0.15,
  "expanded_uncertainty": 0.30,
  "distribution_type": "normal",
  "confidence_level": 95.0,
  "coverage_factor": 2.0,
  "valid_range_min": 0.0,
  "valid_range_max": 100.0,
  "pass": true,
  "points": [
    {
      "point_index": 0,
      "reference_value": 0.0,
      "measured_value": 0.01,
      "calculated_value": 0.023,
      "residual_abs": -0.013,
      "residual_pct": -0.013
    }
  ]
}
```

### Extended POST /api/v1/calibrations

The existing create endpoint is extended to accept the full calibration payload in one atomic call:

```
POST /api/v1/calibrations
```

**Additional fields in request:**

```json
{
  "sensor_id": "uuid",
  "calibration_type": "internal",
  "reference_asset_id": "uuid",
  "calibration_method_id": "uuid",
  "certificate_number": null,
  "certificate_expiry_date": null,
  "calibration_interval": 12,
  "version": 3,
  "temperature_value": 293.15,
  "temperature_unit": "K",
  "pressure_value": 101325.0,
  "pressure_unit": "Pa",
  "humidity_value": 50.0,
  "humidity_unit": "%RH",
  "coefficients": { ... },
  "points": [ ... ]
}
```

The backend creates the `Calibration`, `CalibrationCoefficient` (with statistics), and all `CalibrationPoint` rows in a single transaction.

### New endpoint: raw data

```
GET /api/v1/calibrations/{id}/points
```

Returns the stored calibration points for display in history view.

### Existing endpoint changes

```
GET /api/v1/assets/{id}/calibrations
```

Extended response to include `sensor_id`, `version`, `calibration_type`, `certificate_number`.

---

## Backend: Analysis Engine

File: `apps/api/app/services/calibration_analysis.py`

Responsibilities:
- Polynomial regression (degree 1–5, auto-select via AIC/BIC if `poly_degree` is null)
- Residual computation
- Uncertainty propagation (normal, t-distribution, chi-squared)
- Hysteresis and repeatability detection (checks for ascending/descending sequence patterns)
- Pass/fail evaluation against channel accuracy spec

Dependencies: `numpy`, `scipy` — both are standard scientific Python packages already expected in the environment.

Auto-selection algorithm:
1. Fit degrees 1 through 5.
2. Compute AIC for each: `AIC = n·ln(RSS/n) + 2k` where k = degree + 1.
3. Select the degree with the lowest AIC. If AIC improvement from degree d to d+1 is < 2, stop at d (parsimony).

---

## Frontend: Calibration Wizard

### Location

A modal overlay on the asset detail page, triggered from the Calibrations tab in edit mode.

File: `apps/web/src/app/(app)/assets/[id]/CalibrationWizard.tsx`

### Step structure

```
Step 1: General Information
Step 2: Raw Data
Step 3: Analysis & Results  ← "Confirm" button appears here
```

Progress is shown with a step indicator at the top of the modal.

### Step 1 — General Information

Fields:
- **Version** (read-only, auto-fetched: `GET /api/v1/assets/{id}/calibrations?sensor_id=X&count=true`)
- **Channel** (dropdown from `profile.sensor_channels`)
- **Calibration Date** (date input, defaults to today)
- **Calibration Interval** (integer, months)
- **Calibration Type** (select: Internal / External)
- **Environmental Conditions** (optional expandable section):
  - Temperature: value + unit selector (°C / K / °F)
  - Pressure: value + unit selector (Pa / hPa / bar / psi)
  - Humidity: value + unit selector (%RH)
- If **Internal**:
  - **Calibration Method** (dropdown: `GET /api/v1/calibration-methods?physical_quantity=X`)
  - **Reference Asset** (dropdown: assets with `calibration_role = reference` and same physical quantity; shows expanded uncertainty below the field)
- If **External**:
  - **Calibration Provider** (text)
  - **Certificate Number** (text)
  - **Only coefficients** (checkbox, if true, skips Step 2 and 3 and allows user to input coefficients directly)

### Step 2 — Raw Data

Two input modes (tab-switched):

**Manual table:**
- Unit row at top (selects display unit for reference and measured columns)
- Add/remove row buttons
- Each row: reference value, measured value (numeric inputs)

**CSV upload:**
- Drag-and-drop or click to upload
- Expected format: header row (`Reference,Measured`), unit row, data rows
- Preview table shown after upload; validation errors shown inline
- User can manually edit the uploaded data after upload like if it were a manual table


Values are always stored and sent in display units; the backend stores them in SI (via `toSI` conversion applied before POST).

### Step 3 — Analysis & Results

Header: "Analysis & Results"

Top view section, two panels side by side: 
  - Controls panel (left, 50% width)
  - Results panel (right, 50% width): coefficients and pass/fail badge

Bottom view section, two panels side by side:
  Left side (60% width):
  - **Results table**: Reference | Measured | Calculated | Residual (abs) | Residual (%span)
    - Hovering a row highlights the corresponding point on the graph
  - **Summary panel** below the table:
    - Valid range
    - Statistics section (R², RMSE, SE, Max Error, %FS error, Non-linearity, Repeatability†, Hysteresis†)
    - Uncertainty section (Combined, Expanded)

  Right side (40% width):
  - Top chart (75% height): scatter points + regression curve (Recharts ComposedChart)
  - Bottom chart (25% height): residual bar/line chart
  - Hovering a point highlights the corresponding table row

Controls:
- **Regression degree** (select: Auto / 1 / 2 / 3 / 4 / 5)
- **Distribution type** (select: Normal / t / Chi-squared)
- **Confidence level** (number input, %, default 95)
- **Coverage factor** (number input, default 2)

Any control change triggers a debounced `POST /api/v1/calibrations/analyze` call. Loading spinner shown on the results area while computing. Each metric has an InfoIcon + tooltip

**Pass/Fail badge** shown prominently (green PASS / red FAIL) based on analysis result.

**Confirm button** (bottom right):
- Opens a small confirmation dialog: "Save calibration record? Result: PASS / FAIL"
- On confirm: `POST /api/v1/calibrations` with all data → closes wizard → refreshes calibrations tab

### Calibration History View

Each existing calibration entry in the history list expands to show:
- General info (date, type, version, performed by, environment)
- Data table (reference, measured, calculated, residuals) — same component as Step 3 left panel
- Chart — same component as Step 3 right panel
- Coefficients and statistics summary

---

## Implementation Order

1. Migration 004 (new columns + `calibration_points` table)
2. Updated SQLAlchemy models
3. `calibration_analysis.py` service (numpy/scipy math)
4. `POST /api/v1/calibrations/analyze` endpoint
5. Extended `POST /api/v1/calibrations` + `GET /{id}/points`
6. Frontend types and service functions
7. `CalibrationWizard.tsx` — Step 1
8. `CalibrationWizard.tsx` — Step 2 (manual table + CSV upload)
9. `CalibrationWizard.tsx` — Step 3 (analysis + charts)
10. History view expansion with data/chart display

---

## Notes

- `†` Repeatability is only shown when 3+ duplicate reference values are detected in the data.
- `†` Hysteresis is only shown when both ascending and descending sweeps are detected.
- All numeric values sent to the API are in display units; the backend converts to SI before storage using the same `toSI` logic from `docs/UNITS.md`.
- The analysis endpoint is stateless and safe to call repeatedly during Step 3 editing.
- Calibration records are immutable after creation. There is no edit or delete endpoint for calibrations.
