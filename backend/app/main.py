import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.config import get_settings
from app.db import get_engine
from app.errors import AppError
from app.routes import auth, entries, games, users

logger = logging.getLogger(__name__)

app = FastAPI(title="fish-tracker", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=get_settings().cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(AppError)
async def app_error_handler(request: Request, exc: AppError) -> JSONResponse:
    return JSONResponse(
        status_code=exc.status, content={"error": exc.code, "detail": exc.detail}
    )


app.include_router(auth.router)
app.include_router(games.router)
app.include_router(entries.router)
app.include_router(users.router)


@app.get("/api/health")
def health():
    """Liveness plus a real database round-trip — "status ok, db unavailable"
    is the diagnosis that otherwise takes a log dive to reach. The response
    carries a verdict only; connection details stay in the server log."""
    db = "ok"
    try:
        with get_engine().connect() as conn:
            conn.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("health: db unavailable: %s: %s", type(exc).__name__, exc)
        db = "unavailable"
    return {"status": "ok", "db": db}
