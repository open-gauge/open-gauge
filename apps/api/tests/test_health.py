from starlette.testclient import TestClient

from app.main import app


def test_health_returns_ok() -> None:
    client = TestClient(app, raise_server_exceptions=True)
    response = client.get("/health")
    assert response.status_code == 200
    body = response.json()
    assert body["status"] == "ok"
    assert body["service"] == "MAR API"
