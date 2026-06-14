import uuid
from datetime import datetime

from pydantic import BaseModel


class DaqCreate(BaseModel):
    daq_type: str
    input_channels: int
    output_channels: int
    input_signal_types: str | None = None
    output_signal_types: str | None = None
    sampling_rate_hz: float | None = None
    per_channel_sampling_rate_hz: float | None = None
    adc_resolution_bits: int | None = None
    adc_type: str | None = None
    input_voltage_range_min: float | None = None
    input_voltage_range_max: float | None = None
    input_impedance_ohm: float | None = None
    noise_floor_uv_rms: float | None = None
    dynamic_range_db: float | None = None
    synchronization_supported: bool = False
    clock_source: str | None = None
    time_sync_precision_ns: float | None = None
    jitter_ns: float | None = None
    communication_protocol: str | None = None
    interface_type: str | None = None
    trigger_modes: str | None = None


class DaqResponse(DaqCreate):
    id: uuid.UUID
    asset_id: uuid.UUID
    is_active: bool
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
