from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .database import SessionLocal, init_db
from .routers import orchestrator, network, security, intelligence, automation, governance, repository, verification
from .services.bootstrap import seed_defaults

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
app.include_router(verification.router, prefix="/api/v1/verification", tags=["Verification"])

@app.get("/")
async def root():
    return {"status": "online", "version": "1.0.0", "engine": "Firecracker/FastAPI"}
