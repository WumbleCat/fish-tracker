"""Vercel Python entrypoint: exposes the FastAPI ASGI app. vercel.json
rewrites every path here, and the app's own /api/... routes take over."""

from app.main import app

__all__ = ["app"]
