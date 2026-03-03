import hashlib
import json
from datetime import datetime
from pathlib import Path

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

    if repo.get_system_control_state() is None:
        repo.upsert_system_control_state(
            protective_mode=False,
            failsafe_active=False,
            cooldown_until=None,
            last_reason=None,
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

    if not repo.list_verification_requests(limit=1):
        repo.create_verification_request(
            request_id="V-101",
            vm_id="vm-001",
            worker_id="W-001",
            verification_type="SMS",
            status="Pending",
            provider="Twilio",
            destination="+123456789",
            retries=0,
        )
        repo.create_verification_request(
            request_id="V-102",
            vm_id="vm-002",
            worker_id="W-002",
            verification_type="QR",
            status="Verified",
            provider="Internal",
            destination="qr-session-002",
            retries=1,
        )
        repo.create_verification_request(
            request_id="V-103",
            vm_id="vm-003",
            worker_id="W-003",
            verification_type="SMS",
            status="Failed",
            provider="SmsPVA",
            destination="+987654321",
            retries=2,
            last_error="Provider timeout while waiting for OTP.",
        )

    if not repo.list_captcha_events(limit=1):
        repo.create_captcha_event(
            vm_id="vm-001",
            provider="google-recaptcha",
            status="solved",
            source="gmail-signup",
            score=93,
            latency_ms=3200,
            details="Token solved via anti-bot flow.",
        )
        repo.create_captcha_event(
            vm_id="vm-002",
            provider="google-recaptcha",
            status="failed",
            source="gmail-signup",
            score=58,
            latency_ms=8700,
            details="Challenge score below threshold.",
        )
        repo.create_captcha_event(
            vm_id="vm-003",
            provider="hcaptcha",
            status="timeout",
            source="account-maintenance",
            score=67,
            latency_ms=12000,
            details="Timeout waiting for solver callback.",
        )

    if repo.get_account_mode() is None:
        repo.upsert_account_mode("one_to_one")

    if repo.get_n8n_role() is None:
        repo.upsert_n8n_role("secondary_automation", notes="n8n acts as secondary automation layer.")

    n8n_workflow_id = "real-api-lane"
    if repo.get_n8n_workflow(n8n_workflow_id) is None:
        definition = {}
        workflow_file = (Path(__file__).resolve().parents[2] / "n8n" / "real_api_lane_workflow.json").resolve()
        if workflow_file.exists():
            try:
                definition = json.loads(workflow_file.read_text(encoding="utf-8"))
            except Exception:
                definition = {}
        definition_json = json.dumps(definition, sort_keys=True, separators=(",", ":"), ensure_ascii=True)
        version_hash = hashlib.sha256(definition_json.encode("utf-8")).hexdigest()
        repo.upsert_n8n_workflow(
            workflow_id=n8n_workflow_id,
            name="Real API Lane - VM + IP + Verification + CAPTCHA + Job",
            source="bundled",
            active=False,
            version_hash=version_hash,
            definition_json=definition_json,
        )

    if not repo.list_google_accounts():
        repo.create_google_account(account_id="acc-001", email="alpha.worker@example.com")
        repo.create_google_account(account_id="acc-002", email="beta.worker@example.com")
        repo.create_google_account(account_id="acc-003", email="gamma.worker@example.com")
