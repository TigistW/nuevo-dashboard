from __future__ import annotations

import hashlib
import json
import re
from datetime import datetime
from uuid import uuid4

from fastapi import HTTPException

from ..models import (
    N8nRoleConfig,
    N8nRun,
    N8nRunCreateRequest,
    N8nRunEventRequest,
    N8nRunUpdateRequest,
    N8nWorkflow,
    N8nWorkflowImportRequest,
)
from ..repositories import StorageRepository
from .utils import isoformat_or_none

TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}
WORKFLOW_ID_PATTERN = re.compile(r"^[a-z0-9][a-z0-9._-]{1,127}$")


class N8nService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def list_workflows(self, include_definition: bool = False) -> list[N8nWorkflow]:
        rows = self.repo.list_n8n_workflows()
        return [self._to_workflow(row, include_definition=include_definition) for row in rows]

    def get_workflow(self, workflow_id: str, include_definition: bool = True) -> N8nWorkflow:
        row = self.repo.get_n8n_workflow(workflow_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"n8n workflow '{workflow_id}' not found.")
        return self._to_workflow(row, include_definition=include_definition)

    def import_workflow(self, payload: N8nWorkflowImportRequest) -> N8nWorkflow:
        definition_json = self._dump_json(payload.definition)
        version_hash = hashlib.sha256(definition_json.encode("utf-8")).hexdigest()
        workflow_id = self._normalize_workflow_id(payload.workflow_id, payload.name, version_hash)
        row = self.repo.upsert_n8n_workflow(
            workflow_id=workflow_id,
            name=payload.name.strip(),
            source=payload.source.strip(),
            active=bool(payload.active),
            version_hash=version_hash,
            definition_json=definition_json,
        )
        self.repo.add_log(
            "n8n",
            "INFO",
            f"Workflow '{row.id}' imported.",
            f"active={row.active}, source={row.source}, version={row.version_hash[:12]}",
        )
        return self._to_workflow(row, include_definition=True)

    def create_run(self, payload: N8nRunCreateRequest) -> N8nRun:
        role = self.repo.get_n8n_role()
        if role is not None and role.role == "eliminated":
            raise HTTPException(
                status_code=409,
                detail="n8n role is set to 'eliminated'; n8n run creation is disabled.",
            )

        workflow_id = payload.workflow_id.strip()
        workflow = self.repo.get_n8n_workflow(workflow_id)
        if workflow is None:
            raise HTTPException(status_code=404, detail=f"n8n workflow '{workflow_id}' not found.")

        run_id = f"n8n-run-{uuid4().hex[:12]}"
        now = datetime.utcnow()
        context_json = self._dump_json(payload.context)
        row = self.repo.create_n8n_run(
            run_id=run_id,
            workflow_id=workflow.id,
            trigger=(payload.trigger or "manual").strip(),
            status="running",
            context_json=context_json,
            external_execution_id=payload.external_execution_id,
            started_at=now,
            last_message="Run accepted by orchestrator.",
        )
        self.repo.add_log(
            "n8n",
            "INFO",
            f"Run '{row.id}' started for workflow '{workflow.id}'.",
            f"trigger={row.trigger}, external_execution_id={row.external_execution_id or 'n/a'}",
        )
        return self._to_run(row)

    def list_runs(self, limit: int = 200, workflow_id: str | None = None) -> list[N8nRun]:
        rows = self.repo.list_n8n_runs(limit=max(1, min(limit, 1000)), workflow_id=workflow_id)
        return [self._to_run(row) for row in rows]

    def get_run(self, run_id: str) -> N8nRun:
        row = self.repo.get_n8n_run(run_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"n8n run '{run_id}' not found.")
        return self._to_run(row)

    def append_run_event(self, run_id: str, payload: N8nRunEventRequest) -> N8nRun:
        row = self.repo.get_n8n_run(run_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"n8n run '{run_id}' not found.")
        if row.status in TERMINAL_STATUSES:
            raise HTTPException(status_code=409, detail=f"n8n run '{run_id}' is already terminal.")

        status = payload.status.strip().lower()
        phase = payload.phase.strip()
        message = payload.message.strip()
        event = {
            "at": datetime.utcnow().isoformat(),
            "phase": phase,
            "status": status,
            "message": message,
            "details": payload.details,
        }
        row = self.repo.append_n8n_run_event(row, event)
        updates: dict = {}
        now = datetime.utcnow()
        if row.started_at is None:
            updates["started_at"] = now
        if status in TERMINAL_STATUSES:
            updates["status"] = status
            updates["finished_at"] = now
        elif status in {"running", "warning", "pending"} and row.status != "running":
            updates["status"] = "running"
        if updates:
            row = self.repo.update_n8n_run(row, **updates)

        log_level = "ERROR" if status == "failed" else ("WARNING" if status == "warning" else "INFO")
        self.repo.add_log("n8n", log_level, f"Run '{run_id}' event: {phase}/{status}.", message)
        return self._to_run(row)

    def update_run_status(self, run_id: str, payload: N8nRunUpdateRequest) -> N8nRun:
        row = self.repo.get_n8n_run(run_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"n8n run '{run_id}' not found.")

        status = payload.status.strip().lower()
        updates: dict = {"status": status}
        now = datetime.utcnow()
        if status == "running" and row.started_at is None:
            updates["started_at"] = now
        if status in TERMINAL_STATUSES:
            updates["finished_at"] = now
        if payload.message is not None:
            updates["last_message"] = payload.message.strip()
        row = self.repo.update_n8n_run(row, **updates)

        if payload.message:
            event = {
                "at": now.isoformat(),
                "phase": "status_update",
                "status": status,
                "message": payload.message.strip(),
                "details": None,
            }
            row = self.repo.append_n8n_run_event(row, event)

        log_level = "ERROR" if status == "failed" else "INFO"
        self.repo.add_log("n8n", log_level, f"Run '{run_id}' status set to '{status}'.", payload.message)
        return self._to_run(row)

    def get_n8n_role(self) -> N8nRoleConfig:
        row = self.repo.get_n8n_role()
        if row is None:
            row = self.repo.upsert_n8n_role("secondary_automation", notes="Default role.")
        return N8nRoleConfig(role=row.role, notes=row.notes)

    def _to_workflow(self, row, include_definition: bool) -> N8nWorkflow:
        definition = self._load_json(row.definition_json, fallback={}) if include_definition else None
        return N8nWorkflow(
            workflow_id=row.id,
            name=row.name,
            source=row.source,
            active=bool(row.active),
            version_hash=row.version_hash,
            created_at=isoformat_or_none(row.created_at) or datetime.utcnow().isoformat(),
            updated_at=isoformat_or_none(row.updated_at) or datetime.utcnow().isoformat(),
            definition=definition,
        )

    def _to_run(self, row) -> N8nRun:
        return N8nRun(
            id=row.id,
            workflow_id=row.workflow_id,
            external_execution_id=row.external_execution_id,
            trigger=row.trigger,
            status=row.status,
            context=self._load_json(row.context_json, fallback={}),
            events=self._load_json(row.events_json, fallback=[]),
            last_message=row.last_message,
            created_at=isoformat_or_none(row.created_at) or datetime.utcnow().isoformat(),
            started_at=isoformat_or_none(row.started_at),
            finished_at=isoformat_or_none(row.finished_at),
            updated_at=isoformat_or_none(row.updated_at) or datetime.utcnow().isoformat(),
        )

    def _normalize_workflow_id(self, explicit_id: str | None, name: str, version_hash: str) -> str:
        if explicit_id is not None and explicit_id.strip():
            workflow_id = explicit_id.strip().lower()
        else:
            base = re.sub(r"[^a-z0-9._-]+", "-", name.strip().lower())
            base = re.sub(r"-{2,}", "-", base).strip("-")
            if not base:
                base = "n8n-workflow"
            workflow_id = f"{base[:96]}-{version_hash[:8]}"
        if not WORKFLOW_ID_PATTERN.match(workflow_id):
            raise HTTPException(
                status_code=400,
                detail=(
                    "workflow_id must match pattern "
                    "'^[a-z0-9][a-z0-9._-]{1,127}$'."
                ),
            )
        return workflow_id

    @staticmethod
    def _dump_json(value: dict) -> str:
        return json.dumps(value or {}, sort_keys=True, separators=(",", ":"), ensure_ascii=True)

    @staticmethod
    def _load_json(raw: str | None, fallback):
        if not raw:
            return fallback
        try:
            parsed = json.loads(raw)
        except Exception:
            return fallback
        if isinstance(fallback, list):
            return parsed if isinstance(parsed, list) else fallback
        return parsed if isinstance(parsed, dict) else fallback
