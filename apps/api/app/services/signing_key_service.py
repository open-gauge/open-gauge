import base64
import hashlib
import json
import os
import uuid
from datetime import datetime, timezone

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives import hashes, serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey, Ed25519PublicKey
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from sqlalchemy.orm import Session

from ..core.config import settings
from ..models.user import User
from ..models.user_signing_key import UserSigningKey
from ..repositories import user_signing_key as signing_key_repo

_HKDF_INFO = b"opengauge-signing-key-wrap-v1"


def _derive_wrap_key() -> bytes:
    """Derive the AES-256-GCM key that wraps private keys at rest from the app's SECRET_KEY.

    This protects against a database-only compromise (dump/backup theft); it does not
    protect against compromise of the running app process, which holds SECRET_KEY in
    memory and can unwrap on demand. There is no external KMS in a self-hosted deployment,
    so this is the practical ceiling for this threat model.
    """
    hkdf = HKDF(algorithm=hashes.SHA256(), length=32, salt=None, info=_HKDF_INFO)
    return hkdf.derive(settings.secret_key.encode("utf-8"))


def _wrap_private_key(private_key: Ed25519PrivateKey) -> str:
    pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    aesgcm = AESGCM(_derive_wrap_key())
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, pem, None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def _unwrap_private_key(encrypted: str) -> Ed25519PrivateKey:
    raw = base64.b64decode(encrypted)
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(_derive_wrap_key())
    pem = aesgcm.decrypt(nonce, ciphertext, None)
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
