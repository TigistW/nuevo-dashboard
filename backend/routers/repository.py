from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import (
    RepoCreate,
    Repository,
    SystemControlResponse,
    TerminalCommandResponse,
    ThreatPoint,
    WorkflowExecutionResponse,
)
from ..repositories import StorageRepository
from ..services import RepositoryService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> RepositoryService:
    return RepositoryService(StorageRepository(db))


@router.get("/", response_model=list[Repository])
async def get_repositories(service: RepositoryService = Depends(get_service)):
    return service.get_repositories()


@router.post("/create", response_model=Repository)
async def create_repository(payload: RepoCreate, service: RepositoryService = Depends(get_service)):
    return service.create_repository(payload)


@router.post("/system/control", response_model=SystemControlResponse)
async def system_control(action: str, service: RepositoryService = Depends(get_service)):
    return service.system_control(action)


@router.get("/security/threats", response_model=list[ThreatPoint])
async def get_threats(service: RepositoryService = Depends(get_service)):
    return service.get_threats()


@router.post("/terminal/command", response_model=TerminalCommandResponse)
async def terminal_command(vm_id: str, command: str, service: RepositoryService = Depends(get_service)):
    return service.terminal_command(vm_id, command)


@router.post("/workflows/execute", response_model=WorkflowExecutionResponse)
async def execute_workflow(
    workflow_id: str,
    background_tasks: BackgroundTasks,
    service: RepositoryService = Depends(get_service),
):
    return service.execute_workflow(workflow_id, background_tasks)
