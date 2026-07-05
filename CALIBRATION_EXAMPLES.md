# CALIBRATION_EXAMPLES.md — Worked Examples for Cross-Checking MAR

Three fully worked calibration examples, each exercising a different part of MAR's
calibration engine (`apps/api/app/services/calibration_analysis.py`). Every number below was
produced by **running the real production code** against the input data shown (not
hand-estimated), then independently re-derived by hand from the underlying formulas to
confirm they match. If you enter the same asset/channel setup and the same data points
through the UI, you should see the same numbers (up to the display rounding described in
"Rounding" at the end).

Background reading: `CALIBRATION.md` (what each number means and why), `references/References.md`
(the GUM/ISO 17025 clauses these formulas implement).

---

## Example 1 — Temperature RTD (PT100), linear fit, full uncertainty budget

Exercises: linear regression, all four Type A/B budget contributions at once (fit residuals,
reference standard, resolution, sensor nominal accuracy), the `reference_standard_uncertainty`
auto-fetch feature (Phase 1b), and the three decision rules diverging on the same data.

This example has **two calibrations**: first you calibrate a reference thermometer (so it has
an `expanded_uncertainty` on file), then you calibrate the working sensor *against* that
reference — this is what makes MAR auto-populate the "reference standard" budget row.

### 1.0 Setup — two assets

**Asset A — reference standard** (create via Assets → New Asset):

| Field | Value |
|---|---|
| Name | Reference PT100 Standard |
| Manufacturer / Model | anything, e.g. Fluke / 5628 |
| Asset type | sensor |

Add one sensor channel:

| Field | Value |
|---|---|
| Channel ID | CH1 |
| Physical quantity | Temperature |
| Range min / max | 0 / 100 |
| Unit | °C |
| Calibration role | **checked** (reference standard) |

Leave accuracy/resolution/uncertainty fields blank on this asset — they're not used in this
example (only its *calibration record's* `expanded_uncertainty` matters, computed in step 1.1).

**Asset B — working sensor**:

| Field | Value |
|---|---|
| Name | Process Line Thermometer |
| Manufacturer / Model | anything, e.g. Generic / PT100-A |
| Asset type | sensor |

Add one sensor channel:

| Field | Value |
|---|---|
| Channel ID | CH1 |
| Physical quantity | Temperature |
| Range min / max | 0 / 100 |
| Unit | °C |
| Accuracy value | 0.5 |
| Accuracy unit | **°C** (a real unit means "absolute"; enter the range first if you'd rather pick "% FS" instead — must match the reference/measured unit used below either way) |
| Resolution | 0.1 |
| Resolution unit | °C |
| Measurement uncertainty | 0.3 |
| Uncertainty unit | °C |
| Calibration role | (unchecked / not a reference standard) |

Leave "Output signal unit" blank on both channels so the measured-value unit defaults to °C
(same as the reference unit) — this avoids any unit-conversion complexity for this example.
Note there's no "Accuracy type" field to set separately — MAR derives it from whichever unit
you pick in the Accuracy/Resolution/Uncertainty unit dropdowns (a real unit like °C means
"absolute"; picking "% FS" from that same dropdown means "percent of full scale" — that
option only appears once Range min/max are filled in). There's also no "Confidence level" or
"Coverage factor" field on the channel anymore — those were channel-level metadata that
nothing actually used; the confidence level that matters is chosen per-calibration in the
wizard (step 1.1 below).

### 1.1 Calibrate the reference standard first

On Asset A, start a calibration:

- Calibration type: **internal** (or external — doesn't matter here, no reference asset needed for this one)
- Distribution: Normal, Confidence 95%
- No accuracy spec needed (skip channel accuracy — it's not set on this channel)

Data points (reference = a higher-tier standard's value; measured = this reference thermometer's reading):

| # | Reference (°C) | Measured (°C) |
|---|---|---|
| 1 | 0.000 | 0.010 |
| 2 | 50.000 | 50.020 |
| 3 | 100.000 | 99.985 |

**The math:**

Fitting `reference = a·measured + b` (degree 1, `np.polyfit`) to these 3 points gives:

```
a = 1.00025 (slope)
b = -0.01750 (intercept)
```

Residuals (`reference − calculated`):

| Point | Calculated | Residual |
|---|---|---|
| 1 | -0.007498 | **+0.007498** |
| 2 | 50.015004 | **-0.015004** |
| 3 | 99.992495 | **+0.007505** |

- `n = 3` points, `k = 2` parameters → **residual degrees of freedom = 1**
- **Type A standard uncertainty** = sample std dev of residuals (`ddof=1`) = **0.012994** °C
- No Type B contributions were configured on this channel, so the budget has exactly one row:

| Source | Distribution | u | dof |
|---|---|---|---|
| fit_residuals (Type A) | normal | 0.012994 | 1 |

- **Combined uncertainty** u_c = √(0.012994²) = **0.012994 °C**
- **Coverage factor** k is now always *derived* from the confidence level (GUM §6.3.3's
  "simple case"), not entered separately — for a normal distribution at 95% confidence,
  k = norm.ppf(0.975) ≈ **1.96**.
- **Expanded uncertainty** U = k·u_c = 1.96 × 0.012994 = **0.025467 °C** ≈ **0.025 °C** (2 sig figs)

**Expected results in the wizard (Step 3):**

| Field | Value |
|---|---|
| R² | 0.99999993 |
| RMSE | 0.010609 |
| Max error | 0.015004 |
| Combined uncertainty | 0.012994 (shown rounded: **0.013**) |
| Expanded uncertainty (±) | 0.025467 (shown rounded: **0.025**) |

Save this calibration. **Write down the Expanded uncertainty (0.025 °C) — Asset B's
calibration will fetch this automatically in the next step.**

### 1.2 Calibrate the working sensor against the reference standard

On Asset B, start a calibration:

- Calibration type: **internal**
- Reference asset: **Reference PT100 Standard** (Asset A) — as soon as you pick it, the
  wizard should show "Ref. standard U: 0.025 °C (last calibration of Reference PT100 Standard)"
  in the Step 3 controls row. If it instead shows a manual-entry field, the fetch didn't find
  a calibration on Asset A — go back and confirm step 1.1 was saved.
- Distribution: Normal, Confidence 95%
- Decision rule: **Guard band (tolerance − U)**
- Check **"Incl. sensor nominal accuracy"** (this folds in the channel's 0.3 °C manufacturer spec)

Data points:

| # | Reference (°C) | Measured (°C) |
|---|---|---|
| 1 | 0.00  |  0.05  |
| 2 | 20.00 | 20.08 |
| 3 | 40.00 | 39.95 |
| 4 | 60.00 | 60.12 |
| 5 | 80.00 | 79.90 |
| 6 | 100.00| 100.07 |

**The math:**

Fit: `a = 1.00038`, `b = -0.04739`.

| Point | Calculated | Residual |
|---|---|---|
| 1 | 0.002631 | -0.002631 |
| 2 | 20.040260 | -0.040260 |
| 3 | 39.917828 | +0.082172 |
| 4 | 60.095510 | -0.095510 |
| 5 | 79.883044 | +0.116956 |
| 6 | 100.060727 | -0.060727 |

- `n = 6`, `k = 2` → residual dof = **4**
- Max error = **0.116956** (point 5) → Full-scale error = 0.116956/100 × 100% = **0.117%**

**Uncertainty budget** (four rows this time):

| Source | How it's derived | u |
|---|---|---|
| fit_residuals (Type A) | std dev of the 6 residuals above, dof=4 | 0.083509 |
| reference_standard (Type B) | 0.025467 (Asset A's U) ÷ k=2 | 0.012734 |
| resolution (Type B) | 0.1 ÷ √12 (rectangular) | 0.028868 |
| sensor_nominal_accuracy (Type B) | 0.3 ÷ k=2 | 0.150000 |

- **Combined**: u_c = √(0.083509² + 0.012734² + 0.028868² + 0.150000²) = **0.174554 °C**
- **Effective degrees of freedom** (Welch-Satterthwaite — only `fit_residuals` has finite dof,
  the three Type B rows are treated as exactly known and drop out of the sum):
  ```
  ν_eff = u_c⁴ / (u_A⁴ / dof_A) = 0.174554⁴ / (0.083509⁴ / 4) ≈ 76.4
  ```
- **Expanded** (normal distribution — coverage factor is derived from confidence_level, not
  entered; ν_eff isn't used for the "normal" case, only for "t"/"chi_squared"):
  k = norm.ppf(0.975) ≈ 1.96, U = 1.96 × 0.174554 = **0.342120 °C** ≈ **0.34 °C** (2 sig figs)

**Decision rule (guard band, spec = ±0.5 °C absolute):**

```
guard = U = 0.342120
max_error + guard = 0.116956 + 0.342120 = 0.459076 ≤ 0.5  →  CONFORMS
```

**Expected results:**

| Field | Value |
|---|---|
| Combined uncertainty | shown rounded: **0.17** |
| Expanded uncertainty (±) | shown rounded: **0.34** |
| ν_eff (in the Expanded tooltip) | ≈76.4 |
| Statement | **CONFORMS** to ±0.5 (absolute), decision rule = Guard-banded acceptance |

### 1.3 Bonus check — watch the three decision rules disagree

Repeat 1.2 with the channel's Accuracy value changed to **0.4** (edit the channel, save, then
re-run the same 6 points through Step 3 of a new calibration) and try all three decision rules
with "Incl. sensor nominal accuracy" still checked. Everything above is unchanged (same fit,
same budget, same U=0.342120) — only the pass/fail flips:

| Decision rule | Check | Result |
|---|---|---|
| Simple acceptance | `0.116956 ≤ 0.4` | **CONFORMS** |
| Guard band (− U) | `0.116956 + 0.342120 = 0.459076 ≤ 0.4`? No | **DOES NOT CONFORM** |
| Shared risk (+ U) | `0.116956 − 0.342120 = -0.225164 ≤ 0.4` | **CONFORMS** |

This is the cleanest way to confirm the decision-rule feature is wired correctly: identical
data and identical spec, three different verdicts depending only on which rule is selected.

---

## Example 2 — Pressure transducer, quadratic fit (auto degree selection)

Exercises: automatic polynomial-degree selection (AIC), non-linearity detection, the
t-distribution / Welch-Satterthwaite coverage factor path.

### 2.0 Setup

One asset, one channel:

| Field | Value |
|---|---|
| Name | Line Pressure Transmitter |
| Physical quantity | Pressure |
| Measurement type | Absolute (this channel doesn't need gauge/relative — either is fine for this example) |
| Range min / max | 0 / 700 |
| Unit | kPa |
| Accuracy value | 1.0 |
| Accuracy unit | **% FS** — fill in Range min/max first, then pick "% FS" as the first option in the Accuracy unit dropdown |
| Resolution | 0.5 |
| Resolution unit | kPa |

Leave measurement_uncertainty blank (not used in this example).

### 2.1 Calibration wizard settings

- Calibration type: external (no reference asset needed for this example)
- **Regression degree: Auto** (leave as "Auto" — this is the point of the example)
- Distribution: **t-distribution**, Confidence 95% (the t-distribution path derives its own
  coverage factor from the confidence level and the fit's effective degrees of freedom)
- Decision rule: Simple acceptance

Data points — a transducer with a small but real quadratic non-linearity across its range:

| # | Reference (kPa) | Measured (kPa) |
|---|---|---|
| 1 | 0.60 | 0 |
| 2 | 102.35 | 100 |
| 3 | 212.62 | 200 |
| 4 | 330.42 | 300 |
| 5 | 456.64 | 400 |
| 6 | 590.40 | 500 |
| 7 | 732.59 | 600 |
| 8 | 882.38 | 700 |

**The math:**

MAR tries degree 1 through 5 and picks the lowest degree whose AIC isn't beaten by more than
2 points by a higher degree (the "parsimony rule" in `_select_degree`). For this data it
selects **degree 2**:

```
reference = 0.00040·measured² + 0.98014·measured + 0.50917
```

(Try forcing "Regression degree: 2" explicitly — you should get the same coefficients as the
auto-selected result, confirming AIC picked the same degree you'd pick by eye from the data.)

| Point | Calculated | Residual |
|---|---|---|
| 1 | 0.509167 | +0.090833 |
| 2 | 102.519881 | -0.169881 |
| 3 | 212.523929 | +0.096071 |
| 4 | 330.521310 | -0.101310 |
| 5 | 456.512024 | +0.127976 |
| 6 | 590.496071 | -0.096071 |
| 7 | 732.473452 | +0.116548 |
| 8 | 882.444167 | -0.064167 |

- `n = 8`, `k = 3` (degree 2 → 3 coefficients) → residual dof = **5**
- Max error = **0.169881** (point 2); span = 882.38 − 0.6 = 881.78 →
  Full-scale error = 0.169881/881.78 × 100% = **0.0193%**
- **Non-linearity** = 3.17% FS (deviation of the quadratic fit from its own best-fit straight
  line) — this is the number that tells you "yes, a straight line would have been a
  noticeably worse fit," confirming degree 2 was the right call, not degree 1.

**Uncertainty budget:**

| Source | u |
|---|---|
| fit_residuals (Type A, dof=5) | 0.119470 |
| resolution (Type B) = 0.5/√12 | 0.144338 |

- Combined: u_c = √(0.119470² + 0.144338²) = **0.187367 kPa**
- ν_eff = u_c⁴ / (u_A⁴/5) ≈ **30.2** (only fit_residuals has finite dof)
- Expanded (t-distribution): k = t.ppf(0.975, df=30.2) ≈ 2.042 → U = 0.187367 × 2.042 =
  **0.382523 kPa** ≈ **0.38** (2 sig figs)

**Decision rule (simple acceptance, spec = ±1.0% FS = ±8.818 kPa):**

```
max_error = 0.169881 ≤ 8.818  →  CONFORMS (comfortably — this is a "good" calibration example)
```

**Expected results:**

| Field | Value |
|---|---|
| Polynomial degree | 2 (auto-selected) |
| Non-linearity | 3.17% |
| Combined uncertainty | shown rounded: **0.19** |
| Expanded uncertainty (±) | shown rounded: **0.38** |
| Statement | CONFORMS to ±1.0% of full scale, decision rule = Simple acceptance |

---

## Example 3 — Load cell, hysteresis + repeatability detection

Exercises: the up/down sweep hysteresis detector, the triplicate-point repeatability
detector, and another simple-acceptance-vs-shared-risk divergence.

### 3.0 Setup

| Field | Value |
|---|---|
| Name | Test Bench Load Cell |
| Physical quantity | Force |
| Range min / max | 0 / 500 |
| Unit | N |
| Accuracy value | 0.15 |
| Accuracy unit | **% FS** — fill in Range min/max first, then pick "% FS" as the first option in the Accuracy unit dropdown |
| Resolution | 0.2 |
| Resolution unit | N |

### 3.1 Calibration wizard settings

- Calibration type: external
- Regression degree: 1 (explicit — this example is about hysteresis/repeatability, not degree selection)
- Distribution: Normal, Confidence 95%
- Decision rule: **Shared risk (tolerance + U)**

Data points — an ascending sweep, a descending sweep back down (for hysteresis), and one
extra reading at 0 N (making three total readings at 0 N, for repeatability):

| # | Reference (N) | Measured (N) | Notes |
|---|---|---|---|
| 1 | 0 | 0.2 | ascending start |
| 2 | 0 | 0.3 | repeat at 0 N (#1 of the repeatability triplet) |
| 3 | 100 | 100.6 | ascending |
| 4 | 200 | 200.9 | ascending |
| 5 | 300 | 301.0 | ascending |
| 6 | 400 | 401.1 | ascending |
| 7 | 500 | 501.3 | top of sweep |
| 8 | 400 | 401.6 | descending |
| 9 | 300 | 301.7 | descending |
| 10 | 200 | 201.9 | descending |
| 11 | 100 | 101.8 | descending |
| 12 | 0 | 1.0 | back to 0 N (repeatability triplet complete) |

**The math:**

Fit (degree 1, all 12 points): `a = 0.99833`, `b = -0.76668`.

Max error = **0.863215 N**, at point 11 (reference 100 N, measured 101.8 N) → Full-scale
error = 0.863215/500 × 100% = **0.1726%**.

**Hysteresis** — MAR groups points by reference value and takes the largest spread of
measured values within any group where the reference value repeats with both an ascending and
descending segment present:

| Reference | Measured values at this reference | Span |
|---|---|---|
| 0 N | 0.2, 0.3, 1.0 | 0.8 |
| 100 N | 100.6, 101.8 | 1.2 |
| 200 N | 200.9, 201.9 | 1.0 |
| 300 N | 301.0, 301.7 | 0.7 |
| 400 N | 401.1, 401.6 | 0.5 |

Largest span = **1.2 N** (at 100 N) → **hysteresis = 1.2**

**Repeatability** — only 0 N has 3+ readings (0.2, 0.3, 1.0):

```
mean = (0.2 + 0.3 + 1.0) / 3 = 0.5
variance = [(0.2−0.5)² + (0.3−0.5)² + (1.0−0.5)²] / (3−1) = [0.09 + 0.04 + 0.25] / 2 = 0.19
repeatability = √0.19 = 0.435890 N
```

**Uncertainty budget:**

| Source | u |
|---|---|
| fit_residuals (Type A, dof=10) | 0.487526 |
| resolution (Type B) = 0.2/√12 | 0.057735 |

- Combined: u_c = √(0.487526² + 0.057735²) = **0.490933 N**
- ν_eff ≈ **10.3**
- Coverage factor k = norm.ppf(0.975) ≈ 1.96 (derived from Confidence 95%, not entered)
- Expanded: U = 0.490933 × 1.96 = **0.962211 N** ≈ **0.96** (2 sig figs)

**Decision rule — try both and compare:**

The accuracy spec is ±0.15% FS, so the tolerance is flat across the whole range:
`tolerance = 0.0015 × 500 N = 0.75 N`. The sweep's largest error (0.863215 N, at reference
100 N) exceeds that:

| Decision rule | Check (max_error = 0.863215, tolerance = 0.75) | Result |
|---|---|---|
| Simple acceptance | `0.863215 ≤ 0.75`? No | **DOES NOT CONFORM** |
| Shared risk (+U) | `0.863215 − 0.962211 = -0.098996 ≤ 0.75` | **CONFORMS** |

This is a genuinely realistic case: a load cell whose raw error exceeds its tight ±0.15% FS
spec, but whose overall measurement uncertainty is large enough that, under a shared-risk
rule, the lab and customer agree it's still an acceptable result. It's a good test of both
"real fails happen" and "the rule you pick changes the outcome."

**Expected results:**

| Field | Value |
|---|---|
| Hysteresis | 1.2 |
| Repeatability | 0.435890 raw; displayed as **0.43589** (regression statistics like this use the UI's general 6-decimal display formatting, not the 2-sig-fig uncertainty rounding — see "Rounding" below) |
| Combined uncertainty | shown rounded: **0.49** |
| Expanded uncertainty (±) | shown rounded: **0.96** |
| Statement (simple acceptance) | DOES NOT CONFORM to ±0.15% of full scale |
| Statement (shared risk) | CONFORMS to ±0.15% of full scale |

---

## Rounding — what you'll actually see on screen

The raw numbers above are what the calculation engine produces internally (and what's stored
in the database, already rounded server-side to 8 decimal places — not the same thing as the
2-sig-fig display rule below). Two different rounding rules apply on top of that in the UI:

1. **Combined and expanded uncertainty are rounded to at most 2 significant figures** for
   display, per GUM §7.2.6 — in the wizard, the historical calibration view, and the
   certificate PDF (`apps/api/app/utils/uncertainty_format.py::round_to_sig_figs`, mirrored on
   the frontend as `apps/web/src/lib/uncertainty-format.ts`). This is the "shown rounded: …"
   value in each example above.
2. **Every other stat** (R², RMSE, max error, hysteresis, repeatability, …) goes through a
   general-purpose number formatter that keeps a fixed number of decimal places and strips
   trailing zeros. The wizard's live analysis (`fmtN`, `CalibrationWizard.tsx`) defaults to 6
   decimals; the historical-calibration view on the asset page (`fmtNum`, `page.tsx`) defaults
   to 4 — so the same stored value can display with one fewer decimal digit once a calibration
   is saved and you're looking at its history entry versus its live analysis. Either way,
   `0.99999993` rounds to `1` at 6 decimals (and also at 4), and `0.43588989` shows as
   `0.43589` in the wizard but `0.4359` in the history view. Seeing R² display as exactly `1`
   for a near-perfect fit is this formatter rounding up, not a bug — the stored value is still
   0.99999993, not exactly 1.

The "Expected results" tables above give the full raw value throughout (for verifying the
underlying math) and call out the rounded value only where a rule actually changes what's
displayed (combined/expanded uncertainty).

## If your numbers don't match

- **Off by a unit-conversion-sized factor (10, 100, 1000...)**: check that "Accuracy unit" on
  the sensor channel matches the reference/measured unit you used when entering points. MAR
  does not currently validate that these agree (see the note in `CALIBRATION.md`).
- **"% FS" doesn't appear in the Accuracy/Resolution/Uncertainty unit dropdown**: it only shows
  up once both Range min and Range max are filled in on that channel — it needs a range to
  convert a percentage into an absolute value against.
- **"Reference standard" row missing in Example 1.2**: confirm Asset A's calibration (1.1) was
  actually saved (not just analyzed) before starting Asset B's calibration, and that Asset A's
  channel has Calibration role = reference (the reference-asset picker only lists assets with
  at least one reference-role channel).
- **Different polynomial degree in Example 2**: if you get a different degree than 2, try
  re-entering the points exactly as listed (small transcription errors shift which degree AIC
  prefers) — polynomial fitting is sensitive to exact input values in a way the other checks
  aren't.
