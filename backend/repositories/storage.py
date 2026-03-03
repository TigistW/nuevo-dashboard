from __future__ import annotations

import json
from datetime import datetime, timedelta
from typing import Iterable
from uuid import uuid4

from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from ..db_models import (
    AccountModeEntity,
    CaptchaEventEntity,
    FootprintActivityEntity,
    GuardrailsEntity,
    GoogleAccountEntity,
    HealingRuleEntity,
    IdentityEntity,
    IpHistoryEntity,
    MicroVMEntity,
    N8nRoleEntity,
    N8nRunEntity,
    N8nWorkflowEntity,
    NotebookSessionEntity,
    OperationEntity,
    RepositoryEntity,
    SchedulerJobEntity,
    SMTPTaskEntity,
    SystemControlStateEntity,
    SystemLogEntity,
    TemplateEntity,
    TelemetrySampleEntity,
    ThreatSampleEntity,
    TunnelBenchmarkEntity,
    TunnelEntity,
    VerificationRequestEntity,
)


class StorageRepository:
    def __init__(self, db: Session):
        self.db = db

    def _commit_refresh(self, entity):
        self.db.add(entity)
        self.db.commit()
        self.db.refresh(entity)
        return entity

    # Micro-VMs
    def create_vm(
        self,
        vm_id: str,
        country: str,
        ram_mb: int,
        cpu_cores: int,
        template_id: str,
        status: str = "creating",
    ) -> MicroVMEntity:
        vm = MicroVMEntity(
            id=vm_id,
            country=country,
            ram_mb=ram_mb,
            cpu_cores=cpu_cores,
            template_id=template_id,
            status=status,
        )
        return self._commit_refresh(vm)

    def get_vm(self, vm_id: str) -> MicroVMEntity | None:
        return self.db.get(MicroVMEntity, vm_id)

    def list_vms(self, include_deleted: bool = False) -> list[MicroVMEntity]:
        stmt = select(MicroVMEntity).order_by(MicroVMEntity.created_at.desc())
        if not include_deleted:
            stmt = stmt.where(MicroVMEntity.status != "deleted")
        return list(self.db.scalars(stmt).all())

    def count_vms(
        self,
        statuses: Iterable[str] | None = None,
        exclude_statuses: Iterable[str] | None = None,
    ) -> int:
        stmt = select(func.count()).select_from(MicroVMEntity)
        filters = []
        if statuses:
            filters.append(MicroVMEntity.status.in_(list(statuses)))
        if exclude_statuses:
            filters.append(~MicroVMEntity.status.in_(list(exclude_statuses)))
        if filters:
            stmt = stmt.where(and_(*filters))
        return int(self.db.scalar(stmt) or 0)

    def sum_vm_ram_mb(self, statuses: Iterable[str] | None = None) -> int:
        stmt = select(func.coalesce(func.sum(MicroVMEntity.ram_mb), 0)).select_from(MicroVMEntity)
        if statuses:
            stmt = stmt.where(MicroVMEntity.status.in_(list(statuses)))
        return int(self.db.scalar(stmt) or 0)

    def update_vm(self, vm: MicroVMEntity, **updates) -> MicroVMEntity:
        for key, value in updates.items():
            setattr(vm, key, value)
        vm.updated_at = datetime.utcnow()
        return self._commit_refresh(vm)

    # Tunnels
    def create_tunnel(
        self,
        tunnel_id: str,
        country: str,
        provider: str,
        latency_ms: int,
        status: str,
        public_ip: str | None = None,
        vm_id: str | None = None,
    ) -> TunnelEntity:
        tunnel = TunnelEntity(
            id=tunnel_id,
            country=country,
            provider=provider,
            latency_ms=latency_ms,
            status=status,
            public_ip=public_ip,
            vm_id=vm_id,
        )
        return self._commit_refresh(tunnel)

    def get_tunnel(self, tunnel_id: str) -> TunnelEntity | None:
        return self.db.get(TunnelEntity, tunnel_id)

    def list_tunnels(self) -> list[TunnelEntity]:
        stmt = select(TunnelEntity).order_by(TunnelEntity.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def find_tunnel_for_vm(self, vm_id: str) -> TunnelEntity | None:
        stmt = select(TunnelEntity).where(TunnelEntity.vm_id == vm_id).order_by(TunnelEntity.updated_at.desc())
        return self.db.scalar(stmt)

    def find_connected_tunnel_by_country(self, country: str) -> TunnelEntity | None:
        stmt = (
            select(TunnelEntity)
            .where(and_(TunnelEntity.country == country, TunnelEntity.status == "Connected"))
            .order_by(TunnelEntity.updated_at.desc())
        )
        return self.db.scalar(stmt)

    def update_tunnel(self, tunnel: TunnelEntity, **updates) -> TunnelEntity:
        for key, value in updates.items():
            setattr(tunnel, key, value)
        tunnel.updated_at = datetime.utcnow()
        return self._commit_refresh(tunnel)

    # Identities
    def list_identities(self) -> list[IdentityEntity]:
        stmt = select(IdentityEntity).order_by(IdentityEntity.last_check.desc())
        return list(self.db.scalars(stmt).all())

    def get_identity_by_vm(self, vm_id: str) -> IdentityEntity | None:
        stmt = select(IdentityEntity).where(IdentityEntity.vm_id == vm_id)
        return self.db.scalar(stmt)

    def upsert_identity(
        self,
        vm_id: str,
        public_ip: str,
        isp: str,
        asn: str,
        ip_type: str,
        country: str,
        city: str | None,
        status: str,
        trust_score: int,
    ) -> IdentityEntity:
        identity = self.get_identity_by_vm(vm_id)
        if identity is None:
            identity = IdentityEntity(
                vm_id=vm_id,
                public_ip=public_ip,
                isp=isp,
                asn=asn,
                ip_type=ip_type,
                country=country,
                city=city,
                status=status,
                trust_score=trust_score,
                last_check=datetime.utcnow(),
            )
            return self._commit_refresh(identity)

        identity.public_ip = public_ip
        identity.isp = isp
        identity.asn = asn
        identity.ip_type = ip_type
        identity.country = country
        identity.city = city
        identity.status = status
        identity.trust_score = trust_score
        identity.last_check = datetime.utcnow()
        return self._commit_refresh(identity)

    # Healing rules
    def list_healing_rules(self) -> list[HealingRuleEntity]:
        stmt = select(HealingRuleEntity).order_by(HealingRuleEntity.id.asc())
        return list(self.db.scalars(stmt).all())

    def get_healing_rule(self, rule_id: str) -> HealingRuleEntity | None:
        return self.db.get(HealingRuleEntity, rule_id)

    def create_healing_rule(self, rule_id: str, trigger: str, action: str, enabled: bool) -> HealingRuleEntity:
        rule = HealingRuleEntity(id=rule_id, trigger=trigger, action=action, enabled=enabled)
        return self._commit_refresh(rule)

    def update_healing_rule(self, rule: HealingRuleEntity, enabled: bool) -> HealingRuleEntity:
        rule.enabled = bool(enabled)
        rule.updated_at = datetime.utcnow()
        return self._commit_refresh(rule)

    # Templates
    def list_templates(self) -> list[TemplateEntity]:
        stmt = select(TemplateEntity).order_by(TemplateEntity.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get_template(self, template_id: str) -> TemplateEntity | None:
        return self.db.get(TemplateEntity, template_id)

    def create_template(self, template_id: str, name: str, version: str, base_image: str) -> TemplateEntity:
        tpl = TemplateEntity(id=template_id, name=name, version=version, base_image=base_image)
        return self._commit_refresh(tpl)

    # Guardrails
    def get_guardrails(self) -> GuardrailsEntity | None:
        return self.db.get(GuardrailsEntity, 1)

    def upsert_guardrails(
        self,
        max_vms: int,
        min_host_ram_mb: int,
        max_cpu_per_vm: int,
        overload_prevention: bool,
    ) -> GuardrailsEntity:
        guardrails = self.get_guardrails()
        if guardrails is None:
            guardrails = GuardrailsEntity(
                id=1,
                max_vms=max_vms,
                min_host_ram_mb=min_host_ram_mb,
                max_cpu_per_vm=max_cpu_per_vm,
                overload_prevention=overload_prevention,
            )
            return self._commit_refresh(guardrails)

        guardrails.max_vms = max_vms
        guardrails.min_host_ram_mb = min_host_ram_mb
        guardrails.max_cpu_per_vm = max_cpu_per_vm
        guardrails.overload_prevention = overload_prevention
        guardrails.updated_at = datetime.utcnow()
        return self._commit_refresh(guardrails)

    # System control state
    def get_system_control_state(self) -> SystemControlStateEntity | None:
        return self.db.get(SystemControlStateEntity, 1)

    def upsert_system_control_state(
        self,
        protective_mode: bool,
        failsafe_active: bool,
        cooldown_until: datetime | None = None,
        last_reason: str | None = None,
    ) -> SystemControlStateEntity:
        state = self.get_system_control_state()
        if state is None:
            state = SystemControlStateEntity(
                id=1,
                protective_mode=protective_mode,
                failsafe_active=failsafe_active,
                cooldown_until=cooldown_until,
                last_reason=last_reason,
            )
            return self._commit_refresh(state)
        state.protective_mode = protective_mode
        state.failsafe_active = failsafe_active
        state.cooldown_until = cooldown_until
        state.last_reason = last_reason
        state.updated_at = datetime.utcnow()
        return self._commit_refresh(state)

    # Scheduler jobs
    def create_scheduler_job(
        self,
        job_id: str,
        task_type: str,
        vm_id: str | None,
        status: str = "Queued",
        progress: int = 0,
        priority: str = "medium",
        max_retries: int = 3,
        next_attempt_at: datetime | None = None,
        dead_letter: bool = False,
        schedule_window_start_hour: int | None = None,
        schedule_window_end_hour: int | None = None,
        timezone_offset_minutes: int = 0,
        jitter_seconds: int = 0,
        recurrence_minutes: int | None = None,
    ) -> SchedulerJobEntity:
        job = SchedulerJobEntity(
            id=job_id,
            task_type=task_type,
            vm_id=vm_id,
            status=status,
            progress=progress,
            priority=priority,
            max_retries=max_retries,
            next_attempt_at=next_attempt_at,
            dead_letter=dead_letter,
            schedule_window_start_hour=schedule_window_start_hour,
            schedule_window_end_hour=schedule_window_end_hour,
            timezone_offset_minutes=timezone_offset_minutes,
            jitter_seconds=jitter_seconds,
            recurrence_minutes=recurrence_minutes,
        )
        return self._commit_refresh(job)

    def get_scheduler_job(self, job_id: str) -> SchedulerJobEntity | None:
        return self.db.get(SchedulerJobEntity, job_id)

    def list_scheduler_jobs(self) -> list[SchedulerJobEntity]:
        stmt = select(SchedulerJobEntity).order_by(SchedulerJobEntity.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def list_dispatchable_scheduler_jobs(self, now: datetime, limit: int) -> list[SchedulerJobEntity]:
        candidates = self.db.scalars(
            select(SchedulerJobEntity).where(
                and_(
                    SchedulerJobEntity.status.in_(["Queued", "Retrying"]),
                    SchedulerJobEntity.dead_letter.is_(False),
                )
            )
        ).all()
        ready = [
            job
            for job in candidates
            if job.next_attempt_at is None or job.next_attempt_at <= now
        ]
        priority_rank = {"high": 0, "medium": 1, "low": 2}
        ready.sort(key=lambda job: (priority_rank.get((job.priority or "medium").lower(), 1), job.created_at))
        return list(ready[: max(0, limit)])

    def count_scheduler_jobs_by_status(self, statuses: Iterable[str]) -> int:
        stmt = select(func.count()).select_from(SchedulerJobEntity).where(SchedulerJobEntity.status.in_(list(statuses)))
        return int(self.db.scalar(stmt) or 0)

    def update_scheduler_job(self, job: SchedulerJobEntity, **updates) -> SchedulerJobEntity:
        for key, value in updates.items():
            setattr(job, key, value)
        job.updated_at = datetime.utcnow()
        return self._commit_refresh(job)

    # Repositories
    def list_repositories(self) -> list[RepositoryEntity]:
        stmt = select(RepositoryEntity).order_by(RepositoryEntity.created_at.desc())
        return list(self.db.scalars(stmt).all())

    def get_repository_by_url(self, url: str) -> RepositoryEntity | None:
        stmt = select(RepositoryEntity).where(RepositoryEntity.url == url)
        return self.db.scalar(stmt)

    def create_repository(
        self,
        name: str,
        url: str,
        status: str,
        api_endpoint: str,
        last_sync: datetime | None = None,
    ) -> RepositoryEntity:
        repo = RepositoryEntity(
            name=name,
            url=url,
            status=status,
            api_endpoint=api_endpoint,
            last_sync=last_sync or datetime.utcnow(),
        )
        return self._commit_refresh(repo)

    # Logs
    def add_log(self, source: str, level: str, message: str, details: str | None = None) -> SystemLogEntity:
        log = SystemLogEntity(
            source=source,
            level=level.upper(),
            message=message,
            details=details,
            timestamp=datetime.utcnow(),
        )
        return self._commit_refresh(log)

    def list_logs(self, source: str | None = None, limit: int = 200) -> list[SystemLogEntity]:
        stmt = select(SystemLogEntity)
        if source and source.lower() != "all":
            stmt = stmt.where(SystemLogEntity.source == source)
        stmt = stmt.order_by(desc(SystemLogEntity.timestamp)).limit(limit)
        return list(self.db.scalars(stmt).all())

    # Verification requests
    def list_verification_requests(self, limit: int = 200) -> list[VerificationRequestEntity]:
        stmt = select(VerificationRequestEntity).order_by(desc(VerificationRequestEntity.updated_at)).limit(limit)
        return list(self.db.scalars(stmt).all())

    def get_verification_request(self, request_id: str) -> VerificationRequestEntity | None:
        return self.db.get(VerificationRequestEntity, request_id)

    def create_verification_request(
        self,
        request_id: str,
        vm_id: str,
        worker_id: str,
        verification_type: str,
        status: str,
        provider: str,
        destination: str,
        retries: int = 0,
        last_error: str | None = None,
    ) -> VerificationRequestEntity:
        row = VerificationRequestEntity(
            id=request_id,
            vm_id=vm_id,
            worker_id=worker_id,
            verification_type=verification_type,
            status=status,
            provider=provider,
            destination=destination,
            retries=retries,
            last_error=last_error,
        )
        return self._commit_refresh(row)

    def update_verification_request(self, row: VerificationRequestEntity, **updates) -> VerificationRequestEntity:
        for key, value in updates.items():
            setattr(row, key, value)
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # CAPTCHA events
    def list_captcha_events(self, limit: int = 200) -> list[CaptchaEventEntity]:
        stmt = select(CaptchaEventEntity).order_by(desc(CaptchaEventEntity.created_at)).limit(limit)
        return list(self.db.scalars(stmt).all())

    def create_captcha_event(
        self,
        provider: str,
        status: str,
        source: str,
        vm_id: str | None = None,
        score: int | None = None,
        latency_ms: int = 0,
        details: str | None = None,
    ) -> CaptchaEventEntity:
        row = CaptchaEventEntity(
            vm_id=vm_id,
            provider=provider,
            status=status,
            source=source,
            score=score,
            latency_ms=latency_ms,
            details=details,
        )
        return self._commit_refresh(row)

    # Operations
    def create_operation(
        self,
        resource_type: str,
        resource_id: str,
        operation: str,
        status: str = "pending",
        message: str | None = None,
    ) -> OperationEntity:
        op = OperationEntity(
            id=uuid4().hex,
            resource_type=resource_type,
            resource_id=resource_id,
            operation=operation,
            status=status,
            message=message,
        )
        return self._commit_refresh(op)

    def get_operation(self, operation_id: str) -> OperationEntity | None:
        return self.db.get(OperationEntity, operation_id)

    def get_latest_operation(
        self,
        resource_type: str,
        resource_id: str,
        operation: str,
        statuses: Iterable[str],
    ) -> OperationEntity | None:
        stmt = (
            select(OperationEntity)
            .where(
                and_(
                    OperationEntity.resource_type == resource_type,
                    OperationEntity.resource_id == resource_id,
                    OperationEntity.operation == operation,
                    OperationEntity.status.in_(list(statuses)),
                )
            )
            .order_by(OperationEntity.requested_at.desc())
        )
        return self.db.scalar(stmt)

    def update_operation_status(self, operation_id: str, status: str, message: str | None = None) -> OperationEntity:
        op = self.get_operation(operation_id)
        if op is None:
            raise ValueError(f"Operation '{operation_id}' not found.")

        op.status = status
        if message is not None:
            op.message = message

        now = datetime.utcnow()
        op.updated_at = now
        if status == "running":
            op.started_at = now
        if status in {"succeeded", "failed"}:
            if op.started_at is None:
                op.started_at = now
            op.finished_at = now

        return self._commit_refresh(op)

    def count_operations(self, since: datetime | None = None, status: str | None = None) -> int:
        stmt = select(func.count()).select_from(OperationEntity)
        filters = []
        if since is not None:
            filters.append(OperationEntity.requested_at >= since)
        if status is not None:
            filters.append(OperationEntity.status == status)
        if filters:
            stmt = stmt.where(and_(*filters))
        return int(self.db.scalar(stmt) or 0)

    # Telemetry
    def add_telemetry_sample(self, name: str, uptime: int, stability: int, load: int) -> TelemetrySampleEntity:
        sample = TelemetrySampleEntity(name=name, uptime=uptime, stability=stability, load=load)
        return self._commit_refresh(sample)

    def list_telemetry_samples(self, limit: int = 24) -> list[TelemetrySampleEntity]:
        stmt = select(TelemetrySampleEntity).order_by(desc(TelemetrySampleEntity.sampled_at)).limit(limit)
        samples = list(self.db.scalars(stmt).all())
        samples.reverse()
        return samples

    def trim_old_telemetry(self, keep_last: int = 120) -> None:
        stmt = select(TelemetrySampleEntity.id).order_by(desc(TelemetrySampleEntity.sampled_at)).offset(keep_last)
        stale_ids = [row for row in self.db.scalars(stmt).all()]
        if not stale_ids:
            return
        self.db.query(TelemetrySampleEntity).filter(TelemetrySampleEntity.id.in_(stale_ids)).delete(
            synchronize_session=False
        )
        self.db.commit()

    # Threats
    def add_threat_sample(self, time_label: str, threats: int) -> ThreatSampleEntity:
        sample = ThreatSampleEntity(time_label=time_label, threats=threats)
        return self._commit_refresh(sample)

    def list_threat_samples(self, limit: int = 24) -> list[ThreatSampleEntity]:
        stmt = select(ThreatSampleEntity).order_by(desc(ThreatSampleEntity.sampled_at)).limit(limit)
        samples = list(self.db.scalars(stmt).all())
        samples.reverse()
        return samples

    def trim_old_threats(self, keep_last: int = 120) -> None:
        stmt = select(ThreatSampleEntity.id).order_by(desc(ThreatSampleEntity.sampled_at)).offset(keep_last)
        stale_ids = [row for row in self.db.scalars(stmt).all()]
        if not stale_ids:
            return
        self.db.query(ThreatSampleEntity).filter(ThreatSampleEntity.id.in_(stale_ids)).delete(
            synchronize_session=False
        )
        self.db.commit()

    def count_recent_restart_operations(self, window: timedelta) -> int:
        since = datetime.utcnow() - window
        stmt = (
            select(func.count())
            .select_from(OperationEntity)
            .where(
                and_(
                    OperationEntity.operation == "restart",
                    OperationEntity.status == "succeeded",
                    OperationEntity.requested_at >= since,
                )
            )
        )
        return int(self.db.scalar(stmt) or 0)

    # Notebook sessions
    def create_notebook_session(
        self,
        notebook_id: str,
        vm_id: str,
        account_email: str | None,
        status: str,
        gpu_assigned_gb: float,
        gpu_usage_gb: float,
        ram_usage_gb: float,
        load_percent: int,
        cycle_state: str,
        next_transition_at: datetime | None,
        session_expires_at: datetime | None,
        warning_message: str | None = None,
        restart_count: int = 0,
        risk_score: int = 0,
    ) -> NotebookSessionEntity:
        row = NotebookSessionEntity(
            id=notebook_id,
            vm_id=vm_id,
            account_email=account_email,
            status=status,
            gpu_assigned_gb=gpu_assigned_gb,
            gpu_usage_gb=gpu_usage_gb,
            ram_usage_gb=ram_usage_gb,
            load_percent=load_percent,
            cycle_state=cycle_state,
            next_transition_at=next_transition_at,
            session_expires_at=session_expires_at,
            warning_message=warning_message,
            restart_count=restart_count,
            risk_score=risk_score,
        )
        return self._commit_refresh(row)

    def get_notebook_session(self, notebook_id: str) -> NotebookSessionEntity | None:
        return self.db.get(NotebookSessionEntity, notebook_id)

    def list_notebook_sessions(self, vm_id: str | None = None) -> list[NotebookSessionEntity]:
        stmt = select(NotebookSessionEntity).order_by(NotebookSessionEntity.updated_at.desc())
        if vm_id:
            stmt = stmt.where(NotebookSessionEntity.vm_id == vm_id)
        return list(self.db.scalars(stmt).all())

    def update_notebook_session(self, row: NotebookSessionEntity, **updates) -> NotebookSessionEntity:
        for key, value in updates.items():
            setattr(row, key, value)
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # Google account management
    def create_google_account(
        self,
        account_id: str,
        email: str,
        status: str = "free",
        vm_id: str | None = None,
        risk_score: int = 0,
        warmup_state: str = "idle",
        last_used_at: datetime | None = None,
    ) -> GoogleAccountEntity:
        row = GoogleAccountEntity(
            id=account_id,
            email=email,
            status=status,
            vm_id=vm_id,
            risk_score=risk_score,
            warmup_state=warmup_state,
            last_used_at=last_used_at,
        )
        return self._commit_refresh(row)

    def get_google_account(self, account_id: str) -> GoogleAccountEntity | None:
        return self.db.get(GoogleAccountEntity, account_id)

    def get_google_account_by_email(self, email: str) -> GoogleAccountEntity | None:
        stmt = select(GoogleAccountEntity).where(GoogleAccountEntity.email == email)
        return self.db.scalar(stmt)

    def list_google_accounts(self) -> list[GoogleAccountEntity]:
        stmt = select(GoogleAccountEntity).order_by(GoogleAccountEntity.updated_at.desc())
        return list(self.db.scalars(stmt).all())

    def find_assigned_account_by_vm(self, vm_id: str) -> GoogleAccountEntity | None:
        stmt = select(GoogleAccountEntity).where(GoogleAccountEntity.vm_id == vm_id)
        return self.db.scalar(stmt)

    def update_google_account(self, row: GoogleAccountEntity, **updates) -> GoogleAccountEntity:
        for key, value in updates.items():
            setattr(row, key, value)
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    def get_account_mode(self) -> AccountModeEntity | None:
        return self.db.get(AccountModeEntity, 1)

    def upsert_account_mode(self, mode: str) -> AccountModeEntity:
        row = self.get_account_mode()
        if row is None:
            row = AccountModeEntity(id=1, mode=mode)
            return self._commit_refresh(row)
        row.mode = mode
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # Tunnel benchmarking
    def create_tunnel_benchmark(
        self,
        protocol: str,
        latency_ms: int,
        stability_score: int,
        persistence_score: int,
        detection_score: int,
        throughput_mbps: float,
        notes: str | None = None,
    ) -> TunnelBenchmarkEntity:
        row = TunnelBenchmarkEntity(
            protocol=protocol,
            latency_ms=latency_ms,
            stability_score=stability_score,
            persistence_score=persistence_score,
            detection_score=detection_score,
            throughput_mbps=throughput_mbps,
            notes=notes,
        )
        return self._commit_refresh(row)

    def list_tunnel_benchmarks(self, protocol: str | None = None, limit: int = 200) -> list[TunnelBenchmarkEntity]:
        stmt = select(TunnelBenchmarkEntity)
        if protocol:
            stmt = stmt.where(TunnelBenchmarkEntity.protocol == protocol)
        stmt = stmt.order_by(desc(TunnelBenchmarkEntity.created_at)).limit(limit)
        return list(self.db.scalars(stmt).all())

    # IP history and reputation
    def get_ip_history(self, ip: str) -> IpHistoryEntity | None:
        stmt = select(IpHistoryEntity).where(IpHistoryEntity.ip == ip)
        return self.db.scalar(stmt)

    def list_ip_history(self, limit: int = 300) -> list[IpHistoryEntity]:
        stmt = select(IpHistoryEntity).order_by(desc(IpHistoryEntity.updated_at)).limit(limit)
        return list(self.db.scalars(stmt).all())

    def upsert_ip_history(
        self,
        ip: str,
        account_email: str | None = None,
        associated_vm_id: str | None = None,
        smtp_used: bool | None = None,
        reputation_score: int | None = None,
        negative_events: int | None = None,
        restricted: bool | None = None,
        discarded: bool | None = None,
        last_event: str | None = None,
        last_used_at: datetime | None = None,
    ) -> IpHistoryEntity:
        row = self.get_ip_history(ip)
        if row is None:
            row = IpHistoryEntity(
                ip=ip,
                account_email=account_email,
                associated_vm_id=associated_vm_id,
                smtp_used=bool(smtp_used) if smtp_used is not None else False,
                reputation_score=int(reputation_score if reputation_score is not None else 100),
                negative_events=int(negative_events if negative_events is not None else 0),
                restricted=bool(restricted) if restricted is not None else False,
                discarded=bool(discarded) if discarded is not None else False,
                last_event=last_event,
                last_used_at=last_used_at or datetime.utcnow(),
            )
            return self._commit_refresh(row)
        if account_email is not None:
            row.account_email = account_email
        if associated_vm_id is not None:
            row.associated_vm_id = associated_vm_id
        if smtp_used is not None:
            row.smtp_used = bool(smtp_used)
        if reputation_score is not None:
            row.reputation_score = int(reputation_score)
        if negative_events is not None:
            row.negative_events = int(negative_events)
        if restricted is not None:
            row.restricted = bool(restricted)
        if discarded is not None:
            row.discarded = bool(discarded)
        if last_event is not None:
            row.last_event = last_event
        row.last_used_at = last_used_at or datetime.utcnow()
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # Digital footprint
    def create_footprint_activity(
        self,
        activity_id: str,
        vm_id: str,
        account_id: str | None,
        activity_type: str,
        status: str = "Scheduled",
        details: str | None = None,
        timezone_offset_minutes: int = 0,
        scheduled_at: datetime | None = None,
        executed_at: datetime | None = None,
    ) -> FootprintActivityEntity:
        row = FootprintActivityEntity(
            id=activity_id,
            vm_id=vm_id,
            account_id=account_id,
            activity_type=activity_type,
            status=status,
            details=details,
            timezone_offset_minutes=timezone_offset_minutes,
            scheduled_at=scheduled_at,
            executed_at=executed_at,
        )
        return self._commit_refresh(row)

    def get_footprint_activity(self, activity_id: str) -> FootprintActivityEntity | None:
        return self.db.get(FootprintActivityEntity, activity_id)

    def list_footprint_activities(
        self,
        limit: int = 200,
        vm_id: str | None = None,
        status: str | None = None,
    ) -> list[FootprintActivityEntity]:
        stmt = select(FootprintActivityEntity)
        if vm_id is not None:
            stmt = stmt.where(FootprintActivityEntity.vm_id == vm_id)
        if status is not None:
            stmt = stmt.where(FootprintActivityEntity.status == status)
        stmt = stmt.order_by(desc(FootprintActivityEntity.created_at)).limit(limit)
        return list(self.db.scalars(stmt).all())

    def update_footprint_activity(self, row: FootprintActivityEntity, **updates) -> FootprintActivityEntity:
        for key, value in updates.items():
            setattr(row, key, value)
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # SMTP tasks
    def create_smtp_task(
        self,
        task_id: str,
        implementation: str,
        domain: str,
        sender: str,
        recipients_count: int,
        status: str = "Queued",
        vm_id: str | None = None,
    ) -> SMTPTaskEntity:
        row = SMTPTaskEntity(
            id=task_id,
            implementation=implementation,
            domain=domain,
            sender=sender,
            recipients_count=recipients_count,
            status=status,
            vm_id=vm_id,
        )
        return self._commit_refresh(row)

    def get_smtp_task(self, task_id: str) -> SMTPTaskEntity | None:
        return self.db.get(SMTPTaskEntity, task_id)

    def list_smtp_tasks(self, limit: int = 200) -> list[SMTPTaskEntity]:
        stmt = select(SMTPTaskEntity).order_by(desc(SMTPTaskEntity.created_at)).limit(limit)
        return list(self.db.scalars(stmt).all())

    def update_smtp_task(self, row: SMTPTaskEntity, **updates) -> SMTPTaskEntity:
        for key, value in updates.items():
            setattr(row, key, value)
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # Architecture role
    def get_n8n_role(self) -> N8nRoleEntity | None:
        return self.db.get(N8nRoleEntity, 1)

    def upsert_n8n_role(self, role: str, notes: str | None = None) -> N8nRoleEntity:
        row = self.get_n8n_role()
        if row is None:
            row = N8nRoleEntity(id=1, role=role, notes=notes)
            return self._commit_refresh(row)
        row.role = role
        row.notes = notes
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # n8n workflows
    def get_n8n_workflow(self, workflow_id: str) -> N8nWorkflowEntity | None:
        return self.db.get(N8nWorkflowEntity, workflow_id)

    def list_n8n_workflows(self) -> list[N8nWorkflowEntity]:
        stmt = select(N8nWorkflowEntity).order_by(N8nWorkflowEntity.updated_at.desc())
        return list(self.db.scalars(stmt).all())

    def upsert_n8n_workflow(
        self,
        workflow_id: str,
        name: str,
        source: str,
        active: bool,
        version_hash: str,
        definition_json: str,
    ) -> N8nWorkflowEntity:
        row = self.get_n8n_workflow(workflow_id)
        if row is None:
            row = N8nWorkflowEntity(
                id=workflow_id,
                name=name,
                source=source,
                active=active,
                version_hash=version_hash,
                definition_json=definition_json,
            )
            return self._commit_refresh(row)
        row.name = name
        row.source = source
        row.active = bool(active)
        row.version_hash = version_hash
        row.definition_json = definition_json
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # n8n runs
    def get_n8n_run(self, run_id: str) -> N8nRunEntity | None:
        return self.db.get(N8nRunEntity, run_id)

    def list_n8n_runs(self, limit: int = 200, workflow_id: str | None = None) -> list[N8nRunEntity]:
        stmt = select(N8nRunEntity)
        if workflow_id is not None:
            stmt = stmt.where(N8nRunEntity.workflow_id == workflow_id)
        stmt = stmt.order_by(desc(N8nRunEntity.updated_at)).limit(limit)
        return list(self.db.scalars(stmt).all())

    def create_n8n_run(
        self,
        run_id: str,
        workflow_id: str,
        trigger: str,
        status: str,
        context_json: str,
        external_execution_id: str | None = None,
        events_json: str = "[]",
        last_message: str | None = None,
        started_at: datetime | None = None,
        finished_at: datetime | None = None,
    ) -> N8nRunEntity:
        row = N8nRunEntity(
            id=run_id,
            workflow_id=workflow_id,
            external_execution_id=external_execution_id,
            trigger=trigger,
            status=status,
            context_json=context_json,
            events_json=events_json,
            last_message=last_message,
            started_at=started_at,
            finished_at=finished_at,
        )
        return self._commit_refresh(row)

    def update_n8n_run(self, row: N8nRunEntity, **updates) -> N8nRunEntity:
        for key, value in updates.items():
            setattr(row, key, value)
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    def append_n8n_run_event(self, row: N8nRunEntity, event: dict, max_events: int = 400) -> N8nRunEntity:
        try:
            events = json.loads(row.events_json or "[]")
            if not isinstance(events, list):
                events = []
        except Exception:
            events = []
        events.append(event)
        if max_events > 0 and len(events) > max_events:
            events = events[-max_events:]
        row.events_json = json.dumps(events, separators=(",", ":"), ensure_ascii=True)
        row.last_message = str(event.get("message") or row.last_message or "")
        row.updated_at = datetime.utcnow()
        return self._commit_refresh(row)

    # VM risk score
    def apply_vm_risk_event(self, vm_id: str, delta: int, reason: str | None = None) -> MicroVMEntity | None:
        vm = self.get_vm(vm_id)
        if vm is None:
            return None
        vm.risk_score = max(0, int(vm.risk_score or 0) + int(delta))
        vm.updated_at = datetime.utcnow()
        updated = self._commit_refresh(vm)
        if reason:
            self.add_log("Risk", "WARNING" if delta > 0 else "INFO", f"VM {vm_id} risk adjusted by {delta}.", reason)
        return updated
