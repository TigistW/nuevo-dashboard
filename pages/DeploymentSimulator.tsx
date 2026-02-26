
import React, { useState } from 'react';
import { useTranslation } from '../App';

const DeploymentSimulator: React.FC = () => {
  const { t } = useTranslation();
  const [isSimulating, setIsSimulating] = useState(false);
  const [results, setResults] = useState<null | any[]>(null);

  const runSimulation = () => {
    setIsSimulating(true);
    setTimeout(() => {
      setResults([
        { check: 'Host RAM Availability', status: 'Passed', detail: '4.2GB free, 128MB required' },
        { check: 'CPU Capacity', status: 'Passed', detail: 'Load 24%, threshold 90%' },
        { check: 'Network Namespace Conflict', status: 'Passed', detail: 'No existing namespace for vm-009' },
        { check: 'WireGuard Tunnel Validity', status: 'Passed', detail: 'wg-es-01 is active and reachable' },
        { check: 'Rootfs Template Integrity', status: 'Passed', detail: 'Checksum verified for alpine-v3.18' },
      ]);
      setIsSimulating(false);
    }, 1500);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('deploymentSimulator')}</h2>
          <p className="text-sm text-slate-500 font-mono">Pre-Deployment Validation & Conflict Detection</p>
        </div>
        <button 
          onClick={runSimulation}
          disabled={isSimulating}
          className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-blue-600/20 transition-all disabled:opacity-50"
        >
          {isSimulating ? 'Validating...' : t('simulateDeployment')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6">Simulation Parameters</h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Target VM ID</label>
              <input type="text" defaultValue="vm-009" className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs outline-none" />
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Template</label>
              <select className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs outline-none">
                <option>Alpine Minimal v3.18</option>
                <option>Ubuntu Core 24.04</option>
              </select>
            </div>
            <div className="space-y-2">
              <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">Exit Node</label>
              <select className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs outline-none">
                <option>Spain (wg-es-01)</option>
                <option>USA (wg-us-01)</option>
              </select>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6">{t('validationResults')}</h3>
          {!results && !isSimulating && (
            <div className="flex flex-col items-center justify-center h-64 text-slate-600 italic">
              <div className="text-4xl mb-4">🧪</div>
              <p>Configure parameters and run simulation to validate deployment.</p>
            </div>
          )}
          {isSimulating && (
            <div className="flex flex-col items-center justify-center h-64">
              <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4"></div>
              <p className="text-sm font-mono text-slate-500 animate-pulse">Running pre-flight checks...</p>
            </div>
          )}
          {results && (
            <div className="space-y-4">
              {results.map((res, i) => (
                <div key={i} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-800 animate-in slide-in-from-left-4 duration-300" style={{ animationDelay: `${i * 100}ms` }}>
                  <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-emerald-500/10 text-emerald-500 flex items-center justify-center text-xs">✓</div>
                    <div>
                      <p className="text-xs font-bold text-slate-200">{res.check}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{res.detail}</p>
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{res.status}</span>
                </div>
              ))}
              <div className="mt-8 p-6 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl text-center">
                <p className="text-sm font-bold text-emerald-500 mb-1">Deployment Safe</p>
                <p className="text-[10px] text-emerald-600 font-mono uppercase">All checks passed. System ready for execution.</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default DeploymentSimulator;
