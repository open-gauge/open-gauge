from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    app_name: str = "MAR API"
    secret_key: str = "change-this-secret-key-in-production"
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 60 * 24 * 7  # 7 days

    database_url: str = "postgresql://mar_user:mar_password@db:5432/mar_db"

    cors_origins: list[str] = ["http://localhost:3000", "http://localhost"]

    class Config:
        env_file = ".env"


settings = Settings()
