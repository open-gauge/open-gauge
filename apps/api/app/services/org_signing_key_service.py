"""Self-signed X.509 signing certificate per organization.

One RSA-2048 certificate per organization, generated lazily the first time a
certificate is issued for it (get_or_create_signing_key), used by
pdf_signing_service to embed a PAdES digital signature into the compiled
certificate PDF — independent of whatever LaTeX template produced it.

organization_id=None is the instance-wide fallback, used when a calibration's
asset has no resolvable organization (see certificate_service.resolve_organization).

RSA-2048 (rather than the Ed25519 already used for signature images, see
signing_key_service.py) because PDF signature validation in mainstream
readers (Adobe Acrobat, Chrome, Preview) has universal, long-standing support
for RSA — Ed25519 support in PAdES contexts is newer and inconsistent across
readers. This is a different keypair serving a different purpose: it signs
the whole rendered document, not a signature image.
"""
import uuid
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.x509.oid import NameOID
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..models.organization_signing_key import OrganizationSigningKey
from ..repositories import organization_signing_key as org_signing_key_repo
from . import key_wrap

_CERT_VALIDITY_DAYS = 3650  # 10 years — self-signed, no external CA renewal process to lean on.


def _fingerprint(cert_der: bytes) -> str:
    import hashlib

    return hashlib.sha256(cert_der).hexdigest()


def _generate_certificate(subject_common_name: str) -> tuple[bytes, bytes, bytes]:
    """Returns (certificate_der, certificate_pem, private_key_pem)."""
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, subject_common_name)])
    now = datetime.now(timezone.utc)
    cert = (
        x509.CertificateBuilder()
        .subject_name(name)
        .issuer_name(name)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=_CERT_VALIDITY_DAYS))
        .add_extension(x509.BasicConstraints(ca=False, path_length=None), critical=True)
        .add_extension(
            x509.KeyUsage(
                digital_signature=True,
                content_commitment=True,
                key_encipherment=False,
                data_encipherment=False,
                key_agreement=False,
                key_cert_sign=False,
                crl_sign=False,
                encipher_only=False,
                decipher_only=False,
            ),
            critical=True,
        )
        .sign(private_key, hashes.SHA256())
    )
    cert_der = cert.public_bytes(serialization.Encoding.DER)
    cert_pem = cert.public_bytes(serialization.Encoding.PEM)
    key_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return cert_der, cert_pem, key_pem


def get_or_create_signing_key(
    db: Session,
    organization_id: uuid.UUID | None,
    subject_common_name: str,
    created_by: uuid.UUID,
) -> OrganizationSigningKey:
    """Return the organization's signing certificate, generating one on first
    use. organization_id=None returns/creates the instance-wide fallback.

    Concurrent first-use requests can race to create a row for the same
    organization_id — the migration's partial unique indexes make the loser's
    INSERT fail, so that case is caught and re-fetched rather than erroring.
    """
    existing = org_signing_key_repo.get_by_organization_id(db, organization_id)
    if existing:
        return existing

    cert_der, cert_pem, key_pem = _generate_certificate(subject_common_name)
    now = datetime.now(timezone.utc)
    try:
        return org_signing_key_repo.create(
            db,
            organization_id=organization_id,
            algorithm="RSA-2048",
            subject_common_name=subject_common_name,
            certificate_pem=cert_pem.decode("ascii"),
            private_key_encrypted=key_wrap.wrap_private_key_pem(key_pem),
            key_encryption_algorithm="AES-256-GCM",
            fingerprint_sha256=_fingerprint(cert_der),
            not_valid_before=now,
            not_valid_after=now + timedelta(days=_CERT_VALIDITY_DAYS),
            created_by=created_by,
        )
    except IntegrityError:
        db.rollback()
        existing = org_signing_key_repo.get_by_organization_id(db, organization_id)
        if existing is None:
            raise
        return existing
