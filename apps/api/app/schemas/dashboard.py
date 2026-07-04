from datetime import datetime

from pydantic import BaseModel


class CalibrationStatusCount(BaseModel):
    status: str   # "valid" | "due_soon" | "expired" | "not_calibrated"
    count: int


class DistributionItem(BaseModel):
    type: str
    count: int


class DashboardSummary(BaseModel):
    registered_assets: int
    sensors: int
    daqs: int
    low_health_assets: int
    calibration_status_distribution: list[CalibrationStatusCount] = []
    procedures: int = 0
    procedure_distribution: list[DistributionItem] = []


class CalibrationEvent(BaseModel):
    id: str        # asset UUID
    asset_id: str
    name: str
    due_date: str  # YYYY-MM-DD


class CalendarEvent(BaseModel):
    asset_id: str
    name: str
    date: str        # YYYY-MM-DD
    event_type: str  # "performed" | "due"


class AssetTypeDistribution(BaseModel):
    sensors: list[DistributionItem]
    daqs: list[DistributionItem]


class ActivityItem(BaseModel):
    actor_id: str | None = None
    actor_email: str
    actor_name: str | None = None
    actor_role: str | None = None
    action: str
    entity_asset_id: str | None
    created_at: datetime


class RecentAsset(BaseModel):
    id: str
    asset_id: str
    name: str
    manufacturer: str
    model: str
    asset_type: str
    updated_at: datetime
