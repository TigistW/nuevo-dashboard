import os
import shutil
import time
import unittest
from pathlib import Path

import backend.db_models
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.database import Base
from backend.dependencies import get_db
from backend.repositories import StorageRepository
from backend.routers import (
    accounts,
    antiblock,
    architecture,
    benchmark,
    footprint,
    ip_policy,
    n8n,
    notebook,
    orchestrator,
    smtp,
)
from backend.services import smtp as smtp_service_module
from backend.services.bootstrap import seed_defaults


class ExtendedFeatureIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        temp_root = (Path.cwd() / "backend" / "tests" / ".tmp").resolve()
        temp_root.mkdir(parents=True, exist_ok=True)
        self.temp_dir = temp_root / f"extended-{int(time.time() * 1000)}-{os.getpid()}"
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        db_path = self.temp_dir / "integration.db"
        self.engine = create_engine(
            f"sqlite:///{db_path.as_posix()}",
            future=True,
            connect_args={"check_same_thread": False},
        )
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(bind=self.engine)

        self._original_smtp_session_local = smtp_service_module.SessionLocal
        smtp_service_module.SessionLocal = self.SessionLocal

        with self.SessionLocal() as db:
            seed_defaults(db)

        app = FastAPI()
        app.include_router(orchestrator.router, prefix="/api/v1/orchestrator")
        app.include_router(accounts.router, prefix="/api/v1/accounts")
        app.include_router(notebook.router, prefix="/api/v1/notebook")
        app.include_router(antiblock.router, prefix="/api/v1/antiblock")
        app.include_router(ip_policy.router, prefix="/api/v1/ip-policy")
        app.include_router(footprint.router, prefix="/api/v1/footprint")
        app.include_router(smtp.router, prefix="/api/v1/smtp")
        app.include_router(benchmark.router, prefix="/api/v1/benchmark")
        app.include_router(architecture.router, prefix="/api/v1/architecture")
        app.include_router(n8n.router, prefix="/api/v1/n8n")

        def override_get_db():
            db = self.SessionLocal()
            try:
                yield db
            finally:
                db.close()

        app.dependency_overrides[get_db] = override_get_db
        self.client = TestClient(app)

    def tearDown(self) -> None:
        self.client.close()
        smtp_service_module.SessionLocal = self._original_smtp_session_local
        self.engine.dispose()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_account_modes_and_assignment(self) -> None:
        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            repo.create_vm(
                vm_id="vm-accounts-1",
                country="us",
                ram_mb=256,
                cpu_cores=1,
                template_id="t-001",
                status="running",
            )

        create_one = self.client.post("/api/v1/accounts/create", json={"id": "acc-a", "email": "worker-a@example.com"})
        self.assertEqual(create_one.status_code, 200, create_one.text)
        create_two = self.client.post("/api/v1/accounts/create", json={"id": "acc-b", "email": "worker-b@example.com"})
        self.assertEqual(create_two.status_code, 200, create_two.text)

        mode_set = self.client.put("/api/v1/accounts/mode", json={"mode": "one_to_one"})
        self.assertEqual(mode_set.status_code, 200, mode_set.text)
        self.assertEqual(mode_set.json()["mode"], "one_to_one")

        assign_first = self.client.post("/api/v1/accounts/assign", json={"vm_id": "vm-accounts-1"})
        self.assertEqual(assign_first.status_code, 200, assign_first.text)
        assigned_id = assign_first.json()["account_id"]

        assign_second = self.client.post("/api/v1/accounts/assign", json={"vm_id": "vm-accounts-1"})
        self.assertEqual(assign_second.status_code, 200, assign_second.text)
        self.assertEqual(assign_second.json()["account_id"], assigned_id)

        mode_pool = self.client.put("/api/v1/accounts/mode", json={"mode": "dynamic_pool"})
        self.assertEqual(mode_pool.status_code, 200, mode_pool.text)
        self.assertEqual(mode_pool.json()["mode"], "dynamic_pool")

    def test_notebook_care_and_antiblock_risk(self) -> None:
        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            repo.create_vm(
                vm_id="vm-notebook-1",
                country="de",
                ram_mb=256,
                cpu_cores=1,
                template_id="t-001",
                status="running",
            )

        create_nb = self.client.post(
            "/api/v1/notebook/sessions",
            json={"id": "nb-1", "vm_id": "vm-notebook-1", "gpu_assigned_gb": 12.0},
        )
        self.assertEqual(create_nb.status_code, 200, create_nb.text)

        distribution = self.client.post(
            "/api/v1/notebook/distribution/plan",
            json={"required_gpu_gb": 30, "target_min_percent": 70, "target_max_percent": 80, "gpu_per_notebook_gb": 12},
        )
        self.assertEqual(distribution.status_code, 200, distribution.text)
        self.assertGreaterEqual(distribution.json()["notebooks_required"], 4)

        tick_resp = self.client.post("/api/v1/notebook/tick")
        self.assertEqual(tick_resp.status_code, 200, tick_resp.text)

        event_resp = self.client.post(
            "/api/v1/notebook/sessions/nb-1/event",
            json={"event_type": "stopped", "details": "Session halted by Colab"},
        )
        self.assertEqual(event_resp.status_code, 200, event_resp.text)
        self.assertEqual(event_resp.json()["risk_delta"], 3)

        risk_resp = self.client.post(
            "/api/v1/antiblock/events",
            json={
                "vm_id": "vm-notebook-1",
                "event_type": "additional_verification",
                "details": "Unexpected additional verification prompt.",
            },
        )
        self.assertEqual(risk_resp.status_code, 200, risk_resp.text)
        self.assertEqual(risk_resp.json()["action"], "destroy_vm")

    def test_notebook_worker_status_and_url_persistence(self) -> None:
        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            repo.create_vm(
                vm_id="vm-notebook-worker-1",
                country="us",
                ram_mb=256,
                cpu_cores=1,
                template_id="t-001",
                status="running",
            )

        create_nb = self.client.post(
            "/api/v1/notebook/sessions",
            json={
                "id": "nb-worker-1",
                "vm_id": "vm-notebook-worker-1",
                "gpu_assigned_gb": 12.0,
                "notebook_url": "https://colab.research.google.com/drive/mock-notebook-1",
            },
        )
        self.assertEqual(create_nb.status_code, 200, create_nb.text)
        created = create_nb.json()
        self.assertEqual(created["notebook_url"], "https://colab.research.google.com/drive/mock-notebook-1")
        self.assertIsNone(created["last_probe_at"])
        self.assertIsNone(created["last_probe_message"])

        worker_status = self.client.get("/api/v1/notebook/worker/status")
        self.assertEqual(worker_status.status_code, 200, worker_status.text)
        status_payload = worker_status.json()
        self.assertIn("enabled", status_payload)
        self.assertIn("running", status_payload)
        self.assertIn("playwright_available", status_payload)

    def test_ip_policy_and_smtp_ephemeral_flow(self) -> None:
        bad_ip = "203.0.113.50"
        event_resp = self.client.post(
            "/api/v1/ip-policy/history/event",
            json={"ip": bad_ip, "event": "blacklist_hit", "severity": "critical"},
        )
        self.assertEqual(event_resp.status_code, 200, event_resp.text)
        self.assertTrue(event_resp.json()["discarded"])

        eval_resp = self.client.post(
            "/api/v1/ip-policy/evaluate",
            json={"ip": bad_ip, "context": "smtp", "cooldown_minutes": 120},
        )
        self.assertEqual(eval_resp.status_code, 200, eval_resp.text)
        self.assertFalse(eval_resp.json()["recommended"])

        smtp_response = self.client.post(
            "/api/v1/smtp/send",
            json={
                "id": "smtp-1",
                "domain": "example.org",
                "sender": "ops@example.org",
                "recipients": ["a@example.net", "b@example.net", "c@example.net"],
                "implementation": "postfix",
                "country": "us",
                "preferred_ip": bad_ip,
            },
        )
        self.assertEqual(smtp_response.status_code, 200, smtp_response.text)
        operation_id = smtp_response.json()["id"]
        operation = self._wait_for_operation_terminal(operation_id)
        self.assertEqual(operation["status"], "succeeded")

        task_resp = self.client.get("/api/v1/smtp/tasks/smtp-1")
        self.assertEqual(task_resp.status_code, 200, task_resp.text)
        task = task_resp.json()
        self.assertEqual(task["status"], "Completed")
        self.assertTrue(task["spf_enabled"])
        self.assertTrue(task["dkim_enabled"])
        self.assertTrue(task["dmarc_enabled"])
        self.assertTrue(task["rdns_enabled"])
        self.assertTrue(task["tls_enabled"])

    def test_benchmark_footprint_and_n8n_role(self) -> None:
        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            repo.create_vm(
                vm_id="vm-footprint-1",
                country="us",
                ram_mb=256,
                cpu_cores=1,
                template_id="t-001",
                status="running",
            )

        schedule = self.client.post(
            "/api/v1/footprint/activities",
            json={"vm_id": "vm-footprint-1", "delay_seconds": 0, "activity_type": "family_friendly_search"},
        )
        self.assertEqual(schedule.status_code, 200, schedule.text)

        tick = self.client.post("/api/v1/footprint/tick")
        self.assertEqual(tick.status_code, 200, tick.text)
        self.assertGreaterEqual(tick.json()["executed"], 1)

        benchmark_run = self.client.post(
            "/api/v1/benchmark/run",
            json={"protocols": ["wireguard", "openvpn", "ssh", "pyngrok"], "samples": 1},
        )
        self.assertEqual(benchmark_run.status_code, 200, benchmark_run.text)
        protocols = {item["protocol"] for item in benchmark_run.json()}
        self.assertTrue({"wireguard", "openvpn", "ssh", "pyngrok"}.issubset(protocols))

        role_default = self.client.get("/api/v1/architecture/n8n-role")
        self.assertEqual(role_default.status_code, 200, role_default.text)
        self.assertIn(role_default.json()["role"], {"main_orchestrator", "secondary_automation", "eliminated"})

        role_update = self.client.put(
            "/api/v1/architecture/n8n-role",
            json={"role": "main_orchestrator", "notes": "n8n drives top-level scheduling"},
        )
        self.assertEqual(role_update.status_code, 200, role_update.text)
        self.assertEqual(role_update.json()["role"], "main_orchestrator")

    def test_n8n_workflow_import_and_run_lifecycle(self) -> None:
        import_response = self.client.post(
            "/api/v1/n8n/workflows/import",
            json={
                "workflow_id": "lane-test-001",
                "name": "Lane Test Workflow",
                "source": "integration-test",
                "active": True,
                "definition": {"nodes": [{"id": "n1", "name": "Manual Trigger"}], "connections": {}},
            },
        )
        self.assertEqual(import_response.status_code, 200, import_response.text)
        workflow = import_response.json()
        self.assertEqual(workflow["workflow_id"], "lane-test-001")
        self.assertTrue(workflow["active"])
        self.assertTrue(workflow["version_hash"])

        list_response = self.client.get("/api/v1/n8n/workflows")
        self.assertEqual(list_response.status_code, 200, list_response.text)
        self.assertTrue(any(item["workflow_id"] == "lane-test-001" for item in list_response.json()))

        start_run = self.client.post(
            "/api/v1/n8n/runs",
            json={
                "workflow_id": "lane-test-001",
                "external_execution_id": "exec-12345",
                "trigger": "manual",
                "context": {"vm_id": "vm-n8n-001"},
            },
        )
        self.assertEqual(start_run.status_code, 200, start_run.text)
        run = start_run.json()
        self.assertEqual(run["status"], "running")
        run_id = run["id"]

        event_response = self.client.post(
            f"/api/v1/n8n/runs/{run_id}/events",
            json={
                "phase": "verification",
                "status": "running",
                "message": "Verification step in progress.",
                "details": "sms provider=Twilio",
            },
        )
        self.assertEqual(event_response.status_code, 200, event_response.text)
        self.assertGreaterEqual(len(event_response.json()["events"]), 1)

        complete_response = self.client.put(
            f"/api/v1/n8n/runs/{run_id}",
            json={"status": "succeeded", "message": "Workflow completed from integration test."},
        )
        self.assertEqual(complete_response.status_code, 200, complete_response.text)
        completed = complete_response.json()
        self.assertEqual(completed["status"], "succeeded")
        self.assertIsNotNone(completed["finished_at"])

        runs_response = self.client.get("/api/v1/n8n/runs?workflow_id=lane-test-001")
        self.assertEqual(runs_response.status_code, 200, runs_response.text)
        self.assertTrue(any(item["id"] == run_id and item["status"] == "succeeded" for item in runs_response.json()))

    def _wait_for_operation_terminal(self, operation_id: str, timeout_seconds: float = 5.0) -> dict:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            with self.SessionLocal() as db:
                repo = StorageRepository(db)
                operation = repo.get_operation(operation_id)
                if operation is not None and operation.status in {"succeeded", "failed"}:
                    return {
                        "id": operation.id,
                        "status": operation.status,
                        "message": operation.message,
                    }
            time.sleep(0.05)
        raise AssertionError(f"Operation '{operation_id}' did not reach terminal status.")
