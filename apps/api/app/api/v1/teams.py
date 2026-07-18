import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from pydantic import BaseModel, Field
from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.team import Team
from ...models.user import User
from ...repositories import team_member as team_member_repo

router = APIRouter(prefix="/teams", tags=["Teams"])


class TeamResponse(BaseModel):
    id: uuid.UUID
    name: str
    description: str | None
    is_member: bool = False
    model_config = {"from_attributes": True}


class TeamCreate(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    description: str | None = None
    organization_id: uuid.UUID | None = None  # admin can specify an org explicitly


class TeamUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = None


def _require_admin(user: User) -> None:
    if not (user.is_superuser or user.role in ("superadmin", "admin")):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin only")


@router.get("", response_model=list[TeamResponse])
def list_teams(
    org_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[TeamResponse]:
    # Admin can query any org; regular users see only their own org's teams
    effective_org_id = org_id if (org_id and (current_user.is_superuser or current_user.role in ("superadmin", "admin"))) else current_user.organization_id
    teams = db.query(Team).filter(
        Team.organization_id == effective_org_id,
        Team.is_active.is_(True),
    ).order_by(Team.name).all()
    member_ids = team_member_repo.list_member_team_ids(db, current_user.id)
    result = []
    for t in teams:
        resp = TeamResponse.model_validate(t)
        resp.is_member = t.id in member_ids
        result.append(resp)
    return result


@router.post("", response_model=TeamResponse, status_code=status.HTTP_201_CREATED)
def create_team(
    body: TeamCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamResponse:
    _require_admin(current_user)
    # Allow admin to create team for a specified org; fall back to user's own org
    effective_org_id = body.organization_id or current_user.organization_id
    if effective_org_id is None:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Organization is required")
    team = Team(
        organization_id=effective_org_id,
        name=body.name,
        description=body.description,
        created_by=current_user.id,
    )
    db.add(team)
    db.commit()
    db.refresh(team)
    return team


@router.put("/{team_id}", response_model=TeamResponse)
def update_team(
    team_id: uuid.UUID,
    body: TeamUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamResponse:
    _require_admin(current_user)
    q = db.query(Team).filter(Team.id == team_id, Team.is_active.is_(True))
    # Non-superadmins can only edit teams within their own org
    if not (current_user.is_superuser or current_user.role == "superadmin"):
        q = q.filter(Team.organization_id == current_user.organization_id)
    team = q.first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    if body.name is not None:
        team.name = body.name
    if body.description is not None:
        team.description = body.description
    db.commit()
    db.refresh(team)
    return team


@router.delete("/{team_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_team(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    _require_admin(current_user)
    q = db.query(Team).filter(Team.id == team_id, Team.is_active.is_(True))
    if not (current_user.is_superuser or current_user.role == "superadmin"):
        q = q.filter(Team.organization_id == current_user.organization_id)
    team = q.first()
    if not team:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    team.is_active = False
    db.commit()


def _get_own_org_team(db: Session, team_id: uuid.UUID, current_user: User) -> Team:
    """Resolve a team, scoped to the current user's own organization —
    membership is always self-service within one's own org, never across."""
    team = db.query(Team).filter(Team.id == team_id, Team.is_active.is_(True)).first()
    if not team or team.organization_id != current_user.organization_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Team not found")
    return team


@router.post("/{team_id}/join", response_model=TeamResponse)
def join_team(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamResponse:
    """Self-service: join a team in your own organization. Membership is
    opt-in — organization membership never implies team membership."""
    team = _get_own_org_team(db, team_id, current_user)
    team_member_repo.join(db, team.id, current_user.id)
    resp = TeamResponse.model_validate(team)
    resp.is_member = True
    return resp


@router.delete("/{team_id}/leave", response_model=TeamResponse)
def leave_team(
    team_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> TeamResponse:
    """Self-service: leave a team you're currently a member of."""
    team = _get_own_org_team(db, team_id, current_user)
    team_member_repo.leave(db, team.id, current_user.id)
    resp = TeamResponse.model_validate(team)
    resp.is_member = False
    return resp
