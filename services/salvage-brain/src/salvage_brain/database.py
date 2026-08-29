"""SQLAlchemy engine and session factory."""

from __future__ import annotations

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from salvage_brain.config import settings

engine = create_engine(
    settings.postgres_dsn,
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
    # Recycle below the typical one-hour idle timeout on managed PostgreSQL so
    # a pooled connection is never handed out after the server has dropped it.
    pool_recycle=1800,
    # Every Salvage object lives in the `salvage` schema; setting the search
    # path once per connection keeps it out of every query.
    connect_args={"options": "-c search_path=salvage,public"},
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
