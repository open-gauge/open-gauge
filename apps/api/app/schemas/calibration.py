import uuid
from datetime import date, datetime
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator

# "valid" (used for the channel's calibration), "pending_approval" (awaiting the
# assigned checker's decision), "rejected" (decided against, terminal), "void"
# (admin override, reachable from any status). Plain VARCHAR + app-level closed
# list, matching every other calibration-level "enum" in this model.
CALIBRATION_STATUSES = ("valid", "pending_approval", "rejected", "void")

# Who performed the calibration. "oem" = the sensor's manufacturer (calibration lab
# is a read-only snapshot of the asset's manufacturer, not a real org/location).
# "external_accredited_lab" = an external organization typed as a provider.
# "internal_lab" = performed in-house (calibration_location_id, the existing
# Location-based "calibration lab" dropdown). "customer_asset" = an external
# organization typed as a customer (we performed it for them).
CALIBRATION_TYPES = ("oem", "external_accredited_lab", "internal_lab", "customer_asset")

# Why the calibration was performed.
CALIBRATION_PURPOSES = ("initial", "routine", "after_repair", "verification")

# How the data was entered — orthogonal to calibration_type/calibration_purpose above.
# "raw_data": reference vs. raw output-signal points, fitted to a model (the original,
# still-default flow). "model_direct": a lab-supplied model (coefficients or a custom
# formula) with no raw data at all — the generalized successor of the old
# "coefficients only" flow. "reference_vs_indicated": reference vs. an
# already-physical-quantity value with no known transference function — only
# calibration_purpose="verification". "reference_vs_as_found_as_left": same, but two
# datasets around a repair — only calibration_purpose="after_repair"; the primary
# points/stats on this record are the as-left side, as_found_summary below is
# diagnostic-only.
DATA_ENTRY_MODES = (
    "raw_data", "model_direct", "reference_vs_indicated", "reference_vs_as_found_as_left",
)

# What poly_coefficients/custom_formula on a calibration represent. "lookup_table"
# has neither — the model is the calibration's own primary points, linearly
# interpolated (data_entry_mode=raw_data's Step 3 "Calibration method" only;
# see calibration_analysis.run_analysis's calibration_method param).
MODEL_TYPES = ("polynomial", "custom_formula", "lookup_table")

# data_entry_mode=raw_data's Step 3 "Calibration method" — how the raw
# (reference, measured) points become a model. Orthogonal to model_type
# above: this selects *which* fitting strategy to run; its result is stored
# using the same model_type/poly_coefficients/custom_formula columns any
# other calibration uses.
CALIBRATION_METHODS = ("polynomial_fit", "lookup_table", "custom_formula")


# ------------------------------------------------------------------ #
# Analyze endpoint                                                    #
# ------------------------------------------------------------------ #

class AnalyzePointIn(BaseModel):
    reference: float
    measured: float


class AnalyzeRequest(BaseModel):
    points: list[AnalyzePointIn] = Field(min_length=2)
    reference_unit: str
    measured_unit: str
    physical_quantity: str = ""
    poly_degree: int | None = None
    # True for "reference_vs_indicated"/"reference_vs_as_found_as_left" —
    # `measured` is already directly comparable to `reference` (no known
    # transference function), so no curve is fitted at all; residual =
    # measured - reference. See calibration_analysis.run_analysis.
    skip_fit: bool = False
    # data_entry_mode=raw_data's Step 3 "Calibration method" — consulted only
    # when skip_fit=False. See CALIBRATION_METHODS.
    calibration_method: str = "polynomial_fit"
    # A "custom formula" *template* with free parameters (e.g. "a*x + b") —
    # fitted to the points when calibration_method="custom_formula", or
    # resolved via direct substitution of custom_formula_params when
    # skip_fit=True (data_entry_mode=model_direct's declared-values flow;
    # the points above are then the two synthetic zero-residual corner
    # points, unrelated to the formula itself).
    custom_formula_template: str | None = None
    custom_formula_params: dict[str, float] | None = None
    distribution_type: str = "normal"
    confidence_level: float = 95.0
    channel_accuracy_value: float | None = None
    channel_accuracy_type: str | None = None
    decision_rule: str = "simple_acceptance"
    # The wizard's editable Tolerance box (already converted to reference
    # units client-side) — when set, overrides channel_accuracy_value/type
    # entirely for the conformity check. See _apply_decision_rule.
    tolerance_override_value: float | None = None

    # Type B uncertainty contributions (GUM §4.3) — all optional; each is
    # combined into the uncertainty budget only if supplied.
    reference_standard_uncertainty: float | None = None
    reference_standard_coverage_factor: float = 2.0
    resolution: float | None = None
    sensor_nominal_uncertainty: float | None = None
    sensor_nominal_coverage_factor: float = 2.0
    include_sensor_nominal_uncertainty: bool = False


class AnalyzePointOut(BaseModel):
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None
    residual_abs: float | None
    residual_pct: float | None


class UncertaintyContributionOut(BaseModel):
    source: str
    description: str
    value: float
    distribution: str
    divisor: float
    standard_uncertainty: float
    degrees_of_freedom: float | None


class AnalyzeResponse(BaseModel):
    # None/[] when the request had skip_fit=True — no curve was fitted.
    poly_degree: int | None
    coefficients: list[float]
    r_squared: float
    rmse: float
    standard_error: float
    max_error: float
    full_scale_error_pct: float
    non_linearity_pct: float | None
    repeatability: float | None
    hysteresis: float | None
    combined_uncertainty: float
    expanded_uncertainty: float
    distribution_type: str
    confidence_level: float
    coverage_factor: float
    valid_range_min: float
    valid_range_max: float
    passed: bool
    conformity_statement: dict
    uncertainty_budget: list[UncertaintyContributionOut]
    effective_degrees_of_freedom: float | None
    poly_coefficients_covariance: list[list[float]] | None
    points: list[AnalyzePointOut]
    # Set when a custom formula was involved — either fitted
    # (calibration_method="custom_formula") or declared/resolved directly
    # (skip_fit=True + custom_formula_template, model_direct's flow).
    resolved_custom_formula: str | None = None
    custom_formula_parameter_values: dict[str, float] | None = None


# ------------------------------------------------------------------ #
# Calibration data points                                            #
# ------------------------------------------------------------------ #

class CalibrationPointInline(BaseModel):
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None = None
    residual_abs: float | None = None
    residual_pct: float | None = None
    reference_unit: str
    measured_unit: str
    # "primary" (this record's official dataset) or "as_found" (the diagnostic
    # pre-repair dataset of a reference_vs_as_found_as_left calibration).
    point_role: str = "primary"


class CalibrationPointResponse(BaseModel):
    id: uuid.UUID
    calibration_id: uuid.UUID
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None
    residual_abs: float | None
    residual_pct: float | None
    reference_unit: str
    measured_unit: str
    point_role: str = "primary"
    created_at: datetime

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------ #
# Frequency-response sweep points                                    #
# ------------------------------------------------------------------ #

class FrequencyResponsePointInline(BaseModel):
    sweep_index: int
    frequency_value: float
    amplitude_value: float | None = None
    phase_value: float | None = None


class FrequencyResponsePointResponse(BaseModel):
    id: uuid.UUID
    calibration_id: uuid.UUID
    sweep_index: int
    frequency_value: float
    amplitude_value: float | None
    phase_value: float | None
    created_at: datetime

    model_config = {"from_attributes": True}


# ------------------------------------------------------------------ #
# Calibration create / response (flat)                               #
# ------------------------------------------------------------------ #

class CalibrationCreate(BaseModel):
    # model_type isn't a Pydantic "protected model_ namespace" field — it's
    # our own data_entry_mode=model_direct concept — silence the warning.
    model_config = {"protected_namespaces": ()}

    asset_id: uuid.UUID
    calibration_date: date
    due_date: date
    performed_by_name: str = Field(min_length=1, max_length=255)
    performed_by_user_id: uuid.UUID | None = None
    checked_by_user_id: uuid.UUID | None = None
    checked_by_name: str | None = None
    external_lab_name: str | None = None
    notes: str | None = None

    # Metadata
    sensor_id: uuid.UUID | None = None
    calibration_type: str = "external_accredited_lab"
    calibration_purpose: str = "routine"
    calibration_interval: int | None = None
    tolerance_criteria: str | None = None

    # How the data below was entered — see DATA_ENTRY_MODES.
    data_entry_mode: str = "raw_data"
    model_type: str = "polynomial"
    custom_formula: str | None = None
    # Diagnostic-only "as found" dataset for reference_vs_as_found_as_left —
    # never feeds due-date/approval/Health-tab calculations, see as_found_summary.
    as_found_points: list[CalibrationPointInline] = Field(default_factory=list)
    as_found_summary: dict | None = None

    # Repair tracking — only meaningful when calibration_purpose == "after_repair"
    repair_date: date | None = None
    repair_description: str | None = Field(None, max_length=500)

    # Traceability
    internal_reference_asset_id: uuid.UUID | None = None
    internal_procedure_id: uuid.UUID | None = None
    external_lab_certificate_number: str | None = None
    calibration_organization_id: uuid.UUID | None = None
    daq_id: uuid.UUID | None = None
    calibration_location_id: uuid.UUID | None = None

    @field_validator("calibration_type")
    @classmethod
    def validate_calibration_type(cls, value: str) -> str:
        if value not in CALIBRATION_TYPES:
            raise ValueError(f"Unsupported calibration_type: {value}")
        return value

    @field_validator("calibration_purpose")
    @classmethod
    def validate_calibration_purpose(cls, value: str) -> str:
        if value not in CALIBRATION_PURPOSES:
            raise ValueError(f"Unsupported calibration_purpose: {value}")
        return value

    @field_validator("data_entry_mode")
    @classmethod
    def validate_data_entry_mode(cls, value: str) -> str:
        if value not in DATA_ENTRY_MODES:
            raise ValueError(f"Unsupported data_entry_mode: {value}")
        return value

    @field_validator("model_type")
    @classmethod
    def validate_model_type(cls, value: str) -> str:
        if value not in MODEL_TYPES:
            raise ValueError(f"Unsupported model_type: {value}")
        return value

    @model_validator(mode="after")
    def _validate_data_entry_mode_purpose_pairing(self) -> "CalibrationCreate":
        # reference_vs_indicated is open to every purpose — the wizard's own
        # Step 2 no longer restricts it to verification.
        if self.data_entry_mode == "reference_vs_as_found_as_left" and self.calibration_purpose != "after_repair":
            raise ValueError("data_entry_mode=reference_vs_as_found_as_left requires calibration_purpose=after_repair")
        if self.data_entry_mode == "model_direct" and self.calibration_purpose == "after_repair":
            raise ValueError(
                "data_entry_mode=model_direct is not available for calibration_purpose=after_repair — "
                "use raw_data or reference_vs_indicated, which split into as-found/as-left data instead"
            )
        return self

    # Environmental conditions (canonical units: °C, %RH, Pa)
    temperature: float | None = None
    temperature_uncertainty: float | None = None
    humidity: float | None = None
    humidity_uncertainty: float | None = None
    pressure: float | None = None
    pressure_uncertainty: float | None = None

    # Polynomial model
    poly_order: int | None = None
    poly_coefficients: list[float] | None = None
    range_min: float | None = None
    range_max: float | None = None

    # Regression statistics
    r_squared: float | None = None
    rmse: float | None = None
    standard_error: float | None = None
    max_error: float | None = None
    full_scale_error: float | None = None
    non_linearity: float | None = None
    repeatability: float | None = None
    hysteresis: float | None = None
    distribution_type: str | None = None
    confidence_level: float | None = None
    coverage_factor: float | None = None
    combined_uncertainty: float | None = None
    expanded_uncertainty: float | None = None
    valid_range_min: float | None = None
    valid_range_max: float | None = None

    # Uncertainty budget (GUM Annex H.1-style itemized contributions)
    uncertainty_budget: list[dict] | None = None
    effective_degrees_of_freedom: float | None = None

    # Fitted coefficient covariance matrix (GUM Annex H.3 / GUM-6 §8.1.6)
    poly_coefficients_covariance: list[list[float]] | None = None

    # Decision rule / conformity statement (ISO/IEC 17025 §7.1.3, §7.8.6)
    decision_rule: str | None = None
    conformity_statement: dict | None = None

    # Frequency response sweep (optional)
    has_frequency_response: bool = False
    frequency_response_frequency_unit: str | None = None
    frequency_response_amplitude_type: str | None = None
    frequency_response_amplitude_unit: str | None = None
    frequency_response_phase_unit: str | None = None
    frequency_response_points: list[FrequencyResponsePointInline] = Field(default_factory=list)

    # Embedded data points
    points: list[CalibrationPointInline] = Field(default_factory=list)


class CalibrationUserResponse(BaseModel):
    """A candidate for the calibration wizard's Registered By / Checked By
    dropdowns — an active Technician/Admin/Super Admin member of the asset's
    organization."""

    id: uuid.UUID
    name: str
    email: str
    profile_picture_url: str | None = None

    model_config = {"from_attributes": True}


class CalibrationLabCandidateResponse(BaseModel):
    """A minimal external-organization candidate for the wizard's Calibration Lab
    picker (External Accredited Lab / Customer's Asset types) — deliberately just
    id+name, not the full organization profile (which stays Admin/Super-Admin-only;
    see GET /organizations/calibration-lab-candidates)."""

    id: uuid.UUID
    name: str

    model_config = {"from_attributes": True}


class CalibrationResponse(BaseModel):
    id: uuid.UUID
    asset_id: uuid.UUID
    calibration_date: date
    due_date: date
    performed_by_user_id: uuid.UUID | None
    performed_by_name: str
    checked_by_user_id: uuid.UUID | None = None
    checked_by_name: str | None = None
    external_lab_name: str | None
    notes: str | None
    calibration_file_id: uuid.UUID | None
    uploaded_certificate_file_id: uuid.UUID | None = None
    created_by: uuid.UUID
    created_at: datetime

    # Metadata
    sensor_id: uuid.UUID | None
    calibration_type: str
    calibration_purpose: str = "routine"
    calibration_version: int
    calibration_interval: int | None
    tolerance_criteria: str | None
    repair_date: date | None = None
    repair_description: str | None = None
    calibration_organization_id: uuid.UUID | None = None
    data_entry_mode: str = "raw_data"
    model_type: str = "polynomial"
    custom_formula: str | None = None
    as_found_summary: Any | None = None

    # Traceability
    internal_reference_asset_id: uuid.UUID | None
    internal_procedure_id: uuid.UUID | None
    external_lab_certificate_number: str | None
    daq_id: uuid.UUID | None
    calibration_data_id: uuid.UUID | None
    calibration_location_id: uuid.UUID | None = None

    # Environmental conditions
    temperature: float | None
    temperature_uncertainty: float | None
    humidity: float | None
    humidity_uncertainty: float | None
    pressure: float | None
    pressure_uncertainty: float | None

    # Polynomial model
    poly_order: int | None
    poly_coefficients: Any | None
    range_min: float | None
    range_max: float | None

    # Regression statistics
    r_squared: float | None
    rmse: float | None
    standard_error: float | None
    max_error: float | None
    full_scale_error: float | None
    non_linearity: float | None
    repeatability: float | None
    hysteresis: float | None
    distribution_type: str | None
    confidence_level: float | None
    coverage_factor: float | None
    combined_uncertainty: float | None
    expanded_uncertainty: float | None
    valid_range_min: float | None
    valid_range_max: float | None

    # Uncertainty budget (GUM Annex H.1-style itemized contributions)
    uncertainty_budget: Any | None = None
    effective_degrees_of_freedom: float | None = None

    # Fitted coefficient covariance matrix (GUM Annex H.3 / GUM-6 §8.1.6)
    poly_coefficients_covariance: Any | None = None

    # Decision rule / conformity statement (ISO/IEC 17025 §7.1.3, §7.8.6)
    decision_rule: str | None = None
    conformity_statement: Any | None = None

    # Frequency response sweep (optional)
    has_frequency_response: bool = False
    frequency_response_frequency_unit: str | None = None
    frequency_response_amplitude_type: str | None = None
    frequency_response_amplitude_unit: str | None = None
    frequency_response_phase_unit: str | None = None

    # Soft-void state
    is_active: bool = True
    voided_at: datetime | None = None
    voided_by: uuid.UUID | None = None
    void_reason: str | None = None

    # Approval workflow
    status: str = "valid"
    decided_by: uuid.UUID | None = None
    decided_at: datetime | None = None
    decision_reason: str | None = None

    model_config = {"from_attributes": True, "protected_namespaces": ()}
