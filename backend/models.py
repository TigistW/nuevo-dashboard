from pydantic import BaseModel, ConfigDict, Field


class ORMBaseModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class MicroVMBase(BaseModel):
    id: str = Field(min_length=1, max_length=64)
    country: str = Field(min_length=1, max_length=64)
    ram: str = Field(min_length=1, max_length=32)
    cpu: str = Field(min_length=1, max_length=32)


class MicroVMCreate(MicroVMBase):
    template_id: str = Field(min_length=1, max_length=64)


class MicroVMResponse(MicroVMBase):
    public_ip: str
    status: str
    uptime: str
    exit_node: str | None = None
    verification_status: str = "Secure"


class IdentityResponse(BaseModel):
    vm_id: str
    public_ip: str
    isp: str
    asn: str
    ip_type: str
    country: str
    city: str | None = None
    status: str
    last_check: str
    trust_score: int = 100


class HealingRule(BaseModel):
    id: str
    trigger: str
    action: str
    enabled: bool


class Template(BaseModel):
    id: str
    name: str
    version: str
    base_image: str


class Task(BaseModel):
    id: str
    task_type: str
    vm_id: str | None = None
    status: str
    progress: int = Field(ge=0, le=100)
    retry_count: int = Field(default=0, ge=0)
    error_message: str | None = None


class Guardrails(BaseModel):
    max_vms: int = Field(gt=0)
    min_host_ram_mb: int = Field(gt=0)
    max_cpu_per_vm: int = Field(gt=0)
    overload_prevention: bool


class TunnelBase(BaseModel):
    id: str
    country: str
    provider: str


class TunnelResponse(TunnelBase):
    latency: str
    status: str
    public_ip: str


class SecurityAuditResponse(BaseModel):
    namespaces: list[str]
    nftables_status: str
    routing_tables: list[dict]


class OperationStatus(BaseModel):
    id: str
    resource_type: str
    resource_id: str
    operation: str
    status: str
    message: str | None = None
    requested_at: str | None = None
    started_at: str | None = None
    finished_at: str | None = None


class VerificationRequest(BaseModel):
    id: str
    vm_id: str
    worker_id: str
    verification_type: str
    status: str
    provider: str
    destination: str
    retries: int
    last_error: str | None = None
    created_at: str
    updated_at: str


class CaptchaEvent(BaseModel):
    id: int
    vm_id: str | None = None
    provider: str
    status: str
    source: str
    score: int | None = None
    latency_ms: int
    created_at: str
    details: str | None = None


class CaptchaSummary(BaseModel):
    total: int
    solved: int
    failed: int
    timeout: int
    bypassed: int
    success_rate: float
    avg_latency_ms: int


class Repository(BaseModel):
    id: str
    name: str
    url: str
    status: str
    lastSync: str
    apiEndpoint: str


class RepoCreate(BaseModel):
    url: str


class JobEnqueueResponse(BaseModel):
    message: str
    job_id: str
    status: str


class AutoscaleRequest(BaseModel):
    min_vms: int = Field(default=1, ge=0, le=200)
    max_vms: int = Field(default=6, gt=0, le=200)
    jobs_per_vm: int = Field(default=2, gt=0, le=32)
    country: str = Field(default="us", min_length=1, max_length=64)
    country_min_pools: dict[str, int] = Field(default_factory=dict)
    ram: str = Field(default="256MB", min_length=1, max_length=32)
    cpu: str = Field(default="1", min_length=1, max_length=32)
    template_id: str = Field(default="t-001", min_length=1, max_length=64)


class AutoscaleDecision(BaseModel):
    status: str
    action: str
    reason: str
    running_vms: int
    desired_vms: int
    active_jobs: int
    queued_jobs: int
    operation_id: str | None = None
    affected_vm_id: str | None = None


class SystemControlResponse(BaseModel):
    status: str
    action: str
    timestamp: str


class ThreatPoint(BaseModel):
    time: str
    threats: int


class TerminalCommandResponse(BaseModel):
    output: str


class WorkflowExecutionResponse(BaseModel):
    status: str
    workflow_id: str
    timestamp: str
    operation_id: str


class CentralizedLogEntry(BaseModel):
    time: str
    source: str
    level: str
    msg: str
    details: str | None = None
