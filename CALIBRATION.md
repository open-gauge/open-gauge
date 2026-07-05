# CALIBRATION.md — Calibration & Uncertainty Reference

How MAR fits calibration curves, evaluates measurement uncertainty, and decides pass/fail.
The methodology follows JCGM 100:2008 (GUM) and ISO/IEC 17025:2017 — see
`references/References.md` for the full standards distillation this implementation is based
on, and `ACTION_PLAN.md` for the phased work that brought MAR into compliance.

For table/column-level schema, see `DATABASE.md`. This document covers the *domain logic*:
what gets computed, why, and where it surfaces in the API and UI. For fully worked,
numerically-verified examples you can replicate through the UI to cross-check the
implementation, see `CALIBRATION_EXAMPLES.md`.

---

## Workflow overview

A calibration event has two backend touchpoints:

1. **`POST /api/v1/calibrations/analyze`** — ephemeral. Takes raw (reference, measured) point
   pairs plus fitting/uncertainty parameters, runs the full analysis
   (`apps/api/app/services/calibration_analysis.py::run_analysis`), and returns the result.
   Nothing is persisted. The wizard calls this on every input change (debounced) to give
   live feedback.
2. **`POST /api/v1/calibrations`** — atomic create. Takes the *already-computed* result (the
   wizard forwards what `/analyze` returned) plus metadata, and writes one `calibrations` row
   and its `calibration_data` point rows in a single transaction. A certificate PDF is
   generated best-effort in the same request (failure doesn't block the calibration record).

This split exists so the wizard can let a technician freely explore different polynomial
degrees, distributions, and decision rules before committing — the expensive/persisted step
only happens once, on save.

UI: `apps/web/src/app/(app)/assets/[id]/CalibrationWizard.tsx` (3-step wizard: metadata →
data entry → analysis/save). Historical calibrations are viewed on the asset detail page,
`apps/web/src/app/(app)/assets/[id]/page.tsx`.

---

## Curve fitting

`run_analysis` fits a polynomial `reference = f(measured)` via `np.polyfit` (degree 1–5,
auto-selected via AIC with a parsimony rule unless the user picks a degree explicitly). It
also computes R², RMSE, standard error, max error, full-scale error %, non-linearity %, and
(when the data supports it) repeatability and hysteresis.

**Coefficient covariance** (added alongside uncertainty support): when there are more data
points than fitted parameters, `np.polyfit(..., cov=True)` also returns the coefficients'
covariance matrix, stored in `calibrations.poly_coefficients_covariance`. This matters because
using two or more fitted coefficients together (e.g. evaluating the curve at a point, or a
ratio of coefficients) without their covariance understates the true uncertainty by a wide
margin — GUM Annex H.3 and GUM-6 §8.1.6 both show 30%+ underestimates from dropping it. A
helper, `predict_with_uncertainty(coefficients, covariance, x)`, implements the generalized
GUM Eq. H.15 propagation for evaluating the fitted curve with correctly propagated
uncertainty at an arbitrary point. **It is not yet called from any endpoint** — it's
infrastructure for a future "evaluate this calibration at a live reading" feature that
doesn't exist in MAR yet.

Degenerate fits (points ≤ parameters, e.g. a 2-point straight-line fit) have zero residual
degrees of freedom: no covariance matrix is stored (`null`), and the Type A uncertainty row
(below) is marked as having no finite degrees of freedom either.

---

## Uncertainty: the budget model

MAR expresses measurement uncertainty as an **itemized budget** (GUM Annex H.1 table format),
not a single opaque number. Each calibration stores `uncertainty_budget`: an array of rows,
one per contribution, each already expressed as a *standard uncertainty* in the measurand's
own units:

```jsonc
{
  "source": "fit_residuals",                 // or "reference_standard" / "resolution" / "sensor_nominal_accuracy"
  "description": "Type A: standard deviation of calibration-fit residuals",
  "value": 0.083,                            // the raw input as given (e.g. a spec's expanded uncertainty)
  "distribution": "normal",                   // normal / rectangular / triangular / …
  "divisor": 1.0,                             // how `value` was converted to a standard uncertainty
  "standard_uncertainty": 0.083,
  "degrees_of_freedom": 4.0                  // null = treated as exactly known
}
```

### Contributions

| Source | Type | How it's derived |
|---|---|---|
| `fit_residuals` | A | Always present. Standard deviation of the calibration curve's fit residuals (`ddof=1`). Degrees of freedom = n − k (points − parameters), or `null` if that's ≤ 0. |
| `reference_standard` | B | Optional. The reference standard's own stated (expanded) uncertainty, converted to a standard uncertainty via GUM §4.3.3 (`u = U/k`). For internal calibrations, auto-fetched from the selected reference asset's own most recent calibration; otherwise entered manually (e.g. transcribed from an external lab's certificate). |
| `resolution` | B | Included automatically whenever the sensor channel has a `resolution` value. Rectangular distribution per GUM §4.3.7: `u = resolution / √12`. |
| `sensor_nominal_accuracy` | B | The sensor channel's manufacturer-stated `measurement_uncertainty`, converted via GUM §4.3.3. **Opt-in only** (a checkbox in the wizard) — folding it in by default risks double-counting against `fit_residuals`, since both can reflect the same underlying instrument imprecision. |

### Combination

All rows are combined via **root-sum-square** (GUM Eq. 10, uncorrelated inputs):

```
u_c(y) = √( Σ standard_uncertainty_i² )
```

stored as `calibrations.combined_uncertainty`.

### Expansion

Expanded uncertainty `U = k · u_c(y)` (`calibrations.expanded_uncertainty`), with the
coverage factor `k` chosen per `distribution_type`:

- **normal** — the user-supplied `coverage_factor` directly (the common k=2 ≈ 95% shortcut).
- **t** / **chi_squared** — `k` is derived from the **effective degrees of freedom**
  (`calibrations.effective_degrees_of_freedom`), via the Welch-Satterthwaite formula
  (GUM Eq. G.2b):

  ```
  ν_eff = u_c(y)⁴ / Σ ( standard_uncertainty_i⁴ / degrees_of_freedom_i )
  ```

  Rows with `degrees_of_freedom: null` (exactly-known Type B contributions) drop out of the
  sum entirely. If no row has finite degrees of freedom, `ν_eff` is `null` and MAR falls back
  to the normal-distribution factor (the correct limit as ν → ∞).

All of the above lives in `apps/api/app/services/calibration_analysis.py`
(`_build_uncertainty_budget`, `_combine_budget`, `_expand`).

### Reporting rounding

Per GUM §7.2.6, uncertainty values are rounded to **at most 2 significant figures** for
display and on the certificate (`apps/api/app/utils/uncertainty_format.py::round_to_sig_figs`,
mirrored on the frontend as `apps/web/src/lib/uncertainty-format.ts::roundToSigFigs`). The
certificate additionally prints a full-sentence GUM §7.2.4-style statement (adapted for a
calibration *function* rather than a single measurement result, since that's what MAR
certifies): value, coverage factor, basis (normal vs. t-distribution), confidence level, and
the valid range the uncertainty applies over.

---

## Decision rules (pass/fail conformity)

ISO/IEC 17025 §7.1.3 and §7.8.6 require that whenever a pass/fail statement is issued, the lab
documents *which decision rule* was applied — a bare "measured value within spec" comparison
is not sufficient once uncertainty is in the picture. MAR stores `decision_rule` and the
resulting `conformity_statement` on every calibration:

| Rule | Behavior | When to use |
|---|---|---|
| `simple_acceptance` (default) | Pass iff the reading is within the channel's tolerance, ignoring uncertainty entirely. | Matches MAR's original behavior; used when no formal risk analysis has been done, or the customer hasn't agreed to a different rule. |
| `guard_band_w_uncertainty` | Pass iff `error + U ≤ tolerance` — the acceptance zone shrinks inward by the expanded uncertainty. | Reduces false-accept risk; use when a false pass is costly. |
| `shared_risk` | Pass iff `error − U ≤ tolerance` — the acceptance zone expands outward by the expanded uncertainty. | Reduces false-reject risk, at the cost of some false-accept risk near the boundary; use when a false fail is costly. |

`conformity_statement` (JSONB) carries the full record: `{decision_rule, specification,
expanded_uncertainty_applied, passed, reason}`. `specification` is a human-readable rendering
of the channel's accuracy spec (e.g. `"±0.5% of full scale"`); `reason` is populated only when
no accuracy spec was configured (conformity wasn't evaluated at all). This is computed in
`_apply_decision_rule` in `calibration_analysis.py`, and printed on the certificate as a
"Statement of Conformity" section.

The wizard's **"Tolerance criteria (preview)"** controls are a separate, older, client-only
"what if" exploration tool (not persisted) — kept for quickly trying different thresholds, but
clearly labeled to avoid confusion with the authoritative, server-computed, certified
conformity statement shown just above it.

---

## Certificate generation

`apps/api/app/services/certificate_service.py::generate_certificate` renders an A4 PDF:
header (QR code + cert number), asset info, traceability (procedure, reference standard,
environmental conditions), calibration results (coefficients, equation, statistics table,
uncertainty budget table, statement of conformity), and the dataset (point table + fit chart).
Generated best-effort on calibration creation and on-demand via
`GET /calibrations/{id}/certificate` (returns a 1-hour presigned MinIO URL).

Per ISO/IEC 17025 §7.8.4.3, the certificate deliberately **never** prints a calibration-
interval recommendation unless explicitly agreed with the customer — MAR doesn't have that
agreement flow yet, so no interval/due-date language appears on the certificate at all.

---

## API reference

| Endpoint | Purpose |
|---|---|
| `POST /calibrations/analyze` | Ephemeral fit + uncertainty + conformity analysis. Nothing persisted. |
| `POST /calibrations` | Atomic create: calibration row + points + best-effort certificate generation. |
| `GET /calibrations` | List (paginated). |
| `GET /calibrations/{id}` | Single record. |
| `GET /assets/{id}/calibrations` | All calibrations for an asset, most recent first. |
| `GET /calibrations/{id}/points` | The raw data points for a calibration. |
| `GET /calibrations/{id}/certificate` | Presigned URL to the certificate PDF (generates on-demand if missing). |
| `DELETE /calibrations/{id}` | Admin/superadmin only. Hard delete (calibrations aren't soft-deleted). |
| `GET /calibrations/procedures` | List active procedures, optionally filtered by physical quantity. |

`AnalyzeRequest`/`AnalyzeResponse` and `CalibrationCreate`/`CalibrationResponse` schemas live
in `apps/api/app/schemas/calibration.py`; frontend mirrors in `apps/web/src/types/calibration.ts`.

---

## Known gaps / follow-ups

- **Phase 4 (Chebyshev basis / domain-normalized polynomial fitting)** is deferred per
  `ACTION_PLAN.md` — only worth doing if `poly_order ≥ 3` fits turn out to be common in
  practice; MAR's raw monomial coefficients become numerically ill-conditioned at higher
  degree (GUM-6 Annex D).
- **`predict_with_uncertainty`** exists but is unused — no MAR feature yet evaluates a
  calibration's curve against a live/arbitrary reading. Wire it up when that feature is built.
