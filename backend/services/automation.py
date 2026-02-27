from __future__ import annotations

import math
import random
import time

from fastapi import BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..models import AutoscaleDecision, AutoscaleRequest, HealingRule, JobEnqueueResponse, MicroVMCreate, Task
from ..repositories import StorageRepository
from .orchestrator import OrchestratorService
from .utils import normalize_country
from .workflow_logging import log_workflow_step

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
        log_workflow_step(
            self.repo,
            step="automation",
            phase="request",
            message=f"Automation job request received for '{task.id}'.",
            details=f"task_type={task.task_type}, requested_vm={task.vm_id or 'AUTO'}",
        )
        if self.repo.get_scheduler_job(task.id) is not None:
            log_workflow_step(
                self.repo,
                step="automation",
                phase="rejected",
                message=f"Job '{task.id}' already exists.",
                level="WARNING",
            )
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
        log_workflow_step(
            self.repo,
            step="automation",
            phase="queued",
            message=f"Automation job '{job.id}' queued.",
            details=f"target_vm={target}, operation_id={operation.id}",
        )
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

    def evaluate_autoscale(
        self,
        payload: AutoscaleRequest,
        background_tasks: BackgroundTasks,
    ) -> AutoscaleDecision:
        log_workflow_step(
            self.repo,
            step="automation",
            phase="autoscale",
            message="Autoscale evaluation started.",
            details=(
                f"min_vms={payload.min_vms}, max_vms={payload.max_vms}, jobs_per_vm={payload.jobs_per_vm}, "
                f"country={payload.country}"
            ),
        )
        if payload.max_vms < payload.min_vms:
            raise HTTPException(status_code=400, detail="max_vms must be greater than or equal to min_vms.")

        guardrails = self.repo.get_guardrails()
        guardrail_max = guardrails.max_vms if guardrails is not None else payload.max_vms
        effective_max_vms = min(payload.max_vms, guardrail_max)
        if effective_max_vms < payload.min_vms:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Autoscale limits conflict with guardrails: "
                    f"min_vms={payload.min_vms}, effective_max_vms={effective_max_vms}."
                ),
            )

        normalized_country = normalize_country(payload.country)
        country_min_pools: dict[str, int] = {}
        for raw_country, raw_minimum in payload.country_min_pools.items():
            minimum = int(raw_minimum)
            if minimum < 0:
                raise HTTPException(status_code=400, detail="country_min_pools values must be zero or greater.")
            country_name = normalize_country(raw_country)
            current = country_min_pools.get(country_name, 0)
            country_min_pools[country_name] = max(current, minimum)

        country_min_pools[normalized_country] = max(country_min_pools.get(normalized_country, 0), payload.min_vms)
        pooled_minimum = sum(country_min_pools.values())
        if pooled_minimum > effective_max_vms:
            raise HTTPException(
                status_code=400,
                detail=(
                    "Autoscale country pools exceed limits: "
                    f"sum(country_min_pools)={pooled_minimum}, effective_max_vms={effective_max_vms}."
                ),
            )

        pool_description = ", ".join(
            f"{country}:{country_min_pools[country]}" for country in sorted(country_min_pools.keys())
        )
        running_vms = [vm for vm in self.repo.list_vms(include_deleted=False) if vm.status == "running"]
        running_by_country: dict[str, int] = {}
        for vm in running_vms:
            vm_country = normalize_country(vm.country)
            running_by_country[vm_country] = running_by_country.get(vm_country, 0) + 1

        jobs = self.repo.list_scheduler_jobs()
        active_statuses = {"Queued", "Running", "Retrying"}
        active_jobs = [job for job in jobs if job.status in active_statuses]
        queued_jobs = [job for job in jobs if job.status == "Queued"]

        desired_from_jobs = math.ceil(len(active_jobs) / payload.jobs_per_vm) if active_jobs else 0
        desired_vms = max(desired_from_jobs, pooled_minimum)
        desired_vms = min(desired_vms, effective_max_vms)

        orchestrator = OrchestratorService(self.repo)

        if len(running_vms) < desired_vms:
            deficits = [
                (country, minimum - running_by_country.get(country, 0))
                for country, minimum in country_min_pools.items()
                if running_by_country.get(country, 0) < minimum
            ]
            deficits.sort(key=lambda item: (-item[1], running_by_country.get(item[0], 0), item[0]))
            target_country = deficits[0][0] if deficits else normalized_country
            auto_vm_id = f"auto-{int(time.time() * 1000)}-{random.randint(100, 999)}"
            vm_payload = MicroVMCreate(
                id=auto_vm_id,
                country=target_country,
                ram=payload.ram,
                cpu=payload.cpu,
                template_id=payload.template_id,
            )
            orchestrator.create_vm(vm_payload, background_tasks)
            operation = self.repo.get_latest_operation(
                resource_type="vm",
                resource_id=auto_vm_id,
                operation="create",
                statuses={"pending", "running", "succeeded"},
            )
            reason = (
                f"Scale up: running={len(running_vms)} below desired={desired_vms} "
                f"(active_jobs={len(active_jobs)}, jobs_per_vm={payload.jobs_per_vm}, target_country={target_country}, pools={pool_description})."
            )
            self.repo.add_log("Automation", "INFO", "Autoscaler scale-up triggered.", reason)
            log_workflow_step(
                self.repo,
                step="automation",
                phase="autoscale",
                message="Autoscaler decided to scale up.",
                details=reason,
            )
            return AutoscaleDecision(
                status="Adjusted",
                action="scale_up",
                reason=reason,
                running_vms=len(running_vms),
                desired_vms=desired_vms,
                active_jobs=len(active_jobs),
                queued_jobs=len(queued_jobs),
                operation_id=operation.id if operation is not None else None,
                affected_vm_id=auto_vm_id,
            )

        if len(running_vms) > desired_vms:
            busy_vm_ids = {job.vm_id for job in active_jobs if job.vm_id}
            idle_candidates = [vm for vm in running_vms if vm.id not in busy_vm_ids]
            eligible_idle_candidates = []
            for vm in idle_candidates:
                vm_country = normalize_country(vm.country)
                protected_floor = country_min_pools.get(vm_country, 0)
                remaining = running_by_country.get(vm_country, 0) - 1
                if remaining < protected_floor:
                    continue
                eligible_idle_candidates.append(vm)

            if eligible_idle_candidates:
                target_vm = sorted(eligible_idle_candidates, key=lambda vm: vm.created_at, reverse=True)[0]
                operation = orchestrator.stop_vm(target_vm.id, background_tasks)
                reason = (
                    f"Scale down: running={len(running_vms)} above desired={desired_vms}; "
                    f"selected idle VM '{target_vm.id}' (pools={pool_description})."
                )
                self.repo.add_log("Automation", "INFO", "Autoscaler scale-down triggered.", reason)
                log_workflow_step(
                    self.repo,
                    step="automation",
                    phase="autoscale",
                    message="Autoscaler decided to scale down.",
                    details=reason,
                )
                return AutoscaleDecision(
                    status="Adjusted",
                    action="scale_down",
                    reason=reason,
                    running_vms=len(running_vms),
                    desired_vms=desired_vms,
                    active_jobs=len(active_jobs),
                    queued_jobs=len(queued_jobs),
                    operation_id=operation.id,
                    affected_vm_id=target_vm.id,
                )

            if idle_candidates:
                reason = (
                    f"No scale-down candidate: running={len(running_vms)} desired={desired_vms}; "
                    f"country pools prevent removal (pools={pool_description})."
                )
                return AutoscaleDecision(
                    status="NoAction",
                    action="none",
                    reason=reason,
                    running_vms=len(running_vms),
                    desired_vms=desired_vms,
                    active_jobs=len(active_jobs),
                    queued_jobs=len(queued_jobs),
                )

            reason = (
                f"No scale-down candidate: running={len(running_vms)} desired={desired_vms}, "
                "all running VMs are currently busy."
            )
            return AutoscaleDecision(
                status="NoAction",
                action="none",
                reason=reason,
                running_vms=len(running_vms),
                desired_vms=desired_vms,
                active_jobs=len(active_jobs),
                queued_jobs=len(queued_jobs),
            )

        reason = (
            f"Stable: running={len(running_vms)} matches desired={desired_vms} "
            f"(active_jobs={len(active_jobs)}, pools={pool_description})."
        )
        return AutoscaleDecision(
            status="NoAction",
            action="none",
            reason=reason,
            running_vms=len(running_vms),
            desired_vms=desired_vms,
            active_jobs=len(active_jobs),
            queued_jobs=len(queued_jobs),
        )


def _run_job_task(job_id: str, operation_id: str) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        log_workflow_step(
            repo,
            step="automation",
            phase="running",
            message=f"Automation job runner started for '{job_id}'.",
            details=f"operation_id={operation_id}",
        )
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
        try:
            log_workflow_step(
                repo,
                step="automation",
                phase="failed",
                message=f"Automation job '{job_id}' failed.",
                details=str(exc),
                level="ERROR",
            )
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
        log_workflow_step(
            repo,
            step="automation",
            phase="attempt",
            message=f"Running job '{job_id}' attempt {attempt}/{total_attempts}.",
            details=f"operation_id={operation_id}",
        )
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
            log_workflow_step(
                repo,
                step="automation",
                phase="success",
                message=f"Automation job '{job_id}' completed.",
                details=f"attempt={attempt}",
            )
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

        log_workflow_step(
            repo,
            step="automation",
            phase="stage",
            message=f"Job '{job_id}' stage: {stage_name}.",
            details=f"target_progress={target_progress}",
        )
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
