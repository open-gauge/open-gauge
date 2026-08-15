# Versions

Open Gauge tracks one version number across the frontend and backend — see the
**Versioning** section in [`AGENTS.md`](AGENTS.md) for the policy. This log is also rendered in
the documentation site at **Reference → Versions**.

History below 1.0.0 is retrofitted from the git commit log, numbered by semantic-versioning
impact (`0.x` while the product was pre-release/unstable, `1.0.0` at the point it became a
documented, licensed, self-hostable product). Patch releases (`x.y.Z`) break out the smaller
fixes and incremental additions that landed between each minor version.

## 4.6.2

### Fixed

- **A fresh deployment's first admin could never create a location, even after creating an
  organization.** The "New location" form determined the caller's organization by reading
  `organization_id` off `GET /users/me` — a field that no longer exists on the user response
  since org membership moved to the many-to-many `OrganizationMember` table. The lookup always
  came back empty, so the form permanently showed "Could not determine your organization. Contact
  an admin." with no way to proceed, even for a user who had since created and joined an
  organization. The form now fetches the caller's actual memberships (`GET
  /organizations?mine=true`) and offers an Organization picker, the same pattern already used by
  the asset creation form.

## 4.6.1

### Fixed

- **A declared model using a custom formula could never be saved.** The calibration wizard's
  "Confirm & Save" (and "Next" out of Step 2) stayed permanently disabled for a directly-declared
  model ("Model (transfer function)") using a custom formula, instead of a polynomial — a
  leftover check depended on an analysis result that the 4.6.0 fake-statistics removal stopped
  producing. Save-eligibility for this mode now depends only on the wizard's own formula/range
  validation, which already covers the custom-formula case correctly.
- **As-Found/As-Left calibrations built from a Reference vs. Indicated method showed the wrong
  data table.** When the underlying input method was Reference vs. Indicated (no transfer
  function, no curve fit), the saved calibration's data table still labeled the reading column
  "Measured" and showed a "Fitted" column — both belong to the curve-fit variant. It now reads
  "Indicated" and omits "Fitted" for this case, matching the plain Reference vs. Indicated mode's
  table and the wizard's own Step 3.

## 4.6.0

### Added

- **Measured-signal vs. physical-magnitude valid-range entry for a declared model.** The
  calibration wizard's "Model (transfer function)" input method (Step 2) now has a switch next
  to the valid range fields: enter the range in the measured signal's own terms (x), or in the
  physical magnitude it maps to (f(x)) — the latter solves for the corresponding measured-signal
  bounds numerically (bisection), and is only offered when the model is actually invertible
  (monotonic) over the declared range.

### Fixed

- **A declared model's uncertainty/conformity numbers were fabricated, not real.** Step 3 of the
  calibration wizard used to run a directly-declared model ("Model (transfer function)") through
  the same uncertainty-budget/conformity-check machinery as a real dataset, by synthesizing two
  fake zero-residual points at the declared range's endpoints. That always produced a trivial,
  meaningless result (0 uncertainty, always conforms) — there's no real data to derive any of
  that from. Both Step 3 and the saved-calibration view now show just what's actually known for
  this mode: the model, its declared valid range (measured and the physical magnitude it maps
  to), and the curve it implies — no uncertainty budget, no conformity check, no fake
  statistics.

## 4.5.0

### Changed

- **Organizations page rebuilt as a single master-detail screen.** The list and detail views
  used to be separate routes (`/organizations` and `/organizations/{id}`); they're now one
  page — a searchable, filterable sidebar (All / Internal / Providers / Customers) next to a
  detail panel, the same two-panel pattern already used by Locations. Selecting an organization
  updates the detail panel in place instead of navigating away. Old links and notification links
  to `/organizations/{id}` (including the `?edit=1` deep link used by join-request
  notifications) still work — they now forward to the merged page. No API or data model changes.

## 4.4.2

### Added

- **`WARM_TECTONIC_CACHE` build option for the `api` image.** The Dockerfile pre-fetches
  Tectonic's LaTeX package bundle at build time so certificate generation needs no network
  access at container runtime (a self-hosted/air-gapped requirement) — but that one-time fetch
  goes through `relay.fullyjustified.net`, which has been observed rate-limiting repeated
  fetches with HTTP 429. The fetch now also runs against a BuildKit cache mount, so once one
  build succeeds, later rebuilds on the same host reuse the cached bundle instead of hitting the
  network again. For the rare case where even the first build is blocked, set
  `WARM_TECTONIC_CACHE=false` in `infrastructure/docker/.env` (default `true`) to skip the
  pre-fetch — the image still works, it just fetches the bundle lazily on first certificate
  generation instead of having it baked in. Keep it `true` for any real/air-gapped deployment.

## 4.4.1

### Fixed

- **Calibration tab's saved-record view harmonized with the wizard's Step 3.** The asset detail
  page's Calibration tab had drifted from the calibration wizard's Step 3 analysis panel it was
  meant to mirror:
  - The model panel used a hand-rolled Equation/Coefficients tab toggle with plain-text
    formatting instead of the wizard's KaTeX-rendered symbolic equation + substituted
    coefficients. Both views now share the same `ModelPanel`/`Katex` component
    (`components/calibration-model-panel.tsx`), so they can't drift apart again.
  - The statistics panel still showed a "Poly degree" row and a single combined "Valid range"
    row (reference domain only) — both dropped from the wizard's `StatisticsPanel` in an earlier
    release but never updated here. Now shows "Valid range (Measured)" and "Valid range
    (Reference)" as two separate rows, matching the wizard exactly.
  - The metadata panel (calibration date, due date, registered/checked by, type, purpose, lab)
    used a fixed 2-column grid instead of flowing horizontally across the panel.

## 4.4.0

### Added

- **Shared `Select` and `DatePicker` components, and app-wide numeric input standardization.**
  UI.md now defines consistent width tiers and behavior for the three input kinds used across
  every form in the app:
  - **Numeric inputs** — the `NumberInput` component (chevron up/down buttons, previously only
    used in the Calibration Wizard's Step 3) is now used for every numeric field app-wide, with
    a documented width-tier table (`w-16` to `w-32`, sized to the value rather than the label).
  - **Dropdowns** — a new shared `Select` component (`@/components/select`) replaces the several
    near-duplicate per-page `<select>` wrappers. It stays a native `<select>` (full keyboard nav,
    mobile picker, screen-reader support) with a restyled, theme-aware chevron in place of the
    OS arrow; the trigger caps at a documented width tier (`w-20` to a `w-64` ceiling) and
    ellipsizes long selected labels with a native `title` tooltip, while the native option popup
    still auto-sizes to the widest option regardless of the trigger's width.
  - **Date pickers** — a new shared `DatePicker` component (`@/components/date-picker`) replaces
    the native `<input type="date">` (and the `color-scheme`-based icon recoloring it needed)
    with a themed popover calendar: month navigation, a day grid with `og-accent` markers for the
    selected day and today, and a month/year quick-jump view. The field itself stays a button —
    a date is always picked from the calendar, not typed — sidestepping locale date-format
    ambiguity entirely.
  - All three components, and the width-tier tables, are documented in `UI.md` and applied across
    every screen that previously hand-rolled its own numeric input, `<select>`, or date input
    (admin, procedures, sites, assets, asset detail, calibration wizard, health tab, interface
    tab, organization detail).

## 4.3.0

### Added

- **Asset "Interface" and "CAD" tabs.** Two new asset detail tabs:
  - **Interface** — an Electrical panel (uploadable connector image + an editable pinout table
    with pin number, multi-color wire swatches, signal name with a common-name suggestion list,
    and description) and a Mechanical panel (uploadable drawing + an editable mounting-points
    table: point label, type, torque spec, description). Both panels are read-only until the
    page's own Edit button is used — the same shared Edit/Save/Cancel as the Overview tab, with
    `pinout_table`/`mechanical_table` folded into the same edit form; only image upload/removal
    stays immediate, like the asset picture. The Electrical panel adds a **Mapping** dialog to
    place each pin's marker on the connector image by clicking it while editing (click again to
    remove); outside of edit mode, hovering a pinout row previews its marker inline, and clicking
    the image opens the same dialog read-only. Mapping coordinates live on the same pinout row.
  - **CAD** — a per-asset file manager for CAD models (STL, STEP, STP, IGES, IGS, BREP; 50MB cap)
    with a live 3D preview: STL renders directly via `three`, STEP/IGES/BREP are triangulated
    in-browser by `occt-import-js` (an OpenCascade WASM build), so no file is ever converted
    server-side.
  - Backend: `mechanical_table`/`mechanical_image_id` columns on `assets` (migration 037); the
    existing `pinout_table`/`pinout_image_id` columns are reused and widened (wire colors, signal
    name, x/y mapping) rather than adding new ones. New endpoints `POST`/`DELETE
    /assets/{id}/pinout-image`, `POST`/`DELETE /assets/{id}/mechanical-image`, and
    `GET`/`POST`/`DELETE /assets/{id}/cad-files`. Asset export/import now bundles the mechanical
    image and CAD files alongside the existing media.
  - The old read-only pinout table on the Overview tab's Electrical section is removed — the
    Interface tab is now the single source of truth for pinout data.

### Fixed

- **Asset picture upload/removal was blanking the header stats.** `uploadAssetPicture`/
  `deleteAssetPicture` (and the new pinout/mechanical-image endpoints) return the slim
  `AssetResponse` shape, not the enriched profile — using that response directly to update local
  state was dropping `organization_name`/`location_name`/`calibration_status`/`next_due_at`/etc.
  from the page. Fixed by reloading the full profile after these mutations, matching the pattern
  the Overview tab's own Save flow already used.

## 4.2.0

### Added

- **Procedure export/import.** Admin and superadmin users can export procedures as ZIP bundles
  (`procedure.yaml` + a `media/steps/{n}/` folder per step attachment) and re-import them on
  another instance — `GET /procedures/{id}/export`, `POST /procedures/export/bulk`,
  `POST /procedures/import`, and `POST /procedures/import/validate` on the backend
  (`app/services/procedure_export.py` / `procedure_import.py`, mirroring the existing asset
  export/import format). On the Procedures page, **Export** and **Import** buttons sit next to
  **+ New Procedure** for bulk actions, and **+ New Procedure → Import from file** handles a
  single-procedure ZIP — both gated to admin/superadmin, unlike the asset equivalents which allow
  any non-viewer.

## 4.1.0

### Added

- **Calibration purpose tag** on each row of the Calibration tab's history list — colored by
  purpose (Initial: blue, Routine: green, After Repair: orange, Verification: purple), via a new
  `CALIBRATION_PURPOSE_STYLE` map in `apps/web/src/lib/tokens.ts` and a `tokens.calibrationPurpose`
  translation namespace, shared with the same tag now also shown in the calibration metadata panel
  below.

### Changed

- **Harmonized calibration detail view.** The Calibration tab's left-side record view now leads
  with a single metadata panel covering calibration date, due date, registered/checked by,
  calibration type and purpose, calibration lab (resolved per calibration type: manufacturer
  snapshot, external organization, or internal location), environmental conditions, and notes —
  each field with a tooltip linking to the matching wizard-field documentation. The small header
  line (`v6 · date · by name`) and the standalone Conditions & Notes panel are both gone — this one
  panel replaces them, with the Approve/Reject actions and certificate download button moved into
  its header row. Below it, the model/equation panel and the statistics/uncertainty/conformity
  panel are now laid out side by side (model left, statistics right), with the chart/data-table
  view spanning full width beneath them — mirroring the layout of step 3 of the calibration wizard
  for the record's `data_entry_mode`.

## 4.0.0

### Changed

- **Breaking: Frequency response is now a 4th calibration input mechanism, not a separate wizard
  step.** The original implementation (an optional extra step gated by a Step 1 checkbox, backed
  by a `calibration_frequency_points` table and 5 `calibrations` columns) has been fully reverted
  and reimplemented as a proper `data_entry_mode`, selected from Step 2's own Input data method
  dropdown alongside Reference vs Measured/Indicated and Model, open to any Calibration purpose.
  Enter a sweep of (frequency, reference, measured[, offset]) points; Step 3 shows one sensitivity
  panel — pick a baseline frequency and Open Gauge computes the sensitivity ratio
  (measured/reference) there, expressing every other point as a % deviation from it — with a
  sensitivity-vs-frequency chart (always) and a phase-vs-frequency chart (only with offset
  enabled), replacing the deleted feature's Method/Uncertainty/Conformity panel stack and
  dual-axis chart entirely: this mode has no curve fit, uncertainty budget, or conformity check.
  Internally represented as a polynomial-order-1, no-offset (gain-only) model, the same convention
  every other mode uses. The old `GET /calibrations/{id}/frequency-points` endpoint and its
  backing table/columns are gone (migration `035`); the new
  `GET /calibrations/{id}/frequency-response-points` endpoint and
  `calibration_frequency_response_points` table replace them (migration `036`). Any client relying
  on the old shape must migrate. See the new
  [Frequency response](apps/docs/content/docs/guide/calibration/frequency-response.mdx) guide page.

## 3.15.0

### Added

- **Mermaid diagram support in the Knowledge Center.** `apps/docs` now renders ```` ```mermaid ````
  code fences as live, theme-aware SVG diagrams (via `fumadocs-core`'s `remarkMdxMermaid` plugin
  and a new client-side `Mermaid` MDX component that loads the `mermaid` library and re-renders on
  light/dark theme changes) — available on every guide page going forward, not just the one below.
- **"Choosing a workflow" section on the Calibration overview guide**, with a flowchart tracing
  every combination of Calibration purpose and Step 2's input data method through to its outcome —
  what gets a fitted equation, what's residual-only, what's diagnostic-only, and what always feeds
  the due date/Health tab regardless of path.

## 3.14.0

### Added

- **Calibration method for raw data.** Step 3 (Analysis) of a raw-data calibration offers a
  **Calibration method** selector alongside the regression degree — **Polynomial Fit** (default),
  **Lookup Table** (no curve fit; the entered points *are* the model, linearly interpolated —
  R²/RMSE/max error/non-linearity hidden since they're trivially perfect, but the uncertainty
  budget and conformity check still compute normally), and **Custom Formula** (write a formula
  shape with free parameters, e.g. `a*x*sin(x) + b`, fit via nonlinear regression). Any
  custom-formula input (this method, and `model_direct`'s own) auto-detects free parameter names
  as you type — see the new "Custom formula syntax" doc page.
- **Lookup Table linearity deviation chart.** Since an exact interpolant has no fitted curve,
  non-linearity doesn't apply — Open Gauge instead fits a straight line through the calibration's
  own points and charts how far the piecewise-linear interpolation strays from it
  (absolute/relative %FS), with markers at the entered points. Diagnostic only, not compared
  against a tolerance.
- **`NumberInput` component** (`@/components/number-input`) — theme-aware chevron up/down buttons
  replacing the browser's native, unstyleable number-input spinner app-wide; typing, arrow keys,
  and the scroll-wheel all still work. Native date inputs are themed per color scheme too (the
  calendar icon recolors for light/dark via `color-scheme`, no per-field change needed). UI.md
  gained a "Compact Numeric Inputs" section documenting the pattern: size inputs to their content,
  shorten/truncate long labels, use `NumberInput`.

### Changed

- **Step 3 (Analysis) reorganized** into three panels: **Method** (raw data only — the
  Calibration method dropdown with its dependent field, laid out horizontally), **Uncertainty
  calculation** (distribution, confidence level with a live coverage-factor readout, and opt-in
  Sensor nominal accuracy / Reference standard uncertainty toggles, each shown in a fixed unit as
  plain text with a refresh icon restoring the channel's own default), and **Conformity
  assessment** (decision rule dropdown, always-visible Error/Uncertainty/Tolerance boxes forming
  the real `[error] ± [uncertainty] ≤ [tolerance]` expression, an editable Tolerance box that
  locks to Sensor nominal accuracy while that toggle is on, and a CONFORMS/DOES NOT CONFORM
  badge). All three are hidden for Lookup Table, whose points are exact by construction. The
  Statistics panel's valid range now splits into two lines (measured signal, physical quantity)
  and dropped its redundant polynomial-degree row (already visible in the Model panel). The old
  "Equation" panel is now "Model" — two theme-aware LaTeX rows (general form, numeric
  coefficients) sharing one horizontal scroll region between them instead of each row scrolling
  independently.
- **Calibration wizard: input-data method selection is now Step 2's own dropdown** ("Input data")
  — **Reference vs Measured** (renamed from "Raw data," unchanged behavior), **Reference vs
  Indicated**, or **Model (transfer function)** — with the rest of the step rendering immediately
  below the current selection.
- **Reference vs Indicated** now uses the channel's physical-quantity unit for its second column
  instead of the raw output-signal unit, is available for every Calibration purpose (not just
  Verification), and Step 3 labels that column "Indicated" with no separate "Fitted" column
  (meaningless when there's no fit).
- **As-Found/As-Left is now an automatic consequence of Calibration purpose = After Repair**,
  applied to Reference vs Measured or Reference vs Indicated, instead of its own
  separately-selectable method. Reference vs Measured can now curve-fit both sides independently,
  even to different polynomial degrees, since the instrument's behavior may have genuinely
  changed across the repair. Step 2's as-found/as-left tables sit side by side, sharing one
  Reference/Measured unit row above both; Step 3 shares one Uncertainty calculation and
  conformity-criteria (decision rule + tolerance) panel across both sides, with two columns below
  showing each side's own criteria readout (`[error] ± [uncertainty] ≤ [tolerance]` + CONFORMS/
  DOES NOT CONFORM badge), model (if fitted), and statistics.
- The Health tab's curve-comparison dropdown excludes Lookup Table calibrations (no formula/
  coefficients to compare, only its own points) — same treatment as reference-vs-indicated/
  as-found-as-left modes.

### Fixed

- Conformity assessment panel's "locked to sensor accuracy" / "no accuracy spec" explanatory text
  under the Tolerance box, and the saved-calibration detail view's Lookup Table equation readout
  for curve-fit As-Found/As-Left records — both had briefly regressed during the panel reworks
  above.

## 3.13.0

### Added

- **Alternative calibration data-entry modes.** A calibration's data can now be entered four
  ways, selected on the wizard's Step 1 (**Data entry mode**): the existing **raw data**
  (reference vs. output signal, fitted to a curve); **model provided directly** — a lab/
  manufacturer certificate that states the model itself (a polynomial or a **custom formula** in
  a single variable `x`), its valid range, and the same uncertainty-budget inputs raw data
  collects, with conformity assessed by treating the model as trusted-as-declared; **reference vs.
  indicated value** (verification only) — a lab-delivered reference/already-converted-value
  comparison with no known transfer function, yielding statistics/uncertainty/conformity but no
  fitted curve, rendered via a residuals-only chart; and **reference vs. as-found/as-left value**
  (after repair only) — the same fit-free comparison recorded twice, before and after the repair,
  with as-left driving the record's official result (due date, approval, Health tab) and as-found
  kept as read-only diagnostic data.
- **Custom formula models.** A `model_direct` calibration's model can be a polynomial or a
  single-variable formula (`+ − * / ^ ( )`, `sqrt exp log ln sin cos tan abs pow`), fully evaluable
  — it participates in the saved calibration's fitted-curve chart and the Health tab's drift/curve
  comparison exactly like a polynomial, evaluated independently on each side via a shared,
  restricted expression whitelist.

### Changed

- The Health tab's curve-comparison dropdowns now only offer calibrations that have an evaluable
  model, and show an explanatory empty state instead of a generic error when a channel has fewer
  than two.
- Calibration certificates now render a custom formula's equation directly instead of a blank
  coefficients table. A saved calibration's detail view gained a diagnostic "as-found" panel for
  after-repair calibrations recorded via the new as-found/as-left mode.

## 3.12.0

### Added

- **Residuals chart.** A new chart appears under the calibration model's fitted-curve chart on
  both the wizard's analysis step and a saved calibration's detail view — reference standard
  measurement on the x-axis, residuals (absolute or relative %, via a toggle) on the y-axis, with
  a zero reference line and full hover detail. Built as a shared component so both screens stay
  in sync, and sized so the two stacked charts together match the height of the adjacent
  statistics panel.
- **Environmental condition uncertainty.** Temperature, pressure, and humidity readings on a
  calibration can now each carry their own ± uncertainty, entered on the wizard's Step 1 and
  shown alongside the reading wherever environmental conditions are displayed. Pressure now
  defaults to hPa instead of Pa.
- **Doc-linked tooltips on every wizard Step 1 field**, each pointing at a new field-by-field
  reference page (Reference → Calibration → "Calibration wizard field reference") with an example
  for how to fill it.

### Changed

- **Wizard Step 1 layout.** Calibration date and interval now share a row; the "Add frequency
  response" and "Coefficients only" switches moved to a single row directly above Environmental
  Conditions; the calibration certificate upload is now a drag-and-drop dropzone, matching the
  pattern used elsewhere in the wizard.
- **Toggle switches no longer show "On"/"Off" text next to the control anywhere in the app** — a
  toggle's own meaningful adjacent label (e.g. "Private", "Include in budget") already says what
  it does; the redundant state word is gone.

## 3.11.0

### Added

- **Calibration type and purpose.** Every calibration now records a **type** — **OEM**,
  **External Accredited Lab**, **Internal Lab (In-house)**, or **Customer's Asset** — which drives
  what the **Calibration lab** field resolves to (a read-only manufacturer snapshot, a picker over
  external organizations marked as providers/customers, or the existing internal-location picker,
  respectively) and, for OEM/External Accredited Lab, unlocks an optional PDF **Calibration
  certificate** upload (validated by content type and file signature) that takes priority over the
  system-generated certificate everywhere it's downloaded, and appears — badged, non-deletable —
  in the asset's Files tab. Every calibration also records a **purpose** — **Initial** (defaulted
  automatically for a channel's first calibration), **Routine**, **After Repair**, or
  **Verification**. Recording an After Repair calibration captures a repair date/description and
  adds a before/after-repair period dropdown to the Health tab, so drift and stability metrics can
  be compared across a repair instead of always spanning the full, repair-mixed history.

## 3.10.0

### Added

- **Calibration approval workflow.** Every calibration now has a status — **valid**, **pending
  approval**, **rejected**, or **void** — instead of just active/voided. Naming an optional
  **Checked by** reviewer on the wizard's Step 1 (a new field alongside the renamed
  **Registered by**, both now real dropdowns of the asset's organization members instead of a
  self/free-text toggle) puts the new calibration into pending approval; only a valid calibration
  counts for the channel's calibration, due-date calculations, and drift analysis — pending and
  rejected are excluded exactly like voided always was. The assigned checker (or an admin
  override) approves or rejects it from its row in the Calibration tab, with notifications
  (in-app and email) to the checker on assignment and to the registrant on decision. Void remains
  an always-available admin override reachable from any status. The calibration-visibility toggle
  is renamed **"Show Valid Calibrations"**.

## 3.9.0

### Added

- **Internal vs. external organizations.** Every organization now has a category — **Internal**
  (the existing self-service, joinable workspace, unchanged) or **External**, a directory entry
  for an organization outside the system with a calibration relationship to it, typed as a
  **Provider** (an OEM or accredited lab supplying calibration services) or a **Customer**
  (receiving them). External organizations carry a contact email/phone (distinct from the
  organization's general email/phone), a structured address (street/city/state/postal
  code/country, independent of the location tree used for asset locations), and a VAT number, and
  have no members. Seeing, creating, editing, and deactivating an external organization is
  restricted to Admin and Super Admin — every other role never sees one, including by direct URL.
  The Organizations list gained an Internal/External/Both filter (Admin/Super Admin only), and a
  further Provider/Customer/Both filter when External is selected.

## 3.8.0

### Added

- **Frequency response data entry in the calibration wizard.** An optional "Add Frequency
  Response" checkbox on Step 1 inserts a new step for capturing an amplitude (dB, RMS,
  Peak-to-Peak, or Peak) and/or phase (degrees or radians) sweep against frequency, via manual
  entry or CSV upload. The step live-plots the entered points with no server round-trip — a
  single-axis chart when only amplitude or only phase is captured, or a stacked Bode-style
  layout (amplitude on top, phase below, sharing one x-axis) when both are, with automatic
  logarithmic frequency-axis detection for sweeps spanning a decade or more. Saved sweeps are
  stored in a new `calibration_frequency_points` table and shown on the calibration detail page
  in a new "Frequency Response" panel with an interactive chart and data table.

## 3.7.0

### Added

- **Unsaved-changes guard on the asset detail page.** Opening the calibration wizard while the
  asset is in edit mode with unsaved changes now shows a confirmation dialog offering to save
  those changes first or discard them, instead of silently losing them. Built on the shared
  `ConfirmModal` component; the guard (`guardBeforeLeavingEdit`) is written to be reusable for
  any future action that would otherwise discard an in-progress asset edit.

## 3.6.1

### Changed

- **Scrollbars now match the app's own colors instead of the browser default** — themed
  globally in `globals.css` (thin, fully rounded thumb in `--og-border-md`, transparent track,
  accent color on hover), documented in `UI.md`'s new **Scrollbars** section.
- **Notification bell button now hovers the same way as the language/theme buttons** (icon
  color change only, no background pill) — it was the only one of the three top-bar icon
  buttons with a `hover:bg-og-surface-alt` pill.
- **User profile picture in the top bar enlarges on hover**, matching the affordance other
  clickable avatars/pictures already have.

### Fixed

- **A user's profile picture on their `/users/{id}` detail page didn't open the preview modal
  on click**, unlike every other picture in the app (asset picture, organization logo, the
  user's own picture on `/settings`) — it rendered a bare `Avatar` instead of wrapping it in
  the shared `ImageUploadField` (which owns the click-to-preview behavior even when
  `editable={false}`).
- **Tooltips inside a collapsed/collapsible panel's field rows (asset overview's Location,
  Mechanical, Electrical, Commercial, Notes sections) were clipped**, hiding part of the
  tooltip content. `CollapsibleSection` used `overflow-hidden` on its wrapper purely to keep
  the header button's hover background inside the rounded corners — which also clipped any
  absolutely-positioned tooltip popup inside the section. Replaced it with conditional
  rounding on the header button itself (`rounded-xl` closed, `rounded-t-xl` open), so nothing
  needs to be clipped.
- **Tooltip "view documentation" links 404'd in demo mode.** `components/tooltip.tsx` imported
  `Link` from `next/link` instead of the locale-aware `@/i18n/navigation` — the same
  missing-locale-prefix issue fixed for the asset registry in 3.6.0, just in a different
  component. Every tooltip's doc link now resolves correctly in both the normal app (where
  middleware papered over it) and the demo's static export (which has no middleware to do so).

## 3.6.0

### Changed

- **Assets are now navigated by their human-readable asset ID (e.g. `OG-00042`), not the
  internal UUID.** Every place that links to an asset detail page — the asset registry list
  and grid, dashboard widgets (Upcoming calibrations, Recent assets, Activity), top-bar
  search, and the "New/Duplicate/Import asset" flows — now builds the URL from `asset_id`
  instead of `id`. QR/sticker labels (`GET /assets/{ref}/label`) now encode the same
  `asset_id`-based URL, so a freshly generated or reprinted label matches what the browser
  address bar shows.
  - Every `/assets/{ref}` endpoint (and its nested resources — calibrations, health,
    audit-logs, files, picture, export, label, duplicate) now resolves `{ref}` as either the
    `asset_id` or the internal UUID via `asset_repo.get_by_ref`, so old bookmarked or
    previously-printed UUID-based links keep working unchanged — this is additive, not a
    breaking change to the API contract.
  - Calibration creation (`POST /calibrations`) is unaffected — it already takes the asset's
    internal UUID in its request body, and the one caller that used the route's raw identifier
    already passed the resolved profile's UUID, not the URL param.

### Fixed

- **Demo mode 404'd when clicking an asset from the registry.** The registry's list-row and
  grid-card links (`apps/web/src/app/[locale]/(app)/assets/page.tsx`) were plain `<a href>`
  tags rather than next-intl's locale-aware `Link` — outside demo mode the i18n middleware
  papers over this by redirecting to the locale-prefixed URL, but demo mode is a static
  export with no middleware, so the un-prefixed URL 404'd. Switched both to `Link` from
  `@/i18n/navigation`, matching every other asset link in the app.
  - The demo fixture store (`apps/web/src/lib/demo/store.ts`, `router.ts`) resolves the same
    asset either by `asset_id` or internal id now too, and `generateStaticParams` prerenders
    demo asset routes under their `asset_id` so the static export has a matching page for
    every link the app actually generates.

## 3.5.2

### Fixed

- **Activity register panel's description sat flush against the user column instead of
  reading toward the right edge of the panel**, and never showed a user's profile picture
  even when one was set. `dash_repo.get_activity` (`apps/api/app/repositories/dashboard.py`)
  never resolved `profile_picture_id` into a presigned URL the way the full `/activity` page's
  `audit_log_enrich.enrich()` already does — so `ActivityFeed` always fell back to initials.
  `ActivityItem` (schema + frontend type) now carries `actor_profile_picture_url`, resolved via
  the shared `user_profile_svc.resolve_picture_url`, and `ActivityFeed`'s description column is
  right-aligned to match the "Upcoming calibrations" panel's right-aligned date column.

## 3.5.1

### Fixed

- **Upcoming calibrations panel showed overdue calibrations, and some due dates were wrong.**
  `dash_repo.get_calibration_events` picked each asset's *most recently created* calibration
  record to determine its due date; on an asset with multiple independently-scheduled
  channels (e.g. two sensor channels calibrated at different times), the newest record isn't
  necessarily the one that governs the asset's current status, so an asset could be flagged
  overdue even though its actual next due date (the furthest-out among its active
  calibrations) was still in the future. The query now aggregates `max(due_date)` per asset —
  the same logic already used by `repositories/asset.py::list_assets` and the dashboard
  summary's status counts — and only returns assets whose due date is today or later, so the
  panel no longer double-duties as an overdue list.
- **Activity register rows dumped all content in one left-aligned column.** The dashboard's
  `ActivityFeed` rows now lay out as user (with timestamp underneath) in a fixed-width left
  column and the action/diff description in the remaining space, instead of a single stacked
  block; removed the decorative blue dot bullet.

## 3.5.0

### Added

- **Google Analytics on project-operated deployments only.** A new `<GoogleAnalytics />`
  component (`apps/web/src/components/google-analytics.tsx`) conditionally loads gtag.js when
  `NEXT_PUBLIC_GA_MEASUREMENT_ID` is set at build time, mounted once in the shared root layout
  so it covers both the marketing/login page and every route under the demo build. The variable
  is set only in the build environment of the project's own deployments (the marketing/login
  site and `demo.opengauge.org`'s Cloudflare Pages project) — see `apps/web/README.md`. It is
  intentionally absent from `infrastructure/docker/.env.example`, so self-hosted Docker Compose
  installs never load it, keeping the existing Privacy Policy commitment (self-hosted Instances
  use no third-party analytics) intact. The Privacy Policy page now also discloses this usage,
  but only renders the disclosure when the variable is actually present at build time.
- **Cookie consent banner on the marketing/login page.** A new `<CookieConsentBanner />`
  (`apps/web/src/components/cookie-consent-banner.tsx`), translated into all four locales via
  the new `common.cookieConsent` message namespace, gates Google Analytics behind an explicit
  Accept/Decline choice — `<GoogleAnalytics />` now waits for `"granted"` consent
  (`apps/web/src/lib/consent.ts` + `apps/web/src/hooks/use-consent.ts`) before loading gtag.js on
  that page. A visitor who has already sent a Global Privacy Control or Do Not Track signal is
  opted out automatically and never sees the banner. The demo build has no login page to show a
  banner on (visitors skip straight to `/dashboard`), so it keeps loading analytics unconditionally
  once the env var is set, unchanged from before — a gap to revisit if the demo needs the same
  consent flow later.

### Fixed

- **Demo static export 404'd on `/dashboard` (and would have on most other in-app navigation
  for English specifically).** The same root cause as the bare-root 404 above, one layer deeper:
  `localePrefix: "as-needed"` means every locale-aware `Link`/`redirect`/`useRouter` call
  (`@/i18n/navigation`) generates an *unprefixed* URL for the default locale (e.g. `/dashboard`,
  not `/en/dashboard`), trusting the middleware to rewrite it — which, again, doesn't run in the
  static export. `apps/web/src/i18n/routing.ts` now forces `localePrefix: "always"` specifically
  when `NEXT_PUBLIC_DEMO_MODE=true`, so every generated href is explicitly prefixed and matches
  what `generateStaticParams` actually emits; the normal server build is unaffected. Two call
  sites were also bypassing locale-aware routing entirely — `components/notification-bell.tsx`
  and `app/[locale]/(app)/assets/page.tsx` imported `useRouter` straight from `next/navigation`
  instead of `@/i18n/navigation` — switched to match every other page/component in the app.
  `components/user-summary.tsx` (renders anywhere a user is shown in a list: activity entries,
  member lists, the admin users list) had the same bug with a raw `next/link` to
  `/users/{id}`, switched likewise.
- **Demo static export 404'd on the bare root URL.** `localePrefix: "as-needed"`
  (`apps/web/src/i18n/routing.ts`) relies on the `next-intl` middleware (`apps/web/src/proxy.ts`)
  to rewrite `/` to the default locale on the fly — but that middleware only runs on the normal
  server build. The demo's static export (`output: "export"`) has no server to run it, so the
  bare root produced no file at all and hosts fell through to their 404 page. A new
  `apps/web/src/app/page.tsx` (outside the `[locale]` segment) now covers that gap with a
  `redirect()` to the default locale, which works on any static host and is a no-op for the
  normal build (the middleware already intercepts `/` before this route would ever be reached
  there).
- **`apps/web/package-lock.json` was out of sync with `package.json`**, causing `npm ci` to fail
  on any clean-install build (Cloudflare Pages included) with `EUSAGE` / missing-package errors.
  Regenerated against a Linux Node 22 environment specifically (matching Cloudflare's build
  image) rather than Windows, since the drift included Linux-only optional native dependencies
  (`@emnapi/core`, `@emnapi/runtime`) that a Windows `npm install` does not resolve.

## 3.4.0

### Added

- **Granular, translated activity/audit log.** Updates to assets, organizations, procedures,
  locations, and (admin) users now record a real field-level diff instead of a generic action
  code or a coarse whole-object dump — e.g. an asset update shows exactly which fields changed
  and their old/new values, and a sensor channel's own field changes are captured too (e.g.
  "channel CH1: Physical quantity — Temperature → Pressure"), not just a channel count.
  `app/utils/audit_diff.py` provides the shared `snapshot()`/`diff_snapshots()` helpers now used
  across every touched update endpoint; a matched channel gets `channel.<id>.<field>` keys, and
  a wholly added/removed channel gets a single summary row instead of a per-field dump. Admin
  edits to another user's role, organization, `is_active`, or `is_verified`
  (`PUT`/`DELETE /users/{id}`) are now audited at all — they previously wrote no log entry
  whatsoever, despite being privilege-bearing changes. On the frontend, a new shared
  `ActivityDiff` component renders these diffs — translated field labels via a new
  `tokens.auditField` catalog, and translated values for enum-backed fields (physical quantity,
  technology, role, etc.) via `translateAuditFieldValue` — in the Activity page, the dashboard
  activity feed, and the asset detail page's Activity tab.
- `AGENTS.md` gained a **Granular Audit Logging** policy section: every future update endpoint
  must capture a real field-level diff the same way, and the frontend must render it through
  `ActivityDiff`/`tokens.auditField` rather than a one-off description string.

## 3.3.0

### Added

- **Multilingual support.** The web app now ships in English (canonical), Spanish, French, and
  German, with the architecture designed so adding language #5+ later is a content-only change (a
  `LocaleMeta` entry in `apps/web/src/i18n/locales.ts` plus a `messages/{locale}/*.json` set) —
  never an app-code change. Built on [next-intl](https://next-intl.dev), with non-English locales
  prefixed in the URL (`/es/...`, `/fr/...`, `/de/...`) while English stays unprefixed at the root,
  so existing links and bookmarks keep working. A new globe-icon language switcher sits next to the
  theme toggle in the top bar; the chosen language is written to a `NEXT_LOCALE` cookie immediately
  and, once signed in, to the user's profile (`PATCH /users/me` gained a validated `language`
  field) so it follows a returning user across devices and browsers. Every page and shared
  component in the authenticated app, the login/register/forgot-password/reset-password/verify-email
  flow, admin/settings screens, the Privacy Policy and Terms of Service (both the app's and the
  marketing site's), and every enum-driven dropdown (physical quantities, sensor technologies,
  calibration status, roles, etc.) are translated. The activity log and audit trail translate each
  action (`asset.created`, `calibration.voided`, …) instead of showing the raw event code, and the
  dashboard calibration calendar's date tooltip shows the weekday name in the viewer's language.
  User-entered content (asset names, notes, audit free text) stays untranslated by design — it's
  shown back exactly as entered, since machine-translating someone else's data would silently
  change what they wrote. The separate marketing site (`landing/`, a static HTML/CSS/JS Cloudflare
  Worker project) gained its own matching language switcher next to its light/dark toggle, full
  Spanish/French/German copies of the marketing homepage and legal pages, and a first-visit
  `Accept-Language`-based redirect in its Worker.
- Backend: `User` gained a `language` column (`SUPPORTED_LANGUAGES`-validated, defaults to `en`),
  migrated via `028_add_user_language.py`, with test coverage for valid/invalid values on
  `UserSelfUpdate`.
- The Knowledge Center (`apps/docs`, and the same content embedded in-app at **Documentation**) is
  now translated too, using Fumadocs' built-in i18n: each guide page's Spanish/French/German
  translation lives as a `page.{locale}.mdx` sibling next to its English source, with automatic
  fallback to English for any page not yet translated so coverage can grow incrementally. The
  standalone docs site follows the same unprefixed-English/prefixed-others URL scheme as the app
  (`/docs/guide`, `/es/docs/guide`, …) and gained its own language switcher in the top nav. The
  auto-generated API Reference stays English-only in every language, since it's generated directly
  from the OpenAPI schema rather than hand-written.

## 3.2.1

### Fixed

- The built-in default calibration certificate template printed a "Due Date" field
  (`calibration_date` + `calibration_interval`) unconditionally, with no way to know whether the
  customer had agreed to receive a calibration-interval recommendation — a direct conflict with
  ISO/IEC 17025 §7.8.4.3 ("A calibration certificate...shall not contain any recommendation on the
  calibration interval, except where this has been agreed with the customer"), and a contradiction
  of the certificate-generation docs, which incorrectly claimed no due-date language ever appeared.
  `templates/certificates/default.tex.jinja` no longer renders `due_date` — that cell now shows the
  calibration's location instead. `due_date` is still passed into every template's context, so a
  custom uploaded template can still choose to print it (e.g. once a real customer-agreement flow
  exists). Found while building the [Compliance](apps/docs/content/docs/guide/compliance/) section
  of the docs — see [ISO/IEC 17025 §7.8.4.3](apps/docs/content/docs/guide/compliance/iso-17025.mdx#no-interval-recommendation).

## 3.2.0

### Added

- Every place a user appears in a list — organization members, join requests, the Add Member
  picker, the admin users list, and activity/audit log entries — now shows their profile picture
  and links their name to `/users/{id}`, via a new shared `UserSummary` component (`UserMention`,
  used by activity logs, is now a thin wrapper around it). Backend responses that embed a user
  (`OrganizationMemberResponse`, `OrganizationJoinRequestResponse`, `EligibleUserResponse`,
  `AuditLogResponse`) gained a `profile_picture_url` field, resolved via a new shared
  `resolve_picture_url` helper. Fixed a pre-existing gap along the way: the per-asset audit-log
  endpoint (`GET /assets/{id}/audit-logs`) never enriched `actor_name`/`actor_role` at all (always
  null) — it now shares the same enrichment as the top-level `/audit-logs` endpoint.
- All checkboxes across the app are replaced with a new shared `ToggleSwitch` component — a
  pill-shaped switch with a smooth on/off color transition and an "On"/"Off" state label. See
  UI.md's new "Toggle Switch" section for when to use `size="sm"`/`showLabel={false}` in dense
  list contexts.
- Login page: a password-visibility eye icon, and a "Stay signed in" toggle — checked (default)
  persists the session in `localStorage` as before; unchecked uses `sessionStorage` instead, so
  signing out is as simple as closing the browser. `auth.service.ts` gained a `setToken(token,
  persist)` helper shared by the login form and the email-verification/password-reset flows (which
  always persist, matching prior behavior).
- Clicking a dashboard pie chart segment now navigates to a filtered register: calibration status →
  assets filtered by status, sensor/DAQ type → assets filtered by that subtype, procedure physical
  quantity → the procedures register filtered accordingly (new client-side filter there, since the
  procedures register had no URL-param filtering at all before this). The shared `PieSlice` chart
  primitive gained an optional `onClick` prop to support this, with no change to its many other
  (non-clickable) call sites.
- **Admin → Dashboard → Export/Import database** now bundles every MinIO object (certificates,
  datasheets, LaTeX templates, profile pictures) alongside the `pg_dump` archive in a single zip,
  instead of dumping the database alone. Previously, restoring an export on a different instance
  left every file reference pointing at media that only existed in the original instance's MinIO.
  Import still accepts a bare `pg_dump` archive from before this change for backward compatibility
  (database only, existing media untouched in that case).
- Calibration certificate PDFs are now digitally signed with a real, PDF-native signature (PAdES,
  embedded via the new `pyhanko` dependency) — any PDF viewer with signature support (Adobe
  Acrobat, Chrome, Preview) can verify a certificate was issued by its organization and hasn't
  been altered since, independent of which LaTeX template rendered it (signing runs as a
  post-processing step on the compiled PDF bytes, after `latex_service.compile_tex`). Previously,
  the performer's signature was only a picture on the page with no document-level verification.
  Each organization gets a lazily-generated, self-signed RSA-2048 certificate on its first issued
  certificate (new `organization_signing_keys` table / `org_signing_key_service.py`; an
  instance-wide fallback covers assets with no resolvable organization), visible and downloadable
  from **Organizations → (organization) → Certificate signing**, and via
  `GET /organizations/{id}/signing-certificate` / `GET /admin/signing-certificate`. The private-key
  envelope-encryption helper in `signing_key_service.py` (used for per-user Ed25519 signature-image
  keys) was factored out into a shared `key_wrap.py`, reused by the new org keys. See
  [Certificate digital signatures](apps/docs/content/docs/guide/calibration/certificate-signing.mdx)
  for how to verify one and why it's a separate mechanism from the performer's signature image.
  `cryptography` bumped from 42.0.8 to 48.0.1 (pyhanko's floor).
- Certificate templates documentation gained an extensive "Recipes" section — copy-pasteable
  patterns for every placeholder shape (optional text/image/nested-object fields, looping a list
  of rows, the two raw-LaTeX-math exceptions to the `|latex` escaping rule) plus a minimal working
  template skeleton, so authoring a custom `.tex` template no longer requires reverse-engineering
  the two shipped examples line by line.

### Fixed

- The user's profile picture didn't show a pointer cursor on hover even where clicking it does
  something (opens the preview modal in `ImageUploadField`, opens the avatar dropdown in the top
  bar) — both `<button>` elements were missing an explicit `cursor-pointer` class, since browsers
  don't apply one to buttons by default.

## 3.1.1

### Fixed

- **High priority:** the named-volume-to-bind-mount migration command documented in
  Self-hosting → Deployment (for upgrading an install that pre-dates the 3.0.0 bind-mount fix)
  silently failed to copy anything when run from Git Bash on Windows: MSYS rewrites *any*
  `/`-prefixed argument before it reaches `docker.exe`, including the container-side paths in
  `-v /host/path:/container/path` (not just the host side), mangling them into nonsense like
  `C:\Program Files\Git\from`. `docker run ... cp -a /from/. /to/` then writes into a bogus
  location instead of `data/postgres`/`data/minio` — with no error surfaced, so it looked exactly
  like the rebuild had wiped the data, when the real cause was the migration step never actually
  running against the right path. The doc now calls out running the command from PowerShell/cmd.exe
  instead of Git Bash, or prefixing it with `MSYS_NO_PATHCONV=1` if Git Bash is unavoidable, plus
  how to recognize (a stray empty `data/postgres;C`-style directory) and recover from a botched
  prior attempt (the original data is still intact in the old named volume until explicitly
  removed).
  - Confirmed the current bind-mount configuration itself (introduced in 3.0.0) is not the source
    of any ongoing data loss: a full `docker compose down` + `up --build` round-trip, both against
    a freshly-initialized empty `data/` directory and against this repo's own populated one,
    preserves every row and file exactly.
  - Added `scripts/verify-media-persistence.sh` — an isolated, non-destructive check (throwaway
    Compose project name and temp data directory, safe to run alongside a live deployment) that
    writes a marker row/object, tears the containers down, rebuilds, and confirms both survive.
    Exits non-zero on failure, so it can be run after any change to `docker-compose.yml` or wired
    into CI as a regression guard against this class of bug recurring.

## 3.1.0

### Added

- Per-user notification preferences, and a completed notification lifecycle (delete individual/all,
  click-to-navigate) for the in-app inbox introduced in 3.0.0.
  - New **Settings → Notifications** section lets each user choose, per category (calibration due,
    new calibration recorded, organization join request, organization join decision), whether they
    receive it via email, in-app, both, or neither. New users and untouched categories default to
    both channels enabled, so nothing needs configuring out of the box.
  - The notification bell dropdown gained a **Clear all** action and a per-notification remove (×)
    button — previously the inbox could only be marked read, never actually cleared.
  - Calibration due-soon/overdue reminders and new-calibration notifications now raise an in-app
    notification the same way organization join requests already did (in 3.0.0), instead of only
    ever emailing — the in-app channel doesn't depend on SMTP being configured at all. Both link to
    the asset's detail page.
  - The calibration reminder sweep now marks a reminder as sent once *any* enabled channel delivers
    for *any* recipient (in-app or email), rather than requiring email specifically — a broken SMTP
    server no longer blocks the guaranteed in-app channel, and won't be retried forever once the
    recipient has been notified some other way.

## 3.0.0

### Added

- Organizations are now full multi-tenant entities. Any non-Viewer user can create one and becomes
  its first admin automatically; a user can belong to any number of organizations, each with its
  own `member`/`admin` role — distinct from the global RBAC role on the user's account. Only Super
  Admin overrides into organization management the caller isn't a member of; the global `admin`
  role has no special access to organizations, matching the peer-to-peer model. Viewer is blocked
  from all organization management regardless of any per-org `admin` role they might hold — the
  global RBAC restriction wins over the org-level one.
  - New profile fields: `full_name`, `website`, `location_id` (primary/HQ location), `email`,
    `phone`, `private`.
  - New dedicated **Organizations** page (list + per-organization detail page, replacing the old
    Admin → Organizations panel) and a sidebar tab.
  - Members can leave, and admins can remove members or change their role — guarded so an
    organization is never left with zero admins (the last admin must promote someone else first,
    or deactivate the organization instead).
  - Private organizations show only their name (with a lock icon) to non-members, so they stay
    discoverable enough to request joining; everything else about them — profile, member roster,
    assets — is members-only.
  - Non-members can send a **join request**; every admin of that organization gets notified via
    a new in-app notification inbox (bell icon in the top bar) always, plus email if SMTP is
    configured. Approving adds the requester as a `member`.
  - Assets now carry a direct `organization_id` (chosen from the creating user's own organizations),
    independent of the asset's location — shown on the asset detail page and linked back to the
    organization's page, which in turn shows a clickable asset count filtering the asset register.
  - The organization page's Members panel gained an **Add member** button (a modal listing every
    user not already an active member, multi-select, added with the `member` role) and a
    **Danger zone** with a confirmed delete action — deleting deactivates the organization,
    hiding it from everyone except Super Admin. Pending join requests now show inline in the same
    Members list with a "Pending" status instead of a separate panel, and approving/rejecting
    doesn't require edit mode; changing a member's role or removing them now does.
  - A **Join / Leave** button now appears on every organization's list row and its detail page
    (beside Edit for admins, in Edit's place for everyone else): "Request to join", a disabled
    "Request pending" once a request is in flight, or a red "Leave" for members — each behind a
    confirmation dialog. Leaving as an organization's last admin is guided instead of just
    rejected: promote another member first, or delete the organization if it's the last member too.
  - New shared `ImageUploadField` UI component (circular picture, click-to-preview, overlaid
    upload/remove buttons in edit mode) — now used consistently for the organization logo, asset
    picture, and user profile picture.
  - A deactivated organization is now visible in the Organizations list to Super Admin only,
    shown with a red background and a "Deleted" badge, and can be reactivated with a "Restore
    organization" button in its edit form's Danger zone (`POST /organizations/{id}/restore`) —
    restoring only affects visibility, not membership.

### Changed

- **Breaking:** Viewer is now read-only across the whole app, not just organizations — they can no
  longer create, edit, retire, import, or export assets, procedures, or locations. The
  `require_not_viewer` dependency (already used for signature management) now also gates every
  mutating endpoint on `assets`, `procedures`, and `locations`; the corresponding frontend
  New/Edit/Delete/Import/Export controls are hidden for Viewer accordingly.

- **Breaking:** Teams are removed. Open Gauge now mimics Gogs — only users and organizations,
  no team layer between them.
  - Dropped the `teams` and `team_members` tables, the `/teams*` API endpoints, the Settings →
    Teams self-service join/leave UI, and the Admin → Organizations nested team panel.
  - Asset ownership (previously `assets.owner`, a team reference) is superseded by the direct
    `assets.organization_id` above.
  - Calibration email notifications (new-calibration and due/overdue reminders) now go to every
    active Technician/Admin/Super Admin who is a member of the asset's organization instead of a
    team's members; Viewers are never notified. The built-in certificate template's footer drops
    its separate "Team" line, since the "Organization" line already covers this.
- **Breaking:** The redundant `User.is_superuser` boolean is removed. It was always ORed with
  `role == "superadmin"` at every permission check; Super Admin capability now comes solely from
  the `role` field. Any account that had `is_superuser=true` is promoted to `role=superadmin` by
  the migration so no one loses access.
- **Breaking:** `users.organization_id` (a single nullable FK, one org per user) is replaced by
  the `organization_members` many-to-many table described above.
- Consolidated 11+ duplicated `_require_admin`/`_require_superuser` router-local helper functions
  into shared `require_admin`/`require_superadmin` FastAPI dependencies in `dependencies/deps.py`.
  The frontend's four copies of `ROLE_LABELS`/`ROLE_COLORS` are similarly consolidated into
  `lib/roles.ts`.

### Fixed

- The organization logo displayed as a non-clickable square instead of the circular,
  click-to-preview picture used everywhere else.
- An organization's website link resolved as relative to the current page when the stored value
  had no `http(s)://` prefix, sending visitors to a broken `/organizations/<website>` URL instead
  of the intended site. Storage is unchanged; only the outgoing link is normalized.
- The asset count on an organization's page linked to the asset register but didn't actually
  filter it by organization — the register never read `organization_id`/`organization_name` from
  the URL.
- **High priority:** uploaded files and database rows could still appear to be wiped after
  `docker compose up --build` even with the project name pinned (previous fix) — a different
  invocation (cwd, `-p` override, or a legacy `docker-compose` v1 binary ignoring the `name:` key)
  could still resolve to a differently-named volume. Postgres and MinIO now bind-mount to a fixed
  host path (`infrastructure/docker/data/`) instead of a named volume, which can't diverge this
  way. Existing installs: copy your current named-volume data into `./data/postgres` and
  `./data/minio` before upgrading (`docker run --rm -v <old_volume>:/from -v $(pwd)/data/X:/to
  alpine cp -a /from/. /to/`), then redeploy.
- The organization list page's logo was square instead of the circular treatment used everywhere
  else.
- The organization picture stayed small (48px) while editing instead of matching the bigger size
  used when editing an asset or profile picture.
- Landing on the asset register from an organization's (or location's) filtered link didn't apply
  the filter until the page was manually refreshed — the register read the filter from
  `window.location.search` in a mount-only effect, which client-side navigation doesn't re-trigger.
  Switched to the reactive `useSearchParams()` hook. Separately, dismissing a filter via "View all"
  only cleared in-memory state, not the URL, so a refresh afterward silently re-applied it — "View
  all" now also clears the corresponding URL params.
- The organization page's "Add member" button was visible outside of edit mode, inconsistent with
  every other member-management control.

## 2.4.0

### Added

- The signature pad (used when a user sets their approval signature) now has **Undo** and
  **Erase** buttons alongside **Clear**. Undo reverts the last stroke; Erase toggles an eraser
  mode that removes ink under the pointer instead of adding it, so a mis-drawn portion of a
  signature can be corrected without redrawing the whole thing.
- A new **1×0.5 in** QR sticker size, alongside the existing 2×2 and 4×2 sizes: QR code on the
  left half, asset ID and asset name on the right half. Available in PNG, JPG, and PDF from the
  same asset **Sticker** dialog.

## 2.3.0

### Changed

- Changelog entries (here and in the docs site) now show only the version number, not a date —
  git history is already the record of when something shipped, and the two dates could drift.

### Fixed

- The calibration reminder sweep could send real emails during local development and test runs.
  `email_settings` was documented as a singleton but never enforced as one at the database level;
  code that queried it with an unordered `.first()` could silently pick up whatever row existed,
  including a real, already-configured SMTP row, so a test exercising the reminder sweep could end
  up delivering a genuine email instead of a no-op. A unique index now makes a second row
  impossible to create, the same technique already used for `certificate_templates`.
- The **Dangerous zone**'s **Clear database** action could delete the account that triggered it.
  The access check accepts either the `is_superuser` flag or `role == "superadmin"`, but the reset
  only preserved `is_superuser` accounts — a `role == "superadmin"` user without that flag could
  reach the action and then be wiped by it. The calling user is now always preserved regardless of
  role or flag.

## 2.2.0

### Changed

- **Correction to 2.1.0:** the landing/marketing page content (features, comparison table, FAQ,
  contact form) never belonged in this repository — it's the public `opengauge.org` site, which
  lives in a separate `landing` repository. Reverted `apps/web/src/app/page.tsx` and removed the
  `apps/web/src/components/landing/` and `apps/web/functions/` directories added in 2.1.0; that
  content was rebuilt in the `landing` repo instead, matching its plain HTML/CSS/JS stack.
- Simplified the admin **Dangerous zone**: removed the "clear selected tables" action added in
  2.1.0 (an admin-only endpoint with no UI to grant its own precondition wasn't worth the
  complexity) and fixed the panel's styling to match the rest of Admin → Dashboard — Import now
  sits in the same red "Dangerous zone" card as Clear (both genuinely destructive), while the
  non-destructive Export stays in its own neutral Backup card.

### Fixed

- `POST /admin/database/import` failed with `pg_restore: error: could not execute query: ERROR:
  unrecognized configuration parameter "transaction_timeout"`. Debian's default `postgresql-client`
  package is newer (17) than the `db` service's `postgres:15-alpine` server, and pg_restore
  synthesizes session-setup statements based on its own client version — v17's aren't understood
  by a v15 server. The API image now pins `postgresql-client-15` via the official PGDG apt
  repository, matching the server exactly.
- Uploaded files (profile pictures, signatures, PDFs, certificate templates) and database rows
  could appear to be wiped after `docker compose up --build`. Docker Compose derives its project
  name — and therefore its volume names — from the current directory by default, so invoking
  `docker compose` from a different location (or a different way) than usual silently creates a
  *second*, differently-named stack with fresh, empty volumes. `docker-compose.yml` now pins an
  explicit project `name`, so the same volumes are always used regardless of how Compose is
  invoked.

## 2.1.0

### Added

- The landing page (`opengauge.org`) is now a full marketing page: a refreshed features
  section, a feature comparison against legacy on-premise calibration software / spreadsheets /
  generic cloud CMMS, an FAQ, and a contact form to `hello@opengauge.com`.
- A Cloudflare Pages Function (`apps/web/functions/api/contact.ts`) handles the contact form's
  submissions via Cloudflare's own Email Routing "send email" binding — no third-party email
  API or extra dependency. Only active on the Cloudflare Pages deployment; see
  `apps/web/functions/README.md` for the one-time Cloudflare-side setup. Everywhere else
  (self-hosted Docker, local dev) the form falls back to a `mailto:` link.

### Fixed

- The admin **Dangerous zone** (database export/import/reset) was invisible to any account
  promoted to the `superadmin` role after the initial install, because the check required the
  separate `is_superuser` flag — which no admin-panel UI can ever set on another account. It now
  also accepts `role == "superadmin"`, matching the same convention already used everywhere else
  in the API for this privilege tier.

## 2.0.0

### Changed

- **Breaking:** Team membership is now opt-in. Previously the `User.team` field was a single
  free-text string with no real membership model behind it; it's replaced by a `team_members`
  join table, so a user can belong to any number of teams and starts in none. The
  `team`/`teams` field changed shape on the user API (`UserResponse.team: string | null` →
  `UserResponse.teams: {id, name}[]`), and `UserCreate`/`UserUpdate`/`UserSelfUpdate.team` were
  removed — join/leave a team via `POST`/`DELETE /teams/{id}/join|leave` instead. Existing
  `users.team` values are carried over into real membership rows by the migration wherever the
  text matched a team in the user's own organization.
- Creating, renaming, and deleting teams is now only possible from Admin → Organizations. The
  user's own Settings → Teams tab is self-service only: pick which of your organization's teams
  to join or leave.

### Added

- **Dangerous zone** moved into Admin → Dashboard (superadmin only): alongside the existing
  export/import/reset actions, a new **Clear selected tables** action lets you pick exactly
  which database tables to empty, rather than only an all-or-nothing reset.
- The PDF preview thumbnail (asset Files section, certificate templates) now shows an eye icon
  and shadow on hover, to signal it's clickable.

### Fixed

- The signature drawing pad's background no longer goes near-black in dark mode, which
  previously made the dark-ink signature invisible while drawing (and in the saved-signature
  preview).

## 1.2.0

### Added

- **Ratiometric** output signal type for sensor channels (e.g. bridge-type load cells), with
  `mV/V` and `V/V` units.
- PDF preview for PDF files in the asset **Files** section — click a file's thumbnail to preview
  it before downloading, using the same previewer as calibration certificates.
- Reference tables in the "Adding a sensor" documentation covering every supported physical
  quantity (with technology, type, and units) and every output signal type (with units).

### Fixed

- The certificate template dropdown menu text is now visible in dark mode.
- The asset's profile picture no longer appears in the asset's Files list — it's managed only
  from the Image section, avoiding duplication.

## 1.1.0

### Added

- **Database panel** (Admin → Database, superadmin only): export a full database backup,
  restore one, or reset the app to a clean state (deletes all data except superadmin accounts).

### Changed

- Fresh installs now start empty. The first account registered on a new install is created
  verified and as `superadmin` automatically — previously it was created unverified with no
  admin able to activate it, and the app shipped pre-populated with demo users, assets,
  locations, and procedures instead of starting empty.
- Docker Compose now reads every credential and URL from `infrastructure/docker/.env` instead of
  hardcoding them in `docker-compose.yml` — see the Configuration section in `README.md`.
- Generated QR codes and asset labels now encode the configurable `FRONTEND_URL` instead of a
  hardcoded `http://localhost:3000`, so they resolve correctly in production.

### Fixed

- The sidebar's "Documentation" section no longer auto-expands when viewing an API Reference
  page — only clicking "Documentation" itself expands it.

## 1.0.13

### Added

- PDF handling and download for generated calibration certificates.

## 1.0.12

### Added

- User signature management: upload, retrieval, and cryptographic verification.
- LaTeX rendering service and certificate template management.

## 1.0.11

### Fixed

- Logo image dimensions on the sidebar, for proper scaling in light mode.

### Added

- Additional documentation links for sensor attributes and asset registry fields.

## 1.0.10

### Added

- Demo mode: in-memory data store with session persistence, for trying Open Gauge without a
  backend.

### Changed

- General functionality and performance improvements across the app.

## 1.0.9

### Added

- Password reset flow and account activation for self-registered users.

### Changed

- Cleaned up `package-lock.json`, removing unnecessary peer dependencies.

## 1.0.8

### Added

- Dark and light logo SVGs, a new app icon, a calibration-method badge component, and the
  dark/light theme toggle.
- Radial-gradient backdrop treatment for the dashboard grid background.

## 1.0.7

### Added

- Calibration soft-void functionality (void a calibration without deleting its history).

### Changed

- Production start script switched to a custom static server for the Next.js export build.

## 1.0.6

### Added

- Email notifications feature, with SMTP configuration in the admin panel.

## 1.0.5

### Changed

- Broader code-structure refactor for readability and maintainability.
- Removed unnecessary peer dependencies; added `@emnapi/core`/`@emnapi/runtime`.

## 1.0.4

### Added

- Asset import via ZIP upload.

## 1.0.3

### Changed

- Removed outdated standalone `ARCHITECTURE.md`, `DATABASE.md`, and `UNITS.md` now that the
  documentation site is the source of truth.

## 1.0.2

### Added

- Profile and asset picture uploads.

## 1.0.1

### Changed

- Dashboard component styling and functionality improvements.
- Housekeeping: compiled Python artifacts for storage/utility modules.

## 1.0.0

The first release considered production-ready: licensed, documented, and covering the full
calibration-to-certificate workflow.

### Added

- Knowledge Center + API Reference documentation site (Fumadocs), with `fumadocs-openapi`
  generating the API Reference straight from the FastAPI schema.
- AGPL-3.0 license, and an expanded `README.md`/`CONTRIBUTING.md`.

## 0.5.8

### Added

- Support for coefficients-only external calibrations (record a calibration without raw point
  data, using previously-derived coefficients).

## 0.5.7

### Added

- `measurement_type` field on sensors, with related UI updates.

## 0.5.6

### Added

- Calibration worked examples, an uncertainty-budget breakdown, and reporting utilities.

## 0.5.5

### Added

- Health scoring: health service, scoring tests, and the asset Health tab.
- Health overview display and an enhanced calibration ring card visualization.

## 0.5.4

### Added

- Calibration deletion, restricted to admins.

## 0.5.3

### Changed

- Asset and audit log handling enhanced with actor-based filtering; sensor update fixes.

## 0.5.2

### Changed

- User and audit log detail views now surface actor information (who performed the action), with
  general UI component improvements.

## 0.5.1

### Added

- Procedures and procedure-distribution summary on the dashboard.

## 0.5.0

### Added

- Pie chart components, with hover effects and shared context management.

### Changed

- Calibration lab location retrieval integrated into the Calibration tab, with UI updates for
  calibration lab display.

## 0.4.4

### Changed

- Dashboard types and API extended with calibration status and recent-assets data.

## 0.4.3

### Added

- Sticker modal for label generation, with preview and download options.

### Changed

- Color definitions reorganized; label generation logic cleaned up.

## 0.4.2

### Added

- `is_calibration_lab` flag on locations and a `calibration_location_id` link on calibrations.

## 0.4.1

### Changed

- Asset and procedure schemas refactored; improved form validation and error handling.

## 0.4.0

### Added

- Label/sticker generation service.
- Activity log.

## 0.3.7

### Added

- Admin panel.
- Calibration report PDF generation.

## 0.3.6

### Added

- User settings page.

### Fixed

- Small issues in the calibration wizard and calibration view.

## 0.3.5

### Added

- Procedures page, with file uploads.
- Procedure editing.

## 0.3.4

### Added

- Support for adding new assets.

### Fixed

- Asset editing behavior.

## 0.3.3

### Changed

- Calibration chart replaced with Plotly.
- Calibration view updated to support the new calibration graph/table layout.

## 0.3.2

### Added

- Calibration record add workflow.

### Changed

- Further location editing refinements.

## 0.3.1

### Added

- Add/edit workflows for locations.
- Asset details edition improvements.

## 0.3.0

### Added

- Locations page, with a site/building/lab hierarchy.

### Changed

- Sidebar/topbar background graph styling.

## 0.2.3

### Changed

- Database-backed overview tab panels updated.

### Added

- Edit asset overview feature, with initial tests.

## 0.2.2

### Added

- Asset profile page.

## 0.2.1

### Changed

- Assets registry table updated.

## 0.2.0

### Added

- Dark/light mode.

### Changed

- Dashboard rebuilt against the new database schema, with new panels.

## 0.1.2

### Changed

- UI elements harmonized across early screens.

## 0.1.1

### Added

- Profile loading on authentication.

## 0.1.0

### Added

- Authentication page and login logic.
- Dashboard screen.

## 0.0.0

- Initial commit: monorepo scaffolding and base architecture (Next.js frontend, FastAPI
  backend, Docker Compose infrastructure).
