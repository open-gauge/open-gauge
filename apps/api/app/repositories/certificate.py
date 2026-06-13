import uuid

from sqlalchemy.orm import Session

from ..models.certificate import Certificate


def get_by_id(db: Session, cert_id: uuid.UUID) -> Certificate | None:
    return db.query(Certificate).filter(Certificate.id == cert_id).first()


def list_by_asset(db: Session, asset_pk: uuid.UUID, skip: int = 0, limit: int = 50) -> list[Certificate]:
    return (
        db.query(Certificate)
        .filter(Certificate.asset_id == asset_pk, Certificate.is_active == True)  # noqa: E712
        .order_by(Certificate.issued_at.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )


def list_certificates(db: Session, skip: int = 0, limit: int = 50) -> list[Certificate]:
    return db.query(Certificate).order_by(Certificate.created_at.desc()).offset(skip).limit(limit).all()


def create(db: Session, created_by: uuid.UUID, **kwargs) -> Certificate:
    cert = Certificate(created_by=created_by, **kwargs)
    db.add(cert)
    db.commit()
    db.refresh(cert)
    return cert


def deactivate(db: Session, cert: Certificate) -> Certificate:
    cert.is_active = False
    db.commit()
    db.refresh(cert)
    return cert
