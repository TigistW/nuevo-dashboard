from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import BackgroundTasks, HTTPException

from ..database import SessionLocal
from ..models import CaptchaEvent, CaptchaSummary, OperationStatus, VerificationRequest
from ..repositories import StorageRepository
from .utils import isoformat_or_none
from .workflow_logging import log_workflow_step


class VerificationService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def list_requests(self, limit: int = 100) -> list[VerificationRequest]:
        rows = self.repo.list_verification_requests(limit=max(1, min(limit, 500)))
        return [self._to_request(item) for item in rows]

    def retry_request(self, request_id: str, background_tasks: BackgroundTasks) -> OperationStatus:
        row = self.repo.get_verification_request(request_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"Verification request '{request_id}' not found.")

        in_flight = self.repo.get_latest_operation("verification", request_id, "retry", {"pending", "running"})
        if in_flight is not None:
            return self._to_operation(in_flight)

        retries = int(row.retries or 0) + 1
        self.repo.update_verification_request(row, status="Pending", retries=retries, last_error=None)
        operation = self.repo.create_operation(
            resource_type="verification",
            resource_id=request_id,
            operation="retry",
            status="pending",
            message=f"Verification retry queued for '{request_id}'.",
        )
        self.repo.add_log("Verification", "INFO", f"Retry requested for verification '{request_id}'.")
        log_workflow_step(
            self.repo,
            step="verification",
            phase="queued",
            message=f"Verification retry queued for '{request_id}'.",
            details=f"operation_id={operation.id}",
        )
        background_tasks.add_task(_run_retry_task, request_id, operation.id)
        return self._to_operation(operation)

    def list_captcha_events(self, limit: int = 100) -> list[CaptchaEvent]:
        rows = self.repo.list_captcha_events(limit=max(1, min(limit, 500)))
        return [self._to_captcha_event(item) for item in rows]

    def get_captcha_summary(self, hours: int = 24) -> CaptchaSummary:
        bounded_hours = max(1, min(hours, 720))
        since = datetime.utcnow() - timedelta(hours=bounded_hours)
        events = [item for item in self.repo.list_captcha_events(limit=5000) if item.created_at >= since]

        total = len(events)
        solved = sum(1 for item in events if item.status.lower() == "solved")
        failed = sum(1 for item in events if item.status.lower() == "failed")
        timeout = sum(1 for item in events if item.status.lower() == "timeout")
        bypassed = sum(1 for item in events if item.status.lower() == "bypassed")
        avg_latency_ms = int(round(sum(item.latency_ms for item in events) / total)) if total else 0
        success_rate = round(((solved + bypassed) / total) * 100, 1) if total else 0.0

        return CaptchaSummary(
            total=total,
            solved=solved,
            failed=failed,
            timeout=timeout,
            bypassed=bypassed,
            success_rate=success_rate,
            avg_latency_ms=avg_latency_ms,
        )

    def _to_request(self, row) -> VerificationRequest:
        return VerificationRequest(
            id=row.id,
            vm_id=row.vm_id,
            worker_id=row.worker_id,
            verification_type=row.verification_type,
            status=row.status,
            provider=row.provider,
            destination=row.destination,
            retries=int(row.retries or 0),
            last_error=row.last_error,
            created_at=row.created_at.isoformat(),
            updated_at=row.updated_at.isoformat(),
        )

    def _to_captcha_event(self, row) -> CaptchaEvent:
        return CaptchaEvent(
            id=row.id,
            vm_id=row.vm_id,
            provider=row.provider,
            status=row.status,
            source=row.source,
            score=row.score,
            latency_ms=row.latency_ms,
            created_at=row.created_at.isoformat(),
            details=row.details,
        )

    def _to_operation(self, row) -> OperationStatus:
        return OperationStatus(
            id=row.id,
            resource_type=row.resource_type,
            resource_id=row.resource_id,
            operation=row.operation,
            status=row.status,
            message=row.message,
            requested_at=isoformat_or_none(row.requested_at),
            started_at=isoformat_or_none(row.started_at),
            finished_at=isoformat_or_none(row.finished_at),
        )


def _run_retry_task(request_id: str, operation_id: str) -> None:
    db = SessionLocal()
    repo = StorageRepository(db)
    try:
        repo.update_operation_status(operation_id, "running", f"Retry in progress for '{request_id}'.")
        row = repo.get_verification_request(request_id)
        if row is None:
            raise RuntimeError(f"Verification request '{request_id}' not found.")

        # Simulate provider behavior: QR usually resolves quickly, SMS stabilizes after retries.
        verification_type = (row.verification_type or "").upper()
        if verification_type == "QR" or int(row.retries or 0) >= 2:
            repo.update_verification_request(row, status="Verified", last_error=None)
            repo.create_captcha_event(
                vm_id=row.vm_id,
                provider="google-recaptcha",
                status="solved",
                source="verification-retry",
                score=91,
                latency_ms=3800,
                details=f"Retry succeeded for request '{request_id}'.",
            )
            message = f"Verification '{request_id}' resolved."
        else:
            repo.update_verification_request(row, status="Pending", last_error="OTP still pending from provider.")
            repo.create_captcha_event(
                vm_id=row.vm_id,
                provider="google-recaptcha",
                status="timeout",
                source="verification-retry",
                score=72,
                latency_ms=6400,
                details=f"Retry pending for request '{request_id}'.",
            )
            message = f"Verification '{request_id}' still pending."

        repo.update_operation_status(operation_id, "succeeded", message)
        repo.add_log("Verification", "INFO", message)
    except Exception as exc:
        try:
            repo.update_operation_status(operation_id, "failed", str(exc))
        except Exception:
            pass
        repo.add_log("Verification", "ERROR", f"Retry failed for verification '{request_id}'.", str(exc))
    finally:
        db.close()
