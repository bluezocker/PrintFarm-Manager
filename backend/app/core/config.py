from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Datenbank
    DATABASE_URL: str = "postgresql://printfarm:changeme_in_production@db:5432/printfarm"

    # JWT
    SECRET_KEY: str = "please_change_this_secret_key_to_something_random"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 480

    # Bambu Lab
    BAMBU_CLOUD_EMAIL: str = ""
    BAMBU_CLOUD_PASSWORD: str = ""

    # Tuya
    TUYA_ACCESS_ID: str = ""
    TUYA_ACCESS_SECRET: str = ""
    TUYA_API_ENDPOINT: str = "https://openapi.tuyaeu.com"

    # Uploads
    UPLOAD_DIR: str = "/app/uploads"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
