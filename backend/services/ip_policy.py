from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import HTTPException

from ..models import (
    IpCandidateCheckRequest,
    IpCandidateCheckResponse,
    IpEventRecordRequest,
    IpHistoryRecord,
    IpUsageRecordCreate,
)
from ..repositories import StorageRepository
from .utils import generate_public_ip, isoformat_or_none


class IpPolicyService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def evaluate_candidate(self, payload: IpCandidateCheckRequest) -> IpCandidateCheckResponse:
        ip = payload.ip.strip()
        if not ip:
            raise HTTPException(status_code=400, detail="IP cannot be empty.")

        context = (payload.context or "google").strip().lower()
        if context not in {"google", "smtp"}:
            context = "google"
        cooldown = max(1, int(payload.cooldown_minutes))

        reasons: list[str] = []
        record = self.repo.get_ip_history(ip)
        now = datetime.utcnow()

        filter1_available = True
        identities = self.repo.list_identities()
        active_vm_ids = {vm.id for vm in self.repo.list_vms(include_deleted=False) if vm.status in {"creating", "running"}}
        for identity in identities:
            if identity.public_ip == ip and identity.vm_id in active_vm_ids:
                filter1_available = False
                reasons.append(f"IP {ip} is already assigned to active VM '{identity.vm_id}'.")
                break

        if record is not None:
            if record.restricted:
                filter1_available = False
                reasons.append("IP is marked as restricted.")
            if record.discarded:
                filter1_available = False
                reasons.append("IP is marked as discarded.")
            if record.last_used_at >= (now - timedelta(minutes=cooldown)):
                filter1_available = False
                reasons.append(f"IP was used in the last {cooldown} minutes.")

        reputation_score = int(record.reputation_score) if record is not None else 100
        negative_events = int(record.negative_events) if record is not None else 0
        restricted = bool(record.restricted) if record is not None else False
        discarded = bool(record.discarded) if record is not None else False

        minimum_reputation = 70 if context == "smtp" else 55
        max_negative_events = 2 if context == "smtp" else 5
        filter2_reputation_ok = reputation_score >= minimum_reputation and negative_events <= max_negative_events
        if not filter2_reputation_ok:
            reasons.append(
                (
                    f"Reputation policy failed for {context}: score={reputation_score}/{minimum_reputation}, "
                    f"negative_events={negative_events}/{max_negative_events}."
                )
            )

        recommended = filter1_available and filter2_reputation_ok and not restricted and not discarded
        return IpCandidateCheckResponse(
            ip=ip,
            context=context,
            filter1_available=filter1_available,
            filter2_reputation_ok=filter2_reputation_ok,
            recommended=recommended,
            reasons=reasons,
            reputation_score=reputation_score,
            negative_events=negative_events,
            restricted=restricted,
            discarded=discarded,
        )

    def list_history(self, limit: int = 200) -> list[IpHistoryRecord]:
        rows = self.repo.list_ip_history(limit=max(1, min(limit, 1000)))
        return [self._to_history_record(row) for row in rows]

    def record_usage(self, payload: IpUsageRecordCreate) -> IpHistoryRecord:
        ip = payload.ip.strip()
        if not ip:
            raise HTTPException(status_code=400, detail="IP cannot be empty.")
        row = self.repo.upsert_ip_history(
            ip=ip,
            account_email=payload.account_email,
            associated_vm_id=payload.associated_vm_id,
            smtp_used=payload.smtp_used,
            last_event=payload.last_event or "ip_used",
            last_used_at=datetime.utcnow(),
        )
        return self._to_history_record(row)

    def record_event(self, payload: IpEventRecordRequest) -> IpHistoryRecord:
        ip = payload.ip.strip()
        if not ip:
            raise HTTPException(status_code=400, detail="IP cannot be empty.")

        severity = (payload.severity or "minor").strip().lower()
        if severity not in {"minor", "moderate", "critical"}:
            severity = "minor"

        current = self.repo.get_ip_history(ip)
        reputation = int(current.reputation_score) if current is not None else 100
        negative_events = int(current.negative_events) if current is not None else 0
        restricted = bool(current.restricted) if current is not None else False
        discarded = bool(current.discarded) if current is not None else False

        if severity == "minor":
            reputation -= 5
            negative_events += 1
        elif severity == "moderate":
            reputation -= 15
            negative_events += 2
            restricted = True
        else:
            reputation -= 35
            negative_events += 4
            restricted = True
            discarded = True

        reputation = max(0, reputation)
        if reputation < 40 and negative_events >= 4:
            discarded = True
        elif reputation < 65:
            restricted = True

        row = self.repo.upsert_ip_history(
            ip=ip,
            reputation_score=reputation,
            negative_events=negative_events,
            restricted=restricted,
            discarded=discarded,
            last_event=payload.event,
            last_used_at=datetime.utcnow(),
        )
        return self._to_history_record(row)

    def choose_ip_for_context(
        self,
        context: str,
        preferred_ip: str | None = None,
        seed: str = "auto",
        max_attempts: int = 20,
    ) -> str:
        context = (context or "google").strip().lower()
        preferred = preferred_ip.strip() if preferred_ip else None
        if preferred:
            result = self.evaluate_candidate(
                IpCandidateCheckRequest(ip=preferred, context=context, cooldown_minutes=120)
            )
            if result.recommended:
                return preferred

        for attempt in range(max(1, max_attempts)):
            candidate = generate_public_ip(f"{seed}-{attempt}")
            result = self.evaluate_candidate(
                IpCandidateCheckRequest(ip=candidate, context=context, cooldown_minutes=120)
            )
            if result.recommended:
                return candidate
        raise HTTPException(status_code=409, detail=f"Unable to find an eligible IP for context '{context}'.")

    def _to_history_record(self, row) -> IpHistoryRecord:
        return IpHistoryRecord(
            ip=row.ip,
            last_used_at=isoformat_or_none(row.last_used_at) or datetime.utcnow().isoformat(),
            account_email=row.account_email,
            associated_vm_id=row.associated_vm_id,
            negative_events=row.negative_events,
            smtp_used=row.smtp_used,
            reputation_score=row.reputation_score,
            restricted=row.restricted,
            discarded=row.discarded,
            last_event=row.last_event,
        )
