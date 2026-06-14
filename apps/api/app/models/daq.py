import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, Numeric, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class DAQ(Base):
    __tablename__ = "daq"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False, unique=True)
    daq_type: Mapped[str] = mapped_column(String(255), nullable=False)
    input_channels: Mapped[int] = mapped_column(Integer, nullable=False)
    output_channels: Mapped[int] = mapped_column(Integer, nullable=False)
    input_signal_types: Mapped[str | None] = mapped_column(String(255), nullable=True)
    output_signal_types: Mapped[str | None] = mapped_column(String(255), nullable=True)
    sampling_rate_hz: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    per_channel_sampling_rate_hz: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    adc_resolution_bits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    adc_type: Mapped[str | None] = mapped_column(String(255), nullable=True)
    input_voltage_range_min: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    input_voltage_range_max: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    input_impedance_ohm: Mapped[float | None] = mapped_column(Numeric(18, 2), nullable=True)
    noise_floor_uv_rms: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    dynamic_range_db: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    synchronization_supported: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    clock_source: Mapped[str | None] = mapped_column(String(255), nullable=True)
    time_sync_precision_ns: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    jitter_ns: Mapped[float | None] = mapped_column(Numeric(18, 4), nullable=True)
    communication_protocol: Mapped[str | None] = mapped_column(String(100), nullable=True)
    interface_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    trigger_modes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
