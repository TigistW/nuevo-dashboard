from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import (
    AutoscaleDecision,
    AutoscaleRequest,
    HealingRule,
    HealingRuleUpdate,
    JobEnqueueResponse,
    SchedulerConfig,
    SchedulerTickResult,
    Task,
)
from ..repositories import StorageRepository
from ..services import AutomationService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> AutomationService:
    return AutomationService(StorageRepository(db))


@router.get("/healing/rules", response_model=list[HealingRule])
async def get_healing_rules(service: AutomationService = Depends(get_service)):
    return service.get_healing_rules()


@router.put("/healing/rules/{rule_id}", response_model=HealingRule)
async def update_healing_rule(
    rule_id: str,
    payload: HealingRuleUpdate,
    service: AutomationService = Depends(get_service),
):
    return service.update_healing_rule(rule_id=rule_id, payload=payload)


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


@router.get("/scheduler/config", response_model=SchedulerConfig)
async def get_scheduler_config(service: AutomationService = Depends(get_service)):
    return service.get_scheduler_config()


@router.post("/scheduler/tick", response_model=SchedulerTickResult)
async def scheduler_tick(service: AutomationService = Depends(get_service)):
    return service.run_scheduler_tick()


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
