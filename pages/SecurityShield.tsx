import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis } from 'recharts';
import {
  ApiCentralizedLogEntry,
  ApiDnsLeakResult,
  ApiSecurityAudit,
  dnsLeakTest,
  getCentralizedLogs,
  getSecurityAudit,
  testIsolation,
} from '../services/backendApi';

const SLOT_LABELS = ['00:00', '04:00', '08:00', '12:00', '16:00', '20:00'] as const;

const SecurityShield: React.FC = () => {
  const { t } = useTranslation();
  const [audit, setAudit] = useState<ApiSecurityAudit | null>(null);
  const [dnsLeak, setDnsLeak] = useState<ApiDnsLeakResult | null>(null);
  const [logs, setLogs] = useState<ApiCentralizedLogEntry[]>([]);
  const [isolationStatus, setIsolationStatus] = useState<string>('Unknown');
  const [isolationDetails, setIsolationDetails] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [auditState, dnsState, logRows] = await Promise.all([
        getSecurityAudit(),
        dnsLeakTest(),
        getCentralizedLogs('All'),
      ]);
      setAudit(auditState);
      setDnsLeak(dnsState);
      setLogs(logRows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load security state.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 8000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const threatData = useMemo(() => {
    const slots = new Array(SLOT_LABELS.length).fill(0);
    for (const item of logs) {
      const level = (item.level || '').toUpperCase();
      if (level !== 'WARNING' && level !== 'ERROR') {
        continue;
      }
      const source = (item.source || '').toLowerCase();
      if (!['security', 'network', 'intelligence'].includes(source)) {
        continue;
      }
      const hour = Number((item.time || '0').split(':')[0]);
      if (Number.isNaN(hour) || hour < 0 || hour > 23) {
        continue;
      }
      const slot = Math.min(5, Math.floor(hour / 4));
      slots[slot] += level === 'ERROR' ? 3 : 1;
    }
    return SLOT_LABELS.map((label, idx) => ({ time: label, threats: slots[idx] }));
  }, [logs]);

  const recentIntrusions = useMemo(() => {
    return logs
      .filter((item) => {
        const level = (item.level || '').toUpperCase();
        if (level !== 'WARNING' && level !== 'ERROR') {
          return false;
        }
        const source = (item.source || '').toLowerCase();
        return ['security', 'network', 'intelligence'].includes(source);
      })
      .slice(0, 20)
      .map((item, idx) => ({
        id: `${item.time}-${item.source}-${idx}`,
        source: item.source,
        type: item.msg,
        time: item.time,
        status: item.level.toUpperCase() === 'ERROR' ? 'Blocked' : 'Mitigated',
      }));
  }, [logs]);

  const totalBlocked = useMemo(
    () => recentIntrusions.filter((item) => item.status === 'Blocked').length,
    [recentIntrusions]
  );

  const activeRules = audit?.namespaces?.length || 0;
  const isolationScore = useMemo(() => {
    if (!audit) {
      return 'n/a';
    }
    const base = audit.nftables_status.toLowerCase().includes('warning') ? 80 : 100;
    const leakPenalty = dnsLeak?.leaks?.length ? Math.min(60, dnsLeak.leaks.length * 20) : 0;
    return `${Math.max(0, base - leakPenalty)}%`;
  }, [audit, dnsLeak]);

  const runIsolationTest = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await testIsolation();
      setIsolationStatus(result.status);
      setIsolationDetails(result.details || '');
      setErrorText('');
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Isolation test failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const protectionLabel = audit?.nftables_status || 'Unknown';
  const isWarning = protectionLabel.toLowerCase().includes('warning') || (dnsLeak?.leaks?.length || 0) > 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('securityShield')}</h2>
          <p className="text-sm text-slate-500 font-mono">Real-time intrusion detection and network hardening</p>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded-xl border ${
              isWarning
                ? 'bg-amber-500/10 border-amber-500/20 text-amber-400'
                : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
            }`}
          >
            <span className={`w-2 h-2 rounded-full ${isWarning ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span className="text-xs font-black uppercase tracking-widest">
              {isWarning ? 'Warning' : 'Active'} Protection
            </span>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={isBusy}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold border border-slate-700"
          >
            Refresh
          </button>
          <button
            onClick={() => void runIsolationTest()}
            disabled={isBusy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
          >
            Test Isolation
          </button>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('threatMap')}</h3>
            <span className="text-[10px] font-mono text-rose-500">Security/Network events by hour slot</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={threatData}>
                <defs>
                  <linearGradient id="colorThreat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0d1225',
                    border: 'none',
                    borderRadius: '12px',
                    fontSize: '10px',
                  }}
                />
                <Area type="monotone" dataKey="threats" stroke="#f43f5e" fillOpacity={1} fill="url(#colorThreat)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-sm space-y-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Security Stats</h3>
          <StatBox label="Total Blocked" value={String(totalBlocked)} tone="rose" />
          <StatBox label="Active Namespaces" value={String(activeRules)} tone="blue" />
          <StatBox label="Isolation Score" value={isolationScore} tone="emerald" />
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Firewall Status</p>
            <p className="text-sm font-bold text-slate-200">{audit?.nftables_status || 'Unknown'}</p>
          </div>
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">DNS Leak Test</p>
            <p className="text-sm font-bold text-slate-200">
              {dnsLeak?.status || 'Unknown'} ({dnsLeak?.leaks?.length || 0} leaks)
            </p>
          </div>
          <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
            <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Last Isolation Test</p>
            <p className="text-sm font-bold text-slate-200">{isolationStatus}</p>
            {isolationDetails ? <p className="text-[10px] text-slate-500 mt-1">{isolationDetails}</p> : null}
          </div>
        </div>
      </div>

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('blockedIntrusions')}</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">Source</th>
                <th className="px-8 py-5">Event</th>
                <th className="px-8 py-5">Timestamp</th>
                <th className="px-8 py-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={4}>
                    Loading security events...
                  </td>
                </tr>
              ) : recentIntrusions.length === 0 ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={4}>
                    No recent intrusion records.
                  </td>
                </tr>
              ) : (
                recentIntrusions.map((intrusion) => (
                  <tr key={intrusion.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-8 py-6 font-mono text-xs text-slate-300">{intrusion.source}</td>
                    <td className="px-8 py-6 text-xs font-bold text-slate-400">{intrusion.type}</td>
                    <td className="px-8 py-6 text-xs text-slate-500">{intrusion.time}</td>
                    <td className="px-8 py-6 text-right">
                      <span
                        className={`px-2 py-1 text-[9px] font-black rounded uppercase border ${
                          intrusion.status === 'Blocked'
                            ? 'bg-rose-500/10 text-rose-500 border-rose-500/20'
                            : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                        }`}
                      >
                        {intrusion.status}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function StatBox({ label, value, tone }: { label: string; value: string; tone: 'rose' | 'blue' | 'emerald' }): JSX.Element {
  const className =
    tone === 'rose' ? 'text-rose-500' : tone === 'blue' ? 'text-blue-500' : 'text-emerald-500';
  return (
    <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
      <p className="text-[10px] font-black text-slate-500 uppercase mb-1">{label}</p>
      <p className={`text-3xl font-black ${className}`}>{value}</p>
    </div>
  );
}

export default SecurityShield;
