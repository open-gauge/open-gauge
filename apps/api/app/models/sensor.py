import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False, index=True)
    channel_id: Mapped[str] = mapped_column(String(255), nullable=False)
    physical_quantity: Mapped[str] = mapped_column(String(255), nullable=False)
    unit: Mapped[str] = mapped_column(String(50), nullable=False)
    technology: Mapped[str | None] = mapped_column(String(255), nullable=True)
    measurement_min: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    measurement_max: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    accuracy_value: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    accuracy_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    accuracy_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    resolution: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    resolution_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    measurement_uncertainty: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    uncertainty_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    confidence_level: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    coverage_factor: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    drift_rate: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    drift_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    sensitivity: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    sensitivity_unit: Mapped[str | None] = mapped_column(String(100), nullable=True)
    response_time_ms: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    bandwidth_hz: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    output_signal_min: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    output_signal_max: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    output_signal_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    output_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    calibration_role: Mapped[str | None] = mapped_column(String(255), nullable=True)
    criticality: Mapped[str | None] = mapped_column(String(255), nullable=True)
    calibration_method_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("calibration_methods.id"), nullable=True)
    calibration_interval: Mapped[int | None] = mapped_column(Integer, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("asset_id", "channel_id", name="uq_sensors_asset_channel"),
    )
