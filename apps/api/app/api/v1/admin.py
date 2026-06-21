import time

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.asset import Asset
from ...models.calibration import Calibration
from ...models.calibration_method import Procedure
from ...models.organization import Organization
from ...models.team import Team
from ...models.user import User

router = APIRouter(prefix="/admin", tags=["Admin"])

_START_TIME = time.time()


def _require_admin(user: User) -> None:
    if not (user.is_superuser or user.role in ("superadmin", "admin")):
        from fastapi import HTTPException, status
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


class AdminStatsResponse(BaseModel):
    assets: int
    procedures: int
    calibrations: int
    users: int
    organizations: int
    teams: int


class AdminSystemResponse(BaseModel):
    uptime_seconds: float
    db_status: str
    api_version: str


@router.get("/stats", response_model=AdminStatsResponse)
def get_admin_stats(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdminStatsResponse:
    _require_admin(current_user)

    def count(model, *filters):  # type: ignore[no-untyped-def]
        q = db.query(func.count(model.id))
        for f in filters:
            q = q.filter(f)
        return q.scalar() or 0

    return AdminStatsResponse(
        assets=count(Asset, Asset.is_active.is_(True)),
        procedures=count(Procedure, Procedure.is_active.is_(True)),
        calibrations=count(Calibration),
        users=count(User, User.is_active.is_(True)),
        organizations=count(Organization, Organization.is_active.is_(True)),
        teams=count(Team, Team.is_active.is_(True)),
    )


@router.get("/system", response_model=AdminSystemResponse)
def get_admin_system(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> AdminSystemResponse:
    _require_admin(current_user)
    try:
        db.execute(text("SELECT 1"))
        db_ok = True
    except Exception:
        db_ok = False

    return AdminSystemResponse(
        uptime_seconds=round(time.time() - _START_TIME, 1),
        db_status="ok" if db_ok else "error",
        api_version="0.1.0",
    )
