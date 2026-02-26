from datetime import datetime

from sqlalchemy.orm import Session

from ..repositories import StorageRepository


def seed_defaults(db: Session) -> None:
    repo = StorageRepository(db)

    if repo.get_guardrails() is None:
        repo.upsert_guardrails(
            max_vms=50,
            min_host_ram_mb=2048,
            max_cpu_per_vm=2,
            overload_prevention=True,
        )

    if repo.get_template("t-001") is None:
        repo.create_template(
            template_id="t-001",
            name="Alpine Minimal v3.18",
            version="1.2.0",
            base_image="alpine-3.18.ext4",
        )

    if not repo.list_healing_rules():
        repo.create_healing_rule(
            rule_id="1",
            trigger="WireGuard Tunnel Down",
            action="Auto-Reconnect",
            enabled=True,
        )
        repo.create_healing_rule(
            rule_id="2",
            trigger="Endpoint Unreachable",
            action="Restart Micro-VM",
            enabled=True,
        )

    if not repo.list_repositories():
        repo.create_repository(
            name="Global ISP Database",
            url="https://github.com/example/isp-db",
            status="active",
            api_endpoint="/api/v1/identity/isp-db",
            last_sync=datetime.utcnow(),
        )

    if not repo.list_telemetry_samples(limit=1):
        for point in [
            ("00:00", 98, 95, 20),
            ("04:00", 99, 97, 15),
            ("08:00", 95, 90, 45),
            ("12:00", 97, 92, 60),
            ("16:00", 99, 98, 35),
            ("20:00", 98, 96, 25),
        ]:
            repo.add_telemetry_sample(name=point[0], uptime=point[1], stability=point[2], load=point[3])

    if not repo.list_threat_samples(limit=1):
        for point in [
            ("00:00", 12),
            ("04:00", 45),
            ("08:00", 28),
            ("12:00", 89),
            ("16:00", 34),
            ("20:00", 56),
        ]:
            repo.add_threat_sample(time_label=point[0], threats=point[1])
