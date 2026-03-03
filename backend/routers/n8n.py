from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import (
    N8nRun,
    N8nRunCreateRequest,
    N8nRunEventRequest,
    N8nRunUpdateRequest,
    N8nWorkflow,
    N8nWorkflowImportRequest,
)
from ..repositories import StorageRepository
from ..services.n8n import N8nService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> N8nService:
    return N8nService(StorageRepository(db))


@router.get("/workflows", response_model=list[N8nWorkflow])
async def list_workflows(
    include_definition: bool = Query(default=False),
    service: N8nService = Depends(get_service),
):
    return service.list_workflows(include_definition=include_definition)


@router.get("/workflows/{workflow_id}", response_model=N8nWorkflow)
async def get_workflow(
    workflow_id: str,
    include_definition: bool = Query(default=True),
    service: N8nService = Depends(get_service),
):
    return service.get_workflow(workflow_id=workflow_id, include_definition=include_definition)


@router.post("/workflows/import", response_model=N8nWorkflow)
async def import_workflow(payload: N8nWorkflowImportRequest, service: N8nService = Depends(get_service)):
    return service.import_workflow(payload)


@router.post("/runs", response_model=N8nRun)
async def create_run(payload: N8nRunCreateRequest, service: N8nService = Depends(get_service)):
    return service.create_run(payload)


@router.get("/runs", response_model=list[N8nRun])
async def list_runs(
    limit: int = Query(default=200, ge=1, le=1000),
    workflow_id: str | None = Query(default=None),
    service: N8nService = Depends(get_service),
):
    return service.list_runs(limit=limit, workflow_id=workflow_id)


@router.get("/runs/{run_id}", response_model=N8nRun)
async def get_run(run_id: str, service: N8nService = Depends(get_service)):
    return service.get_run(run_id)


@router.post("/runs/{run_id}/events", response_model=N8nRun)
async def append_run_event(
    run_id: str,
    payload: N8nRunEventRequest,
    service: N8nService = Depends(get_service),
):
    return service.append_run_event(run_id=run_id, payload=payload)


@router.put("/runs/{run_id}", response_model=N8nRun)
async def update_run_status(
    run_id: str,
    payload: N8nRunUpdateRequest,
    service: N8nService = Depends(get_service),
):
    return service.update_run_status(run_id=run_id, payload=payload)
