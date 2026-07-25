import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...dependencies.deps import get_current_user
from ...models.user import User
from ...repositories import notification as notification_repo
from ...repositories import notification_preference as notification_preference_repo
from ...schemas.notification import NotificationResponse, UnreadCountResponse
from ...schemas.notification_preference import NotificationPreferenceItem, NotificationPreferencesUpdate

router = APIRouter(prefix="/notifications", tags=["Notifications"])


@router.get("", response_model=list[NotificationResponse])
def list_notifications(
    skip: int = 0,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[NotificationResponse]:
    return notification_repo.list_for_user(db, current_user.id, skip=skip, limit=limit)


@router.get("/unread-count", response_model=UnreadCountResponse)
def get_unread_count(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> UnreadCountResponse:
    return UnreadCountResponse(count=notification_repo.count_unread(db, current_user.id))


@router.get("/preferences", response_model=list[NotificationPreferenceItem])
def get_notification_preferences(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[NotificationPreferenceItem]:
    return notification_preference_repo.get_for_user(db, current_user.id)


@router.put("/preferences", response_model=list[NotificationPreferenceItem])
def update_notification_preferences(
    payload: NotificationPreferencesUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> list[NotificationPreferenceItem]:
    for item in payload.preferences:
        notification_preference_repo.upsert_for_user(
            db, current_user.id, item.category, item.email_enabled, item.in_app_enabled
        )
    return notification_preference_repo.get_for_user(db, current_user.id)


@router.post("/{notification_id}/read", response_model=NotificationResponse)
def mark_notification_read(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> NotificationResponse:
    notification = notification_repo.get_by_id(db, notification_id)
    if not notification or notification.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    return notification_repo.mark_read(db, notification)


@router.post("/read-all", status_code=status.HTTP_204_NO_CONTENT)
def mark_all_read(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    notification_repo.mark_all_read(db, current_user.id)


@router.delete("/{notification_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_notification(
    notification_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    notification = notification_repo.get_by_id(db, notification_id)
    if not notification or notification.user_id != current_user.id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Notification not found")
    notification_repo.delete(db, notification)


@router.delete("", status_code=status.HTTP_204_NO_CONTENT)
def delete_all_notifications(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
) -> None:
    notification_repo.delete_all_for_user(db, current_user.id)
