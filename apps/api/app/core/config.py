from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "MAR API"
    secret_key: str = "change-this-secret-key-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    database_url: str = "postgresql://mar_user:mar_password@db:5432/mar_db"

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost"]

    minio_endpoint: str = "minio:9000"
    minio_access_key: str = "mar_admin"
    minio_secret_key: str = "mar_password_secret"
    minio_bucket: str = "mar-files"
    minio_secure: bool = False
    minio_public_url: str = "http://localhost:9000"

    class Config:
        env_file = ".env"


settings = Settings()
