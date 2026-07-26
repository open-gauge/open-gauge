import uuid
from datetime import datetime

from sqlalchemy.orm import Session

from ..models.organization_signing_key import OrganizationSigningKey


def get_by_organization_id(db: Session, organization_id: uuid.UUID | None) -> OrganizationSigningKey | None:
    """organization_id=None looks up the instance-wide fallback key."""
    return (
        db.query(OrganizationSigningKey)
        .filter(OrganizationSigningKey.organization_id == organization_id)
        .first()
    )


def get_by_id(db: Session, key_id: uuid.UUID) -> OrganizationSigningKey | None:
    return db.query(OrganizationSigningKey).filter(OrganizationSigningKey.id == key_id).first()


def create(
    db: Session,
    *,
    organization_id: uuid.UUID | None,
    algorithm: str,
    subject_common_name: str,
    certificate_pem: str,
    private_key_encrypted: str,
    key_encryption_algorithm: str,
    fingerprint_sha256: str,
    not_valid_before: datetime,
    not_valid_after: datetime,
    created_by: uuid.UUID,
) -> OrganizationSigningKey:
    key = OrganizationSigningKey(
        organization_id=organization_id,
        algorithm=algorithm,
        subject_common_name=subject_common_name,
        certificate_pem=certificate_pem,
        private_key_encrypted=private_key_encrypted,
        key_encryption_algorithm=key_encryption_algorithm,
        fingerprint_sha256=fingerprint_sha256,
        not_valid_before=not_valid_before,
        not_valid_after=not_valid_after,
        created_by=created_by,
    )
    db.add(key)
    db.commit()
    db.refresh(key)
    return key
