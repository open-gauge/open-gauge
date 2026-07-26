import uuid
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from ..core.database import Base


class OrganizationSigningKey(Base):
    """One self-signed RSA-2048 X.509 certificate per organization, generated
    lazily the first time a certificate is issued for that organization (or
    for the instance-wide fallback, where organization_id is NULL — mirrors
    CertificateTemplate's global-scope convention).

    Used by pdf_signing_service to embed a PAdES digital signature into every
    generated calibration certificate PDF, independent of the LaTeX template
    used. The private key is envelope-encrypted at rest (see key_wrap.py) so
    a database-only leak does not expose it in plaintext. The certificate
    itself (certificate_pem) is not secret — it's published so recipients of
    a certificate PDF can import it as a trusted root without needing an
    Open Gauge account.
    """

    __tablename__ = "organization_signing_keys"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    # Uniqueness (one row per org, and at most one row with organization_id
    # NULL for the instance-wide fallback) is enforced by partial unique
    # indexes in the migration, not a plain column-level constraint — a
    # normal UNIQUE column allows multiple NULLs, which would defeat the
    # "exactly one global fallback key" invariant.
    organization_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("organizations.id"), nullable=True, index=True
    )
    algorithm: Mapped[str] = mapped_column(String(20), nullable=False)
    subject_common_name: Mapped[str] = mapped_column(String(255), nullable=False)
    certificate_pem: Mapped[str] = mapped_column(String, nullable=False)
    private_key_encrypted: Mapped[str] = mapped_column(String, nullable=False)
    key_encryption_algorithm: Mapped[str] = mapped_column(String(30), nullable=False)
    fingerprint_sha256: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    not_valid_before: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    not_valid_after: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    created_by: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False)
