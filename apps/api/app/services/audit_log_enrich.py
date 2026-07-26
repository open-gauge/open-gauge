from sqlalchemy.orm import Session

from ..models.audit_log import AuditLog
from ..models.user import User
from ..schemas.audit_log import AuditLogResponse
from . import user_profile as user_profile_svc


def enrich(db: Session, logs: list[AuditLog]) -> list[AuditLogResponse]:
    """Attach each log's actor name/role/profile picture — none of these are
    columns on AuditLog itself (only actor_email is, snapshotted at write
    time for traceability even if the account is later renamed or deleted),
    so they're resolved via a live join against the current User row. A
    picture is a presigned URL and can't be stored statically, so it's always
    resolved here regardless."""
    actor_ids = {log.actor_id for log in logs if log.actor_id}
    actors = {u.id: u for u in db.query(User).filter(User.id.in_(actor_ids)).all()} if actor_ids else {}
    result = []
    for log in logs:
        actor = actors.get(log.actor_id) if log.actor_id else None
        result.append(
            AuditLogResponse(
                id=log.id,
                actor_id=log.actor_id,
                actor_email=log.actor_email,
                actor_name=actor.name if actor else None,
                actor_role=actor.role.value if actor else None,
                actor_profile_picture_url=(
                    user_profile_svc.resolve_picture_url(db, actor.profile_picture_id) if actor else None
                ),
                action=log.action,
                entity_type=log.entity_type,
                entity_id=log.entity_id,
                entity_asset_id=log.entity_asset_id,
                before_state=log.before_state,
                after_state=log.after_state,
                ip_address=log.ip_address,
                created_at=log.created_at,
            )
        )
    return result
