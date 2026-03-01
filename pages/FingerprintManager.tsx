import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import { ApiMicroVm, getOperation, listMicroVms, syncFingerprint } from '../services/backendApi';

const FingerprintManager: React.FC = () => {
  const { t } = useTranslation();
  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string>('');
  const [syncingByVm, setSyncingByVm] = useState<Record<string, boolean>>({});
  const [isSyncingAll, setIsSyncingAll] = useState<boolean>(false);

  const refreshVms = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listMicroVms();
      setVms(rows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load VM list.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshVms();
  }, [refreshVms]);

  const syncRate = useMemo(() => {
    if (!vms.length) {
      return 0;
    }
    const secure = vms.filter((vm) => (vm.verification_status || '').toLowerCase() === 'secure').length;
    return Math.round((secure / vms.length) * 100);
  }, [vms]);

  const activeCountries = useMemo(() => {
    const set = new Set(vms.map((vm) => vm.country.trim().toUpperCase()).filter(Boolean));
    return set.size;
  }, [vms]);

  const handleSyncOne = useCallback(
    async (vmId: string) => {
      setSyncingByVm((prev) => ({ ...prev, [vmId]: true }));
      try {
        const operation = await syncFingerprint(vmId);
        await waitForOperation(operation.id);
        await refreshVms();
      } catch (error) {
        const message = error instanceof Error ? error.message : `Failed to sync fingerprint for VM '${vmId}'.`;
        setErrorText(message);
      } finally {
        setSyncingByVm((prev) => ({ ...prev, [vmId]: false }));
      }
    },
    [refreshVms]
  );

  const handleSyncAll = useCallback(async () => {
    setIsSyncingAll(true);
    setErrorText('');
    try {
      for (const vm of vms) {
        await handleSyncOne(vm.id);
      }
      await refreshVms();
    } finally {
      setIsSyncingAll(false);
    }
  }, [handleSyncOne, refreshVms, vms]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('fingerprintManager')}</h2>
          <p className="text-sm text-slate-500 font-mono">Persistent Digital Identity & Environment Coherence</p>
        </div>
        <button
          onClick={() => void handleSyncAll()}
          disabled={isSyncingAll || isLoading || vms.length === 0}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {isSyncingAll ? 'Syncing...' : 'Sync All Identities'}
        </button>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">{errorText}</div>
      ) : null}

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">VM ID</th>
                <th className="px-8 py-5">Country</th>
                <th className="px-8 py-5">Public IP</th>
                <th className="px-8 py-5">VM Status</th>
                <th className="px-8 py-5">Verification</th>
                <th className="px-8 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={6}>
                    Loading VMs...
                  </td>
                </tr>
              ) : vms.length === 0 ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={6}>
                    No VMs available for fingerprint sync.
                  </td>
                </tr>
              ) : (
                vms.map((vm) => (
                  <tr key={vm.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-6 font-mono font-bold text-sm">{vm.id}</td>
                    <td className="px-8 py-6 text-xs text-slate-300 font-bold uppercase">{vm.country}</td>
                    <td className="px-8 py-6 text-xs text-blue-400 font-mono">{vm.public_ip || 'pending'}</td>
                    <td className="px-8 py-6 text-xs font-mono text-slate-400">{vm.status}</td>
                    <td className="px-8 py-6">
                      <span
                        className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                          (vm.verification_status || '').toLowerCase() === 'secure'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : 'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                        }`}
                      >
                        {vm.verification_status || 'Unknown'}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button
                        onClick={() => void handleSyncOne(vm.id)}
                        disabled={Boolean(syncingByVm[vm.id])}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-[10px] font-bold border border-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {syncingByVm[vm.id] ? 'Syncing...' : 'Sync'}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-sm">
        <h3 className="text-lg font-bold mb-6 italic uppercase tracking-tighter">{t('environmentCoherence')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4">
            <p className="text-sm text-slate-400 leading-relaxed">
              This module keeps VM-level locale/timezone/network signatures aligned with the assigned location profile.
              Fingerprint sync requests run through the governance API and update VM verification state after completion.
            </p>
            <div className="flex gap-4">
              <div className="flex-1 p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Active Regions</p>
                <p className="text-xl font-black">{activeCountries}</p>
              </div>
              <div className="flex-1 p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Sync Rate</p>
                <p className="text-xl font-black text-emerald-500">{syncRate}%</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-950 rounded-2xl p-6 font-mono text-[11px] text-slate-400">
            <p className="text-blue-500 mb-2"># Fingerprint Sync Checklist</p>
            <p>$ verify timezone/locale per VM region</p>
            <p className="text-slate-500">status: automated via governance sync</p>
            <p>$ validate DNS alignment and leak checks</p>
            <p className="text-slate-500">status: run security verification stage</p>
            <p>$ confirm verification_status == Secure</p>
            <p className="text-slate-500">status: monitored in this table</p>
          </div>
        </div>
      </div>
    </div>
  );
};

async function waitForOperation(operationId: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    const operation = await getOperation(operationId);
    const status = (operation.status || '').toLowerCase();
    if (status === 'succeeded') {
      return;
    }
    if (status === 'failed') {
      throw new Error(operation.message || `Operation ${operationId} failed.`);
    }
    await delay(1000);
  }
  throw new Error(`Operation ${operationId} timed out.`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default FingerprintManager;
