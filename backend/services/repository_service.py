from __future__ import annotations

import json
from datetime import datetime
from uuid import uuid4
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
from .workflow_logging import log_workflow_step


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
        log_workflow_step(
            self.repo,
            step="execute_task",
            phase="request",
            message=f"Terminal command requested for VM '{vm_id}'.",
            details=f"command={command}",
        )
        vm = self.repo.get_vm(vm_id)
        if vm is None or vm.status == "deleted":
            log_workflow_step(
                self.repo,
                step="execute_task",
                phase="rejected",
                message=f"VM '{vm_id}' not found for terminal command.",
                level="WARNING",
            )
            raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")

        sanitized = command.strip()
        if not sanitized:
            log_workflow_step(
                self.repo,
                step="execute_task",
                phase="rejected",
                message="Empty terminal command rejected.",
                level="WARNING",
            )
            raise HTTPException(status_code=400, detail="Command cannot be empty.")

        canned = {
            "ls": "bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var",
            "ifconfig": "eth0: inet 10.0.0.5 netmask 255.255.255.0",
            "status": f"vm={vm.id} state={vm.status} ip={vm.public_ip or 'pending'}",
            "uptime": f"{vm.id} up for {vm.uptime_seconds}s",
        }
        output = canned.get(sanitized, f"sh: {sanitized}: command not found")
        self.repo.add_log("Terminal", "INFO", f"Command on {vm_id}: {sanitized}")
        log_workflow_step(
            self.repo,
            step="execute_task",
            phase="success",
            message=f"Terminal command completed for VM '{vm_id}'.",
            details=f"command={sanitized}, output={output[:160]}",
        )
        return TerminalCommandResponse(output=output)

    def execute_workflow(self, workflow_id: str, background_tasks: BackgroundTasks) -> WorkflowExecutionResponse:
        workflow_id = workflow_id.strip()
        if not workflow_id:
            raise HTTPException(status_code=400, detail="workflow_id cannot be empty.")

        n8n_run_id: str | None = None
        n8n_workflow = self.repo.get_n8n_workflow(workflow_id)
        n8n_role = self.repo.get_n8n_role()
        if n8n_workflow is not None and (n8n_role is None or n8n_role.role != "eliminated"):
            n8n_run_id = f"n8n-run-{uuid4().hex[:12]}"
            self.repo.create_n8n_run(
                run_id=n8n_run_id,
                workflow_id=workflow_id,
                trigger="repository_execute",
                status="running",
                context_json=json.dumps({"entrypoint": "repository.execute_workflow"}),
                started_at=datetime.utcnow(),
                last_message="Run accepted by repository endpoint.",
            )
            self.repo.add_log(
                "n8n",
                "INFO",
                f"n8n run '{n8n_run_id}' linked to workflow execution.",
                f"workflow_id={workflow_id}",
            )

        operation = self.repo.create_operation(
            resource_type="workflow",
            resource_id=workflow_id,
            operation="execute",
            status="pending",
            message=f"Workflow '{workflow_id}' queued.",
        )
        self.repo.add_log("Workflow", "INFO", f"Workflow execution requested: {workflow_id}")
        background_tasks.add_task(_run_workflow_task, workflow_id, operation.id, n8n_run_id)
        return WorkflowExecutionResponse(
            status="started",
            workflow_id=workflow_id,
            timestamp=datetime.utcnow().isoformat(),
            operation_id=operation.id,
        )


def _run_workflow_task(workflow_id: str, operation_id: str, n8n_run_id: str | None = None) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        repo.update_operation_status(operation_id, "running", f"Workflow '{workflow_id}' started.")
        if n8n_run_id:
            n8n_run = repo.get_n8n_run(n8n_run_id)
            if n8n_run is not None:
                repo.append_n8n_run_event(
                    n8n_run,
                    {
                        "at": datetime.utcnow().isoformat(),
                        "phase": "dispatch",
                        "status": "running",
                        "message": "Repository workflow dispatcher started execution.",
                        "details": None,
                    },
                )
        repo.update_operation_status(operation_id, "succeeded", f"Workflow '{workflow_id}' completed.")
        if n8n_run_id:
            n8n_run = repo.get_n8n_run(n8n_run_id)
            if n8n_run is not None:
                repo.update_n8n_run(
                    n8n_run,
                    status="succeeded",
                    finished_at=datetime.utcnow(),
                    last_message="Run completed from repository workflow dispatcher.",
                )
                n8n_run = repo.get_n8n_run(n8n_run_id)
                if n8n_run is not None:
                    repo.append_n8n_run_event(
                        n8n_run,
                        {
                            "at": datetime.utcnow().isoformat(),
                            "phase": "completed",
                            "status": "succeeded",
                            "message": "Repository workflow dispatcher completed execution.",
                            "details": None,
                        },
                    )
        repo.add_log("Workflow", "INFO", f"Workflow completed: {workflow_id}")
    except Exception as exc:
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        if n8n_run_id:
            run = repo.get_n8n_run(n8n_run_id)
            if run is not None:
                repo.update_n8n_run(
                    run,
                    status="failed",
                    finished_at=datetime.utcnow(),
                    last_message=str(exc),
                )
        repo.add_log("Workflow", "ERROR", f"Workflow failed: {workflow_id}", str(exc))
    finally:
        db.close()
