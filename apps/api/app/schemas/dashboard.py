from datetime import datetime

from pydantic import BaseModel


class SubtypeItem(BaseModel):
    type: str
    count: int


class CategoryDistribution(BaseModel):
    category: str
    total: int
    items: list[SubtypeItem]


class DashboardSummary(BaseModel):
    registered_assets: int
    valid_calibrations: int
    valid_coverage_pct: int
    due_within_30_days: int
    expired: int


class ThroughputPoint(BaseModel):
    month: str
    completed: int
    expired: int


class DistributionItem(BaseModel):
    type: str
    count: int


class UpcomingAsset(BaseModel):
    asset_id: str
    name: str
    category: str
    next_due_at: datetime | None
    health_score: int
    calibration_status: str


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
    calibration_status: str
    updated_at: datetime
