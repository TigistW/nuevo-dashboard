
import React, { useState, useEffect } from 'react';
import { loadData } from '../services/state';
import { AccountStatus, WorkerLifecycleState } from '../types';
import { useTranslation } from '../App';

const Workers: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(loadData());
  const [expandedWorker, setExpandedWorker] = useState<string | null>(null);

  useEffect(() => {
    const it = setInterval(() => setData(loadData()), 5000);
    return () => clearInterval(it);
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight uppercase italic">{t('workers')}</h2>
          <p className="text-sm text-slate-500 font-mono italic">Worker-Centric Operational Control</p>
        </div>
        <div className="flex gap-3">
           <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700">{t('clusterReboot')}</button>
           <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">{t('addWorker')}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
        {data.workers.map((worker) => (
          <div key={worker.id} className="bg-[#0d1225] border border-slate-800 rounded-3xl p-6 hover:border-blue-500/30 transition-all group overflow-hidden relative flex flex-col">
            {/* Status Indicator Bar */}
            <div className={`absolute top-0 left-0 w-full h-1 ${
              worker.lifecycleState === WorkerLifecycleState.ACTIVE ? 'bg-emerald-500' :
              worker.lifecycleState === WorkerLifecycleState.WARMING ? 'bg-amber-500' : 
              worker.lifecycleState === WorkerLifecycleState.FLAGGED ? 'bg-rose-500' : 'bg-slate-500'
            }`}></div>

            <div className="flex justify-between items-start mb-6">
               <div className="flex items-center gap-3">
                 <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg bg-slate-800 text-slate-500`}>
                   {worker.riskScore > 50 ? '⚠️' : '🤖'}
                 </div>
                 <div>
                   <h4 className="font-bold text-sm truncate max-w-[150px]">{worker.id}</h4>
                   <div className="flex items-center gap-2 mt-0.5">
                      <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">{worker.vmId} // {worker.networkId}</p>
                      <span className={`w-1.5 h-1.5 rounded-full animate-pulse ${worker.trustScore > 90 ? 'bg-emerald-500' : 'bg-amber-500'}`}></span>
                   </div>
                 </div>
               </div>
               <div className="text-right">
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-black uppercase ${
                     worker.lifecycleState === WorkerLifecycleState.ACTIVE ? 'bg-emerald-500/10 text-emerald-500' : 
                     worker.lifecycleState === WorkerLifecycleState.WARMING ? 'bg-amber-500/10 text-amber-400' : 
                     worker.lifecycleState === WorkerLifecycleState.FLAGGED ? 'bg-rose-500/10 text-rose-500' : 'bg-slate-500/10 text-slate-500'
                  }`}>
                    {worker.lifecycleState}
                  </span>
                  <p className="text-[9px] text-slate-600 mt-1 font-mono italic">Trust: {worker.trustScore}/100</p>
               </div>
            </div>

            {/* IDENTITY INFO */}
            <div className="bg-slate-900/30 rounded-2xl p-4 border border-slate-800/50 mb-6 space-y-3">
               <div className="flex justify-between items-center text-[10px]">
                 <span className="text-slate-500 uppercase font-bold">{t('fingerprint')}</span>
                 <span className="text-slate-300 font-mono">{worker.fingerprintId}</span>
               </div>
               <div className="flex justify-between items-center text-[10px]">
                 <span className="text-slate-500 uppercase font-bold">{t('verification')}</span>
                 <span className={`font-mono ${worker.verificationStatus === 'Verified' ? 'text-emerald-500' : 'text-amber-500'}`}>{worker.verificationStatus}</span>
               </div>
               <div className="flex justify-between items-center text-[10px]">
                 <span className="text-slate-500 uppercase font-bold">{t('workflow')}</span>
                 <span className="text-blue-400 font-mono truncate max-w-[120px]">{worker.activeWorkflowId || 'None'}</span>
               </div>
            </div>

            {/* Health Bars */}
            <div className="space-y-4 flex-1">
               <div className="flex items-center gap-4">
                  <div className="flex-1 space-y-1">
                     <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                        <span>CPU</span>
                        <span>{worker.metrics.cpu}%</span>
                     </div>
                     <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500" style={{ width: `${worker.metrics.cpu}%` }}></div>
                     </div>
                  </div>
                  <div className="flex-1 space-y-1">
                     <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                        <span>RAM</span>
                        <span>{worker.metrics.ram}%</span>
                     </div>
                     <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500" style={{ width: `${worker.metrics.ram}%` }}></div>
                     </div>
                  </div>
               </div>
            </div>

            {/* TIMELINE TOGGLE */}
            {expandedWorker === worker.id && (
              <div className="mt-6 pt-6 border-t border-slate-800 space-y-4 animate-in slide-in-from-top-2 duration-300">
                <h5 className="text-[10px] font-black uppercase tracking-widest text-slate-500">{t('workerTimeline')}</h5>
                <div className="space-y-3">
                  {worker.history.map((h: any, idx: number) => (
                    <div key={idx} className="flex gap-3 items-start relative">
                      {idx !== worker.history.length - 1 && (
                        <div className="absolute left-[3px] top-3 w-[1px] h-full bg-slate-800"></div>
                      )}
                      <div className={`w-2 h-2 rounded-full mt-1 z-10 ${
                        h.state === WorkerLifecycleState.ACTIVE ? 'bg-emerald-500' :
                        h.state === WorkerLifecycleState.FLAGGED ? 'bg-rose-500' : 'bg-slate-700'
                      }`}></div>
                      <div>
                        <p className="text-[10px] font-bold text-slate-300">{h.event}</p>
                        <p className="text-[8px] text-slate-500 font-mono">{h.timestamp}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="mt-6 flex gap-2">
               <button 
                onClick={() => setExpandedWorker(expandedWorker === worker.id ? null : worker.id)}
                className="flex-1 py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-bold border border-slate-800 transition-colors"
               >
                 {expandedWorker === worker.id ? 'Hide Timeline' : 'View Timeline'}
               </button>
               <button className="px-3 py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-bold border border-slate-800 transition-colors">⚙️</button>
               <button className="px-3 py-2 bg-rose-900/20 hover:bg-rose-900/40 rounded-xl text-xs border border-rose-500/20 text-rose-500 transition-all">🛑</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default Workers;
