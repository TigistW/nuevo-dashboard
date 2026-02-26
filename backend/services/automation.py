from __future__ import annotations

import time

from fastapi import BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..models import HealingRule, JobEnqueueResponse, Task
from ..repositories import StorageRepository

RUNNABLE_VM_STATES = {"running"}
TERMINAL_VM_STATES = {"deleted", "error", "stopped"}
MAX_JOB_RETRIES = 2

# (stage name, target progress %, simulated stage duration in seconds)
JOB_STAGES: list[tuple[str, int, float]] = [
    ("preparing runtime environment", 12, 1.0),
    ("allocating VM resources", 28, 1.4),
    ("starting workload container", 48, 1.6),
    ("executing compute workload", 74, 2.2),
    ("collecting artifacts", 90, 1.2),
]

class JobRetryableError(RuntimeError):
    pass


class JobFatalError(RuntimeError):
    pass


class AutomationService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_healing_rules(self) -> list[HealingRule]:
        rules = self.repo.list_healing_rules()
        return [HealingRule(id=rule.id, trigger=rule.trigger, action=rule.action, enabled=rule.enabled) for rule in rules]

    def create_job(self, task: Task, background_tasks: BackgroundTasks) -> JobEnqueueResponse:
        if self.repo.get_scheduler_job(task.id) is not None:
            raise HTTPException(status_code=409, detail=f"Job '{task.id}' already exists.")

        assigned_vm_id = self._resolve_job_vm(task.vm_id)

        job = self.repo.create_scheduler_job(
            job_id=task.id,
            task_type=task.task_type,
            vm_id=assigned_vm_id,
            status="Queued",
            progress=0,
        )
        target = assigned_vm_id or "AUTO"
        operation = self.repo.create_operation(
            resource_type="job",
            resource_id=job.id,
            operation="schedule",
            status="pending",
            message=f"Job '{job.id}' queued for {target}.",
        )
        self.repo.add_log("Automation", "INFO", f"Job {job.id} queued (target={target}).")
        background_tasks.add_task(_run_job_task, job.id, operation.id)
        return JobEnqueueResponse(message="Job queued", job_id=job.id, status=job.status)

    def get_job_queue(self) -> list[Task]:
        jobs = self.repo.list_scheduler_jobs()
        return [
            Task(
                id=job.id,
                task_type=job.task_type,
                vm_id=job.vm_id,
                status=job.status,
                progress=job.progress,
                retry_count=job.retry_count,
                error_message=job.error_message,
            )
            for job in jobs
        ]

    def _resolve_job_vm(self, vm_id: str | None) -> str | None:
        if vm_id:
            vm = self.repo.get_vm(vm_id)
            if vm is None or vm.status == "deleted":
                raise HTTPException(status_code=404, detail=f"VM '{vm_id}' not found.")
            if vm.status not in RUNNABLE_VM_STATES:
                raise HTTPException(
                    status_code=409,
                    detail=f"VM '{vm_id}' is '{vm.status}'. Job dispatch requires a running VM.",
                )
            return vm.id

        # Auto-assignment: prefer the least loaded running VM.
        running_vms = [vm for vm in self.repo.list_vms(include_deleted=False) if vm.status in RUNNABLE_VM_STATES]
        if not running_vms:
            return None

        load_by_vm = {vm.id: 0 for vm in running_vms}
        active_job_statuses = {"Queued", "Running", "Retrying"}
        for job in self.repo.list_scheduler_jobs():
            if job.vm_id in load_by_vm and job.status in active_job_statuses:
                load_by_vm[job.vm_id] += 1

        selected = min(running_vms, key=lambda vm: (load_by_vm[vm.id], vm.created_at))
        return selected.id

    def validate_deployment(self, vm_id: str) -> dict:
        checks = []
        vm = self.repo.get_vm(vm_id)
        guardrails = self.repo.get_guardrails()

        if vm is None or vm.status == "deleted":
            checks.append({"check": "VM Exists", "status": "Failed"})
        else:
            checks.append({"check": "VM Exists", "status": "Passed"})

        if guardrails is None:
            checks.append({"check": "Guardrails Loaded", "status": "Failed"})
        else:
            checks.append({"check": "Guardrails Loaded", "status": "Passed"})

        if vm is not None and guardrails is not None:
            cpu_ok = vm.cpu_cores <= guardrails.max_cpu_per_vm
            checks.append({"check": "CPU Capacity", "status": "Passed" if cpu_ok else "Failed"})
        else:
            checks.append({"check": "CPU Capacity", "status": "Failed"})

        status = "Safe" if all(item["status"] == "Passed" for item in checks) else "Unsafe"
        return {"status": status, "checks": checks}


def _run_job_task(job_id: str, operation_id: str) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        job = repo.get_scheduler_job(job_id)
        if job is None:
            raise RuntimeError(f"Job '{job_id}' does not exist.")

        if not job.vm_id:
            auto_vm = _pick_runtime_vm(repo)
            if auto_vm is not None:
                repo.update_scheduler_job(job, vm_id=auto_vm.id)
                job = repo.get_scheduler_job(job_id)

        if job is None:
            raise RuntimeError(f"Job '{job_id}' does not exist.")

        repo.update_operation_status(operation_id, "running", f"Job '{job_id}' accepted by scheduler.")
        _run_job_with_retries(repo, job_id=job.id, operation_id=operation_id)
    except Exception as exc:
        try:
            db.rollback()
        except Exception:
            pass
        try:
            job = repo.get_scheduler_job(job_id)
            if job is not None:
                repo.update_scheduler_job(
                    job,
                    status="Failed",
                    progress=min(job.progress, 99),
                    error_message=str(exc),
                )
        except Exception:
            pass
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        try:
            repo.add_log("Automation", "ERROR", f"Job {job_id} failed.", str(exc))
        except Exception:
            pass
    finally:
        db.close()


def _pick_runtime_vm(repo: StorageRepository):
    running_vms = [vm for vm in repo.list_vms(include_deleted=False) if vm.status in RUNNABLE_VM_STATES]
    if not running_vms:
        return None
    return sorted(running_vms, key=lambda vm: vm.created_at)[0]


def _run_job_with_retries(repo: StorageRepository, job_id: str, operation_id: str) -> None:
    total_attempts = MAX_JOB_RETRIES + 1

    for attempt in range(1, total_attempts + 1):
        job = repo.get_scheduler_job(job_id)
        if job is None:
            raise RuntimeError(f"Job '{job_id}' does not exist.")

        if attempt > 1:
            retry_index = attempt - 1
            retry_wait = float(retry_index)
            repo.update_scheduler_job(
                job,
                status="Retrying",
                retry_count=retry_index,
                error_message=None,
                progress=5,
            )
            repo.update_operation_status(
                operation_id,
                "running",
                f"Retry {retry_index}/{MAX_JOB_RETRIES} for job '{job_id}' in {retry_wait:.0f}s.",
            )
            time.sleep(retry_wait)

        try:
            _run_single_job_attempt(repo, job_id=job_id, operation_id=operation_id)
            completed = repo.get_scheduler_job(job_id)
            if completed is not None:
                repo.update_scheduler_job(completed, status="Completed", progress=100, error_message=None)
            repo.update_operation_status(operation_id, "succeeded", f"Job '{job_id}' completed.")
            repo.add_log("Automation", "INFO", f"Job {job_id} completed successfully.")
            return
        except JobRetryableError as exc:
            current = repo.get_scheduler_job(job_id)
            if current is not None:
                repo.update_scheduler_job(
                    current,
                    status="Retrying" if attempt < total_attempts else "Failed",
                    retry_count=min(attempt, MAX_JOB_RETRIES),
                    error_message=str(exc),
                    progress=5 if attempt < total_attempts else min(current.progress, 95),
                )
            repo.add_log(
                "Automation",
                "WARNING" if attempt < total_attempts else "ERROR",
                f"Job {job_id} attempt {attempt}/{total_attempts} failed.",
                str(exc),
            )
            if attempt >= total_attempts:
                repo.update_operation_status(operation_id, "failed", str(exc))
                raise
        except JobFatalError as exc:
            current = repo.get_scheduler_job(job_id)
            if current is not None:
                repo.update_scheduler_job(current, status="Failed", error_message=str(exc))
            repo.update_operation_status(operation_id, "failed", str(exc))
            repo.add_log("Automation", "ERROR", f"Job {job_id} failed with non-retryable error.", str(exc))
            raise


def _run_single_job_attempt(repo: StorageRepository, job_id: str, operation_id: str) -> None:
    job = repo.get_scheduler_job(job_id)
    if job is None:
        raise RuntimeError(f"Job '{job_id}' does not exist.")

    if not job.vm_id:
        vm = _pick_runtime_vm(repo)
        if vm is None:
            raise JobRetryableError("No running VM is available for auto-assignment.")
        repo.update_scheduler_job(job, vm_id=vm.id)
        job = repo.get_scheduler_job(job_id)
        if job is None:
            raise RuntimeError(f"Job '{job_id}' does not exist.")
    vm = repo.get_vm(job.vm_id)
    if vm is None or vm.status == "deleted":
        raise JobFatalError(f"Assigned VM '{job.vm_id}' no longer exists.")

    if vm.status in TERMINAL_VM_STATES:
        raise JobFatalError(f"Assigned VM '{vm.id}' is in state '{vm.status}'.")

    if vm.status not in RUNNABLE_VM_STATES:
        raise JobRetryableError(f"Assigned VM '{vm.id}' is currently '{vm.status}'.")

    for stage_name, target_progress, stage_seconds in JOB_STAGES:
        current = repo.get_scheduler_job(job_id)
        if current is None:
            raise RuntimeError(f"Job '{job_id}' does not exist.")

        repo.update_scheduler_job(
            current,
            status="Running",
            progress=target_progress,
            error_message=None,
        )
        repo.update_operation_status(
            operation_id,
            "running",
            f"Job '{job_id}' on VM '{current.vm_id}': {stage_name}.",
        )
        time.sleep(stage_seconds)
