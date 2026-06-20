import enum
import uuid
from datetime import datetime

from sqlalchemy import Date, DateTime, Enum, ForeignKey, Integer, Numeric, String, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class CalibrationResult(str, enum.Enum):
    pass_ = "pass"
    fail = "fail"
    conditional_pass = "conditional_pass"


class Calibration(Base):
    __tablename__ = "calibrations"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=False, index=True)
    calibration_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    due_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    performed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=True)
    performed_by_name: Mapped[str] = mapped_column(String(255), nullable=False)
    external_lab_name: Mapped[str | None] = mapped_column(String(255), nullable=True)
    external_lab_accreditation: Mapped[str | None] = mapped_column(String(255), nullable=True)
    result: Mapped[CalibrationResult] = mapped_column(
        Enum(CalibrationResult, name="calibration_result_enum", values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    temperature_c: Mapped[float | None] = mapped_column(Numeric(6, 2), nullable=True)
    humidity_pct: Mapped[float | None] = mapped_column(Numeric(5, 2), nullable=True)
    pressure_hpa: Mapped[float | None] = mapped_column(Numeric(8, 2), nullable=True)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    calibration_file_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)

    # Migration 004 additions
    sensor_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("sensors.id"), nullable=True)
    calibration_type: Mapped[str] = mapped_column(String(20), nullable=False, server_default="external")
    reference_asset_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), nullable=True)
    calibration_method_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("calibration_methods.id"), nullable=True)
    certificate_number: Mapped[str | None] = mapped_column(String(255), nullable=True)
    certificate_expiry_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    calibration_interval: Mapped[int | None] = mapped_column(Integer, nullable=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False, server_default="1")
    temperature_value: Mapped[float | None] = mapped_column(Numeric(10, 4), nullable=True)
    temperature_unit: Mapped[str | None] = mapped_column(String(10), nullable=True)
    pressure_value: Mapped[float | None] = mapped_column(Numeric(12, 4), nullable=True)
    pressure_unit: Mapped[str | None] = mapped_column(String(10), nullable=True)
    humidity_value: Mapped[float | None] = mapped_column(Numeric(8, 4), nullable=True)
    humidity_unit: Mapped[str | None] = mapped_column(String(10), nullable=True)
