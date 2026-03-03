from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import N8nRoleConfig
from ..repositories import StorageRepository
from ..services.architecture import ArchitectureService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> ArchitectureService:
    return ArchitectureService(StorageRepository(db))


@router.get("/n8n-role", response_model=N8nRoleConfig)
async def get_n8n_role(service: ArchitectureService = Depends(get_service)):
    return service.get_n8n_role()


@router.put("/n8n-role", response_model=N8nRoleConfig)
async def set_n8n_role(payload: N8nRoleConfig, service: ArchitectureService = Depends(get_service)):
    return service.set_n8n_role(payload)
