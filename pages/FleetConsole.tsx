import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiMicroVm,
  createMicroVm,
  deleteMicroVm,
  listMicroVms,
  restartMicroVm,
  stopMicroVm,
} from '../services/backendApi';
import { useTranslation } from '../App';

type CreateVmForm = {
  id: string;
  country: string;
  ram: string;
  cpu: string;
  template_id: string;
};

const COUNTRY_OPTIONS = ['us', 'de', 'ca', 'es', 'fr', 'uk', 'jp', 'sg'];

const DEFAULT_FORM: CreateVmForm = {
  id: '',
  country: 'us',
  ram: '256MB',
  cpu: '1',
  template_id: 't-001',
};

function generateVmId(): string {
  const timePart = Date.now().toString(36);
  const randomPart = Math.random().toString(36).slice(2, 6);
  return `vm-${`${timePart}${randomPart}`.slice(-8)}`;
}

const FleetConsole: React.FC = () => {
  const { language } = useTranslation();
  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [form, setForm] = useState<CreateVmForm>({ ...DEFAULT_FORM, id: generateVmId() });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [busyVmId, setBusyVmId] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const copy = useMemo(
    () =>
      language === 'en'
        ? {
            loadFailed: 'Failed to load VMs.',
            createQueued: (vmId: string) => `VM '${vmId}' queued for creation.`,
            createFailed: 'Failed to create VM.',
            actionRequested: {
              stop: (vmId: string) => `Stop requested for ${vmId}.`,
              restart: (vmId: string) => `Restart requested for ${vmId}.`,
              delete: (vmId: string) => `Delete requested for ${vmId}.`,
            },
            actionFailed: {
              stop: 'Failed to stop VM.',
              restart: 'Failed to restart VM.',
              delete: 'Failed to delete VM.',
            },
            headerKicker: 'Create VM',
            headerTitle: 'New instance',
            headerDescription:
              'One place to queue a VM and immediately track its state and IP once the backend finishes provisioning.',
            labels: {
              vmId: 'VM ID',
              generate: 'Generate',
              country: 'Country',
              template: 'Template',
              ram: 'RAM',
              cpu: 'CPU',
              createVm: 'Create VM',
              creating: 'Creating',
              fleetKicker: 'Fleet status',
              fleetTitle: 'VM list',
              refreshList: 'Refresh list',
              vm: 'VM',
              state: 'State',
              publicIp: 'Public IP',
              fingerprint: 'Fingerprint',
              actions: 'Actions',
              loadingVms: 'Loading VMs...',
              noVms: 'No VMs yet.',
              uptime: 'Uptime',
              pending: 'Pending',
              unknown: 'Unknown',
              noExitNode: 'No exit node yet',
              stop: 'Stop',
              restart: 'Restart',
              delete: 'Delete',
            },
            countsText: (total: number, running: number, attention: number) =>
              `Total ${total}. Running ${running}. Needs attention ${attention}.`,
            vmStatus: {
              creating: 'Creating',
              running: 'Running',
              error: 'Error',
              stopping: 'Stopping',
              stopped: 'Stopped',
              restarting: 'Restarting',
              deleting: 'Deleting',
              deleted: 'Deleted',
            } as Record<string, string>,
            verificationStatus: {
              secure: 'Secure',
              warning: 'Warning',
              verified: 'Verified',
              pending: 'Pending',
              failed: 'Failed',
            } as Record<string, string>,
          }
        : {
            loadFailed: 'No se pudieron cargar las VMs.',
            createQueued: (vmId: string) => `La VM '${vmId}' quedo en cola para creacion.`,
            createFailed: 'No se pudo crear la VM.',
            actionRequested: {
              stop: (vmId: string) => `Se solicito detener ${vmId}.`,
              restart: (vmId: string) => `Se solicito reiniciar ${vmId}.`,
              delete: (vmId: string) => `Se solicito eliminar ${vmId}.`,
            },
            actionFailed: {
              stop: 'No se pudo detener la VM.',
              restart: 'No se pudo reiniciar la VM.',
              delete: 'No se pudo eliminar la VM.',
            },
            headerKicker: 'Crear VM',
            headerTitle: 'Nueva instancia',
            headerDescription:
              'Un solo lugar para poner una VM en cola y seguir de inmediato su estado e IP cuando el backend termine el aprovisionamiento.',
            labels: {
              vmId: 'ID de VM',
              generate: 'Generar',
              country: 'Pais',
              template: 'Plantilla',
              ram: 'RAM',
              cpu: 'CPU',
              createVm: 'Crear VM',
              creating: 'Creando',
              fleetKicker: 'Estado del lote',
              fleetTitle: 'Lista de VMs',
              refreshList: 'Actualizar lista',
              vm: 'VM',
              state: 'Estado',
              publicIp: 'IP publica',
              fingerprint: 'Huella',
              actions: 'Acciones',
              loadingVms: 'Cargando VMs...',
              noVms: 'Todavia no hay VMs.',
              uptime: 'Tiempo activo',
              pending: 'Pendiente',
              unknown: 'Desconocido',
              noExitNode: 'Todavia sin nodo de salida',
              stop: 'Detener',
              restart: 'Reiniciar',
              delete: 'Eliminar',
            },
            countsText: (total: number, running: number, attention: number) =>
              `Total ${total}. En ejecucion ${running}. Requieren atencion ${attention}.`,
            vmStatus: {
              creating: 'Creando',
              running: 'En ejecucion',
              error: 'Error',
              stopping: 'Deteniendo',
              stopped: 'Detenida',
              restarting: 'Reiniciando',
              deleting: 'Eliminando',
              deleted: 'Eliminada',
            } as Record<string, string>,
            verificationStatus: {
              secure: 'Segura',
              warning: 'Advertencia',
              verified: 'Verificada',
              pending: 'Pendiente',
              failed: 'Fallida',
            } as Record<string, string>,
          },
    [language]
  );

  const translateVmStatus = useCallback(
    (value?: string | null) => {
      const key = String(value || '').trim().toLowerCase();
      return copy.vmStatus[key] || value || copy.labels.unknown;
    },
    [copy]
  );

  const translateVerificationStatus = useCallback(
    (value?: string | null) => {
      const key = String(value || '').trim().toLowerCase();
      return copy.verificationStatus[key] || value || copy.labels.unknown;
    },
    [copy]
  );

  const refreshVms = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listMicroVms();
      setVms(rows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : copy.loadFailed;
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [copy.loadFailed]);

  useEffect(() => {
    void refreshVms();
  }, [refreshVms]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refreshVms();
    }, 8000);
    return () => window.clearInterval(timer);
  }, [refreshVms]);

  const counts = useMemo(() => {
    const total = vms.length;
    const running = vms.filter((vm) => (vm.status || '').toLowerCase().includes('running')).length;
    const attention = vms.filter((vm) => {
      const status = (vm.status || '').toLowerCase();
      const verification = (vm.verification_status || '').toLowerCase();
      return status.includes('error') || verification.includes('warning');
    }).length;
    return { total, running, attention };
  }, [vms]);

  const submitCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setIsCreating(true);
      try {
        await createMicroVm({
          ...form,
          id: form.id.trim(),
          country: form.country.trim(),
          ram: form.ram.trim(),
          cpu: form.cpu.trim(),
          template_id: form.template_id.trim(),
        });
        setInfoText(copy.createQueued(form.id));
        setErrorText('');
        setForm({ ...DEFAULT_FORM, id: generateVmId(), country: form.country || DEFAULT_FORM.country });
        window.setTimeout(() => {
          void refreshVms();
        }, 900);
      } catch (error) {
        const message = error instanceof Error ? error.message : copy.createFailed;
        setErrorText(message);
      } finally {
        setIsCreating(false);
      }
    },
    [copy, form, refreshVms]
  );

  const runVmAction = useCallback(
    async (vmId: string, action: 'stop' | 'restart' | 'delete') => {
      setBusyVmId(vmId);
      try {
        if (action === 'stop') {
          await stopMicroVm(vmId);
          setInfoText(copy.actionRequested.stop(vmId));
        } else if (action === 'restart') {
          await restartMicroVm(vmId);
          setInfoText(copy.actionRequested.restart(vmId));
        } else {
          await deleteMicroVm(vmId);
          setInfoText(copy.actionRequested.delete(vmId));
        }
        setErrorText('');
        window.setTimeout(() => {
          void refreshVms();
        }, 900);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : copy.actionFailed[action];
        setErrorText(message);
      } finally {
        setBusyVmId('');
      }
    },
    [copy, refreshVms]
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <form
          onSubmit={submitCreate}
          className="rounded-[28px] border border-slate-800 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]"
        >
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-400/80">{copy.headerKicker}</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">{copy.headerTitle}</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              {copy.headerDescription}
            </p>
          </div>

          <div className="grid gap-4">
            <label className="space-y-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-200">{copy.labels.vmId}</span>
              <div className="flex gap-2">
                <input
                  value={form.id}
                  onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
                  required
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 font-mono text-sm text-white outline-none transition focus:border-emerald-500/40"
                />
                <button
                  type="button"
                  onClick={() => setForm((prev) => ({ ...prev, id: generateVmId() }))}
                  className="rounded-2xl border border-slate-700 bg-slate-900 px-4 py-3 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white"
                >
                  {copy.labels.generate}
                </button>
              </div>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.labels.country}</span>
                <input
                  list="vm-country-options"
                  value={form.country}
                  onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
                  required
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.labels.template}</span>
                <input
                  value={form.template_id}
                  onChange={(event) => setForm((prev) => ({ ...prev, template_id: event.target.value }))}
                  required
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/40"
                />
              </label>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.labels.ram}</span>
                <input
                  value={form.ram}
                  onChange={(event) => setForm((prev) => ({ ...prev, ram: event.target.value }))}
                  required
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">{copy.labels.cpu}</span>
                <input
                  value={form.cpu}
                  onChange={(event) => setForm((prev) => ({ ...prev, cpu: event.target.value }))}
                  required
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/40"
                />
              </label>
            </div>

            <button
              type="submit"
              disabled={isCreating}
              className="mt-2 rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-black uppercase tracking-[0.18em] text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreating ? copy.labels.creating : copy.labels.createVm}
            </button>
          </div>

          <datalist id="vm-country-options">
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country} value={country} />
            ))}
          </datalist>
        </form>

        <section className="rounded-[28px] border border-slate-800 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]">
          <div className="flex flex-col gap-4 border-b border-slate-800 pb-5 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-sky-400/80">{copy.labels.fleetKicker}</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">{copy.labels.fleetTitle}</h2>
              <p className="mt-2 text-sm text-slate-400">
                {copy.countsText(counts.total, counts.running, counts.attention)}
              </p>
            </div>
            <button
              onClick={() => void refreshVms()}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white"
            >
              {copy.labels.refreshList}
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

          <div className="mt-5 overflow-hidden rounded-[24px] border border-slate-800">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-800 text-left">
                <thead className="bg-slate-900/80 text-[11px] uppercase tracking-[0.22em] text-slate-500">
                  <tr>
                    <th className="px-4 py-4 font-semibold">{copy.labels.vm}</th>
                    <th className="px-4 py-4 font-semibold">{copy.labels.state}</th>
                    <th className="px-4 py-4 font-semibold">{copy.labels.publicIp}</th>
                    <th className="px-4 py-4 font-semibold">{copy.labels.fingerprint}</th>
                    <th className="px-4 py-4 font-semibold">{copy.labels.actions}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={5}>
                        {copy.labels.loadingVms}
                      </td>
                    </tr>
                  ) : vms.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={5}>
                        {copy.labels.noVms}
                      </td>
                    </tr>
                  ) : (
                    vms.map((vm) => {
                      const status = (vm.status || '').toLowerCase();
                      const isRunning = status.includes('running');
                      const canStop = isRunning || status.includes('restarting');
                      const canRestart = isRunning || status.includes('stopped');
                      const busy = busyVmId === vm.id;

                      return (
                        <tr key={vm.id} className="align-top">
                          <td className="px-4 py-4">
                            <div className="font-mono text-sm font-bold text-white">{vm.id}</div>
                            <div className="mt-1 text-xs uppercase tracking-[0.2em] text-slate-500">{vm.country}</div>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${
                                isRunning
                                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                                  : status.includes('error')
                                  ? 'border-rose-500/30 bg-rose-500/10 text-rose-300'
                                  : 'border-amber-500/30 bg-amber-500/10 text-amber-300'
                              }`}
                            >
                              {translateVmStatus(vm.status)}
                            </span>
                            <div className="mt-2 text-xs text-slate-500">{copy.labels.uptime} {vm.uptime}</div>
                          </td>
                          <td className="px-4 py-4 font-mono text-sm text-slate-200">{vm.public_ip || copy.labels.pending}</td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-slate-200">{translateVerificationStatus(vm.verification_status)}</div>
                            <div className="mt-1 text-xs text-slate-500">{vm.exit_node || copy.labels.noExitNode}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => void runVmAction(vm.id, 'stop')}
                                disabled={busy || !canStop}
                                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {copy.labels.stop}
                              </button>
                              <button
                                onClick={() => void runVmAction(vm.id, 'restart')}
                                disabled={busy || !canRestart}
                                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {copy.labels.restart}
                              </button>
                              <button
                                onClick={() => void runVmAction(vm.id, 'delete')}
                                disabled={busy}
                                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                {copy.labels.delete}
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      </section>
    </div>
  );
};

export default FleetConsole;
