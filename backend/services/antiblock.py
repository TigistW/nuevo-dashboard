from __future__ import annotations

from datetime import datetime

from fastapi import HTTPException

from ..models import RiskEventRequest, RiskEventResponse
from ..repositories import StorageRepository


EVENT_WEIGHTS = {
    "minor": 1,
    "captcha": 3,
    "block": 5,
    "additional_verification": 10,
    "notebook_stopped": 3,
    "disconnect": 2,
    "rate_limit": 3,
    "http_403": 5,
    "http_429": 3,
    "temporary_block": 5,
}
RISK_THRESHOLD = 10


class AntiBlockService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def record_event(self, payload: RiskEventRequest) -> RiskEventResponse:
        vm = self.repo.get_vm(payload.vm_id)
        if vm is None or vm.status == "deleted":
            raise HTTPException(status_code=404, detail=f"VM '{payload.vm_id}' not found.")

        key = (payload.event_type or "minor").strip().lower()
        delta = EVENT_WEIGHTS.get(key, 1)
        updated = self.repo.apply_vm_risk_event(vm.id, delta, reason=payload.details or f"event={key}")
        if updated is None:
            raise HTTPException(status_code=404, detail=f"VM '{payload.vm_id}' not found.")

        action = self._suggest_action(key, int(updated.risk_score or 0))

        if int(updated.risk_score or 0) >= RISK_THRESHOLD and updated.status != "deleted":
            self.repo.update_vm(updated, status="deleted", verification_status="Warning")
            self.repo.create_operation(
                resource_type="vm",
                resource_id=updated.id,
                operation="delete",
                status="succeeded",
                message="Preventive destroy by anti-block risk threshold.",
            )
            action = "destroy_vm"
            self.repo.add_log(
                "AntiBlock",
                "ERROR",
                f"VM '{updated.id}' destroyed due to risk score threshold.",
                f"risk_score={updated.risk_score}, threshold={RISK_THRESHOLD}",
            )
        else:
            self.repo.add_log(
                "AntiBlock",
                "WARNING" if delta >= 3 else "INFO",
                f"Risk event '{key}' recorded for VM '{updated.id}'.",
                f"delta={delta}, risk_score={updated.risk_score}",
            )

        return RiskEventResponse(
            vm_id=updated.id,
            event_type=key,
            delta=delta,
            risk_score=int(updated.risk_score or 0),
            threshold=RISK_THRESHOLD,
            action=action,
            details=payload.details,
        )

    def _suggest_action(self, event_type: str, risk_score: int) -> str:
        if risk_score >= RISK_THRESHOLD:
            return "destroy_vm"
        if event_type in {"captcha", "rate_limit", "http_429"}:
            if risk_score < 4:
                return "retry_with_delay"
            if risk_score < 8:
                return "change_ip"
            return "recreate_vm"
        if event_type in {"notebook_stopped", "disconnect"}:
            return "reopen_notebook_and_reassign_load"
        if event_type in {"block", "http_403", "temporary_block", "additional_verification"}:
            return "change_account_or_vm"
        return "monitor"
