from __future__ import annotations

import random

from fastapi import BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..models import IdentityResponse, OperationStatus, TunnelResponse
from ..repositories import StorageRepository
from .infra_adapter import InfrastructureAdapter, summarize_command_runs
from .utils import (
    estimate_latency_ms,
    isoformat_or_none,
    normalize_country,
    short_code,
)
from .workflow_logging import log_workflow_step


class NetworkService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_tunnels(self) -> list[TunnelResponse]:
        tunnels = self.repo.list_tunnels()
        return [self._to_tunnel_response(tunnel) for tunnel in tunnels]

    def get_identities(self) -> list[IdentityResponse]:
        identities = self.repo.list_identities()
        return [
            IdentityResponse(
                vm_id=item.vm_id,
                public_ip=item.public_ip,
                isp=item.isp,
                asn=item.asn,
                ip_type=item.ip_type,
                country=item.country,
                city=item.city,
                status=item.status,
                last_check=item.last_check.isoformat(),
                trust_score=item.trust_score,
            )
            for item in identities
        ]

    def rotate_ip(self, vm_id: str, background_tasks: BackgroundTasks) -> OperationStatus:
        log_workflow_step(
            self.repo,
            step="assign_ip",
            phase="request",
            message=f"IP rotation requested for VM '{vm_id}'.",
        )
        vm = self.repo.get_vm(vm_id)
        if vm is None or vm.status == "deleted":
            log_workflow_step(
                self.repo,
                step="assign_ip",
                phase="rejected",
                message=f"VM '{vm_id}' not found for IP rotation.",
                level="WARNING",
            )
            raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")

        tunnel = self.repo.find_tunnel_for_vm(vm_id)
        if tunnel is None:
            tunnel = self.repo.find_connected_tunnel_by_country(vm.country)
            if tunnel is None:
                tunnel_id = f"wg-{short_code(vm.country)}-{random.randint(10, 99)}"
                while self.repo.get_tunnel(tunnel_id) is not None:
                    tunnel_id = f"wg-{short_code(vm.country)}-{random.randint(10, 99)}"
                tunnel = self.repo.create_tunnel(
                    tunnel_id=tunnel_id,
                    country=vm.country,
                    provider="AutoProvisioned",
                    latency_ms=estimate_latency_ms(vm.country),
                    status="Connected",
                    public_ip=vm.public_ip,
                    vm_id=vm.id,
                )
            else:
                self.repo.update_tunnel(tunnel, vm_id=vm.id)

        in_flight = self.repo.get_latest_operation("tunnel", tunnel.id, "rotate", {"pending", "running"})
        if in_flight is not None:
            log_workflow_step(
                self.repo,
                step="assign_ip",
                phase="deduplicated",
                message=f"Returning in-flight rotation for VM '{vm_id}'.",
                details=f"operation_id={in_flight.id}, tunnel_id={tunnel.id}",
            )
            return self._to_operation_response(in_flight)

        operation = self.repo.create_operation(
            resource_type="tunnel",
            resource_id=tunnel.id,
            operation="rotate",
            status="pending",
            message=f"IP rotation queued for VM '{vm_id}'.",
        )
        self.repo.add_log("Network", "INFO", f"IP rotation requested for VM {vm_id}.")
        log_workflow_step(
            self.repo,
            step="assign_ip",
            phase="queued",
            message=f"IP rotation queued for VM '{vm_id}'.",
            details=f"operation_id={operation.id}, tunnel_id={tunnel.id}, country={vm.country}",
        )
        background_tasks.add_task(_run_rotation_task, vm_id, tunnel.id, operation.id)
        return self._to_operation_response(operation)

    def register_vps(self, country: str, ip: str, provider: str = "Custom") -> TunnelResponse:
        normalized_country = normalize_country(country)
        adapter = InfrastructureAdapter()
        try:
            command_runs = adapter.register_vps(country=normalized_country, ip=ip, provider=provider)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        tunnel_id = f"wg-{short_code(normalized_country)}-{random.randint(100, 999)}"
        while self.repo.get_tunnel(tunnel_id) is not None:
            tunnel_id = f"wg-{short_code(normalized_country)}-{random.randint(100, 999)}"

        tunnel = self.repo.create_tunnel(
            tunnel_id=tunnel_id,
            country=normalized_country,
            provider=provider,
            latency_ms=estimate_latency_ms(normalized_country),
            status="Connected",
            public_ip=ip,
            vm_id=None,
        )
        summary = summarize_command_runs(command_runs)
        if summary:
            self.repo.add_log("Network", "DEBUG", f"Tunnel registration commands for {tunnel.id}.", summary)
        self.repo.add_log("Network", "INFO", f"Registered new VPS tunnel {tunnel.id} ({normalized_country}).")
        return self._to_tunnel_response(tunnel)

    def dns_leak_test(self, vm_id: str | None = None) -> dict:
        log_workflow_step(
            self.repo,
            step="verification",
            phase="running",
            message="DNS leak test started.",
            details=f"scope_vm_id={vm_id or 'all'}",
        )
        target_vms = self.repo.list_vms(include_deleted=False)
        if vm_id:
            target_vms = [vm for vm in target_vms if vm.id == vm_id and vm.status != "deleted"]
            if not target_vms:
                raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")

        leaks: list[dict] = []
        for vm in target_vms:
            if vm.status != "running":
                continue
            if not vm.network_id:
                leaks.append({"vm_id": vm.id, "issue": "Missing tunnel assignment"})
                continue
            tunnel = self.repo.get_tunnel(vm.network_id)
            if tunnel is None or tunnel.status != "Connected":
                leaks.append({"vm_id": vm.id, "issue": "Assigned tunnel is not connected"})

        status = "Secure" if not leaks else "LeakDetected"
        level = "INFO" if status == "Secure" else "WARNING"
        details = None if not leaks else "; ".join(f"{item['vm_id']}:{item['issue']}" for item in leaks)
        log_workflow_step(
            self.repo,
            step="verification",
            phase="dns",
            message=f"DNS leak test completed with status '{status}'.",
            details=details,
            level=level,
        )
        return {"status": status, "leaks": leaks}

    def _to_tunnel_response(self, tunnel) -> TunnelResponse:
        return TunnelResponse(
            id=tunnel.id,
            country=tunnel.country,
            provider=tunnel.provider,
            latency=f"{tunnel.latency_ms}ms",
            status=tunnel.status,
            public_ip=tunnel.public_ip or "---",
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


def _run_rotation_task(vm_id: str, tunnel_id: str, operation_id: str) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        repo.update_operation_status(operation_id, "running", "Tunnel rotation in progress.")
        log_workflow_step(
            repo,
            step="assign_ip",
            phase="running",
            message=f"Tunnel rotation started for VM '{vm_id}'.",
            details=f"operation_id={operation_id}, tunnel_id={tunnel_id}",
        )
        vm = repo.get_vm(vm_id)
        tunnel = repo.get_tunnel(tunnel_id)
        if vm is None or tunnel is None:
            raise RuntimeError("VM or tunnel not found for rotation.")

        adapter = InfrastructureAdapter()
        rotation_result = adapter.rotate_tunnel(vm_id=vm.id, tunnel_id=tunnel.id, country=vm.country)
        new_ip = rotation_result.public_ip

        repo.update_tunnel(
            tunnel,
            public_ip=new_ip,
            latency_ms=rotation_result.latency_ms,
            status="Connected",
            vm_id=vm.id,
        )
        repo.update_vm(vm, public_ip=new_ip, network_id=tunnel.id, verification_status="Secure")
        repo.upsert_identity(
            vm_id=vm.id,
            public_ip=new_ip,
            isp=tunnel.provider,
            asn=rotation_result.asn,
            ip_type="Datacenter",
            country=vm.country,
            city=None,
            status="Secure",
            trust_score=95,
        )

        repo.update_operation_status(operation_id, "succeeded", f"Tunnel {tunnel.id} rotated for VM {vm.id}.")
        summary = summarize_command_runs(rotation_result.command_runs)
        if summary:
            repo.add_log("Network", "DEBUG", f"Rotation commands for tunnel {tunnel.id}.", summary)
        repo.add_log("Network", "INFO", f"Rotated tunnel {tunnel.id} for VM {vm.id}.")
        log_workflow_step(
            repo,
            step="assign_ip",
            phase="success",
            message=f"IP rotation completed for VM '{vm.id}'.",
            details=f"public_ip={new_ip}, tunnel_id={tunnel.id}",
        )
    except Exception as exc:
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        repo.add_log("Network", "ERROR", f"Tunnel rotation failed for VM {vm_id}.", str(exc))
        log_workflow_step(
            repo,
            step="assign_ip",
            phase="failed",
            message=f"IP rotation failed for VM '{vm_id}'.",
            details=str(exc),
            level="ERROR",
        )
    finally:
        db.close()
