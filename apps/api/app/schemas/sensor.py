from pydantic import BaseModel

from ..models.sensor import SensorType


class SensorDetails(BaseModel):
    sensor_type: SensorType
    measurement_range: str | None = None
    measurement_unit: str | None = None
    operating_range: str | None = None
    operating_temperature_range: str | None = None
    output_signal: str | None = None
    output_signal_unit: str | None = None

    model_config = {"from_attributes": True}
