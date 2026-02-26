from __future__ import annotations

from datetime import datetime
from urllib.parse import urlparse

from fastapi import BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..models import (
    RepoCreate,
    Repository,
    SystemControlResponse,
    TerminalCommandResponse,
    ThreatPoint,
    WorkflowExecutionResponse,
)
from ..repositories import StorageRepository


class RepositoryService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_repositories(self) -> list[Repository]:
        repos = self.repo.list_repositories()
        return [
            Repository(
                id=str(item.id),
                name=item.name,
                url=item.url,
                status=item.status,
                lastSync=item.last_sync.strftime("%Y-%m-%d %H:%M"),
                apiEndpoint=item.api_endpoint,
            )
            for item in repos
        ]

    def create_repository(self, payload: RepoCreate) -> Repository:
        parsed = urlparse(payload.url)
        if parsed.scheme not in {"http", "https"} or not parsed.netloc:
            raise HTTPException(status_code=400, detail="Invalid repository URL.")

        if self.repo.get_repository_by_url(payload.url) is not None:
            raise HTTPException(status_code=409, detail="Repository URL already registered.")

        name = parsed.path.rstrip("/").split("/")[-1] or parsed.netloc
        api_endpoint = f"/api/v1/identity/custom-{datetime.utcnow().strftime('%H%M%S%f')}"
        created = self.repo.create_repository(
            name=name,
            url=payload.url,
            status="active",
            api_endpoint=api_endpoint,
        )
        self.repo.add_log("Repository", "INFO", f"Repository created: {created.url}")
        return Repository(
            id=str(created.id),
            name=created.name,
            url=created.url,
            status=created.status,
            lastSync=created.last_sync.strftime("%Y-%m-%d %H:%M"),
            apiEndpoint=created.api_endpoint,
        )

    def system_control(self, action: str) -> SystemControlResponse:
        normalized_action = action.strip().lower()
        allowed = {"start", "stop", "restart", "status", "drain"}
        if normalized_action not in allowed:
            raise HTTPException(status_code=400, detail=f"Unsupported action '{action}'.")

        operation = self.repo.create_operation(
            resource_type="system",
            resource_id="orchestrator",
            operation=normalized_action,
            status="pending",
            message=f"System action '{normalized_action}' requested.",
        )
        self.repo.update_operation_status(operation.id, "succeeded", f"System action '{normalized_action}' applied.")
        self.repo.add_log("System", "INFO", f"System control action executed: {normalized_action}")
        return SystemControlResponse(status="success", action=normalized_action, timestamp=datetime.utcnow().isoformat())

    def get_threats(self) -> list[ThreatPoint]:
        samples = self.repo.list_threat_samples(limit=24)
        return [ThreatPoint(time=item.time_label, threats=item.threats) for item in samples]

    def terminal_command(self, vm_id: str, command: str) -> TerminalCommandResponse:
        vm = self.repo.get_vm(vm_id)
        if vm is None or vm.status == "deleted":
            raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")

        sanitized = command.strip()
        if not sanitized:
            raise HTTPException(status_code=400, detail="Command cannot be empty.")

        canned = {
            "ls": "bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var",
            "ifconfig": "eth0: inet 10.0.0.5 netmask 255.255.255.0",
            "status": f"vm={vm.id} state={vm.status} ip={vm.public_ip or 'pending'}",
            "uptime": f"{vm.id} up for {vm.uptime_seconds}s",
        }
        output = canned.get(sanitized, f"sh: {sanitized}: command not found")
        self.repo.add_log("Terminal", "INFO", f"Command on {vm_id}: {sanitized}")
        return TerminalCommandResponse(output=output)

    def execute_workflow(self, workflow_id: str, background_tasks: BackgroundTasks) -> WorkflowExecutionResponse:
        workflow_id = workflow_id.strip()
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id cannot be empty.")

        operation = self.repo.create_operation(
            resource_type="workflow",
            resource_id=workflow_id,
            operation="execute",
            status="pending",
            message=f"Workflow '{workflow_id}' queued.",
        )
        self.repo.add_log("Workflow", "INFO", f"Workflow execution requested: {workflow_id}")
        background_tasks.add_task(_run_workflow_task, workflow_id, operation.id)
        return WorkflowExecutionResponse(
            status="started",
            workflow_id=workflow_id,
            timestamp=datetime.utcnow().isoformat(),
            operation_id=operation.id,
        )


def _run_workflow_task(workflow_id: str, operation_id: str) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        repo.update_operation_status(operation_id, "running", f"Workflow '{workflow_id}' started.")
        repo.update_operation_status(operation_id, "succeeded", f"Workflow '{workflow_id}' completed.")
        repo.add_log("Workflow", "INFO", f"Workflow completed: {workflow_id}")
    except Exception as exc:
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        repo.add_log("Workflow", "ERROR", f"Workflow failed: {workflow_id}", str(exc))
    finally:
        db.close()
