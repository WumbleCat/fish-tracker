import os
from functools import lru_cache
from urllib.parse import quote

from pydantic import model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict
from sqlalchemy.engine import make_url
from sqlalchemy.exc import ArgumentError

# The local supabase-start secret. If production is still running on this
# publicly-known value, HS256 tokens are forgeable and must be refused.
DEV_JWT_SECRET = "super-secret-jwt-token-with-at-least-32-characters-long"


def normalize_pg_url(url: str) -> str:
    """Accept the connection strings the Supabase<->Vercel integration
    injects (postgres:// / postgresql://) and force the psycopg driver.
    Integration URLs carry query params psycopg refuses (e.g. supa=...),
    so the query is rebuilt: hosted connections keep sslmode=require.

    The injected credentials may be raw, not percent-encoded — a database
    password containing @ / ? / # produces a string SQLAlchemy's make_url
    refuses. Credentials are re-encoded only when the URL doesn't parse
    as-is, so an already-encoded password is never double-encoded."""
    url = url.strip().strip("'\"")
    stripped = None
    for prefix in ("postgresql+psycopg://", "postgresql://", "postgres://"):
        if url.startswith(prefix):
            stripped = url[len(prefix):]
            break
    if stripped is None:
        return url
    # split credentials at the LAST @ — a raw password may itself hold @
    creds, at, host_part = stripped.rpartition("@")
    host_part = host_part.split("?", 1)[0]
    is_local = host_part.startswith(("127.0.0.1", "localhost"))
    suffix = "" if is_local else "?sslmode=require"

    def build(cred_str: str) -> str:
        auth = cred_str + "@" if at else ""
        return "postgresql+psycopg://" + auth + host_part + suffix

    candidate = build(creds)
    # a raw password holding @ can still "parse" — with part of itself
    # swallowed into the host — so the parsed host must match too
    expected_host = host_part.split("/", 1)[0].rsplit(":", 1)[0]
    try:
        if not at or make_url(candidate).host == expected_host:
            return candidate
    except ArgumentError:
        pass
    user, colon, password = creds.partition(":")
    encoded = quote(user, safe="")
    if colon:
        encoded += ":" + quote(password, safe="")
    return build(encoded)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    supabase_url: str = "http://127.0.0.1:54321"
    supabase_service_role_key: str = ""
    supabase_jwt_secret: str = DEV_JWT_SECRET
    database_url: str = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    cors_origins: str = (
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost:8081,"
        "https://fish-tracker-web.vercel.app"
    )
    guest_token_ttl_hours: int = 48

    @model_validator(mode="after")
    def _apply_integration_fallbacks(self):
        # DATABASE_URL wins when set; otherwise the Supabase<->Vercel
        # integration's POSTGRES_URL (pooled) or POSTGRES_URL_NON_POOLING.
        if "127.0.0.1" in self.database_url or "localhost" in self.database_url:
            injected = os.environ.get("POSTGRES_URL") or os.environ.get(
                "POSTGRES_URL_NON_POOLING"
            )
            if injected:
                self.database_url = injected
        self.database_url = normalize_pg_url(self.database_url)
        if not self.supabase_service_role_key:
            self.supabase_service_role_key = os.environ.get("SUPABASE_SECRET_KEY", "")
        return self

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    @property
    def hs256_available(self) -> bool:
        """HS256 signs and verifies guest tokens with the shared JWT secret.
        In production, running on the dev default would make every HS256
        token forgeable — so the whole scheme is disabled until the real
        SUPABASE_JWT_SECRET is configured. Registered users are unaffected
        (their tokens verify via the project JWKS)."""
        if self.supabase_jwt_secret != DEV_JWT_SECRET:
            return True
        return not os.environ.get("VERCEL")


@lru_cache
def get_settings() -> Settings:
    return Settings()
