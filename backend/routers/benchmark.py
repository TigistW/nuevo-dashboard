from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ..dependencies import get_db
from ..models import TunnelBenchmarkResult, TunnelBenchmarkRunRequest
from ..repositories import StorageRepository
from ..services.benchmark import BenchmarkService

router = APIRouter()


def get_service(db: Session = Depends(get_db)) -> BenchmarkService:
    return BenchmarkService(StorageRepository(db))


@router.post("/run", response_model=list[TunnelBenchmarkResult])
async def run_benchmark(payload: TunnelBenchmarkRunRequest, service: BenchmarkService = Depends(get_service)):
    return service.run(payload)


@router.get("/results", response_model=list[TunnelBenchmarkResult])
async def list_results(
    protocol: str | None = None,
    limit: int = 100,
    service: BenchmarkService = Depends(get_service),
):
    return service.list_results(protocol=protocol, limit=limit)
