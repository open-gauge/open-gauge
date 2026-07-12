import uuid

from sqlalchemy.orm import Session

from ..models.email_settings import EmailSettings


def get(db: Session) -> EmailSettings | None:
    return db.query(EmailSettings).first()


def get_or_create(db: Session) -> EmailSettings:
    settings = get(db)
    if settings:
        return settings
    settings = EmailSettings(id=uuid.uuid4())
    db.add(settings)
    db.commit()
    db.refresh(settings)
    return settings


def update(db: Session, settings: EmailSettings, updated_by: uuid.UUID, **kwargs) -> EmailSettings:
    for key, value in kwargs.items():
        if value is not None:
            setattr(settings, key, value)
    settings.updated_by = updated_by
    db.commit()
    db.refresh(settings)
    return settings
