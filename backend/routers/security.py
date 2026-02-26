from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import SecurityAuditResponse
from ..repositories import StorageRepository
from ..services import SecurityService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> SecurityService:
    return SecurityService(StorageRepository(db))


@router.get("/audit", response_model=SecurityAuditResponse)
async def get_security_audit(service: SecurityService = Depends(get_service)):
    return service.get_security_audit()


@router.post("/test-isolation")
async def test_isolation(service: SecurityService = Depends(get_service)):
    return service.test_isolation()
