from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import Guardrails, OperationStatus, Template
from ..repositories import StorageRepository
from ..services import GovernanceService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> GovernanceService:
    return GovernanceService(StorageRepository(db))


@router.get("/templates", response_model=list[Template])
async def get_templates(service: GovernanceService = Depends(get_service)):
    return service.get_templates()


@router.get("/guardrails/config", response_model=Guardrails)
async def get_guardrails(service: GovernanceService = Depends(get_service)):
    return service.get_guardrails()


@router.put("/guardrails/config", response_model=Guardrails)
async def update_guardrails(payload: Guardrails, service: GovernanceService = Depends(get_service)):
    return service.update_guardrails(payload)


@router.post("/fingerprint/sync/{vm_id}", response_model=OperationStatus)
async def sync_fingerprint(
    vm_id: str,
    background_tasks: BackgroundTasks,
    service: GovernanceService = Depends(get_service),
):
    return service.sync_fingerprint(vm_id, background_tasks)
