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
from app.models.team_member import TeamMember
from app.models.user import User, UserRole
from app.services.calibration_reminders import sweep as run_reminder_sweep
from app.services.notifications import team_member_emails
from tests.conftest import make_asset_id


def _get_singleton_settings(db: Session) -> EmailSettings:
    """email_settings is a true single-row table (enforced by a unique index —
    see migration 023): there's always exactly one, real, already-committed
    row in this shared dev database, so tests must update it in place rather
    than inserting a second one. Because that update happens inside this
    test's own rolled-back transaction, the real row is restored afterward —
    but it also means every test that touches mail must set every field it
    depends on explicitly, never assume an unconfigured/default state."""
    settings = db.query(EmailSettings).first()
    if settings is None:
        settings = EmailSettings(id=uuid.uuid4())
        db.add(settings)
        db.flush()
    return settings


def _enable_mail(db: Session, **overrides) -> EmailSettings:
    settings = _get_singleton_settings(db)
    settings.smtp_host = "127.0.0.1"
    settings.smtp_port = 1  # closed port: fails immediately instead of hanging
    settings.smtp_username = None
    settings.smtp_password = None
    settings.smtp_use_tls = True
    settings.from_email = "noreply@opengauge.test"
    settings.from_name = "Open Gauge"
    settings.enabled = True
    settings.calibration_reminder_days = 14
    for k, v in overrides.items():
        setattr(settings, k, v)
    db.flush()
    return settings


def _disable_mail(db: Session) -> EmailSettings:
    """For tests that need to observe "mail not configured" behavior — the
    shared dev database this suite runs against always has a real, enabled
    SMTP configuration, so that state can never be assumed as a default."""
    settings = _get_singleton_settings(db)
    settings.enabled = False
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
        _disable_mail(db)
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


class TestRegisterFirstUserOnFreshInstall:
    """Regression test: on a fresh install there is no admin yet who could
    activate a pending account, so the very first registration must not be
    stuck unverified forever — it's created verified and as superadmin
    instead. `count_users` is patched to 0 rather than deleting the (shared,
    already-populated) test database's users table, which would fail on
    foreign keys held by other rows."""

    def test_first_registered_account_is_verified_superadmin(
        self, client: TestClient, db: Session, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        from app.repositories import user as user_repo

        monkeypatch.setattr(user_repo, "count_users", lambda db: 0)

        email = f"firstuser_{uuid.uuid4().hex[:8]}@opengauge.test"
        response = client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "First User", "password": "Testpass123!"},
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["verification_required"] is False
        assert "superadmin" in body["message"].lower()

        user = db.query(User).filter(User.email == email).first()
        assert user.is_verified is True
        assert user.is_superuser is True
        assert user.role == UserRole.superadmin

        login = client.post(
            "/api/v1/auth/login", json={"email": email, "password": "Testpass123!"}
        )
        assert login.status_code == 200

    def test_second_registered_account_is_not_promoted(
        self, client: TestClient, db: Session
    ) -> None:
        """Sanity check on the other side of the branch: with users already
        present (the normal case for every test in this suite), registration
        follows the regular unverified/pending-activation path."""
        email = f"seconduser_{uuid.uuid4().hex[:8]}@opengauge.test"
        response = client.post(
            "/api/v1/auth/register",
            json={"email": email, "name": "Second User", "password": "Testpass123!"},
        )
        assert response.status_code == 201, response.text
        assert response.json()["verification_required"] is True

        user = db.query(User).filter(User.email == email).first()
        assert user.is_verified is False
        assert user.is_superuser is False


# ---------------------------------------------------------------------------
# Forgot password / reset password
# ---------------------------------------------------------------------------

class TestForgotPasswordWithoutMailConfigured:
    def test_forgot_password_is_always_204_and_issues_no_token(
        self, client: TestClient, db: Session, test_user: User
    ) -> None:
        _disable_mail(db)
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
    def test_get_reports_no_password_when_none_configured(
        self, client: TestClient, auth_headers: dict, db: Session
    ) -> None:
        settings = _disable_mail(db)
        settings.smtp_password = None
        db.flush()
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
        is_active=True,
    )
    db.add(member)
    db.flush()
    db.add(TeamMember(team_id=team.id, user_id=member.id))
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

        # The sweep scans every due/overdue calibration in the database, not just this
        # test's fixture — in a shared dev DB there may be other real team-owned
        # calibrations that are also due, so assert membership rather than exact
        # equality (which real unrelated data could otherwise break).
        assert member.email in sent
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

        # The sweep scans every due/overdue calibration in the database, not just this
        # test's fixture — recording calls (rather than failing the moment any send
        # happens) keeps this test valid even if a shared dev DB has other real
        # calibrations that are legitimately due right now.
        sent = []
        monkeypatch.setattr(
            "app.services.calibration_reminders.mail_svc.send_email",
            lambda db, to, subject, html, text: sent.append(to),
        )

        run_reminder_sweep(db)

        db.refresh(cal)
        assert cal.due_reminder_sent_at == already_sent
        assert member.email not in sent

    def test_is_noop_when_mail_disabled(
        self, db: Session, test_user: User, team_with_member: tuple[Team, User]
    ) -> None:
        _disable_mail(db)
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
