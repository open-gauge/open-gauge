import enum
import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class NotificationCategory(str, enum.Enum):
    """Groups the free-text `Notification.type` values (see models/notification.py)
    into the units a user can actually configure delivery for. Adding a new
    Notification `type` under an existing category needs no change here; a
    genuinely new category does, same as any other new notification-producing
    feature."""

    calibration_due = "calibration_due"
    calibration_created = "calibration_created"
    organization_join_request = "organization_join_request"
    organization_join_decision = "organization_join_decision"


class NotificationPreference(Base):
    """A user's chosen delivery channels for one notification category. A
    missing row means both channels are enabled — see
    repositories/notification_preference.py's opt-out default."""

    __tablename__ = "notification_preferences"
    __table_args__ = (UniqueConstraint("user_id", "category", name="uq_notification_preference"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False)
    email_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    in_app_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
