import uuid

from sqlalchemy.orm import Session

from ..models.team import Team
from ..models.team_member import TeamMember


def list_member_team_ids(db: Session, user_id: uuid.UUID) -> set[uuid.UUID]:
    rows = db.query(TeamMember.team_id).filter(TeamMember.user_id == user_id).all()
    return {r[0] for r in rows}


def list_teams_for_user(db: Session, user_id: uuid.UUID) -> list[Team]:
    return (
        db.query(Team)
        .join(TeamMember, TeamMember.team_id == Team.id)
        .filter(TeamMember.user_id == user_id, Team.is_active.is_(True))
        .order_by(Team.name)
        .all()
    )


def is_member(db: Session, team_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return (
        db.query(TeamMember)
        .filter(TeamMember.team_id == team_id, TeamMember.user_id == user_id)
        .first()
        is not None
    )


def join(db: Session, team_id: uuid.UUID, user_id: uuid.UUID) -> None:
    if is_member(db, team_id, user_id):
        return
    db.add(TeamMember(team_id=team_id, user_id=user_id))
    db.commit()


def leave(db: Session, team_id: uuid.UUID, user_id: uuid.UUID) -> None:
    db.query(TeamMember).filter(
        TeamMember.team_id == team_id, TeamMember.user_id == user_id
    ).delete()
    db.commit()
