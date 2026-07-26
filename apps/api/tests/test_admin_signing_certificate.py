"""Tests for GET /admin/signing-certificate — the instance-wide fallback
signing certificate (organization_id=None), used for certificates whose asset
has no resolvable organization. See test_organizations.py's TestSigningCertificate
for the per-organization equivalent."""
import uuid

from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.models.organization import Organization
from app.services import org_signing_key_service


def _make_org(db: Session) -> Organization:
    org = Organization(name=f"Test Org {uuid.uuid4().hex[:8]}")
    db.add(org)
    db.flush()
    return org


class TestInstanceSigningCertificate:
    def test_null_before_any_certificate_has_been_issued(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/admin/signing-certificate", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        assert resp.json() is None

    def test_returns_certificate_info_once_generated(
        self, client: TestClient, auth_headers: dict, test_user, db: Session
    ) -> None:
        org_signing_key_service.get_or_create_signing_key(
            db,
            organization_id=None,
            subject_common_name="Open Gauge (self-hosted instance)",
            created_by=test_user.id,
        )
        db.commit()

        resp = client.get("/api/v1/admin/signing-certificate", headers=auth_headers)
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["algorithm"] == "RSA-2048"
        assert body["subject_common_name"] == "Open Gauge (self-hosted instance)"

    def test_requires_authentication(self, client: TestClient) -> None:
        resp = client.get("/api/v1/admin/signing-certificate")
        assert resp.status_code == 403

    def test_org_and_instance_fallback_are_independent_rows(
        self, client: TestClient, auth_headers: dict, test_user, db: Session
    ) -> None:
        org_signing_key_service.get_or_create_signing_key(
            db, organization_id=None, subject_common_name="Instance fallback", created_by=test_user.id,
        )
        org_signing_key_service.get_or_create_signing_key(
            db, organization_id=_make_org(db).id, subject_common_name="Some Org", created_by=test_user.id,
        )
        db.commit()

        resp = client.get("/api/v1/admin/signing-certificate", headers=auth_headers)
        assert resp.json()["subject_common_name"] == "Instance fallback"
