import os
from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.config import engine_url, get_settings

_engine = None
_session_factory = None


def get_engine():
    global _engine, _session_factory
    if _engine is None:
        kwargs = {}
        if os.environ.get("VERCEL"):
            # Serverless: no long-lived pool — connections go back to the
            # Supabase pooler immediately instead of idling in a frozen
            # function instance.
            kwargs["poolclass"] = NullPool
        # component-built URL: never re-parses the raw string, so an
        # un-encoded password can't break it
        _engine = create_engine(
            engine_url(get_settings().database_url),
            pool_pre_ping=True,
            # PgBouncer (Supabase's pooler) can't track psycopg's automatic
            # prepared statements across pooled connections.
            connect_args={"prepare_threshold": None},
            **kwargs,
        )
        _session_factory = sessionmaker(bind=_engine, expire_on_commit=False)
    return _engine


def get_session() -> Iterator[Session]:
    get_engine()
    session = _session_factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()
