import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../App';
import { TaskType } from '../types';
import { ApiSchedulerTask, enqueueSchedulerJob, listSchedulerQueue } from '../services/backendApi';

type DispatchForm = {
  id: string;
  taskType: string;
  vmId: string;
};

const initialForm: DispatchForm = {
  id: '',
  taskType: TaskType.LLM_INFERENCE,
  vmId: '',
};

const Jobs: React.FC = () => {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<ApiSchedulerTask[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [showDispatch, setShowDispatch] = useState<boolean>(false);
  const [form, setForm] = useState<DispatchForm>(initialForm);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refreshJobs = useCallback(async () => {
    setIsLoading(true);
    try {
      const queue = await listSchedulerQueue();
      setJobs(queue);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load scheduler queue.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshJobs();
    const interval = window.setInterval(() => {
      void refreshJobs();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refreshJobs]);

  const handleDispatch = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setIsSubmitting(true);
      const id = (form.id || `job-${Date.now()}`).trim();
      try {
        await enqueueSchedulerJob({
          id,
          task_type: form.taskType,
          vm_id: form.vmId.trim() || null,
          status: 'Queued',
          progress: 0,
        });
        setInfoText(`Job '${id}' queued.`);
        setErrorText('');
        setShowDispatch(false);
        setForm(initialForm);
        await refreshJobs();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to enqueue job.';
        setErrorText(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [form, refreshJobs]
  );

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black tracking-tight uppercase tracking-widest">{t('jobs')}</h2>
          <p className="text-sm text-slate-500 font-mono">{t('pipelineOrchestrator')}</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void refreshJobs()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowDispatch(true)}
            className="px-6 py-3 bg-gradient-to-r from-blue-600 to-emerald-600 text-white rounded-2xl font-black text-sm shadow-xl shadow-blue-600/20 active:scale-95 transition-all"
          >
            {t('dispatch')}
          </button>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}
      {infoText ? (
        <div className="px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-900/20 text-emerald-300 text-sm">
          {infoText}
        </div>
      ) : null}

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
            {isLoading ? (
              <tr>
                <td className="px-8 py-6 text-sm text-slate-500" colSpan={5}>
                  Loading jobs...
                </td>
              </tr>
            ) : jobs.length === 0 ? (
              <tr>
                <td className="px-8 py-6 text-sm text-slate-500" colSpan={5}>
                  No jobs queued.
                </td>
              </tr>
            ) : (
              jobs.map((job) => {
                const statusLower = job.status.toLowerCase();
                const barClass = statusLower.includes('fail')
                  ? 'bg-rose-500'
                  : statusLower.includes('complete')
                  ? 'bg-emerald-500'
                  : 'bg-blue-500';
                return (
                  <tr key={job.id} className="hover:bg-slate-800/20 transition-colors">
                    <td className="px-8 py-6">
                      <div className="font-bold text-slate-100">{job.task_type}</div>
                      <div className="text-[10px] text-slate-500 font-mono mt-1">{job.id}</div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="text-[10px] text-slate-400 mt-2 font-bold uppercase tracking-tighter">{job.status}</div>
                      {(job.retry_count || 0) > 0 ? (
                        <div className="text-[10px] text-amber-400 mt-1 font-mono">Retry: {job.retry_count}</div>
                      ) : null}
                      {job.error_message ? (
                        <div className="text-[10px] text-rose-400 mt-1 max-w-[280px] truncate" title={job.error_message}>
                          {job.error_message}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-4">
                        <div className="flex-1 h-2 bg-slate-900 rounded-full overflow-hidden max-w-[150px]">
                          <div className={`h-full transition-all duration-1000 ${barClass}`} style={{ width: `${job.progress}%` }}></div>
                        </div>
                        <span className="text-xs font-mono font-bold text-slate-300">{job.progress}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <span className="text-xs font-mono text-slate-400">{job.vm_id || 'AUTO'}</span>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button
                        onClick={() => void refreshJobs()}
                        className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors"
                      >
                        Refresh
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
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
                  type="text"
                  placeholder="job-<timestamp>"
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                  value={form.id}
                  onChange={(event) => setForm((prev) => ({ ...prev, id: event.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">{t('modelObjective')}</label>
                <select
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold cursor-pointer"
                  value={form.taskType}
                  onChange={(event) => setForm((prev) => ({ ...prev, taskType: event.target.value }))}
                >
                  <option value={TaskType.TRAINING}>{t('hyperparameterTraining')}</option>
                  <option value={TaskType.LLM_INFERENCE}>{t('distributedLlmBatch')}</option>
                  <option value={TaskType.STABLE_DIFFUSION}>{t('imageLatentGeneration')}</option>
                  <option value={TaskType.DATA_PROCESSING}>{t('computeIntensiveEtl')}</option>
                </select>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-widest">VM ID (optional)</label>
                <input
                  type="text"
                  placeholder="vm1"
                  className="w-full bg-slate-900 border border-slate-800 rounded-2xl px-5 py-4 outline-none focus:ring-2 focus:ring-blue-500 transition-all font-bold"
                  value={form.vmId}
                  onChange={(event) => setForm((prev) => ({ ...prev, vmId: event.target.value }))}
                />
              </div>
              <div className="flex gap-4 pt-6">
                <button
                  type="button"
                  onClick={() => setShowDispatch(false)}
                  className="flex-1 py-4 bg-slate-800 hover:bg-slate-700 rounded-2xl font-bold transition-all uppercase text-xs tracking-widest"
                >
                  {t('abort')}
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-2 py-4 bg-gradient-to-r from-blue-600 to-emerald-600 text-white rounded-2xl font-black transition-all uppercase text-xs tracking-widest shadow-xl shadow-blue-600/20 disabled:opacity-50"
                >
                  {isSubmitting ? 'Submitting...' : t('initPipeline')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Jobs;
