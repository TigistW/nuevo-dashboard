
export enum AccountStatus {
  FREE = 'Free',
  BUSY = 'Busy',
  DISCONNECTED = 'Disconnected',
  ERROR = 'Error',
  EMULATING = 'Emulating'
}

export enum WorkerLifecycleState {
  NEW = 'New',
  WARMING = 'Warming',
  ACTIVE = 'Active',
  COOLDOWN = 'Cooldown',
  ARCHIVED = 'Archived',
  FLAGGED = 'Flagged'
}

export enum JobStatus {
  QUEUED = 'Queued',
  ACTIVE = 'Active',
  COMPLETED = 'Completed',
  FAILED = 'Failed',
  PARTIAL = 'Partial'
}

export enum TaskStatus {
  PENDING = 'Pending',
  PROCESSING = 'Processing',
  COMPLETED = 'Completed',
  FAILED = 'Failed'
}

export enum TaskType {
  STABLE_DIFFUSION = 'Stable Diffusion',
  LLM_INFERENCE = 'LLM Inference',
  TRAINING = 'Model Training',
  DATA_PROCESSING = 'Data Processing'
}

export type Language = 'es' | 'en' | 'ja' | 'zh' | 'ko';

export interface WorkerHealth {
  gpuUtil: number;
  vramUsed: number;
  vramTotal: number;
  cpuUtil: number;
  ramUtil: number;
  heartbeat: string;
  idleTimeout: number; // minutes left
  browserSession: 'Active' | 'Stale' | 'None';
  latency: number; // ms
  reconnects: number;
  stabilityScore: number; // 0-100
}

export interface Account {
  id: string;
  email: string;
  nickname?: string;
  password?: string;
  originalCountry?: string;
  status: AccountStatus;
  currentTask: string | null;
  gpuType: string;
  uptime: string;
  runningTime: string;
  health: WorkerHealth;
  riskLevel: 'Low' | 'Medium' | 'High';
}

export interface Worker {
  id: string;
  lifecycleState: WorkerLifecycleState;
  vmId: string;
  networkId: string;
  fingerprintId: string;
  accountId: string;
  activeWorkflowId: string | null;
  riskScore: number; // 0-100
  trustScore: number; // 0-100
  verificationStatus: 'Pending' | 'Verified' | 'Failed' | 'None';
  history: { timestamp: string; state: WorkerLifecycleState; event: string }[];
  metrics: {
    cpu: number;
    ram: number;
    throughput: number;
  };
  health: WorkerHealth;
}

export interface JobStage {
  id: string;
  name: string;
  status: 'pending' | 'active' | 'done' | 'failed';
}

export interface Job {
  id: string;
  name: string;
  description: string;
  status: JobStatus;
  progress: number;
  tasksIds: string[];
  stages: JobStage[]; // New: Detailed stages
  priority: 'Low' | 'Medium' | 'High' | 'Urgent';
  createdAt: string;
  completedAt?: string;
  retryCount: number;
}

export interface Task {
  id: string;
  jobId: string;
  type: TaskType;
  workerId: string | null;
  priority: 'Low' | 'Medium' | 'High' | 'Critical';
  progress: number;
  status: TaskStatus;
  createdAt: string;
  accountAssigned: string | null;
  estimatedTime: string;
  notebookTemplate: string;
}

export interface AIAsset {
  id: string;
  name: string;
  type: 'Model' | 'Dataset';
  format: string;
  size: string;
  version: string;
  tags: string[];
}

export interface LogEntry {
  id: string;
  timestamp: string;
  level: 'info' | 'warning' | 'error';
  account: string;
  message: string;
}

export interface NotebookTemplate {
  id: string;
  name: string;
  path: string;
  version: string;
}

export interface AppSettings {
  drivePath: string;
  notebooksPath: string;
  maxAccounts: number;
  refreshInterval: number;
  headlessMode: boolean;
  autoRotation: boolean;
  notifications: boolean;
  language: Language;
}
