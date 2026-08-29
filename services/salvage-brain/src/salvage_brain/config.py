"""Application configuration.

Defaults target the docker-compose stack on localhost. Every value is
overridable by environment variable; the process also reads a `.env` file at
the repository root if one is present, so `cp .env.example .env` actually
affects this service rather than only affecting docker-compose.
"""

from __future__ import annotations

from pathlib import Path

from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


def _find_dotenv() -> Path | None:
    """Walk upward from this file looking for a `.env`.

    Deliberately not a fixed number of `.parents[...]` hops. The source sits at
    a different depth in the container (`/app/src/salvage_brain/`) than in the
    repository (`services/salvage-brain/src/salvage_brain/`), and hardcoding
    the repository's depth crashed the container at import time with
    ``IndexError`` -- before any health check could report why.

    Returns None when there is no `.env` anywhere above, which is the normal
    case in a container: configuration arrives as environment variables.
    """
    for directory in Path(__file__).resolve().parents:
        candidate = directory / ".env"
        if candidate.is_file():
            return candidate
    return None


_DOTENV = _find_dotenv()


class Settings(BaseSettings):
    """Salvage Brain configuration."""

    model_config = SettingsConfigDict(
        env_file=_DOTENV,
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- postgres ----------------------------------------------------------
    # 127.0.0.1 rather than "localhost" throughout: on hosts where localhost
    # resolves to ::1 first, a service listening only on IPv4 gives a
    # connection refused that looks like the service being down.
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5433
    postgres_db: str = "salvage"
    postgres_user: str = "salvage"
    postgres_password: SecretStr = SecretStr("salvage_local_dev_only")

    # ---- redis -------------------------------------------------------------
    redis_host: str = "127.0.0.1"
    redis_port: int = 6379
    redis_timeout_seconds: float = 3.0

    # ---- kafka -------------------------------------------------------------
    kafka_bootstrap_servers: str = "127.0.0.1:19092"
    kafka_timeout_seconds: float = 5.0

    # ---- app ---------------------------------------------------------------
    brain_port: int = 8000
    log_level: str = "INFO"

    @property
    def postgres_dsn(self) -> str:
        """SQLAlchemy URL.

        The password is stored as a ``SecretStr`` so that logging or repr-ing
        the settings object cannot spill it. It is unwrapped only here, at the
        point of use.
        """
        password = self.postgres_password.get_secret_value()
        return (
            f"postgresql+psycopg://{self.postgres_user}:{password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )


settings = Settings()
