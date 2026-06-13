from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from socketio import ASGIApp
from prometheus_fastapi_instrumentator import Instrumentator

from config import settings
from db.database import engine, Base
from observability.logging import configure_logging
from observability.metrics import active_sessions_gauge
from services.storage_service import ensure_bucket

from api.auth import router as auth_router
from api.sessions import router as sessions_router
from api.chat import router as chat_router
from api.files import router as files_router
from api.recordings import router as recordings_router
from api.admin import router as admin_router
from sockets.events import sio

configure_logging()

# ── FastAPI app ────────────────────────────────────────────────────────────

app = FastAPI(
    title="AtomQuest Video Support Platform",
    version="1.0.0",
    docs_url="/docs",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[settings.FRONTEND_URL, "*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Routers ────────────────────────────────────────────────────────────────

app.include_router(auth_router)
app.include_router(sessions_router)
app.include_router(chat_router)
app.include_router(files_router)
app.include_router(recordings_router)
app.include_router(admin_router)

# ── Prometheus ─────────────────────────────────────────────────────────────

Instrumentator().instrument(app).expose(app, endpoint="/metrics")

# ── Startup ────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    ensure_bucket()


@app.get("/health")
async def health():
    return {"status": "ok", "version": "1.0.0"}


# ── Mount Socket.IO ────────────────────────────────────────────────────────
# Socket.IO takes over ASGI — wrap the FastAPI app

socket_app = ASGIApp(sio, other_asgi_app=app)
