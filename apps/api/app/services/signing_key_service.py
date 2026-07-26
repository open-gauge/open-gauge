import hashlib
import json
import uuid
from datetime import datetime, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.user_signing_key import UserSigningKey
from ..repositories import user_signing_key as signing_key_repo
from . import key_wrap


def _wrap_private_key(private_key: Ed25519PrivateKey) -> str:
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    return key_wrap.wrap_private_key_pem(pem)


def _unwrap_private_key(encrypted: str) -> Ed25519PrivateKey:
    pem = key_wrap.unwrap_private_key_pem(encrypted)
    private_key = serialization.load_pem_private_key(pem, password=None)
    if not isinstance(private_key, Ed25519PrivateKey):
        raise ValueError("Stored key is not an Ed25519 private key")
    return private_key


def _fingerprint(public_key: Ed25519PublicKey) -> str:
    raw = public_key.public_bytes(
        encoding=serialization.Encoding.Raw,
        format=serialization.PublicFormat.Raw,
    )
    return hashlib.sha256(raw).hexdigest()


def get_or_create_signing_key(db: Session, user: User) -> UserSigningKey:
    """Return the user's Ed25519 keypair, generating one on first use (lazy)."""
    existing = signing_key_repo.get_by_user_id(db, user.id)
    if existing:
        return existing

    private_key = Ed25519PrivateKey.generate()
    public_key = private_key.public_key()
    public_pem = public_key.public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    ).decode("ascii")

    return signing_key_repo.create(
        db,
        user_id=user.id,
        algorithm="Ed25519",
        public_key_pem=public_pem,
        private_key_encrypted=_wrap_private_key(private_key),
        key_encryption_algorithm="AES-256-GCM",
        fingerprint_sha256=_fingerprint(public_key),
        created_by=user.id,
    )


def build_envelope(user_id: uuid.UUID, image_sha256: str, algorithm: str) -> str:
    """Canonical JSON string that gets signed — binds the image hash to the user and time."""
    envelope = {
        "user_id": str(user_id),
        "image_sha256": image_sha256,
        "algorithm": algorithm,
        "signed_at": datetime.now(timezone.utc).isoformat(),
    }
    return json.dumps(envelope, sort_keys=True, separators=(",", ":"))


def sign_envelope(signing_key: UserSigningKey, envelope: str) -> bytes:
    private_key = _unwrap_private_key(signing_key.private_key_encrypted)
    return private_key.sign(envelope.encode("utf-8"))


def verify_envelope(public_key_pem: str, envelope: str, signature_bytes: bytes) -> bool:
    try:
        public_key = serialization.load_pem_public_key(public_key_pem.encode("ascii"))
    except ValueError:
        return False
    if not isinstance(public_key, Ed25519PublicKey):
        return False
    try:
        public_key.verify(signature_bytes, envelope.encode("utf-8"))
        return True
    except InvalidSignature:
        return False
