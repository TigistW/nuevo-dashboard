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
import { useTranslation } from '../App';

type WorkflowStepKey = 'create' | 'fingerprint' | 'verify' | 'command';
type StepStatus = 'idle' | 'running' | 'done' | 'failed';

type StepState = {
  key: WorkflowStepKey;
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

const STEP_DEFINITIONS: Array<{ key: WorkflowStepKey; enabled: boolean }> = [
  { key: 'create', enabled: true },
  { key: 'fingerprint', enabled: true },
  { key: 'verify', enabled: true },
  { key: 'command', enabled: false },
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
    enabled: step.enabled,
    status: 'idle',
    message: '',
  }));
}

async function waitForOperationSuccess(
  operationId: string,
  messages: {
    operationFailed: (operationId: string) => string;
    operationTimedOut: (operationId: string) => string;
  },
  timeoutMs = 180_000
): Promise<ApiOperationStatus> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const operation = await getOperation(operationId);
    const status = (operation.status || '').toLowerCase();
    if (status === 'succeeded') {
      return operation;
    }
    if (status === 'failed') {
      throw new Error(operation.message || messages.operationFailed(operationId));
    }
    await delay(1000);
  }
  throw new Error(messages.operationTimedOut(operationId));
}

async function waitForVmReady(
  vmId: string,
  requirePublicIp: boolean,
  messages: {
    vmTerminalState: (vmId: string, status: string) => string;
    vmTimedOut: (vmId: string) => string;
  }
): Promise<ApiMicroVm> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 180_000) {
    const vms = await listMicroVms();
    const vm = vms.find((row) => row.id === vmId);
    if (vm) {
      const status = (vm.status || '').toLowerCase();
      const ip = (vm.public_ip || '').trim().toLowerCase();
      if (status.includes('error') || status.includes('deleted')) {
        throw new Error(messages.vmTerminalState(vmId, vm.status));
      }
      if (status.includes('running') && (!requirePublicIp || (ip && ip !== 'pending'))) {
        return vm;
      }
    }
    await delay(1000);
  }
  throw new Error(messages.vmTimedOut(vmId));
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
  const { language } = useTranslation();
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

  const copy = useMemo(
    () =>
      language === 'en'
        ? {
            errors: {
              loadWorkflowData: 'Failed to load workflow data.',
              enableOneStep: 'Enable at least one workflow step.',
              vmIdRequiredWhenCreateDisabled: 'VM ID is required when Create VM is disabled.',
              noVmForFingerprint: 'No VM available for fingerprint sync.',
              noVmForVerification: 'No VM available for verification.',
              noVmForCommand: 'No VM available for terminal command.',
              operationFailed: (operationId: string) => `Operation '${operationId}' failed.`,
              operationTimedOut: (operationId: string) => `Timed out waiting for operation '${operationId}'.`,
              vmTerminalState: (vmId: string, status: string) => `VM '${vmId}' entered terminal state '${status}'.`,
              vmTimedOut: (vmId: string) => `Timed out waiting for VM '${vmId}'.`,
              workflowFailed: 'Workflow failed.',
              fingerprintSyncFailed: (vmId: string) => `Failed to sync fingerprint for ${vmId}.`,
              verificationRequestFailed: 'Failed to create verification request.',
              retryFailed: (requestId: string) => `Retry failed for request ${requestId}.`,
              verificationFailed: (dnsStatus: string, isolationStatus: string, isolationDetails?: string) =>
                `Verification failed (dns=${dnsStatus}, isolation=${isolationStatus}${
                  isolationDetails ? `: ${isolationDetails}` : ''
                }).`,
            },
            info: {
              workflowCompleted: (vmId: string) => `Workflow completed for ${vmId || 'selected VM'}.`,
              runningWithIp: (ip: string) => `Running with ${ip}`,
              vmRunning: 'VM is running.',
              fingerprintSynced: 'Fingerprint synced.',
              dnsAndIsolationPassed: 'DNS and isolation checks passed.',
              commandExecuted: (command: string) => `Executed '${command}'.`,
              fingerprintSyncedForVm: (vmId: string) => `Fingerprint synced for ${vmId}.`,
              verificationCreated: (vmId: string) => `Verification request created for ${vmId}.`,
              retryCompleted: (requestId: string) => `Retry completed for request ${requestId}.`,
            },
            stepLabels: {
              create: 'Create VM',
              fingerprint: 'Sync fingerprint',
              verify: 'Run verification checks',
              command: 'Run terminal command',
            } as Record<WorkflowStepKey, string>,
            stepStatuses: {
              idle: 'Idle',
              running: 'Running',
              done: 'Done',
              failed: 'Failed',
            } as Record<StepStatus, string>,
            workflow: {
              kicker: 'Workflow builder',
              title: 'Run a focused pipeline',
              description:
                'A reduced workflow runner for the exact chain you asked to keep: create a VM, sync fingerprint, verify the environment, and optionally run one command.',
              refresh: 'Refresh data',
              vmId: 'VM ID',
              vmIdPlaceholder: 'Leave empty to auto-generate on create',
              generate: 'Generate',
              country: 'Country',
              ram: 'RAM',
              cpu: 'CPU',
              template: 'Template',
              command: 'Command',
              stepsTitle: 'Pipeline steps',
              stepsDescription: 'Turn steps on or off, then run the sequence.',
              runWorkflow: 'Run workflow',
              runningWorkflow: 'Running',
              commandOutput: 'Command output',
              targetTitle: 'Current workflow target',
              targetVm: 'VM',
              targetPublicIp: 'Public IP',
              targetLoadedVms: 'Loaded VMs',
              loading: 'Loading...',
              pending: 'Pending',
            },
            fingerprint: {
              kicker: 'Fingerprint',
              title: 'Sync by VM',
              description: 'Use this only for the VMs you need to align.',
              vm: 'VM',
              ip: 'IP',
              state: 'State',
              fingerprint: 'Fingerprint',
              action: 'Action',
              loading: 'Loading VMs...',
              empty: 'No VMs available.',
              sync: 'Sync',
              syncing: 'Syncing',
            },
            verification: {
              kicker: 'SMS and QR',
              title: 'Verification requests',
              description:
                'This section only keeps the SMS and QR flows. CAPTCHA widgets and related analytics are removed from the dashboard.',
              vmId: 'VM ID',
              workerId: 'Worker ID',
              type: 'Type',
              provider: 'Provider',
              destination: 'Destination',
              destinationPlaceholder: 'Phone number or QR session reference',
              createRequest: 'Create request',
              creating: 'Creating',
              request: 'Request',
              vm: 'VM',
              status: 'Status',
              action: 'Action',
              loading: 'Loading requests...',
              empty: 'No SMS or QR requests yet.',
              retry: 'Retry',
              retrying: 'Retrying',
            },
            states: {
              pending: 'Pending',
              unknown: 'Unknown',
              secure: 'Secure',
              warning: 'Warning',
              verified: 'Verified',
              failed: 'Failed',
              creating: 'Creating',
              running: 'Running',
              error: 'Error',
              stopping: 'Stopping',
              stopped: 'Stopped',
              restarting: 'Restarting',
              deleting: 'Deleting',
              deleted: 'Deleted',
              passed: 'Passed',
              completed: 'Completed',
              succeeded: 'Succeeded',
              processing: 'Processing',
              requested: 'Requested',
              in_progress: 'In progress',
            } as Record<string, string>,
          }
        : {
            errors: {
              loadWorkflowData: 'No se pudieron cargar los datos del flujo.',
              enableOneStep: 'Activa al menos un paso del flujo.',
              vmIdRequiredWhenCreateDisabled: 'El ID de VM es obligatorio cuando Crear VM esta desactivado.',
              noVmForFingerprint: 'No hay una VM disponible para sincronizar la huella.',
              noVmForVerification: 'No hay una VM disponible para verificacion.',
              noVmForCommand: 'No hay una VM disponible para ejecutar el comando.',
              operationFailed: (operationId: string) => `La operacion '${operationId}' fallo.`,
              operationTimedOut: (operationId: string) => `Se agoto el tiempo de espera para la operacion '${operationId}'.`,
              vmTerminalState: (vmId: string, status: string) => `La VM '${vmId}' entro en el estado terminal '${status}'.`,
              vmTimedOut: (vmId: string) => `Se agoto el tiempo de espera para la VM '${vmId}'.`,
              workflowFailed: 'El flujo fallo.',
              fingerprintSyncFailed: (vmId: string) => `No se pudo sincronizar la huella de ${vmId}.`,
              verificationRequestFailed: 'No se pudo crear la solicitud de verificacion.',
              retryFailed: (requestId: string) => `No se pudo reintentar la solicitud ${requestId}.`,
              verificationFailed: (dnsStatus: string, isolationStatus: string, isolationDetails?: string) =>
                `La verificacion fallo (dns=${dnsStatus}, aislamiento=${isolationStatus}${
                  isolationDetails ? `: ${isolationDetails}` : ''
                }).`,
            },
            info: {
              workflowCompleted: (vmId: string) => `Flujo completado para ${vmId || 'la VM seleccionada'}.`,
              runningWithIp: (ip: string) => `En ejecucion con ${ip}`,
              vmRunning: 'La VM esta en ejecucion.',
              fingerprintSynced: 'Huella sincronizada.',
              dnsAndIsolationPassed: 'Las comprobaciones de DNS y aislamiento pasaron.',
              commandExecuted: (command: string) => `Se ejecuto '${command}'.`,
              fingerprintSyncedForVm: (vmId: string) => `Huella sincronizada para ${vmId}.`,
              verificationCreated: (vmId: string) => `Solicitud de verificacion creada para ${vmId}.`,
              retryCompleted: (requestId: string) => `Reintento completado para la solicitud ${requestId}.`,
            },
            stepLabels: {
              create: 'Crear VM',
              fingerprint: 'Sincronizar huella',
              verify: 'Ejecutar comprobaciones de verificacion',
              command: 'Ejecutar comando de terminal',
            } as Record<WorkflowStepKey, string>,
            stepStatuses: {
              idle: 'Inactivo',
              running: 'En curso',
              done: 'Hecho',
              failed: 'Fallido',
            } as Record<StepStatus, string>,
            workflow: {
              kicker: 'Constructor de flujo',
              title: 'Ejecutar una canalizacion enfocada',
              description:
                'Un ejecutor reducido para la cadena que pediste mantener: crear una VM, sincronizar huella, verificar el entorno y, si hace falta, ejecutar un comando.',
              refresh: 'Actualizar datos',
              vmId: 'ID de VM',
              vmIdPlaceholder: 'Dejalo vacio para generarlo al crear',
              generate: 'Generar',
              country: 'Pais',
              ram: 'RAM',
              cpu: 'CPU',
              template: 'Plantilla',
              command: 'Comando',
              stepsTitle: 'Pasos de la canalizacion',
              stepsDescription: 'Activa o desactiva pasos y luego ejecuta la secuencia.',
              runWorkflow: 'Ejecutar flujo',
              runningWorkflow: 'Ejecutando',
              commandOutput: 'Salida del comando',
              targetTitle: 'Objetivo actual del flujo',
              targetVm: 'VM',
              targetPublicIp: 'IP publica',
              targetLoadedVms: 'VMs cargadas',
              loading: 'Cargando...',
              pending: 'Pendiente',
            },
            fingerprint: {
              kicker: 'Huella',
              title: 'Sincronizar por VM',
              description: 'Usa esto solo para las VMs que necesites alinear.',
              vm: 'VM',
              ip: 'IP',
              state: 'Estado',
              fingerprint: 'Huella',
              action: 'Accion',
              loading: 'Cargando VMs...',
              empty: 'No hay VMs disponibles.',
              sync: 'Sincronizar',
              syncing: 'Sincronizando',
            },
            verification: {
              kicker: 'SMS y QR',
              title: 'Solicitudes de verificacion',
              description:
                'Esta seccion conserva solo los flujos de SMS y QR. Los widgets de CAPTCHA y sus analiticas fueron retirados del panel.',
              vmId: 'ID de VM',
              workerId: 'ID del worker',
              type: 'Tipo',
              provider: 'Proveedor',
              destination: 'Destino',
              destinationPlaceholder: 'Numero telefonico o referencia de sesion QR',
              createRequest: 'Crear solicitud',
              creating: 'Creando',
              request: 'Solicitud',
              vm: 'VM',
              status: 'Estado',
              action: 'Accion',
              loading: 'Cargando solicitudes...',
              empty: 'Todavia no hay solicitudes de SMS o QR.',
              retry: 'Reintentar',
              retrying: 'Reintentando',
            },
            states: {
              pending: 'Pendiente',
              unknown: 'Desconocido',
              secure: 'Seguro',
              warning: 'Advertencia',
              verified: 'Verificado',
              failed: 'Fallido',
              creating: 'Creando',
              running: 'En ejecucion',
              error: 'Error',
              stopping: 'Deteniendo',
              stopped: 'Detenida',
              restarting: 'Reiniciando',
              deleting: 'Eliminando',
              deleted: 'Eliminada',
              passed: 'Aprobado',
              completed: 'Completado',
              succeeded: 'Exito',
              processing: 'Procesando',
              requested: 'Solicitado',
              in_progress: 'En curso',
            } as Record<string, string>,
          },
    [language]
  );

  const translateCommonState = useCallback(
    (value?: string | null) => {
      const key = String(value || '').trim().toLowerCase();
      return copy.states[key] || value || copy.states.unknown;
    },
    [copy]
  );

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [vmRows, requestRows] = await Promise.all([listMicroVms(), listVerificationRequests(50)]);
      setVms(vmRows);
      setVerificationRequests(requestRows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.errors.loadWorkflowData;
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [copy.errors.loadWorkflowData]);

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
        throw new Error(copy.errors.enableOneStep);
      }
      if (!currentVmId && !enabledSteps.some((step) => step.key === 'create')) {
        throw new Error(copy.errors.vmIdRequiredWhenCreateDisabled);
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
          const vm = await waitForVmReady(currentVmId, false, {
            vmTerminalState: copy.errors.vmTerminalState,
            vmTimedOut: copy.errors.vmTimedOut,
          });
          currentIp = vm.public_ip || '';
          setWorkflowVmId(vm.id);
          setWorkflowIp(currentIp);
          updateStep(step.key, {
            status: 'done',
            message:
              currentIp && currentIp.toLowerCase() !== 'pending'
                ? copy.info.runningWithIp(currentIp)
                : copy.info.vmRunning,
          });
          continue;
        }

        if (step.key === 'fingerprint') {
          if (!currentVmId) {
            throw new Error(copy.errors.noVmForFingerprint);
          }
          const operation = await syncFingerprint(currentVmId);
          await waitForOperationSuccess(
            operation.id,
            {
              operationFailed: copy.errors.operationFailed,
              operationTimedOut: copy.errors.operationTimedOut,
            },
            120_000
          );
          updateStep(step.key, { status: 'done', message: copy.info.fingerprintSynced });
          continue;
        }

        if (step.key === 'verify') {
          if (!currentVmId) {
            throw new Error(copy.errors.noVmForVerification);
          }
          const [dns, isolation] = await Promise.all([dnsLeakTest(currentVmId), testIsolation(currentVmId)]);
          const dnsOk = (dns.status || '').toLowerCase() === 'secure';
          const isoOk = (isolation.status || '').toLowerCase() === 'passed';
          if (!dnsOk || !isoOk) {
            throw new Error(copy.errors.verificationFailed(dns.status, isolation.status, isolation.details));
          }
          updateStep(step.key, { status: 'done', message: copy.info.dnsAndIsolationPassed });
          continue;
        }

        if (step.key === 'command') {
          if (!currentVmId) {
            throw new Error(copy.errors.noVmForCommand);
          }
          const command = workflowForm.command.trim() || 'status';
          const response = await terminalCommand(currentVmId, command);
          setCommandOutput(response.output || '');
          updateStep(step.key, { status: 'done', message: copy.info.commandExecuted(command) });
        }
      }

      setInfoText(copy.info.workflowCompleted(currentVmId));
      await refreshData();
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.errors.workflowFailed;
      if (currentStepKey) {
        updateStep(currentStepKey, { status: 'failed', message });
      }
      setErrorText(message);
    } finally {
      setIsWorkflowRunning(false);
    }
  }, [copy, refreshData, steps, updateStep, workflowForm]);

  const handleFingerprintSync = useCallback(
    async (vmId: string) => {
      setBusyFingerprintVm(vmId);
      try {
        const operation = await syncFingerprint(vmId);
        await waitForOperationSuccess(
          operation.id,
          {
            operationFailed: copy.errors.operationFailed,
            operationTimedOut: copy.errors.operationTimedOut,
          },
          120_000
        );
        setInfoText(copy.info.fingerprintSyncedForVm(vmId));
        setErrorText('');
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : copy.errors.fingerprintSyncFailed(vmId);
        setErrorText(message);
      } finally {
        setBusyFingerprintVm('');
      }
    },
    [copy, refreshData]
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
        setInfoText(copy.info.verificationCreated(verificationForm.vm_id));
        setErrorText('');
        setVerificationForm((prev) => ({
          ...prev,
          destination: '',
        }));
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : copy.errors.verificationRequestFailed;
        setErrorText(message);
      } finally {
        setCreatingVerification(false);
      }
    },
    [copy, refreshData, verificationForm]
  );

  const handleRetry = useCallback(
    async (requestId: string) => {
      setRetryingId(requestId);
      try {
        const operation = await retryVerificationRequest(requestId);
        await waitForOperationSuccess(
          operation.id,
          {
            operationFailed: copy.errors.operationFailed,
            operationTimedOut: copy.errors.operationTimedOut,
          },
          120_000
        );
        setInfoText(copy.info.retryCompleted(requestId));
        setErrorText('');
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : copy.errors.retryFailed(requestId);
        setErrorText(message);
      } finally {
        setRetryingId('');
      }
    },
    [copy, refreshData]
  );
  return (
    <div className="space-y-6">
      <section className="rounded-[28px] border border-slate-800 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
        <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-sky-400/80">{copy.workflow.kicker}</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">{copy.workflow.title}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
              {copy.workflow.description}
            </p>
          </div>
          <button
            onClick={() => void refreshData()}
            className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white"
          >
            {copy.workflow.refresh}
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
                <span className="font-semibold text-slate-200">{copy.workflow.vmId}</span>
                <div className="flex gap-2">
                  <input
                    value={workflowForm.vmId}
                    onChange={(event) => setWorkflowForm((prev) => ({ ...prev, vmId: event.target.value }))}
                    placeholder={copy.workflow.vmIdPlaceholder}
                    className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                  />
                  <button
                    type="button"
                    onClick={() => setWorkflowForm((prev) => ({ ...prev, vmId: generateVmId() }))}
                    className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white"
                  >
                    {copy.workflow.generate}
                  </button>
                </div>
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.workflow.country}</span>
                <input
                  list="workflow-country-options"
                  value={workflowForm.country}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, country: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.workflow.ram}</span>
                <input
                  value={workflowForm.ram}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, ram: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.workflow.cpu}</span>
                <input
                  value={workflowForm.cpu}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, cpu: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.workflow.template}</span>
                <input
                  value={workflowForm.templateId}
                  onChange={(event) => setWorkflowForm((prev) => ({ ...prev, templateId: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-sky-500/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.workflow.command}</span>
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
                  <h3 className="text-lg font-black uppercase tracking-tight text-white">{copy.workflow.stepsTitle}</h3>
                  <p className="text-sm text-slate-400">{copy.workflow.stepsDescription}</p>
                </div>
                <button
                  onClick={() => void runWorkflow()}
                  disabled={isWorkflowRunning}
                  className="rounded-full bg-sky-400 px-4 py-2 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isWorkflowRunning ? copy.workflow.runningWorkflow : copy.workflow.runWorkflow}
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
                        <span className="text-sm font-semibold text-white">{copy.stepLabels[step.key]}</span>
                      </div>
                      <p className="mt-2 pl-7 text-sm text-slate-400">{step.message || copy.stepStatuses.idle}</p>
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
                      {copy.stepStatuses[step.status]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {commandOutput ? (
              <div className="rounded-[24px] border border-slate-800 bg-slate-950/80 p-5">
                <h3 className="text-sm font-black uppercase tracking-[0.22em] text-slate-400">{copy.workflow.commandOutput}</h3>
                <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words rounded-2xl bg-slate-900 p-4 font-mono text-xs text-slate-200">
                  {commandOutput}
                </pre>
              </div>
            ) : null}
          </div>

          <aside className="space-y-4 rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
            <h3 className="text-lg font-black uppercase tracking-tight text-white">{copy.workflow.targetTitle}</h3>
            <div className="space-y-3 text-sm text-slate-300">
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{copy.workflow.targetVm}</div>
                <div className="mt-2 font-mono text-base text-white">{workflowVmId || workflowForm.vmId || '-'}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{copy.workflow.targetPublicIp}</div>
                <div className="mt-2 font-mono text-base text-white">{workflowIp || copy.workflow.pending}</div>
              </div>
              <div className="rounded-2xl border border-slate-800 bg-slate-950/70 p-4">
                <div className="text-[11px] font-bold uppercase tracking-[0.22em] text-slate-500">{copy.workflow.targetLoadedVms}</div>
                <div className="mt-2 text-base font-semibold text-white">{isLoading ? copy.workflow.loading : vms.length}</div>
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
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-400/80">{copy.fingerprint.kicker}</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">{copy.fingerprint.title}</h2>
            </div>
            <div className="text-sm text-slate-400">{copy.fingerprint.description}</div>
          </div>

          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left">
                <thead className="bg-slate-900/80 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-4 py-4 font-semibold">{copy.fingerprint.vm}</th>
                    <th className="px-4 py-4 font-semibold">{copy.fingerprint.ip}</th>
                    <th className="px-4 py-4 font-semibold">{copy.fingerprint.state}</th>
                    <th className="px-4 py-4 font-semibold">{copy.fingerprint.fingerprint}</th>
                    <th className="px-4 py-4 font-semibold">{copy.fingerprint.action}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={5}>
                        {copy.fingerprint.loading}
                      </td>
                    </tr>
                  ) : fingerprintRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={5}>
                        {copy.fingerprint.empty}
                      </td>
                    </tr>
                  ) : (
                    fingerprintRows.map((vm) => (
                      <tr key={vm.id}>
                        <td className="px-4 py-4">
                          <div className="font-mono text-sm font-bold text-white">{vm.id}</div>
                          <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{vm.country}</div>
                        </td>
                        <td className="px-4 py-4 font-mono text-sm text-slate-200">{vm.public_ip || copy.workflow.pending}</td>
                        <td className="px-4 py-4 text-sm text-slate-300">{translateCommonState(vm.status)}</td>
                        <td className="px-4 py-4 text-sm text-slate-300">{translateCommonState(vm.verification_status)}</td>
                        <td className="px-4 py-4">
                          <button
                            onClick={() => void handleFingerprintSync(vm.id)}
                            disabled={busyFingerprintVm === vm.id}
                            className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            {busyFingerprintVm === vm.id ? copy.fingerprint.syncing : copy.fingerprint.sync}
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
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-amber-300/80">{copy.verification.kicker}</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">{copy.verification.title}</h2>
            <p className="mt-2 text-sm text-slate-400">
              {copy.verification.description}
            </p>
          </div>

          <form onSubmit={handleCreateVerification} className="mt-5 grid gap-4 rounded-[24px] border border-slate-800 bg-slate-900/60 p-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.verification.vmId}</span>
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
                <span className="font-semibold text-slate-200">{copy.verification.workerId}</span>
                <input
                  value={verificationForm.worker_id}
                  onChange={(event) => setVerificationForm((prev) => ({ ...prev, worker_id: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
                />
              </label>

              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.verification.type}</span>
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
                <span className="font-semibold text-slate-200">{copy.verification.provider}</span>
                <input
                  value={verificationForm.provider}
                  onChange={(event) => setVerificationForm((prev) => ({ ...prev, provider: event.target.value }))}
                  className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
                />
              </label>
            </div>

            <label className="space-y-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-200">{copy.verification.destination}</span>
              <input
                value={verificationForm.destination}
                onChange={(event) => setVerificationForm((prev) => ({ ...prev, destination: event.target.value }))}
                placeholder={copy.verification.destinationPlaceholder}
                className="w-full rounded-2xl border border-slate-800 bg-slate-950 px-4 py-3 text-sm text-white outline-none transition focus:border-amber-400/40"
              />
            </label>

            <button
              type="submit"
              disabled={creatingVerification}
              className="rounded-full bg-amber-300 px-4 py-3 text-sm font-black uppercase tracking-[0.16em] text-slate-950 transition hover:bg-amber-200 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {creatingVerification ? copy.verification.creating : copy.verification.createRequest}
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
                    <th className="px-4 py-4 font-semibold">{copy.verification.request}</th>
                    <th className="px-4 py-4 font-semibold">{copy.verification.vm}</th>
                    <th className="px-4 py-4 font-semibold">{copy.verification.type}</th>
                    <th className="px-4 py-4 font-semibold">{copy.verification.status}</th>
                    <th className="px-4 py-4 font-semibold">{copy.verification.destination}</th>
                    <th className="px-4 py-4 font-semibold">{copy.verification.action}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={6}>
                        {copy.verification.loading}
                      </td>
                    </tr>
                  ) : recentVerificationRows.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={6}>
                        {copy.verification.empty}
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
                          <div className="text-sm text-slate-200">{translateCommonState(request.status)}</div>
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
                            {retryingId === request.id ? copy.verification.retrying : copy.verification.retry}
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
