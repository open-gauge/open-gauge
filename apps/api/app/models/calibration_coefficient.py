import enum
import uuid
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class CoefficientType(str, enum.Enum):
    linear = "linear"
    polynomial = "polynomial"


class CalibrationCoefficient(Base):
    __tablename__ = "calibration_coefficients"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    calibration_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("calibrations.id"), nullable=False, index=True)
    channel: Mapped[str | None] = mapped_column(String(50), nullable=True)
    coefficient_type: Mapped[CoefficientType] = mapped_column(Enum(CoefficientType, name="coefficient_type_enum"), nullable=False)
    offset_value: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    gain: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    poly_degree: Mapped[int | None] = mapped_column(Integer, nullable=True)
    poly_coefficients: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    unit_input: Mapped[str | None] = mapped_column(String(50), nullable=True)
    unit_output: Mapped[str | None] = mapped_column(String(50), nullable=True)
    range_min: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    range_max: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    uncertainty: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    uncertainty_coverage_factor: Mapped[float | None] = mapped_column(Numeric(5, 3), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Migration 004: regression statistics
    r_squared: Mapped[float | None] = mapped_column(Numeric(10, 8), nullable=True)
    rmse: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    standard_error: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    max_error: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    full_scale_error_pct: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    non_linearity_pct: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    repeatability: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    hysteresis: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    distribution_type: Mapped[str | None] = mapped_column(String(20), nullable=True)
    confidence_level: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    combined_uncertainty: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    expanded_uncertainty: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    valid_range_min: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    valid_range_max: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
