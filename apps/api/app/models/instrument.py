import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class InstrumentType(str, enum.Enum):
    transmitter = "transmitter"
    controller = "controller"
    indicator = "indicator"
    recorder = "recorder"
    other = "other"


class Instrument(Base):
    __tablename__ = "instruments"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), unique=True, nullable=False)
    instrument_type: Mapped[InstrumentType] = mapped_column(Enum(InstrumentType, name="instrument_type_enum"), nullable=False)
    measurement_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    measurement_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    operating_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    operating_temperature_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    output_signal: Mapped[str | None] = mapped_column(String(100), nullable=True)
    output_signal_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
