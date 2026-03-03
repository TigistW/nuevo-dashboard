from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import RiskEventRequest, RiskEventResponse
from ..repositories import StorageRepository
from ..services.antiblock import AntiBlockService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> AntiBlockService:
    return AntiBlockService(StorageRepository(db))


@router.post("/events", response_model=RiskEventResponse)
async def record_risk_event(payload: RiskEventRequest, service: AntiBlockService = Depends(get_service)):
    return service.record_event(payload)
