from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...repositories import dashboard as dash_repo
from ...schemas.dashboard import (
    ActivityItem,
    CategoryDistribution,
    DistributionItem,
    DashboardSummary,
    RecentAsset,
    ThroughputPoint,
    UpcomingAsset,
)

router = APIRouter(prefix="/dashboard", tags=["Dashboard"])


@router.get("/summary", response_model=DashboardSummary)
def get_summary(db: Session = Depends(get_db)) -> DashboardSummary:
    return DashboardSummary(**dash_repo.get_summary(db))


@router.get("/throughput", response_model=list[ThroughputPoint])
def get_throughput(db: Session = Depends(get_db)) -> list[ThroughputPoint]:
    return [ThroughputPoint(**p) for p in dash_repo.get_throughput(db)]


@router.get("/distribution", response_model=list[DistributionItem])
def get_distribution(db: Session = Depends(get_db)) -> list[DistributionItem]:
    return [DistributionItem(**d) for d in dash_repo.get_distribution(db)]


@router.get("/category-distribution", response_model=list[CategoryDistribution])
def get_category_distribution(db: Session = Depends(get_db)) -> list[CategoryDistribution]:
    return [CategoryDistribution(**d) for d in dash_repo.get_category_distribution(db)]


@router.get("/upcoming", response_model=list[UpcomingAsset])
def get_upcoming(db: Session = Depends(get_db)) -> list[UpcomingAsset]:
    return [
        UpcomingAsset(
            asset_id=a.asset_id,
            name=a.name,
            category=a.category.value,
            next_due_at=a.next_due_at,
            health_score=a.health_score,
            calibration_status=a.calibration_status.value,
        )
        for a in dash_repo.get_upcoming(db)
    ]


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
            calibration_status=a.calibration_status.value,
            updated_at=a.updated_at,
        )
        for a in dash_repo.get_recent_assets(db)
    ]
