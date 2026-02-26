import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../App';
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
  country: '',
  ram: '256MB',
  cpu: '1',
  template_id: 't-001',
};

const MicroVMs: React.FC = () => {
  const { t } = useTranslation();
  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isCreating, setIsCreating] = useState<boolean>(false);
  const [showCreateForm, setShowCreateForm] = useState<boolean>(false);
  const [form, setForm] = useState<CreateVmForm>(DEFAULT_FORM);
  const [actionVmId, setActionVmId] = useState<string | null>(null);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refreshVms = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await listMicroVms();
      setVms(response);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load VM list.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshVms();
  }, [refreshVms]);

  const runVmAction = useCallback(
    async (vmId: string, action: 'stop' | 'restart' | 'delete') => {
      setActionVmId(vmId);
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
        setActionVmId(null);
      }
    },
    [refreshVms]
  );

  const submitCreate = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setIsCreating(true);
      try {
        await createMicroVm(form);
        setInfoText(`VM '${form.id}' queued for creation.`);
        setErrorText('');
        setShowCreateForm(false);
        setForm(DEFAULT_FORM);
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

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('microVms')}</h2>
          <p className="text-sm text-slate-500 font-mono">Firecracker Micro-VM Orchestration Layer</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void refreshVms()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowCreateForm((current) => !current)}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
          >
            {showCreateForm ? 'Hide Form' : t('createMicroVm')}
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

      {showCreateForm ? (
        <form
          onSubmit={submitCreate}
          className="bg-[#0d1225] border border-slate-800 rounded-3xl p-6 grid grid-cols-1 md:grid-cols-5 gap-3"
        >
          <input
            value={form.id}
            onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
            required
            placeholder="vm id"
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
          />
          <input
            list="country-options"
            value={form.country}
            onChange={(event) => setForm((prev) => ({ ...prev, country: event.target.value }))}
            required
            placeholder="country code (e.g. us, de, ca)"
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
          />
          <datalist id="country-options">
            {COUNTRY_OPTIONS.map((country) => (
              <option key={country} value={country} />
            ))}
          </datalist>
          <input
            value={form.ram}
            onChange={(event) => setForm((prev) => ({ ...prev, ram: event.target.value }))}
            required
            placeholder="256MB"
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
          />
          <input
            value={form.cpu}
            onChange={(event) => setForm((prev) => ({ ...prev, cpu: event.target.value }))}
            required
            placeholder="1"
            className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
          />
          <div className="flex gap-2">
            <input
              value={form.template_id}
              onChange={(event) => setForm((prev) => ({ ...prev, template_id: event.target.value }))}
              required
              placeholder="t-001"
              className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm outline-none"
            />
            <button
              type="submit"
              disabled={isCreating}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold"
            >
              {isCreating ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      ) : null}

      {isLoading ? (
        <div className="text-slate-500 font-mono text-sm">Loading VMs...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {vms.map((vm) => {
            const statusLower = vm.status.toLowerCase();
            const isRunning = statusLower.includes('running');
            const canStop = isRunning || statusLower.includes('restarting');
            const canRestart = isRunning || statusLower.includes('stopped');
            const busy = actionVmId === vm.id;

            return (
              <div
                key={vm.id}
                className="bg-[#0d1225] border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-emerald-500/50 transition-all duration-300"
              >
                <div
                  className={`absolute -right-4 -top-4 w-24 h-24 ${
                    isRunning ? 'bg-emerald-500/5' : 'bg-rose-500/5'
                  } blur-3xl rounded-full`}
                ></div>

                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-lg font-black font-mono">{vm.id}</h3>
                    <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{vm.country}</p>
                  </div>
                  <span
                    className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter ${
                      isRunning
                        ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                        : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    }`}
                  >
                    {vm.status}
                  </span>
                </div>

                <div className="space-y-4 mb-8">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{t('publicIp')}</span>
                    <span className="font-mono text-slate-300">{vm.public_ip || 'Pending'}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{t('ramUsed')}</span>
                    <span className="font-mono text-slate-300">{vm.ram}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{t('cpuUsed')}</span>
                    <span className="font-mono text-slate-300">{vm.cpu}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-slate-500">{t('uptime')}</span>
                    <span className="font-mono text-slate-300">{vm.uptime}</span>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => void runVmAction(vm.id, 'stop')}
                    disabled={busy || !canStop}
                    className="py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-xl text-[10px] font-bold border border-slate-800 transition-colors"
                  >
                    {busy ? '...' : t('stopMicroVm')}
                  </button>
                  <button
                    onClick={() => void runVmAction(vm.id, 'restart')}
                    disabled={busy || !canRestart}
                    className="py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-xl text-[10px] font-bold border border-slate-800 transition-colors"
                  >
                    {busy ? '...' : t('restartMicroVm')}
                  </button>
                  <button
                    onClick={() => void runVmAction(vm.id, 'delete')}
                    disabled={busy}
                    className="py-2 bg-rose-900/20 hover:bg-rose-900/40 disabled:opacity-40 rounded-xl text-[10px] font-bold border border-rose-500/20 text-rose-500 transition-all"
                  >
                    {busy ? '...' : t('deleteMicroVm')}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MicroVMs;
