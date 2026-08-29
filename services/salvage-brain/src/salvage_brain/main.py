"""FastAPI application factory for salvage-brain."""

from fastapi import FastAPI

from salvage_brain import __version__
from salvage_brain.health import router as health_router


def create_app() -> FastAPI:
    app = FastAPI(
        title="Salvage Brain",
        version=__version__,
        description=(
            "Decision service for Salvage. This service never moves money. "
            "It returns a recommended action and its reasoning."
        ),
    )
    app.include_router(health_router)
    return app


app = create_app()
