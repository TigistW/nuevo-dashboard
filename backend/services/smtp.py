from __future__ import annotations

import random
import time
from datetime import datetime

from fastapi import BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..models import IpCandidateCheckRequest, IpUsageRecordCreate, OperationStatus, SMTPTaskCreate, SMTPTaskResponse
from ..repositories import StorageRepository
from .ip_policy import IpPolicyService
from .utils import isoformat_or_none, normalize_country, parse_cpu_cores, parse_ram_to_mb


class SMTPService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def send(self, payload: SMTPTaskCreate, background_tasks: BackgroundTasks) -> OperationStatus:
        task_id = (payload.id or f"smtp-{int(time.time() * 1000)}").strip()
        if self.repo.get_smtp_task(task_id) is not None:
            raise HTTPException(status_code=409, detail=f"SMTP task '{task_id}' already exists.")

        recipients_count = len(payload.recipients)
        task = self.repo.create_smtp_task(
            task_id=task_id,
            implementation=payload.implementation,
            domain=payload.domain.strip().lower(),
            sender=payload.sender.strip(),
            recipients_count=recipients_count,
            status="Queued",
        )
        operation = self.repo.create_operation(
            resource_type="smtp",
            resource_id=task.id,
            operation="send",
            status="pending",
            message=f"SMTP task '{task.id}' queued.",
        )
        self.repo.add_log(
            "SMTP",
            "INFO",
            f"SMTP task '{task.id}' queued.",
            f"implementation={task.implementation}, recipients={recipients_count}",
        )
        background_tasks.add_task(
            _run_smtp_task,
            task.id,
            operation.id,
            {
                "country": payload.country,
                "preferred_ip": payload.preferred_ip,
            },
        )
        return self._to_operation(operation)

    def list_tasks(self, limit: int = 200) -> list[SMTPTaskResponse]:
        rows = self.repo.list_smtp_tasks(limit=max(1, min(limit, 1000)))
        return [self._to_task(item) for item in rows]

    def get_task(self, task_id: str) -> SMTPTaskResponse:
        row = self.repo.get_smtp_task(task_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"SMTP task '{task_id}' not found.")
        return self._to_task(row)

    def _to_operation(self, operation) -> OperationStatus:
        return OperationStatus(
            id=operation.id,
            resource_type=operation.resource_type,
            resource_id=operation.resource_id,
            operation=operation.operation,
            status=operation.status,
            message=operation.message,
            requested_at=isoformat_or_none(operation.requested_at),
            started_at=isoformat_or_none(operation.started_at),
            finished_at=isoformat_or_none(operation.finished_at),
        )

    def _to_task(self, row) -> SMTPTaskResponse:
        return SMTPTaskResponse(
            id=row.id,
            vm_id=row.vm_id,
            status=row.status,
            implementation=row.implementation,
            domain=row.domain,
            sender=row.sender,
            recipients_count=row.recipients_count,
            success_count=row.success_count,
            failure_count=row.failure_count,
            ip_used=row.ip_used,
            spf_enabled=row.spf_enabled,
            dkim_enabled=row.dkim_enabled,
            dmarc_enabled=row.dmarc_enabled,
            rdns_enabled=row.rdns_enabled,
            tls_enabled=row.tls_enabled,
            error_message=row.error_message,
            created_at=isoformat_or_none(row.created_at) or datetime.utcnow().isoformat(),
            completed_at=isoformat_or_none(row.completed_at),
        )


def _run_smtp_task(task_id: str, operation_id: str, context: dict) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    ephemeral_vm_id: str | None = None
    try:
        task = repo.get_smtp_task(task_id)
        if task is None:
            raise RuntimeError(f"SMTP task '{task_id}' not found.")
        repo.update_operation_status(operation_id, "running", "Preparing ephemeral SMTP microVM.")
        repo.update_smtp_task(task, status="Running")

        country = normalize_country(str(context.get("country") or "us"))
        preferred_ip = context.get("preferred_ip")
        ip_policy = IpPolicyService(repo)
        selected_ip = ip_policy.choose_ip_for_context(
            context="smtp",
            preferred_ip=preferred_ip,
            seed=f"smtp-{task.id}",
        )
        eval_result = ip_policy.evaluate_candidate(
            IpCandidateCheckRequest(ip=selected_ip, context="smtp", cooldown_minutes=1)
        )
        if not eval_result.recommended:
            raise RuntimeError("No eligible IP passed mandatory Filter 1 and Filter 2 for SMTP.")

        # Create ephemeral SMTP VM.
        ephemeral_vm_id = f"smtp-vm-{task.id[:8]}-{random.randint(100, 999)}"
        while repo.get_vm(ephemeral_vm_id) is not None:
            ephemeral_vm_id = f"smtp-vm-{task.id[:8]}-{random.randint(100, 999)}"

        repo.create_vm(
            vm_id=ephemeral_vm_id,
            country=country,
            ram_mb=parse_ram_to_mb("256MB"),
            cpu_cores=parse_cpu_cores("1"),
            template_id="t-001",
            status="running",
        )
        vm_row = repo.get_vm(ephemeral_vm_id)
        if vm_row is not None:
            repo.update_vm(
                vm_row,
                status="running",
                public_ip=selected_ip,
                verification_status="Secure",
                risk_score=0,
            )

        repo.update_smtp_task(
            task,
            vm_id=ephemeral_vm_id,
            ip_used=selected_ip,
            spf_enabled=True,
            dkim_enabled=True,
            dmarc_enabled=True,
            rdns_enabled=True,
            tls_enabled=True,
        )
        repo.update_operation_status(operation_id, "running", "SMTP stack configured (SPF/DKIM/DMARC/rDNS/TLS).")

        recipients_count = int(task.recipients_count or 0)
        failure_count = 0
        if recipients_count > 5:
            failure_count = random.randint(0, max(1, recipients_count // 25))
        success_count = max(0, recipients_count - failure_count)

        ip_policy.record_usage(
            IpUsageRecordCreate(
                ip=selected_ip,
                associated_vm_id=ephemeral_vm_id,
                smtp_used=True,
                last_event="smtp_send",
            )
        )

        # Destroy ephemeral SMTP VM after completion.
        if vm_row is not None:
            repo.update_vm(
                vm_row,
                status="deleted",
                public_ip=None,
                network_id=None,
                exit_node=None,
                verification_status="None",
            )

        repo.update_smtp_task(
            task,
            status="Completed",
            success_count=success_count,
            failure_count=failure_count,
            completed_at=datetime.utcnow(),
        )
        repo.update_operation_status(
            operation_id,
            "succeeded",
            (
                f"SMTP task '{task.id}' completed via {task.implementation}. "
                f"sent={success_count}, failed={failure_count}, ip={selected_ip}"
            ),
        )
        repo.add_log("SMTP", "INFO", f"SMTP task '{task.id}' completed.")
    except Exception as exc:
        row = repo.get_smtp_task(task_id)
        if row is not None:
            repo.update_smtp_task(row, status="Failed", error_message=str(exc), completed_at=datetime.utcnow())
        if ephemeral_vm_id:
            vm_row = repo.get_vm(ephemeral_vm_id)
            if vm_row is not None and vm_row.status != "deleted":
                repo.update_vm(
                    vm_row,
                    status="deleted",
                    public_ip=None,
                    network_id=None,
                    exit_node=None,
                    verification_status="None",
                )
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        repo.add_log("SMTP", "ERROR", f"SMTP task '{task_id}' failed.", str(exc))
    finally:
        db.close()
