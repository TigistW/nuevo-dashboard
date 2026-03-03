from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import (
    NotebookDistributionPlan,
    NotebookDistributionRequest,
    NotebookEventRequest,
    NotebookEventResult,
    NotebookSession,
    NotebookSessionCreate,
    NotebookTickResult,
    NotebookWorkerStatus,
)
from ..repositories import StorageRepository
from ..services.notebook import NotebookService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> NotebookService:
    return NotebookService(StorageRepository(db))


@router.get("/sessions", response_model=list[NotebookSession])
async def list_sessions(vm_id: str | None = None, service: NotebookService = Depends(get_service)):
    return service.list_notebooks(vm_id=vm_id)


@router.post("/sessions", response_model=NotebookSession)
async def create_session(payload: NotebookSessionCreate, service: NotebookService = Depends(get_service)):
    return service.create_notebook(payload)


@router.post("/distribution/plan", response_model=NotebookDistributionPlan)
async def plan_distribution(payload: NotebookDistributionRequest, service: NotebookService = Depends(get_service)):
    return service.plan_distribution(payload)


@router.post("/tick", response_model=NotebookTickResult)
async def notebook_tick(service: NotebookService = Depends(get_service)):
    return service.tick()


@router.post("/sessions/{notebook_id}/event", response_model=NotebookEventResult)
async def notebook_event(
    notebook_id: str,
    payload: NotebookEventRequest,
    service: NotebookService = Depends(get_service),
):
    return service.report_event(notebook_id=notebook_id, payload=payload)


@router.get("/worker/status", response_model=NotebookWorkerStatus)
async def worker_status(service: NotebookService = Depends(get_service)):
    return service.get_worker_status()


@router.post("/worker/start", response_model=NotebookWorkerStatus)
async def worker_start(service: NotebookService = Depends(get_service)):
    return service.start_worker()


@router.post("/worker/stop", response_model=NotebookWorkerStatus)
async def worker_stop(service: NotebookService = Depends(get_service)):
    return service.stop_worker()


@router.post("/worker/probe", response_model=NotebookWorkerStatus)
async def worker_probe(service: NotebookService = Depends(get_service)):
    return service.probe_worker_once()
