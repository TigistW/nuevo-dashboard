import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiMicroVm,
  ApiOperationStatus,
  ApiVerificationRequest,
  createMicroVm,
  createVerificationRequest,
  dnsLeakTest,
  getOperation,
  listMicroVms,
  listVerificationRequests,
  retryVerificationRequest,
  syncFingerprint,
  terminalCommand,
  testIsolation,
} from '../services/backendApi';

type WorkflowStepKey = 'create' | 'fingerprint' | 'verify' | 'command';
type StepStatus = 'idle' | 'running' | 'done' | 'failed';

type StepState = {
  key: WorkflowStepKey;
  label: string;
  enabled: boolean;
  status: StepStatus;
  message: string;
};

type WorkflowForm = {
  vmId: string;
  country: string;
  ram: string;
  cpu: string;
  templateId: string;
  command: string;
};

type VerificationForm = {
  vm_id: string;
  worker_id: string;
  verification_type: 'SMS' | 'QR';
  provider: string;
  destination: string;
};

const COUNTRY_OPTIONS = ['us', 'de', 'ca', 'es', 'fr', 'uk', 'jp', 'sg'];

const DEFAULT_WORKFLOW_FORM: WorkflowForm = {
  vmId: '',
  country: 'us',
  ram: '256MB',
  cpu: '1',
  templateId: 't-001',
  command: 'status',
};

const DEFAULT_VERIFICATION_FORM: VerificationForm = {
  vm_id: '',
  worker_id: '',
  verification_type: 'SMS',
  provider: 'SmsPVA',
  destination: '',
};

const STEP_DEFINITIONS: Array<{ key: WorkflowStepKey; label: string; enabled: boolean }> = [
  { key: 'create', label: 'Create VM', enabled: true },
  { key: 'fingerprint', label: 'Sync fingerprint', enabled: true },
  { key: 'verify', label: 'Run verification checks', enabled: true },
  { key: 'command', label: 'Run terminal command', enabled: false },
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function generateVmId(): string {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 6);
  return `vm-${`${timePart}${randomPart}`.slice(-8)}`;
}

function createInitialStepState(): StepState[] {
  return STEP_DEFINITIONS.map((step) => ({
    key: step.key,
    label: step.label,
    enabled: step.enabled,
    status: 'idle',
    message: '',
  }));
}

async function waitForOperationSuccess(operationId: string, timeoutMs = 180_000): Promise<ApiOperationStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const operation = await getOperation(operationId);
    const status = (operation.status || '').toLowerCase();
    if (status === 'succeeded') {
      return operation;
    }
    if (status === 'failed') {
      throw new Error(operation.message || `Operation '${operationId}' failed.`);
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for operation '${operationId}'.`);
}

async function waitForVmReady(vmId: string, requirePublicIp: boolean): Promise<ApiMicroVm> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180_000) {
    const vms = await listMicroVms();
    const vm = vms.find((row) => row.id === vmId);
    if (vm) {
      const status = (vm.status || '').toLowerCase();
      const ip = (vm.public_ip || '').trim().toLowerCase();
      if (status.includes('error') || status.includes('deleted')) {
        throw new Error(`VM '${vmId}' entered terminal state '${vm.status}'.`);
      }
      if (status.includes('running') && (!requirePublicIp || (ip && ip !== 'pending'))) {
        return vm;
      }
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for VM '${vmId}'.`);
}

function formatDate(value?: string | null): string {
  if (!value) {
    return '-';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

const AutomationConsole: React.FC = () => {
  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [verificationRequests, setVerificationRequests] = useState<ApiVerificationRequest[]>([]);
  const [workflowForm, setWorkflowForm] = useState<WorkflowForm>(DEFAULT_WORKFLOW_FORM);
  const [verificationForm, setVerificationForm] = useState<VerificationForm>(DEFAULT_VERIFICATION_FORM);
  const [steps, setSteps] = useState<StepState[]>(createInitialStepState);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isWorkflowRunning, setIsWorkflowRunning] = useState<boolean>(false);
  const [creatingVerification, setCreatingVerification] = useState<boolean>(false);
  const [retryingId, setRetryingId] = useState<string>('');
  const [busyFingerprintVm, setBusyFingerprintVm] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');
  const [workflowVmId, setWorkflowVmId] = useState<string>('');
  const [workflowIp, setWorkflowIp] = useState<string>('');
  const [commandOutput, setCommandOutput] = useState<string>('');

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [vmRows, requestRows] = await Promise.all([listMicroVms(), listVerificationRequests(50)]);
      setVms(vmRows);
      setVerificationRequests(requestRows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load workflow data.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  useEffect(() => {
    if (!verificationForm.vm_id && vms.length > 0) {
      const vmId = vms[0].id;
      setVerificationForm((prev) => ({
        ...prev,
        vm_id: vmId,
        worker_id: prev.worker_id || `worker-${vmId}`,
      }));
    }
  }, [verificationForm.vm_id, vms]);

  const fingerprintRows = useMemo(() => vms.slice(0, 12), [vms]);
  const recentVerificationRows = useMemo(() => verificationRequests.slice(0, 12), [verificationRequests]);

  const updateStep = useCallback((key: WorkflowStepKey, updates: Partial<StepState>) => {
    setSteps((current) => current.map((step) => (step.key === key ? { ...step, ...updates } : step)));
  }, []);

  const toggleStep = useCallback((key: WorkflowStepKey) => {
    setSteps((current) =>
      current.map((step) => (step.key === key ? { ...step, enabled: !step.enabled, status: 'idle', message: '' } : step))
    );
  }, []);
  const runWorkflow = useCallback(async () => {
    setIsWorkflowRunning(true);
    setErrorText('');
    setInfoText('');
    setCommandOutput('');
    setWorkflowIp('');
    setWorkflowVmId('');
    setSteps((current) => current.map((step) => ({ ...step, status: 'idle', message: '' })));

    const enabledSteps = steps.filter((step) => step.enabled);
    let currentVmId = workflowForm.vmId.trim();
    let currentIp = '';
    let currentStepKey: WorkflowStepKey | null = null;

    try {
      if (!enabledSteps.length) {
        throw new Error('Enable at least one workflow step.');
      }
      if (!currentVmId && !enabledSteps.some((step) => step.key === 'create')) {
        throw new Error('VM ID is required when Create VM is disabled.');
      }

      for (const step of enabledSteps) {
        currentStepKey = step.key;
        updateStep(step.key, { status: 'running', message: '' });

        if (step.key === 'create') {
          currentVmId = currentVmId || generateVmId();
          await createMicroVm({
            id: currentVmId,
            country: workflowForm.country.trim(),
            ram: workflowForm.ram.trim(),
            cpu: workflowForm.cpu.trim(),
            template_id: workflowForm.templateId.trim(),
          });
          const vm = await waitForVmReady(currentVmId, false);
          currentIp = vm.public_ip || '';
          setWorkflowVmId(vm.id);
          setWorkflowIp(currentIp);
          updateStep(step.key, {
            status: 'done',
            message: currentIp && currentIp.toLowerCase() !== 'pending' ? `Running with ${currentIp}` : 'VM is running.',
          });
          continue;
        }

        if (step.key === 'fingerprint') {
          if (!currentVmId) {
            throw new Error('No VM available for fingerprint sync.');
          }
          const operation = await syncFingerprint(currentVmId);
          await waitForOperationSuccess(operation.id, 120_000);
          updateStep(step.key, { status: 'done', message: 'Fingerprint synced.' });
          continue;
        }

        if (step.key === 'verify') {
          if (!currentVmId) {
            throw new Error('No VM available for verification.');
          }
          const [dns, isolation] = await Promise.all([dnsLeakTest(currentVmId), testIsolation(currentVmId)]);
          const dnsOk = (dns.status || '').toLowerCase() === 'secure';
          const isoOk = (isolation.status || '').toLowerCase() === 'passed';
          if (!dnsOk || !isoOk) {
            throw new Error(
              `Verification failed (dns=${dns.status}, isolation=${isolation.status}${
                isolation.details ? `: ${isolation.details}` : ''
              }).`
            );
          }
          updateStep(step.key, { status: 'done', message: 'DNS and isolation checks passed.' });
          continue;
        }

        if (step.key === 'command') {
          if (!currentVmId) {
            throw new Error('No VM available for terminal command.');
          }
          const command = workflowForm.command.trim() || 'status';
          const response = await terminalCommand(currentVmId, command);
          setCommandOutput(response.output || '');
          updateStep(step.key, { status: 'done', message: `Executed '${command}'.` });
        }
      }

      setInfoText(`Workflow completed for ${currentVmId || 'selected VM'}.`);
      await refreshData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Workflow failed.';
      if (currentStepKey) {
        updateStep(currentStepKey, { status: 'failed', message });
      }
      setErrorText(message);
    } finally {
      setIsWorkflowRunning(false);
    }
  }, [refreshData, steps, updateStep, workflowForm]);

  const handleFingerprintSync = useCallback(
    async (vmId: string) => {
      setBusyFingerprintVm(vmId);
      try {
        const operation = await syncFingerprint(vmId);
        await waitForOperationSuccess(operation.id, 120_000);
        setInfoText(`Fingerprint synced for ${vmId}.`);
        setErrorText('');
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to sync fingerprint for ${vmId}.`;
        setErrorText(message);
      } finally {
        setBusyFingerprintVm('');
      }
    },
    [refreshData]
  );

  const handleCreateVerification = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setCreatingVerification(true);
      try {
        await createVerificationRequest({
          vm_id: verificationForm.vm_id.trim(),
          worker_id: verificationForm.worker_id.trim(),
          verification_type: verificationForm.verification_type,
          status: 'Pending',
          provider: verificationForm.provider.trim(),
          destination: verificationForm.destination.trim(),
        });
        setInfoText(`Verification request created for ${verificationForm.vm_id}.`);
        setErrorText('');
        setVerificationForm((prev) => ({
          ...prev,
          destination: '',
        }));
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create verification request.';
        setErrorText(message);
      } finally {
        setCreatingVerification(false);
      }
    },
    [refreshData, verificationForm]
  );

  const handleRetry = useCallback(
    async (requestId: string) => {
      setRetryingId(requestId);
      try {
        const operation = await retryVerificationRequest(requestId);
        await waitForOperationSuccess(operation.id, 120_000);
        setInfoText(`Retry completed for request ${requestId}.`);
        setErrorText('');
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : `Retry failed for request ${requestId}.`;
        setErrorText(message);
      } finally {
        setRetryingId('');
      }
    },
    [refreshData]
  );
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-800 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-sky-400/80">Workflow builder</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">Run a focused pipeline</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              A reduced workflow runner for the exact chain you asked to keep: create a VM, sync fingerprint, verify
              the environment, and optionally run one command.
            </p>
          </div>
          <button
            onClick={() => void refreshData()}
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white"
          >
            Refresh data
          </button>
        </div>

        {errorText ? (
          <div className="mt-4 rounded-2xl border border-rose-500/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-200">
            {errorText}
          </div>
        ) : null}
        {infoText ? (
          <div className="mt-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
            {infoText}
          </div>
        ) : null}

        <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(320px,0.8fr)]">
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">VM ID</span>
                <div className="flex gap-2">
                  <input
                    value={workflowForm.vmId}
                    onChange={(event) => setWorkflowForm((prev) => ({ ...prev, vmId: event.target.value }))}
                    placeholder="Leave empty to auto-generate on create"
                    className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setWorkflowForm((prev) => ({ ...prev, vmId: generateVmId() }))}
                    className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white"
                  >
                    Generate
                  </button>
                </div>
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Country</span>
                <input
                  list="workflow-country-options"
                  value={workflowForm.country}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, country: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">RAM</span>
                <input
                  value={workflowForm.ram}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, ram: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">CPU</span>
                <input
                  value={workflowForm.cpu}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, cpu: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Template</span>
                <input
                  value={workflowForm.templateId}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, templateId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Command</span>
                <input
                  value={workflowForm.command}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, command: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>
            </div>

            <div className="rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
              <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-lg font-black uppercase tracking-tight text-white">Pipeline steps</h3>
                  <p className="text-sm text-slate-400">Turn steps on or off, then run the sequence.</p>
                </div>
                <button
                  onClick={() => void runWorkflow()}
                  disabled={isWorkflowRunning}
                  className="rounded-full bg-sky-400 px-4 py-2 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isWorkflowRunning ? 'Running' : 'Run workflow'}
                </button>
              </div>

              <div className="space-y-3">
                {steps.map((step) => (
                  <div
                    key={step.key}
                    className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-950/70 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div>
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={step.enabled}
                          onChange={() => toggleStep(step.key)}
                          className="h-4 w-4 rounded border-slate-700 bg-slate-900 text-sky-400"
                        />
                        <span className="text-sm font-semibold text-white">{step.label}</span>
                      </div>
                      <p className="mt-2 pl-7 text-sm text-slate-400">{step.message || 'Idle'}</p>
                    </div>
                    <span
                      className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                        step.status === 'done'
                          ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                          : step.status === 'running'
                          ? 'border-sky-500/30 bg-sky-500/10 text-sky-300'
                          : step.status === 'failed'
                          ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                          : 'border-slate-700 bg-slate-900 text-slate-400'
                      }`}
                    >
                      {step.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {commandOutput ? (
              <div className="rounded-[24px] border border-slate-800 bg-slate-950/80 p-5">
                <h3 className="text-sm font-black uppercase tracking-[0.22em] text-slate-400">Command output</h3>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-900 p-4 font-mono text-xs text-slate-200">
                  {commandOutput}
                </pre>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-lg font-black uppercase tracking-tight text-white">Current workflow target</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">VM</div>
                <div className="mt-2 font-mono text-base text-white">{workflowVmId || workflowForm.vmId || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Public IP</div>
                <div className="mt-2 font-mono text-base text-white">{workflowIp || 'Pending'}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">Loaded VMs</div>
                <div className="mt-2 text-base font-semibold text-white">{isLoading ? 'Loading...' : vms.length}</div>
              </div>
            </div>
          </aside>
        </div>

        <datalist id="workflow-country-options">
          {COUNTRY_OPTIONS.map((country) => (
            <option key={country} value={country} />
          ))}
        </datalist>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="rounded-[28px] border border-slate-800 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-400/80">Fingerprint</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">Sync by VM</h2>
            </div>
            <div className="text-sm text-slate-400">Use this only for the VMs you need to align.</div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left">
                <thead className="bg-slate-900/80 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-4 py-4 font-semibold">VM</th>
                    <th className="px-4 py-4 font-semibold">IP</th>
                    <th className="px-4 py-4 font-semibold">State</th>
                    <th className="px-4 py-4 font-semibold">Fingerprint</th>
                    <th className="px-4 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={5}>
                        Loading VMs...
                      </td>
                    </tr>
                  ) : fingerprintRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={5}>
                        No VMs available.
                      </td>
                    </tr>
                  ) : (
                    fingerprintRows.map((vm) => (
                      <tr key={vm.id}>
                        <td className="px-4 py-4">
                          <div className="font-mono text-sm font-bold text-white">{vm.id}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{vm.country}</div>
                        </td>
                        <td className="px-4 py-4 font-mono text-sm text-slate-200">{vm.public_ip || 'Pending'}</td>
                        <td className="px-4 py-4 text-sm text-slate-300">{vm.status}</td>
                        <td className="px-4 py-4 text-sm text-slate-300">{vm.verification_status || 'Unknown'}</td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => void handleFingerprintSync(vm.id)}
                            disabled={busyFingerprintVm === vm.id}
                            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {busyFingerprintVm === vm.id ? 'Syncing' : 'Sync'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-800 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="border-b border-slate-800 pb-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-300/80">SMS and QR</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">Verification requests</h2>
            <p className="mt-2 text-sm text-slate-400">
              This section only keeps the SMS and QR flows. CAPTCHA widgets and related analytics are removed from the
              dashboard.
            </p>
          </div>

          <form onSubmit={handleCreateVerification} className="mt-5 grid gap-4 rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">VM ID</span>
                <input
                  list="verification-vm-options"
                  value={verificationForm.vm_id}
                  onChange={(event) => {
                    const vmId = event.target.value;
                    setVerificationForm((prev) => ({
                      ...prev,
                      vm_id: vmId,
                      worker_id: prev.worker_id || `worker-${vmId}`,
                    }));
                  }}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Worker ID</span>
                <input
                  value={verificationForm.worker_id}
                  onChange={(event) => setVerificationForm((prev) => ({ ...prev, worker_id: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Type</span>
                <select
                  value={verificationForm.verification_type}
                  onChange={(event) =>
                    setVerificationForm((prev) => ({
                      ...prev,
                      verification_type: event.target.value as 'SMS' | 'QR',
                    }))
                  }
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
                >
                  <option value="SMS">SMS</option>
                  <option value="QR">QR</option>
                </select>
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Provider</span>
                <input
                  value={verificationForm.provider}
                  onChange={(event) => setVerificationForm((prev) => ({ ...prev, provider: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-200">Destination</span>
              <input
                value={verificationForm.destination}
                onChange={(event) => setVerificationForm((prev) => ({ ...prev, destination: event.target.value }))}
                placeholder="Phone number or QR session reference"
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
              />
            </label>

            <button
              type="submit"
              disabled={creatingVerification}
              className="rounded-full bg-amber-300 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingVerification ? 'Creating' : 'Create request'}
            </button>
          </form>

          <datalist id="verification-vm-options">
            {vms.map((vm) => (
              <option key={vm.id} value={vm.id} />
            ))}
          </datalist>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left">
                <thead className="bg-slate-900/80 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-4 py-4 font-semibold">Request</th>
                    <th className="px-4 py-4 font-semibold">VM</th>
                    <th className="px-4 py-4 font-semibold">Type</th>
                    <th className="px-4 py-4 font-semibold">Status</th>
                    <th className="px-4 py-4 font-semibold">Destination</th>
                    <th className="px-4 py-4 font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={6}>
                        Loading requests...
                      </td>
                    </tr>
                  ) : recentVerificationRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={6}>
                        No SMS or QR requests yet.
                      </td>
                    </tr>
                  ) : (
                    recentVerificationRows.map((request) => (
                      <tr key={request.id}>
                        <td className="px-4 py-4">
                          <div className="font-mono text-sm font-bold text-white">{request.id}</div>
                          <div className="mt-1 text-xs text-slate-500">{request.provider}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">
                          {request.vm_id}
                          <div className="mt-1 text-xs text-slate-500">{request.worker_id}</div>
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">{request.verification_type}</td>
                        <td className="px-4 py-4">
                          <div className="text-sm text-slate-200">{request.status}</div>
                          {request.last_error ? <div className="mt-1 text-xs text-rose-300">{request.last_error}</div> : null}
                        </td>
                        <td className="px-4 py-4 text-sm text-slate-300">
                          {request.destination}
                          <div className="mt-1 text-xs text-slate-500">{formatDate(request.updated_at)}</div>
                        </td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => void handleRetry(request.id)}
                            disabled={retryingId === request.id}
                            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {retryingId === request.id ? 'Retrying' : 'Retry'}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
};

export default AutomationConsole;
