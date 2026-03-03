from __future__ import annotations

import random
import time
from datetime import datetime, timedelta

from fastapi import HTTPException

from ..models import FootprintActivity, FootprintActivityCreate, FootprintTickResult
from ..repositories import StorageRepository
from .utils import isoformat_or_none


FAMILY_SAFE_ACTIVITIES = [
    "family_friendly_search",
    "youtube_watch",
    "natural_scroll",
    "news_reading",
    "maps_browsing",
    "channel_creation_optional",
]


class FootprintService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def list_activities(self, limit: int = 200, vm_id: str | None = None) -> list[FootprintActivity]:
        rows = self.repo.list_footprint_activities(limit=max(1, min(limit, 1000)), vm_id=vm_id)
        return [self._to_activity(row) for row in rows]

    def schedule_activity(self, payload: FootprintActivityCreate) -> FootprintActivity:
        vm = self.repo.get_vm(payload.vm_id)
        if vm is None or vm.status == "deleted":
            raise HTTPException(status_code=404, detail=f"VM '{payload.vm_id}' not found.")

        activity_id = f"fp-{int(time.time() * 1000)}-{random.randint(100, 999)}"
        activity_type = payload.activity_type or random.choice(FAMILY_SAFE_ACTIVITIES)
        scheduled_at = datetime.utcnow() + timedelta(seconds=max(0, int(payload.delay_seconds)))
        row = self.repo.create_footprint_activity(
            activity_id=activity_id,
            vm_id=vm.id,
            account_id=payload.account_id,
            activity_type=activity_type,
            status="Scheduled",
            details=payload.details,
            timezone_offset_minutes=payload.timezone_offset_minutes,
            scheduled_at=scheduled_at,
        )
        self.repo.add_log("Footprint", "INFO", f"Footprint activity '{activity_type}' scheduled for VM '{vm.id}'.")
        return self._to_activity(row)

    def tick(self) -> FootprintTickResult:
        now = datetime.utcnow()
        scheduled = 0
        executed = 0

        # Execute due activities.
        due_rows = self.repo.list_footprint_activities(limit=500, status="Scheduled")
        for row in due_rows:
            if row.scheduled_at is not None and row.scheduled_at > now:
                continue
            self.repo.update_footprint_activity(
                row,
                status="Completed",
                executed_at=now,
                details=(row.details or "") + " | simulated_playwright=ok",
            )
            executed += 1

        # Periodically schedule organic browsing for active VMs.
        active_vms = [vm for vm in self.repo.list_vms(include_deleted=False) if vm.status == "running"]
        if active_vms:
            recent_rows = self.repo.list_footprint_activities(limit=500)
            latest_by_vm: dict[str, datetime] = {}
            for row in recent_rows:
                if row.vm_id and row.created_at:
                    latest_by_vm[row.vm_id] = max(latest_by_vm.get(row.vm_id, datetime(1970, 1, 1)), row.created_at)

            for vm in active_vms:
                last_created = latest_by_vm.get(vm.id)
                if last_created and last_created >= now - timedelta(minutes=45):
                    continue
                jitter = random.randint(30, 600)
                activity_type = random.choice(FAMILY_SAFE_ACTIVITIES)
                row = self.repo.create_footprint_activity(
                    activity_id=f"fp-auto-{vm.id}-{int(time.time() * 1000)}-{random.randint(100, 999)}",
                    vm_id=vm.id,
                    account_id=None,
                    activity_type=activity_type,
                    status="Scheduled",
                    details="auto-generated footprint schedule",
                    timezone_offset_minutes=random.choice([-300, 0, 60, 330]),
                    scheduled_at=now + timedelta(seconds=jitter),
                )
                if row is not None:
                    scheduled += 1

        if scheduled or executed:
            self.repo.add_log(
                "Footprint",
                "INFO",
                "Footprint tick completed.",
                f"scheduled={scheduled}, executed={executed}",
            )
        return FootprintTickResult(scheduled=scheduled, executed=executed)

    def _to_activity(self, row) -> FootprintActivity:
        return FootprintActivity(
            id=row.id,
            vm_id=row.vm_id,
            account_id=row.account_id,
            activity_type=row.activity_type,
            status=row.status,
            details=row.details,
            timezone_offset_minutes=row.timezone_offset_minutes,
            scheduled_at=isoformat_or_none(row.scheduled_at),
            executed_at=isoformat_or_none(row.executed_at),
        )
