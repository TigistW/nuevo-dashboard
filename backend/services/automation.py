from __future__ import annotations

import math
import random
import threading
import time
from datetime import datetime, timedelta, timezone

from fastapi import BackgroundTasks, HTTPException

from ..config import settings
from ..database import SessionLocal
from ..models import (
    AutoscaleDecision,
    AutoscaleRequest,
    HealingRule,
    HealingRuleUpdate,
    JobEnqueueResponse,
    MicroVMCreate,
    SchedulerConfig,
    SchedulerTickResult,
    Task,
)
from ..repositories import StorageRepository
from .orchestrator import OrchestratorService
from .utils import isoformat_or_none, normalize_country
from .workflow_logging import log_workflow_step

RUNNABLE_VM_STATES = {"running"}
TERMINAL_VM_STATES = {"deleted", "error", "stopped"}
ACTIVE_JOB_STATUSES = {"Queued", "Dispatching", "Running", "Retrying"}
RUNNING_QUEUE_STATUSES = {"Dispatching", "Running", "Retrying"}
PRIORITY_LEVELS = {"high", "medium", "low"}
SCHEDULER_CONCURRENCY_LIMIT = max(1, int(settings.scheduler_concurrency_limit))
DEFAULT_MAX_RETRIES = max(0, int(settings.scheduler_default_max_retries))
BACKOFF_BASE_SECONDS = max(0.1, float(settings.scheduler_backoff_base_seconds))
SCHEDULER_TICK_SECONDS = max(1, int(settings.scheduler_tick_seconds))
WARMUP_ENABLED = bool(settings.scheduler_warmup_enabled)
WARMUP_INTERVAL_MINUTES = max(1, int(settings.scheduler_warmup_interval_minutes))
WARMUP_JITTER_SECONDS = max(0, int(settings.scheduler_warmup_jitter_seconds))
DEFAULT_WINDOW_START_HOUR = max(0, min(23, int(settings.scheduler_default_window_start_hour)))
DEFAULT_WINDOW_END_HOUR = max(0, min(23, int(settings.scheduler_default_window_end_hour)))
MAX_DISPATCH_SCAN_MULTIPLIER = 6

_SCHEDULER_DAEMON_LOCK = threading.Lock()
_SCHEDULER_DAEMON_STARTED = False


def _parse_timezone_offsets(raw: str) -> list[int]:
    offsets: list[int] = []
    for token in str(raw or "").split(","):
        item = token.strip()
        if not item:
            continue
        try:
            value = int(item)
        except ValueError:
            continue
        offsets.append(max(-720, min(840, value)))
    if not offsets:
        return [0]
    deduped = sorted(set(offsets))
    return deduped


TIMEZONE_OFFSETS = _parse_timezone_offsets(settings.scheduler_timezone_offsets)

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

    def update_healing_rule(self, rule_id: str, payload: HealingRuleUpdate) -> HealingRule:
        rule = self.repo.get_healing_rule(rule_id)
        if rule is None:
            raise HTTPException(status_code=404, detail=f"Healing rule '{rule_id}' not found.")
        updated = self.repo.update_healing_rule(rule=rule, enabled=payload.enabled)
        self.repo.add_log(
            "Automation",
            "INFO",
            f"Healing rule '{rule_id}' updated.",
            f"enabled={updated.enabled}",
        )
        return HealingRule(
            id=updated.id,
            trigger=updated.trigger,
            action=updated.action,
            enabled=updated.enabled,
        )

    def get_scheduler_config(self) -> SchedulerConfig:
        return SchedulerConfig(
            concurrency_limit=SCHEDULER_CONCURRENCY_LIMIT,
            backoff_base_seconds=BACKOFF_BASE_SECONDS,
            default_max_retries=DEFAULT_MAX_RETRIES,
            tick_seconds=SCHEDULER_TICK_SECONDS,
            warmup_enabled=WARMUP_ENABLED,
            warmup_interval_minutes=WARMUP_INTERVAL_MINUTES,
            warmup_jitter_seconds=WARMUP_JITTER_SECONDS,
            default_window_start_hour=DEFAULT_WINDOW_START_HOUR,
            default_window_end_hour=DEFAULT_WINDOW_END_HOUR,
            timezone_offsets=TIMEZONE_OFFSETS,
        )

    def run_scheduler_tick(self) -> SchedulerTickResult:
        now = datetime.utcnow()
        warmup_jobs = self._enqueue_periodic_warmup_jobs(now=now)
        dispatched = self._dispatch_queued_jobs(background_tasks=None)
        queued_jobs = self.repo.count_scheduler_jobs_by_status({"Queued", "Retrying", "Paused"})
        active_jobs = self.repo.count_scheduler_jobs_by_status(RUNNING_QUEUE_STATUSES)
        return SchedulerTickResult(
            dispatched=dispatched,
            warmup_jobs_enqueued=warmup_jobs,
            queued_jobs=queued_jobs,
            active_jobs=active_jobs,
        )

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

        priority = (task.priority or "medium").strip().lower()
        if priority not in PRIORITY_LEVELS:
            raise HTTPException(status_code=400, detail="priority must be one of: high, medium, low.")
        max_retries = int(task.max_retries if task.max_retries is not None else DEFAULT_MAX_RETRIES)
        if max_retries < 0:
            raise HTTPException(status_code=400, detail="max_retries must be zero or greater.")
        schedule_window_start_hour = (
            int(task.schedule_window_start_hour) if task.schedule_window_start_hour is not None else None
        )
        schedule_window_end_hour = int(task.schedule_window_end_hour) if task.schedule_window_end_hour is not None else None
        if (schedule_window_start_hour is None) != (schedule_window_end_hour is None):
            raise HTTPException(
                status_code=400,
                detail="schedule_window_start_hour and schedule_window_end_hour must be provided together.",
            )
        timezone_offset_minutes = max(-720, min(840, int(task.timezone_offset_minutes or 0)))
        jitter_seconds = max(0, min(3600, int(task.jitter_seconds or 0)))
        recurrence_minutes = int(task.recurrence_minutes) if task.recurrence_minutes is not None else None
        if recurrence_minutes is not None and recurrence_minutes < 1:
            raise HTTPException(status_code=400, detail="recurrence_minutes must be greater than zero.")
        scheduled_for = _parse_optional_datetime(task.scheduled_for)

        state = self.repo.get_system_control_state()
        now = datetime.utcnow()
        if state is not None and state.failsafe_active and (state.cooldown_until is None or state.cooldown_until > now):
            raise HTTPException(status_code=503, detail="Scheduler paused: global failsafe is active.")

        assigned_vm_id = self._resolve_job_vm(task.vm_id)
        initial_status = "Queued"
        if state is not None and state.protective_mode and priority != "high":
            initial_status = "Paused"
        next_attempt_at = _compute_initial_next_attempt(now=now, scheduled_for=scheduled_for, jitter_seconds=jitter_seconds)

        job = self.repo.create_scheduler_job(
            job_id=task.id,
            task_type=task.task_type,
            vm_id=assigned_vm_id,
            status=initial_status,
            progress=0,
            priority=priority,
            max_retries=max_retries,
            next_attempt_at=next_attempt_at,
            dead_letter=False,
            schedule_window_start_hour=schedule_window_start_hour,
            schedule_window_end_hour=schedule_window_end_hour,
            timezone_offset_minutes=timezone_offset_minutes,
            jitter_seconds=jitter_seconds,
            recurrence_minutes=recurrence_minutes,
        )
        target = assigned_vm_id or "AUTO"
        self.repo.add_log(
            "Automation",
            "INFO",
            f"Job {job.id} queued (target={target}, priority={priority}, status={initial_status}).",
        )
        log_workflow_step(
            self.repo,
            step="automation",
            phase="queued",
            message=f"Automation job '{job.id}' queued.",
            details=f"target_vm={target}, priority={priority}, max_retries={max_retries}",
        )
        if initial_status == "Queued":
            self._dispatch_queued_jobs(background_tasks)
        refreshed = self.repo.get_scheduler_job(job.id)
        status = refreshed.status if refreshed is not None else job.status
        return JobEnqueueResponse(message="Job queued", job_id=job.id, status=status)

    def get_job_queue(self) -> list[Task]:
        jobs = self.repo.list_scheduler_jobs()
        return [
            Task(
                id=job.id,
                task_type=job.task_type,
                vm_id=job.vm_id,
                status=job.status,
                priority=job.priority,
                progress=job.progress,
                retry_count=job.retry_count,
                max_retries=job.max_retries,
                dead_letter=job.dead_letter,
                next_attempt_at=isoformat_or_none(job.next_attempt_at),
                error_message=job.error_message,
                scheduled_for=isoformat_or_none(job.next_attempt_at),
                schedule_window_start_hour=job.schedule_window_start_hour,
                schedule_window_end_hour=job.schedule_window_end_hour,
                timezone_offset_minutes=job.timezone_offset_minutes,
                jitter_seconds=job.jitter_seconds,
                recurrence_minutes=job.recurrence_minutes,
            )
            for job in jobs
        ]

    def _dispatch_queued_jobs(self, background_tasks: BackgroundTasks | None) -> int:
        state = self.repo.get_system_control_state()
        now = datetime.utcnow()
        if state is not None and state.failsafe_active and (state.cooldown_until is None or state.cooldown_until > now):
            return 0

        running_count = self.repo.count_scheduler_jobs_by_status(RUNNING_QUEUE_STATUSES)
        available_slots = max(0, SCHEDULER_CONCURRENCY_LIMIT - running_count)
        if available_slots <= 0:
            return 0

        high_priority_only = bool(state is not None and state.protective_mode)
        candidates = _select_dispatch_candidates(
            repo=self.repo,
            now=now,
            limit=available_slots,
            high_priority_only=high_priority_only,
        )
        dispatched = 0
        for job in candidates:
            operation = self.repo.create_operation(
                resource_type="job",
                resource_id=job.id,
                operation="schedule",
                status="pending",
                message=f"Job '{job.id}' dispatched to scheduler.",
            )
            self.repo.update_scheduler_job(
                job,
                status="Dispatching",
                error_message=None,
            )
            if background_tasks is not None:
                background_tasks.add_task(_run_job_task, job.id, operation.id)
            else:
                threading.Thread(target=_run_job_task, args=(job.id, operation.id), daemon=True).start()
            dispatched += 1
        return dispatched

    def _enqueue_periodic_warmup_jobs(self, now: datetime) -> int:
        if not WARMUP_ENABLED:
            return 0
        state = self.repo.get_system_control_state()
        if state is not None and state.failsafe_active and (state.cooldown_until is None or state.cooldown_until > now):
            return 0

        interval = timedelta(minutes=WARMUP_INTERVAL_MINUTES)
        running_vms = [vm for vm in self.repo.list_vms(include_deleted=False) if vm.status in RUNNABLE_VM_STATES]
        if not running_vms:
            return 0

        recent_cutoff = now - interval
        recent_or_active_by_vm: set[str] = set()
        for job in self.repo.list_scheduler_jobs():
            if job.task_type != "AccountWarmup":
                continue
            if not job.vm_id:
                continue
            if job.status in ACTIVE_JOB_STATUSES or job.created_at >= recent_cutoff:
                recent_or_active_by_vm.add(job.vm_id)

        created = 0
        for vm in running_vms:
            if vm.id in recent_or_active_by_vm:
                continue
            scheduled_at = now + timedelta(seconds=random.randint(0, WARMUP_JITTER_SECONDS))
            timezone_offset = random.choice(TIMEZONE_OFFSETS)
            warmup_id = f"warmup-{vm.id}-{int(now.timestamp())}-{random.randint(100, 999)}"
            self.repo.create_scheduler_job(
                job_id=warmup_id,
                task_type="AccountWarmup",
                vm_id=vm.id,
                status="Queued",
                progress=0,
                priority="low",
                max_retries=1,
                next_attempt_at=scheduled_at,
                dead_letter=False,
                schedule_window_start_hour=DEFAULT_WINDOW_START_HOUR,
                schedule_window_end_hour=DEFAULT_WINDOW_END_HOUR,
                timezone_offset_minutes=timezone_offset,
                jitter_seconds=WARMUP_JITTER_SECONDS,
                recurrence_minutes=WARMUP_INTERVAL_MINUTES,
            )
            created += 1

        if created:
            self.repo.add_log(
                "Automation",
                "INFO",
                f"Periodic warm-up scheduler enqueued {created} job(s).",
                f"interval_minutes={WARMUP_INTERVAL_MINUTES}",
            )
        return created

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
        active_job_statuses = {"Queued", "Dispatching", "Running", "Retrying"}
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
        active_statuses = {"Queued", "Dispatching", "Running", "Retrying"}
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

        if job.dead_letter:
            raise RuntimeError(f"Job '{job_id}' is in dead-letter state.")

        if not job.vm_id:
            auto_vm = _pick_runtime_vm(repo)
            if auto_vm is not None:
                repo.update_scheduler_job(job, vm_id=auto_vm.id)
                job = repo.get_scheduler_job(job_id)

        if job is None:
            raise RuntimeError(f"Job '{job_id}' does not exist.")

        repo.update_scheduler_job(job, status="Running", next_attempt_at=None, error_message=None)
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
                    status="DeadLetter" if job.dead_letter else "Failed",
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
        try:
            _dispatch_next_queued_job(repo)
        except Exception:
            pass
        db.close()


def _pick_runtime_vm(repo: StorageRepository, exclude_vm_ids: set[str] | None = None):
    excluded = exclude_vm_ids or set()
    running_vms = [vm for vm in repo.list_vms(include_deleted=False) if vm.status in RUNNABLE_VM_STATES]
    running_vms = [vm for vm in running_vms if vm.id not in excluded]
    if not running_vms:
        return None
    load_by_vm = {vm.id: 0 for vm in running_vms}
    for job in repo.list_scheduler_jobs():
        if job.vm_id in load_by_vm and job.status in ACTIVE_JOB_STATUSES:
            load_by_vm[job.vm_id] += 1
    return sorted(running_vms, key=lambda vm: (load_by_vm[vm.id], vm.created_at))[0]


def _run_job_with_retries(repo: StorageRepository, job_id: str, operation_id: str) -> None:
    initial_job = repo.get_scheduler_job(job_id)
    if initial_job is None:
        raise RuntimeError(f"Job '{job_id}' does not exist.")
    max_retries = max(0, int(initial_job.max_retries if initial_job.max_retries is not None else DEFAULT_MAX_RETRIES))
    total_attempts = max_retries + 1

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
            retry_wait = _compute_retry_delay(retry_index)
            repo.update_scheduler_job(
                job,
                status="Retrying",
                retry_count=retry_index,
                error_message=None,
                progress=5,
                next_attempt_at=datetime.utcnow() + timedelta(seconds=retry_wait),
            )
            repo.update_operation_status(
                operation_id,
                "running",
                f"Retry {retry_index}/{max_retries} for job '{job_id}' in {retry_wait:.1f}s.",
            )
            time.sleep(retry_wait)

        try:
            _run_single_job_attempt(repo, job_id=job_id, operation_id=operation_id)
            completed = repo.get_scheduler_job(job_id)
            if completed is not None:
                repo.update_scheduler_job(
                    completed,
                    status="Completed",
                    progress=100,
                    error_message=None,
                    dead_letter=False,
                    next_attempt_at=None,
                )
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
                if attempt < total_attempts:
                    repo.update_scheduler_job(
                        current,
                        status="Retrying",
                        retry_count=min(attempt, max_retries),
                        error_message=str(exc),
                        progress=5,
                        next_attempt_at=datetime.utcnow() + timedelta(seconds=_compute_retry_delay(attempt)),
                    )
                else:
                    repo.update_scheduler_job(
                        current,
                        status="DeadLetter",
                        retry_count=max_retries,
                        error_message=str(exc),
                        progress=min(current.progress, 95),
                        dead_letter=True,
                        next_attempt_at=None,
                    )
            repo.add_log(
                "Automation",
                "WARNING" if attempt < total_attempts else "ERROR",
                f"Job {job_id} attempt {attempt}/{total_attempts} failed.",
                str(exc),
            )
            if attempt >= total_attempts:
                repo.update_operation_status(operation_id, "failed", f"Job '{job_id}' moved to dead-letter: {exc}")
                raise
        except JobFatalError as exc:
            current = repo.get_scheduler_job(job_id)
            if current is not None:
                repo.update_scheduler_job(
                    current,
                    status="DeadLetter",
                    error_message=str(exc),
                    dead_letter=True,
                    next_attempt_at=None,
                )
            repo.update_operation_status(operation_id, "failed", f"Job '{job_id}' moved to dead-letter: {exc}")
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
        if _try_reassign_job_vm(repo, job_id, previous_vm_id=job.vm_id, reason="missing or deleted"):
            job = repo.get_scheduler_job(job_id)
            if job is None:
                raise RuntimeError(f"Job '{job_id}' does not exist.")
            vm = repo.get_vm(job.vm_id) if job.vm_id else None
        if vm is None:
            raise JobRetryableError("Assigned VM became unavailable and no replacement VM is available.")

    if vm.status in TERMINAL_VM_STATES:
        if _try_reassign_job_vm(repo, job_id, previous_vm_id=vm.id, reason=f"state {vm.status}"):
            job = repo.get_scheduler_job(job_id)
            if job is None:
                raise RuntimeError(f"Job '{job_id}' does not exist.")
            vm = repo.get_vm(job.vm_id) if job.vm_id else None
        if vm is None or vm.status in TERMINAL_VM_STATES:
            raise JobRetryableError(f"Assigned VM '{job.vm_id}' is unavailable and reassignment failed.")

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


def _compute_retry_delay(retry_index: int) -> float:
    capped_index = max(1, retry_index)
    raw = BACKOFF_BASE_SECONDS * (2 ** (capped_index - 1))
    jitter = random.uniform(0.0, BACKOFF_BASE_SECONDS * 0.35)
    return min(60.0, raw + jitter)


def _try_reassign_job_vm(repo: StorageRepository, job_id: str, previous_vm_id: str | None, reason: str) -> bool:
    job = repo.get_scheduler_job(job_id)
    if job is None:
        return False
    exclude = {previous_vm_id} if previous_vm_id else set()
    replacement = _pick_runtime_vm(repo, exclude_vm_ids=exclude)
    if replacement is None:
        return False
    repo.update_scheduler_job(job, vm_id=replacement.id, status="Retrying")
    repo.add_log(
        "Automation",
        "WARNING",
        f"Job {job_id} VM reassigned.",
        f"from={previous_vm_id or 'none'}, to={replacement.id}, reason={reason}",
    )
    return True


def _dispatch_next_queued_job(repo: StorageRepository) -> bool:
    state = repo.get_system_control_state()
    now = datetime.utcnow()
    if state is not None and state.failsafe_active and (state.cooldown_until is None or state.cooldown_until > now):
        return False

    running_count = repo.count_scheduler_jobs_by_status(RUNNING_QUEUE_STATUSES)
    if running_count >= SCHEDULER_CONCURRENCY_LIMIT:
        return False
    candidates = _select_dispatch_candidates(
        repo=repo,
        now=now,
        limit=1,
        high_priority_only=bool(state is not None and state.protective_mode),
    )
    if not candidates:
        return False

    job = candidates[0]
    operation = repo.create_operation(
        resource_type="job",
        resource_id=job.id,
        operation="schedule",
        status="pending",
        message=f"Job '{job.id}' dispatched after slot release.",
    )
    repo.update_scheduler_job(job, status="Dispatching", error_message=None)
    threading.Thread(target=_run_job_task, args=(job.id, operation.id), daemon=True).start()
    return True


def _parse_optional_datetime(raw_value: str | None) -> datetime | None:
    if raw_value is None:
        return None
    value = raw_value.strip()
    if not value:
        return None
    normalized = value.replace("Z", "+00:00")
    try:
        parsed = datetime.fromisoformat(normalized)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=f"Invalid scheduled_for timestamp: {raw_value}") from exc
    if parsed.tzinfo is not None:
        parsed = parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


def _compute_initial_next_attempt(now: datetime, scheduled_for: datetime | None, jitter_seconds: int) -> datetime | None:
    base = scheduled_for if scheduled_for is not None else now
    jitter = random.randint(0, max(0, int(jitter_seconds)))
    if base <= now and jitter == 0:
        return None
    return base + timedelta(seconds=jitter)


def _window_contains_minute(local_minute: int, start_hour: int, end_hour: int) -> bool:
    start_minute = start_hour * 60
    end_minute = end_hour * 60
    if start_hour == end_hour:
        return True
    if start_hour < end_hour:
        return start_minute <= local_minute < end_minute
    return local_minute >= start_minute or local_minute < end_minute


def _is_job_window_open(job, now: datetime) -> bool:
    start_hour = job.schedule_window_start_hour
    end_hour = job.schedule_window_end_hour
    if start_hour is None or end_hour is None:
        return True
    offset_minutes = int(job.timezone_offset_minutes or 0)
    local_now = now + timedelta(minutes=offset_minutes)
    local_minute = (local_now.hour * 60) + local_now.minute
    return _window_contains_minute(local_minute, int(start_hour), int(end_hour))


def _next_window_start_utc(job, now: datetime) -> datetime | None:
    start_hour = job.schedule_window_start_hour
    end_hour = job.schedule_window_end_hour
    if start_hour is None or end_hour is None:
        return None
    start_hour = int(start_hour)
    end_hour = int(end_hour)
    if start_hour == end_hour:
        return now

    offset_minutes = int(job.timezone_offset_minutes or 0)
    local_now = now + timedelta(minutes=offset_minutes)
    local_minute = (local_now.hour * 60) + local_now.minute
    start_minute = start_hour * 60

    if start_hour < end_hour:
        days_to_add = 0 if local_minute < start_minute else 1
    else:
        # Outside window only happens between end_hour and start_hour.
        days_to_add = 0
    target_date = (local_now + timedelta(days=days_to_add)).date()
    local_target = datetime.combine(target_date, datetime.min.time()).replace(
        hour=start_hour,
        minute=0,
        second=0,
        microsecond=0,
    )
    return local_target - timedelta(minutes=offset_minutes)


def _select_dispatch_candidates(
    repo: StorageRepository,
    now: datetime,
    limit: int,
    high_priority_only: bool,
) -> list:
    if limit <= 0:
        return []
    scan_limit = max(limit, limit * MAX_DISPATCH_SCAN_MULTIPLIER)
    queued = repo.list_dispatchable_scheduler_jobs(now=now, limit=scan_limit)
    selected = []
    for job in queued:
        if high_priority_only and (job.priority or "medium").lower() != "high":
            continue
        if not _is_job_window_open(job, now):
            next_slot = _next_window_start_utc(job, now)
            if next_slot is not None and (job.next_attempt_at is None or next_slot > job.next_attempt_at):
                repo.update_scheduler_job(job, next_attempt_at=next_slot)
            continue
        selected.append(job)
        if len(selected) >= limit:
            break
    return selected


def start_scheduler_daemon() -> None:
    global _SCHEDULER_DAEMON_STARTED
    with _SCHEDULER_DAEMON_LOCK:
        if _SCHEDULER_DAEMON_STARTED:
            return
        thread = threading.Thread(target=_scheduler_daemon_loop, daemon=True, name="scheduler-daemon")
        thread.start()
        _SCHEDULER_DAEMON_STARTED = True


def _scheduler_daemon_loop() -> None:
    while True:
        db = SessionLocal()
        repo = StorageRepository(db)
        try:
            service = AutomationService(repo)
            result = service.run_scheduler_tick()
            if result.dispatched > 0 or result.warmup_jobs_enqueued > 0:
                repo.add_log(
                    "Automation",
                    "INFO",
                    "Scheduler daemon tick completed.",
                    f"dispatched={result.dispatched}, warmup_jobs={result.warmup_jobs_enqueued}",
                )
        except Exception as exc:
            try:
                repo.add_log("Automation", "ERROR", "Scheduler daemon tick failed.", str(exc))
            except Exception:
                pass
        finally:
            db.close()
        time.sleep(SCHEDULER_TICK_SECONDS)
