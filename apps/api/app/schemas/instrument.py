from pydantic import BaseModel

from ..models.instrument import InstrumentType


class InstrumentDetails(BaseModel):
    instrument_type: InstrumentType
    measurement_range: str | None = None
    measurement_unit: str | None = None
    operating_range: str | None = None
    operating_temperature_range: str | None = None
    output_signal: str | None = None
    output_signal_unit: str | None = None

    model_config = {"from_attributes": True}
