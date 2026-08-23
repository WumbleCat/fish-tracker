"""Fixtures run against real Postgres (the local supabase stack), never
SQLite — the partial unique index, CHECK constraints and triggers are exactly
what's under test. `npx supabase db reset` gives a clean starting schema.
"""

import os
import uuid
from datetime import datetime, timedelta, timezone

import jwt
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import text

os.environ.setdefault(
    "DATABASE_URL", "postgresql+psycopg://postgres:postgres@127.0.0.1:54322/postgres"
)
os.environ.setdefault(
    "SUPABASE_JWT_SECRET",
    "super-secret-jwt-token-with-at-least-32-characters-long",
)

from app.config import get_settings  # noqa: E402
from app.db import get_engine  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(scope="session")
def engine():
    return get_engine()


@pytest.fixture(autouse=True)
def clean_db(engine):
    # TRUNCATE fires no row-level triggers, so the ledger's no-delete guard
    # doesn't apply — this is test hygiene on a local stack, not the product.
    with engine.begin() as conn:
        conn.execute(
            text(
                "truncate table public.entries, public.settlements, "
                "public.adjustments, public.game_members, public.payout_details, "
                "public.games, public.users cascade"
            )
        )
        conn.execute(text("delete from auth.identities"))
        conn.execute(text("delete from auth.users"))
    yield


@pytest.fixture
def client():
    return TestClient(app, raise_server_exceptions=True)


@pytest.fixture
def make_registered(engine):
    """Insert an auth.users row (firing the on_auth_user_created trigger) and
    mint an access token the way Supabase Auth would."""

    def _make(email: str, display_name: str | None = None):
        auth_id = uuid.uuid4()
        meta = f'{{"display_name": "{display_name}"}}' if display_name else "{}"
        with engine.begin() as conn:
            conn.execute(
                text(
                    "insert into auth.users (id, aud, role, email, raw_user_meta_data) "
                    "values (:id, 'authenticated', 'authenticated', :email, cast(:meta as jsonb))"
                ),
                {"id": str(auth_id), "email": email, "meta": meta},
            )
            user_id = conn.execute(
                text("select id from public.users where auth_user_id = :a"),
                {"a": str(auth_id)},
            ).scalar_one()
        token = jwt.encode(
            {
                "sub": str(auth_id),
                "aud": "authenticated",
                "role": "authenticated",
                "email": email,
                "exp": datetime.now(timezone.utc) + timedelta(hours=1),
            },
            get_settings().supabase_jwt_secret,
            algorithm="HS256",
        )
        return {"auth_id": auth_id, "user_id": user_id, "token": token, "email": email}

    return _make
