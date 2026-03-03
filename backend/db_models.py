from datetime import datetime

from sqlalchemy import Boolean, DateTime, Float, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from .database import Base


class MicroVMEntity(Base):
    __tablename__ = "micro_vms"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    country: Mapped[str] = mapped_column(String(64), nullable=False)
    ram_mb: Mapped[int] = mapped_column(Integer, nullable=False)
    cpu_cores: Mapped[int] = mapped_column(Integer, nullable=False)
    template_id: Mapped[str] = mapped_column(String(64), nullable=False)
    public_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="creating", nullable=False, index=True)
    uptime_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    exit_node: Mapped[str | None] = mapped_column(String(64), nullable=True)
    verification_status: Mapped[str] = mapped_column(String(32), default="Secure", nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    network_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class TunnelEntity(Base):
    __tablename__ = "tunnels"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    country: Mapped[str] = mapped_column(String(64), nullable=False)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(32), default="Disconnected", nullable=False, index=True)
    public_ip: Mapped[str | None] = mapped_column(String(64), nullable=True)
    vm_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class IdentityEntity(Base):
    __tablename__ = "identities"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vm_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    public_ip: Mapped[str] = mapped_column(String(64), nullable=False)
    isp: Mapped[str] = mapped_column(String(128), nullable=False)
    asn: Mapped[str] = mapped_column(String(64), nullable=False)
    ip_type: Mapped[str] = mapped_column(String(32), nullable=False)
    country: Mapped[str] = mapped_column(String(64), nullable=False)
    city: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), nullable=False)
    last_check: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    trust_score: Mapped[int] = mapped_column(Integer, default=100, nullable=False)


class HealingRuleEntity(Base):
    __tablename__ = "healing_rules"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    trigger: Mapped[str] = mapped_column(String(128), nullable=False)
    action: Mapped[str] = mapped_column(String(128), nullable=False)
    enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class TemplateEntity(Base):
    __tablename__ = "templates"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    version: Mapped[str] = mapped_column(String(32), nullable=False)
    base_image: Mapped[str] = mapped_column(String(256), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class GuardrailsEntity(Base):
    __tablename__ = "guardrails"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    max_vms: Mapped[int] = mapped_column(Integer, nullable=False)
    min_host_ram_mb: Mapped[int] = mapped_column(Integer, nullable=False)
    max_cpu_per_vm: Mapped[int] = mapped_column(Integer, nullable=False)
    overload_prevention: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class SystemControlStateEntity(Base):
    __tablename__ = "system_control_state"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    protective_mode: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    failsafe_active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    cooldown_until: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    last_reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class SchedulerJobEntity(Base):
    __tablename__ = "scheduler_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    vm_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    priority: Mapped[str] = mapped_column(String(16), default="medium", nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(32), default="Queued", nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    max_retries: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    dead_letter: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False, index=True)
    next_attempt_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    schedule_window_start_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    schedule_window_end_hour: Mapped[int | None] = mapped_column(Integer, nullable=True)
    timezone_offset_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    jitter_seconds: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    recurrence_minutes: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class RepositoryEntity(Base):
    __tablename__ = "repositories"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    url: Mapped[str] = mapped_column(String(512), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="active", nullable=False)
    last_sync: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    api_endpoint: Mapped[str] = mapped_column(String(256), nullable=False, unique=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class SystemLogEntity(Base):
    __tablename__ = "system_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    level: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)


class OperationEntity(Base):
    __tablename__ = "operations"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    resource_type: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    resource_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    operation: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), default="pending", nullable=False, index=True)
    message: Mapped[str | None] = mapped_column(Text, nullable=True)
    requested_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class VerificationRequestEntity(Base):
    __tablename__ = "verification_requests"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    vm_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    worker_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    verification_type: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), default="Pending", nullable=False, index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False)
    destination: Mapped[str] = mapped_column(String(128), nullable=False)
    retries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class CaptchaEventEntity(Base):
    __tablename__ = "captcha_events"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    vm_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    provider: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, index=True)
    source: Mapped[str] = mapped_column(String(128), nullable=False)
    score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class TelemetrySampleEntity(Base):
    __tablename__ = "telemetry_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String(16), nullable=False)
    uptime: Mapped[int] = mapped_column(Integer, nullable=False)
    stability: Mapped[int] = mapped_column(Integer, nullable=False)
    load: Mapped[int] = mapped_column(Integer, nullable=False)
    sampled_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class ThreatSampleEntity(Base):
    __tablename__ = "threat_samples"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    time_label: Mapped[str] = mapped_column(String(16), nullable=False)
    threats: Mapped[int] = mapped_column(Integer, nullable=False)
    sampled_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class NotebookSessionEntity(Base):
    __tablename__ = "notebook_sessions"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    vm_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    account_email: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="Active", nullable=False, index=True)
    gpu_assigned_gb: Mapped[float] = mapped_column(Float, default=12.0, nullable=False)
    gpu_usage_gb: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    ram_usage_gb: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    load_percent: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cycle_state: Mapped[str] = mapped_column(String(24), default="active", nullable=False)
    next_transition_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    session_expires_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    warning_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    restart_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    risk_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class GoogleAccountEntity(Base):
    __tablename__ = "google_accounts"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(256), nullable=False, unique=True, index=True)
    status: Mapped[str] = mapped_column(String(32), default="free", nullable=False, index=True)
    vm_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    risk_score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    warmup_state: Mapped[str] = mapped_column(String(32), default="idle", nullable=False)
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class AccountModeEntity(Base):
    __tablename__ = "account_mode"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    mode: Mapped[str] = mapped_column(String(24), default="one_to_one", nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class TunnelBenchmarkEntity(Base):
    __tablename__ = "tunnel_benchmarks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    protocol: Mapped[str] = mapped_column(String(32), nullable=False, index=True)
    latency_ms: Mapped[int] = mapped_column(Integer, nullable=False)
    stability_score: Mapped[int] = mapped_column(Integer, nullable=False)
    persistence_score: Mapped[int] = mapped_column(Integer, nullable=False)
    detection_score: Mapped[int] = mapped_column(Integer, nullable=False)
    throughput_mbps: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)


class IpHistoryEntity(Base):
    __tablename__ = "ip_history"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    ip: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    last_used_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False, index=True)
    account_email: Mapped[str | None] = mapped_column(String(256), nullable=True, index=True)
    associated_vm_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    negative_events: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    smtp_used: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reputation_score: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    restricted: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    discarded: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    last_event: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class FootprintActivityEntity(Base):
    __tablename__ = "footprint_activities"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    vm_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    account_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    activity_type: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(24), default="Scheduled", nullable=False, index=True)
    details: Mapped[str | None] = mapped_column(Text, nullable=True)
    timezone_offset_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True, index=True)
    executed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class SMTPTaskEntity(Base):
    __tablename__ = "smtp_tasks"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    vm_id: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    status: Mapped[str] = mapped_column(String(24), default="Queued", nullable=False, index=True)
    implementation: Mapped[str] = mapped_column(String(32), default="postfix", nullable=False)
    domain: Mapped[str] = mapped_column(String(128), nullable=False)
    sender: Mapped[str] = mapped_column(String(256), nullable=False)
    recipients_count: Mapped[int] = mapped_column(Integer, nullable=False)
    success_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    failure_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    ip_used: Mapped[str | None] = mapped_column(String(64), nullable=True)
    spf_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dkim_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dmarc_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    rdns_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    tls_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)


class N8nRoleEntity(Base):
    __tablename__ = "n8n_role_config"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, default=1)
    role: Mapped[str] = mapped_column(String(32), default="secondary_automation", nullable=False)
    notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class N8nWorkflowEntity(Base):
    __tablename__ = "n8n_workflows"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)
    name: Mapped[str] = mapped_column(String(256), nullable=False)
    source: Mapped[str] = mapped_column(String(128), nullable=False, default="manual")
    active: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    version_hash: Mapped[str] = mapped_column(String(128), nullable=False)
    definition_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )


class N8nRunEntity(Base):
    __tablename__ = "n8n_runs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    workflow_id: Mapped[str] = mapped_column(String(128), nullable=False, index=True)
    external_execution_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    trigger: Mapped[str] = mapped_column(String(64), nullable=False, default="manual")
    status: Mapped[str] = mapped_column(String(32), nullable=False, default="running", index=True)
    context_json: Mapped[str] = mapped_column(Text, nullable=False, default="{}")
    events_json: Mapped[str] = mapped_column(Text, nullable=False, default="[]")
    last_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=datetime.utcnow, onupdate=datetime.utcnow, nullable=False
    )
