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
    risk_score: int = 0


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


class HealingRuleUpdate(BaseModel):
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
    status: str = "Queued"
    priority: str = "medium"
    progress: int = Field(default=0, ge=0, le=100)
    retry_count: int = Field(default=0, ge=0)
    max_retries: int = Field(default=3, ge=0, le=20)
    dead_letter: bool = False
    next_attempt_at: str | None = None
    error_message: str | None = None
    scheduled_for: str | None = None
    schedule_window_start_hour: int | None = Field(default=None, ge=0, le=23)
    schedule_window_end_hour: int | None = Field(default=None, ge=0, le=23)
    timezone_offset_minutes: int = Field(default=0, ge=-720, le=840)
    jitter_seconds: int = Field(default=0, ge=0, le=3600)
    recurrence_minutes: int | None = Field(default=None, ge=1, le=10080)


class SchedulerConfig(BaseModel):
    concurrency_limit: int = Field(gt=0, le=128)
    backoff_base_seconds: float = Field(gt=0.0, le=120.0)
    default_max_retries: int = Field(ge=0, le=20)
    tick_seconds: int = Field(ge=1, le=3600)
    warmup_enabled: bool
    warmup_interval_minutes: int = Field(ge=1, le=10080)
    warmup_jitter_seconds: int = Field(ge=0, le=3600)
    default_window_start_hour: int = Field(ge=0, le=23)
    default_window_end_hour: int = Field(ge=0, le=23)
    timezone_offsets: list[int] = Field(default_factory=list)


class SchedulerTickResult(BaseModel):
    dispatched: int = Field(default=0, ge=0)
    warmup_jobs_enqueued: int = Field(default=0, ge=0)
    queued_jobs: int = Field(default=0, ge=0)
    active_jobs: int = Field(default=0, ge=0)


class ResourceThresholds(BaseModel):
    cpu_percent: int = Field(ge=1, le=100)
    ram_percent: int = Field(ge=1, le=100)
    disk_percent: int = Field(ge=1, le=100)


class ResourceSnapshot(BaseModel):
    active_vms: int
    active_jobs: int
    active_tunnels: int
    host_cpu_percent: int
    host_ram_used_mb: int
    host_ram_total_mb: int
    host_ram_percent: float
    host_disk_used_gb: float
    host_disk_total_gb: float
    host_disk_percent: float
    max_vms: int


class ProtectionState(BaseModel):
    protective_mode: bool
    failsafe_active: bool
    cooldown_until: str | None = None
    last_reason: str | None = None
    thresholds: ResourceThresholds
    snapshot: ResourceSnapshot
    actions: list[str] = Field(default_factory=list)
    signals: list[str] = Field(default_factory=list)


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


class VerificationRequestCreate(BaseModel):
    id: str | None = None
    vm_id: str
    worker_id: str
    verification_type: str = "SMS"
    status: str = "Pending"
    provider: str
    destination: str


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


class CaptchaEventCreate(BaseModel):
    vm_id: str | None = None
    provider: str
    status: str
    source: str
    score: int | None = None
    latency_ms: int = 0
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


class NotebookSessionCreate(BaseModel):
    id: str | None = None
    vm_id: str
    account_email: str | None = None
    gpu_assigned_gb: float = Field(default=12.0, ge=1.0, le=96.0)
    timezone_offset_minutes: int = Field(default=0, ge=-720, le=840)


class NotebookSession(BaseModel):
    id: str
    vm_id: str
    account_email: str | None = None
    status: str
    gpu_assigned_gb: float
    gpu_usage_gb: float
    ram_usage_gb: float
    load_percent: int
    cycle_state: str
    next_transition_at: str | None = None
    session_expires_at: str | None = None
    warning_message: str | None = None
    restart_count: int
    risk_score: int
    updated_at: str


class NotebookDistributionRequest(BaseModel):
    required_gpu_gb: float = Field(gt=0, le=512)
    target_min_percent: int = Field(default=70, ge=50, le=95)
    target_max_percent: int = Field(default=80, ge=50, le=95)
    gpu_per_notebook_gb: float = Field(default=12.0, gt=0, le=96.0)


class NotebookDistributionPlan(BaseModel):
    required_gpu_gb: float
    notebooks_required: int
    target_range_percent: tuple[int, int]
    per_notebook_target_gb: list[float]


class NotebookTickResult(BaseModel):
    updated: int = 0
    rotated: int = 0
    resting: int = 0
    warnings: int = 0


class NotebookEventRequest(BaseModel):
    event_type: str
    details: str | None = None


class NotebookEventResult(BaseModel):
    notebook_id: str
    status: str
    actions: list[str] = Field(default_factory=list)
    risk_delta: int = 0


class GoogleAccountCreate(BaseModel):
    id: str | None = None
    email: str = Field(min_length=3, max_length=256)


class GoogleAccount(BaseModel):
    id: str
    email: str
    status: str
    vm_id: str | None = None
    risk_score: int
    warmup_state: str
    last_used_at: str | None = None


class AccountModeConfig(BaseModel):
    mode: str = Field(pattern="^(one_to_one|dynamic_pool)$")


class AccountAssignmentRequest(BaseModel):
    vm_id: str
    account_id: str | None = None


class AccountAssignmentResponse(BaseModel):
    vm_id: str
    account_id: str
    email: str
    mode: str
    reassigned: bool = False


class TunnelBenchmarkRunRequest(BaseModel):
    protocols: list[str] = Field(default_factory=lambda: ["wireguard", "openvpn", "ssh", "pyngrok"])
    samples: int = Field(default=1, ge=1, le=20)


class TunnelBenchmarkResult(BaseModel):
    protocol: str
    latency_ms: int
    stability_score: int
    persistence_score: int
    detection_score: int
    throughput_mbps: float
    created_at: str
    notes: str | None = None


class IpCandidateCheckRequest(BaseModel):
    ip: str
    context: str = Field(default="google", pattern="^(google|smtp)$")
    cooldown_minutes: int = Field(default=120, ge=1, le=10080)


class IpCandidateCheckResponse(BaseModel):
    ip: str
    context: str
    filter1_available: bool
    filter2_reputation_ok: bool
    recommended: bool
    reasons: list[str] = Field(default_factory=list)
    reputation_score: int
    negative_events: int
    restricted: bool
    discarded: bool


class IpHistoryRecord(BaseModel):
    ip: str
    last_used_at: str
    account_email: str | None = None
    associated_vm_id: str | None = None
    negative_events: int
    smtp_used: bool
    reputation_score: int
    restricted: bool
    discarded: bool
    last_event: str | None = None


class IpUsageRecordCreate(BaseModel):
    ip: str
    account_email: str | None = None
    associated_vm_id: str | None = None
    smtp_used: bool = False
    last_event: str | None = None


class IpEventRecordRequest(BaseModel):
    ip: str
    event: str
    severity: str = Field(default="minor", pattern="^(minor|moderate|critical)$")


class FootprintActivityCreate(BaseModel):
    vm_id: str
    account_id: str | None = None
    activity_type: str | None = None
    timezone_offset_minutes: int = Field(default=0, ge=-720, le=840)
    delay_seconds: int = Field(default=0, ge=0, le=3600)
    details: str | None = None


class FootprintActivity(BaseModel):
    id: str
    vm_id: str
    account_id: str | None = None
    activity_type: str
    status: str
    details: str | None = None
    timezone_offset_minutes: int
    scheduled_at: str | None = None
    executed_at: str | None = None


class FootprintTickResult(BaseModel):
    scheduled: int = 0
    executed: int = 0


class SMTPTaskCreate(BaseModel):
    id: str | None = None
    domain: str = Field(min_length=3, max_length=128)
    sender: str = Field(min_length=3, max_length=256)
    recipients: list[str] = Field(min_length=1, max_length=200)
    implementation: str = Field(default="postfix", pattern="^(postfix|smtp_light)$")
    country: str = Field(default="us", min_length=2, max_length=64)
    preferred_ip: str | None = None


class SMTPTaskResponse(BaseModel):
    id: str
    vm_id: str | None = None
    status: str
    implementation: str
    domain: str
    sender: str
    recipients_count: int
    success_count: int
    failure_count: int
    ip_used: str | None = None
    spf_enabled: bool
    dkim_enabled: bool
    dmarc_enabled: bool
    rdns_enabled: bool
    tls_enabled: bool
    error_message: str | None = None
    created_at: str
    completed_at: str | None = None


class N8nRoleConfig(BaseModel):
    role: str = Field(pattern="^(main_orchestrator|secondary_automation|eliminated)$")
    notes: str | None = None


class N8nWorkflowImportRequest(BaseModel):
    workflow_id: str | None = None
    name: str = Field(min_length=1, max_length=256)
    source: str = Field(default="manual", min_length=1, max_length=128)
    active: bool = False
    definition: dict = Field(default_factory=dict)


class N8nWorkflow(BaseModel):
    workflow_id: str
    name: str
    source: str
    active: bool
    version_hash: str
    created_at: str
    updated_at: str
    definition: dict | None = None


class N8nRunCreateRequest(BaseModel):
    workflow_id: str = Field(min_length=1, max_length=128)
    external_execution_id: str | None = None
    trigger: str = Field(default="manual", min_length=1, max_length=64)
    context: dict = Field(default_factory=dict)


class N8nRunEventRequest(BaseModel):
    phase: str = Field(min_length=1, max_length=64)
    status: str = Field(min_length=1, max_length=32)
    message: str = Field(min_length=1, max_length=512)
    details: str | None = None


class N8nRunUpdateRequest(BaseModel):
    status: str = Field(pattern="^(running|succeeded|failed|cancelled)$")
    message: str | None = None


class N8nRun(BaseModel):
    id: str
    workflow_id: str
    external_execution_id: str | None = None
    trigger: str
    status: str
    context: dict = Field(default_factory=dict)
    events: list[dict] = Field(default_factory=list)
    last_message: str | None = None
    created_at: str
    started_at: str | None = None
    finished_at: str | None = None
    updated_at: str


class RiskEventRequest(BaseModel):
    vm_id: str
    event_type: str
    details: str | None = None


class RiskEventResponse(BaseModel):
    vm_id: str
    event_type: str
    delta: int
    risk_score: int
    threshold: int
    action: str
    details: str | None = None
