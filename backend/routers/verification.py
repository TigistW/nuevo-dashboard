from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import CaptchaEvent, CaptchaSummary, OperationStatus, VerificationRequest
from ..repositories import StorageRepository
from ..services.verification import VerificationService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> VerificationService:
    return VerificationService(StorageRepository(db))


@router.get("/requests", response_model=list[VerificationRequest])
async def get_requests(limit: int = 100, service: VerificationService = Depends(get_service)):
    return service.list_requests(limit=limit)


@router.post("/requests/{request_id}/retry", response_model=OperationStatus)
async def retry_request(
    request_id: str,
    background_tasks: BackgroundTasks,
    service: VerificationService = Depends(get_service),
):
    return service.retry_request(request_id=request_id, background_tasks=background_tasks)


@router.get("/captcha/events", response_model=list[CaptchaEvent])
async def get_captcha_events(limit: int = 100, service: VerificationService = Depends(get_service)):
    return service.list_captcha_events(limit=limit)


@router.get("/captcha/summary", response_model=CaptchaSummary)
async def get_captcha_summary(hours: int = 24, service: VerificationService = Depends(get_service)):
    return service.get_captcha_summary(hours=hours)
