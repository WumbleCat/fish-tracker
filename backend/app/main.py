from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import get_settings
from app.errors import AppError
from app.routes import auth, entries, games, users

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
    return {"status": "ok"}
