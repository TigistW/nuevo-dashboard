from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import AutoscaleDecision, AutoscaleRequest, HealingRule, JobEnqueueResponse, Task
from ..repositories import StorageRepository
from ..services import AutomationService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> AutomationService:
    return AutomationService(StorageRepository(db))


@router.get("/healing/rules", response_model=list[HealingRule])
async def get_healing_rules(service: AutomationService = Depends(get_service)):
    return service.get_healing_rules()


@router.post("/scheduler/jobs", response_model=JobEnqueueResponse)
async def create_job(
    task: Task,
    background_tasks: BackgroundTasks,
    service: AutomationService = Depends(get_service),
):
    return service.create_job(task, background_tasks)


@router.get("/scheduler/queue", response_model=list[Task])
async def get_job_queue(service: AutomationService = Depends(get_service)):
    return service.get_job_queue()


@router.post("/scheduler/autoscale", response_model=AutoscaleDecision)
async def autoscale_now(
    payload: AutoscaleRequest,
    background_tasks: BackgroundTasks,
    service: AutomationService = Depends(get_service),
):
    return service.evaluate_autoscale(payload, background_tasks)


@router.post("/simulator/validate")
async def validate_deployment(vm_id: str, service: AutomationService = Depends(get_service)):
    return service.validate_deployment(vm_id)
