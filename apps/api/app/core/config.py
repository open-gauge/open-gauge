from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "Open Gauge API"
    # Single source of truth for the backend's version. Keep in sync with
    # apps/web/package.json's "version" field — see the Versioning section in
    # AGENTS.md and VERSIONS.md at the repo root for the policy.
    app_version: str = "1.2.0"
    secret_key: str = "change-this-secret-key-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    database_url: str = "postgresql://opengauge_user:opengauge_password@db:5432/opengauge_db"

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost"]

    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "opengauge_admin"
    minio_secret_key: str = "opengauge_password_secret"
    minio_bucket: str = "opengauge-files"
    minio_secure: bool = False
    minio_public_url: str = "http://localhost:9000"

    frontend_url: str = "http://localhost:3000"

    class Config:
        env_file = ".env"


settings = Settings()
