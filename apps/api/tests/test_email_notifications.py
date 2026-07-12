"""
Tests for the email notifications feature: SMTP settings admin endpoints,
the register -> verify-email flow, and the calibration reminder sweep logic.

SMTP delivery itself is exercised against 127.0.0.1 on a closed port so
failures happen immediately (connection refused) instead of timing out.
"""
import uuid
from datetime import date, datetime, timedelta, timezone

import pytest
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.security import create_access_token, hash_password
from app.models.asset import Asset, AssetType
from app.models.calibration import Calibration
from app.models.email_settings import EmailSettings
from app.models.organization import Organization
from app.models.team import Team
from app.models.user import User, UserRole
from app.services.calibration_reminders import sweep as run_reminder_sweep
from app.services.notifications import team_member_emails
from tests.conftest import make_asset_id


def _enable_mail(db: Session, **overrides) -> EmailSettings:
    settings = EmailSettings(
        id=uuid.uuid4(),
        smtp_host="127.0.0.1",
        smtp_port=1,  # closed port: fails immediately instead of hanging
        smtp_use_tls=True,
        from_email="noreply@opengauge.test",
        from_name="Open Gauge",
        enabled=True,
        calibration_reminder_days=14,
    )
    for k, v in overrides.items():
        setattr(settings, k, v)
    db.add(settings)
    db.flush()
    return settings


def _viewer_headers(db: Session) -> dict:
    viewer = User(
        id=uuid.uuid4(),
        email=f"viewer_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Viewer",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.viewer,
        is_active=True,
    )
    db.add(viewer)
    db.flush()
    return {"Authorization": f"Bearer {create_access_token({'sub': str(viewer.id)})}"}


# ---------------------------------------------------------------------------
# Registration + email verification flow
# ---------------------------------------------------------------------------

class TestRegisterWithoutMailConfigured:
    def test_register_creates_unverified_account_requiring_admin_activation(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        email = f"newuser_{uuid.uuid4().hex[:8]}@opengauge.test"
        response = client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "New User", "password": "Testpass123!"},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["access_token"] is None
        assert body["verification_required"] is True
        assert "administrator" in body["message"].lower()

        user = db.query(User).filter(User.email == email).first()
        assert user.is_verified is False
        assert user.verification_token is None  # no self-service path without mail

        login = client.post(
            "/api/v1/auth/login", json={"email": email, "password": "Testpass123!"}
        )
        assert login.status_code == 401

        # An admin activates the account directly — no token/email involved.
        activate = client.put(
            f"/api/v1/users/{user.id}", json={"is_verified": True}, headers=auth_headers
        )
        assert activate.status_code == 200, activate.text
        assert activate.json()["is_verified"] is True

        login_after_activation = client.post(
            "/api/v1/auth/login", json={"email": email, "password": "Testpass123!"}
        )
        assert login_after_activation.status_code == 200


class TestRegisterWithMailConfigured:
    def test_register_requires_verification_and_blocks_login(
        self, client: TestClient, db: Session
    ) -> None:
        _enable_mail(db)
        email = f"newuser_{uuid.uuid4().hex[:8]}@opengauge.test"

        response = client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "New User", "password": "Testpass123!"},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["access_token"] is None
        assert body["verification_required"] is True

        login = client.post(
            "/api/v1/auth/login", json={"email": email, "password": "Testpass123!"}
        )
        assert login.status_code == 401

    def test_verify_email_activates_account_and_allows_login(
        self, client: TestClient, db: Session
    ) -> None:
        _enable_mail(db)
        email = f"newuser_{uuid.uuid4().hex[:8]}@opengauge.test"
        client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "New User", "password": "Testpass123!"},
        )
        user = db.query(User).filter(User.email == email).first()
        assert user.verification_token

        resp = client.get(f"/api/v1/auth/verify-email?token={user.verification_token}")
        assert resp.status_code == 200, resp.text
        assert resp.json()["access_token"]

        db.refresh(user)
        assert user.is_verified is True
        assert user.verification_token is None

        login = client.post(
            "/api/v1/auth/login", json={"email": email, "password": "Testpass123!"}
        )
        assert login.status_code == 200

    def test_verify_email_rejects_invalid_token(self, client: TestClient) -> None:
        resp = client.get("/api/v1/auth/verify-email?token=not-a-real-token")
        assert resp.status_code == 400

    def test_verify_email_rejects_expired_token(
        self, client: TestClient, db: Session
    ) -> None:
        _enable_mail(db)
        email = f"newuser_{uuid.uuid4().hex[:8]}@opengauge.test"
        client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "New User", "password": "Testpass123!"},
        )
        user = db.query(User).filter(User.email == email).first()
        user.verification_token_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.flush()

        resp = client.get(f"/api/v1/auth/verify-email?token={user.verification_token}")
        assert resp.status_code == 400

    def test_resend_verification_is_always_204(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/resend-verification", json={"email": "nobody@opengauge.test"}
        )
        assert resp.status_code == 204


# ---------------------------------------------------------------------------
# Forgot password / reset password
# ---------------------------------------------------------------------------

class TestForgotPasswordWithoutMailConfigured:
    def test_forgot_password_is_always_204_and_issues_no_token(
        self, client: TestClient, db: Session, test_user: User
    ) -> None:
        resp = client.post(
            "/api/v1/auth/forgot-password", json={"email": test_user.email}
        )
        assert resp.status_code == 204
        db.refresh(test_user)
        assert test_user.password_reset_token is None


class TestForgotPasswordWithMailConfigured:
    def test_forgot_password_issues_a_reset_token_for_a_known_email(
        self, client: TestClient, db: Session, test_user: User
    ) -> None:
        _enable_mail(db)
        resp = client.post(
            "/api/v1/auth/forgot-password", json={"email": test_user.email}
        )
        assert resp.status_code == 204
        db.refresh(test_user)
        assert test_user.password_reset_token is not None
        assert test_user.password_reset_token_expires_at is not None

    def test_forgot_password_is_still_204_for_unknown_email(
        self, client: TestClient, db: Session
    ) -> None:
        _enable_mail(db)
        resp = client.post(
            "/api/v1/auth/forgot-password", json={"email": "nobody@opengauge.test"}
        )
        assert resp.status_code == 204

    def test_reset_password_updates_password_and_logs_in(
        self, client: TestClient, db: Session, test_user: User
    ) -> None:
        _enable_mail(db)
        client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
        db.refresh(test_user)
        token = test_user.password_reset_token

        resp = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "NewPassword456!"},
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["access_token"]

        db.refresh(test_user)
        assert test_user.password_reset_token is None

        login = client.post(
            "/api/v1/auth/login",
            json={"email": test_user.email, "password": "NewPassword456!"},
        )
        assert login.status_code == 200

        old_login = client.post(
            "/api/v1/auth/login",
            json={"email": test_user.email, "password": "Testpass123!"},
        )
        assert old_login.status_code == 401

    def test_reset_password_rejects_invalid_token(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/auth/reset-password",
            json={"token": "not-a-real-token", "new_password": "NewPassword456!"},
        )
        assert resp.status_code == 400

    def test_reset_password_rejects_expired_token(
        self, client: TestClient, db: Session, test_user: User
    ) -> None:
        _enable_mail(db)
        client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
        db.refresh(test_user)
        test_user.password_reset_token_expires_at = datetime.now(timezone.utc) - timedelta(hours=1)
        db.flush()

        resp = client.post(
            "/api/v1/auth/reset-password",
            json={"token": test_user.password_reset_token, "new_password": "NewPassword456!"},
        )
        assert resp.status_code == 400

    def test_reset_password_token_is_single_use(
        self, client: TestClient, db: Session, test_user: User
    ) -> None:
        _enable_mail(db)
        client.post("/api/v1/auth/forgot-password", json={"email": test_user.email})
        db.refresh(test_user)
        token = test_user.password_reset_token

        first = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "NewPassword456!"},
        )
        assert first.status_code == 200

        second = client.post(
            "/api/v1/auth/reset-password",
            json={"token": token, "new_password": "AnotherPassword789!"},
        )
        assert second.status_code == 400


# ---------------------------------------------------------------------------
# Admin email settings endpoints
# ---------------------------------------------------------------------------

class TestEmailSettingsAdmin:
    def test_get_creates_default_row(self, client: TestClient, auth_headers: dict) -> None:
        resp = client.get("/api/v1/admin/email-settings", headers=auth_headers)
        assert resp.status_code == 200
        body = resp.json()
        assert body["enabled"] is False
        assert body["has_smtp_password"] is False

    def test_non_admin_is_forbidden(self, client: TestClient, db: Session) -> None:
        headers = _viewer_headers(db)
        resp = client.get("/api/v1/admin/email-settings", headers=headers)
        assert resp.status_code == 403

    def test_update_settings_never_exposes_password(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.put(
            "/api/v1/admin/email-settings",
            json={
                "smtp_host": "smtp.example.com",
                "smtp_port": 587,
                "from_email": "noreply@example.com",
                "smtp_password": "supersecret",
                "enabled": True,
            },
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        body = resp.json()
        assert body["smtp_host"] == "smtp.example.com"
        assert body["has_smtp_password"] is True
        assert "smtp_password" not in body

    def test_omitting_password_leaves_it_unchanged(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.put(
            "/api/v1/admin/email-settings",
            json={"smtp_password": "supersecret"},
            headers=auth_headers,
        )
        resp = client.put(
            "/api/v1/admin/email-settings",
            json={"from_name": "Lab Notifications"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["has_smtp_password"] is True

    def test_empty_string_clears_password(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        client.put(
            "/api/v1/admin/email-settings",
            json={"smtp_password": "supersecret"},
            headers=auth_headers,
        )
        resp = client.put(
            "/api/v1/admin/email-settings",
            json={"smtp_password": ""},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text
        assert resp.json()["has_smtp_password"] is False

    def test_test_email_reports_failure_for_unreachable_smtp(
        self, client: TestClient, auth_headers: dict
    ) -> None:
        resp = client.put(
            "/api/v1/admin/email-settings",
            json={"smtp_host": "127.0.0.1", "smtp_port": 1, "from_email": "noreply@opengauge.test"},
            headers=auth_headers,
        )
        assert resp.status_code == 200, resp.text

        resp = client.post(
            "/api/v1/admin/email-settings/test",
            json={"to_email": "someone@example.com"},
            headers=auth_headers,
        )
        assert resp.status_code == 502


# ---------------------------------------------------------------------------
# Team member resolution + calibration reminder sweep
# ---------------------------------------------------------------------------

@pytest.fixture()
def team_with_member(db: Session, test_user: User) -> tuple[Team, User]:
    org = Organization(id=uuid.uuid4(), name=f"Org {uuid.uuid4().hex[:6]}")
    db.add(org)
    db.flush()
    team = Team(id=uuid.uuid4(), organization_id=org.id, name=f"Cal Lab {uuid.uuid4().hex[:6]}", created_by=test_user.id)
    db.add(team)
    db.flush()
    member = User(
        id=uuid.uuid4(),
        email=f"member_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Team Member",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.technician,
        team=team.name,
        is_active=True,
    )
    db.add(member)
    db.flush()
    return team, member


def _make_asset(db: Session, owner_team_id, created_by: uuid.UUID) -> Asset:
    asset = Asset(
        id=uuid.uuid4(),
        asset_id=make_asset_id(),
        asset_type=AssetType.sensor,
        name="Reminder Test Sensor",
        manufacturer="Fluke",
        model="724",
        owner=owner_team_id,
        is_active=True,
        created_by=created_by,
    )
    db.add(asset)
    db.flush()
    return asset


def _make_calibration(db: Session, asset: Asset, due_date: date, created_by: uuid.UUID) -> Calibration:
    cal = Calibration(
        id=uuid.uuid4(),
        asset_id=asset.id,
        calibration_date=due_date - timedelta(days=365),
        due_date=due_date,
        performed_by_name="Lab Tech",
        created_by=created_by,
    )
    db.add(cal)
    db.flush()
    return cal


class TestTeamMemberEmails:
    def test_resolves_active_members_of_the_owning_team(
        self, db: Session, test_user: User, team_with_member: tuple[Team, User]
    ) -> None:
        team, member = team_with_member
        asset = _make_asset(db, team.id, test_user.id)
        emails = team_member_emails(db, asset, exclude_user_id=None)
        assert emails == [member.email]

    def test_excludes_given_user_id(
        self, db: Session, test_user: User, team_with_member: tuple[Team, User]
    ) -> None:
        team, member = team_with_member
        asset = _make_asset(db, team.id, test_user.id)
        emails = team_member_emails(db, asset, exclude_user_id=member.id)
        assert emails == []

    def test_no_owner_returns_no_recipients(self, db: Session, test_user: User) -> None:
        asset = _make_asset(db, None, test_user.id)
        assert team_member_emails(db, asset, exclude_user_id=None) == []


class TestCalibrationReminderSweep:
    def test_sends_due_soon_reminder_and_marks_it_sent(
        self, db: Session, test_user: User, team_with_member: tuple[Team, User], monkeypatch
    ) -> None:
        _enable_mail(db, calibration_reminder_days=14)
        team, member = team_with_member
        asset = _make_asset(db, team.id, test_user.id)
        cal = _make_calibration(db, asset, date.today() + timedelta(days=5), test_user.id)

        sent = []
        monkeypatch.setattr(
            "app.services.calibration_reminders.mail_svc.send_email",
            lambda db, to, subject, html, text: sent.append(to),
        )

        run_reminder_sweep(db)

        assert sent == [member.email]
        db.refresh(cal)
        assert cal.due_reminder_sent_at is not None
        assert cal.overdue_reminder_sent_at is None

    def test_sends_overdue_reminder_and_marks_it_sent(
        self, db: Session, test_user: User, team_with_member: tuple[Team, User], monkeypatch
    ) -> None:
        _enable_mail(db)
        team, member = team_with_member
        asset = _make_asset(db, team.id, test_user.id)
        cal = _make_calibration(db, asset, date.today() - timedelta(days=3), test_user.id)

        monkeypatch.setattr(
            "app.services.calibration_reminders.mail_svc.send_email",
            lambda db, to, subject, html, text: None,
        )

        run_reminder_sweep(db)

        db.refresh(cal)
        assert cal.overdue_reminder_sent_at is not None

    def test_does_not_resend_once_marked(
        self, db: Session, test_user: User, team_with_member: tuple[Team, User], monkeypatch
    ) -> None:
        _enable_mail(db)
        team, member = team_with_member
        asset = _make_asset(db, team.id, test_user.id)
        cal = _make_calibration(db, asset, date.today() + timedelta(days=5), test_user.id)
        already_sent = datetime.now(timezone.utc)
        cal.due_reminder_sent_at = already_sent
        db.flush()

        def _fail_if_called(*a, **k):
            raise AssertionError("should not send a reminder that was already sent")

        monkeypatch.setattr(
            "app.services.calibration_reminders.mail_svc.send_email", _fail_if_called
        )

        run_reminder_sweep(db)

        db.refresh(cal)
        assert cal.due_reminder_sent_at == already_sent

    def test_is_noop_when_mail_disabled(
        self, db: Session, test_user: User, team_with_member: tuple[Team, User]
    ) -> None:
        team, member = team_with_member
        asset = _make_asset(db, team.id, test_user.id)
        cal = _make_calibration(db, asset, date.today() - timedelta(days=3), test_user.id)

        run_reminder_sweep(db)

        db.refresh(cal)
        assert cal.overdue_reminder_sent_at is None

    def test_failed_delivery_is_not_marked_as_sent(
        self, db: Session, test_user: User, team_with_member: tuple[Team, User]
    ) -> None:
        """Uses the real (closed-port) SMTP target so delivery genuinely fails —
        confirms a failed send is left unmarked and will be retried next sweep."""
        _enable_mail(db)
        team, member = team_with_member
        asset = _make_asset(db, team.id, test_user.id)
        cal = _make_calibration(db, asset, date.today() - timedelta(days=3), test_user.id)

        run_reminder_sweep(db)

        db.refresh(cal)
        assert cal.overdue_reminder_sent_at is None
