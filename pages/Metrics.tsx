
import React, { useState, useEffect } from 'react';
import { 
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
  BarChart, Bar, Legend, Cell, AreaChart, Area
} from 'recharts';
import { loadData } from '../services/state';
import { useTranslation } from '../App';

const Metrics: React.FC = () => {
  const { t } = useTranslation();
  const [data] = useState(loadData());

  const hourlyData = [
    { time: '08:00', tasks: 12, gpu: 85 },
    { time: '10:00', tasks: 18, gpu: 92 },
    { time: '12:00', tasks: 24, gpu: 78 },
    { time: '14:00', tasks: 32, gpu: 95 },
    { time: '16:00', tasks: 28, gpu: 88 },
    { time: '18:00', tasks: 20, gpu: 60 },
    { time: '20:00', tasks: 15, gpu: 45 },
  ];

  const gpuUsageData = data.accounts.map(acc => ({
    name: acc.email.split('@')[0],
    usage: Math.floor(Math.random() * 80) + 20,
    cost: Math.floor(Math.random() * 15) + 5
  }));

  return (
    <div className="space-y-8 pb-12">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Tasks History */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
          <h3 className="text-lg font-bold mb-6">{t('tasksCompleted24h')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={hourlyData}>
                <defs>
                  <linearGradient id="colorTasks" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="time" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                  itemStyle={{ color: '#fff' }}
                />
                <Area type="monotone" dataKey="tasks" stroke="#10b981" fillOpacity={1} fill="url(#colorTasks)" strokeWidth={3} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Resource Consumption */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl">
          <h3 className="text-lg font-bold mb-6">{t('gpuUtilizationPerAccount')}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={gpuUsageData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" vertical={false} />
                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#1e293b', border: 'none', borderRadius: '8px' }}
                />
                <Bar dataKey="usage" radius={[4, 4, 0, 0]}>
                  {gpuUsageData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.usage > 70 ? '#f43f5e' : '#3b82f6'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Activity Heatmap Simulated Card */}
        <div className="bg-slate-800 p-6 rounded-2xl border border-slate-700 shadow-xl col-span-1 lg:col-span-2">
          <h3 className="text-lg font-bold mb-6">{t('clusterHeatmap')}</h3>
          <div className="grid grid-cols-12 gap-2">
            {Array.from({ length: 24 }).map((_, i) => (
              <div key={i} className="space-y-1">
                <div className={`h-8 rounded-sm ${i > 8 && i < 18 ? 'bg-emerald-500' : 'bg-emerald-900/50'}`}></div>
                <div className="text-[10px] text-slate-500 text-center">{i}h</div>
              </div>
            ))}
          </div>
          <div className="mt-6 flex justify-center gap-6 text-sm text-slate-400">
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-900/50 rounded-sm"></div> {t('lowActivity')}</div>
            <div className="flex items-center gap-2"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div> {t('highActivity')}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Metrics;
