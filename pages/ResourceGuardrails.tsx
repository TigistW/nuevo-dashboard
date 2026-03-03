import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import {
  ApiGuardrails,
  ApiProtectionState,
  evaluateProtection,
  getGuardrailsConfig,
  getProtectionState,
  resetProtectionState,
  updateGuardrailsConfig,
} from '../services/backendApi';

const DEFAULT_GUARDRAILS: ApiGuardrails = {
  max_vms: 50,
  min_host_ram_mb: 2048,
  max_cpu_per_vm: 2,
  overload_prevention: true,
};

const ResourceGuardrails: React.FC = () => {
  const { t } = useTranslation();
  const [guardrails, setGuardrails] = useState<ApiGuardrails>(DEFAULT_GUARDRAILS);
  const [draft, setDraft] = useState<ApiGuardrails>(DEFAULT_GUARDRAILS);
  const [protection, setProtection] = useState<ApiProtectionState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [guardrailsState, protectionState] = await Promise.all([getGuardrailsConfig(), getProtectionState()]);
      setGuardrails(guardrailsState);
      setDraft(guardrailsState);
      setProtection(protectionState);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load guardrails state.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 7000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const hasChanges = useMemo(
    () =>
      draft.max_vms !== guardrails.max_vms ||
      draft.min_host_ram_mb !== guardrails.min_host_ram_mb ||
      draft.max_cpu_per_vm !== guardrails.max_cpu_per_vm ||
      draft.overload_prevention !== guardrails.overload_prevention,
    [draft, guardrails]
  );

  const handleSave = useCallback(async () => {
    setIsBusy(true);
    try {
      const updated = await updateGuardrailsConfig(draft);
      setGuardrails(updated);
      setDraft(updated);
      setInfoText('Guardrails updated.');
      setErrorText('');
      const protectionState = await getProtectionState();
      setProtection(protectionState);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update guardrails.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, [draft]);

  const handleEvaluate = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await evaluateProtection(true);
      setProtection(result);
      setInfoText(
        `Protection evaluated: protective=${result.protective_mode}, failsafe=${result.failsafe_active}.`
      );
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Protection evaluation failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleReset = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await resetProtectionState();
      setProtection(result);
      setInfoText('Protection state reset.');
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Protection reset failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const snapshot = protection?.snapshot;
  const thresholds = protection?.thresholds;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('resourceGuardrails')}</h2>
          <p className="text-sm text-slate-500 font-mono">
            Host protection, failsafe status, and live resource pressure
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => void refresh()}
            disabled={isBusy}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold border border-slate-700"
          >
            Refresh
          </button>
          <button
            onClick={() => void handleEvaluate()}
            disabled={isBusy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
          >
            Evaluate Protection
          </button>
          <button
            onClick={() => void handleReset()}
            disabled={isBusy}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
          >
            Reset Protection
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={isBusy || !hasChanges}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
          >
            {t('saveConfig')}
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

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6 space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Guardrails Configuration</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400 uppercase">
                <span>Max Simultaneous MicroVMs</span>
                <span className="text-slate-200 font-mono">{draft.max_vms}</span>
              </div>
              <input
                type="range"
                min={1}
                max={200}
                value={draft.max_vms}
                onChange={(event) => setDraft((prev) => ({ ...prev, max_vms: Number(event.target.value) }))}
                className="w-full accent-emerald-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400 uppercase">
                <span>Reserved Host RAM (MB)</span>
                <span className="text-slate-200 font-mono">{draft.min_host_ram_mb}</span>
              </div>
              <input
                type="range"
                min={512}
                max={32768}
                step={256}
                value={draft.min_host_ram_mb}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    min_host_ram_mb: Number(event.target.value),
                  }))
                }
                className="w-full accent-blue-500"
              />
            </div>

            <div className="space-y-2">
              <div className="flex justify-between text-xs text-slate-400 uppercase">
                <span>Max CPU Cores Per VM</span>
                <span className="text-slate-200 font-mono">{draft.max_cpu_per_vm}</span>
              </div>
              <input
                type="range"
                min={1}
                max={16}
                value={draft.max_cpu_per_vm}
                onChange={(event) =>
                  setDraft((prev) => ({
                    ...prev,
                    max_cpu_per_vm: Number(event.target.value),
                  }))
                }
                className="w-full accent-cyan-500"
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-xl border border-slate-700 bg-slate-900/50">
              <div>
                <p className="text-sm font-semibold text-slate-200">Overload Prevention</p>
                <p className="text-[11px] text-slate-500">Block new VM creation when reserve RAM rule would be violated.</p>
              </div>
              <button
                onClick={() =>
                  setDraft((prev) => ({
                    ...prev,
                    overload_prevention: !prev.overload_prevention,
                  }))
                }
                className={`w-12 h-6 rounded-full transition-all relative ${
                  draft.overload_prevention ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${
                    draft.overload_prevention ? 'left-7' : 'left-1'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>

        <section className="space-y-4">
          <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Protection State</h3>
            <div className="grid grid-cols-2 gap-4">
              <StateCard label="Protective Mode" value={protection?.protective_mode ? 'ON' : 'OFF'} tone={protection?.protective_mode ? 'warn' : 'ok'} />
              <StateCard label="Failsafe" value={protection?.failsafe_active ? 'ACTIVE' : 'IDLE'} tone={protection?.failsafe_active ? 'danger' : 'ok'} />
              <StateCard label="Cooldown Until" value={protection?.cooldown_until || 'n/a'} tone="info" />
              <StateCard label="Reason" value={protection?.last_reason || 'n/a'} tone="info" />
            </div>
          </div>

          <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Current Host Usage</h3>
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading host snapshot...</p>
            ) : snapshot ? (
              <div className="grid grid-cols-2 gap-4 text-sm">
                <MetricCard label="CPU Load" value={`${snapshot.host_cpu_percent}%`} />
                <MetricCard
                  label="RAM Usage"
                  value={`${(snapshot.host_ram_used_mb / 1024).toFixed(1)} / ${(snapshot.host_ram_total_mb / 1024).toFixed(1)} GB`}
                />
                <MetricCard label="RAM Percent" value={`${snapshot.host_ram_percent}%`} />
                <MetricCard
                  label="Disk Usage"
                  value={`${snapshot.host_disk_used_gb.toFixed(1)} / ${snapshot.host_disk_total_gb.toFixed(1)} GB`}
                />
                <MetricCard label="Disk Percent" value={`${snapshot.host_disk_percent}%`} />
                <MetricCard label="Active VMs / Max" value={`${snapshot.active_vms} / ${snapshot.max_vms}`} />
              </div>
            ) : (
              <p className="text-sm text-slate-500">No protection snapshot available.</p>
            )}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Thresholds</h3>
          {thresholds ? (
            <div className="grid grid-cols-3 gap-4 text-sm">
              <MetricCard label="CPU Threshold" value={`${thresholds.cpu_percent}%`} />
              <MetricCard label="RAM Threshold" value={`${thresholds.ram_percent}%`} />
              <MetricCard label="Disk Threshold" value={`${thresholds.disk_percent}%`} />
            </div>
          ) : (
            <p className="text-sm text-slate-500">No threshold data available.</p>
          )}
        </section>

        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Signals and Actions</h3>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-2">
            {protection?.signals?.map((signal, index) => (
              <p key={`signal-${index}`} className="text-xs text-amber-300 bg-amber-900/20 border border-amber-500/20 rounded p-2">
                SIGNAL: {signal}
              </p>
            ))}
            {protection?.actions?.map((action, index) => (
              <p key={`action-${index}`} className="text-xs text-blue-300 bg-blue-900/20 border border-blue-500/20 rounded p-2">
                ACTION: {action}
              </p>
            ))}
            {!protection || ((protection.signals?.length || 0) + (protection.actions?.length || 0) === 0) ? (
              <p className="text-sm text-slate-500">No active signals or actions.</p>
            ) : null}
          </div>
        </section>
      </div>
    </div>
  );
};

function MetricCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="p-3 bg-slate-900/50 border border-slate-800 rounded-xl">
      <p className="text-[10px] uppercase tracking-widest text-slate-500">{label}</p>
      <p className="text-sm font-bold text-slate-200 mt-1">{value}</p>
    </div>
  );
}

function StateCard({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: 'ok' | 'warn' | 'danger' | 'info';
}): JSX.Element {
  const toneClass =
    tone === 'ok'
      ? 'text-emerald-400 border-emerald-500/20 bg-emerald-900/20'
      : tone === 'warn'
      ? 'text-amber-400 border-amber-500/20 bg-amber-900/20'
      : tone === 'danger'
      ? 'text-rose-400 border-rose-500/20 bg-rose-900/20'
      : 'text-slate-300 border-slate-700 bg-slate-900/40';
  return (
    <div className={`p-3 border rounded-xl ${toneClass}`}>
      <p className="text-[10px] uppercase tracking-widest opacity-80">{label}</p>
      <p className="text-xs font-bold mt-1 break-all">{value}</p>
    </div>
  );
}

export default ResourceGuardrails;
