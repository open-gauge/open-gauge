"""
Shared test fixtures.

Tests run against a real PostgreSQL database (same host as the app, but tests
wrap every function in a transaction that is rolled back when the test ends, so
no test data is ever persisted).

Set TEST_DATABASE_URL to point at a dedicated test database if preferred.
"""
import os
import uuid

import pytest
from minio.error import S3Error
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.config import settings
from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.user import User, UserRole
from app.services import storage

_DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://opengauge_user:opengauge_password@db:5432/opengauge_db",
)

_engine = create_engine(_DB_URL)


@pytest.fixture(scope="session", autouse=True)
def _ensure_schema() -> None:
    """Create all tables once per test session (idempotent)."""
    Base.metadata.create_all(bind=_engine)


@pytest.fixture(scope="session", autouse=True)
def _isolated_minio_bucket() -> None:
    """
    Every upload-touching endpoint under test (assets, calibrations,
    certificate templates, organizations, signatures, users, ...) writes
    through `app.services.storage`, which talks to the real MinIO server —
    the rolled-back-transaction guarantee the `db` fixture gives Postgres has
    no equivalent here, since MinIO has no notion of the test's transaction.
    Left pointed at the real bucket, the suite would permanently litter it
    with test fixture files, and the admin database reset test would
    permanently empty it (`reset_to_clean_state` calls
    `storage.delete_all_objects()` unconditionally) — wiping any real media a
    user has actually uploaded. Redirect every call the suite makes to a
    disposable per-run bucket instead, and remove it again at the end.
    """
    original_bucket = settings.minio_bucket
    settings.minio_bucket = f"opengauge-test-{uuid.uuid4().hex[:12]}"
    yield
    storage.delete_all_objects()
    try:
        storage._upload_client().remove_bucket(settings.minio_bucket)
    except S3Error:
        pass
    settings.minio_bucket = original_bucket


@pytest.fixture()
def db() -> Session:
    """
    Function-scoped database session.

    Wraps each test in an outer transaction that is rolled back when the test
    finishes, so test data never touches the real database.

    `join_transaction_mode="create_savepoint"` is required, not optional: some
    endpoints under test (e.g. the admin database reset) call `session.commit()`
    themselves. Without it, a plain `Session(bind=connection)` treats that
    `commit()` as committing the *outer* transaction started above for real —
    the later `transaction.rollback()` then rolls back nothing, and the
    operation (including a `TRUNCATE ... CASCADE` in the reset case) permanently
    lands in the real database. With this mode, every `commit()` from app code
    only releases a SAVEPOINT nested inside the outer transaction, which the
    final `transaction.rollback()` below still discards entirely.
    """
    connection = _engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, join_transaction_mode="create_savepoint")
    yield session
    session.close()
    transaction.rollback()
    connection.close()


@pytest.fixture()
def client(db: Session) -> TestClient:
    """
    Synchronous TestClient with the get_db dependency overridden to use the
    test session.  The lifespan (seed) is NOT triggered because we do not use
    the context-manager form of TestClient.
    """
    def _override_get_db():
        yield db

    app.dependency_overrides[get_db] = _override_get_db
    c = TestClient(app, raise_server_exceptions=True)
    yield c
    app.dependency_overrides.clear()


@pytest.fixture()
def test_user(db: Session) -> User:
    """A fresh admin user visible only within the current test transaction."""
    user = User(
        id=uuid.uuid4(),
        email=f"tester_{uuid.uuid4().hex[:8]}@opengauge.test",
        name="Test Admin",
        hashed_password=hash_password("Testpass123!"),
        role=UserRole.admin,
        is_active=True,
    )
    db.add(user)
    db.flush()
    return user


@pytest.fixture()
def auth_headers(test_user: User) -> dict[str, str]:
    """Bearer token for the test user."""
    token = create_access_token({"sub": str(test_user.id)})
    return {"Authorization": f"Bearer {token}"}


def make_asset_id() -> str:
    """Generate a unique asset ID that satisfies the OG-XXXXX constraint."""
    # Use 9xxxx range to avoid colliding with seeded OG-00xxx data
    n = (uuid.uuid4().int % 9000) + 90000
    return f"Open Gauge-{n:05d}"
