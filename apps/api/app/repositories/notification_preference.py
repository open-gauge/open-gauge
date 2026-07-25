import uuid

from sqlalchemy.orm import Session

from ..models.notification_preference import NotificationCategory, NotificationPreference


def get_for_user(db: Session, user_id: uuid.UUID) -> list[NotificationPreference]:
    """Every known category, defaulting to both channels enabled for whichever
    ones the user hasn't explicitly configured yet (opt-out model)."""
    saved = {
        p.category: p
        for p in db.query(NotificationPreference).filter(NotificationPreference.user_id == user_id).all()
    }
    return [
        saved.get(category.value)
        or NotificationPreference(user_id=user_id, category=category.value, email_enabled=True, in_app_enabled=True)
        for category in NotificationCategory
    ]


def upsert_for_user(
    db: Session, user_id: uuid.UUID, category: str, email_enabled: bool, in_app_enabled: bool
) -> NotificationPreference:
    pref = (
        db.query(NotificationPreference)
        .filter(NotificationPreference.user_id == user_id, NotificationPreference.category == category)
        .first()
    )
    if pref is None:
        pref = NotificationPreference(user_id=user_id, category=category)
        db.add(pref)
    pref.email_enabled = email_enabled
    pref.in_app_enabled = in_app_enabled
    db.commit()
    db.refresh(pref)
    return pref


def is_enabled(db: Session, user_id: uuid.UUID, category: str, channel: str) -> bool:
    """channel is "email" or "in_app". A missing row means enabled — this
    table only stores explicit choices, so new users/categories default open."""
    pref = (
        db.query(NotificationPreference)
        .filter(NotificationPreference.user_id == user_id, NotificationPreference.category == category)
        .first()
    )
    if pref is None:
        return True
    return pref.email_enabled if channel == "email" else pref.in_app_enabled
