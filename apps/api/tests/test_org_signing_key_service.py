"""Tests for org_signing_key_service — lazy per-organization (and instance-wide
fallback) self-signed X.509 signing certificate used to embed PAdES signatures
into calibration certificate PDFs (see pdf_signing_service)."""
import uuid

from cryptography import x509
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from sqlalchemy.orm import Session

from app.core.security import hash_password
from app.models.organization import Organization
from app.models.user import User, UserRole
from app.services import key_wrap, org_signing_key_service


def _make_user(db: Session) -> User:
    user = User(
        id=uuid.uuid4(),
        email=f"user_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Test User",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.admin,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


def _make_org(db: Session, name: str = "Test Org") -> Organization:
    org = Organization(name=f"{name} {uuid.uuid4().hex[:8]}")
    db.add(org)
    db.flush()
    return org


class TestGetOrCreateSigningKey:
    def test_creates_a_real_self_signed_rsa_certificate(self, db: Session) -> None:
        user = _make_user(db)
        org = _make_org(db)
        key = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=org.id, subject_common_name="Acme Metrology Lab", created_by=user.id,
        )

        assert key.algorithm == "RSA-2048"
        assert key.subject_common_name == "Acme Metrology Lab"
        assert len(key.fingerprint_sha256) == 64

        cert = x509.load_pem_x509_certificate(key.certificate_pem.encode("ascii"))
        assert cert.subject.rfc4514_string() == "CN=Acme Metrology Lab"
        assert cert.issuer == cert.subject  # self-signed
        assert isinstance(cert.public_key(), rsa.RSAPublicKey)
        assert cert.public_key().key_size == 2048

    def test_private_key_unwraps_and_matches_the_public_certificate(self, db: Session) -> None:
        user = _make_user(db)
        org = _make_org(db)
        key = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=org.id, subject_common_name="Some Lab", created_by=user.id,
        )

        pem = key_wrap.unwrap_private_key_pem(key.private_key_encrypted)
        private_key = serialization.load_pem_private_key(pem, password=None)
        cert = x509.load_pem_x509_certificate(key.certificate_pem.encode("ascii"))

        assert private_key.public_key().public_numbers() == cert.public_key().public_numbers()

    def test_second_call_for_the_same_organization_returns_the_same_key(self, db: Session) -> None:
        user = _make_user(db)
        org = _make_org(db)
        first = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=org.id, subject_common_name="Lab A", created_by=user.id,
        )
        second = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=org.id, subject_common_name="Lab A (renamed, ignored)", created_by=user.id,
        )
        assert first.id == second.id
        assert second.subject_common_name == "Lab A"  # unchanged — not regenerated

    def test_different_organizations_get_different_keys(self, db: Session) -> None:
        user = _make_user(db)
        org_a = _make_org(db)
        org_b = _make_org(db)
        key_a = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=org_a.id, subject_common_name="Lab A", created_by=user.id,
        )
        key_b = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=org_b.id, subject_common_name="Lab B", created_by=user.id,
        )
        assert key_a.id != key_b.id
        assert key_a.fingerprint_sha256 != key_b.fingerprint_sha256

    def test_none_organization_id_is_the_instance_wide_fallback(self, db: Session) -> None:
        user = _make_user(db)
        key = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=None, subject_common_name="Open Gauge (self-hosted instance)", created_by=user.id,
        )
        assert key.organization_id is None
        again = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=None, subject_common_name="ignored", created_by=user.id,
        )
        assert again.id == key.id

    def test_concurrent_creation_race_falls_back_to_the_winner(self, db: Session, monkeypatch) -> None:
        """If two requests race to create the same org's first key, the
        loser's INSERT violates the migration's partial unique index
        (IntegrityError) — the service must catch it, roll back, and return
        the winner's row (via a second get_by_organization_id lookup)
        instead of propagating the error.

        The repository layer is mocked end-to-end (both get_by_organization_id
        calls and create), rather than provoking a real duplicate-key error
        against the database — this test's `db` fixture rolls back *all*
        writes made through it once any rollback happens mid-test (that's
        the fixture's isolation guarantee working as intended, see
        conftest.py), so a real "winner" row committed earlier in this same
        test would itself be wiped by the service's own db.rollback() call.
        A fully mocked repository keeps this test about the service's
        control flow, independent of that.
        """
        from sqlalchemy.exc import IntegrityError

        user_id = _make_user(db).id
        org_id = _make_org(db).id

        sentinel = object()  # stands in for "the winner's row, found on re-fetch"
        call_count = {"n": 0}

        def fake_get(db_, organization_id_):
            call_count["n"] += 1
            # First call: this request's own existence-check, as if it ran
            # before a racing request's row was visible. Second call: the
            # service's post-IntegrityError re-fetch, after the winner exists.
            return None if call_count["n"] == 1 else sentinel

        def fake_create(*args, **kwargs):
            raise IntegrityError("insert", {}, Exception("duplicate key value violates unique constraint"))

        monkeypatch.setattr(org_signing_key_service.org_signing_key_repo, "get_by_organization_id", fake_get)
        monkeypatch.setattr(org_signing_key_service.org_signing_key_repo, "create", fake_create)

        resolved = org_signing_key_service.get_or_create_signing_key(
            db, organization_id=org_id, subject_common_name="Winner", created_by=user_id,
        )
        assert resolved is sentinel
        assert call_count["n"] == 2
