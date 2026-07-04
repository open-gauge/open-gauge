import uuid

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import audit_log as log_repo
from ...schemas.audit_log import AuditLogResponse

router = APIRouter(prefix="/audit-logs", tags=["Audit Logs"])


@router.get("", response_model=list[AuditLogResponse])
def list_audit_logs(
    skip: int = 0,
    limit: int = 50,
    entity_type: str | None = None,
    entity_id: uuid.UUID | None = None,
    actor_id: uuid.UUID | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
) -> list[AuditLogResponse]:
    logs = log_repo.list_logs(
        db,
        skip=skip,
        limit=limit,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_id=actor_id,
    )
    actor_ids = {log.actor_id for log in logs if log.actor_id}
    actors = (
        {u.id: u for u in db.query(User).filter(User.id.in_(actor_ids)).all()}
        if actor_ids else {}
    )
    return [
        AuditLogResponse(
            id=log.id,
            actor_id=log.actor_id,
            actor_email=log.actor_email,
            actor_name=actors[log.actor_id].name if log.actor_id and log.actor_id in actors else None,
            actor_role=actors[log.actor_id].role.value if log.actor_id and log.actor_id in actors else None,
            action=log.action,
            entity_type=log.entity_type,
            entity_id=log.entity_id,
            entity_asset_id=log.entity_asset_id,
            before_state=log.before_state,
            after_state=log.after_state,
            ip_address=log.ip_address,
            created_at=log.created_at,
        )
        for log in logs
    ]
