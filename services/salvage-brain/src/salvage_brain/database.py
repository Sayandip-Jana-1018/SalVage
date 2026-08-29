"""SQLAlchemy engine and session factory."""

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from salvage_brain.config import settings

engine = create_engine(
    settings.postgres_dsn,
    pool_size=10,
    max_overflow=5,
    pool_pre_ping=True,
    connect_args={"options": "-c search_path=salvage,public"},
)

SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False)
