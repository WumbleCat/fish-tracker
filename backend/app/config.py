from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = "http://127.0.0.1:54321"
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = (
        "super-secret-jwt-token-with-at-least-32-characters-long"
    )
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081"
    guest_token_ttl_hours: int = 48

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
