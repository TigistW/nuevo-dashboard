import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  ApiGlobalMetrics,
  ApiGoogleAccount,
  ApiMicroVm,
  ApiProtectionState,
  ApiTelemetrySample,
  ApiTunnel,
  evaluateProtection,
  getGlobalMetrics,
  getProtectionState,
  getTelemetryHistory,
  listGoogleAccounts,
  listMicroVms,
  listTunnels,
  resetProtectionState,
  triggerSchedulerTick,
} from '../services/backendApi';

const Overview: React.FC = () => {
  const { t } = useTranslation();
  const [accounts, setAccounts] = useState<ApiGoogleAccount[]>([]);
  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [tunnels, setTunnels] = useState<ApiTunnel[]>([]);
  const [telemetry, setTelemetry] = useState<ApiTelemetrySample[]>([]);
  const [metrics, setMetrics] = useState<ApiGlobalMetrics | null>(null);
  const [protection, setProtection] = useState<ApiProtectionState | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountsRows, vmRows, tunnelRows, telemetryRows, metricsRow, protectionState] = await Promise.all([
        listGoogleAccounts(),
        listMicroVms(),
        listTunnels(),
        getTelemetryHistory(),
        getGlobalMetrics(),
        getProtectionState(),
      ]);
      setAccounts(accountsRows);
      setVms(vmRows);
      setTunnels(tunnelRows);
      setTelemetry(telemetryRows);
      setMetrics(metricsRow);
      setProtection(protectionState);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load overview.';
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

  const avgRisk = useMemo(() => {
    if (accounts.length === 0) {
      return 0;
    }
    return Math.round(accounts.reduce((acc, item) => acc + Number(item.risk_score || 0), 0) / accounts.length);
  }, [accounts]);

  const kpiStats = useMemo(
    () => [
      { label: t('activeWorkers'), value: String(accounts.length), icon: 'WK', color: 'blue' },
      {
        label: t('ramUsage'),
        value: protection
          ? `${(protection.snapshot.host_ram_used_mb / 1024).toFixed(1)} / ${(protection.snapshot.host_ram_total_mb / 1024).toFixed(1)} GB`
          : 'n/a',
        icon: 'RAM',
        color: 'emerald',
      },
      {
        label: t('storageUsed'),
        value: protection
          ? `${protection.snapshot.host_disk_used_gb.toFixed(1)} / ${protection.snapshot.host_disk_total_gb.toFixed(1)} GB`
          : 'n/a',
        icon: 'DISK',
        color: 'purple',
      },
      { label: t('avgRiskScore'), value: `${avgRisk}/100`, icon: 'RISK', color: 'amber' },
    ],
    [accounts.length, avgRisk, protection, t]
  );

  const predictiveAlerts = useMemo(() => {
    const alerts: Array<{ id: string; msg: string; type: 'critical' | 'warning' }> = [];
    (protection?.signals || []).slice(0, 4).forEach((signal, index) => {
      alerts.push({ id: `signal-${index}`, msg: signal, type: 'critical' });
    });
    accounts
      .filter((item) => Number(item.risk_score || 0) >= 8)
      .slice(0, 3)
      .forEach((item) => {
        alerts.push({
          id: `acct-${item.id}`,
          msg: `${item.email} risk score is high (${item.risk_score}).`,
          type: 'warning',
        });
      });
    return alerts.slice(0, 6);
  }, [accounts, protection]);

  const chartData = useMemo(() => {
    if (telemetry.length === 0) {
      return [
        { name: '00:00', val: 0 },
        { name: '04:00', val: 0 },
        { name: '08:00', val: 0 },
        { name: '12:00', val: 0 },
        { name: '16:00', val: 0 },
        { name: '20:00', val: 0 },
      ];
    }
    return telemetry.slice().reverse().map((item) => ({ name: item.name, val: item.load }));
  }, [telemetry]);

  const healthBySection = useMemo(() => {
    const vmErrors = vms.filter((item) => String(item.status || '').toLowerCase() !== 'running').length;
    const tunnelErrors = tunnels.filter((item) => String(item.status || '').toLowerCase() !== 'connected').length;
    const accountErrors = accounts.filter((item) => Number(item.risk_score || 0) >= 8).length;
    return {
      vms: { total: vms.length, error: vmErrors, recent: vms.filter((item) => item.status === 'running').length, resolved: 0 },
      tunnels: {
        total: tunnels.length,
        error: tunnelErrors,
        recent: tunnels.filter((item) => item.status === 'Connected').length,
        resolved: 0,
      },
      accounts: {
        total: accounts.length,
        error: accountErrors,
        recent: accounts.filter((item) => String(item.status || '').toLowerCase() === 'active').length,
        resolved: accounts.filter((item) => Number(item.risk_score || 0) <= 2).length,
      },
    };
  }, [accounts, tunnels, vms]);

  const countryDistribution = useMemo(() => {
    const counts = new Map<string, number>();
    for (const vm of vms) {
      const key = (vm.country || 'unknown').toUpperCase();
      counts.set(key, (counts.get(key) || 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([country, count]) => ({ country, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 3);
  }, [vms]);

  const infraStats = useMemo(() => {
    const workerHealth = Math.max(0, Math.min(100, 100 - avgRisk * 10));
    const networkTrust = Math.max(0, Math.min(100, metrics?.functional_ips_percent ?? 0));
    const successRate = Math.max(0, Math.min(100, 100 - (metrics?.error_rate_percent ?? 0)));
    return [
      { l: t('activeWorkers'), v: workerHealth, c: 'emerald' },
      { l: t('networkTrust'), v: networkTrust, c: 'blue' },
      { l: t('successRate'), v: Number(successRate.toFixed(1)), c: 'emerald' },
    ];
  }, [avgRisk, metrics, t]);

  const handleSchedulerTick = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await triggerSchedulerTick();
      setInfoText(`Scheduler tick dispatched=${result.dispatched}, warmup=${result.warmup_jobs_enqueued}.`);
      setErrorText('');
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scheduler tick failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const handleEvaluateProtection = useCallback(async () => {
    setIsBusy(true);
    try {
      const state = await evaluateProtection(true);
      setProtection(state);
      setInfoText(`Protection evaluated: protective=${state.protective_mode}, failsafe=${state.failsafe_active}.`);
      setErrorText('');
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Protection evaluation failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const handleResetProtection = useCallback(async () => {
    setIsBusy(true);
    try {
      const state = await resetProtectionState();
      setProtection(state);
      setInfoText('Protection reset completed.');
      setErrorText('');
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Protection reset failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800/40 border border-slate-700/50 p-6 rounded-3xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {t('systemControl')}
            </h3>
            <span className="text-[10px] font-mono text-slate-500">live</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button
              onClick={() => void handleSchedulerTick()}
              disabled={isBusy}
              className="flex flex-col items-center justify-center p-4 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl hover:bg-emerald-600/20 transition-all disabled:opacity-50"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">Run Scheduler Tick</span>
            </button>
            <button
              onClick={() => void handleEvaluateProtection()}
              disabled={isBusy}
              className="flex flex-col items-center justify-center p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl hover:bg-blue-600/20 transition-all disabled:opacity-50"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">Evaluate Protection</span>
            </button>
            <button
              onClick={() => void handleResetProtection()}
              disabled={isBusy}
              className="flex flex-col items-center justify-center p-4 bg-rose-600/10 border border-rose-500/20 rounded-2xl hover:bg-rose-600/20 transition-all disabled:opacity-50"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">Reset Protection</span>
            </button>
          </div>
          {infoText ? <p className="text-xs text-emerald-300 mt-4">{infoText}</p> : null}
          {errorText ? <p className="text-xs text-rose-300 mt-2">{errorText}</p> : null}
        </div>

        <div className="bg-rose-900/10 border border-rose-500/20 p-6 rounded-3xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-rose-500 mb-4">Critical Events</h3>
          <div className="space-y-3">
            {predictiveAlerts.length === 0 ? (
              <p className="text-xs text-slate-500">No active critical alerts.</p>
            ) : (
              predictiveAlerts.map((alert) => (
                <div
                  key={alert.id}
                  className={`p-3 rounded-xl flex items-start gap-3 ${
                    alert.type === 'critical'
                      ? 'bg-rose-500/10 border border-rose-500/20'
                      : 'bg-amber-500/10 border border-amber-500/20'
                  }`}
                >
                  <span className={alert.type === 'critical' ? 'text-rose-500' : 'text-amber-500'}>ALERT</span>
                  <p className="text-xs text-slate-200">{alert.msg}</p>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiStats.map((stat) => (
          <div
            key={stat.label}
            className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 p-6 rounded-2xl hover:border-emerald-500/30 transition-all group relative overflow-hidden"
          >
            <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${stat.color}-500/5 blur-3xl rounded-full`} />
            <div className="flex justify-between items-start mb-4">
              <div className="text-xs font-black text-slate-300">{stat.icon}</div>
              <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">live</div>
            </div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{stat.label}</p>
            <p className="text-2xl font-black mt-1">{stat.value}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { id: 'vms', label: 'MicroVMs', data: healthBySection.vms },
          { id: 'tunnels', label: 'Tunnels', data: healthBySection.tunnels },
          { id: 'accounts', label: 'Accounts', data: healthBySection.accounts },
        ].map((section) => (
          <div
            key={section.id}
            onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
            className={`bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 cursor-pointer transition-all hover:bg-slate-800/60 ${
              expandedSection === section.id ? 'ring-2 ring-blue-500/50' : ''
            }`}
          >
            <div className="flex justify-between items-center">
              <span className="font-bold text-sm uppercase tracking-tight">{section.label}</span>
              <span className={`text-xs font-mono ${section.data.error > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {section.data.error > 0 ? `${section.data.error} ERR` : 'OK'}
              </span>
            </div>
            {expandedSection === section.id ? (
              <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-2 animate-in fade-in slide-in-from-top-2 duration-300">
                <Row label={t('totalUnits')} value={String(section.data.total)} />
                <Row label={t('errorUnits')} value={String(section.data.error)} />
                <Row label={t('recentActivity')} value={String(section.data.recent)} />
                <Row label={t('resolvedUnits')} value={String(section.data.resolved)} />
              </div>
            ) : null}
          </div>
        ))}
      </div>

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold">{t('activeWorkers')}</h3>
          <div className="flex gap-2">
            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-black rounded uppercase">
              {accounts.filter((item) => Number(item.risk_score || 0) < 8).length} stable
            </span>
            <span className="px-2 py-1 bg-amber-500/10 text-amber-500 text-[8px] font-black rounded uppercase">
              {accounts.filter((item) => Number(item.risk_score || 0) >= 8).length} risk
            </span>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-10 gap-4">
          {accounts.slice(0, 20).map((account) => (
            <div
              key={account.id}
              className="flex flex-col items-center gap-2 p-2 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-emerald-500/50 transition-all"
            >
              <div
                className={`w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-black ${
                  Number(account.risk_score || 0) >= 8 ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-800 text-slate-300'
                }`}
              >
                {Number(account.risk_score || 0) >= 8 ? 'RISK' : 'OK'}
              </div>
              <span className="text-[8px] font-mono text-slate-500 truncate w-full text-center">{account.id}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <div className="flex justify-between items-center mb-8">
            <div>
              <h3 className="text-lg font-bold">{t('automationThroughput')}</h3>
              <p className="text-xs text-slate-500">{t('globalSystemRequests')}</p>
            </div>
            <div className="text-xs text-slate-500">{isLoading ? 'refreshing...' : 'live'}</div>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="name" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0d1225', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                <Area type="monotone" dataKey="val" stroke="#10b981" fillOpacity={1} fill="url(#colorVal)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8 space-y-6">
            <h3 className="text-lg font-bold">{t('infrastructure')}</h3>
            {infraStats.map((metric) => (
              <div key={metric.l} className="space-y-2">
                <div className="flex justify-between text-[11px] font-bold">
                  <span className="text-slate-400 uppercase tracking-tighter">{metric.l}</span>
                  <span className={`text-${metric.c}-400`}>{metric.v}%</span>
                </div>
                <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                  <div className={`h-full bg-${metric.c}-500`} style={{ width: `${metric.v}%` }} />
                </div>
              </div>
            ))}
          </div>

          <div className="bg-gradient-to-br from-indigo-900/20 to-blue-900/20 border border-indigo-500/20 rounded-3xl p-6">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Country Distribution</span>
              <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full">Live</span>
            </div>
            <div className="space-y-2">
              {countryDistribution.length === 0 ? (
                <p className="text-xs text-slate-500">No running VM geography yet.</p>
              ) : (
                countryDistribution.map((item) => (
                  <div key={item.country} className="flex items-center justify-between text-xs font-mono">
                    <span className="text-slate-300">{item.country}</span>
                    <span className="text-slate-500">{item.count} VMs</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="flex justify-between text-[10px] font-mono text-slate-400">
      <span>{label}</span>
      <span className="text-slate-200">{value}</span>
    </div>
  );
}

export default Overview;
