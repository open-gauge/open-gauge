"""Pydantic v2 response schemas for the Health domain.

These are intentionally kept inside `app/health/` rather than
`app/schemas/` — Health is a sibling read-model computed on-the-fly from
calibration data, not a persisted entity, and per the module boundary
("do not mix Health into calibration services") its schemas stay
domain-internal.

Every optional/nullable field lets the frontend render the correct empty
state purely by branching on `calibration_count` / `overview is None`,
computed once here so the thresholds have a single source of truth.
"""
from datetime import date

from pydantic import BaseModel


class HealthOverview(BaseModel):
    health_score: float
    health_label: str
    stability: str
    average_drift_rate: float
    current_drift_rate: float
    drift_rate_unit: str
    recommended_interval_months: int


class DriftPoint(BaseModel):
    calibration_id: str
    calibration_date: date
    max_drift: float
    operator: str


class DriftEvolution(BaseModel):
    points: list[DriftPoint]
    regression_slope: float
    regression_intercept: float
    regression_origin_date: date
    regression_r_squared: float
    current_drift_rate: float


class StabilityMetricSeries(BaseModel):
    name: str
    label: str
    dates: list[date]
    raw_values: list[float | None]
    smoothed_values: list[float | None] | None


class CalibrationStability(BaseModel):
    series: list[StabilityMetricSeries]
    smoothing_applied: bool


class CalibrationOption(BaseModel):
    id: str
    calibration_date: date
    calibration_version: int
    label: str


class CurveComparisonSummary(BaseModel):
    max_drift: float
    mean_drift: float
    rms_drift: float
    offset: float
    gain: float
    residual_drift: float


class CurveComparisonResponse(BaseModel):
    x: list[float]
    y_reference: list[float]
    y_current: list[float]
    delta: list[float]
    abs_drift: list[float]
    summary: CurveComparisonSummary
    unit: str


class PredictionOut(BaseModel):
    available: bool
    projected_drift_1y: float | None = None
    projected_drift_2y: float | None = None
    projected_drift_3y: float | None = None
    projected_drift_5y: float | None = None
    projected_tolerance_exceeded_date: date | None = None
    remaining_useful_life_months: float | None = None
    confidence_pct: float | None = None
    confidence_reliable: bool = False
    message: str | None = None


class MetricGroupItem(BaseModel):
    key: str
    label: str
    value: float | None
    unit: str
    tooltip: str


class DetailedMetrics(BaseModel):
    drift_group: list[MetricGroupItem]
    statistics_group: list[MetricGroupItem]
    trends_group: list[MetricGroupItem]


class RadarAxis(BaseModel):
    axis: str
    value: float


class AssetHealthResponse(BaseModel):
    calibration_count: int
    channel_unit: str
    overview: HealthOverview | None = None
    drift_evolution: DriftEvolution | None = None
    stability: CalibrationStability | None = None
    calibration_options: list[CalibrationOption] = []
    prediction: PredictionOut
    detailed_metrics: DetailedMetrics | None = None
    radar: list[RadarAxis] | None = None
