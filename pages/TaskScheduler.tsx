
import React, { useState } from 'react';
import { useTranslation } from '../App';

interface Job {
  id: string;
  task: string;
  vm: string;
  status: 'Queued' | 'Running' | 'Completed' | 'Failed';
  progress: number;
}

const TaskScheduler: React.FC = () => {
  const { t } = useTranslation();
  const [jobs] = useState<Job[]>([
    { id: 'job-101', task: 'LLM Inference Batch', vm: 'vm-001', status: 'Running', progress: 65 },
    { id: 'job-102', task: 'Stable Diffusion Latent', vm: 'vm-002', status: 'Queued', progress: 0 },
    { id: 'job-103', task: 'Data ETL Process', vm: 'vm-003', status: 'Completed', progress: 100 },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('taskScheduler')}</h2>
          <p className="text-sm text-slate-500 font-mono">Distributed Job Queue & Load Balancing</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">
          + New Job
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
            <div className="p-6 border-b border-slate-800 bg-slate-900/50 flex justify-between items-center">
              <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">{t('jobQueue')}</h3>
              <span className="text-[10px] font-mono text-slate-500">Total: {jobs.length}</span>
            </div>
            <div className="divide-y divide-slate-800">
              {jobs.map((job) => (
                <div key={job.id} className="p-6 hover:bg-slate-800/30 transition-colors">
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <h4 className="text-sm font-bold text-slate-200">{job.task}</h4>
                      <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">ID: {job.id} // Target: {job.vm}</p>
                    </div>
                    <span className={`px-2 py-1 rounded text-[9px] font-black uppercase tracking-widest ${
                      job.status === 'Running' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                      job.status === 'Completed' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                      'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}>
                      {job.status}
                    </span>
                  </div>
                  <div className="space-y-2">
                    <div className="flex justify-between text-[9px] font-bold uppercase text-slate-500">
                      <span>Progress</span>
                      <span>{job.progress}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-900 rounded-full overflow-hidden">
                      <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${job.progress}%` }}></div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
            <h3 className="text-lg font-bold mb-6 italic uppercase tracking-tighter">{t('loadBalancing')}</h3>
            <div className="space-y-6">
              {[
                { vm: 'vm-001', load: 85 },
                { vm: 'vm-002', load: 12 },
                { vm: 'vm-003', load: 45 },
              ].map((node) => (
                <div key={node.vm} className="space-y-2">
                  <div className="flex justify-between text-[10px] font-black uppercase tracking-widest">
                    <span className="text-slate-400">{node.vm}</span>
                    <span className={node.load > 80 ? 'text-rose-500' : 'text-slate-500'}>{node.load}%</span>
                  </div>
                  <div className="h-1 w-full bg-slate-900 rounded-full overflow-hidden">
                    <div className={`h-full transition-all duration-500 ${node.load > 80 ? 'bg-rose-500' : 'bg-emerald-500'}`} style={{ width: `${node.load}%` }}></div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-emerald-900/20 to-blue-900/20 border border-emerald-500/20 rounded-3xl p-8">
            <h3 className="text-sm font-black mb-4 italic uppercase tracking-tighter">Scheduler Strategy</h3>
            <div className="space-y-3">
              <button className="w-full py-2 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase">Least Loaded First</button>
              <button className="w-full py-2 bg-slate-800 text-slate-500 border border-slate-700 rounded-xl text-[10px] font-black uppercase">Round Robin</button>
              <button className="w-full py-2 bg-slate-800 text-slate-500 border border-slate-700 rounded-xl text-[10px] font-black uppercase">Priority Based</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaskScheduler;
