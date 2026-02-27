import time
import unittest
import shutil
import os
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
from backend.routers import automation, network, orchestrator, security
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
