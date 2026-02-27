from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import IdentityResponse, OperationStatus, TunnelResponse
from ..repositories import StorageRepository
from ..services import NetworkService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> NetworkService:
    return NetworkService(StorageRepository(db))


@router.get("/tunnels", response_model=list[TunnelResponse])
async def get_tunnels(service: NetworkService = Depends(get_service)):
    return service.get_tunnels()


@router.get("/identities", response_model=list[IdentityResponse])
async def get_identities(service: NetworkService = Depends(get_service)):
    return service.get_identities()


@router.post("/tunnels/rotate/{vm_id}", response_model=OperationStatus)
async def rotate_ip(
    vm_id: str,
    background_tasks: BackgroundTasks,
    service: NetworkService = Depends(get_service),
):
    return service.rotate_ip(vm_id, background_tasks)


@router.post("/tunnels/register", response_model=TunnelResponse)
async def register_vps(
    country: str,
    ip: str,
    provider: str = "Custom",
    service: NetworkService = Depends(get_service),
):
    return service.register_vps(country=country, ip=ip, provider=provider)


@router.get("/dns-leak-test")
async def dns_leak_test(vm_id: str | None = None, service: NetworkService = Depends(get_service)):
    return service.dns_leak_test(vm_id=vm_id)
