from pydantic import BaseModel

from ..models.data_acquisition import DaqType


class DaqDetails(BaseModel):
    daq_type: DaqType
    input_channels: int = 0
    output_channels: int = 0
    sampling_rate_hz: float | None = None
    communication_protocol: str | None = None
    adc_resolution: float | None = None

    model_config = {"from_attributes": True}
