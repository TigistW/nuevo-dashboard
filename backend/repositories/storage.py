from __future__ import annotations

from datetime import datetime, timedelta
from typing import Iterable
from uuid import uuid4

from sqlalchemy import and_, desc, func, select
from sqlalchemy.orm import Session

from ..db_models import (
    CaptchaEventEntity,
    GuardrailsEntity,
    HealingRuleEntity,
    IdentityEntity,
    MicroVMEntity,
    OperationEntity,
    RepositoryEntity,
    SchedulerJobEntity,
    SystemLogEntity,
    TemplateEntity,
    TelemetrySampleEntity,
    ThreatSampleEntity,
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

    # Scheduler jobs
    def create_scheduler_job(
        self,
        job_id: str,
        task_type: str,
        vm_id: str | None,
        status: str = "Queued",
        progress: int = 0,
    ) -> SchedulerJobEntity:
        job = SchedulerJobEntity(
            id=job_id,
            task_type=task_type,
            vm_id=vm_id,
            status=status,
            progress=progress,
        )
        return self._commit_refresh(job)

    def get_scheduler_job(self, job_id: str) -> SchedulerJobEntity | None:
        return self.db.get(SchedulerJobEntity, job_id)

    def list_scheduler_jobs(self) -> list[SchedulerJobEntity]:
        stmt = select(SchedulerJobEntity).order_by(SchedulerJobEntity.created_at.desc())
        return list(self.db.scalars(stmt).all())

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
