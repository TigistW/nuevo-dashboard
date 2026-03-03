from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import (
    IpCandidateCheckRequest,
    IpCandidateCheckResponse,
    IpEventRecordRequest,
    IpHistoryRecord,
    IpUsageRecordCreate,
)
from ..repositories import StorageRepository
from ..services.ip_policy import IpPolicyService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> IpPolicyService:
    return IpPolicyService(StorageRepository(db))


@router.post("/evaluate", response_model=IpCandidateCheckResponse)
async def evaluate(payload: IpCandidateCheckRequest, service: IpPolicyService = Depends(get_service)):
    return service.evaluate_candidate(payload)


@router.get("/history", response_model=list[IpHistoryRecord])
async def list_history(limit: int = 200, service: IpPolicyService = Depends(get_service)):
    return service.list_history(limit=limit)


@router.post("/history/usage", response_model=IpHistoryRecord)
async def record_usage(payload: IpUsageRecordCreate, service: IpPolicyService = Depends(get_service)):
    return service.record_usage(payload)


@router.post("/history/event", response_model=IpHistoryRecord)
async def record_event(payload: IpEventRecordRequest, service: IpPolicyService = Depends(get_service)):
    return service.record_event(payload)
