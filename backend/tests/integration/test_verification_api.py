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
from backend.routers import orchestrator, verification
from backend.services import verification as verification_service_module
from backend.services.bootstrap import seed_defaults


class VerificationApiIntegrationTest(unittest.TestCase):
    def setUp(self) -> None:
        temp_root = (Path.cwd() / "backend" / "tests" / ".tmp").resolve()
        temp_root.mkdir(parents=True, exist_ok=True)
        self.temp_dir = temp_root / f"verification-{int(time.time() * 1000)}-{os.getpid()}"
        self.temp_dir.mkdir(parents=True, exist_ok=True)
        db_path = self.temp_dir / "integration.db"
        self.engine = create_engine(
            f"sqlite:///{db_path.as_posix()}",
            future=True,
            connect_args={"check_same_thread": False},
        )
        self.SessionLocal = sessionmaker(bind=self.engine, autoflush=False, autocommit=False, future=True)
        Base.metadata.create_all(bind=self.engine)

        self._original_verification_session_local = verification_service_module.SessionLocal
        verification_service_module.SessionLocal = self.SessionLocal

        with self.SessionLocal() as db:
            seed_defaults(db)

        app = FastAPI()
        app.include_router(orchestrator.router, prefix="/api/v1/orchestrator")
        app.include_router(verification.router, prefix="/api/v1/verification")

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
        verification_service_module.SessionLocal = self._original_verification_session_local
        self.engine.dispose()
        shutil.rmtree(self.temp_dir, ignore_errors=True)

    def test_verification_requests_retry_and_captcha_summary(self) -> None:
        list_response = self.client.get("/api/v1/verification/requests")
        self.assertEqual(list_response.status_code, 200, list_response.text)
        requests_payload = list_response.json()
        self.assertGreaterEqual(len(requests_payload), 3)
        self.assertTrue(any(item["verification_type"] == "SMS" for item in requests_payload))
        self.assertTrue(any(item["verification_type"] == "QR" for item in requests_payload))

        summary_before = self.client.get("/api/v1/verification/captcha/summary")
        self.assertEqual(summary_before.status_code, 200, summary_before.text)
        self.assertGreaterEqual(summary_before.json()["total"], 1)

        retry_response = self.client.post("/api/v1/verification/requests/V-103/retry")
        self.assertEqual(retry_response.status_code, 200, retry_response.text)
        operation_id = retry_response.json()["id"]

        operation = self._wait_for_operation_terminal(operation_id)
        self.assertEqual(operation["status"], "succeeded")

        updated_list = self.client.get("/api/v1/verification/requests").json()
        retried = next(item for item in updated_list if item["id"] == "V-103")
        self.assertEqual(retried["status"], "Verified")
        self.assertGreaterEqual(retried["retries"], 3)

        summary_after = self.client.get("/api/v1/verification/captcha/summary").json()
        self.assertGreater(summary_after["total"], summary_before.json()["total"])

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
