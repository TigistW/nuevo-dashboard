from __future__ import annotations

from datetime import datetime, timedelta

from ..repositories import StorageRepository


class IntelligenceService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_global_metrics(self) -> dict:
        active_vms = self.repo.count_vms(statuses={"running"})
        guardrails = self.repo.get_guardrails()
        total_vms = guardrails.max_vms if guardrails else max(active_vms, 1)

        active_tunnels = len([tunnel for tunnel in self.repo.list_tunnels() if tunnel.status == "Connected"])

        identities = self.repo.list_identities()
        if identities:
            secure_count = len([item for item in identities if item.status.lower() == "secure"])
            functional_ips_percent = round((secure_count / len(identities)) * 100)
        else:
            functional_ips_percent = 100

        host_ram_mb = self.repo.sum_vm_ram_mb(statuses={"running"})
        host_ram_gb = round(host_ram_mb / 1024, 1)

        host_cpu_percent = min(100, active_vms * 8 + active_tunnels * 2)
        recent_reboots = self.repo.count_recent_restart_operations(window=timedelta(hours=24))

        total_operations = self.repo.count_operations(since=datetime.utcnow() - timedelta(hours=24))
        failed_operations = self.repo.count_operations(
            since=datetime.utcnow() - timedelta(hours=24), status="failed"
        )
        error_rate_percent = round((failed_operations / total_operations) * 100, 2) if total_operations else 0.0

        self._store_telemetry_sample(
            active_vms=active_vms,
            total_vms=total_vms,
            load=host_cpu_percent,
            error_rate=error_rate_percent,
        )

        return {
            "active_vms": active_vms,
            "total_vms": total_vms,
            "active_tunnels": active_tunnels,
            "functional_ips_percent": functional_ips_percent,
            "host_cpu_percent": host_cpu_percent,
            "host_ram_gb": host_ram_gb,
            "recent_reboots": recent_reboots,
            "error_rate_percent": error_rate_percent,
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

    def _store_telemetry_sample(self, active_vms: int, total_vms: int, load: int, error_rate: float) -> None:
        now = datetime.utcnow()
        name = now.strftime("%H:%M")
        uptime = int((active_vms / max(total_vms, 1)) * 100)
        stability = max(0, 100 - int(error_rate * 2))
        self.repo.add_telemetry_sample(name=name, uptime=uptime, stability=stability, load=load)
        self.repo.trim_old_telemetry(keep_last=120)
