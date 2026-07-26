"""Unit tests for the shared private-key envelope-encryption helper used by
signing_key_service.py (Ed25519, signature images) and org_signing_key_service.py
(RSA, certificate PDF signing)."""
import base64

import pytest
from cryptography.exceptions import InvalidTag

from app.services import key_wrap


class TestWrapUnwrap:
    def test_round_trips_arbitrary_pem_bytes(self) -> None:
        pem = b"-----BEGIN PRIVATE KEY-----\nnot a real key, just bytes\n-----END PRIVATE KEY-----\n"
        wrapped = key_wrap.wrap_private_key_pem(pem)
        assert key_wrap.unwrap_private_key_pem(wrapped) == pem

    def test_wrapped_output_does_not_contain_plaintext(self) -> None:
        pem = b"-----BEGIN PRIVATE KEY-----\nsuper-secret-key-material\n-----END PRIVATE KEY-----\n"
        wrapped = key_wrap.wrap_private_key_pem(pem)
        assert b"super-secret-key-material" not in wrapped.encode("ascii")

    def test_two_wraps_of_the_same_pem_differ(self) -> None:
        """Nonce is random per call, so ciphertext must differ even for identical input."""
        pem = b"-----BEGIN PRIVATE KEY-----\nsame input twice\n-----END PRIVATE KEY-----\n"
        assert key_wrap.wrap_private_key_pem(pem) != key_wrap.wrap_private_key_pem(pem)

    def test_tampered_ciphertext_fails_to_unwrap(self) -> None:
        pem = b"-----BEGIN PRIVATE KEY-----\noriginal\n-----END PRIVATE KEY-----\n"
        wrapped = key_wrap.wrap_private_key_pem(pem)
        raw = bytearray(base64.b64decode(wrapped))
        raw[-1] ^= 0xFF  # flip a byte in the ciphertext/tag
        tampered = base64.b64encode(bytes(raw)).decode("ascii")
        with pytest.raises(InvalidTag):
            key_wrap.unwrap_private_key_pem(tampered)
