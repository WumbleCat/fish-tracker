"""The Supabase<->Vercel integration injects postgres:// URLs with query
params psycopg refuses; normalization must produce a clean psycopg URL and
keep TLS for hosted connections."""

from sqlalchemy.engine import URL, make_url

from app.config import (
    DEV_JWT_SECRET,
    Settings,
    describe_pg_url,
    engine_url,
    normalize_pg_url,
    split_pg_url,
)


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


def test_raw_password_with_specials_is_percent_encoded():
    # the integration injects the password raw; @ ? # break URL parsing
    url = "postgres://user:p@ss w0rd?#@db.example.com:5432/postgres?supa=x"
    result = normalize_pg_url(url)
    assert result == (
        "postgresql+psycopg://user:p%40ss%20w0rd%3F%23@db.example.com:5432/"
        "postgres?sslmode=require"
    )
    make_url(result)  # must parse — this is what create_engine does


def test_raw_password_with_only_at_sign_is_caught():
    # parses without error — but with half the password swallowed into the
    # host — so failure-to-parse alone is not the trigger
    url = "postgres://user:pa@ss@db.example.com:5432/postgres"
    assert normalize_pg_url(url) == (
        "postgresql+psycopg://user:pa%40ss@db.example.com:5432/postgres?sslmode=require"
    )


def test_already_encoded_password_is_not_double_encoded():
    url = "postgres://user:p%40ss@db.example.com:5432/postgres"
    assert normalize_pg_url(url) == (
        "postgresql+psycopg://user:p%40ss@db.example.com:5432/postgres?sslmode=require"
    )


def test_surrounding_whitespace_and_quotes_are_stripped():
    url = ' "postgres://u:p@db.example.com:5432/postgres" '
    assert normalize_pg_url(url) == (
        "postgresql+psycopg://u:p@db.example.com:5432/postgres?sslmode=require"
    )


def test_hs256_disabled_only_in_production_with_dev_secret(monkeypatch):
    monkeypatch.delenv("VERCEL", raising=False)
    assert Settings(supabase_jwt_secret=DEV_JWT_SECRET).hs256_available is True

    monkeypatch.setenv("VERCEL", "1")
    assert Settings(supabase_jwt_secret=DEV_JWT_SECRET).hs256_available is False
    assert Settings(supabase_jwt_secret="a-real-secret-of-decent-length!!").hs256_available is True


def test_engine_url_carries_raw_password_untouched():
    # the engine consumes components, never a re-parsed string — any
    # password survives verbatim
    nasty = "p@ss w0rd?#/%:"
    u = engine_url(f"postgres://user:{nasty}@db.example.com:6543/postgres?supa=x")
    assert isinstance(u, URL)
    assert u.password == nasty
    assert u.username == "user"
    assert u.host == "db.example.com"
    assert u.port == 6543
    assert u.database == "postgres"
    assert u.query == {"sslmode": "require"}


def test_engine_url_decodes_already_encoded_password():
    u = engine_url("postgres://user:p%40ss@db.example.com:5432/postgres")
    assert isinstance(u, URL)
    assert u.password == "p@ss"


def test_engine_url_local_skips_ssl_and_non_pg_passes_through():
    u = engine_url("postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres")
    assert isinstance(u, URL)
    assert u.query == {}
    assert engine_url("sqlite:///nope.db") == "sqlite:///nope.db"


def test_describe_pg_url_never_contains_the_password():
    described = describe_pg_url("postgres://user:hunter2@db.example.com:5432/postgres")
    assert "hunter2" not in described
    assert "password_len=7" in described
    assert "host=db.example.com" in described
    # an unrecognized value (a mispasted secret, say) is not echoed back
    assert "sbp_secret" not in describe_pg_url("sbp_secret_value_here")


def test_split_pg_url_handles_missing_credentials():
    parts = split_pg_url("postgres://db.example.com:5432/postgres")
    assert parts["username"] is None and parts["password"] is None
    assert parts["host"] == "db.example.com"


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
    assert s.database_url_source == "POSTGRES_URL"


def test_postgres_url_fallback_applies_when_database_url_is_not_a_url(monkeypatch):
    # seen live: DATABASE_URL set to a bare 20-char non-URL value
    monkeypatch.setenv(
        "POSTGRES_URL",
        "postgres://postgres.ref:pw@aws-0-x.pooler.supabase.com:6543/postgres",
    )
    s = Settings(database_url="just-a-password-1234")
    assert s.database_url_source == "POSTGRES_URL"
    assert "pooler.supabase.com" in s.database_url


def test_real_database_url_is_not_overridden(monkeypatch):
    monkeypatch.setenv("POSTGRES_URL", "postgres://x:y@other.example.com:6543/postgres")
    s = Settings(database_url="postgres://u:p@db.example.com:5432/postgres")
    assert "db.example.com" in s.database_url
    assert s.database_url_source == "DATABASE_URL/default"
