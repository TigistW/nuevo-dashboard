
import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  delta?: string | number;
  deltaColor?: 'emerald' | 'rose';
  icon: string;
}

const StatCard: React.FC<StatCardProps> = ({ label, value, delta, deltaColor = 'emerald', icon }) => {
  return (
    <div className="bg-slate-800 p-6 rounded-xl border border-slate-700 hover:border-emerald-500/50 transition-all shadow-lg">
      <div className="flex justify-between items-start mb-4">
        <div className="text-3xl p-2 bg-slate-900 rounded-lg">{icon}</div>
        {delta && (
          <span className={`text-xs font-semibold px-2 py-1 rounded ${
            deltaColor === 'emerald' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-rose-500/10 text-rose-500'
          }`}>
            {delta > 0 ? '+' : ''}{delta}
          </span>
        )}
      </div>
      <div className="space-y-1">
        <p className="text-slate-400 text-sm font-medium">{label}</p>
        <p className="text-3xl font-bold tracking-tight">{value}</p>
      </div>
    </div>
  );
};

export default StatCard;
