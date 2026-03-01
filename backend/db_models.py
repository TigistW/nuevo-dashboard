from datetime import datetime

from sqlalchemy import Boolean, DateTime, Integer, String, Text
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


class SchedulerJobEntity(Base):
    __tablename__ = "scheduler_jobs"

    id: Mapped[str] = mapped_column(String(64), primary_key=True)
    task_type: Mapped[str] = mapped_column(String(64), nullable=False)
    vm_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    status: Mapped[str] = mapped_column(String(32), default="Queued", nullable=False, index=True)
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    retry_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)
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
