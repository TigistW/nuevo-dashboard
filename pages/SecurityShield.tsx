
import React from 'react';
import { useTranslation } from '../App';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const SecurityShield: React.FC = () => {
  const { t } = useTranslation();

  const threatData = [
    { time: '00:00', threats: 12 },
    { time: '04:00', threats: 45 },
    { time: '08:00', threats: 28 },
    { time: '12:00', threats: 89 },
    { time: '16:00', threats: 34 },
    { time: '20:00', threats: 56 },
  ];

  const recentIntrusions = [
    { id: '1', ip: '192.168.1.45', type: 'Port Scan', time: '2 mins ago', status: 'Blocked' },
    { id: '2', ip: '45.12.3.88', type: 'SSH Brute Force', time: '15 mins ago', status: 'Blocked' },
    { id: '3', ip: '104.21.5.9', type: 'DDoS Attempt', time: '1 hour ago', status: 'Mitigated' },
    { id: '4', ip: '172.16.0.12', type: 'Unauthorized Access', time: '3 hours ago', status: 'Blocked' }
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('securityShield')}</h2>
          <p className="text-sm text-slate-500 font-mono">Real-time intrusion detection & network hardening</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-xs font-black uppercase text-emerald-500 tracking-widest">Active Protection</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Threat Level Chart */}
        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <div className="flex justify-between items-center mb-8">
            <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('threatMap')}</h3>
            <span className="text-[10px] font-mono text-rose-500">Global Attack Vectors</span>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={threatData}>
                <defs>
                  <linearGradient id="colorThreat" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis dataKey="time" stroke="#475569" fontSize={10} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ backgroundColor: '#0d1225', border: 'none', borderRadius: '12px', fontSize: '10px' }} />
                <Area type="monotone" dataKey="threats" stroke="#f43f5e" fillOpacity={1} fill="url(#colorThreat)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Security Stats */}
        <div className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-sm space-y-8">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">Security Stats</h3>
          <div className="space-y-6">
            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Total Blocked</p>
              <p className="text-3xl font-black text-rose-500">1,245</p>
            </div>
            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Active Rules</p>
              <p className="text-3xl font-black text-blue-500">42</p>
            </div>
            <div className="p-4 bg-slate-900/50 border border-slate-800 rounded-2xl">
              <p className="text-[10px] font-black text-slate-500 uppercase mb-1">Isolation Score</p>
              <p className="text-3xl font-black text-emerald-500">99.8%</p>
            </div>
          </div>
        </div>
      </div>

      {/* Blocked Intrusions Table */}
      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="p-6 border-b border-slate-800">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-500">{t('blockedIntrusions')}</h3>
        </div>
        <table className="w-full text-left">
          <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
            <tr>
              <th className="px-8 py-5">Source IP</th>
              <th className="px-8 py-5">Attack Type</th>
              <th className="px-8 py-5">Timestamp</th>
              <th className="px-8 py-5 text-right">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800">
            {recentIntrusions.map(intrusion => (
              <tr key={intrusion.id} className="hover:bg-slate-800/30 transition-colors">
                <td className="px-8 py-6 font-mono text-xs text-slate-300">{intrusion.ip}</td>
                <td className="px-8 py-6 text-xs font-bold text-slate-400">{intrusion.type}</td>
                <td className="px-8 py-6 text-xs text-slate-500">{intrusion.time}</td>
                <td className="px-8 py-6 text-right">
                  <span className="px-2 py-1 bg-rose-500/10 text-rose-500 text-[9px] font-black rounded uppercase border border-rose-500/20">
                    {intrusion.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default SecurityShield;
