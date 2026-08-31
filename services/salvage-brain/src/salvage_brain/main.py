"""FastAPI application factory for salvage-brain."""

from __future__ import annotations

import logging
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager

from fastapi import FastAPI

from salvage_brain import __version__
from salvage_brain.attempts import router as attempts_router
from salvage_brain.auth import verify_startup_configuration
from salvage_brain.config import settings
from salvage_brain.database import engine
from salvage_brain.diagnosis.routes import router as diagnosis_router
from salvage_brain.health import router as health_router
from salvage_brain.language.routes import router as language_router
from salvage_brain.policy.routes import router as policy_router
from salvage_brain.sensing.routes import router as sensing_router


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncGenerator[None]:
    logging.basicConfig(
        level=settings.log_level,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
    )

    # Before the first request is served, and here rather than in create_app()
    # because refusing to *start* is the behaviour wanted -- refusing to be
    # *constructed* also makes the module unimportable, which breaks every tool
    # that reads the OpenAPI schema without intending to run anything.
    #
    # Raising here is what uvicorn turns into "Application startup failed.
    # Exiting." A service whose key configuration is empty does not serve.
    verify_startup_configuration()
    if not settings.salvage_auth_required:
        logging.getLogger(__name__).warning(
            "SALVAGE_AUTH_REQUIRED is false: every endpoint on this service will answer "
            "any caller, for any tenant. This is intended only for local development."
        )

    yield
    # Returning connections to PostgreSQL on shutdown rather than leaving the
    # server to time them out keeps a rolling restart from exhausting
    # max_connections.
    engine.dispose()


def create_app() -> FastAPI:
    app = FastAPI(
        title="Salvage Brain",
        version=__version__,
        description=(
            "Decision service for Salvage. This service never moves money. "
            "It returns a recommended action and its reasoning."
        ),
        lifespan=lifespan,
    )
    app.include_router(health_router)
    app.include_router(attempts_router)
    app.include_router(diagnosis_router)
    app.include_router(language_router)
    app.include_router(policy_router)
    app.include_router(sensing_router)
    return app


app = create_app()
