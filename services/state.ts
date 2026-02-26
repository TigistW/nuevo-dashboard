
import { 
  Account, Task, Job, LogEntry, AppSettings, 
  AccountStatus, TaskStatus, TaskType, JobStatus, Language, AIAsset,
  NotebookTemplate, Worker, WorkerLifecycleState
} from '../types';

const STORAGE_KEY = 'colab_farm_v3_data';

interface StorageSchema {
  accounts: Account[];
  workers: Worker[];
  jobs: Job[];
  tasks: Task[];
  assets: AIAsset[];
  logs: LogEntry[];
  settings: AppSettings;
  templates: NotebookTemplate[];
}

const defaultWorkerHealth = () => ({
  gpuUtil: Math.floor(Math.random() * 100),
  vramUsed: Math.floor(Math.random() * 12),
  vramTotal: 16,
  cpuUtil: Math.floor(Math.random() * 40),
  ramUtil: Math.floor(Math.random() * 60),
  heartbeat: new Date().toISOString(),
  idleTimeout: Math.floor(Math.random() * 90),
  browserSession: 'Active' as any,
  latency: Math.floor(Math.random() * 200) + 50,
  reconnects: Math.floor(Math.random() * 3),
  stabilityScore: Math.floor(Math.random() * 20) + 80
});

const initialAccounts: Account[] = [
  { id: 'W-01', email: 'worker.alpha@gmail.com', nickname: 'AlphaBot', password: '••••••••', originalCountry: 'Spain', status: AccountStatus.BUSY, currentTask: 'T-101', gpuType: 'A100', uptime: '14h 20m', runningTime: '14h 20m', health: defaultWorkerHealth(), riskLevel: 'Low' },
  { id: 'W-02', email: 'worker.beta@gmail.com', nickname: 'BetaNode', password: '••••••••', originalCountry: 'USA', status: AccountStatus.FREE, currentTask: null, gpuType: 'T4', uptime: '2h 10m', runningTime: '2h 10m', health: defaultWorkerHealth(), riskLevel: 'Medium' },
  { id: 'W-03', email: 'worker.gamma@gmail.com', nickname: 'GammaCore', password: '••••••••', originalCountry: 'Japan', status: AccountStatus.EMULATING, currentTask: null, gpuType: 'L4', uptime: '5h 45m', runningTime: '5h 45m', health: defaultWorkerHealth(), riskLevel: 'High' },
];

// ... (initialWorkers, initialJobs remain same)

export const generateAiAccount = async () => {
  const data = loadData();
  const firstNames = ['Alex', 'Jordan', 'Casey', 'Taylor', 'Morgan', 'Riley'];
  const lastNames = ['Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia'];
  const countries = ['Spain', 'USA', 'Japan', 'Germany', 'France', 'UK'];
  
  const name = `${firstNames[Math.floor(Math.random() * firstNames.length)]}.${lastNames[Math.floor(Math.random() * lastNames.length)]}`;
  const nickname = `${firstNames[Math.floor(Math.random() * firstNames.length)]}${Math.floor(Math.random() * 99)}`;
  const email = `${name.toLowerCase()}${Math.floor(Math.random() * 999)}@gmail.com`;
  const password = Math.random().toString(36).slice(-10);
  const country = countries[Math.floor(Math.random() * countries.length)];

  const newAcc: Account = {
    id: `W-${Math.floor(100 + Math.random() * 899)}`,
    email,
    nickname,
    password,
    originalCountry: country,
    status: AccountStatus.FREE,
    currentTask: null,
    gpuType: 'T4',
    uptime: '0h',
    runningTime: '0h',
    health: defaultWorkerHealth(),
    riskLevel: 'Low'
  };

  data.accounts.push(newAcc);
  saveData(data);
  appendLog('info', 'AI_ORCHESTRATOR', `AI generated new identity: ${email} (${country})`);
  return newAcc;
};

export const getStorageStats = () => {
  const data = loadData();
  const totalGb = data.assets.reduce((acc, asset) => {
    const size = parseFloat(asset.size.split(' ')[0]) || 0;
    return acc + size;
  }, 0);

  const totalRamUsed = data.workers.reduce((acc, w) => acc + (w.metrics.ram || 0), 0);
  const totalRamAvailable = data.workers.length * 16; // Assuming 16GB per worker

  return {
    totalGb: totalGb.toFixed(1),
    ramUsage: {
      used: (totalRamUsed / 1024).toFixed(1), // Convert MB to GB
      total: totalRamAvailable,
      percent: ((totalRamUsed / (totalRamAvailable * 1024)) * 100).toFixed(1)
    },
    vms: {
      total: data.workers.length,
      error: data.workers.filter(w => w.riskScore > 80).length,
      recent: 2,
      resolved: 1
    },
    tunnels: {
      total: 12,
      error: 1,
      recent: 0,
      resolved: 2
    },
    accounts: {
      total: data.accounts.length,
      error: data.accounts.filter(a => a.status === AccountStatus.ERROR).length,
      recent: 1,
      resolved: 0
    }
  };
};

const initialWorkers: Worker[] = [
  {
    id: 'WRK-001',
    lifecycleState: WorkerLifecycleState.ACTIVE,
    vmId: 'vm-001',
    networkId: 'wg-es-01',
    fingerprintId: 'FP-001',
    accountId: 'W-01',
    activeWorkflowId: 'JOB-2024-001',
    riskScore: 15,
    trustScore: 95,
    verificationStatus: 'Verified',
    history: [
      { timestamp: new Date().toISOString(), state: WorkerLifecycleState.NEW, event: 'Worker Created' },
      { timestamp: new Date().toISOString(), state: WorkerLifecycleState.WARMING, event: 'Environment Warming' },
      { timestamp: new Date().toISOString(), state: WorkerLifecycleState.ACTIVE, event: 'Worker Active' },
    ],
    metrics: { cpu: 12, ram: 45, throughput: 150 },
    health: defaultWorkerHealth()
  },
  {
    id: 'WRK-002',
    lifecycleState: WorkerLifecycleState.WARMING,
    vmId: 'vm-002',
    networkId: 'wg-us-01',
    fingerprintId: 'FP-002',
    accountId: 'W-02',
    activeWorkflowId: null,
    riskScore: 45,
    trustScore: 70,
    verificationStatus: 'Pending',
    history: [
      { timestamp: new Date().toISOString(), state: WorkerLifecycleState.NEW, event: 'Worker Created' },
      { timestamp: new Date().toISOString(), state: WorkerLifecycleState.WARMING, event: 'Environment Warming' },
    ],
    metrics: { cpu: 5, ram: 20, throughput: 0 },
    health: defaultWorkerHealth()
  }
];

const initialJobs: Job[] = [
  { 
    id: 'JOB-2024-001', 
    name: 'Fine-tune Llama 3 8B', 
    description: 'Dataset: Medical_QA_v2, Epochs: 3', 
    status: JobStatus.ACTIVE, 
    progress: 45, 
    tasksIds: ['T-101', 'T-102'], 
    priority: 'High', 
    createdAt: new Date().toISOString(),
    retryCount: 0,
    stages: [
      { id: 'S1', name: 'Environment Setup', status: 'done' },
      { id: 'S2', name: 'Weight Loading', status: 'active' },
      { id: 'S3', name: 'Batch Training', status: 'pending' },
      { id: 'S4', name: 'Checkpoint Export', status: 'pending' }
    ]
  }
];

export const loadData = (): StorageSchema => {
  const saved = localStorage.getItem(STORAGE_KEY);
  let data: StorageSchema;
  
  if (saved) {
    data = JSON.parse(saved);
  } else {
    data = {
      accounts: initialAccounts,
      workers: initialWorkers,
      jobs: initialJobs,
      tasks: [
        { 
          id: 'T-101', 
          jobId: 'JOB-2024-001', 
          type: TaskType.TRAINING, 
          workerId: 'W-01', 
          priority: 'High', 
          progress: 82, 
          status: TaskStatus.PROCESSING, 
          createdAt: new Date().toISOString(),
          accountAssigned: 'worker.alpha@gmail.com',
          estimatedTime: '25m',
          notebookTemplate: '/content/drive/MyDrive/ColabFarm/templates/fine-tune.ipynb'
        }
      ],
      assets: [
        { id: 'A-01', name: 'Llama-3-Med-8B', type: 'Model', format: 'safetensors', size: '15.2 GB', version: 'v1.2', tags: ['Medical', 'LLM'] }
      ],
      logs: [],
      templates: [
        { id: 'TPL-1', name: 'Fine-tuning Template', path: '/content/drive/MyDrive/ColabFarm/templates/fine-tune.ipynb', version: '1.0.2' }
      ],
      settings: {
        drivePath: '/MyDrive/ColabFarm',
        notebooksPath: './notebooks',
        maxAccounts: 10,
        refreshInterval: 8,
        headlessMode: true,
        autoRotation: true,
        notifications: true,
        language: 'es'
      }
    };
  }

  // Ensure all properties exist to prevent "Cannot read properties of undefined (reading 'length')"
  data.accounts = data.accounts || [];
  data.workers = data.workers || [];
  data.jobs = data.jobs || [];
  data.tasks = data.tasks || [];
  data.assets = data.assets || [];
  data.logs = data.logs || [];
  data.templates = data.templates || [];
  data.settings = data.settings || {
    drivePath: '/MyDrive/ColabFarm',
    notebooksPath: './notebooks',
    maxAccounts: 10,
    refreshInterval: 8,
    headlessMode: true,
    autoRotation: true,
    notifications: true,
    language: 'es'
  };

  if (!saved) saveData(data);
  return data;
};

export const saveData = (data: StorageSchema) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
};

export const appendLog = (level: 'info' | 'warning' | 'error', account: string, message: string) => {
  const data = loadData();
  const newLog: LogEntry = {
    id: `LOG-${Date.now()}-${Math.random()}`,
    timestamp: new Date().toISOString(),
    level,
    account,
    message
  };
  data.logs.unshift(newLog);
  if (data.logs.length > 500) data.logs.pop();
  saveData(data);
};

export const addAccount = (email: string, gpuType: string) => {
  const data = loadData();
  const newAcc: Account = {
    id: `W-${Math.floor(100 + Math.random() * 899)}`,
    email,
    status: AccountStatus.FREE,
    currentTask: null,
    gpuType,
    uptime: '0h',
    runningTime: '0h',
    health: defaultWorkerHealth(),
    riskLevel: 'Low'
  };
  data.accounts.push(newAcc);
  saveData(data);
  appendLog('info', 'System', `New account added: ${email}`);
};

export const addTask = (taskData: any) => {
  const data = loadData();
  const taskId = `T-${Math.floor(1000 + Math.random() * 9000)}`;
  const newTask: Task = {
    id: taskId,
    jobId: 'MANUAL',
    workerId: null,
    type: taskData.type,
    priority: taskData.priority,
    progress: 0,
    status: TaskStatus.PENDING,
    createdAt: new Date().toISOString(),
    accountAssigned: null,
    estimatedTime: taskData.estimatedTime || '30m',
    notebookTemplate: taskData.notebookTemplate
  };
  data.tasks.unshift(newTask);
  saveData(data);
  appendLog('info', 'System', `New task created: ${taskId} (${taskData.type})`);
};

export const createJob = (name: string, type: TaskType, priority: any) => {
  const data = loadData();
  const jobId = `JOB-${Math.floor(1000 + Math.random() * 9000)}`;
  const taskId = `T-${Math.floor(1000 + Math.random() * 9000)}`;
  
  const newJob: Job = {
    id: jobId,
    name,
    description: `Auto-generated ${type} job`,
    status: JobStatus.QUEUED,
    progress: 0,
    tasksIds: [taskId],
    stages: [
      { id: 'S1', name: 'Environment Setup', status: 'pending' },
      { id: 'S2', name: 'Data Ingestion', status: 'pending' },
      { id: 'S3', name: 'Main Processing', status: 'pending' }
    ],
    priority,
    createdAt: new Date().toISOString(),
    retryCount: 0
  };

  const newTask: Task = {
    id: taskId,
    jobId: jobId,
    type,
    workerId: null,
    priority,
    progress: 0,
    status: TaskStatus.PENDING,
    createdAt: new Date().toISOString(),
    accountAssigned: null,
    estimatedTime: '1h',
    notebookTemplate: 'default_template.ipynb'
  };

  data.jobs.unshift(newJob);
  data.tasks.unshift(newTask);
  saveData(data);
};

// Added missing template management functions to fix module errors
export const addTemplate = (name: string, path: string) => {
  const data = loadData();
  const newTpl: NotebookTemplate = {
    id: `TPL-${Math.floor(100 + Math.random() * 899)}`,
    name,
    path,
    version: '1.0.0'
  };
  data.templates.push(newTpl);
  saveData(data);
  appendLog('info', 'System', `New template added: ${name}`);
};

export const removeTemplate = (id: string) => {
  const data = loadData();
  data.templates = data.templates.filter(t => t.id !== id);
  saveData(data);
  appendLog('info', 'System', `Template removed: ${id}`);
};
