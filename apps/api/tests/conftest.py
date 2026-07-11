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
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from starlette.testclient import TestClient

from app.core.database import Base, get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models.user import User, UserRole

_DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://opengauge_user:opengauge_password@db:5432/opengauge_db",
)

_engine = create_engine(_DB_URL)


@pytest.fixture(scope="session", autouse=True)
def _ensure_schema() -> None:
    """Create all tables once per test session (idempotent)."""
    Base.metadata.create_all(bind=_engine)


@pytest.fixture()
def db() -> Session:
    """
    Function-scoped database session.

    Wraps each test in an outer transaction that is rolled back when the test
    finishes, so test data never touches the real database.
    """
    connection = _engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection)
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
        is_superuser=False,
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
