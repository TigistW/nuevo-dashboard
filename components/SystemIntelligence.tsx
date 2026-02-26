
import React from 'react';
import { useTranslation } from '../App';

const SystemIntelligence: React.FC = () => {
  const { t } = useTranslation();

  const stats = [
    { label: t('activeTotalVms'), value: '12 / 50', icon: '📦', color: 'text-blue-500' },
    { label: t('activeTunnels'), value: '8 / 12', icon: '🌐', color: 'text-emerald-500' },
    { label: t('functionalIps'), value: '94%', icon: '✅', color: 'text-emerald-400' },
    { label: t('hostResources'), value: '24% CPU / 4.2GB RAM', icon: '🛡️', color: 'text-blue-400' },
    { label: t('recentReboots'), value: '3', icon: '🔄', color: 'text-amber-500' },
    { label: t('errorRate'), value: '0.02%', icon: '⚠️', color: 'text-rose-500' },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-8">
      {stats.map((stat, i) => (
        <div key={i} className="bg-[#0d1225] border border-slate-800 rounded-2xl p-4 flex flex-col justify-between hover:border-slate-700 transition-all group">
          <div className="flex justify-between items-start mb-2">
            <span className="text-lg opacity-80 group-hover:scale-110 transition-transform">{stat.icon}</span>
            <span className={`text-[10px] font-black uppercase tracking-widest ${stat.color}`}>{stat.value.split(' ')[0]}</span>
          </div>
          <div>
            <p className="text-[9px] font-black text-slate-500 uppercase tracking-widest mb-1">{stat.label}</p>
            <p className="text-xs font-bold text-slate-200 truncate">{stat.value}</p>
          </div>
        </div>
      ))}
    </div>
  );
};

export default SystemIntelligence;
