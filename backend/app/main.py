from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import UPLOAD_DIR, get_settings
from .database import SessionLocal, init_db
from .routers import auth
from .routers import account
from .routers import admin
from .routers import store
from .routers import integrations
from .seed import seed

settings = get_settings()


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    with SessionLocal() as db:
        seed(db)
    yield


app = FastAPI(
    title="தமிழ் Drifts API",
    description="Shared commerce API for the தமிழ் Drifts website and mobile application.",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in settings.cors_origins.split(",") if origin.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router, prefix="/api")
app.include_router(account.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
app.include_router(integrations.router, prefix="/api")
app.include_router(store.router, prefix="/api")

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


@app.get("/")
def root():
    return {"name": "தமிழ் Drifts API", "docs": "/docs", "health": "/api/health"}
