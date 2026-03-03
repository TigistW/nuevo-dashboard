from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import (
    AccountAssignmentRequest,
    AccountAssignmentResponse,
    AccountModeConfig,
    GoogleAccount,
    GoogleAccountCreate,
)
from ..repositories import StorageRepository
from ..services.accounts import AccountService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> AccountService:
    return AccountService(StorageRepository(db))


@router.get("/", response_model=list[GoogleAccount])
async def list_accounts(service: AccountService = Depends(get_service)):
    return service.list_accounts()


@router.post("/create", response_model=GoogleAccount)
async def create_account(payload: GoogleAccountCreate, service: AccountService = Depends(get_service)):
    return service.create_account(payload)


@router.get("/mode", response_model=AccountModeConfig)
async def get_mode(service: AccountService = Depends(get_service)):
    return service.get_mode()


@router.put("/mode", response_model=AccountModeConfig)
async def set_mode(payload: AccountModeConfig, service: AccountService = Depends(get_service)):
    return service.set_mode(payload)


@router.post("/assign", response_model=AccountAssignmentResponse)
async def assign_account(payload: AccountAssignmentRequest, service: AccountService = Depends(get_service)):
    return service.assign_account(payload)


@router.post("/release/{account_id}", response_model=GoogleAccount)
async def release_account(account_id: str, service: AccountService = Depends(get_service)):
    return service.release_account(account_id)
