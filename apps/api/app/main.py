from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from .api.v1 import auth as auth_router
from .api.v1 import dashboard as dashboard_router
from .api.v1 import organizations as org_router
from .api.v1 import locations as location_router
from .api.v1 import assets as asset_router
from .api.v1 import calibrations as cal_router
from .api.v1 import procedures as procedure_router
from .api.v1 import audit_logs as log_router
from .api.v1 import users as user_router
from .api.v1 import teams as team_router
from .api.v1 import admin as admin_router
from .core.config import settings
from .core.database import SessionLocal
from .seeds.seed import seed_database


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    with SessionLocal() as db:
        seed_database(db)
    yield


OPENAPI_TAGS = [
    {"name": "Auth", "description": "Login, session, and token management."},
    {"name": "Dashboard", "description": "Aggregate KPIs and summaries for the dashboard home screen."},
    {"name": "Organizations", "description": "Tenant root records."},
    {"name": "Locations", "description": "Hierarchical site/building/lab location tree."},
    {"name": "Assets", "description": "The instrumentation asset registry (sensors and DAQs)."},
    {"name": "Calibrations", "description": "Calibration analysis, records, points, and certificates."},
    {"name": "Procedures", "description": "Reusable calibration procedure templates."},
    {"name": "Audit Logs", "description": "Immutable record of significant state changes."},
    {"name": "Users", "description": "User accounts and profiles."},
    {"name": "Teams", "description": "Teams within an organization, used for asset ownership."},
    {"name": "Admin", "description": "Organization- and system-level administration."},
    {"name": "Health", "description": "Service liveness check."},
]

app = FastAPI(
    title=settings.app_name,
    description="Open Gauge API",
    version="0.1.0",
    lifespan=lifespan,
    openapi_tags=OPENAPI_TAGS,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router, prefix="/api/v1")
app.include_router(dashboard_router.router, prefix="/api/v1")
app.include_router(org_router.router, prefix="/api/v1")
app.include_router(location_router.router, prefix="/api/v1")
app.include_router(asset_router.router, prefix="/api/v1")
app.include_router(cal_router.router, prefix="/api/v1")
app.include_router(procedure_router.router, prefix="/api/v1")
app.include_router(log_router.router, prefix="/api/v1")
app.include_router(user_router.router, prefix="/api/v1")
app.include_router(team_router.router, prefix="/api/v1")
app.include_router(admin_router.router, prefix="/api/v1")


@app.get("/health", tags=["Health"])
def health_check() -> JSONResponse:
    return JSONResponse(content={"status": "ok", "service": "Open Gauge API"})
