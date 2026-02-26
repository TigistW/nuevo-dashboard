
import React, { useState } from 'react';
import { useTranslation } from '../App';

const ResourceGuardrails: React.FC = () => {
  const { t } = useTranslation();
  const [limits, setLimits] = useState({
    maxVms: 50,
    minHostRam: 2048,
    maxCpuPerVm: 2,
    overloadPrevention: true
  });

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('resourceGuardrails')}</h2>
          <p className="text-sm text-slate-500 font-mono">Host Protection & Global Execution Limits</p>
        </div>
        <button className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-emerald-600/20 transition-all">
          {t('saveConfig')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-8 flex items-center gap-3">
            <span className="text-blue-500">🛡️</span> {t('hostProtection')}
          </h3>
          <div className="space-y-8">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black uppercase text-slate-400 tracking-widest">Max Simultaneous Micro-VMs</label>
                <span className="text-sm font-mono font-bold text-blue-500">{limits.maxVms}</span>
              </div>
              <input type="range" min="1" max="100" value={limits.maxVms} onChange={e => setLimits({...limits, maxVms: parseInt(e.target.value)})} className="w-full accent-blue-500" />
            </div>

            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <label className="text-xs font-black uppercase text-slate-400 tracking-widest">Reserved Host RAM (MB)</label>
                <span className="text-sm font-mono font-bold text-blue-500">{limits.minHostRam} MB</span>
              </div>
              <input type="range" min="512" max="8192" step="512" value={limits.minHostRam} onChange={e => setLimits({...limits, minHostRam: parseInt(e.target.value)})} className="w-full accent-blue-500" />
            </div>

            <div className="flex items-center justify-between p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
              <div>
                <p className="text-sm font-bold text-slate-200">Overload Prevention</p>
                <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Auto-block new deployments if load {'>'} 90%</p>
              </div>
              <button 
                onClick={() => setLimits({...limits, overloadPrevention: !limits.overloadPrevention})}
                className={`w-12 h-6 rounded-full transition-all relative ${limits.overloadPrevention ? 'bg-emerald-500' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${limits.overloadPrevention ? 'left-7' : 'left-1'}`}></div>
              </button>
            </div>
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-gradient-to-br from-indigo-900/20 to-purple-900/20 border border-indigo-500/20 rounded-3xl p-8">
            <h3 className="text-sm font-black mb-6 italic uppercase tracking-tighter text-indigo-400">Cost & Resource Estimator</h3>
            <div className="space-y-6">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Estimated Monthly Cost</p>
                  <p className="text-3xl font-black text-white">$142.50 <span className="text-xs font-normal text-slate-500 italic">/ month</span></p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-1">Efficiency Score</p>
                  <p className="text-xl font-black text-emerald-500">94%</p>
                </div>
              </div>
              <div className="h-2 w-full bg-slate-900 rounded-full overflow-hidden">
                <div className="h-full bg-indigo-500" style={{ width: '75%' }}></div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="text-[10px] text-slate-400 font-mono">
                  <span className="text-indigo-400">●</span> Compute: $84.00
                </div>
                <div className="text-[10px] text-slate-400 font-mono">
                  <span className="text-purple-400">●</span> Network: $58.50
                </div>
              </div>
            </div>
          </div>

          <div className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-sm">
            <h3 className="text-sm font-black mb-6 italic uppercase tracking-tighter">Current Host Usage</h3>
            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">CPU Load</p>
                <p className="text-2xl font-black text-emerald-500">24%</p>
              </div>
              <div className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">RAM Usage</p>
                <p className="text-2xl font-black text-blue-500">4.2GB</p>
              </div>
            </div>
          </div>

          <div className="bg-rose-900/10 border border-rose-500/20 rounded-3xl p-8">
            <h3 className="text-sm font-black mb-4 italic uppercase tracking-tighter text-rose-500">Critical Alerts</h3>
            <div className="space-y-3">
              <div className="flex items-center gap-3 text-xs text-rose-400">
                <span>⚠️</span>
                <span>Host RAM reached 85% threshold at 14:22</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-rose-400">
                <span>⚠️</span>
                <span>Deployment blocked: CPU overload prevention active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResourceGuardrails;
