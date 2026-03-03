from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import FootprintActivity, FootprintActivityCreate, FootprintTickResult
from ..repositories import StorageRepository
from ..services.footprint import FootprintService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> FootprintService:
    return FootprintService(StorageRepository(db))


@router.get("/activities", response_model=list[FootprintActivity])
async def list_activities(
    limit: int = 200,
    vm_id: str | None = None,
    service: FootprintService = Depends(get_service),
):
    return service.list_activities(limit=limit, vm_id=vm_id)


@router.post("/activities", response_model=FootprintActivity)
async def create_activity(payload: FootprintActivityCreate, service: FootprintService = Depends(get_service)):
    return service.schedule_activity(payload)


@router.post("/tick", response_model=FootprintTickResult)
async def footprint_tick(service: FootprintService = Depends(get_service)):
    return service.tick()
