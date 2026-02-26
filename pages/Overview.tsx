
import React, { useState, useEffect } from 'react';
import { loadData, getStorageStats } from '../services/state';
import { useTranslation } from '../App';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const Overview: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(loadData());
  const [stats, setStats] = useState(getStorageStats());
  const [expandedSection, setExpandedSection] = useState<string | null>(null);

  useEffect(() => {
    const it = setInterval(() => {
      setData(loadData());
      setStats(getStorageStats());
    }, 5000);
    return () => clearInterval(it);
  }, []);

  const kpiStats = [
    { label: t('activeWorkers'), value: data.accounts.length, icon: '🤖', color: 'blue' },
    { label: t('ramUsage'), value: `${stats.ramUsage.used} / ${stats.ramUsage.total} GB`, icon: '⚡', color: 'emerald' },
    { label: t('storageUsed'), value: `${stats.totalGb} GB`, icon: '💾', color: 'purple' },
    { label: t('avgRiskScore'), value: '12/100', icon: '⚠️', color: 'amber' },
  ];

  const predictiveAlerts = data.accounts
    .filter(acc => acc.health.idleTimeout < 20 || acc.riskLevel === 'High')
    .map(acc => ({
      id: acc.id,
      msg: `${acc.email} in high disconnect risk (${acc.health.idleTimeout}m left)`,
      type: 'critical'
    }));

  const chartData = [
    { name: '00:00', val: 12 }, { name: '04:00', val: 45 },
    { name: '08:00', val: 78 }, { name: '12:00', val: 110 },
    { name: '16:00', val: 95 }, { name: '20:00', val: 60 },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-700">
      
      {/* SYSTEM MASTER CONTROL & CRITICAL EVENTS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-slate-800/40 border border-slate-700/50 p-6 rounded-3xl backdrop-blur-md">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              {t('systemControl')}
            </h3>
            <span className="text-[10px] font-mono text-slate-500">v3.2.0-STABLE</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <button className="flex flex-col items-center justify-center p-4 bg-emerald-600/10 border border-emerald-500/20 rounded-2xl hover:bg-emerald-600/20 transition-all group">
              <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">🚀</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-400">{t('startSystem')}</span>
            </button>
            <button className="flex flex-col items-center justify-center p-4 bg-blue-600/10 border border-blue-500/20 rounded-2xl hover:bg-blue-600/20 transition-all group">
              <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">🌐</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-400">{t('startProxy')}</span>
            </button>
            <button className="flex flex-col items-center justify-center p-4 bg-rose-600/10 border border-rose-500/20 rounded-2xl hover:bg-rose-600/20 transition-all group">
              <span className="text-2xl mb-2 group-hover:scale-110 transition-transform">🛑</span>
              <span className="text-[10px] font-black uppercase tracking-widest text-rose-400">{t('stopAll')}</span>
            </button>
          </div>
        </div>

        <div className="bg-rose-900/10 border border-rose-500/20 p-6 rounded-3xl">
          <h3 className="text-sm font-black uppercase tracking-widest text-rose-500 mb-4 flex items-center gap-2">
            <span>🚨</span> {t('criticalEvents')}
          </h3>
          <div className="space-y-3">
            <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl flex items-start gap-3">
              <span className="text-rose-500 mt-0.5">⚠️</span>
              <div>
                <p className="text-xs font-bold text-rose-400">{t('googleAuthError')}</p>
                <p className="text-[10px] text-rose-500/70 font-mono">Account: farm-user-09@gmail.com</p>
              </div>
            </div>
            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl flex items-start gap-3">
              <span className="text-amber-500 mt-0.5">⚡</span>
              <div>
                <p className="text-xs font-bold text-amber-400">High Latency Detected</p>
                <p className="text-[10px] text-amber-500/70 font-mono">Node: W-03 // 450ms</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiStats.map((s, i) => (
          <div key={i} className="bg-slate-800/40 backdrop-blur-md border border-slate-700/50 p-6 rounded-2xl hover:border-emerald-500/30 transition-all group relative overflow-hidden">
            <div className={`absolute -right-4 -top-4 w-24 h-24 bg-${s.color}-500/5 blur-3xl rounded-full`}></div>
            <div className="flex justify-between items-start mb-4">
               <div className="text-3xl">{s.icon}</div>
               <div className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('live')}</div>
            </div>
            <p className="text-slate-400 text-xs font-medium uppercase tracking-wider">{s.label}</p>
            <p className="text-3xl font-black mt-1">{s.value}</p>
          </div>
        ))}
      </div>

      {/* OPERATIONAL HEALTH (EXPANDABLE) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { id: 'vms', label: 'Micro-VMs', icon: '📦', data: stats.vms },
          { id: 'tunnels', label: 'Tunnels', icon: '🔗', data: stats.tunnels },
          { id: 'accounts', label: 'Accounts', icon: '👤', data: stats.accounts }
        ].map((sec) => (
          <div 
            key={sec.id} 
            onClick={() => setExpandedSection(expandedSection === sec.id ? null : sec.id)}
            className={`bg-slate-800/40 border border-slate-700/50 rounded-2xl p-5 cursor-pointer transition-all hover:bg-slate-800/60 ${expandedSection === sec.id ? 'ring-2 ring-blue-500/50' : ''}`}
          >
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-3">
                <span className="text-xl">{sec.icon}</span>
                <span className="font-bold text-sm uppercase tracking-tight">{sec.label}</span>
              </div>
              <span className={`text-xs font-mono ${sec.data.error > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                {sec.data.error > 0 ? `⚠️ ${sec.data.error} ERR` : '✅ OK'}
              </span>
            </div>
            
            {expandedSection === sec.id && (
              <div className="mt-4 pt-4 border-t border-slate-700/50 space-y-3 animate-in fade-in slide-in-from-top-2 duration-300">
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>{t('totalUnits')}</span>
                  <span className="text-slate-200">{sec.data.total}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>{t('errorUnits')}</span>
                  <span className={sec.data.error > 0 ? 'text-rose-500' : 'text-slate-200'}>{sec.data.error}</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>{t('recentActivity')}</span>
                  <span className="text-blue-400">+{sec.data.recent} NEW</span>
                </div>
                <div className="flex justify-between text-[10px] font-mono text-slate-400">
                  <span>{t('resolvedUnits')}</span>
                  <span className="text-emerald-400">-{sec.data.resolved} FIXED</span>
                </div>
                <div className="pt-2">
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500" style={{ width: `${(sec.data.total / 20) * 100}%` }}></div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* WORKER OPERATIONAL UNITS */}
      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-bold flex items-center gap-2">
            <span>🤖</span> {t('activeWorkers')}
          </h3>
          <div className="flex gap-2">
            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-black rounded uppercase">94% Healthy</span>
            <span className="px-2 py-1 bg-blue-500/10 text-blue-500 text-[8px] font-black rounded uppercase">6% Busy</span>
          </div>
        </div>
        <div className="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-10 gap-4">
          {data.accounts.slice(0, 20).map((w, i) => (
            <div key={i} className="flex flex-col items-center gap-2 p-2 bg-slate-900/50 rounded-xl border border-slate-800 hover:border-emerald-500/50 transition-all cursor-pointer group">
              <div className="relative">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center text-lg transition-transform group-hover:scale-110 ${
                  w.riskLevel === 'High' ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-800 text-slate-400'
                }`}>
                  {w.riskLevel === 'High' ? '⚠️' : '✅'}
                </div>
                <div className={`absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2 border-[#0d1225] ${
                  w.status === 'Busy' ? 'bg-blue-500' : 'bg-emerald-500'
                }`}></div>
              </div>
              <span className="text-[8px] font-mono text-slate-500 truncate w-full text-center">{w.id}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Resource Load Graph */}
        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
           <div className="flex justify-between items-center mb-8">
             <div>
               <h3 className="text-lg font-bold">{t('automationThroughput')}</h3>
               <p className="text-xs text-slate-500">{t('globalSystemRequests')}</p>
             </div>
             <div className="flex gap-2">
                <div className="flex items-center gap-2 px-3 py-1 bg-slate-900 border border-slate-800 rounded-lg text-[10px] text-slate-400">
                   <span className="w-2 h-2 rounded-full bg-emerald-500"></span> {t('loadStable')}
                </div>
             </div>
           </div>
           <div className="h-72">
             <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="colorVal" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="name" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#0d1225', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                  <Area type="monotone" dataKey="val" stroke="#10b981" fillOpacity={1} fill="url(#colorVal)" strokeWidth={3} />
                </AreaChart>
             </ResponsiveContainer>
           </div>
        </div>

        {/* Infrastructure Health & Risk */}
        <div className="space-y-6">
           <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8 space-y-8">
              <h3 className="text-lg font-bold flex items-center gap-2">
                <span>🛡️</span> {t('infrastructure')}
              </h3>
              
              <div className="space-y-6">
                 {[
                   { l: t('activeWorkers'), v: 88, c: 'emerald' },
                   { l: t('networkTrust'), v: 92, c: 'blue' },
                   { l: t('successRate'), v: 94, c: 'emerald' }
                 ].map((m, i) => (
                   <div key={i} className="space-y-2">
                     <div className="flex justify-between text-[11px] font-bold">
                       <span className="text-slate-400 uppercase tracking-tighter">{m.l}</span>
                       <span className={`text-${m.c}-400`}>{m.v}%</span>
                     </div>
                     <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                       <div className={`h-full bg-${m.c}-500 transition-all duration-1000`} style={{ width: `${m.v}%` }}></div>
                     </div>
                   </div>
                 ))}
              </div>
           </div>

           {/* ADDED: COUNTRY DISTRIBUTION */}
           <div className="bg-gradient-to-br from-indigo-900/20 to-blue-900/20 border border-indigo-500/20 rounded-3xl p-6">
              <div className="flex items-center justify-between mb-4">
                <span className="text-[10px] font-black text-indigo-400 uppercase tracking-widest">Country Distribution</span>
                <span className="text-[10px] bg-indigo-500 text-white px-2 py-0.5 rounded-full">Global</span>
              </div>
              <div className="space-y-2">
                {[
                  { country: 'Spain', count: 12, flag: '🇪🇸' },
                  { country: 'USA', count: 8, flag: '🇺🇸' },
                  { country: 'Japan', count: 5, flag: '🇯🇵' },
                ].map((c, i) => (
                  <div key={i} className="flex items-center justify-between text-xs font-mono">
                    <div className="flex items-center gap-2">
                      <span>{c.flag}</span>
                      <span className="text-slate-300">{c.country}</span>
                    </div>
                    <span className="text-slate-500">{c.count} Workers</span>
                  </div>
                ))}
              </div>
           </div>
        </div>
      </div>
    </div>
  );
};

export default Overview;
