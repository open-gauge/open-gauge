import enum
import uuid

from sqlalchemy import Enum, ForeignKey, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class SensorType(str, enum.Enum):
    temperature = "temperature"
    pressure = "pressure"
    flow = "flow"
    humidity = "humidity"
    electrical = "electrical"
    distance = "distance"
    angle = "angle"
    force = "force"
    angular_speed = "angular_speed"
    acceleration = "acceleration"
    other = "other"


class Sensor(Base):
    __tablename__ = "sensors"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), unique=True, nullable=False)
    sensor_type: Mapped[SensorType] = mapped_column(Enum(SensorType, name="sensor_type_enum"), nullable=False)
    measurement_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    measurement_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    operating_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    operating_temperature_range: Mapped[str | None] = mapped_column(String(100), nullable=True)
    output_signal: Mapped[str | None] = mapped_column(String(100), nullable=True)
    output_signal_unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
