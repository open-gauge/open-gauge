import uuid
from datetime import datetime, timezone

from sqlalchemy.orm import Session

from ..models.organization_join_request import JoinRequestStatus, OrganizationJoinRequest


def get_by_id(db: Session, request_id: uuid.UUID) -> OrganizationJoinRequest | None:
    return db.query(OrganizationJoinRequest).filter(OrganizationJoinRequest.id == request_id).first()


def has_pending(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> bool:
    return (
        db.query(OrganizationJoinRequest)
        .filter(
            OrganizationJoinRequest.organization_id == org_id,
            OrganizationJoinRequest.user_id == user_id,
            OrganizationJoinRequest.status == JoinRequestStatus.pending,
        )
        .first()
        is not None
    )


def list_pending_for_org(db: Session, org_id: uuid.UUID) -> list[OrganizationJoinRequest]:
    return (
        db.query(OrganizationJoinRequest)
        .filter(
            OrganizationJoinRequest.organization_id == org_id,
            OrganizationJoinRequest.status == JoinRequestStatus.pending,
        )
        .order_by(OrganizationJoinRequest.created_at)
        .all()
    )


def create(db: Session, org_id: uuid.UUID, user_id: uuid.UUID) -> OrganizationJoinRequest:
    request = OrganizationJoinRequest(organization_id=org_id, user_id=user_id)
    db.add(request)
    db.commit()
    db.refresh(request)
    return request


def decide(
    db: Session, request: OrganizationJoinRequest, status: JoinRequestStatus, decided_by: uuid.UUID
) -> OrganizationJoinRequest:
    request.status = status
    request.decided_by = decided_by
    request.decided_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(request)
    return request
