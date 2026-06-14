from datetime import datetime

from pydantic import BaseModel


class DashboardSummary(BaseModel):
    registered_assets: int
    sensors: int
    daqs: int
    low_health_assets: int


class CalibrationEvent(BaseModel):
    asset_id: str
    name: str
    due_date: str  # YYYY-MM-DD


class CalendarEvent(BaseModel):
    asset_id: str
    name: str
    date: str        # YYYY-MM-DD
    event_type: str  # "performed" | "due"


class DistributionItem(BaseModel):
    type: str
    count: int


class AssetTypeDistribution(BaseModel):
    sensors: list[DistributionItem]
    daqs: list[DistributionItem]


class ActivityItem(BaseModel):
    actor_email: str
    action: str
    entity_asset_id: str | None
    created_at: datetime


class RecentAsset(BaseModel):
    asset_id: str
    name: str
    manufacturer: str
    model: str
    asset_type: str
    updated_at: datetime
