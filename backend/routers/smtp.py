from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import OperationStatus, SMTPTaskCreate, SMTPTaskResponse
from ..repositories import StorageRepository
from ..services.smtp import SMTPService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> SMTPService:
    return SMTPService(StorageRepository(db))


@router.post("/send", response_model=OperationStatus)
async def send_mail(
    payload: SMTPTaskCreate,
    background_tasks: BackgroundTasks,
    service: SMTPService = Depends(get_service),
):
    return service.send(payload, background_tasks)


@router.get("/tasks", response_model=list[SMTPTaskResponse])
async def list_tasks(limit: int = 200, service: SMTPService = Depends(get_service)):
    return service.list_tasks(limit=limit)


@router.get("/tasks/{task_id}", response_model=SMTPTaskResponse)
async def get_task(task_id: str, service: SMTPService = Depends(get_service)):
    return service.get_task(task_id)
