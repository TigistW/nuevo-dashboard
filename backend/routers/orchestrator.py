from fastapi import APIRouter, BackgroundTasks, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import MicroVMCreate, MicroVMResponse, OperationStatus
from ..repositories import StorageRepository
from ..services import OrchestratorService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> OrchestratorService:
    return OrchestratorService(StorageRepository(db))


@router.post("/create", response_model=MicroVMResponse)
async def create_vm(
    vm: MicroVMCreate,
    background_tasks: BackgroundTasks,
    service: OrchestratorService = Depends(get_service),
):
    return service.create_vm(vm, background_tasks)


@router.get("/list", response_model=list[MicroVMResponse])
async def list_vms(service: OrchestratorService = Depends(get_service)):
    return service.list_vms()


@router.post("/{vm_id}/stop", response_model=OperationStatus)
async def stop_vm(
    vm_id: str,
    background_tasks: BackgroundTasks,
    service: OrchestratorService = Depends(get_service),
):
    return service.stop_vm(vm_id, background_tasks)


@router.post("/{vm_id}/restart", response_model=OperationStatus)
async def restart_vm(
    vm_id: str,
    background_tasks: BackgroundTasks,
    service: OrchestratorService = Depends(get_service),
):
    return service.restart_vm(vm_id, background_tasks)


@router.delete("/{vm_id}", response_model=OperationStatus)
async def delete_vm(
    vm_id: str,
    background_tasks: BackgroundTasks,
    service: OrchestratorService = Depends(get_service),
):
    return service.delete_vm(vm_id, background_tasks)


@router.get("/operations/{operation_id}", response_model=OperationStatus)
async def get_operation(
    operation_id: str,
    service: OrchestratorService = Depends(get_service),
):
    return service.get_operation(operation_id)
