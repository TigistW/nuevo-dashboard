from __future__ import annotations

import time
from datetime import datetime

from fastapi import HTTPException

from ..models import (
    AccountAssignmentRequest,
    AccountAssignmentResponse,
    AccountModeConfig,
    GoogleAccount,
    GoogleAccountCreate,
)
from ..repositories import StorageRepository
from .utils import isoformat_or_none


class AccountService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def list_accounts(self) -> list[GoogleAccount]:
        rows = self.repo.list_google_accounts()
        return [self._to_account(row) for row in rows]

    def create_account(self, payload: GoogleAccountCreate) -> GoogleAccount:
        email = payload.email.strip().lower()
        if not email or "@" not in email:
            raise HTTPException(status_code=400, detail="Invalid email.")
        if self.repo.get_google_account_by_email(email) is not None:
            raise HTTPException(status_code=409, detail=f"Account email '{email}' already exists.")
        account_id = (payload.id or f"acc-{int(time.time() * 1000)}").strip()
        if self.repo.get_google_account(account_id) is not None:
            raise HTTPException(status_code=409, detail=f"Account '{account_id}' already exists.")
        row = self.repo.create_google_account(account_id=account_id, email=email, status="free")
        return self._to_account(row)

    def get_mode(self) -> AccountModeConfig:
        row = self.repo.get_account_mode()
        mode = row.mode if row is not None else "one_to_one"
        if row is None:
            self.repo.upsert_account_mode(mode)
        return AccountModeConfig(mode=mode)

    def set_mode(self, payload: AccountModeConfig) -> AccountModeConfig:
        mode = payload.mode.strip()
        updated = self.repo.upsert_account_mode(mode)
        self.repo.add_log("Accounts", "INFO", f"Account mode switched to '{updated.mode}'.")
        return AccountModeConfig(mode=updated.mode)

    def assign_account(self, payload: AccountAssignmentRequest) -> AccountAssignmentResponse:
        vm = self.repo.get_vm(payload.vm_id)
        if vm is None or vm.status == "deleted":
            raise HTTPException(status_code=404, detail=f"VM '{payload.vm_id}' not found.")

        mode = self.get_mode().mode
        preferred = self.repo.get_google_account(payload.account_id) if payload.account_id else None
        if payload.account_id and preferred is None:
            raise HTTPException(status_code=404, detail=f"Account '{payload.account_id}' not found.")

        if mode == "one_to_one":
            existing = self.repo.find_assigned_account_by_vm(vm.id)
            if existing is not None:
                return AccountAssignmentResponse(
                    vm_id=vm.id,
                    account_id=existing.id,
                    email=existing.email,
                    mode=mode,
                    reassigned=False,
                )

        selected = preferred
        reassigned = False
        if selected is None:
            candidates = self.repo.list_google_accounts()
            available = [row for row in candidates if row.status.lower() in {"free", "idle"}]
            if not available:
                if mode == "dynamic_pool":
                    # Controlled reassignment: recycle oldest busy account.
                    busy = sorted(
                        candidates,
                        key=lambda row: (row.last_used_at or datetime(1970, 1, 1), row.id),
                    )
                    if busy:
                        selected = busy[0]
                        reassigned = True
                if selected is None:
                    raise HTTPException(status_code=409, detail="No available accounts to assign.")
            else:
                available.sort(key=lambda row: (row.last_used_at or datetime(1970, 1, 1), row.id))
                selected = available[0]

        assert selected is not None

        if mode == "one_to_one" and selected.status.lower() == "busy" and selected.vm_id and selected.vm_id != vm.id:
            raise HTTPException(
                status_code=409,
                detail=f"Account '{selected.id}' is already bound to VM '{selected.vm_id}' in one_to_one mode.",
            )

        if selected.vm_id and selected.vm_id != vm.id and mode == "dynamic_pool":
            reassigned = True

        self.repo.update_google_account(
            selected,
            status="busy",
            vm_id=vm.id,
            last_used_at=datetime.utcnow(),
            warmup_state="assigned",
        )
        self.repo.add_log(
            "Accounts",
            "INFO",
            f"Assigned account '{selected.id}' to VM '{vm.id}'.",
            f"mode={mode}, reassigned={reassigned}",
        )
        return AccountAssignmentResponse(
            vm_id=vm.id,
            account_id=selected.id,
            email=selected.email,
            mode=mode,
            reassigned=reassigned,
        )

    def release_account(self, account_id: str) -> GoogleAccount:
        row = self.repo.get_google_account(account_id)
        if row is None:
            raise HTTPException(status_code=404, detail=f"Account '{account_id}' not found.")
        self.repo.update_google_account(row, status="free", vm_id=None, warmup_state="idle")
        return self._to_account(row)

    def _to_account(self, row) -> GoogleAccount:
        return GoogleAccount(
            id=row.id,
            email=row.email,
            status=row.status,
            vm_id=row.vm_id,
            risk_score=row.risk_score,
            warmup_state=row.warmup_state,
            last_used_at=isoformat_or_none(row.last_used_at),
        )
