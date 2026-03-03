from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import SessionLocal, init_db
from .routers import (
    accounts,
    antiblock,
    architecture,
    automation,
    benchmark,
    footprint,
    governance,
    intelligence,
    ip_policy,
    n8n,
    network,
    notebook,
    orchestrator,
    repository,
    security,
    smtp,
    verification,
)
from .services.automation import start_scheduler_daemon
from .services.bootstrap import seed_defaults
from .services.colab_worker import start_colab_worker_daemon, stop_colab_worker_daemon

app = FastAPI(
    title="Colab Farm Advanced Orchestrator API",
    description="API for managing Firecracker micro-VMs, WireGuard tunnels, and isolation security.",
    version="1.0.0"
)


@app.on_event("startup")
def startup_event() -> None:
    init_db()
    db = SessionLocal()
    try:
        seed_defaults(db)
    finally:
        db.close()
    start_scheduler_daemon()
    start_colab_worker_daemon()


@app.on_event("shutdown")
def shutdown_event() -> None:
    stop_colab_worker_daemon()

# CORS configuration for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include modular routers
app.include_router(orchestrator.router, prefix="/api/v1/orchestrator", tags=["Orchestrator"])
app.include_router(network.router, prefix="/api/v1/network", tags=["Network"])
app.include_router(security.router, prefix="/api/v1/security", tags=["Security"])
app.include_router(intelligence.router, prefix="/api/v1/intelligence", tags=["Intelligence"])
app.include_router(automation.router, prefix="/api/v1/automation", tags=["Automation"])
app.include_router(governance.router, prefix="/api/v1/governance", tags=["Governance"])
app.include_router(repository.router, prefix="/api/v1/repository", tags=["Repository"])
app.include_router(n8n.router, prefix="/api/v1/n8n", tags=["n8n"])
app.include_router(verification.router, prefix="/api/v1/verification", tags=["Verification"])
app.include_router(accounts.router, prefix="/api/v1/accounts", tags=["Accounts"])
app.include_router(notebook.router, prefix="/api/v1/notebook", tags=["Notebook"])
app.include_router(ip_policy.router, prefix="/api/v1/ip-policy", tags=["IP Policy"])
app.include_router(footprint.router, prefix="/api/v1/footprint", tags=["Footprint"])
app.include_router(smtp.router, prefix="/api/v1/smtp", tags=["SMTP"])
app.include_router(benchmark.router, prefix="/api/v1/benchmark", tags=["Benchmark"])
app.include_router(antiblock.router, prefix="/api/v1/antiblock", tags=["Anti-Block"])
app.include_router(architecture.router, prefix="/api/v1/architecture", tags=["Architecture"])

@app.get("/")
async def root():
    return {"status": "online", "version": "1.0.0", "engine": "Firecracker/FastAPI"}
