import uuid
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from pydantic import BaseModel
from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.team import Team
from ...models.user import User

router = APIRouter(prefix="/teams", tags=["Teams"])

class TeamResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    model_config = {"from_attributes": True}

@router.get("", response_model=list[TeamResponse])
def list_teams(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TeamResponse]:
    return db.query(Team).filter(
        Team.organization_id == current_user.organization_id,
        Team.is_active.is_(True),
    ).order_by(Team.name).all()
