
import React, { useState, useEffect } from 'react';
import { loadData, createJob } from '../services/state';
import { JobStatus, TaskType } from '../types';
import { useTranslation } from '../App';

const Jobs: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(loadData());
  const [showDispatch, setShowDispatch] = useState(false);

  const [jobName, setJobName] = useState('');
  const [jobType, setJobType] = useState(TaskType.LLM_INFERENCE);

  useEffect(() => {
    const it = setInterval(() => setData(loadData()), 5000);
    return () => clearInterval(it);
  }, []);

  const handleDispatch = (e: React.FormEvent) => {
    e.preventDefault();
    createJob(jobName, jobType, 'High');
    setShowDispatch(false);
    setJobName('');
    setData(loadData());
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight uppercase tracking-widest">{t('jobs')}</h2>
          <p className="text-sm text-slate-500 font-mono">{t('pipelineOrchestrator')}</p>
        </div>
        <button 
          onClick={() => setShowDispatch(true)}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
        >
          {t('dispatch')}
        </button>
      </div>

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
         <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
               <tr>
                  <th className="px-8 py-5">{t('pipelineDefinition')}</th>
                  <th className="px-8 py-5">{t('currentExecutionStage')}</th>
                  <th className="px-8 py-5">{t('loadProgress')}</th>
                  <th className="px-8 py-5">{t('assignedUnits')}</th>
                  <th className="px-8 py-5 text-right">{t('control')}</th>
               </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
               {data.jobs.map(job => (
                 <tr key={job.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-3">
                          <div className="font-bold text-slate-100">{job.name}</div>
                          {job.retryCount > 0 && (
                            <span className="text-[9px] bg-amber-500/10 text-amber-500 px-1.5 py-0.5 rounded border border-amber-500/20 font-mono">RETRY_{job.retryCount}</span>
                          )}
                       </div>
                       <div className="text-[10px] text-slate-500 font-mono mt-1">{job.id} // {job.priority} {t('priority')}</div>
                    </td>
                    <td className="px-8 py-6">
                       {/* STAGE VISUALIZER */}
                       <div className="flex gap-1.5">
                          {job.stages?.map((stage, idx) => (
                             <div 
                                key={idx} 
                                title={stage.name}
                                className={`w-8 h-1.5 rounded-full ${
                                   stage.status === 'done' ? 'bg-emerald-500 shadow-[0_0_8px_#10b981]' : 
                                   stage.status === 'active' ? 'bg-blue-500 animate-pulse shadow-[0_0_8px_#3b82f6]' : 
                                   'bg-slate-800'
                                }`}
                             ></div>
                          ))}
                       </div>
                       <div className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-tighter">
                          {job.stages?.find(s => s.status === 'active')?.name || t('completed')}
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex items-center gap-4">
                          <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden max-w-[150px]">
                             <div className={`h-full transition-all duration-1000 ${
                               job.status === JobStatus.ACTIVE ? 'bg-blue-500' : 'bg-emerald-500'
                             }`} style={{ width: `${job.progress}%` }}></div>
                          </div>
                          <span className="text-xs font-mono font-bold text-slate-300">{job.progress}%</span>
                       </div>
                    </td>
                    <td className="px-8 py-6">
                       <div className="flex -space-x-3 overflow-hidden">
                          {job.tasksIds.map((tid, idx) => (
                            <div key={tid} className="inline-block h-8 w-8 rounded-full border-2 border-[#0d1225] bg-slate-800 flex items-center justify-center text-[10px] font-bold text-slate-400 hover:z-10 transition-transform cursor-help">
                              W{idx+1}
                            </div>
                          ))}
                       </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                       <div className="flex justify-end gap-2">
                          <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">⚙️</button>
                          <button className="p-2 hover:bg-slate-800 rounded-lg text-rose-500 transition-colors">🛑</button>
                       </div>
                    </td>
                 </tr>
               ))}
            </tbody>
         </table>
      </div>

      {showDispatch && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-6">
           <div className="bg-[#0d1225] border border-slate-700 w-full max-w-lg rounded-3xl p-10 shadow-3xl animate-in zoom-in-95 duration-200">
              <h3 className="text-2xl font-black mb-2 italic">{t('newPipelineOrchestration')}</h3>
              <p className="text-slate-500 text-sm mb-8">{t('defineObjective')}</p>
              
              <form onSubmit={handleDispatch} className="space-y-6">
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{t('pipelineIdName')}</label>
                    <input 
                      type="text" required placeholder={t('pipelineIdName') + " ..."}
                      className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                      value={jobName} onChange={e => setJobName(e.target.value)}
                    />
                 </div>
                 <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{t('modelObjective')}</label>
                    <select 
                       className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold cursor-pointer"
                       value={jobType} onChange={e => setJobType(e.target.value as any)}
                    >
                       <option value={TaskType.TRAINING}>{t('hyperparameterTraining')}</option>
                       <option value={TaskType.LLM_INFERENCE}>{t('distributedLlmBatch')}</option>
                       <option value={TaskType.STABLE_DIFFUSION}>{t('imageLatentGeneration')}</option>
                       <option value={TaskType.DATA_PROCESSING}>{t('computeIntensiveEtl')}</option>
                    </select>
                 </div>
                 <div className="flex gap-4 pt-6">
                    <button type="button" onClick={() => setShowDispatch(false)} className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold transition-all uppercase text-xs tracking-widest">{t('abort')}</button>
                    <button type="submit" className="flex-2 py-4 bg-gradient-to-r from-blue-600 to-emerald-600 text-white rounded-2xl font-black transition-all uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20">{t('initPipeline')}</button>
                 </div>
              </form>
           </div>
        </div>
      )}
    </div>
  );
};

export default Jobs;
