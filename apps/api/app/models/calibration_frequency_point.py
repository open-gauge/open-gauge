import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class CalibrationFrequencyPoint(Base):
    """One point of an optional frequency-response sweep recorded alongside a
    calibration's primary transfer function (see Calibration.has_frequency_response)."""

    __tablename__ = "calibration_frequency_points"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    calibration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calibrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sweep_index: Mapped[int] = mapped_column(Integer, nullable=False)
    frequency_value: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    amplitude_value: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    phase_value: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
