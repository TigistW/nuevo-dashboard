import time
import unittest
import shutil
import os
from datetime import datetime, timedelta
from pathlib import Path

import backend.db_models
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from backend.config import settings
from backend.database import Base
from backend.dependencies import get_db
from backend.repositories import StorageRepository
from backend.routers import automation, intelligence, network, orchestrator, security
from backend.services import automation as automation_service_module
from backend.services import network as network_service_module
from backend.services import orchestrator as orchestrator_service_module
from backend.services.bootstrap import seed_defaults


class WorkflowFlowIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        temp_root = (Path.cwd() / "backend" / "tests" / ".tmp").resolve()
        temp_root.mkdir(parents=True, exist_ok=True)
        self.temp_dir = temp_root / f"integration-{int(time.time() * 1000)}-{os.getpid()}"
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        db_path = self.temp_dir / "integration.db"
        self.engine = create_engine(
            f"sqlite:///{db_path.as_posix()}",
            future=True,
            connect_args={"check_same_thread": False},
        )
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(bind=self.engine)

        self._original_infra_mode = settings.infra_execution_mode
        self._original_infra_transport = settings.infra_transport
        self._original_infra_api_fallback_shell = settings.infra_api_fallback_shell
        object.__setattr__(settings, "infra_execution_mode", "mock")
        object.__setattr__(settings, "infra_transport", "shell")
        object.__setattr__(settings, "infra_api_fallback_shell", True)

        self._original_orchestrator_session_local = orchestrator_service_module.SessionLocal
        self._original_network_session_local = network_service_module.SessionLocal
        self._original_automation_session_local = automation_service_module.SessionLocal
        orchestrator_service_module.SessionLocal = self.SessionLocal
        network_service_module.SessionLocal = self.SessionLocal
        automation_service_module.SessionLocal = self.SessionLocal

        with self.SessionLocal() as db:
            seed_defaults(db)

        app = FastAPI()
        app.include_router(orchestrator.router, prefix="/api/v1/orchestrator")
        app.include_router(network.router, prefix="/api/v1/network")
        app.include_router(security.router, prefix="/api/v1/security")
        app.include_router(intelligence.router, prefix="/api/v1/intelligence")
        app.include_router(automation.router, prefix="/api/v1/automation")

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
        orchestrator_service_module.SessionLocal = self._original_orchestrator_session_local
        network_service_module.SessionLocal = self._original_network_session_local
        automation_service_module.SessionLocal = self._original_automation_session_local
        object.__setattr__(settings, "infra_execution_mode", self._original_infra_mode)
        object.__setattr__(settings, "infra_transport", self._original_infra_transport)
        object.__setattr__(settings, "infra_api_fallback_shell", self._original_infra_api_fallback_shell)
        self.engine.dispose()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_create_assign_verify_and_autoscale_cycle(self) -> None:
        create_response = self.client.post(
            "/api/v1/orchestrator/create",
            json={
                "id": "vm-flow-1",
                "country": "de",
                "ram": "256MB",
                "cpu": "1",
                "template_id": "t-001",
            },
        )
        self.assertEqual(create_response.status_code, 200, create_response.text)
        vm_ready = self._wait_for_vm_ready("vm-flow-1")
        self.assertEqual(vm_ready["status"].lower(), "running")
        self.assertNotEqual(vm_ready["public_ip"].lower(), "pending")

        rotate_response = self.client.post("/api/v1/network/tunnels/rotate/vm-flow-1")
        self.assertEqual(rotate_response.status_code, 200, rotate_response.text)
        rotate_operation_id = rotate_response.json()["id"]
        rotate_operation = self._wait_for_operation_terminal(rotate_operation_id)
        self.assertEqual(rotate_operation["status"], "succeeded")

        isolation_response = self.client.post("/api/v1/security/test-isolation")
        self.assertEqual(isolation_response.status_code, 200, isolation_response.text)
        self.assertEqual(isolation_response.json()["status"], "Passed")

        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            for index in range(3):
                repo.create_scheduler_job(
                    job_id=f"queued-flow-{index}",
                    task_type="LoadTest",
                    vm_id=None,
                    status="Queued",
                    progress=0,
                )

        autoscale_up_response = self.client.post(
            "/api/v1/automation/scheduler/autoscale",
            json={
                "min_vms": 1,
                "max_vms": 4,
                "jobs_per_vm": 1,
                "country": "de",
                "country_min_pools": {"de": 2},
                "ram": "256MB",
                "cpu": "1",
                "template_id": "t-001",
            },
        )
        self.assertEqual(autoscale_up_response.status_code, 200, autoscale_up_response.text)
        autoscale_up_payload = autoscale_up_response.json()
        self.assertEqual(autoscale_up_payload["action"], "scale_up")
        self._wait_for_running_count(expected=2, exact=False)

        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            for job in repo.list_scheduler_jobs():
                repo.update_scheduler_job(job, status="Completed", progress=100, error_message=None)

        autoscale_down_response = self.client.post(
            "/api/v1/automation/scheduler/autoscale",
            json={
                "min_vms": 1,
                "max_vms": 4,
                "jobs_per_vm": 2,
                "country": "de",
                "country_min_pools": {"de": 1},
                "ram": "256MB",
                "cpu": "1",
                "template_id": "t-001",
            },
        )
        self.assertEqual(autoscale_down_response.status_code, 200, autoscale_down_response.text)
        autoscale_down_payload = autoscale_down_response.json()
        self.assertEqual(autoscale_down_payload["action"], "scale_down")
        if autoscale_down_payload.get("operation_id"):
            operation = self._wait_for_operation_terminal(autoscale_down_payload["operation_id"])
            self.assertEqual(operation["status"], "succeeded")
        self._wait_for_running_count(expected=1, exact=True)

    def test_autoscale_rejects_country_pool_total_over_max(self) -> None:
        response = self.client.post(
            "/api/v1/automation/scheduler/autoscale",
            json={
                "min_vms": 0,
                "max_vms": 2,
                "jobs_per_vm": 1,
                "country": "us",
                "country_min_pools": {"us": 2, "de": 1},
                "ram": "256MB",
                "cpu": "1",
                "template_id": "t-001",
            },
        )
        self.assertEqual(response.status_code, 400, response.text)

    def test_scheduler_dead_letter_for_unrunnable_job(self) -> None:
        config_response = self.client.get("/api/v1/automation/scheduler/config")
        self.assertEqual(config_response.status_code, 200, config_response.text)
        self.assertGreaterEqual(config_response.json()["concurrency_limit"], 1)

        enqueue_response = self.client.post(
            "/api/v1/automation/scheduler/jobs",
            json={
                "id": "job-dead-letter-1",
                "task_type": "LoadTest",
                "vm_id": None,
                "status": "Queued",
                "priority": "high",
                "progress": 0,
                "max_retries": 1,
            },
        )
        self.assertEqual(enqueue_response.status_code, 200, enqueue_response.text)
        self.assertIn(enqueue_response.json()["status"], {"Queued", "Dispatching", "Running", "Retrying", "DeadLetter"})

        terminal_job = self._wait_for_job_terminal("job-dead-letter-1", timeout_seconds=8.0)
        self.assertEqual(terminal_job["status"], "DeadLetter")
        self.assertTrue(terminal_job["dead_letter"])

    def test_failsafe_blocks_vm_creation_until_reset(self) -> None:
        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            for idx in range(3):
                repo.add_log("Automation", "ERROR", f"HTTP 429 rate limit event #{idx + 1}")

        evaluate_response = self.client.post("/api/v1/intelligence/control/evaluate?apply=true")
        self.assertEqual(evaluate_response.status_code, 200, evaluate_response.text)
        payload = evaluate_response.json()
        self.assertTrue(payload["failsafe_active"])
        self.assertTrue(any("rate limiting" in signal.lower() for signal in payload["signals"]))

        blocked_create = self.client.post(
            "/api/v1/orchestrator/create",
            json={
                "id": "vm-failsafe-blocked",
                "country": "de",
                "ram": "256MB",
                "cpu": "1",
                "template_id": "t-001",
            },
        )
        self.assertEqual(blocked_create.status_code, 503, blocked_create.text)

        reset_response = self.client.post("/api/v1/intelligence/control/reset")
        self.assertEqual(reset_response.status_code, 200, reset_response.text)
        self.assertFalse(reset_response.json()["failsafe_active"])

        create_after_reset = self.client.post(
            "/api/v1/orchestrator/create",
            json={
                "id": "vm-failsafe-allowed",
                "country": "de",
                "ram": "256MB",
                "cpu": "1",
                "template_id": "t-001",
            },
        )
        self.assertEqual(create_after_reset.status_code, 200, create_after_reset.text)

    def test_scheduler_window_defers_dispatch_until_tick(self) -> None:
        now_hour = datetime.utcnow().hour
        window_start = (now_hour + 2) % 24
        window_end = (window_start + 1) % 24

        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            repo.create_vm(
                vm_id="vm-window-1",
                country="de",
                ram_mb=256,
                cpu_cores=1,
                template_id="t-001",
                status="running",
            )

        enqueue_response = self.client.post(
            "/api/v1/automation/scheduler/jobs",
            json={
                "id": "job-window-1",
                "task_type": "LoadTest",
                "vm_id": "vm-window-1",
                "status": "Queued",
                "priority": "high",
                "progress": 0,
                "max_retries": 0,
                "schedule_window_start_hour": window_start,
                "schedule_window_end_hour": window_end,
                "timezone_offset_minutes": 0,
                "jitter_seconds": 0,
            },
        )
        self.assertEqual(enqueue_response.status_code, 200, enqueue_response.text)
        self.assertEqual(enqueue_response.json()["status"], "Queued")

        queue_before = self.client.get("/api/v1/automation/scheduler/queue")
        self.assertEqual(queue_before.status_code, 200, queue_before.text)
        before_job = next(item for item in queue_before.json() if item["id"] == "job-window-1")
        self.assertEqual(before_job["status"], "Queued")
        self.assertIsNotNone(before_job.get("next_attempt_at"))

        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            job = repo.get_scheduler_job("job-window-1")
            self.assertIsNotNone(job)
            repo.update_scheduler_job(
                job,
                schedule_window_start_hour=None,
                schedule_window_end_hour=None,
                next_attempt_at=datetime.utcnow() - timedelta(seconds=1),
            )

        tick_response = self.client.post("/api/v1/automation/scheduler/tick")
        self.assertEqual(tick_response.status_code, 200, tick_response.text)
        self.assertGreaterEqual(tick_response.json()["dispatched"], 1)

    def test_scheduler_tick_enqueues_periodic_warmup(self) -> None:
        with self.SessionLocal() as db:
            repo = StorageRepository(db)
            repo.create_vm(
                vm_id="vm-warmup-1",
                country="us",
                ram_mb=256,
                cpu_cores=1,
                template_id="t-001",
                status="running",
            )

        tick_response = self.client.post("/api/v1/automation/scheduler/tick")
        self.assertEqual(tick_response.status_code, 200, tick_response.text)
        self.assertGreaterEqual(tick_response.json()["warmup_jobs_enqueued"], 1)

        queue_response = self.client.get("/api/v1/automation/scheduler/queue")
        self.assertEqual(queue_response.status_code, 200, queue_response.text)
        warmup_jobs = [item for item in queue_response.json() if item.get("task_type") == "AccountWarmup"]
        self.assertTrue(any(job.get("vm_id") == "vm-warmup-1" for job in warmup_jobs))

    def test_healing_rule_can_be_toggled(self) -> None:
        list_response = self.client.get("/api/v1/automation/healing/rules")
        self.assertEqual(list_response.status_code, 200, list_response.text)
        rules = list_response.json()
        self.assertGreater(len(rules), 0)
        target_rule = rules[0]
        original_enabled = bool(target_rule["enabled"])

        update_response = self.client.put(
            f"/api/v1/automation/healing/rules/{target_rule['id']}",
            json={"enabled": not original_enabled},
        )
        self.assertEqual(update_response.status_code, 200, update_response.text)
        updated = update_response.json()
        self.assertEqual(updated["id"], target_rule["id"])
        self.assertEqual(updated["enabled"], (not original_enabled))

        verify_response = self.client.get("/api/v1/automation/healing/rules")
        self.assertEqual(verify_response.status_code, 200, verify_response.text)
        verify_rule = next(item for item in verify_response.json() if item["id"] == target_rule["id"])
        self.assertEqual(verify_rule["enabled"], (not original_enabled))

    def _wait_for_vm_ready(self, vm_id: str, timeout_seconds: float = 5.0) -> dict:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            response = self.client.get("/api/v1/orchestrator/list")
            self.assertEqual(response.status_code, 200, response.text)
            for vm in response.json():
                if vm.get("id") != vm_id:
                    continue
                status = str(vm.get("status", "")).lower()
                public_ip = str(vm.get("public_ip", ""))
                if status == "running" and public_ip and public_ip.lower() != "pending":
                    return vm
            time.sleep(0.05)
        raise AssertionError(f"VM '{vm_id}' did not reach running state.")

    def _wait_for_operation_terminal(self, operation_id: str, timeout_seconds: float = 5.0) -> dict:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            response = self.client.get(f"/api/v1/orchestrator/operations/{operation_id}")
            self.assertEqual(response.status_code, 200, response.text)
            payload = response.json()
            if payload.get("status") in {"succeeded", "failed"}:
                return payload
            time.sleep(0.05)
        raise AssertionError(f"Operation '{operation_id}' did not reach terminal status.")

    def _wait_for_running_count(self, expected: int, exact: bool, timeout_seconds: float = 5.0) -> list[dict]:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            response = self.client.get("/api/v1/orchestrator/list")
            self.assertEqual(response.status_code, 200, response.text)
            running_vms = [vm for vm in response.json() if str(vm.get("status", "")).lower() == "running"]
            if exact and len(running_vms) == expected:
                return running_vms
            if not exact and len(running_vms) >= expected:
                return running_vms
            time.sleep(0.05)
        raise AssertionError(f"Expected running VM count condition not met for expected={expected}, exact={exact}.")

    def _wait_for_job_terminal(self, job_id: str, timeout_seconds: float = 8.0) -> dict:
        deadline = time.time() + timeout_seconds
        while time.time() < deadline:
            response = self.client.get("/api/v1/automation/scheduler/queue")
            self.assertEqual(response.status_code, 200, response.text)
            jobs = response.json()
            for job in jobs:
                if job.get("id") != job_id:
                    continue
                if job.get("status") in {"Completed", "Failed", "DeadLetter"}:
                    return job
            time.sleep(0.1)
        raise AssertionError(f"Job '{job_id}' did not reach terminal state.")
