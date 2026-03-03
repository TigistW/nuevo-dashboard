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
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS system_control_state (
                    id INTEGER PRIMARY KEY,
                    protective_mode BOOLEAN NOT NULL DEFAULT 0,
                    failsafe_active BOOLEAN NOT NULL DEFAULT 0,
                    cooldown_until DATETIME NULL,
                    last_reason TEXT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT OR IGNORE INTO system_control_state
                (id, protective_mode, failsafe_active, cooldown_until, last_reason, updated_at)
                VALUES (1, 0, 0, NULL, NULL, CURRENT_TIMESTAMP)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS account_mode (
                    id INTEGER PRIMARY KEY,
                    mode TEXT NOT NULL DEFAULT 'one_to_one',
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                INSERT OR IGNORE INTO account_mode (id, mode, updated_at)
                VALUES (1, 'one_to_one', CURRENT_TIMESTAMP)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS n8n_role_config (
                    id INTEGER PRIMARY KEY,
                    role TEXT NOT NULL DEFAULT 'secondary_automation',
                    notes TEXT NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS n8n_workflows (
                    id TEXT PRIMARY KEY,
                    name TEXT NOT NULL,
                    source TEXT NOT NULL DEFAULT 'manual',
                    active BOOLEAN NOT NULL DEFAULT 0,
                    version_hash TEXT NOT NULL,
                    definition_json TEXT NOT NULL DEFAULT '{}',
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS n8n_runs (
                    id TEXT PRIMARY KEY,
                    workflow_id TEXT NOT NULL,
                    external_execution_id TEXT NULL,
                    trigger TEXT NOT NULL DEFAULT 'manual',
                    status TEXT NOT NULL DEFAULT 'running',
                    context_json TEXT NOT NULL DEFAULT '{}',
                    events_json TEXT NOT NULL DEFAULT '[]',
                    last_message TEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    started_at DATETIME NULL,
                    finished_at DATETIME NULL,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_n8n_runs_workflow_id ON n8n_runs(workflow_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_n8n_runs_external_execution_id ON n8n_runs(external_execution_id)"
            )
        )
        conn.execute(
            text(
                "CREATE INDEX IF NOT EXISTS idx_n8n_runs_status ON n8n_runs(status)"
            )
        )
        conn.execute(
            text(
                """
                INSERT OR IGNORE INTO n8n_role_config (id, role, notes, updated_at)
                VALUES (1, 'secondary_automation', NULL, CURRENT_TIMESTAMP)
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS notebook_sessions (
                    id TEXT PRIMARY KEY,
                    vm_id TEXT NOT NULL,
                    account_email TEXT NULL,
                    notebook_url TEXT NULL,
                    status TEXT NOT NULL DEFAULT 'Active',
                    gpu_assigned_gb REAL NOT NULL DEFAULT 12.0,
                    gpu_usage_gb REAL NOT NULL DEFAULT 0.0,
                    ram_usage_gb REAL NOT NULL DEFAULT 0.0,
                    load_percent INTEGER NOT NULL DEFAULT 0,
                    cycle_state TEXT NOT NULL DEFAULT 'active',
                    next_transition_at DATETIME NULL,
                    session_expires_at DATETIME NULL,
                    warning_message TEXT NULL,
                    last_probe_at DATETIME NULL,
                    last_probe_message TEXT NULL,
                    restart_count INTEGER NOT NULL DEFAULT 0,
                    risk_score INTEGER NOT NULL DEFAULT 0,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS google_accounts (
                    id TEXT PRIMARY KEY,
                    email TEXT NOT NULL UNIQUE,
                    status TEXT NOT NULL DEFAULT 'free',
                    vm_id TEXT NULL,
                    risk_score INTEGER NOT NULL DEFAULT 0,
                    warmup_state TEXT NOT NULL DEFAULT 'idle',
                    last_used_at DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS tunnel_benchmarks (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    protocol TEXT NOT NULL,
                    latency_ms INTEGER NOT NULL,
                    stability_score INTEGER NOT NULL,
                    persistence_score INTEGER NOT NULL,
                    detection_score INTEGER NOT NULL,
                    throughput_mbps REAL NOT NULL,
                    notes TEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS ip_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    ip TEXT NOT NULL UNIQUE,
                    last_used_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    account_email TEXT NULL,
                    associated_vm_id TEXT NULL,
                    negative_events INTEGER NOT NULL DEFAULT 0,
                    smtp_used BOOLEAN NOT NULL DEFAULT 0,
                    reputation_score INTEGER NOT NULL DEFAULT 100,
                    restricted BOOLEAN NOT NULL DEFAULT 0,
                    discarded BOOLEAN NOT NULL DEFAULT 0,
                    last_event TEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS footprint_activities (
                    id TEXT PRIMARY KEY,
                    vm_id TEXT NOT NULL,
                    account_id TEXT NULL,
                    activity_type TEXT NOT NULL,
                    status TEXT NOT NULL DEFAULT 'Scheduled',
                    details TEXT NULL,
                    timezone_offset_minutes INTEGER NOT NULL DEFAULT 0,
                    scheduled_at DATETIME NULL,
                    executed_at DATETIME NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
                """
            )
        )
        conn.execute(
            text(
                """
                CREATE TABLE IF NOT EXISTS smtp_tasks (
                    id TEXT PRIMARY KEY,
                    vm_id TEXT NULL,
                    status TEXT NOT NULL DEFAULT 'Queued',
                    implementation TEXT NOT NULL DEFAULT 'postfix',
                    domain TEXT NOT NULL,
                    sender TEXT NOT NULL,
                    recipients_count INTEGER NOT NULL,
                    success_count INTEGER NOT NULL DEFAULT 0,
                    failure_count INTEGER NOT NULL DEFAULT 0,
                    ip_used TEXT NULL,
                    spf_enabled BOOLEAN NOT NULL DEFAULT 0,
                    dkim_enabled BOOLEAN NOT NULL DEFAULT 0,
                    dmarc_enabled BOOLEAN NOT NULL DEFAULT 0,
                    rdns_enabled BOOLEAN NOT NULL DEFAULT 0,
                    tls_enabled BOOLEAN NOT NULL DEFAULT 0,
                    error_message TEXT NULL,
                    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    completed_at DATETIME NULL
                )
                """
            )
        )

        vm_table_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='micro_vms'")
        ).first()
        if vm_table_exists:
            vm_columns = conn.execute(text("PRAGMA table_info('micro_vms')")).mappings().all()
            vm_column_names = {str(column["name"]) for column in vm_columns}
            if "risk_score" not in vm_column_names:
                conn.execute(text("ALTER TABLE micro_vms ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 0"))

        notebook_table_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='notebook_sessions'")
        ).first()
        if notebook_table_exists:
            notebook_columns = conn.execute(text("PRAGMA table_info('notebook_sessions')")).mappings().all()
            notebook_column_names = {str(column["name"]) for column in notebook_columns}
            if "notebook_url" not in notebook_column_names:
                conn.execute(text("ALTER TABLE notebook_sessions ADD COLUMN notebook_url TEXT"))
            if "last_probe_at" not in notebook_column_names:
                conn.execute(text("ALTER TABLE notebook_sessions ADD COLUMN last_probe_at DATETIME"))
            if "last_probe_message" not in notebook_column_names:
                conn.execute(text("ALTER TABLE notebook_sessions ADD COLUMN last_probe_message TEXT"))

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
        if "priority" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN priority TEXT NOT NULL DEFAULT 'medium'"))
        if "max_retries" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 3"))
        if "dead_letter" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN dead_letter BOOLEAN NOT NULL DEFAULT 0"))
        if "next_attempt_at" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN next_attempt_at DATETIME"))
        if "schedule_window_start_hour" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN schedule_window_start_hour INTEGER"))
        if "schedule_window_end_hour" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN schedule_window_end_hour INTEGER"))
        if "timezone_offset_minutes" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN timezone_offset_minutes INTEGER NOT NULL DEFAULT 0"))
        if "jitter_seconds" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN jitter_seconds INTEGER NOT NULL DEFAULT 0"))
        if "recurrence_minutes" not in existing_names:
            conn.execute(text("ALTER TABLE scheduler_jobs ADD COLUMN recurrence_minutes INTEGER"))

        n8n_workflows_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='n8n_workflows'")
        ).first()
        if n8n_workflows_exists:
            wf_columns = conn.execute(text("PRAGMA table_info('n8n_workflows')")).mappings().all()
            wf_names = {str(column["name"]) for column in wf_columns}
            if "version_hash" not in wf_names:
                conn.execute(text("ALTER TABLE n8n_workflows ADD COLUMN version_hash TEXT NOT NULL DEFAULT ''"))
            if "definition_json" not in wf_names:
                conn.execute(text("ALTER TABLE n8n_workflows ADD COLUMN definition_json TEXT NOT NULL DEFAULT '{}'"))

        n8n_runs_exists = conn.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='n8n_runs'")
        ).first()
        if n8n_runs_exists:
            run_columns = conn.execute(text("PRAGMA table_info('n8n_runs')")).mappings().all()
            run_names = {str(column["name"]) for column in run_columns}
            if "external_execution_id" not in run_names:
                conn.execute(text("ALTER TABLE n8n_runs ADD COLUMN external_execution_id TEXT"))
            if "events_json" not in run_names:
                conn.execute(text("ALTER TABLE n8n_runs ADD COLUMN events_json TEXT NOT NULL DEFAULT '[]'"))
            if "last_message" not in run_names:
                conn.execute(text("ALTER TABLE n8n_runs ADD COLUMN last_message TEXT"))
