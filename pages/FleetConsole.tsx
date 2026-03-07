import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiMicroVm,
  createMicroVm,
  deleteMicroVm,
  listMicroVms,
  restartMicroVm,
  stopMicroVm,
} from '../services/backendApi';

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
  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [form, setForm] = useState<CreateVmForm>({ ...DEFAULT_FORM, id: generateVmId() });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [busyVmId, setBusyVmId] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refreshVms = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listMicroVms();
      setVms(rows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load VMs.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

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
        setInfoText(`VM '${form.id}' queued for creation.`);
        setErrorText('');
        setForm({ ...DEFAULT_FORM, id: generateVmId(), country: form.country || DEFAULT_FORM.country });
        window.setTimeout(() => {
          void refreshVms();
        }, 900);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create VM.';
        setErrorText(message);
      } finally {
        setIsCreating(false);
      }
    },
    [form, refreshVms]
  );

  const runVmAction = useCallback(
    async (vmId: string, action: 'stop' | 'restart' | 'delete') => {
      setBusyVmId(vmId);
      try {
        if (action === 'stop') {
          await stopMicroVm(vmId);
          setInfoText(`Stop requested for ${vmId}.`);
        } else if (action === 'restart') {
          await restartMicroVm(vmId);
          setInfoText(`Restart requested for ${vmId}.`);
        } else {
          await deleteMicroVm(vmId);
          setInfoText(`Delete requested for ${vmId}.`);
        }
        setErrorText('');
        window.setTimeout(() => {
          void refreshVms();
        }, 900);
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to ${action} VM.`;
        setErrorText(message);
      } finally {
        setBusyVmId('');
      }
    },
    [refreshVms]
  );

  return (
    <div className="space-y-6">
      <section className="grid gap-6 lg:grid-cols-[420px_minmax(0,1fr)]">
        <form
          onSubmit={submitCreate}
          className="rounded-[28px] border border-slate-800 bg-slate-950/75 p-6 shadow-[0_24px_80px_rgba(2,6,23,0.45)]"
        >
          <div className="mb-6">
            <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-emerald-400/80">Create VM</p>
            <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">New instance</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              One place to queue a VM and immediately track its state and IP once the backend finishes provisioning.
            </p>
          </div>

          <div className="grid gap-4">
            <label className="space-y-2 text-sm text-slate-300">
              <span className="font-semibold text-slate-200">VM ID</span>
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
                  Generate
                </button>
              </div>
            </label>

            <div className="grid gap-4 sm:grid-cols-2">
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Country</span>
                <input
                  list="vm-country-options"
                  value={form.country}
                  onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
                  required
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">Template</span>
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
                <span className="font-semibold text-slate-200">RAM</span>
                <input
                  value={form.ram}
                  onChange={(event) => setForm((prev) => ({ ...prev, ram: event.target.value }))}
                  required
                  className="w-full rounded-2xl border border-slate-800 bg-slate-900 px-4 py-3 text-sm text-white outline-none transition focus:border-emerald-500/40"
                />
              </label>
              <label className="space-y-2 text-sm text-slate-300">
                <span className="font-semibold text-slate-200">CPU</span>
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
              {isCreating ? 'Creating' : 'Create VM'}
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
              <p className="text-[11px] font-bold uppercase tracking-[0.25em] text-sky-400/80">Fleet status</p>
              <h2 className="mt-2 text-2xl font-black uppercase tracking-tight text-white">VM list</h2>
              <p className="mt-2 text-sm text-slate-400">
                Total {counts.total}. Running {counts.running}. Needs attention {counts.attention}.
              </p>
            </div>
            <button
              onClick={() => void refreshVms()}
              className="rounded-full border border-slate-700 bg-slate-900 px-4 py-2 text-sm font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white"
            >
              Refresh list
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
                    <th className="px-4 py-4 font-semibold">VM</th>
                    <th className="px-4 py-4 font-semibold">State</th>
                    <th className="px-4 py-4 font-semibold">Public IP</th>
                    <th className="px-4 py-4 font-semibold">Fingerprint</th>
                    <th className="px-4 py-4 font-semibold">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800 bg-slate-950/60">
                  {isLoading ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={5}>
                        Loading VMs...
                      </td>
                    </tr>
                  ) : vms.length === 0 ? (
                    <tr>
                      <td className="px-4 py-6 text-sm text-slate-400" colSpan={5}>
                        No VMs yet.
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
                              {vm.status}
                            </span>
                            <div className="mt-2 text-xs text-slate-500">Uptime {vm.uptime}</div>
                          </td>
                          <td className="px-4 py-4 font-mono text-sm text-slate-200">{vm.public_ip || 'Pending'}</td>
                          <td className="px-4 py-4">
                            <div className="text-sm text-slate-200">{vm.verification_status || 'Unknown'}</div>
                            <div className="mt-1 text-xs text-slate-500">{vm.exit_node || 'No exit node yet'}</div>
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => void runVmAction(vm.id, 'stop')}
                                disabled={busy || !canStop}
                                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Stop
                              </button>
                              <button
                                onClick={() => void runVmAction(vm.id, 'restart')}
                                disabled={busy || !canRestart}
                                className="rounded-full border border-slate-700 bg-slate-900 px-3 py-2 text-xs font-semibold text-slate-200 transition hover:border-slate-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Restart
                              </button>
                              <button
                                onClick={() => void runVmAction(vm.id, 'delete')}
                                disabled={busy}
                                className="rounded-full border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-200 transition hover:bg-rose-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Delete
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
