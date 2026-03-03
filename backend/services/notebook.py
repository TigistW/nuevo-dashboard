from __future__ import annotations

import math
import random
import time
from datetime import datetime, timedelta

from fastapi import HTTPException

from ..models import (
    NotebookDistributionPlan,
    NotebookDistributionRequest,
    NotebookEventRequest,
    NotebookEventResult,
    NotebookSession,
    NotebookSessionCreate,
    NotebookTickResult,
)
from ..repositories import StorageRepository
from .utils import isoformat_or_none


class NotebookService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def list_notebooks(self, vm_id: str | None = None) -> list[NotebookSession]:
        rows = self.repo.list_notebook_sessions(vm_id=vm_id)
        return [self._to_session(row) for row in rows]

    def create_notebook(self, payload: NotebookSessionCreate) -> NotebookSession:
        vm = self.repo.get_vm(payload.vm_id)
        if vm is None or vm.status == "deleted":
            raise HTTPException(status_code=404, detail=f"VM '{payload.vm_id}' not found.")
        notebook_id = (payload.id or f"nb-{int(time.time() * 1000)}").strip()
        if self.repo.get_notebook_session(notebook_id) is not None:
            raise HTTPException(status_code=409, detail=f"Notebook '{notebook_id}' already exists.")

        load_percent = random.randint(68, 82)
        gpu_usage = round((payload.gpu_assigned_gb * load_percent) / 100.0, 2)
        ram_usage = round(gpu_usage * random.uniform(0.45, 0.9), 2)
        now = datetime.utcnow()
        row = self.repo.create_notebook_session(
            notebook_id=notebook_id,
            vm_id=vm.id,
            account_email=payload.account_email,
            status="Active",
            gpu_assigned_gb=float(payload.gpu_assigned_gb),
            gpu_usage_gb=gpu_usage,
            ram_usage_gb=ram_usage,
            load_percent=load_percent,
            cycle_state="active",
            next_transition_at=now + timedelta(minutes=random.randint(4, 10)),
            session_expires_at=now + timedelta(hours=random.randint(5, 9), minutes=random.randint(0, 45)),
        )
        self.repo.add_log("Notebook", "INFO", f"Notebook session '{row.id}' created for VM '{vm.id}'.")
        return self._to_session(row)

    def plan_distribution(self, payload: NotebookDistributionRequest) -> NotebookDistributionPlan:
        low = min(payload.target_min_percent, payload.target_max_percent)
        high = max(payload.target_min_percent, payload.target_max_percent)
        avg_util = max(0.01, (low + high) / 200.0)
        effective_gpu = max(0.1, payload.gpu_per_notebook_gb * avg_util)
        notebooks_required = max(1, int(math.ceil(payload.required_gpu_gb / effective_gpu)))

        targets: list[float] = []
        remaining = payload.required_gpu_gb
        for _ in range(notebooks_required):
            utilization = random.randint(low, high) / 100.0
            per_target = round(payload.gpu_per_notebook_gb * utilization, 2)
            if len(targets) == notebooks_required - 1:
                per_target = round(max(0.1, remaining), 2)
            targets.append(per_target)
            remaining -= per_target
        return NotebookDistributionPlan(
            required_gpu_gb=float(payload.required_gpu_gb),
            notebooks_required=notebooks_required,
            target_range_percent=(low, high),
            per_notebook_target_gb=targets,
        )

    def tick(self) -> NotebookTickResult:
        rows = self.repo.list_notebook_sessions()
        now = datetime.utcnow()
        updated = 0
        rotated = 0
        resting = 0
        warnings = 0

        for row in rows:
            changes = {}
            status = (row.status or "Active").lower()
            cycle_state = (row.cycle_state or "active").lower()
            if row.session_expires_at is not None and row.session_expires_at <= (now + timedelta(minutes=25)):
                changes["status"] = "Rotating"
                changes["warning_message"] = "Preventive rotation: notebook nearing session limit."
                changes["session_expires_at"] = now + timedelta(hours=random.randint(4, 8), minutes=random.randint(0, 45))
                changes["next_transition_at"] = now + timedelta(minutes=random.randint(3, 8))
                rotated += 1
                warnings += 1
                self.repo.apply_vm_risk_event(row.vm_id, 1, reason=f"Notebook {row.id} rotated preventively.")
            elif row.next_transition_at is None or row.next_transition_at <= now:
                # Oscillation + micro-rest to avoid flat saturation.
                if cycle_state == "active":
                    changes["cycle_state"] = "micro_pause"
                    changes["status"] = "Resting"
                    pause_percent = random.randint(25, 45)
                    changes["load_percent"] = pause_percent
                    changes["next_transition_at"] = now + timedelta(minutes=random.randint(2, 5))
                    resting += 1
                else:
                    changes["cycle_state"] = "active"
                    changes["status"] = "Active"
                    active_percent = random.randint(70, 85)
                    changes["load_percent"] = active_percent
                    changes["next_transition_at"] = now + timedelta(minutes=random.randint(4, 12))

                load_percent = int(changes.get("load_percent", row.load_percent))
                gpu_usage = round((row.gpu_assigned_gb * load_percent) / 100.0, 2)
                changes["gpu_usage_gb"] = gpu_usage
                changes["ram_usage_gb"] = round(gpu_usage * random.uniform(0.45, 0.9), 2)
                changes["warning_message"] = None if changes.get("status") != "Resting" else "Micro-pause cycle."

            if changes:
                self.repo.update_notebook_session(row, **changes)
                updated += 1
                if status in {"warning", "disconnected"}:
                    self.repo.apply_vm_risk_event(row.vm_id, 1, reason=f"Notebook pressure update for {row.id}.")

        return NotebookTickResult(updated=updated, rotated=rotated, resting=resting, warnings=warnings)

    def report_event(self, notebook_id: str, payload: NotebookEventRequest) -> NotebookEventResult:
        row = self.repo.get_notebook_session(notebook_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"Notebook '{notebook_id}' not found.")
        event = (payload.event_type or "").strip().lower()
        actions: list[str] = []
        risk_delta = 0
        updates = {}

        if event in {"warning", "imminent_disconnect"}:
            updates["status"] = "Warning"
            updates["warning_message"] = payload.details or "Notebook warning signal detected."
            reduced = max(35, int(row.load_percent) - random.randint(10, 20))
            updates["load_percent"] = reduced
            updates["gpu_usage_gb"] = round((row.gpu_assigned_gb * reduced) / 100.0, 2)
            updates["ram_usage_gb"] = round(updates["gpu_usage_gb"] * random.uniform(0.45, 0.9), 2)
            updates["next_transition_at"] = datetime.utcnow() + timedelta(minutes=random.randint(1, 4))
            actions.extend(["reduce_load", "monitor_session"])
            risk_delta = 1
        elif event in {"stopped", "restart", "unexpected_restart"}:
            updates["status"] = "Rotating"
            updates["restart_count"] = int(row.restart_count or 0) + 1
            updates["warning_message"] = payload.details or "Notebook stopped unexpectedly."
            updates["next_transition_at"] = datetime.utcnow() + timedelta(minutes=2)
            updates["session_expires_at"] = datetime.utcnow() + timedelta(hours=random.randint(4, 8))
            actions.extend(["redistribute_load", "restart_notebook", "preventive_rotation"])
            risk_delta = 3
        elif event in {"rate_limit", "block", "captcha"}:
            updates["status"] = "Warning"
            updates["warning_message"] = payload.details or "Rate-limiting or block detected."
            updates["next_transition_at"] = datetime.utcnow() + timedelta(minutes=random.randint(4, 9))
            actions.extend(["pause_automation", "evaluate_ip_rotation"])
            risk_delta = 5
        else:
            updates["warning_message"] = payload.details or f"Event '{payload.event_type}' recorded."
            actions.append("event_recorded")

        self.repo.update_notebook_session(row, **updates)
        if risk_delta:
            self.repo.apply_vm_risk_event(row.vm_id, risk_delta, reason=f"Notebook event: {event}")
        return NotebookEventResult(
            notebook_id=row.id,
            status=updates.get("status", row.status),
            actions=actions,
            risk_delta=risk_delta,
        )

    def _to_session(self, row) -> NotebookSession:
        return NotebookSession(
            id=row.id,
            vm_id=row.vm_id,
            account_email=row.account_email,
            status=row.status,
            gpu_assigned_gb=row.gpu_assigned_gb,
            gpu_usage_gb=row.gpu_usage_gb,
            ram_usage_gb=row.ram_usage_gb,
            load_percent=row.load_percent,
            cycle_state=row.cycle_state,
            next_transition_at=isoformat_or_none(row.next_transition_at),
            session_expires_at=isoformat_or_none(row.session_expires_at),
            warning_message=row.warning_message,
            restart_count=row.restart_count,
            risk_score=row.risk_score,
            updated_at=isoformat_or_none(row.updated_at) or datetime.utcnow().isoformat(),
        )
