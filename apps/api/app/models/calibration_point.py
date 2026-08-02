import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class CalibrationData(Base):
    __tablename__ = "calibration_data"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    calibration_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("calibrations.id", ondelete="CASCADE"), nullable=False, index=True
    )
    point_index: Mapped[int] = mapped_column(Integer, nullable=False)
    reference_value: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    measured_value: Mapped[float] = mapped_column(Numeric(18, 8), nullable=False)
    calculated_value: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    residual_abs: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    residual_pct: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    reference_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    measured_unit: Mapped[str] = mapped_column(String(50), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    # "primary" (the calibration's official dataset — raw_data, model_direct evaluation
    # points if any, or the as-left side of a reference_vs_as_found_as_left record) or
    # "as_found" (that mode's diagnostic pre-repair dataset). Every existing query/repo
    # call defaults to "primary" so this is additive — see Calibration.data_entry_mode.
    point_role: Mapped[str] = mapped_column(String(20), nullable=False, server_default="primary")


# Backward-compat alias
CalibrationPoint = CalibrationData
