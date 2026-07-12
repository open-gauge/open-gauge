import uuid
from datetime import date, datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Response shape — shared by single-asset ("Import from file") and bulk import
# ---------------------------------------------------------------------------

class AssetImportResult(BaseModel):
    source_folder: str
    status: Literal["created", "error"]
    asset_id: str | None = None
    new_asset_pk: uuid.UUID | None = None
    error_message: str | None = None


class AssetImportResponse(BaseModel):
    results: list[AssetImportResult]


# ---------------------------------------------------------------------------
# Pre-import validation preview — lets the "Import from file" UI show the
# asset's identity and ask the user to pick a location/owner (the UUID-typed
# fields that are never exported) before actually creating anything.
# ---------------------------------------------------------------------------

class AssetImportPreview(BaseModel):
    valid: bool
    error_message: str | None = None
    asset_id: str | None = None
    name: str | None = None
    manufacturer: str | None = None
    model: str | None = None
    asset_type: str | None = None
    channel_count: int = 0
    calibration_count: int = 0


# ---------------------------------------------------------------------------
# Validation schemas for the parsed asset.yaml — defensive parsing of an
# untrusted uploaded file before any database row is created.
# ---------------------------------------------------------------------------

class ImportedAsset(BaseModel):
    asset_id: str = Field(min_length=1, max_length=20)
    asset_type: Literal["sensor", "daq"]
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    manufacturer: str = Field(min_length=1, max_length=255)
    model: str = Field(min_length=1, max_length=255)
    serial_number: str | None = None
    manufacturer_part_number: str | None = None
    datasheet_url: str | None = None
    firmware_version: str | None = None
    power_supply: str | None = None
    power_consumption_w: int | None = None
    dimensions: str | None = None
    weight_kg: float | None = None
    mounting_type: str | None = None
    connection_type: str | None = None
    displays_readings: bool = False
    ip_rating: str | None = None
    hazardous_area_rating: str | None = None
    operating_temperature_min: float | None = None
    operating_temperature_max: float | None = None
    operating_humidity_min: float | None = None
    operating_humidity_max: float | None = None
    health_score: int = Field(default=100, ge=0, le=100)
    price_eur: float | None = None
    purchase_date: date | None = None
    warranty_expiry_date: date | None = None
    is_active: bool = True
    retired_at: datetime | None = None
    retired_reason: str | None = None
    notes: str | None = None
    pinout_table: list[dict[str, Any]] | None = None
    has_picture: bool = False
    has_datasheet_file: bool = False
    has_pinout_image: bool = False
    has_sensor_image: bool = False
    has_sensor_schematic: bool = False


class ImportedSensorChannel(BaseModel):
    channel_id: str = Field(min_length=1)
    physical_quantity: str
    measurement_type: str | None = None
    unit: str
    technology: str | None = None
    measurement_min: float | None = None
    measurement_max: float | None = None
    accuracy_value: float | None = None
    accuracy_type: str | None = None
    accuracy_unit: str | None = None
    resolution: float | None = None
    resolution_unit: str | None = None
    measurement_uncertainty: float | None = None
    uncertainty_unit: str | None = None
    confidence_level: float | None = None
    coverage_factor: float | None = None
    drift_rate: float | None = None
    drift_unit: str | None = None
    sensitivity: float | None = None
    sensitivity_unit: str | None = None
    response_time_ms: float | None = None
    bandwidth_hz: float | None = None
    output_signal_min: float | None = None
    output_signal_max: float | None = None
    output_signal_unit: str | None = None
    output_type: str | None = None
    calibration_role: str | None = None
    criticality: str | None = None
    calibration_interval: int | None = None
    is_active: bool = True
    calibration_method_name: str | None = None


class ImportedDaqDetails(BaseModel):
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
    is_active: bool = True


class ImportedCalibrationPoint(BaseModel):
    point_index: int
    reference_value: float
    measured_value: float
    calculated_value: float | None = None
    residual_abs: float | None = None
    residual_pct: float | None = None
    reference_unit: str
    measured_unit: str


class ImportedCalibration(BaseModel):
    calibration_date: date
    due_date: date
    performed_by_name: str
    external_lab_name: str | None = None
    notes: str | None = None
    channel_id: str | None = None
    calibration_type: str = "external"
    calibration_version: int = 1
    is_active: bool = True
    void_reason: str | None = None
    calibration_interval: int | None = None
    tolerance_criteria: str | None = None
    external_lab_certificate_number: str | None = None
    internal_procedure_name: str | None = None
    temperature: float | None = None
    humidity: float | None = None
    pressure: float | None = None
    poly_order: int | None = None
    poly_coefficients: list[float] | None = None
    range_min: float | None = None
    range_max: float | None = None
    r_squared: float | None = None
    rmse: float | None = None
    standard_error: float | None = None
    max_error: float | None = None
    full_scale_error: float | None = None
    non_linearity: float | None = None
    repeatability: float | None = None
    hysteresis: float | None = None
    distribution_type: str | None = None
    confidence_level: float | None = None
    coverage_factor: float | None = None
    combined_uncertainty: float | None = None
    expanded_uncertainty: float | None = None
    valid_range_min: float | None = None
    valid_range_max: float | None = None
    uncertainty_budget: list[dict[str, Any]] | None = None
    effective_degrees_of_freedom: float | None = None
    poly_coefficients_covariance: list[list[float]] | None = None
    decision_rule: str = "simple_acceptance"
    conformity_statement: dict[str, Any] | None = None
    has_certificate_file: bool = False
    data_points: list[ImportedCalibrationPoint] = []


class ImportedFile(BaseModel):
    original_filename: str
    content_type: str
    media_path: str | None = None


class ImportedAssetYaml(BaseModel):
    export_format_version: int = 1
    asset: ImportedAsset
    sensor_channels: list[ImportedSensorChannel] = []
    daq_details: ImportedDaqDetails | None = None
    calibrations: list[ImportedCalibration] = []
    files: list[ImportedFile] = []
