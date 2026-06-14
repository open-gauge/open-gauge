import enum
import uuid
from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class AssetType(str, enum.Enum):
    sensor = "sensor"
    daq = "daq"


class Asset(Base):
    __tablename__ = "assets"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[str] = mapped_column(String(20), unique=True, nullable=False, index=True)
    asset_type: Mapped[AssetType] = mapped_column(Enum(AssetType, name="asset_type_enum"), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    description: Mapped[str | None] = mapped_column(Text, nullable=True)
    manufacturer: Mapped[str] = mapped_column(String(255), nullable=False)
    model: Mapped[str] = mapped_column(String(255), nullable=False)
    serial_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    manufacturer_part_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    location_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("locations.id"), nullable=True, index=True)
    owner: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("teams.id"), nullable=True)
    datasheet_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)
    datasheet_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    firmware_version: Mapped[str | None] = mapped_column(String(100), nullable=True)
    power_supply: Mapped[str | None] = mapped_column(String(100), nullable=True)
    power_consumption_w: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dimensions: Mapped[str | None] = mapped_column(String(100), nullable=True)
    weight_kg: Mapped[float | None] = mapped_column(Numeric(10, 3), nullable=True)
    mounting_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    connection_type: Mapped[str | None] = mapped_column(String(100), nullable=True)
    displays_readings: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    ip_rating: Mapped[str | None] = mapped_column(String(20), nullable=True)
    hazardous_area_rating: Mapped[str | None] = mapped_column(String(100), nullable=True)
    operating_temperature_min: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    operating_temperature_max: Mapped[float | None] = mapped_column(Numeric(18, 8), nullable=True)
    operating_humidity_min: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    operating_humidity_max: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    health_score: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    price_eur: Mapped[float | None] = mapped_column(Numeric(12, 2), nullable=True)
    purchase_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    warranty_expiry_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    retired_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    retired_by: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    retired_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    pinout_table: Mapped[list | None] = mapped_column(JSONB, nullable=True)
    pinout_image_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)
    sensor_image_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)
    sensor_schematic_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)
