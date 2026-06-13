import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class AssetCategory(str, enum.Enum):
    sensor = "sensor"
    instrument = "instrument"
    reference_standard = "reference_standard"
    data_acquisition = "data_acquisition"
    other = "other"


class CalibrationStatus(str, enum.Enum):
    valid = "valid"
    due_soon = "due_soon"
    expired = "expired"
    not_calibrated = "not_calibrated"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    laboratory_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("laboratories.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    category: Mapped[AssetCategory] = mapped_column(Enum(AssetCategory, name="asset_category_enum"), nullable=False)
    manufacturer: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    purchase_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    warranty_expiry_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    calibration_status: Mapped[CalibrationStatus] = mapped_column(
        Enum(CalibrationStatus, name="calibration_status_enum"),
        nullable=False,
        default=CalibrationStatus.not_calibrated,
        index=True,
    )
    calibration_interval_days: Mapped[int | None] = mapped_column(Integer, nullable=True)
    next_due_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    health_score: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    datasheet_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    retired_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
