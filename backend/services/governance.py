from __future__ import annotations

from fastapi import BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..models import Guardrails, OperationStatus, Template
from ..repositories import StorageRepository
from .utils import isoformat_or_none


class GovernanceService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_templates(self) -> list[Template]:
        templates = self.repo.list_templates()
        return [
            Template(id=item.id, name=item.name, version=item.version, base_image=item.base_image)
            for item in templates
        ]

    def get_guardrails(self) -> Guardrails:
        guardrails = self.repo.get_guardrails()
        if guardrails is None:
            raise HTTPException(status_code=404, detail="Guardrails config not found.")
        return Guardrails(
            max_vms=guardrails.max_vms,
            min_host_ram_mb=guardrails.min_host_ram_mb,
            max_cpu_per_vm=guardrails.max_cpu_per_vm,
            overload_prevention=guardrails.overload_prevention,
        )

    def update_guardrails(self, payload: Guardrails) -> Guardrails:
        updated = self.repo.upsert_guardrails(
            max_vms=payload.max_vms,
            min_host_ram_mb=payload.min_host_ram_mb,
            max_cpu_per_vm=payload.max_cpu_per_vm,
            overload_prevention=payload.overload_prevention,
        )
        self.repo.add_log("Governance", "INFO", "Guardrails updated.")
        return Guardrails(
            max_vms=updated.max_vms,
            min_host_ram_mb=updated.min_host_ram_mb,
            max_cpu_per_vm=updated.max_cpu_per_vm,
            overload_prevention=updated.overload_prevention,
        )

    def sync_fingerprint(self, vm_id: str, background_tasks: BackgroundTasks) -> OperationStatus:
        vm = self.repo.get_vm(vm_id)
        if vm is None or vm.status == "deleted":
            raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")

        in_flight = self.repo.get_latest_operation("fingerprint", vm_id, "sync", {"pending", "running"})
        if in_flight is not None:
            return self._to_operation(in_flight)

        operation = self.repo.create_operation(
            resource_type="fingerprint",
            resource_id=vm_id,
            operation="sync",
            status="pending",
            message=f"Fingerprint sync queued for VM '{vm_id}'.",
        )
        self.repo.add_log("Governance", "INFO", f"Fingerprint sync requested for VM {vm_id}.")
        background_tasks.add_task(_run_fingerprint_sync_task, vm_id, operation.id)
        return self._to_operation(operation)

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


def _run_fingerprint_sync_task(vm_id: str, operation_id: str) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        repo.update_operation_status(operation_id, "running", "Fingerprint sync in progress.")
        vm = repo.get_vm(vm_id)
        if vm is None:
            raise RuntimeError(f"VM '{vm_id}' not found.")

        repo.update_vm(vm, verification_status="Secure")
        repo.update_operation_status(operation_id, "succeeded", f"Fingerprint synced for VM '{vm_id}'.")
        repo.add_log("Governance", "INFO", f"Fingerprint synced for VM {vm_id}.")
    except Exception as exc:
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        repo.add_log("Governance", "ERROR", f"Fingerprint sync failed for VM {vm_id}.", str(exc))
    finally:
        db.close()
