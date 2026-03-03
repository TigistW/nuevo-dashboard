import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import {
  ApiCentralizedLogEntry,
  ApiGoogleAccount,
  ApiIdentity,
  ApiMicroVm,
  ApiProtectionState,
  ApiSchedulerTask,
  getCentralizedLogs,
  getProtectionState,
  listGoogleAccounts,
  listIdentities,
  listMicroVms,
  listSchedulerQueue,
} from '../services/backendApi';

type WorkerView = {
  id: string;
  vmId: string;
  networkId: string;
  fingerprintId: string;
  lifecycleState: 'ACTIVE' | 'WARMING' | 'FLAGGED' | 'DORMANT';
  trustScore: number;
  riskScore: number;
  verificationStatus: string;
  activeWorkflowId: string | null;
  metrics: {
    cpu: number;
    ram: number;
  };
  history: Array<{
    event: string;
    state: 'ACTIVE' | 'WARMING' | 'FLAGGED' | 'DORMANT';
    timestamp: string;
  }>;
};

const ACTIVE_JOB_STATUSES = new Set(['queued', 'dispatching', 'running', 'retrying']);

const Workers: React.FC = () => {
  const { t } = useTranslation();
  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [identities, setIdentities] = useState<ApiIdentity[]>([]);
  const [accounts, setAccounts] = useState<ApiGoogleAccount[]>([]);
  const [queue, setQueue] = useState<ApiSchedulerTask[]>([]);
  const [protection, setProtection] = useState<ApiProtectionState | null>(null);
  const [logs, setLogs] = useState<ApiCentralizedLogEntry[]>([]);
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [vmRows, identityRows, accountRows, queueRows, protectionState, logRows] = await Promise.all([
        listMicroVms(),
        listIdentities(),
        listGoogleAccounts(),
        listSchedulerQueue(),
        getProtectionState(),
        getCentralizedLogs('All'),
      ]);
      setVms(vmRows);
      setIdentities(identityRows);
      setAccounts(accountRows);
      setQueue(queueRows);
      setProtection(protectionState);
      setLogs(logRows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load worker state.';
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

  const workers = useMemo(() => {
    const identityByVm = new Map<string, ApiIdentity>(identities.map((item) => [item.vm_id, item]));
    const accountByVm = new Map<string, ApiGoogleAccount>(
      accounts.filter((item) => item.vm_id).map((item) => [String(item.vm_id), item])
    );
    const activeJobByVm = new Map<string, ApiSchedulerTask>();
    for (const job of queue) {
      if (!job.vm_id) {
        continue;
      }
      const status = String(job.status || '').toLowerCase();
      if (!ACTIVE_JOB_STATUSES.has(status)) {
        continue;
      }
      if (!activeJobByVm.has(job.vm_id)) {
        activeJobByVm.set(job.vm_id, job);
      }
    }

    return vms.map((vm) => {
      const identity = identityByVm.get(vm.id);
      const account = accountByVm.get(vm.id);
      const activeJob = activeJobByVm.get(vm.id);
      const trustScore = Math.max(0, Math.min(100, Number(identity?.trust_score ?? 50)));
      const riskScore = Math.max(0, Math.min(100, Number(account?.risk_score ?? (trustScore < 70 ? 6 : 2)) * 10));
      const status = String(vm.status || '').toLowerCase();
      const verification = String(vm.verification_status || 'Unknown');

      let lifecycleState: WorkerView['lifecycleState'] = 'DORMANT';
      if (status === 'running' && trustScore >= 70 && riskScore < 70) {
        lifecycleState = 'ACTIVE';
      } else if (status === 'running' && (trustScore < 70 || riskScore >= 70)) {
        lifecycleState = 'FLAGGED';
      } else if (status === 'stopped') {
        lifecycleState = 'WARMING';
      }

      const baseCpu = activeJob ? 55 : 20;
      const baseRam = activeJob ? 60 : 25;
      const cpu = Math.max(5, Math.min(95, baseCpu + Math.round(riskScore / 12)));
      const ram = Math.max(5, Math.min(95, baseRam + Math.round(riskScore / 14)));

      const history = logs
        .filter((entry) => {
          const text = `${entry.msg} ${entry.details || ''}`.toLowerCase();
          return text.includes(vm.id.toLowerCase());
        })
        .slice(0, 5)
        .map((entry) => ({
          event: `${entry.source}: ${entry.msg}`,
          state: lifecycleState,
          timestamp: entry.time,
        }));

      return {
        id: vm.id,
        vmId: vm.id,
        networkId: vm.exit_node || vm.public_ip,
        fingerprintId: `fp-${vm.id}`,
        lifecycleState,
        trustScore,
        riskScore,
        verificationStatus: verification,
        activeWorkflowId: activeJob?.id || null,
        metrics: { cpu, ram },
        history,
      } as WorkerView;
    });
  }, [accounts, identities, logs, queue, vms]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl font-black tracking-tight uppercase italic">{t('workers')}</h2>
          <p className="text-sm text-slate-500 font-mono italic">Worker-centric operational control</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void refresh()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            Refresh Cluster
          </button>
          <div className="px-4 py-2 bg-emerald-600/10 border border-emerald-500/20 rounded-xl text-xs font-bold text-emerald-400">
            {protection?.failsafe_active ? 'Failsafe Active' : protection?.protective_mode ? 'Protective Mode' : 'Normal Mode'}
          </div>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {workers.map((worker) => (
          <div
            key={worker.id}
            className="bg-[#0d1225] border border-slate-800 rounded-3xl p-6 hover:border-blue-500/30 transition-all group overflow-hidden relative flex flex-col"
          >
            <div
              className={`absolute top-0 left-0 w-full h-1 ${
                worker.lifecycleState === 'ACTIVE'
                  ? 'bg-emerald-500'
                  : worker.lifecycleState === 'WARMING'
                  ? 'bg-amber-500'
                  : worker.lifecycleState === 'FLAGGED'
                  ? 'bg-rose-500'
                  : 'bg-slate-500'
              }`}
            />

            <div className="flex justify-between items-start mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center text-[10px] font-black bg-slate-800 text-slate-300">
                  {worker.riskScore > 70 ? 'RISK' : 'OK'}
                </div>
                <div>
                  <h4 className="font-bold text-sm truncate max-w-[150px]">{worker.id}</h4>
                  <div className="flex items-center gap-2 mt-0.5">
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">
                      {worker.vmId} // {worker.networkId}
                    </p>
                    <span
                      className={`w-1.5 h-1.5 rounded-full animate-pulse ${
                        worker.trustScore > 90 ? 'bg-emerald-500' : 'bg-amber-500'
                      }`}
                    />
                  </div>
                </div>
              </div>
              <div className="text-right">
                <span
                  className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                    worker.lifecycleState === 'ACTIVE'
                      ? 'bg-emerald-500/10 text-emerald-500'
                      : worker.lifecycleState === 'WARMING'
                      ? 'bg-amber-500/10 text-amber-400'
                      : worker.lifecycleState === 'FLAGGED'
                      ? 'bg-rose-500/10 text-rose-500'
                      : 'bg-slate-500/10 text-slate-500'
                  }`}
                >
                  {worker.lifecycleState}
                </span>
                <p className="text-[9px] text-slate-600 mt-1 font-mono italic">Trust: {worker.trustScore}/100</p>
              </div>
            </div>

            <div className="bg-slate-900/30 rounded-2xl p-4 border border-slate-800/50 mb-6 space-y-3">
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-500 uppercase font-bold">{t('fingerprint')}</span>
                <span className="text-slate-300 font-mono">{worker.fingerprintId}</span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-500 uppercase font-bold">{t('verification')}</span>
                <span className={worker.verificationStatus === 'Secure' ? 'text-emerald-500 font-mono' : 'text-amber-500 font-mono'}>
                  {worker.verificationStatus}
                </span>
              </div>
              <div className="flex justify-between items-center text-[10px]">
                <span className="text-slate-500 uppercase font-bold">{t('workflow')}</span>
                <span className="text-blue-400 font-mono truncate max-w-[120px]">{worker.activeWorkflowId || 'None'}</span>
              </div>
            </div>

            <div className="space-y-4 flex-1">
              <div className="flex items-center gap-4">
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                    <span>CPU</span>
                    <span>{worker.metrics.cpu}%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500" style={{ width: `${worker.metrics.cpu}%` }} />
                  </div>
                </div>
                <div className="flex-1 space-y-1">
                  <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                    <span>RAM</span>
                    <span>{worker.metrics.ram}%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${worker.metrics.ram}%` }} />
                  </div>
                </div>
              </div>
            </div>

            {expandedWorker === worker.id ? (
              <div className="mt-6 pt-6 border-t border-slate-800 space-y-4 animate-in slide-in-from-top-2 duration-300">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('workerTimeline')}</h5>
                <div className="space-y-3">
                  {worker.history.length === 0 ? (
                    <p className="text-[10px] text-slate-500">No recent timeline events for this worker.</p>
                  ) : (
                    worker.history.map((item, idx) => (
                      <div key={`${item.timestamp}-${idx}`} className="flex gap-3 items-start relative">
                        {idx !== worker.history.length - 1 ? (
                          <div className="absolute left-[3px] top-3 w-[1px] h-full bg-slate-800" />
                        ) : null}
                        <div className="w-2 h-2 rounded-full mt-1 z-10 bg-slate-500" />
                        <div>
                          <p className="text-[10px] font-bold text-slate-300">{item.event}</p>
                          <p className="text-[8px] text-slate-500 font-mono">{item.timestamp}</p>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            ) : null}

            <div className="mt-6 flex gap-2">
              <button
                onClick={() => setExpandedWorker(expandedWorker === worker.id ? null : worker.id)}
                className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-bold border border-slate-800 transition-colors"
              >
                {expandedWorker === worker.id ? 'Hide Timeline' : 'View Timeline'}
              </button>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? <p className="text-xs font-mono text-slate-500">Refreshing workers...</p> : null}
    </div>
  );
};

export default Workers;
