from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...repositories import dashboard as dash_repo
from ...schemas.dashboard import (
    ActivityItem,
    AssetTypeDistribution,
    CalendarEvent,
    CalibrationEvent,
    DashboardSummary,
    DistributionItem,
    RecentAsset,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(db: Session = Depends(get_db)) -> DashboardSummary:
    return DashboardSummary(**dash_repo.get_summary(db))


@router.get("/distribution", response_model=list[DistributionItem])
def get_distribution(db: Session = Depends(get_db)) -> list[DistributionItem]:
    return [DistributionItem(**d) for d in dash_repo.get_distribution(db)]


@router.get("/asset-type-distribution", response_model=AssetTypeDistribution)
def get_asset_type_distribution(db: Session = Depends(get_db)) -> AssetTypeDistribution:
    data = dash_repo.get_asset_type_distribution(db)
    return AssetTypeDistribution(
        sensors=[DistributionItem(**s) for s in data["sensors"]],
        daqs=[DistributionItem(**d) for d in data["daqs"]],
    )


@router.get("/calendar-events", response_model=list[CalendarEvent])
def get_calendar_events(
    year: int = Query(default=None),
    db: Session = Depends(get_db),
) -> list[CalendarEvent]:
    if year is None:
        year = datetime.now().year
    return [CalendarEvent(**e) for e in dash_repo.get_calendar_events(db, year)]


@router.get("/calibration-events", response_model=list[CalibrationEvent])
def get_calibration_events(db: Session = Depends(get_db)) -> list[CalibrationEvent]:
    return [CalibrationEvent(**e) for e in dash_repo.get_calibration_events(db)]


@router.get("/activity", response_model=list[ActivityItem])
def get_activity(db: Session = Depends(get_db)) -> list[ActivityItem]:
    return [
        ActivityItem(
            actor_email=log.actor_email,
            action=log.action,
            entity_asset_id=log.entity_asset_id,
            created_at=log.created_at,
        )
        for log in dash_repo.get_activity(db)
    ]


@router.get("/recent-assets", response_model=list[RecentAsset])
def get_recent_assets(db: Session = Depends(get_db)) -> list[RecentAsset]:
    return [
        RecentAsset(
            asset_id=a.asset_id,
            name=a.name,
            manufacturer=a.manufacturer,
            model=a.model,
            asset_type=a.asset_type.value,
            updated_at=a.updated_at,
        )
        for a in dash_repo.get_recent_assets(db)
    ]
