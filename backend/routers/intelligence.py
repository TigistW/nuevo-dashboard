from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..repositories import StorageRepository
from ..services import IntelligenceService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> IntelligenceService:
    return IntelligenceService(StorageRepository(db))


@router.get("/metrics/global")
async def get_global_metrics(service: IntelligenceService = Depends(get_service)):
    return service.get_global_metrics()


@router.get("/telemetry/history")
async def get_telemetry_history(service: IntelligenceService = Depends(get_service)):
    return service.get_telemetry_history()


@router.get("/logs/centralized")
async def get_centralized_logs(source: str = "All", service: IntelligenceService = Depends(get_service)):
    return service.get_centralized_logs(source=source)
