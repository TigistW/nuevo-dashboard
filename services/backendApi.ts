type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

const rawBaseUrl = (import.meta as any).env?.VITE_BACKEND_URL || "http://127.0.0.1:8000";
const API_BASE_URL = String(rawBaseUrl).replace(/\/+$/, "");

function buildUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) {
    return path;
  }
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!API_BASE_URL) {
    return normalizedPath;
  }
  return `${API_BASE_URL}${normalizedPath}`;
}

async function requestJson<T>(path: string, method: HttpMethod, body?: unknown): Promise<T> {
  const response = await fetch(buildUrl(path), {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const raw = await response.text();
  let parsed: any = null;
  if (raw) {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
  }

  if (!response.ok) {
    const detail =
      (parsed && typeof parsed === "object" && "detail" in parsed && parsed.detail) ||
      `HTTP ${response.status}`;
    throw new Error(String(detail));
  }

  return parsed as T;
}

export interface ApiMicroVm {
  id: string;
  country: string;
  ram: string;
  cpu: string;
  public_ip: string;
  status: string;
  uptime: string;
  exit_node?: string | null;
  verification_status?: string;
}

export interface ApiTunnel {
  id: string;
  country: string;
  provider: string;
  latency: string;
  status: string;
  public_ip: string;
}

export interface ApiIdentity {
  vm_id: string;
  public_ip: string;
  isp: string;
  asn: string;
  ip_type: string;
  country: string;
  city?: string | null;
  status: string;
  last_check: string;
  trust_score: number;
}

export interface ApiOperationStatus {
  id: string;
  resource_type: string;
  resource_id: string;
  operation: string;
  status: string;
  message?: string | null;
  requested_at?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
}

export interface ApiSecurityAudit {
  namespaces: string[];
  nftables_status: string;
  routing_tables: Array<{ table: string; dev: string }>;
}

export interface ApiDnsLeakResult {
  status: string;
  leaks: Array<{ vm_id: string; issue: string }>;
}

export interface ApiSchedulerTask {
  id: string;
  task_type: string;
  vm_id?: string | null;
  status: string;
  priority?: string;
  progress: number;
  retry_count?: number;
  max_retries?: number;
  dead_letter?: boolean;
  next_attempt_at?: string | null;
  error_message?: string | null;
  scheduled_for?: string | null;
  schedule_window_start_hour?: number | null;
  schedule_window_end_hour?: number | null;
  timezone_offset_minutes?: number;
  jitter_seconds?: number;
  recurrence_minutes?: number | null;
}

export interface ApiJobEnqueueResponse {
  message: string;
  job_id: string;
  status: string;
}

export interface ApiSchedulerConfig {
  concurrency_limit: number;
  backoff_base_seconds: number;
  default_max_retries: number;
  tick_seconds: number;
  warmup_enabled: boolean;
  warmup_interval_minutes: number;
  warmup_jitter_seconds: number;
  default_window_start_hour: number;
  default_window_end_hour: number;
  timezone_offsets: number[];
}

export interface ApiSchedulerTickResult {
  dispatched: number;
  warmup_jobs_enqueued: number;
  queued_jobs: number;
  active_jobs: number;
}

export interface ApiResourceThresholds {
  cpu_percent: number;
  ram_percent: number;
  disk_percent: number;
}

export interface ApiResourceSnapshot {
  active_vms: number;
  active_jobs: number;
  active_tunnels: number;
  host_cpu_percent: number;
  host_ram_used_mb: number;
  host_ram_total_mb: number;
  host_ram_percent: number;
  host_disk_used_gb: number;
  host_disk_total_gb: number;
  host_disk_percent: number;
  max_vms: number;
}

export interface ApiProtectionState {
  protective_mode: boolean;
  failsafe_active: boolean;
  cooldown_until?: string | null;
  last_reason?: string | null;
  thresholds: ApiResourceThresholds;
  snapshot: ApiResourceSnapshot;
  actions: string[];
  signals: string[];
}

export interface ApiGuardrails {
  max_vms: number;
  min_host_ram_mb: number;
  max_cpu_per_vm: number;
  overload_prevention: boolean;
}

export interface ApiHealingRule {
  id: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

export interface ApiCentralizedLogEntry {
  time: string;
  source: string;
  level: string;
  msg: string;
  details?: string | null;
}

export interface ApiGlobalMetrics {
  active_vms: number;
  total_vms: number;
  active_tunnels: number;
  functional_ips_percent: number;
  host_cpu_percent: number;
  host_ram_gb: number;
  recent_reboots: number;
  error_rate_percent: number;
  host_disk_percent: number;
  active_jobs: number;
}

export interface ApiTelemetrySample {
  name: string;
  uptime: number;
  stability: number;
  load: number;
}

export interface ApiAutoscaleRequest {
  min_vms: number;
  max_vms: number;
  jobs_per_vm: number;
  country: string;
  country_min_pools?: Record<string, number>;
  ram: string;
  cpu: string;
  template_id: string;
}

export interface ApiAutoscaleDecision {
  status: string;
  action: string;
  reason: string;
  running_vms: number;
  desired_vms: number;
  active_jobs: number;
  queued_jobs: number;
  operation_id?: string | null;
  affected_vm_id?: string | null;
}

export interface ApiTerminalCommandResponse {
  output: string;
}

export interface ApiWorkflowExecutionResponse {
  status: string;
  workflow_id: string;
  timestamp: string;
  operation_id: string;
}

export interface ApiVerificationRequest {
  id: string;
  vm_id: string;
  worker_id: string;
  verification_type: string;
  status: string;
  provider: string;
  destination: string;
  retries: number;
  last_error?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ApiCaptchaEvent {
  id: number;
  vm_id?: string | null;
  provider: string;
  status: string;
  source: string;
  score?: number | null;
  latency_ms: number;
  created_at: string;
  details?: string | null;
}

export interface ApiCaptchaSummary {
  total: number;
  solved: number;
  failed: number;
  timeout: number;
  bypassed: number;
  success_rate: number;
  avg_latency_ms: number;
}

export function listMicroVms(): Promise<ApiMicroVm[]> {
  return requestJson<ApiMicroVm[]>("/api/v1/orchestrator/list", "GET");
}

export function createMicroVm(payload: {
  id: string;
  country: string;
  ram: string;
  cpu: string;
  template_id: string;
}): Promise<ApiMicroVm> {
  return requestJson<ApiMicroVm>("/api/v1/orchestrator/create", "POST", payload);
}

export function stopMicroVm(vmId: string): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>(`/api/v1/orchestrator/${encodeURIComponent(vmId)}/stop`, "POST");
}

export function restartMicroVm(vmId: string): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>(
    `/api/v1/orchestrator/${encodeURIComponent(vmId)}/restart`,
    "POST"
  );
}

export function deleteMicroVm(vmId: string): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>(`/api/v1/orchestrator/${encodeURIComponent(vmId)}`, "DELETE");
}

export function getOperation(operationId: string): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>(
    `/api/v1/orchestrator/operations/${encodeURIComponent(operationId)}`,
    "GET"
  );
}

export function listTunnels(): Promise<ApiTunnel[]> {
  return requestJson<ApiTunnel[]>("/api/v1/network/tunnels", "GET");
}

export function listIdentities(): Promise<ApiIdentity[]> {
  return requestJson<ApiIdentity[]>("/api/v1/network/identities", "GET");
}

export function rotateVmTunnel(vmId: string): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>(
    `/api/v1/network/tunnels/rotate/${encodeURIComponent(vmId)}`,
    "POST"
  );
}

export function registerTunnel(country: string, ip: string, provider: string): Promise<ApiTunnel> {
  const query = new URLSearchParams({ country, ip, provider });
  return requestJson<ApiTunnel>(`/api/v1/network/tunnels/register?${query.toString()}`, "POST");
}

export function dnsLeakTest(vmId?: string): Promise<ApiDnsLeakResult> {
  const query = vmId ? `?${new URLSearchParams({ vm_id: vmId }).toString()}` : "";
  return requestJson<ApiDnsLeakResult>(`/api/v1/network/dns-leak-test${query}`, "GET");
}

export function getSecurityAudit(): Promise<ApiSecurityAudit> {
  return requestJson<ApiSecurityAudit>("/api/v1/security/audit", "GET");
}

export function testIsolation(vmId?: string): Promise<{ status: string; details: string }> {
  const query = vmId ? `?${new URLSearchParams({ vm_id: vmId }).toString()}` : "";
  return requestJson<{ status: string; details: string }>(`/api/v1/security/test-isolation${query}`, "POST");
}

export function syncFingerprint(vmId: string): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>(
    `/api/v1/governance/fingerprint/sync/${encodeURIComponent(vmId)}`,
    "POST"
  );
}

export function getGuardrailsConfig(): Promise<ApiGuardrails> {
  return requestJson<ApiGuardrails>("/api/v1/governance/guardrails/config", "GET");
}

export function updateGuardrailsConfig(payload: ApiGuardrails): Promise<ApiGuardrails> {
  return requestJson<ApiGuardrails>("/api/v1/governance/guardrails/config", "PUT", payload);
}

export function listSchedulerQueue(): Promise<ApiSchedulerTask[]> {
  return requestJson<ApiSchedulerTask[]>("/api/v1/automation/scheduler/queue", "GET");
}

export function getSchedulerConfig(): Promise<ApiSchedulerConfig> {
  return requestJson<ApiSchedulerConfig>("/api/v1/automation/scheduler/config", "GET");
}

export function triggerSchedulerTick(): Promise<ApiSchedulerTickResult> {
  return requestJson<ApiSchedulerTickResult>("/api/v1/automation/scheduler/tick", "POST");
}

export function getProtectionState(): Promise<ApiProtectionState> {
  return requestJson<ApiProtectionState>("/api/v1/intelligence/control/state", "GET");
}

export function evaluateProtection(apply: boolean = true): Promise<ApiProtectionState> {
  const query = new URLSearchParams({ apply: String(apply) });
  return requestJson<ApiProtectionState>(`/api/v1/intelligence/control/evaluate?${query.toString()}`, "POST");
}

export function resetProtectionState(): Promise<ApiProtectionState> {
  return requestJson<ApiProtectionState>("/api/v1/intelligence/control/reset", "POST");
}

export function listHealingRules(): Promise<ApiHealingRule[]> {
  return requestJson<ApiHealingRule[]>("/api/v1/automation/healing/rules", "GET");
}

export function updateHealingRule(ruleId: string, enabled: boolean): Promise<ApiHealingRule> {
  return requestJson<ApiHealingRule>(`/api/v1/automation/healing/rules/${encodeURIComponent(ruleId)}`, "PUT", {
    enabled,
  });
}

export function getCentralizedLogs(source: string = "All"): Promise<ApiCentralizedLogEntry[]> {
  const query = new URLSearchParams({ source });
  return requestJson<ApiCentralizedLogEntry[]>(`/api/v1/intelligence/logs/centralized?${query.toString()}`, "GET");
}

export function getGlobalMetrics(): Promise<ApiGlobalMetrics> {
  return requestJson<ApiGlobalMetrics>("/api/v1/intelligence/metrics/global", "GET");
}

export function getTelemetryHistory(): Promise<ApiTelemetrySample[]> {
  return requestJson<ApiTelemetrySample[]>("/api/v1/intelligence/telemetry/history", "GET");
}

export function enqueueSchedulerJob(payload: ApiSchedulerTask): Promise<ApiJobEnqueueResponse> {
  return requestJson<ApiJobEnqueueResponse>("/api/v1/automation/scheduler/jobs", "POST", payload);
}

export function autoscaleNow(payload: ApiAutoscaleRequest): Promise<ApiAutoscaleDecision> {
  return requestJson<ApiAutoscaleDecision>("/api/v1/automation/scheduler/autoscale", "POST", payload);
}

export function terminalCommand(vmId: string, command: string): Promise<ApiTerminalCommandResponse> {
  const query = new URLSearchParams({ vm_id: vmId, command });
  return requestJson<ApiTerminalCommandResponse>(`/api/v1/repository/terminal/command?${query.toString()}`, "POST");
}

export function executeWorkflow(workflowId: string): Promise<ApiWorkflowExecutionResponse> {
  const query = new URLSearchParams({ workflow_id: workflowId });
  return requestJson<ApiWorkflowExecutionResponse>(`/api/v1/repository/workflows/execute?${query.toString()}`, "POST");
}

export function listVerificationRequests(limit: number = 100): Promise<ApiVerificationRequest[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  return requestJson<ApiVerificationRequest[]>(`/api/v1/verification/requests?${query.toString()}`, "GET");
}

export function createVerificationRequest(payload: {
  id?: string;
  vm_id: string;
  worker_id: string;
  verification_type?: string;
  status?: string;
  provider: string;
  destination: string;
}): Promise<ApiVerificationRequest> {
  return requestJson<ApiVerificationRequest>("/api/v1/verification/requests", "POST", payload);
}

export function retryVerificationRequest(requestId: string): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>(
    `/api/v1/verification/requests/${encodeURIComponent(requestId)}/retry`,
    "POST"
  );
}

export function createCaptchaEvent(payload: {
  vm_id?: string;
  provider: string;
  status: string;
  source: string;
  score?: number;
  latency_ms?: number;
  details?: string;
}): Promise<ApiCaptchaEvent> {
  return requestJson<ApiCaptchaEvent>("/api/v1/verification/captcha/events", "POST", payload);
}

export function getCaptchaEvents(limit: number = 100): Promise<ApiCaptchaEvent[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  return requestJson<ApiCaptchaEvent[]>(`/api/v1/verification/captcha/events?${query.toString()}`, "GET");
}

export function getCaptchaSummary(hours: number = 24): Promise<ApiCaptchaSummary> {
  const query = new URLSearchParams({ hours: String(hours) });
  return requestJson<ApiCaptchaSummary>(`/api/v1/verification/captcha/summary?${query.toString()}`, "GET");
}

export interface ApiGoogleAccount {
  id: string;
  email: string;
  status: string;
  vm_id?: string | null;
  risk_score: number;
  warmup_state: string;
  last_used_at?: string | null;
}

export interface ApiAccountModeConfig {
  mode: "one_to_one" | "dynamic_pool";
}

export interface ApiAccountAssignmentResponse {
  vm_id: string;
  account_id: string;
  email: string;
  mode: string;
  reassigned: boolean;
}

export interface ApiNotebookSession {
  id: string;
  vm_id: string;
  account_email?: string | null;
  status: string;
  gpu_assigned_gb: number;
  gpu_usage_gb: number;
  ram_usage_gb: number;
  load_percent: number;
  cycle_state: string;
  next_transition_at?: string | null;
  session_expires_at?: string | null;
  warning_message?: string | null;
  restart_count: number;
  risk_score: number;
  updated_at: string;
}

export interface ApiNotebookDistributionPlan {
  required_gpu_gb: number;
  notebooks_required: number;
  target_range_percent: [number, number];
  per_notebook_target_gb: number[];
}

export interface ApiNotebookTickResult {
  updated: number;
  rotated: number;
  resting: number;
  warnings: number;
}

export interface ApiIpCandidateCheckResponse {
  ip: string;
  context: string;
  filter1_available: boolean;
  filter2_reputation_ok: boolean;
  recommended: boolean;
  reasons: string[];
  reputation_score: number;
  negative_events: number;
  restricted: boolean;
  discarded: boolean;
}

export interface ApiIpHistoryRecord {
  ip: string;
  last_used_at: string;
  account_email?: string | null;
  associated_vm_id?: string | null;
  negative_events: number;
  smtp_used: boolean;
  reputation_score: number;
  restricted: boolean;
  discarded: boolean;
  last_event?: string | null;
}

export interface ApiFootprintActivity {
  id: string;
  vm_id: string;
  account_id?: string | null;
  activity_type: string;
  status: string;
  details?: string | null;
  timezone_offset_minutes: number;
  scheduled_at?: string | null;
  executed_at?: string | null;
}

export interface ApiFootprintTickResult {
  scheduled: number;
  executed: number;
}

export interface ApiTunnelBenchmarkResult {
  protocol: string;
  latency_ms: number;
  stability_score: number;
  persistence_score: number;
  detection_score: number;
  throughput_mbps: number;
  created_at: string;
  notes?: string | null;
}

export interface ApiSmtpTask {
  id: string;
  vm_id?: string | null;
  status: string;
  implementation: string;
  domain: string;
  sender: string;
  recipients_count: number;
  success_count: number;
  failure_count: number;
  ip_used?: string | null;
  spf_enabled: boolean;
  dkim_enabled: boolean;
  dmarc_enabled: boolean;
  rdns_enabled: boolean;
  tls_enabled: boolean;
  error_message?: string | null;
  created_at: string;
  completed_at?: string | null;
}

export interface ApiN8nRoleConfig {
  role: "main_orchestrator" | "secondary_automation" | "eliminated";
  notes?: string | null;
}

export interface ApiN8nWorkflow {
  workflow_id: string;
  name: string;
  source: string;
  active: boolean;
  version_hash: string;
  created_at: string;
  updated_at: string;
  definition?: Record<string, any> | null;
}

export interface ApiN8nRun {
  id: string;
  workflow_id: string;
  external_execution_id?: string | null;
  trigger: string;
  status: string;
  context: Record<string, any>;
  events: Array<Record<string, any>>;
  last_message?: string | null;
  created_at: string;
  started_at?: string | null;
  finished_at?: string | null;
  updated_at: string;
}

export interface ApiRiskEventResponse {
  vm_id: string;
  event_type: string;
  delta: number;
  risk_score: number;
  threshold: number;
  action: string;
  details?: string | null;
}

export function listGoogleAccounts(): Promise<ApiGoogleAccount[]> {
  return requestJson<ApiGoogleAccount[]>("/api/v1/accounts/", "GET");
}

export function createGoogleAccount(payload: { id?: string; email: string }): Promise<ApiGoogleAccount> {
  return requestJson<ApiGoogleAccount>("/api/v1/accounts/create", "POST", payload);
}

export function getAccountMode(): Promise<ApiAccountModeConfig> {
  return requestJson<ApiAccountModeConfig>("/api/v1/accounts/mode", "GET");
}

export function setAccountMode(mode: "one_to_one" | "dynamic_pool"): Promise<ApiAccountModeConfig> {
  return requestJson<ApiAccountModeConfig>("/api/v1/accounts/mode", "PUT", { mode });
}

export function assignGoogleAccount(payload: { vm_id: string; account_id?: string }): Promise<ApiAccountAssignmentResponse> {
  return requestJson<ApiAccountAssignmentResponse>("/api/v1/accounts/assign", "POST", payload);
}

export function releaseGoogleAccount(accountId: string): Promise<ApiGoogleAccount> {
  return requestJson<ApiGoogleAccount>(`/api/v1/accounts/release/${encodeURIComponent(accountId)}`, "POST");
}

export function listNotebookSessions(vmId?: string): Promise<ApiNotebookSession[]> {
  const query = vmId ? `?${new URLSearchParams({ vm_id: vmId }).toString()}` : "";
  return requestJson<ApiNotebookSession[]>(`/api/v1/notebook/sessions${query}`, "GET");
}

export function createNotebookSession(payload: {
  id?: string;
  vm_id: string;
  account_email?: string;
  gpu_assigned_gb?: number;
  timezone_offset_minutes?: number;
}): Promise<ApiNotebookSession> {
  return requestJson<ApiNotebookSession>("/api/v1/notebook/sessions", "POST", payload);
}

export function planNotebookDistribution(payload: {
  required_gpu_gb: number;
  target_min_percent?: number;
  target_max_percent?: number;
  gpu_per_notebook_gb?: number;
}): Promise<ApiNotebookDistributionPlan> {
  return requestJson<ApiNotebookDistributionPlan>("/api/v1/notebook/distribution/plan", "POST", payload);
}

export function tickNotebookSessions(): Promise<ApiNotebookTickResult> {
  return requestJson<ApiNotebookTickResult>("/api/v1/notebook/tick", "POST");
}

export function reportNotebookEvent(
  notebookId: string,
  payload: { event_type: string; details?: string }
): Promise<{ notebook_id: string; status: string; actions: string[]; risk_delta: number }> {
  return requestJson<{ notebook_id: string; status: string; actions: string[]; risk_delta: number }>(
    `/api/v1/notebook/sessions/${encodeURIComponent(notebookId)}/event`,
    "POST",
    payload
  );
}

export function evaluateIpCandidate(payload: {
  ip: string;
  context?: "google" | "smtp";
  cooldown_minutes?: number;
}): Promise<ApiIpCandidateCheckResponse> {
  return requestJson<ApiIpCandidateCheckResponse>("/api/v1/ip-policy/evaluate", "POST", payload);
}

export function listIpHistory(limit: number = 200): Promise<ApiIpHistoryRecord[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  return requestJson<ApiIpHistoryRecord[]>(`/api/v1/ip-policy/history?${query.toString()}`, "GET");
}

export function recordIpUsage(payload: {
  ip: string;
  account_email?: string;
  associated_vm_id?: string;
  smtp_used?: boolean;
  last_event?: string;
}): Promise<ApiIpHistoryRecord> {
  return requestJson<ApiIpHistoryRecord>("/api/v1/ip-policy/history/usage", "POST", payload);
}

export function recordIpEvent(payload: {
  ip: string;
  event: string;
  severity?: "minor" | "moderate" | "critical";
}): Promise<ApiIpHistoryRecord> {
  return requestJson<ApiIpHistoryRecord>("/api/v1/ip-policy/history/event", "POST", payload);
}

export function listFootprintActivities(limit: number = 200, vmId?: string): Promise<ApiFootprintActivity[]> {
  const query = new URLSearchParams({
    limit: String(limit),
    ...(vmId ? { vm_id: vmId } : {}),
  });
  return requestJson<ApiFootprintActivity[]>(`/api/v1/footprint/activities?${query.toString()}`, "GET");
}

export function scheduleFootprintActivity(payload: {
  vm_id: string;
  account_id?: string;
  activity_type?: string;
  timezone_offset_minutes?: number;
  delay_seconds?: number;
  details?: string;
}): Promise<ApiFootprintActivity> {
  return requestJson<ApiFootprintActivity>("/api/v1/footprint/activities", "POST", payload);
}

export function tickFootprint(): Promise<ApiFootprintTickResult> {
  return requestJson<ApiFootprintTickResult>("/api/v1/footprint/tick", "POST");
}

export function runTunnelBenchmark(payload: {
  protocols?: string[];
  samples?: number;
}): Promise<ApiTunnelBenchmarkResult[]> {
  return requestJson<ApiTunnelBenchmarkResult[]>("/api/v1/benchmark/run", "POST", payload);
}

export function listTunnelBenchmarkResults(protocol?: string, limit: number = 100): Promise<ApiTunnelBenchmarkResult[]> {
  const query = new URLSearchParams({
    ...(protocol ? { protocol } : {}),
    limit: String(limit),
  });
  return requestJson<ApiTunnelBenchmarkResult[]>(`/api/v1/benchmark/results?${query.toString()}`, "GET");
}

export function sendSmtpTask(payload: {
  id?: string;
  domain: string;
  sender: string;
  recipients: string[];
  implementation?: "postfix" | "smtp_light";
  country?: string;
  preferred_ip?: string;
}): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>("/api/v1/smtp/send", "POST", payload);
}

export function listSmtpTasks(limit: number = 200): Promise<ApiSmtpTask[]> {
  const query = new URLSearchParams({ limit: String(limit) });
  return requestJson<ApiSmtpTask[]>(`/api/v1/smtp/tasks?${query.toString()}`, "GET");
}

export function getSmtpTask(taskId: string): Promise<ApiSmtpTask> {
  return requestJson<ApiSmtpTask>(`/api/v1/smtp/tasks/${encodeURIComponent(taskId)}`, "GET");
}

export function getN8nRoleConfig(): Promise<ApiN8nRoleConfig> {
  return requestJson<ApiN8nRoleConfig>("/api/v1/architecture/n8n-role", "GET");
}

export function setN8nRoleConfig(payload: ApiN8nRoleConfig): Promise<ApiN8nRoleConfig> {
  return requestJson<ApiN8nRoleConfig>("/api/v1/architecture/n8n-role", "PUT", payload);
}

export function listN8nWorkflows(includeDefinition: boolean = false): Promise<ApiN8nWorkflow[]> {
  const query = new URLSearchParams({ include_definition: String(includeDefinition) });
  return requestJson<ApiN8nWorkflow[]>(`/api/v1/n8n/workflows?${query.toString()}`, "GET");
}

export function importN8nWorkflow(payload: {
  workflow_id?: string;
  name: string;
  source?: string;
  active?: boolean;
  definition?: Record<string, any>;
}): Promise<ApiN8nWorkflow> {
  return requestJson<ApiN8nWorkflow>("/api/v1/n8n/workflows/import", "POST", payload);
}

export function listN8nRuns(limit: number = 200, workflowId?: string): Promise<ApiN8nRun[]> {
  const query = new URLSearchParams({
    limit: String(limit),
    ...(workflowId ? { workflow_id: workflowId } : {}),
  });
  return requestJson<ApiN8nRun[]>(`/api/v1/n8n/runs?${query.toString()}`, "GET");
}

export function createN8nRun(payload: {
  workflow_id: string;
  external_execution_id?: string;
  trigger?: string;
  context?: Record<string, any>;
}): Promise<ApiN8nRun> {
  return requestJson<ApiN8nRun>("/api/v1/n8n/runs", "POST", payload);
}

export function appendN8nRunEvent(
  runId: string,
  payload: { phase: string; status: string; message: string; details?: string }
): Promise<ApiN8nRun> {
  return requestJson<ApiN8nRun>(`/api/v1/n8n/runs/${encodeURIComponent(runId)}/events`, "POST", payload);
}

export function updateN8nRunStatus(
  runId: string,
  payload: { status: "running" | "succeeded" | "failed" | "cancelled"; message?: string }
): Promise<ApiN8nRun> {
  return requestJson<ApiN8nRun>(`/api/v1/n8n/runs/${encodeURIComponent(runId)}`, "PUT", payload);
}

export function recordRiskEvent(payload: {
  vm_id: string;
  event_type: string;
  details?: string;
}): Promise<ApiRiskEventResponse> {
  return requestJson<ApiRiskEventResponse>("/api/v1/antiblock/events", "POST", payload);
}
