import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  ApiGlobalMetrics,
  ApiTelemetrySample,
  getGlobalMetrics,
  getTelemetryHistory,
} from '../services/backendApi';

const Telemetry: React.FC = () => {
  const { t } = useTranslation();
  const [samples, setSamples] = useState<ApiTelemetrySample[]>([]);
  const [metrics, setMetrics] = useState<ApiGlobalMetrics | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [history, global] = await Promise.all([getTelemetryHistory(), getGlobalMetrics()]);
      setSamples(history);
      setMetrics(global);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load telemetry.';
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

  const chartData = useMemo(() => {
    if (samples.length === 0) {
      return [
        { name: '00:00', uptime: 0, stability: 0, load: 0 },
        { name: '04:00', uptime: 0, stability: 0, load: 0 },
        { name: '08:00', uptime: 0, stability: 0, load: 0 },
        { name: '12:00', uptime: 0, stability: 0, load: 0 },
        { name: '16:00', uptime: 0, stability: 0, load: 0 },
        { name: '20:00', uptime: 0, stability: 0, load: 0 },
      ];
    }
    return samples.slice().reverse();
  }, [samples]);

  const stats = [
    {
      label: 'Active VMs',
      value: metrics ? String(metrics.active_vms) : 'n/a',
      trend: metrics ? `/${metrics.total_vms} capacity` : '',
    },
    {
      label: 'Active Tunnels',
      value: metrics ? String(metrics.active_tunnels) : 'n/a',
      trend: metrics ? `${metrics.functional_ips_percent}% functional` : '',
    },
    {
      label: 'Error Rate',
      value: metrics ? `${metrics.error_rate_percent}%` : 'n/a',
      trend: metrics ? `${metrics.recent_reboots} reboots/24h` : '',
    },
    {
      label: 'Host Load',
      value: metrics ? `${metrics.host_cpu_percent}% CPU` : 'n/a',
      trend: metrics ? `${metrics.host_ram_gb} GB RAM` : '',
    },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('telemetry')}</h2>
          <p className="text-sm text-slate-500 font-mono">Historical performance and stability metrics</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => void refresh()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold border border-slate-700"
          >
            Refresh
          </button>
          <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
            {['24h', '7d', '30d'].map((period) => (
              <button
                key={period}
                className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                  period === '24h' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'
                }`}
              >
                {period}
              </button>
            ))}
          </div>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6 italic uppercase tracking-tighter">{t('stabilityByNode')}</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorStab" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Area type="monotone" dataKey="stability" stroke="#10b981" fillOpacity={1} fill="url(#colorStab)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6 italic uppercase tracking-tighter">{t('uptimeAverage')}</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b', borderRadius: '12px' }}
                  itemStyle={{ fontSize: '12px', fontWeight: 'bold' }}
                />
                <Line type="monotone" dataKey="uptime" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        {stats.map((stat) => (
          <div key={stat.label} className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black">{stat.value}</p>
              <p className="text-[10px] text-emerald-500 font-bold">{stat.trend}</p>
            </div>
          </div>
        ))}
      </div>

      {isLoading ? <p className="text-xs text-slate-500 font-mono">Refreshing telemetry...</p> : null}
    </div>
  );
};

export default Telemetry;
