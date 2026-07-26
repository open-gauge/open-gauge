"""Envelope encryption for private keys at rest.

Shared by signing_key_service.py (per-user Ed25519 keys) and
org_signing_key_service.py (per-organization RSA certificate keys) — the
wrap/unwrap logic is algorithm-agnostic since it operates on PEM bytes, not
key objects.
"""
import base64
import os

from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from ..core.config import settings

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


def wrap_private_key_pem(pem: bytes) -> str:
    """Encrypt a PEM-encoded private key for storage."""
    aesgcm = AESGCM(_derive_wrap_key())
    nonce = os.urandom(12)
    ciphertext = aesgcm.encrypt(nonce, pem, None)
    return base64.b64encode(nonce + ciphertext).decode("ascii")


def unwrap_private_key_pem(encrypted: str) -> bytes:
    """Decrypt back to the raw PEM bytes. Caller parses with
    load_pem_private_key and validates the expected key type."""
    raw = base64.b64decode(encrypted)
    nonce, ciphertext = raw[:12], raw[12:]
    aesgcm = AESGCM(_derive_wrap_key())
    return aesgcm.decrypt(nonce, ciphertext, None)
