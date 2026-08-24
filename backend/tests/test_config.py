"""The Supabase<->Vercel integration injects postgres:// URLs with query
params psycopg refuses; normalization must produce a clean psycopg URL and
keep TLS for hosted connections."""

from app.config import DEV_JWT_SECRET, Settings, normalize_pg_url


def test_integration_url_is_normalized_for_psycopg():
    url = (
        "postgres://postgres.ref:pw@aws-0-eu-west-2.pooler.supabase.com:6543/"
        "postgres?supa=base-pooler.x&sslmode=require"
    )
    assert normalize_pg_url(url) == (
        "postgresql+psycopg://postgres.ref:pw@aws-0-eu-west-2.pooler.supabase.com:6543/"
        "postgres?sslmode=require"
    )


def test_plain_postgresql_scheme_gains_driver_and_ssl():
    assert normalize_pg_url("postgresql://u:p@db.example.com:5432/postgres") == (
        "postgresql+psycopg://u:p@db.example.com:5432/postgres?sslmode=require"
    )


def test_local_url_stays_plain():
    local = "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    assert normalize_pg_url(local) == local


def test_non_postgres_url_untouched():
    assert normalize_pg_url("sqlite:///nope.db") == "sqlite:///nope.db"


def test_hs256_disabled_only_in_production_with_dev_secret(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    assert Settings(supabase_jwt_secret=DEV_JWT_SECRET).hs256_available is True

    monkeypatch.setenv("VERCEL", "1")
    assert Settings(supabase_jwt_secret=DEV_JWT_SECRET).hs256_available is False
    assert Settings(supabase_jwt_secret="a-real-secret-of-decent-length!!").hs256_available is True


def test_postgres_url_fallback_applies_when_database_url_is_local(monkeypatch):
    monkeypatch.setenv(
        "POSTGRES_URL",
        "postgres://postgres.ref:pw@aws-0-x.pooler.supabase.com:6543/postgres?supa=y",
    )
    s = Settings(
        database_url="postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
    )
    assert s.database_url.startswith(
        "postgresql+psycopg://postgres.ref:pw@aws-0-x.pooler.supabase.com:6543/postgres"
    )
    assert s.database_url.endswith("sslmode=require")
