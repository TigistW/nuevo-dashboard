from __future__ import annotations

import os
import shutil
from datetime import datetime, timedelta

from ..config import settings
from ..models import ProtectionState, ResourceSnapshot, ResourceThresholds
from ..repositories import StorageRepository
from .utils import isoformat_or_none

ACTIVE_JOB_STATUSES = {"Queued", "Dispatching", "Running", "Retrying"}
PAUSABLE_JOB_STATUSES = {"Queued", "Dispatching", "Running", "Retrying"}
PRIORITY_ORDER = {"high": 0, "medium": 1, "low": 2}


class IntelligenceService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_global_metrics(self) -> dict:
        snapshot = self._build_resource_snapshot()
        identities = self.repo.list_identities()
        if identities:
            secure_count = len([item for item in identities if item.status.lower() == "secure"])
            functional_ips_percent = round((secure_count / len(identities)) * 100)
        else:
            functional_ips_percent = 100

        recent_reboots = self.repo.count_recent_restart_operations(window=timedelta(hours=24))
        total_operations = self.repo.count_operations(since=datetime.utcnow() - timedelta(hours=24))
        failed_operations = self.repo.count_operations(
            since=datetime.utcnow() - timedelta(hours=24), status="failed"
        )
        error_rate_percent = round((failed_operations / total_operations) * 100, 2) if total_operations else 0.0

        self._store_telemetry_sample(
            active_vms=snapshot.active_vms,
            total_vms=max(snapshot.max_vms, 1),
            load=snapshot.host_cpu_percent,
            error_rate=error_rate_percent,
        )

        return {
            "active_vms": snapshot.active_vms,
            "total_vms": snapshot.max_vms,
            "active_tunnels": snapshot.active_tunnels,
            "functional_ips_percent": functional_ips_percent,
            "host_cpu_percent": snapshot.host_cpu_percent,
            "host_ram_gb": round(snapshot.host_ram_used_mb / 1024, 1),
            "recent_reboots": recent_reboots,
            "error_rate_percent": error_rate_percent,
            "host_disk_percent": round(snapshot.host_disk_percent, 2),
            "active_jobs": snapshot.active_jobs,
        }

    def get_telemetry_history(self) -> list[dict]:
        samples = self.repo.list_telemetry_samples(limit=24)
        return [
            {"name": sample.name, "uptime": sample.uptime, "stability": sample.stability, "load": sample.load}
            for sample in samples
        ]

    def get_centralized_logs(self, source: str) -> list[dict]:
        logs = self.repo.list_logs(source=source, limit=250)
        return [
            {
                "time": item.timestamp.strftime("%H:%M:%S"),
                "source": item.source,
                "level": item.level,
                "msg": item.message,
                "details": item.details,
            }
            for item in logs
        ]

    def get_protection_state(self) -> ProtectionState:
        return self.evaluate_protection(apply=False)

    def reset_protection_state(self) -> ProtectionState:
        state = self.repo.upsert_system_control_state(
            protective_mode=False,
            failsafe_active=False,
            cooldown_until=None,
            last_reason="Manual reset requested.",
        )
        resumed = self._resume_paused_jobs(limit=10)
        if resumed:
            self.repo.add_log("Intelligence", "INFO", f"Manual protection reset resumed {resumed} paused jobs.")
        snapshot = self._build_resource_snapshot()
        thresholds = self._thresholds()
        return ProtectionState(
            protective_mode=state.protective_mode,
            failsafe_active=state.failsafe_active,
            cooldown_until=isoformat_or_none(state.cooldown_until),
            last_reason=state.last_reason,
            thresholds=thresholds,
            snapshot=snapshot,
            actions=[f"Manual reset completed. Resumed jobs={resumed}."],
            signals=[],
        )

    def evaluate_protection(self, apply: bool = True) -> ProtectionState:
        now = datetime.utcnow()
        thresholds = self._thresholds()
        snapshot = self._build_resource_snapshot()
        state = self.repo.get_system_control_state()
        if state is None:
            state = self.repo.upsert_system_control_state(
                protective_mode=False,
                failsafe_active=False,
                cooldown_until=None,
                last_reason=None,
            )

        signals = self._detect_failsafe_signals(now=now, snapshot=snapshot)
        resource_reasons = self._detect_resource_pressure(snapshot=snapshot, thresholds=thresholds)
        actions: list[str] = []

        protective_mode = bool(state.protective_mode)
        failsafe_active = bool(state.failsafe_active)
        cooldown_until = state.cooldown_until
        last_reason = state.last_reason

        if apply:
            # Global failsafe takes precedence.
            if signals:
                failsafe_active = True
                protective_mode = True
                cooldown_until = now + timedelta(minutes=max(1, settings.failsafe_cooldown_minutes))
                last_reason = "; ".join(signals)
                paused = self._pause_jobs(all_priorities=True)
                actions.append(f"Failsafe activated. Paused jobs={paused}.")
                self.repo.add_log("Intelligence", "ERROR", "Global failsafe activated.", last_reason)
            elif failsafe_active and cooldown_until and now < cooldown_until:
                actions.append(f"Failsafe cooldown active until {cooldown_until.isoformat()}.")
            elif failsafe_active and (cooldown_until is None or now >= cooldown_until):
                resumed = self._resume_paused_jobs(limit=2)
                failsafe_active = False
                cooldown_until = None
                last_reason = "Failsafe cooldown complete; gradual restart active."
                actions.append(f"Failsafe cooldown complete. Resumed jobs={resumed}.")
                self.repo.add_log("Intelligence", "INFO", "Failsafe cooldown complete; gradual restart.")

            # Host protection mode.
            if resource_reasons:
                protective_mode = True
                if not failsafe_active:
                    last_reason = "; ".join(resource_reasons)
                paused_noncritical = self._pause_jobs(all_priorities=False)
                if paused_noncritical:
                    actions.append(f"Protective mode paused non-critical jobs={paused_noncritical}.")
                removed_vms = self._destroy_low_score_vms(limit=2)
                if removed_vms:
                    actions.append(f"Protective mode removed low-score VMs={removed_vms}.")
                self.repo.add_log("Intelligence", "WARNING", "Protective mode active.", "; ".join(resource_reasons))
            elif protective_mode and not failsafe_active:
                protective_mode = False
                resumed = self._resume_paused_jobs(limit=3)
                actions.append(f"Protective mode cleared. Resumed jobs={resumed}.")
                self.repo.add_log("Intelligence", "INFO", "Protective mode cleared.")

            state = self.repo.upsert_system_control_state(
                protective_mode=protective_mode,
                failsafe_active=failsafe_active,
                cooldown_until=cooldown_until,
                last_reason=last_reason,
            )

        return ProtectionState(
            protective_mode=protective_mode,
            failsafe_active=failsafe_active,
            cooldown_until=isoformat_or_none(cooldown_until),
            last_reason=last_reason,
            thresholds=thresholds,
            snapshot=snapshot,
            actions=actions,
            signals=signals + resource_reasons,
        )

    def _thresholds(self) -> ResourceThresholds:
        return ResourceThresholds(
            cpu_percent=max(1, min(100, settings.host_cpu_protect_threshold_percent)),
            ram_percent=max(1, min(100, settings.host_ram_protect_threshold_percent)),
            disk_percent=max(1, min(100, settings.host_disk_protect_threshold_percent)),
        )

    def _build_resource_snapshot(self) -> ResourceSnapshot:
        active_vms = self.repo.count_vms(statuses={"running"})
        active_tunnels = len([tunnel for tunnel in self.repo.list_tunnels() if tunnel.status == "Connected"])
        active_jobs = self.repo.count_scheduler_jobs_by_status(ACTIVE_JOB_STATUSES)
        host_ram_used_mb = self.repo.sum_vm_ram_mb(statuses={"running"})
        host_ram_total_mb = max(1, int(settings.host_total_ram_mb))
        host_ram_percent = round((host_ram_used_mb / host_ram_total_mb) * 100, 2)

        disk_stats = shutil.disk_usage(settings.infra_workdir or ".")
        host_disk_total_gb = round(disk_stats.total / (1024**3), 2)
        host_disk_used_gb = round((disk_stats.total - disk_stats.free) / (1024**3), 2)
        host_disk_percent = round(((disk_stats.total - disk_stats.free) / max(1, disk_stats.total)) * 100, 2)

        cpu_estimate = min(100, int(active_vms * 10 + active_jobs * 12 + active_tunnels * 2))
        cpu_load = 0
        try:
            if hasattr(os, "getloadavg"):
                load_1m = os.getloadavg()[0]
                cpu_count = max(1, os.cpu_count() or 1)
                cpu_load = min(100, int((load_1m / cpu_count) * 100))
        except Exception:
            cpu_load = 0
        host_cpu_percent = max(cpu_estimate, cpu_load)

        guardrails = self.repo.get_guardrails()
        max_vms = guardrails.max_vms if guardrails is not None else max(1, active_vms)

        return ResourceSnapshot(
            active_vms=active_vms,
            active_jobs=active_jobs,
            active_tunnels=active_tunnels,
            host_cpu_percent=host_cpu_percent,
            host_ram_used_mb=host_ram_used_mb,
            host_ram_total_mb=host_ram_total_mb,
            host_ram_percent=host_ram_percent,
            host_disk_used_gb=host_disk_used_gb,
            host_disk_total_gb=host_disk_total_gb,
            host_disk_percent=host_disk_percent,
            max_vms=max_vms,
        )

    def _detect_resource_pressure(self, snapshot: ResourceSnapshot, thresholds: ResourceThresholds) -> list[str]:
        reasons: list[str] = []
        if snapshot.host_cpu_percent >= thresholds.cpu_percent:
            reasons.append(
                f"Host CPU pressure {snapshot.host_cpu_percent}% exceeds threshold {thresholds.cpu_percent}%."
            )
        if snapshot.host_ram_percent >= thresholds.ram_percent:
            reasons.append(
                f"Host RAM pressure {snapshot.host_ram_percent}% exceeds threshold {thresholds.ram_percent}%."
            )
        if snapshot.host_disk_percent >= thresholds.disk_percent:
            reasons.append(
                f"Host disk pressure {snapshot.host_disk_percent}% exceeds threshold {thresholds.disk_percent}%."
            )
        if snapshot.active_vms >= snapshot.max_vms:
            reasons.append(f"Active VM count {snapshot.active_vms} reached max_vms {snapshot.max_vms}.")
        return reasons

    def _detect_failsafe_signals(self, now: datetime, snapshot: ResourceSnapshot) -> list[str]:
        signals: list[str] = []
        identities = self.repo.list_identities()
        blocked_accounts = len(
            [item for item in identities if item.status.lower() != "secure" or int(item.trust_score or 0) < 40]
        )
        if blocked_accounts >= 3:
            signals.append(f"Multiple accounts blocked simultaneously ({blocked_accounts}).")

        tunnels = self.repo.list_tunnels()
        if snapshot.active_vms > 0:
            connected_tunnels = len([item for item in tunnels if item.status == "Connected"])
            disconnected_tunnels = len([item for item in tunnels if item.status != "Connected"])
            if connected_tunnels == 0:
                signals.append("IP provider outage suspected (no connected tunnels while VMs are active).")
            if len(tunnels) >= 3 and disconnected_tunnels >= max(3, len(tunnels) // 2):
                signals.append(
                    f"Massive tunnel failure detected ({disconnected_tunnels}/{len(tunnels)} unavailable)."
                )

        recent_logs = [item for item in self.repo.list_logs(limit=400) if item.timestamp >= now - timedelta(minutes=20)]
        rate_limit_hits = len(
            [
                item
                for item in recent_logs
                if "429" in item.message.lower()
                or "rate limit" in item.message.lower()
                or (item.details and "rate limit" in item.details.lower())
            ]
        )
        if rate_limit_hits >= 3:
            signals.append(f"Generalized rate limiting detected ({rate_limit_hits} events).")

        colab_errors = len(
            [
                item
                for item in recent_logs
                if item.level.upper() == "ERROR"
                and (
                    "colab" in item.message.lower()
                    or (item.details and "colab" in item.details.lower())
                )
            ]
        )
        if colab_errors >= 3:
            signals.append(f"Repeated Colab startup/opening errors detected ({colab_errors} events).")

        return signals

    def _pause_jobs(self, all_priorities: bool) -> int:
        jobs = self.repo.list_scheduler_jobs()
        paused = 0
        for job in jobs:
            if job.dead_letter:
                continue
            if job.status not in PAUSABLE_JOB_STATUSES:
                continue
            priority = (job.priority or "medium").lower()
            if all_priorities or priority in {"medium", "low"}:
                self.repo.update_scheduler_job(job, status="Paused")
                paused += 1
        return paused

    def _resume_paused_jobs(self, limit: int) -> int:
        jobs = [job for job in self.repo.list_scheduler_jobs() if job.status == "Paused" and not job.dead_letter]
        jobs.sort(key=lambda job: (PRIORITY_ORDER.get((job.priority or "medium").lower(), 1), job.created_at))
        resumed = 0
        for job in jobs[: max(0, limit)]:
            self.repo.update_scheduler_job(job, status="Queued", next_attempt_at=datetime.utcnow(), error_message=None)
            resumed += 1
        return resumed

    def _destroy_low_score_vms(self, limit: int) -> int:
        running_vms = [vm for vm in self.repo.list_vms(include_deleted=False) if vm.status == "running"]
        if not running_vms:
            return 0

        high_priority_vm_ids = {
            job.vm_id
            for job in self.repo.list_scheduler_jobs()
            if job.vm_id and job.status in ACTIVE_JOB_STATUSES and (job.priority or "medium").lower() == "high"
        }
        identity_by_vm = {item.vm_id: item for item in self.repo.list_identities()}
        candidates = []
        for vm in running_vms:
            if vm.id in high_priority_vm_ids:
                continue
            identity = identity_by_vm.get(vm.id)
            trust_score = int(identity.trust_score) if identity is not None else 100
            identity_status = identity.status.lower() if identity is not None else "secure"
            vm_secure = (vm.verification_status or "").lower() == "secure"
            if trust_score < 70 or identity_status != "secure" or not vm_secure:
                candidates.append((trust_score, vm))
        candidates.sort(key=lambda item: item[0])

        removed = 0
        for _, vm in candidates[: max(0, limit)]:
            self.repo.update_vm(vm, status="deleted", verification_status="Warning")
            self.repo.create_operation(
                resource_type="vm",
                resource_id=vm.id,
                operation="delete",
                status="succeeded",
                message="Preventive delete in protection mode.",
            )
            self.repo.add_log("Intelligence", "WARNING", f"Preventively deleted low-score VM {vm.id}.")
            removed += 1
        return removed

    def _store_telemetry_sample(self, active_vms: int, total_vms: int, load: int, error_rate: float) -> None:
        now = datetime.utcnow()
        name = now.strftime("%H:%M")
        uptime = int((active_vms / max(total_vms, 1)) * 100)
        stability = max(0, 100 - int(error_rate * 2))
        self.repo.add_telemetry_sample(name=name, uptime=uptime, stability=stability, load=load)
        self.repo.trim_old_telemetry(keep_last=120)
