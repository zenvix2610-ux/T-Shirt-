from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = BASE_DIR / "uploads"


class Settings(BaseSettings):
    env: str = "development"
    secret_key: str = "dev-only-change-me-thigazh-drifts"
    database_url: str = ""
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    admin_email: str = "admin@thigazhdrifts.com"
    admin_password: str = ""
    admin_name: str = "Store Admin"
    hash_iterations: int = 200_000
    google_service_account_file: str = ""
    google_sheet_id: str = ""
    sync_webhook_secret: str = ""
    cloudinary_url: str = ""
    razorpay_key_id: str = ""
    razorpay_key_secret: str = ""
    razorpay_webhook_secret: str = ""

    model_config = SettingsConfigDict(env_file=str(BASE_DIR / ".env"), extra="ignore")

    @property
    def sqlalchemy_url(self) -> str:
        if self.database_url:
            return self.database_url
        DATA_DIR.mkdir(parents=True, exist_ok=True)
        return "sqlite:///" + (DATA_DIR / "store.db").resolve().as_posix()

    @property
    def is_dev(self) -> bool:
        return self.env.lower() in {"development", "dev", "test"}

    @property
    def razorpay_ready(self) -> bool:
        return bool(self.razorpay_key_id and self.razorpay_key_secret)


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if not settings.is_dev and settings.secret_key.startswith("dev-only"):
        raise RuntimeError("Set SECRET_KEY before running outside development.")
    return settings
