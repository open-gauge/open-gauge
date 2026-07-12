import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class UserSigningKey(Base):
    """One Ed25519 keypair per user, generated lazily on first signature upload.

    The private key is envelope-encrypted at rest (see signing_key_service) so a
    database-only leak does not expose it in plaintext.
    """

    __tablename__ = "user_signing_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), unique=True, nullable=False, index=True)
    algorithm: Mapped[str] = mapped_column(String(20), nullable=False)
    public_key_pem: Mapped[str] = mapped_column(String, nullable=False)
    private_key_encrypted: Mapped[str] = mapped_column(String, nullable=False)
    key_encryption_algorithm: Mapped[str] = mapped_column(String(30), nullable=False)
    fingerprint_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
