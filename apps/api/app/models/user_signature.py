import uuid
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, LargeBinary, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class UserSignature(Base):
    """Append-only history of a user's signature image plus its cryptographic signature.

    A signature is evidence, not a mutable profile field: replacing it creates a new
    version and revokes (not deletes) the previous one, per AGENTS.md's audit-sensitive-
    entity rule. Exactly one row per user has is_active=True (enforced by a partial
    unique index in the migration).
    """

    __tablename__ = "user_signatures"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    signing_key_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("user_signing_keys.id"), nullable=False)
    image_file_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("files.id"), nullable=False)
    image_sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    signed_envelope: Mapped[str] = mapped_column(String, nullable=False)
    signature_bytes: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    signature_algorithm: Mapped[str] = mapped_column(String(20), nullable=False)
    source: Mapped[str] = mapped_column(String(20), nullable=False)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    change_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
