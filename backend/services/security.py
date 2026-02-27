from __future__ import annotations

from ..config import settings
from ..models import SecurityAuditResponse
from ..repositories import StorageRepository
from .infra_adapter import InfrastructureAdapter, summarize_command_runs
from .workflow_logging import log_workflow_step


class SecurityService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_security_audit(self) -> SecurityAuditResponse:
        log_workflow_step(
            self.repo,
            step="verification",
            phase="audit",
            message="Security audit requested.",
        )
        running_vms = [vm for vm in self.repo.list_vms(include_deleted=False) if vm.status == "running"]
        tunnels = [tunnel for tunnel in self.repo.list_tunnels() if tunnel.status == "Connected"]
        runtime_snapshot = InfrastructureAdapter().collect_security_snapshot()

        fallback_namespaces = [f"{settings.vm_namespace_prefix}{vm.id.lower()}" for vm in running_vms]
        fallback_namespaces.extend([f"{settings.vm_namespace_prefix}{tunnel.id}" for tunnel in tunnels])
        namespaces = runtime_snapshot.namespaces or fallback_namespaces

        fallback_routes = [{"table": str(100 + idx), "dev": tunnel.id} for idx, tunnel in enumerate(tunnels, start=1)]
        routing_tables = runtime_snapshot.routing_tables or fallback_routes

        leak_detected = self._detect_leaks(running_vms, tunnels)
        if leak_detected:
            if runtime_snapshot.nftables_status.startswith("Active"):
                nftables_status = "Active/Warning"
            elif runtime_snapshot.nftables_status.startswith("Simulated"):
                nftables_status = "Simulated/Warning"
            else:
                nftables_status = "Inactive/Warning"
        else:
            nftables_status = runtime_snapshot.nftables_status

        response = SecurityAuditResponse(
            namespaces=namespaces,
            nftables_status=nftables_status,
            routing_tables=routing_tables,
        )
        log_workflow_step(
            self.repo,
            step="verification",
            phase="audit",
            message="Security audit completed.",
            details=(
                f"running_vms={len(running_vms)}, connected_tunnels={len(tunnels)}, "
                f"nftables_status={response.nftables_status}"
            ),
        )
        return response

    def test_isolation(self) -> dict:
        log_workflow_step(
            self.repo,
            step="verification",
            phase="isolation",
            message="Isolation test started.",
        )
        running_vms = [vm for vm in self.repo.list_vms(include_deleted=False) if vm.status == "running"]
        tunnels = self.repo.list_tunnels()
        tunnel_map = {tunnel.id: tunnel for tunnel in tunnels}
        runtime_snapshot = InfrastructureAdapter().collect_security_snapshot()

        leak_details = []
        for vm in running_vms:
            if not vm.network_id:
                leak_details.append(f"{vm.id}: no network namespace mapping")
                continue
            tunnel = tunnel_map.get(vm.network_id)
            if tunnel is None or tunnel.status != "Connected":
                leak_details.append(f"{vm.id}: tunnel {vm.network_id} is unavailable")

            if runtime_snapshot.namespaces:
                expected_namespace = f"{settings.vm_namespace_prefix}{vm.id.lower()}"
                if expected_namespace not in runtime_snapshot.namespaces:
                    leak_details.append(f"{vm.id}: namespace {expected_namespace} not detected")

        if runtime_snapshot.nftables_status.startswith("Inactive"):
            leak_details.append("nftables ruleset not active")

        if leak_details:
            details = "; ".join(leak_details)
            command_summary = summarize_command_runs(runtime_snapshot.command_runs)
            if command_summary:
                details = f"{details} | commands: {command_summary}"
            self.repo.add_log("Security", "WARNING", "Isolation test found potential leaks.", details)
            log_workflow_step(
                self.repo,
                step="verification",
                phase="isolation",
                message="Isolation test failed.",
                details=details,
                level="WARNING",
            )
            return {"status": "Failed", "details": details}

        command_summary = summarize_command_runs(runtime_snapshot.command_runs)
        if command_summary:
            self.repo.add_log("Security", "DEBUG", "Isolation check commands executed.", command_summary)
        self.repo.add_log("Security", "INFO", "Isolation test passed.")
        log_workflow_step(
            self.repo,
            step="verification",
            phase="isolation",
            message="Isolation test passed.",
        )
        return {"status": "Passed", "details": "No leaks detected"}

    @staticmethod
    def _detect_leaks(running_vms, connected_tunnels) -> bool:
        connected_ids = {item.id for item in connected_tunnels}
        for vm in running_vms:
            if not vm.network_id or vm.network_id not in connected_ids:
                return True
        return False
