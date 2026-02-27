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
  progress: number;
  retry_count?: number;
  error_message?: string | null;
}

export interface ApiJobEnqueueResponse {
  message: string;
  job_id: string;
  status: string;
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

export function dnsLeakTest(): Promise<ApiDnsLeakResult> {
  return requestJson<ApiDnsLeakResult>("/api/v1/network/dns-leak-test", "GET");
}

export function getSecurityAudit(): Promise<ApiSecurityAudit> {
  return requestJson<ApiSecurityAudit>("/api/v1/security/audit", "GET");
}

export function testIsolation(): Promise<{ status: string; details: string }> {
  return requestJson<{ status: string; details: string }>("/api/v1/security/test-isolation", "POST");
}

export function syncFingerprint(vmId: string): Promise<ApiOperationStatus> {
  return requestJson<ApiOperationStatus>(
    `/api/v1/governance/fingerprint/sync/${encodeURIComponent(vmId)}`,
    "POST"
  );
}

export function listSchedulerQueue(): Promise<ApiSchedulerTask[]> {
  return requestJson<ApiSchedulerTask[]>("/api/v1/automation/scheduler/queue", "GET");
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
