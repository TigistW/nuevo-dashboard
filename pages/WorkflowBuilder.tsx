
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from '../App';
import { TaskType } from '../types';
import {
  autoscaleNow,
  ApiAutoscaleDecision,
  ApiMicroVm,
  ApiOperationStatus,
  createMicroVm,
  dnsLeakTest,
  enqueueSchedulerJob,
  getOperation,
  listMicroVms,
  listSchedulerQueue,
  rotateVmTunnel,
  syncFingerprint,
  terminalCommand,
  testIsolation,
} from '../services/backendApi';

type WorkflowStepType =
  | 'infra'
  | 'network'
  | 'identity'
  | 'automation'
  | 'verification'
  | 'task'
  | 'session';

type StepStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'skipped';

interface WorkflowStep {
  id: string;
  type: WorkflowStepType;
  label: string;
  icon: string;
  status?: StepStatus;
  message?: string;
}

type WorkflowRunConfig = {
  vmId: string;
  country: string;
  ram: string;
  cpu: string;
  templateId: string;
  taskType: string;
  command: string;
};

type WorkflowContext = {
  vmId?: string;
  publicIp?: string;
  ipAssignedOnCreate?: boolean;
  lastJobId?: string;
  lastCommand?: string;
  lastCommandOutput?: string;
  operationByStepId: Record<string, string>;
};

type AutoscaleConfig = {
  minVms: number;
  maxVms: number;
  jobsPerVm: number;
  intervalSec: number;
  country: string;
  countryPoolsText: string;
  ram: string;
  cpu: string;
  templateId: string;
};

type WorkflowSession = {
  id: string;
  createdAt: string;
  updatedAt: string;
  steps: WorkflowStep[];
  config: WorkflowRunConfig;
  context: WorkflowContext;
  status: 'idle' | 'running' | 'completed' | 'failed';
};

const STORAGE_KEY = 'colab_farm_workflow_session_v1';
const COUNTRY_OPTIONS = ['us', 'de', 'ca', 'es', 'fr', 'uk', 'jp', 'sg'];
const RAM_PATTERN = /^\s*(\d+)\s*(mb|m|gb|g)?\s*$/i;
const CPU_PATTERN = /^\s*(\d+)\s*$/;
const MAX_RECOMMENDED_VMS = 50;

const DEFAULT_CONFIG: WorkflowRunConfig = {
  vmId: '',
  country: 'us',
  ram: '256MB',
  cpu: '1',
  templateId: 't-001',
  taskType: TaskType.STABLE_DIFFUSION,
  command: 'status',
};

const DEFAULT_AUTOSCALE_CONFIG: AutoscaleConfig = {
  minVms: 1,
  maxVms: 6,
  jobsPerVm: 2,
  intervalSec: 25,
  country: 'us',
  countryPoolsText: '',
  ram: '256MB',
  cpu: '1',
  templateId: 't-001',
};

const INITIAL_STEPS: WorkflowStep[] = [
  { id: '1', type: 'infra', label: 'Create Micro-VM', icon: '📦', status: 'pending' },
  { id: '2', type: 'network', label: 'Assign Network/IP', icon: '🌐', status: 'pending' },
  { id: '3', type: 'identity', label: 'Generate Fingerprint', icon: '👤', status: 'pending' },
  { id: '4', type: 'automation', label: 'Execute Automation', icon: '⚡', status: 'pending' },
  { id: '5', type: 'verification', label: 'Handle Verification', icon: '✅', status: 'pending' },
  { id: '6', type: 'task', label: 'Execute Task', icon: '📋', status: 'pending' },
  { id: '7', type: 'session', label: 'Persist Session', icon: '💾', status: 'pending' },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function safeNowIso(): string {
  return new Date().toISOString();
}

function generateSafeVmId(): string {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 6);
  const suffix = `${timePart}${randomPart}`.slice(-8);
  return `vm-${suffix}`;
}

function parseRamToMb(value: string): number | null {
  const match = RAM_PATTERN.exec(value || '');
  if (!match) {
    return null;
  }
  const amount = Number(match[1]);
  const unit = (match[2] || 'mb').toLowerCase();
  if (!Number.isFinite(amount) || amount <= 0) {
    return null;
  }
  return unit === 'gb' || unit === 'g' ? amount * 1024 : amount;
}

function parseCpuCores(value: string): number | null {
  const match = CPU_PATTERN.exec(value || '');
  if (!match) {
    return null;
  }
  const cores = Number(match[1]);
  if (!Number.isFinite(cores) || cores <= 0) {
    return null;
  }
  return cores;
}

function parseCountryMinPools(raw: string): { pools: Record<string, number>; errors: string[] } {
  const pools: Record<string, number> = {};
  const errors: string[] = [];
  const text = (raw || '').trim();
  if (!text) {
    return { pools, errors };
  }

  const entries = text
    .split(/[\n,;]+/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  for (const entry of entries) {
    const parts = entry.split(':').map((part) => part.trim());
    if (parts.length !== 2 || !parts[0] || !parts[1]) {
      errors.push(`Invalid country pool '${entry}'. Use format country:min.`);
      continue;
    }

    const country = parts[0].toLowerCase();
    if (!/^[a-z-]{2,64}$/i.test(country)) {
      errors.push(`Invalid country key '${parts[0]}' in country pools.`);
      continue;
    }

    if (!/^\d+$/.test(parts[1])) {
      errors.push(`Invalid minimum '${parts[1]}' for country '${country}'.`);
      continue;
    }

    const minimum = Number(parts[1]);
    if (minimum < 0 || minimum > 200) {
      errors.push(`Country pool for '${country}' must be between 0 and 200.`);
      continue;
    }
    pools[country] = minimum;
  }

  return { pools, errors };
}

function normalizeStepStatus(value: WorkflowStep['status']): StepStatus {
  return value || 'pending';
}

function loadSession(): WorkflowSession | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return null;
    }
    return parsed as WorkflowSession;
  } catch {
    return null;
  }
}

function persistSession(session: WorkflowSession): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    // ignore persistence failures (private mode/quota)
  }
}

function clearSession(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}

function setStepState(
  steps: WorkflowStep[],
  stepId: string,
  updates: Partial<WorkflowStep>
): WorkflowStep[] {
  return steps.map((step) => (step.id === stepId ? { ...step, ...updates } : step));
}

type OperationWaitOptions = {
  timeoutMs?: number;
  pollMs?: number;
  onUpdate?: (operation: ApiOperationStatus) => void;
};

async function waitForVmReady(vmId: string, timeoutMs = 180_000, pollMs = 900): Promise<ApiMicroVm> {
  const startedAt = Date.now();
  let lastVm: ApiMicroVm | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const vms = await listMicroVms();
    const vm = vms.find((row) => row.id === vmId);
    if (vm) {
      lastVm = vm;
      const status = (vm.status || '').toLowerCase();
      const ip = (vm.public_ip || '').toLowerCase();
      if (status.includes('running') && ip && ip !== 'pending') {
        return vm;
      }
    }
    await delay(pollMs);
  }

  const lastStatus = lastVm?.status || 'Unknown';
  const lastIp = lastVm?.public_ip || 'Pending';
  throw new Error(`Timed out waiting for VM '${vmId}' to become Running (status=${lastStatus}, ip=${lastIp}).`);
}

async function waitForOperationSuccess(
  operationId: string,
  options: OperationWaitOptions = {}
): Promise<ApiOperationStatus> {
  const { timeoutMs = 180_000, pollMs = 900, onUpdate } = options;
  const startedAt = Date.now();
  let lastOperation: ApiOperationStatus | null = null;

  while (Date.now() - startedAt < timeoutMs) {
    const operation = await getOperation(operationId);
    lastOperation = operation;
    onUpdate?.(operation);

    const status = (operation.status || '').toLowerCase();
    if (status === 'succeeded') {
      return operation;
    }
    if (status === 'failed') {
      throw new Error(operation.message || `Operation '${operationId}' failed.`);
    }
    await delay(pollMs);
  }

  const lastStatus = lastOperation?.status || 'Unknown';
  const lastMessage = lastOperation?.message ? `, message=${lastOperation.message}` : '';
  throw new Error(`Timed out waiting for operation '${operationId}' (status=${lastStatus}${lastMessage}).`);
}

async function waitForSchedulerJob(jobId: string, timeoutMs = 120_000): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const queue = await listSchedulerQueue();
    const job = queue.find((item) => item.id === jobId);
    if (job) {
      const status = (job.status || '').toLowerCase();
      if (status === 'completed') {
        return;
      }
      if (status === 'failed') {
        throw new Error(job.error_message || `Job '${jobId}' failed.`);
      }
    }
    await delay(1500);
  }
  throw new Error(`Timed out waiting for job '${jobId}'.`);
}

async function resolveVmId(context: WorkflowContext, config: WorkflowRunConfig): Promise<string> {
  const fromContext = (context.vmId || '').trim();
  if (fromContext) {
    return fromContext;
  }
  const fromConfig = (config.vmId || '').trim();
  if (fromConfig) {
    return fromConfig;
  }

  const vms = await listMicroVms();
  if (!vms.length) {
    throw new Error('No VMs available. Add a "Create Micro-VM" step or set VM ID in the run config.');
  }
  return vms[0].id;
}

const WorkflowBuilder: React.FC = () => {
  const { t } = useTranslation();
  const autoscaleInFlightRef = useRef(false);

  const availableSteps = useMemo<WorkflowStep[]>(
    () => [
      { id: 'infra', type: 'infra', label: 'Create Micro-VM', icon: '📦' },
      { id: 'network', type: 'network', label: 'Assign Network/IP', icon: '🌐' },
      { id: 'identity', type: 'identity', label: 'Generate Fingerprint', icon: '👤' },
      { id: 'automation', type: 'automation', label: 'Execute Automation', icon: '⚡' },
      { id: 'verification', type: 'verification', label: 'Handle Verification', icon: '✅' },
      { id: 'task', type: 'task', label: 'Execute Task', icon: '📋' },
      { id: 'session', type: 'session', label: 'Persist Session', icon: '💾' },
    ],
    []
  );

  const [steps, setSteps] = useState<WorkflowStep[]>(INITIAL_STEPS);
  const [config, setConfig] = useState<WorkflowRunConfig>(DEFAULT_CONFIG);
  const [context, setContext] = useState<WorkflowContext>({ operationByStepId: {} });
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [isAutoscaleBusy, setIsAutoscaleBusy] = useState<boolean>(false);
  const [autoScaleEnabled, setAutoScaleEnabled] = useState<boolean>(false);
  const [autoScaleConfig, setAutoScaleConfig] = useState<AutoscaleConfig>(DEFAULT_AUTOSCALE_CONFIG);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');
  const [savedSession, setSavedSession] = useState<WorkflowSession | null>(null);

  useEffect(() => {
    setSavedSession(loadSession());
  }, []);

  const workflowValidation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const country = (config.country || '').trim();
    const templateId = (config.templateId || '').trim();
    const ramMb = parseRamToMb(config.ram);
    const cpuCores = parseCpuCores(config.cpu);

    if (!country) {
      errors.push('Workflow country is required.');
    }
    if (!templateId) {
      errors.push('Template is required.');
    }
    if (ramMb === null) {
      errors.push("RAM must use formats like '256', '256MB', or '2GB'.");
    } else {
      if (ramMb < 128) {
        warnings.push('RAM below 128MB can make VM startup unstable.');
      }
      if (ramMb > 4096) {
        warnings.push('RAM above 4096MB may hit host reserve guardrails.');
      }
    }
    if (cpuCores === null) {
      errors.push("CPU must be a positive integer like '1' or '2'.");
    } else if (cpuCores > 2) {
      warnings.push('CPU above 2 may exceed backend per-VM guardrails.');
    }

    return { errors, warnings };
  }, [config.country, config.cpu, config.ram, config.templateId]);

  const autoscaleValidation = useMemo(() => {
    const errors: string[] = [];
    const warnings: string[] = [];
    const selectedCountry = (autoScaleConfig.country || '').trim().toLowerCase();
    const { pools, errors: poolErrors } = parseCountryMinPools(autoScaleConfig.countryPoolsText);

    if (!selectedCountry) {
      errors.push('Autoscaler country is required.');
    }
    errors.push(...poolErrors);

    if (autoScaleConfig.minVms > autoScaleConfig.maxVms) {
      errors.push('Autoscaler Min VMs cannot be greater than Max VMs.');
    }
    if (autoScaleConfig.jobsPerVm <= 0) {
      errors.push('Autoscaler Jobs/VM must be at least 1.');
    }

    const selectedPool = Math.max(pools[selectedCountry] || 0, autoScaleConfig.minVms);
    const poolTotal = Object.entries(pools).reduce((sum, [country, value]) => {
      if (country === selectedCountry) {
        return sum + selectedPool;
      }
      return sum + value;
    }, selectedCountry && !(selectedCountry in pools) ? selectedPool : 0);

    if (poolTotal > autoScaleConfig.maxVms) {
      errors.push(`Country pool minimums total ${poolTotal}, which exceeds Max VMs (${autoScaleConfig.maxVms}).`);
    }

    if (autoScaleConfig.jobsPerVm === 1) {
      warnings.push('Jobs/VM = 1 gives best isolation but highest VM cost.');
    } else if (autoScaleConfig.jobsPerVm >= 8) {
      warnings.push('Jobs/VM >= 8 can overload VMs and increase timeouts.');
    }

    if (autoScaleConfig.maxVms > MAX_RECOMMENDED_VMS) {
      warnings.push(
        `Max VMs above ${MAX_RECOMMENDED_VMS} may be capped by backend guardrails unless limits are raised.`
      );
    }

    return { errors, warnings, countryMinPools: pools };
  }, [autoScaleConfig.country, autoScaleConfig.countryPoolsText, autoScaleConfig.jobsPerVm, autoScaleConfig.maxVms, autoScaleConfig.minVms]);

  const addStep = useCallback((step: WorkflowStep) => {
    setSteps((current) => [
      ...current,
      {
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        type: step.type,
        label: step.label,
        icon: step.icon,
        status: 'pending',
      },
    ]);
  }, []);

  const removeStep = useCallback((id: string) => {
    setSteps((current) => current.filter((step) => step.id !== id));
    setContext((current) => {
      const next = { ...current, operationByStepId: { ...current.operationByStepId } };
      delete next.operationByStepId[id];
      return next;
    });
  }, []);

  const loadSaved = useCallback(() => {
    if (!savedSession) {
      return;
    }
    const restoredSteps = (savedSession.steps || []).map((step) => ({
      ...step,
      status: normalizeStepStatus(step.status),
    }));
    const restoredContext = savedSession.context || { operationByStepId: {} };
    setSteps(restoredSteps.length ? restoredSteps : INITIAL_STEPS);
    setConfig(savedSession.config || DEFAULT_CONFIG);
    setContext({ ...restoredContext, operationByStepId: restoredContext.operationByStepId || {} });
    setErrorText('');
    setInfoText(`Loaded saved workflow session '${savedSession.id}'.`);
  }, [savedSession]);

  const clearSaved = useCallback(() => {
    clearSession();
    setSavedSession(null);
    setInfoText('Cleared saved workflow session.');
  }, []);

  const runAutoscale = useCallback(
    async (mode: 'manual' | 'auto' = 'manual') => {
      if (autoscaleValidation.errors.length > 0) {
        if (mode === 'manual' || autoScaleEnabled) {
          setErrorText(`Autoscale config invalid: ${autoscaleValidation.errors[0]}`);
        }
        return;
      }
      if (autoscaleInFlightRef.current) {
        return;
      }
      if (isExecuting) {
        if (mode === 'manual') {
          setInfoText('Autoscale skipped while workflow is executing.');
        }
        return;
      }

      autoscaleInFlightRef.current = true;
      setIsAutoscaleBusy(true);
      try {
        const decision: ApiAutoscaleDecision = await autoscaleNow({
          min_vms: autoScaleConfig.minVms,
          max_vms: autoScaleConfig.maxVms,
          jobs_per_vm: autoScaleConfig.jobsPerVm,
          country: autoScaleConfig.country,
          country_min_pools: autoscaleValidation.countryMinPools,
          ram: autoScaleConfig.ram,
          cpu: autoScaleConfig.cpu,
          template_id: autoScaleConfig.templateId,
        });
        setErrorText('');
        const prefix = mode === 'auto' ? 'AutoScale' : 'Autoscale';
        const vmInfo = decision.affected_vm_id ? ` vm=${decision.affected_vm_id}` : '';
        if (mode === 'manual' || decision.action !== 'none') {
          setInfoText(
            `${prefix} ${decision.action}: ${decision.reason} (running=${decision.running_vms}, desired=${decision.desired_vms}, active_jobs=${decision.active_jobs})${vmInfo}`
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Autoscale failed.';
        if (mode === 'manual' || autoScaleEnabled) {
          setErrorText(message);
        }
      } finally {
        autoscaleInFlightRef.current = false;
        setIsAutoscaleBusy(false);
      }
    },
    [autoScaleConfig, autoScaleEnabled, autoscaleValidation, isExecuting]
  );

  useEffect(() => {
    if (!autoScaleEnabled) {
      return;
    }
    if (autoscaleValidation.errors.length > 0) {
      setErrorText(`Autoscale config invalid: ${autoscaleValidation.errors[0]}`);
      return;
    }
    const intervalSeconds = Math.max(10, autoScaleConfig.intervalSec || 10);
    void runAutoscale('auto');
    const timer = window.setInterval(() => {
      void runAutoscale('auto');
    }, intervalSeconds * 1000);
    return () => window.clearInterval(timer);
  }, [autoScaleConfig.intervalSec, autoScaleEnabled, autoscaleValidation.errors, runAutoscale]);

  const runWorkflow = useCallback(async () => {
    if (isExecuting) {
      return;
    }
    if (workflowValidation.errors.length > 0) {
      setErrorText(`Workflow config invalid: ${workflowValidation.errors[0]}`);
      return;
    }

    setIsExecuting(true);
    setErrorText('');
    setInfoText('');

    const runId = `wf-${Date.now()}`;
    let nextContext: WorkflowContext = {
      ...context,
      ipAssignedOnCreate: false,
      operationByStepId: { ...context.operationByStepId },
    };
    let nextSteps = steps.map((step) => ({ ...step, status: 'pending' as StepStatus, message: '' }));
    let activeStepId: string | null = null;

    const baseSession: WorkflowSession = {
      id: runId,
      createdAt: safeNowIso(),
      updatedAt: safeNowIso(),
      steps: nextSteps,
      config,
      context: nextContext,
      status: 'running',
    };
    persistSession(baseSession);
    setSavedSession(baseSession);
    setSteps(nextSteps);
    setContext(nextContext);

    const persistSnapshot = (status: WorkflowSession['status']) => {
      const snapshot: WorkflowSession = {
        ...baseSession,
        updatedAt: safeNowIso(),
        steps: nextSteps,
        config,
        context: nextContext,
        status,
      };
      persistSession(snapshot);
      setSavedSession(snapshot);
    };

    try {
      for (const step of nextSteps) {
        activeStepId = step.id;
        nextSteps = setStepState(nextSteps, step.id, { status: 'running', message: '' });
        setSteps(nextSteps);
        persistSnapshot('running');

        if (step.type === 'infra') {
          const vmId = (config.vmId || '').trim() || generateSafeVmId();
          try {
            await createMicroVm({
              id: vmId,
              country: config.country,
              ram: config.ram,
              cpu: config.cpu,
              template_id: config.templateId,
            });
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to create VM.';
            if (!message.toLowerCase().includes('already exists')) {
              throw error;
            }
          }

          const vm = await waitForVmReady(vmId);
          nextContext = { ...nextContext, vmId: vm.id, publicIp: vm.public_ip, ipAssignedOnCreate: true };
          setContext(nextContext);
          nextSteps = setStepState(nextSteps, step.id, {
            status: 'succeeded',
            message: `VM '${vm.id}' Running @ ${vm.public_ip}`,
          });
          setSteps(nextSteps);
          persistSnapshot('running');
          continue;
        }

        if (step.type === 'network') {
          const vmId = await resolveVmId(nextContext, config);
          nextContext = { ...nextContext, vmId };
          setContext(nextContext);

          const currentIp = (nextContext.publicIp || '').trim();
          if (nextContext.ipAssignedOnCreate && currentIp && currentIp.toLowerCase() !== 'pending') {
            nextContext = { ...nextContext, ipAssignedOnCreate: false };
            setContext(nextContext);
            nextSteps = setStepState(nextSteps, step.id, {
              status: 'succeeded',
              message: `IP already assigned during VM creation: ${currentIp}`,
            });
            setSteps(nextSteps);
            persistSnapshot('running');
            continue;
          }

          const operation = await rotateVmTunnel(vmId);
          nextContext = {
            ...nextContext,
            operationByStepId: { ...nextContext.operationByStepId, [step.id]: operation.id },
          };
          setContext(nextContext);
          let lastProgressMessage = '';
          let operationWaitError: Error | null = null;
          try {
            await waitForOperationSuccess(operation.id, {
              timeoutMs: 360_000,
              onUpdate: (op) => {
                const message = op.message || `Operation ${op.status}`;
                if (message && message !== lastProgressMessage) {
                  lastProgressMessage = message;
                  nextSteps = setStepState(nextSteps, step.id, { message });
                  setSteps(nextSteps);
                }
              },
            });
          } catch (error) {
            operationWaitError =
              error instanceof Error ? error : new Error('Timed out waiting for tunnel rotation operation.');
          }
          const vm = await waitForVmReady(vmId);
          nextContext = { ...nextContext, publicIp: vm.public_ip, ipAssignedOnCreate: false };
          setContext(nextContext);
          const hasUsableIp = (vm.public_ip || '').trim().toLowerCase() !== 'pending' && (vm.public_ip || '').trim() !== '';
          if (operationWaitError && !hasUsableIp) {
            throw operationWaitError;
          }

          nextSteps = setStepState(nextSteps, step.id, {
            status: 'succeeded',
            message: operationWaitError
              ? `IP available: ${vm.public_ip} (operation status update delayed).`
              : `IP rotated: ${vm.public_ip}`,
          });
          setSteps(nextSteps);
          persistSnapshot('running');
          continue;
        }

        if (step.type === 'identity') {
          const vmId = await resolveVmId(nextContext, config);
          nextContext = { ...nextContext, vmId };
          setContext(nextContext);

          const operation = await syncFingerprint(vmId);
          nextContext = {
            ...nextContext,
            operationByStepId: { ...nextContext.operationByStepId, [step.id]: operation.id },
          };
          setContext(nextContext);
          let lastProgressMessage = '';
          await waitForOperationSuccess(operation.id, {
            timeoutMs: 120_000,
            onUpdate: (op) => {
              const message = op.message || `Operation ${op.status}`;
              if (message && message !== lastProgressMessage) {
                lastProgressMessage = message;
                nextSteps = setStepState(nextSteps, step.id, { message });
                setSteps(nextSteps);
              }
            },
          });

          nextSteps = setStepState(nextSteps, step.id, { status: 'succeeded', message: 'Fingerprint synced.' });
          setSteps(nextSteps);
          persistSnapshot('running');
          continue;
        }

        if (step.type === 'automation') {
          const vmId = (await resolveVmId(nextContext, config)).trim();
          const jobId = `job-${Date.now()}`;
          await enqueueSchedulerJob({
            id: jobId,
            task_type: config.taskType,
            vm_id: vmId || null,
            status: 'Queued',
            progress: 0,
          });
          nextContext = { ...nextContext, vmId: vmId || undefined, lastJobId: jobId };
          setContext(nextContext);
          await waitForSchedulerJob(jobId);

          nextSteps = setStepState(nextSteps, step.id, {
            status: 'succeeded',
            message: `Automation job '${jobId}' completed.`,
          });
          setSteps(nextSteps);
          persistSnapshot('running');
          continue;
        }

        if (step.type === 'verification') {
          const [dns, isolation] = await Promise.all([dnsLeakTest(), testIsolation()]);
          const dnsOk = (dns.status || '').toLowerCase() === 'secure';
          const isoOk = (isolation.status || '').toLowerCase() === 'passed';
          if (!dnsOk || !isoOk) {
            const dnsDetails = !dnsOk
              ? ` leaks=${(dns.leaks || []).map((item) => `${item.vm_id}:${item.issue}`).join('; ') || 'unknown'}`
              : '';
            const isolationDetails = !isoOk ? ` details=${isolation.details || 'unknown'}` : '';
            const message = `Verification failed (dns=${dns.status}${dnsDetails}, isolation=${isolation.status}${isolationDetails}).`;
            nextSteps = setStepState(nextSteps, step.id, { message });
            setSteps(nextSteps);
            throw new Error(message);
          }

          nextSteps = setStepState(nextSteps, step.id, { status: 'succeeded', message: 'Verification passed.' });
          setSteps(nextSteps);
          persistSnapshot('running');
          continue;
        }

        if (step.type === 'task') {
          const vmId = await resolveVmId(nextContext, config);
          nextContext = { ...nextContext, vmId };
          setContext(nextContext);

          const command = (config.command || 'status').trim() || 'status';
          const response = await terminalCommand(vmId, command);
          nextContext = { ...nextContext, lastCommand: command, lastCommandOutput: response.output };
          setContext(nextContext);

          nextSteps = setStepState(nextSteps, step.id, { status: 'succeeded', message: `Executed: ${command}` });
          setSteps(nextSteps);
          persistSnapshot('running');
          continue;
        }

        if (step.type === 'session') {
          persistSnapshot('running');
          nextSteps = setStepState(nextSteps, step.id, {
            status: 'succeeded',
            message: 'Session persisted to localStorage.',
          });
          setSteps(nextSteps);
          persistSnapshot('running');
          continue;
        }

        nextSteps = setStepState(nextSteps, step.id, { status: 'skipped', message: 'Unsupported step.' });
        setSteps(nextSteps);
        persistSnapshot('running');
      }

      persistSnapshot('completed');
      setInfoText('Workflow completed.');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow failed.';
      setErrorText(message);
      if (activeStepId) {
        nextSteps = setStepState(nextSteps, activeStepId, { status: 'failed', message });
        setSteps(nextSteps);
      }
      persistSnapshot('failed');
    } finally {
      setIsExecuting(false);
    }
  }, [config, context, isExecuting, steps, workflowValidation.errors]);

  const currentVmLabel = context.vmId
    ? `${context.vmId}${context.publicIp ? ` @ ${context.publicIp}` : ''}`
    : '-';

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('workflows')}</h2>
          <p className="text-sm text-slate-500 font-mono">Design automated multi-step operational pipelines</p>
        </div>
        <div className="flex gap-3 items-center">
          <button
            onClick={() => void runAutoscale('manual')}
            disabled={isExecuting || isAutoscaleBusy || autoscaleValidation.errors.length > 0}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border border-slate-700"
            title="Evaluate demand and scale VMs once"
          >
            {isAutoscaleBusy ? 'Autoscaling...' : 'Run Autoscale'}
          </button>
          <button
            onClick={() => {
              if (autoScaleEnabled) {
                setAutoScaleEnabled(false);
                return;
              }
              if (autoscaleValidation.errors.length > 0) {
                setErrorText(`Autoscale config invalid: ${autoscaleValidation.errors[0]}`);
                return;
              }
              setAutoScaleEnabled(true);
            }}
            disabled={isExecuting || (!autoScaleEnabled && autoscaleValidation.errors.length > 0)}
            className={`px-4 py-2 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border ${
              autoScaleEnabled
                ? 'bg-emerald-600/20 border-emerald-500/30 text-emerald-300'
                : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-200'
            }`}
            title="Continuously evaluate demand and scale VMs"
          >
            Auto Mode: {autoScaleEnabled ? 'ON' : 'OFF'}
          </button>
          {savedSession ? (
            <button
              onClick={loadSaved}
              disabled={isExecuting}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border border-slate-700"
              title={`Load saved session ${savedSession.id}`}
            >
              Load Session
            </button>
          ) : null}
          {savedSession ? (
            <button
              onClick={clearSaved}
              disabled={isExecuting}
              className="px-4 py-2 bg-rose-900/20 hover:bg-rose-900/40 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border border-rose-500/20 text-rose-400"
            >
              Clear
            </button>
          ) : null}
          <button
            onClick={() => void runWorkflow()}
            disabled={isExecuting || steps.length === 0 || workflowValidation.errors.length > 0}
            className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-emerald-600/20 transition-all"
          >
            {isExecuting ? 'Executing...' : t('executeWorkflow')}
          </button>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}
      {infoText ? (
        <div className="px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-900/20 text-emerald-300 text-sm">
          {infoText}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Available Steps */}
        <div className="lg:col-span-1 space-y-6">
          <div className="lg:col-span-1 bg-slate-800/30 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-sm h-fit">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">{t('addStep')}</h3>
            <div className="space-y-3">
              {availableSteps.map((step) => (
                <button
                  key={step.id}
                  onClick={() => addStep(step)}
                  disabled={isExecuting}
                  className="w-full flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-emerald-500/30 disabled:opacity-50 transition-all group text-left"
                >
                  <span className="text-xl group-hover:scale-110 transition-transform">{step.icon}</span>
                  <span className="text-xs font-bold text-slate-300">{step.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-6 space-y-4">
            <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('settings')}</h3>
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">VM ID (optional)</label>
                <input
                  value={config.vmId}
                  onChange={(event) => setConfig((prev) => ({ ...prev, vmId: event.target.value }))}
                  placeholder="vm-001"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                  disabled={isExecuting}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Country</label>
                  <select
                    value={config.country}
                    onChange={(event) => setConfig((prev) => ({ ...prev, country: event.target.value }))}
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                    disabled={isExecuting}
                  >
                    {COUNTRY_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option.toUpperCase()}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Template</label>
                  <input
                    value={config.templateId}
                    onChange={(event) => setConfig((prev) => ({ ...prev, templateId: event.target.value }))}
                    placeholder="t-001"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                    disabled={isExecuting}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">RAM</label>
                  <input
                    value={config.ram}
                    onChange={(event) => setConfig((prev) => ({ ...prev, ram: event.target.value }))}
                    placeholder="256MB"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                    disabled={isExecuting}
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">CPU</label>
                  <input
                    value={config.cpu}
                    onChange={(event) => setConfig((prev) => ({ ...prev, cpu: event.target.value }))}
                    placeholder="1"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                    disabled={isExecuting}
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Automation Task</label>
                <select
                  value={config.taskType}
                  onChange={(event) => setConfig((prev) => ({ ...prev, taskType: event.target.value }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                  disabled={isExecuting}
                >
                  <option value={TaskType.STABLE_DIFFUSION}>Stable Diffusion</option>
                  <option value={TaskType.LLM_INFERENCE}>LLM Inference</option>
                  <option value={TaskType.TRAINING}>Model Training</option>
                  <option value={TaskType.DATA_PROCESSING}>Data Processing</option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Task Command</label>
                <input
                  value={config.command}
                  onChange={(event) => setConfig((prev) => ({ ...prev, command: event.target.value }))}
                  placeholder="status"
                  className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                  disabled={isExecuting}
                />
              </div>

              <div className="pt-3 border-t border-slate-800 space-y-3">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Autoscaler</p>
                <div className="grid grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Min VMs</label>
                    <input
                      type="number"
                      min={0}
                      value={autoScaleConfig.minVms}
                      onChange={(event) =>
                        setAutoScaleConfig((prev) => ({
                          ...prev,
                          minVms: Math.max(0, Number(event.target.value) || 0),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                      disabled={isExecuting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Max VMs</label>
                    <input
                      type="number"
                      min={1}
                      value={autoScaleConfig.maxVms}
                      onChange={(event) =>
                        setAutoScaleConfig((prev) => ({
                          ...prev,
                          maxVms: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                      disabled={isExecuting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Jobs/VM</label>
                    <input
                      type="number"
                      min={1}
                      value={autoScaleConfig.jobsPerVm}
                      onChange={(event) =>
                        setAutoScaleConfig((prev) => ({
                          ...prev,
                          jobsPerVm: Math.max(1, Number(event.target.value) || 1),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                      disabled={isExecuting}
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Interval (sec)</label>
                    <input
                      type="number"
                      min={10}
                      value={autoScaleConfig.intervalSec}
                      onChange={(event) =>
                        setAutoScaleConfig((prev) => ({
                          ...prev,
                          intervalSec: Math.max(10, Number(event.target.value) || 10),
                        }))
                      }
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                      disabled={isExecuting}
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Country</label>
                    <select
                      value={autoScaleConfig.country}
                      onChange={(event) => setAutoScaleConfig((prev) => ({ ...prev, country: event.target.value }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                      disabled={isExecuting}
                    >
                      {COUNTRY_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option.toUpperCase()}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Country Pools</label>
                  <input
                    value={autoScaleConfig.countryPoolsText}
                    onChange={(event) =>
                      setAutoScaleConfig((prev) => ({
                        ...prev,
                        countryPoolsText: event.target.value,
                      }))
                    }
                    placeholder="us:2,de:1"
                    className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
                    disabled={isExecuting}
                  />
                  <p className="text-[10px] font-mono text-slate-500">Optional. Format: country:min, country:min</p>
                </div>
                {autoscaleValidation.errors.length > 0 ? (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-[11px] text-rose-300">
                    {autoscaleValidation.errors.map((item, index) => (
                      <p key={`autoscale-error-${index}`}>{item}</p>
                    ))}
                  </div>
                ) : null}
                {autoscaleValidation.warnings.length > 0 ? (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 px-3 py-2 text-[11px] text-amber-200">
                    {autoscaleValidation.warnings.map((item, index) => (
                      <p key={`autoscale-warning-${index}`}>{item}</p>
                    ))}
                  </div>
                ) : null}
              </div>

              {workflowValidation.errors.length > 0 ? (
                <div className="rounded-xl border border-rose-500/30 bg-rose-900/20 px-3 py-2 text-[11px] text-rose-300">
                  {workflowValidation.errors.map((item, index) => (
                    <p key={`workflow-error-${index}`}>{item}</p>
                  ))}
                </div>
              ) : null}
              {workflowValidation.warnings.length > 0 ? (
                <div className="rounded-xl border border-amber-500/30 bg-amber-900/20 px-3 py-2 text-[11px] text-amber-200">
                  {workflowValidation.warnings.map((item, index) => (
                    <p key={`workflow-warning-${index}`}>{item}</p>
                  ))}
                </div>
              ) : null}

              <div className="pt-2 text-[11px] font-mono text-slate-400">
                Active VM: <span className="text-slate-200">{currentVmLabel}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Builder Canvas */}
        <div className="lg:col-span-3 bg-[#0d1225] border border-slate-800 rounded-3xl p-8 relative overflow-hidden">
          <div
            className="absolute inset-0 opacity-5 pointer-events-none"
            style={{
              backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          ></div>

          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8 relative z-10">
            {t('workflowSteps')}
          </h3>

          <div className="flex flex-col items-center gap-6 relative z-10">
            {steps.map((step, i) => {
              const status = normalizeStepStatus(step.status);
              const statusStyles =
                status === 'succeeded'
                  ? 'bg-emerald-500/10 text-emerald-500 border-emerald-500/20'
                  : status === 'failed'
                  ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                  : status === 'running'
                  ? 'bg-blue-500/10 text-blue-500 border-blue-500/20'
                  : status === 'skipped'
                  ? 'bg-amber-500/10 text-amber-500 border-amber-500/20'
                  : 'bg-slate-500/10 text-slate-300 border-slate-500/20';

              return (
                <React.Fragment key={step.id}>
                  <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between group hover:border-emerald-500/50 transition-all shadow-xl">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl flex items-center justify-center text-xl bg-blue-500/10 text-blue-500">
                        {step.icon}
                      </div>
                      <div className="space-y-0.5">
                        <p className="text-[9px] font-black uppercase tracking-widest opacity-40">{step.type}</p>
                        <p className="text-sm font-bold text-slate-200">{step.label}</p>
                        {step.message ? (
                          <p
                            className="text-[11px] text-slate-400 font-mono max-w-[36rem] truncate"
                            title={step.message}
                          >
                            {step.message}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`px-2 py-1 rounded border text-[9px] font-black uppercase tracking-widest ${statusStyles}`}
                      >
                        {status}
                      </span>
                      <button
                        onClick={() => removeStep(step.id)}
                        disabled={isExecuting}
                        className="opacity-0 group-hover:opacity-100 p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all disabled:opacity-50"
                        title="Remove step"
                      >
                        ✖
                      </button>
                    </div>
                  </div>
                  {i < steps.length - 1 ? <div className="w-0.5 h-6 bg-slate-800"></div> : null}
                </React.Fragment>
              );
            })}
          </div>

          {context.lastCommandOutput ? (
            <div className="mt-10 relative z-10 bg-slate-950 border border-slate-800 rounded-2xl p-5 font-mono text-[11px] text-slate-400 overflow-x-auto">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">Last Task Output</span>
                {context.lastCommand ? <span className="text-slate-500">{context.lastCommand}</span> : null}
              </div>
              <pre className="leading-relaxed whitespace-pre-wrap">{context.lastCommandOutput}</pre>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export default WorkflowBuilder;
