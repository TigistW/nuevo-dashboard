from pathlib import Path

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, sessionmaker

from .config import settings


def _resolve_database_url(raw_url: str) -> str:
    if not raw_url.startswith("sqlite:///"):
        return raw_url

    raw_path = raw_url.replace("sqlite:///", "", 1)
    if raw_path.startswith("./"):
        repo_root = Path(__file__).resolve().parent.parent
        db_path = (repo_root / raw_path).resolve()
    else:
        db_path = Path(raw_path).resolve()

    db_path.parent.mkdir(parents=True, exist_ok=True)
    return f"sqlite:///{db_path.as_posix()}"


DATABASE_URL = _resolve_database_url(settings.database_url)


class Base(DeclarativeBase):
    pass


connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}
engine = create_engine(DATABASE_URL, future=True, connect_args=connect_args)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)


def init_db() -> None:
    from . import db_models  # noqa: F401

    Base.metadata.create_all(bind=engine)
    _run_sqlite_compat_migrations()


def _run_sqlite_compat_migrations() -> None:
    if not DATABASE_URL.startswith("sqlite"):
        return

    with engine.begin() as conn:
        table_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='scheduler_jobs'")
        ).first()
        if not table_exists:
            return

        columns = conn.execute(text("PRAGMA table_info('scheduler_jobs')")).mappings().all()
        existing_names = {str(column["name"]) for column in columns}

        if "retry_count" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0"))
        if "error_message" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN error_message TEXT"))
