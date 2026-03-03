from __future__ import annotations

from fastapi import HTTPException

from ..models import N8nRoleConfig
from ..repositories import StorageRepository


class ArchitectureService:
    def __init__(self, repo: StorageRepository):
        self.repo = repo

    def get_n8n_role(self) -> N8nRoleConfig:
        row = self.repo.get_n8n_role()
        if row is None:
            row = self.repo.upsert_n8n_role("secondary_automation", notes="Default role.")
        return N8nRoleConfig(role=row.role, notes=row.notes)

    def set_n8n_role(self, payload: N8nRoleConfig) -> N8nRoleConfig:
        role = payload.role.strip()
        if role not in {"main_orchestrator", "secondary_automation", "eliminated"}:
            raise HTTPException(status_code=400, detail="Invalid n8n role.")
        row = self.repo.upsert_n8n_role(role=role, notes=payload.notes)
        self.repo.add_log("Architecture", "INFO", f"n8n role updated to '{role}'.", payload.notes)
        return N8nRoleConfig(role=row.role, notes=row.notes)
