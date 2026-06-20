import uuid
from datetime import datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, Numeric, String, Text, func
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
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Calibration metadata
    sensor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sensors.id"), nullable=True)
    calibration_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="external")
    calibration_version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    calibration_interval: Mapped[int | None] = mapped_column(Integer, nullable=True)
    tolerance_criteria: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # Traceability
    internal_reference_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=True)
    internal_procedure_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("procedures.id"), nullable=True)
    external_lab_certificate_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    daq_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("daq.id"), nullable=True)
    calibration_data_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("calibration_data.id"), nullable=True)

    # Environmental conditions (canonical units: °C, %RH, Pa)
    temperature: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    humidity: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    pressure: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)

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
