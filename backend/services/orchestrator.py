from __future__ import annotations

import random

from fastapi import BackgroundTasks, HTTPException

from ..config import settings
from ..database import SessionLocal
from ..models import MicroVMCreate, MicroVMResponse, OperationStatus
from ..repositories import StorageRepository
from .infra_adapter import InfrastructureAdapter, summarize_command_runs
from .utils import (
    cpu_to_text,
    generate_public_ip,
    isoformat_or_none,
    normalize_country,
    parse_cpu_cores,
    parse_ram_to_mb,
    ram_mb_to_text,
    seconds_to_uptime,
    short_code,
)
from .workflow_logging import log_workflow_step


ACTIVE_VM_STATES = {"creating", "running", "stopping", "restarting"}
STOPPABLE_VM_STATES = {"running", "restarting"}
RESTARTABLE_VM_STATES = {"running", "stopped"}
DELETABLE_VM_STATES = {"creating", "running", "stopping", "stopped", "restarting", "error"}


class OrchestratorService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def create_vm(self, vm: MicroVMCreate, background_tasks: BackgroundTasks) -> MicroVMResponse:
        log_workflow_step(
            self.repo,
            step="create_vm",
            phase="request",
            message=f"Received VM create request for '{vm.id}'.",
            details=f"country={vm.country}, ram={vm.ram}, cpu={vm.cpu}, template={vm.template_id}",
        )
        existing = self.repo.get_vm(vm.id)
        if existing is not None and existing.status != "deleted":
            log_workflow_step(
                self.repo,
                step="create_vm",
                phase="rejected",
                message=f"VM '{vm.id}' already exists.",
                details=f"status={existing.status}",
                level="WARNING",
            )
            raise HTTPException(status_code=409, detail=f"VM '{vm.id}' already exists.")

        template = self.repo.get_template(vm.template_id)
        if template is None:
            log_workflow_step(
                self.repo,
                step="create_vm",
                phase="rejected",
                message=f"Template '{vm.template_id}' not found.",
                level="WARNING",
            )
            raise HTTPException(status_code=404, detail=f"Template '{vm.template_id}' not found.")

        try:
            ram_mb = parse_ram_to_mb(vm.ram)
            cpu_cores = parse_cpu_cores(vm.cpu)
        except ValueError as exc:
            log_workflow_step(
                self.repo,
                step="create_vm",
                phase="rejected",
                message=f"Invalid sizing for VM '{vm.id}'.",
                details=str(exc),
                level="WARNING",
            )
            raise HTTPException(status_code=400, detail=str(exc)) from exc

        guardrails = self.repo.get_guardrails()
        if guardrails is not None:
            active_vms = self.repo.count_vms(statuses=ACTIVE_VM_STATES)
            if active_vms >= guardrails.max_vms:
                log_workflow_step(
                    self.repo,
                    step="create_vm",
                    phase="guardrail",
                    message="Rejected by max_vms guardrail.",
                    details=f"active_vms={active_vms}, max_vms={guardrails.max_vms}",
                    level="WARNING",
                )
                raise HTTPException(
                    status_code=409,
                    detail=f"Guardrail violation: max_vms={guardrails.max_vms} reached.",
                )
            if cpu_cores > guardrails.max_cpu_per_vm:
                log_workflow_step(
                    self.repo,
                    step="create_vm",
                    phase="guardrail",
                    message="Rejected by max_cpu_per_vm guardrail.",
                    details=f"requested_cpu={cpu_cores}, max_cpu_per_vm={guardrails.max_cpu_per_vm}",
                    level="WARNING",
                )
                raise HTTPException(
                    status_code=400,
                    detail=f"Guardrail violation: CPU per VM exceeds {guardrails.max_cpu_per_vm}.",
                )
            used_ram_mb = self.repo.sum_vm_ram_mb(statuses=ACTIVE_VM_STATES)
            free_after_create = settings.host_total_ram_mb - (used_ram_mb + ram_mb)
            if guardrails.overload_prevention and free_after_create < guardrails.min_host_ram_mb:
                log_workflow_step(
                    self.repo,
                    step="create_vm",
                    phase="guardrail",
                    message="Rejected by host reserve RAM guardrail.",
                    details=(
                        f"used_ram_mb={used_ram_mb}, requested_ram_mb={ram_mb}, "
                        f"free_after_create={free_after_create}, min_host_ram_mb={guardrails.min_host_ram_mb}"
                    ),
                    level="WARNING",
                )
                raise HTTPException(
                    status_code=409,
                    detail=(
                        "Guardrail violation: host reserve RAM would drop below "
                        f"{guardrails.min_host_ram_mb}MB."
                    ),
                )

        created_vm = self.repo.create_vm(
            vm_id=vm.id,
            country=normalize_country(vm.country),
            ram_mb=ram_mb,
            cpu_cores=cpu_cores,
            template_id=vm.template_id,
            status="creating",
        )
        operation = self.repo.create_operation(
            resource_type="vm",
            resource_id=created_vm.id,
            operation="create",
            status="pending",
            message="VM creation queued.",
        )
        self.repo.add_log("Orchestrator", "INFO", f"VM {created_vm.id} queued for creation.")
        log_workflow_step(
            self.repo,
            step="create_vm",
            phase="queued",
            message=f"VM '{created_vm.id}' queued for provisioning.",
            details=f"operation_id={operation.id}",
        )
        background_tasks.add_task(_run_vm_create_task, created_vm.id, operation.id)
        return self._to_vm_response(created_vm)

    def list_vms(self) -> list[MicroVMResponse]:
        vms = self.repo.list_vms(include_deleted=False)
        return [self._to_vm_response(vm) for vm in vms]

    def stop_vm(self, vm_id: str, background_tasks: BackgroundTasks) -> OperationStatus:
        vm = self.repo.get_vm(vm_id)
        if vm is None or vm.status == "deleted":
            raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")
        if vm.status == "stopped":
            operation = self.repo.create_operation(
                resource_type="vm",
                resource_id=vm_id,
                operation="stop",
                status="succeeded",
                message="VM already stopped.",
            )
            return self._to_operation_response(operation)
        if vm.status not in STOPPABLE_VM_STATES:
            raise HTTPException(status_code=409, detail=f"Cannot stop VM from state '{vm.status}'.")

        in_flight = self.repo.get_latest_operation("vm", vm_id, "stop", {"pending", "running"})
        if in_flight is not None:
            return self._to_operation_response(in_flight)

        self.repo.update_vm(vm, status="stopping")
        operation = self.repo.create_operation("vm", vm_id, "stop", "pending", "Stop queued.")
        self.repo.add_log("Orchestrator", "INFO", f"Stop requested for VM {vm_id}.")
        background_tasks.add_task(_run_vm_action_task, vm_id, operation.id, "stop")
        return self._to_operation_response(operation)

    def restart_vm(self, vm_id: str, background_tasks: BackgroundTasks) -> OperationStatus:
        vm = self.repo.get_vm(vm_id)
        if vm is None or vm.status == "deleted":
            raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")
        if vm.status not in RESTARTABLE_VM_STATES:
            raise HTTPException(status_code=409, detail=f"Cannot restart VM from state '{vm.status}'.")

        in_flight = self.repo.get_latest_operation("vm", vm_id, "restart", {"pending", "running"})
        if in_flight is not None:
            return self._to_operation_response(in_flight)

        self.repo.update_vm(vm, status="restarting")
        operation = self.repo.create_operation("vm", vm_id, "restart", "pending", "Restart queued.")
        self.repo.add_log("Orchestrator", "INFO", f"Restart requested for VM {vm_id}.")
        background_tasks.add_task(_run_vm_action_task, vm_id, operation.id, "restart")
        return self._to_operation_response(operation)

    def delete_vm(self, vm_id: str, background_tasks: BackgroundTasks) -> OperationStatus:
        vm = self.repo.get_vm(vm_id)
        if vm is None:
            raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")
        if vm.status == "deleted":
            operation = self.repo.create_operation(
                resource_type="vm",
                resource_id=vm_id,
                operation="delete",
                status="succeeded",
                message="VM already deleted.",
            )
            return self._to_operation_response(operation)
        if vm.status not in DELETABLE_VM_STATES:
            raise HTTPException(status_code=409, detail=f"Cannot delete VM from state '{vm.status}'.")

        in_flight = self.repo.get_latest_operation("vm", vm_id, "delete", {"pending", "running"})
        if in_flight is not None:
            return self._to_operation_response(in_flight)

        self.repo.update_vm(vm, status="deleting")
        operation = self.repo.create_operation("vm", vm_id, "delete", "pending", "Delete queued.")
        self.repo.add_log("Orchestrator", "INFO", f"Delete requested for VM {vm_id}.")
        background_tasks.add_task(_run_vm_action_task, vm_id, operation.id, "delete")
        return self._to_operation_response(operation)

    def get_operation(self, operation_id: str) -> OperationStatus:
        operation = self.repo.get_operation(operation_id)
        if operation is None:
            raise HTTPException(status_code=404, detail=f"Operation '{operation_id}' not found.")
        return self._to_operation_response(operation)

    def _to_vm_response(self, vm) -> MicroVMResponse:
        return MicroVMResponse(
            id=vm.id,
            country=vm.country,
            ram=ram_mb_to_text(vm.ram_mb),
            cpu=cpu_to_text(vm.cpu_cores),
            public_ip=vm.public_ip or "Pending",
            status=vm.status.capitalize(),
            uptime=seconds_to_uptime(vm.uptime_seconds),
            exit_node=vm.exit_node,
            verification_status=vm.verification_status,
        )

    def _to_operation_response(self, operation) -> OperationStatus:
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


def _run_vm_create_task(vm_id: str, operation_id: str) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        repo.update_operation_status(operation_id, "running", "Provisioning VM resources.")
        log_workflow_step(
            repo,
            step="create_vm",
            phase="running",
            message=f"Provisioning started for VM '{vm_id}'.",
            details=f"operation_id={operation_id}",
        )
        vm = repo.get_vm(vm_id)
        if vm is None:
            raise RuntimeError(f"VM '{vm_id}' does not exist.")

        template = repo.get_template(vm.template_id)
        if template is None:
            raise RuntimeError(f"Template '{vm.template_id}' not found.")

        adapter = InfrastructureAdapter()
        log_workflow_step(
            repo,
            step="create_vm",
            phase="infra",
            message=f"Calling infrastructure adapter for VM '{vm.id}'.",
            details=f"country={vm.country}, ram_mb={vm.ram_mb}, cpu_cores={vm.cpu_cores}",
        )
        infra_result = adapter.provision_vm(
            vm_id=vm.id,
            country=vm.country,
            ram_mb=vm.ram_mb,
            cpu_cores=vm.cpu_cores,
            template_base_image=template.base_image,
        )
        log_workflow_step(
            repo,
            step="create_vm",
            phase="infra",
            message=f"Infrastructure provision finished for VM '{vm.id}'.",
            details=f"public_ip={infra_result.public_ip}, provider={infra_result.provider}",
        )
        vm_public_ip = infra_result.public_ip
        verification_status = "Secure"
        identity_status = "Secure"
        trust_score = 96
        identity_asn = f"AS{random.randint(10000, 99999)}"
        tunnel = repo.find_connected_tunnel_by_country(vm.country)
        if tunnel is None:
            tunnel_id = f"wg-{short_code(vm.country)}-{random.randint(10, 99)}"
            while repo.get_tunnel(tunnel_id) is not None:
                tunnel_id = f"wg-{short_code(vm.country)}-{random.randint(10, 99)}"
            tunnel = repo.create_tunnel(
                tunnel_id=tunnel_id,
                country=vm.country,
                provider=infra_result.provider,
                latency_ms=infra_result.latency_ms,
                status="Connected",
                public_ip=vm_public_ip,
                vm_id=vm.id,
            )
        else:
            repo.update_tunnel(
                tunnel,
                vm_id=vm.id,
                status="Connected",
                public_ip=tunnel.public_ip or vm_public_ip,
            )

        repo.update_operation_status(operation_id, "running", f"Applying {vm.country} tunnel profile.")
        log_workflow_step(
            repo,
            step="assign_ip",
            phase="running",
            message=f"Starting tunnel rotation for VM '{vm.id}'.",
            details=f"tunnel_id={tunnel.id}, country={vm.country}",
        )
        rotation_result = None
        rotation_error: str | None = None
        try:
            rotation_result = adapter.rotate_tunnel(vm_id=vm.id, tunnel_id=tunnel.id, country=vm.country)
            vm_public_ip = rotation_result.public_ip or vm_public_ip
            identity_asn = rotation_result.asn
            log_workflow_step(
                repo,
                step="assign_ip",
                phase="success",
                message=f"Tunnel rotation succeeded for VM '{vm.id}'.",
                details=f"tunnel_id={tunnel.id}, public_ip={vm_public_ip}, asn={identity_asn}",
            )
            repo.update_tunnel(
                tunnel,
                public_ip=vm_public_ip,
                latency_ms=rotation_result.latency_ms,
                status="Connected",
                vm_id=vm.id,
            )
        except Exception as exc:
            rotation_error = str(exc)
            verification_status = "Warning"
            identity_status = "Warning"
            trust_score = 80
            repo.update_tunnel(
                tunnel,
                public_ip=tunnel.public_ip or vm_public_ip,
                latency_ms=tunnel.latency_ms or infra_result.latency_ms,
                status="Connected",
                vm_id=vm.id,
            )
            repo.add_log(
                "Orchestrator",
                "WARNING",
                f"Tunnel rotation failed during VM create for {vm.id}.",
                rotation_error,
            )
            log_workflow_step(
                repo,
                step="assign_ip",
                phase="warning",
                message=f"Tunnel rotation deferred for VM '{vm.id}'.",
                details=rotation_error,
                level="WARNING",
            )

        repo.update_vm(
            vm,
            status="running",
            public_ip=vm_public_ip,
            network_id=tunnel.id,
            exit_node=infra_result.exit_node,
            verification_status=verification_status,
            uptime_seconds=0,
        )
        repo.upsert_identity(
            vm_id=vm.id,
            public_ip=vm_public_ip,
            isp=tunnel.provider,
            asn=identity_asn,
            ip_type="Datacenter",
            country=vm.country,
            city=None,
            status=identity_status,
            trust_score=trust_score,
        )
        infra_summary = summarize_command_runs(infra_result.command_runs)
        if infra_summary:
            repo.add_log(
                "Orchestrator",
                "DEBUG",
                f"Infrastructure commands for VM {vm.id}.",
                infra_summary,
            )
        if rotation_result is not None:
            rotation_summary = summarize_command_runs(rotation_result.command_runs)
            if rotation_summary:
                repo.add_log(
                    "Orchestrator",
                    "DEBUG",
                    f"Rotation commands for VM {vm.id}.",
                    rotation_summary,
                )
        success_message = f"VM '{vm.id}' is running."
        if rotation_error:
            success_message = f"{success_message} Tunnel rotation deferred: {rotation_error}"
        repo.update_operation_status(operation_id, "succeeded", success_message)
        repo.add_log("Orchestrator", "INFO", f"VM {vm.id} is now running.")
        log_workflow_step(
            repo,
            step="create_vm",
            phase="success",
            message=f"VM '{vm.id}' is running.",
            details=f"public_ip={vm_public_ip}, network_id={tunnel.id}, verification_status={verification_status}",
        )
    except Exception as exc:
        vm = repo.get_vm(vm_id)
        if vm is not None and vm.status != "deleted":
            repo.update_vm(vm, status="error", verification_status="Warning")
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        repo.add_log("Orchestrator", "ERROR", f"VM {vm_id} creation failed.", str(exc))
        log_workflow_step(
            repo,
            step="create_vm",
            phase="failed",
            message=f"VM '{vm_id}' provisioning failed.",
            details=str(exc),
            level="ERROR",
        )
    finally:
        db.close()


def _run_vm_action_task(vm_id: str, operation_id: str, action: str) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        repo.update_operation_status(operation_id, "running", f"{action.capitalize()} in progress.")
        vm = repo.get_vm(vm_id)
        if vm is None:
            raise RuntimeError(f"VM '{vm_id}' does not exist.")
        adapter = InfrastructureAdapter()

        if action == "stop":
            command_runs = adapter.stop_vm(vm.id)
            repo.update_vm(vm, status="stopped", uptime_seconds=0)
            repo.update_operation_status(operation_id, "succeeded", f"VM '{vm_id}' stopped.")
            summary = summarize_command_runs(command_runs)
            if summary:
                repo.add_log("Orchestrator", "DEBUG", f"Stop commands for VM {vm_id}.", summary)
            repo.add_log("Orchestrator", "INFO", f"VM {vm_id} stopped.")
            return

        if action == "restart":
            command_runs = adapter.restart_vm(vm.id)
            public_ip = vm.public_ip or generate_public_ip(vm_id)
            repo.update_vm(
                vm,
                status="running",
                public_ip=public_ip,
                verification_status="Secure",
                uptime_seconds=0,
            )
            identity = repo.get_identity_by_vm(vm_id)
            if identity is not None:
                repo.upsert_identity(
                    vm_id=vm.id,
                    public_ip=public_ip,
                    isp=identity.isp,
                    asn=identity.asn,
                    ip_type=identity.ip_type,
                    country=identity.country,
                    city=identity.city,
                    status="Secure",
                    trust_score=max(identity.trust_score, 90),
                )
            repo.update_operation_status(operation_id, "succeeded", f"VM '{vm_id}' restarted.")
            summary = summarize_command_runs(command_runs)
            if summary:
                repo.add_log("Orchestrator", "DEBUG", f"Restart commands for VM {vm_id}.", summary)
            repo.add_log("Orchestrator", "INFO", f"VM {vm_id} restarted.")
            return

        if action == "delete":
            command_runs = adapter.delete_vm(vm.id)
            tunnel_id = vm.network_id
            repo.update_vm(
                vm,
                status="deleted",
                public_ip=None,
                network_id=None,
                exit_node=None,
                verification_status="None",
                uptime_seconds=0,
            )
            if tunnel_id:
                tunnel = repo.get_tunnel(tunnel_id)
                if tunnel is not None and tunnel.vm_id == vm.id:
                    repo.update_tunnel(tunnel, vm_id=None, status="Disconnected")
            repo.update_operation_status(operation_id, "succeeded", f"VM '{vm_id}' deleted.")
            summary = summarize_command_runs(command_runs)
            if summary:
                repo.add_log("Orchestrator", "DEBUG", f"Delete commands for VM {vm_id}.", summary)
            repo.add_log("Orchestrator", "INFO", f"VM {vm_id} deleted.")
            return

        raise RuntimeError(f"Unsupported VM action '{action}'.")
    except Exception as exc:
        vm = repo.get_vm(vm_id)
        if vm is not None and vm.status not in {"deleted"}:
            repo.update_vm(vm, status="error")
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        repo.add_log("Orchestrator", "ERROR", f"VM action '{action}' failed for {vm_id}.", str(exc))
    finally:
        db.close()
