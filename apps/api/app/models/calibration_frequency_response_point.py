import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class CalibrationFrequencyResponsePoint(Base):
    __tablename__ = "calibration_frequency_response_points"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    calibration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calibrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sweep_index: Mapped[int] = mapped_column(Integer, nullable=False)
    frequency_value: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    reference_value: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    measured_value: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    offset_value: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    reference_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    measured_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    # sensitivity_value = measured_value / reference_value; deviation_pct = this
    # point's sensitivity vs. the sweep's chosen baseline sensitivity, in % —
    # both computed server-side (see services/frequency_response_analysis.py)
    # and stored, same traceability rationale as CalibrationData's
    # calculated_value/residual_pct: the value actually shown/certified is the
    # one saved, not re-derived later.
    sensitivity_value: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    deviation_pct: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
