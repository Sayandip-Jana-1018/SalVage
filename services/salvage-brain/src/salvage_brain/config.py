"""Application configuration via pydantic-settings.

Every setting has a default that works for local development against the
docker-compose stack. In production, override via environment variables.
"""

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    """Salvage Brain configuration."""

    # ---- postgres ----------------------------------------------------------
    postgres_host: str = "127.0.0.1"
    postgres_port: int = 5433
    postgres_db: str = "salvage"
    postgres_user: str = "salvage"
    postgres_password: str = "salvage_local_dev_only"

    # ---- redis -------------------------------------------------------------
    redis_host: str = "localhost"
    redis_port: int = 6379

    # ---- kafka -------------------------------------------------------------
    kafka_bootstrap_servers: str = "localhost:19092"

    # ---- app ---------------------------------------------------------------
    brain_port: int = 8000
    log_level: str = "INFO"

    @property
    def postgres_dsn(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    model_config = {"env_prefix": "", "case_sensitive": False}


# Module-level singleton. Imported by other modules; overridden in tests.
settings = Settings()
