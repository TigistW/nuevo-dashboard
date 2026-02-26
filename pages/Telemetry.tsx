
import React from 'react';
import { useTranslation } from '../App';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

const data = [
  { name: '00:00', uptime: 98, stability: 95, load: 20 },
  { name: '04:00', uptime: 99, stability: 97, load: 15 },
  { name: '08:00', uptime: 95, stability: 90, load: 45 },
  { name: '12:00', uptime: 97, stability: 92, load: 60 },
  { name: '16:00', uptime: 99, stability: 98, load: 35 },
  { name: '20:00', uptime: 98, stability: 96, load: 25 },
];

const Telemetry: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('telemetry')}</h2>
          <p className="text-sm text-slate-500 font-mono">Historical Performance & Stability Metrics</p>
        </div>
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          {['24h', '7d', '30d'].map(p => (
            <button key={p} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${p === '24h' ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6 italic uppercase tracking-tighter">{t('stabilityByNode')}</h3>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="colorStab" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
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
              <LineChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" vertical={false} />
                <XAxis dataKey="name" stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#64748b" fontSize={10} tickLine={false} axisLine={false} domain={[80, 100]} />
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
        {[
          { label: 'Total Rotations', value: '142', trend: '+12%' },
          { label: 'Avg Latency', value: '85ms', trend: '-5ms' },
          { label: 'Success Rate', value: '99.4%', trend: '+0.2%' },
          { label: 'Total Traffic', value: '1.2TB', trend: '+150GB' },
        ].map((stat, i) => (
          <div key={i} className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6">
            <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-black">{stat.value}</p>
              <p className="text-[10px] text-emerald-500 font-bold">{stat.trend}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Telemetry;
