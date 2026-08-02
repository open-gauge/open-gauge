import uuid
from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class Calibration(Base):
    __tablename__ = "calibrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False, index=True)
    calibration_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    due_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    performed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    performed_by_name: Mapped[str] = mapped_column(String(255), nullable=False)
    external_lab_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    calibration_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)
    # A user-uploaded certificate PDF (OEM/External Accredited Lab types), distinct
    # from calibration_file_id (the system-generated one) — kept as a separate column
    # so certificate (re)generation never clobbers an uploaded file. Takes priority
    # over calibration_file_id wherever a certificate is served/downloaded.
    uploaded_certificate_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Calibration metadata. calibration_type describes who performed the calibration
    # ("oem" | "external_accredited_lab" | "internal_lab" | "customer_asset");
    # calibration_purpose describes why ("initial" | "routine" | "after_repair" |
    # "verification"). Both plain VARCHAR + Pydantic-layer validation, matching the
    # rest of this model's "enum-like" columns.
    sensor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sensors.id"), nullable=True)
    calibration_type: Mapped[str] = mapped_column(String(30), nullable=False, server_default="external_accredited_lab")
    calibration_purpose: Mapped[str] = mapped_column(String(20), nullable=False, default="routine", server_default="routine")
    calibration_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    calibration_interval: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tolerance_criteria: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # How the data was entered — orthogonal to calibration_type (who performed it) and
    # calibration_purpose (why): "raw_data" (reference vs. raw output-signal points, fitted),
    # "model_direct" (a lab-supplied model, no raw data — the generalized successor of the
    # old "coefficients only" flow), "reference_vs_indicated" (reference vs. an
    # already-physical-quantity value, no known transfer function — verification purpose
    # only), "reference_vs_as_found_as_left" (same, but two datasets around a repair —
    # after_repair purpose only; as-left is this record's primary result, as-found is
    # diagnostic-only, see as_found_summary below).
    data_entry_mode: Mapped[str] = mapped_column(String(30), nullable=False, server_default="raw_data")
    # model_type describes the shape of poly_coefficients/custom_formula below:
    # "polynomial" (poly_order/poly_coefficients, as always) or "custom_formula" (an
    # arbitrary single-variable expression in custom_formula, x = the raw/measured input).
    model_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="polynomial")
    custom_formula: Mapped[str | None] = mapped_column(Text, nullable=True)
    # Diagnostic-only summary for the "as found" side of a reference_vs_as_found_as_left
    # calibration — an AnalyzeResponse-shaped blob (stats/uncertainty/conformity/points),
    # client-computed and stored verbatim like every other analysis field on this model.
    # Never feeds due-date/approval/Health-tab calculations — those all read the record's
    # own primary columns (the as-left result).
    as_found_summary: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Repair tracking — only meaningful when calibration_purpose == "after_repair".
    repair_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    repair_description: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Traceability
    internal_reference_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=True)
    internal_procedure_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("procedures.id"), nullable=True)
    external_lab_certificate_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    # The organization that performed the calibration, for "external_accredited_lab"
    # (a provider) or "customer_asset" (a customer) — see Organization.org_type.
    # Not used for "oem" (a text snapshot in external_lab_name) or "internal_lab"
    # (calibration_location_id below).
    calibration_organization_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True)
    daq_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("daq.id"), nullable=True)
    calibration_data_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("calibration_data.id"), nullable=True)
    calibration_location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True)

    # Environmental conditions (canonical units: °C, %RH, Pa). Each has an optional
    # uncertainty (± magnitude), stored in the same canonical unit as its value —
    # the wizard converts an entered uncertainty through the same unit conversion
    # as the value (minus any additive offset, since a delta has none).
    temperature: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    temperature_uncertainty: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    humidity: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    humidity_uncertainty: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    pressure: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    pressure_uncertainty: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)

    # Optional frequency-response sweep (see CalibrationFrequencyPoint for the swept
    # points). Values are stored exactly as entered, not canonicalized — the sweep's
    # chosen units are part of what's being recorded, same rationale as
    # reference_unit/measured_unit on CalibrationData. amplitude_type/phase_unit being
    # null means that field wasn't captured for this sweep (no separate "active" flags).
    has_frequency_response: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    frequency_response_frequency_unit: Mapped[str | None] = mapped_column(String(10), nullable=True)
    frequency_response_amplitude_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    frequency_response_amplitude_unit: Mapped[str | None] = mapped_column(String(20), nullable=True)
    frequency_response_phase_unit: Mapped[str | None] = mapped_column(String(10), nullable=True)

    # Polynomial model
    poly_order: Mapped[int | None] = mapped_column(Integer, nullable=True)
    poly_coefficients: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    range_min: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    range_max: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)

    # Regression statistics
    r_squared: Mapped[float | None] = mapped_column(Numeric(10, 8), nullable=True)
    rmse: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    standard_error: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    max_error: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    full_scale_error: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    non_linearity: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    repeatability: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    hysteresis: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    distribution_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    confidence_level: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    coverage_factor: Mapped[float | None] = mapped_column(Numeric(5, 3), nullable=True)
    combined_uncertainty: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    expanded_uncertainty: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    valid_range_min: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    valid_range_max: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)

    # Uncertainty budget: itemized Type A / Type B contributions (GUM Annex H.1 format),
    # e.g. [{"source": "fit_residuals", "standard_uncertainty": ..., "degrees_of_freedom": ...}, ...]
    uncertainty_budget: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    effective_degrees_of_freedom: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)

    # Fitted coefficient covariance matrix (N x N, N = poly_order + 1). Needed to correctly
    # propagate uncertainty when using two or more fitted coefficients together
    # (GUM Annex H.3, GUM-6 §8.1.6) — ignoring it understates the result's uncertainty.
    poly_coefficients_covariance: Mapped[list | None] = mapped_column(JSONB, nullable=True)

    # Decision rule applied to the pass/fail conformity statement, and the statement itself
    # (ISO/IEC 17025 §7.1.3, §7.8.6 — the rule must be documented, not just implied).
    decision_rule: Mapped[str] = mapped_column(String(30), nullable=False, server_default="simple_acceptance")
    conformity_statement: Mapped[dict | None] = mapped_column(JSONB, nullable=True)

    # Reminder tracking: set once a "due soon" / "overdue" notification email has been
    # sent for this calibration cycle, so the daily sweep never sends duplicates.
    due_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    overdue_reminder_sent_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Soft-void state. Calibration history is never destroyed (see AGENTS.md's
    # calibration philosophy) — an admin can only mark a record invalid, which hides
    # it from listings/due-date calculations/drift analysis and can be reversed.
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    voided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    voided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    void_reason: Mapped[str | None] = mapped_column(Text, nullable=True)

    # Approval workflow. status is the single source of truth for a calibration's
    # lifecycle state ("valid" | "pending_approval" | "rejected" | "void");
    # is_active is kept in sync as (status == "valid") at every write site so the
    # many existing is_active-based filters (due-date calc, dashboard, reminders)
    # correctly treat a pending-approval or rejected calibration as "not current"
    # with no changes of their own. checked_by_* mirrors performed_by_* (a
    # denormalized snapshot of the assigned reviewer); decided_by/decided_at/
    # decision_reason record who approved/rejected it and, for a rejection, why.
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="valid", server_default="valid")
    checked_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    checked_by_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    decided_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    decision_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
