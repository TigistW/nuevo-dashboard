from __future__ import annotations

from fastapi import BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..models import HealingRule, JobEnqueueResponse, Task
from ..repositories import StorageRepository


class AutomationService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_healing_rules(self) -> list[HealingRule]:
        rules = self.repo.list_healing_rules()
        return [HealingRule(id=rule.id, trigger=rule.trigger, action=rule.action, enabled=rule.enabled) for rule in rules]

    def create_job(self, task: Task, background_tasks: BackgroundTasks) -> JobEnqueueResponse:
        if self.repo.get_scheduler_job(task.id) is not None:
            raise HTTPException(status_code=409, detail=f"Job '{task.id}' already exists.")

        if task.vm_id:
            vm = self.repo.get_vm(task.vm_id)
            if vm is None or vm.status == "deleted":
                raise HTTPException(status_code=404, detail=f"VM '{task.vm_id}' not found.")

        job = self.repo.create_scheduler_job(
            job_id=task.id,
            task_type=task.task_type,
            vm_id=task.vm_id,
            status="Queued",
            progress=max(0, min(task.progress, 100)),
        )
        operation = self.repo.create_operation(
            resource_type="job",
            resource_id=job.id,
            operation="schedule",
            status="pending",
            message=f"Job '{job.id}' queued.",
        )
        self.repo.add_log("Automation", "INFO", f"Job {job.id} queued.")
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
            )
            for job in jobs
        ]

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
        repo.update_operation_status(operation_id, "running", f"Job '{job_id}' is running.")
        job = repo.get_scheduler_job(job_id)
        if job is None:
            raise RuntimeError(f"Job '{job_id}' does not exist.")

        repo.update_scheduler_job(job, status="Running", progress=max(job.progress, 15))
        repo.update_scheduler_job(job, status="Completed", progress=100, error_message=None)
        repo.update_operation_status(operation_id, "succeeded", f"Job '{job_id}' completed.")
        repo.add_log("Automation", "INFO", f"Job {job_id} completed successfully.")
    except Exception as exc:
        job = repo.get_scheduler_job(job_id)
        if job is not None:
            repo.update_scheduler_job(job, status="Failed", error_message=str(exc))
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        repo.add_log("Automation", "ERROR", f"Job {job_id} failed.", str(exc))
    finally:
        db.close()
