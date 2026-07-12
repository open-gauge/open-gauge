import uuid

from sqlalchemy.orm import Session

from ..models.user_signing_key import UserSigningKey


def get_by_user_id(db: Session, user_id: uuid.UUID) -> UserSigningKey | None:
    return db.query(UserSigningKey).filter(UserSigningKey.user_id == user_id).first()


def get_by_id(db: Session, key_id: uuid.UUID) -> UserSigningKey | None:
    return db.query(UserSigningKey).filter(UserSigningKey.id == key_id).first()


def create(
    db: Session,
    *,
    user_id: uuid.UUID,
    algorithm: str,
    public_key_pem: str,
    private_key_encrypted: str,
    key_encryption_algorithm: str,
    fingerprint_sha256: str,
    created_by: uuid.UUID,
) -> UserSigningKey:
    key = UserSigningKey(
        user_id=user_id,
        algorithm=algorithm,
        public_key_pem=public_key_pem,
        private_key_encrypted=private_key_encrypted,
        key_encryption_algorithm=key_encryption_algorithm,
        fingerprint_sha256=fingerprint_sha256,
        created_by=created_by,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return key
