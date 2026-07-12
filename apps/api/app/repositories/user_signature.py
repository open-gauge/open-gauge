import uuid
from datetime import datetime, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.user_signature import UserSignature


def get_active(db: Session, user_id: uuid.UUID) -> UserSignature | None:
    return (
        db.query(UserSignature)
        .filter(UserSignature.user_id == user_id, UserSignature.is_active.is_(True))
        .first()
    )


def get_by_id(db: Session, signature_id: uuid.UUID) -> UserSignature | None:
    return db.query(UserSignature).filter(UserSignature.id == signature_id).first()


def next_version(db: Session, user_id: uuid.UUID) -> int:
    max_version = (
        db.query(func.max(UserSignature.version)).filter(UserSignature.user_id == user_id).scalar()
    )
    return (max_version or 0) + 1


def revoke_active(db: Session, user_id: uuid.UUID, reason: str) -> None:
    active = get_active(db, user_id)
    if active:
        active.is_active = False
        active.revoked_at = datetime.now(timezone.utc)
        active.change_reason = reason
        db.commit()


def create(
    db: Session,
    *,
    user_id: uuid.UUID,
    signing_key_id: uuid.UUID,
    image_file_id: uuid.UUID,
    image_sha256: str,
    signed_envelope: str,
    signature_bytes: bytes,
    signature_algorithm: str,
    source: str,
    version: int,
    created_by: uuid.UUID,
) -> UserSignature:
    sig = UserSignature(
        user_id=user_id,
        signing_key_id=signing_key_id,
        image_file_id=image_file_id,
        image_sha256=image_sha256,
        signed_envelope=signed_envelope,
        signature_bytes=signature_bytes,
        signature_algorithm=signature_algorithm,
        source=source,
        version=version,
        is_active=True,
        created_by=created_by,
    )
    db.add(sig)
    db.commit()
    db.refresh(sig)
    return sig
