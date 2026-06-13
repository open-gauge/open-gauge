import enum
import uuid

from sqlalchemy import Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class DaqType(str, enum.Enum):
    data_logger = "data_logger"
    signal_conditioner = "signal_conditioner"
    gateway = "gateway"
    other = "other"


class DataAcquisition(Base):
    __tablename__ = "data_acquisition"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    asset_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("assets.id"), unique=True, nullable=False)
    daq_type: Mapped[DaqType] = mapped_column(Enum(DaqType, name="daq_type_enum"), nullable=False)
    input_channels: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    output_channels: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    sampling_rate_hz: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
    communication_protocol: Mapped[str | None] = mapped_column(String(100), nullable=True)
    adc_resolution: Mapped[float | None] = mapped_column(Numeric(10, 2), nullable=True)
