import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiSchedulerConfig,
  ApiSchedulerTask,
  ApiSchedulerTickResult,
  getSchedulerConfig,
  listSchedulerQueue,
  tickFootprint,
  tickNotebookSessions,
  triggerSchedulerTick,
} from '../services/backendApi';

const TaskScheduler: React.FC = () => {
  const [config, setConfig] = useState<ApiSchedulerConfig | null>(null);
  const [tasks, setTasks] = useState<ApiSchedulerTask[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [schedulerTickResult, setSchedulerTickResult] = useState<ApiSchedulerTickResult | null>(null);
  const [notebookTickResult, setNotebookTickResult] = useState<string>('');
  const [footprintTickResult, setFootprintTickResult] = useState<string>('');
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [cfg, queue] = await Promise.all([getSchedulerConfig(), listSchedulerQueue()]);
      setConfig(cfg);
      setTasks(queue);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load scheduler state.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 6000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const taskCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const task of tasks) {
      const key = String(task.status || 'Unknown');
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }, [tasks]);

  const runSchedulerTick = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await triggerSchedulerTick();
      setSchedulerTickResult(result);
      setInfoText(
        `Scheduler tick done: dispatched=${result.dispatched}, warmup=${result.warmup_jobs_enqueued}, queued=${result.queued_jobs}, active=${result.active_jobs}.`
      );
      setErrorText('');
      await refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Scheduler tick failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, [refresh]);

  const runNotebookTick = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await tickNotebookSessions();
      const text = `updated=${result.updated}, rotated=${result.rotated}, resting=${result.resting}, warnings=${result.warnings}`;
      setNotebookTickResult(text);
      setInfoText(`Notebook care tick: ${text}`);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Notebook tick failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const runFootprintTick = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await tickFootprint();
      const text = `scheduled=${result.scheduled}, executed=${result.executed}`;
      setFootprintTickResult(text);
      setInfoText(`Footprint tick: ${text}`);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Footprint tick failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">Task Scheduler</h2>
          <p className="text-sm text-slate-500 font-mono">Queue, autonomous ticks, and warm-up orchestration</p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={isBusy}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border border-slate-700"
        >
          Refresh
        </button>
      </div>

      {config ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Concurrency</p>
            <p className="text-2xl font-black">{config.concurrency_limit}</p>
          </div>
          <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Backoff / Tick</p>
            <p className="text-2xl font-black">
              {config.backoff_base_seconds}s / {config.tick_seconds}s
            </p>
          </div>
          <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-4">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Warm-up</p>
            <p className="text-2xl font-black">
              {config.warmup_enabled ? 'ON' : 'OFF'} ({config.warmup_interval_minutes}m)
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <button
          onClick={() => void runSchedulerTick()}
          disabled={isBusy}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
        >
          Run Scheduler Tick
        </button>
        <button
          onClick={() => void runNotebookTick()}
          disabled={isBusy}
          className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
        >
          Run Notebook Tick
        </button>
        <button
          onClick={() => void runFootprintTick()}
          disabled={isBusy}
          className="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
        >
          Run Footprint Tick
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Scheduler Tick</p>
          <p className="text-xs text-slate-300 font-mono">
            {schedulerTickResult
              ? `dispatched=${schedulerTickResult.dispatched}, warmup=${schedulerTickResult.warmup_jobs_enqueued}`
              : 'No tick run yet.'}
          </p>
        </div>
        <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Notebook Care Tick</p>
          <p className="text-xs text-slate-300 font-mono">{notebookTickResult || 'No tick run yet.'}</p>
        </div>
        <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Footprint Tick</p>
          <p className="text-xs text-slate-300 font-mono">{footprintTickResult || 'No tick run yet.'}</p>
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

      <div className="bg-[#0d1225] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Queue Snapshot</h3>
          <div className="flex flex-wrap gap-2">
            {Object.keys(taskCounts).length === 0 ? (
              <span className="text-xs text-slate-500 font-mono">No jobs</span>
            ) : (
              Object.entries(taskCounts).map(([status, count]) => (
                <span
                  key={status}
                  className="px-2 py-1 rounded bg-slate-900 border border-slate-700 text-[10px] text-slate-300 font-mono"
                >
                  {status}: {count}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest">
              <tr>
                <th className="px-6 py-4">Job</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">Priority</th>
                <th className="px-6 py-4">VM</th>
                <th className="px-6 py-4">Progress</th>
                <th className="px-6 py-4">Retries</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td className="px-6 py-5 text-sm text-slate-500" colSpan={6}>
                    Loading scheduler queue...
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td className="px-6 py-5 text-sm text-slate-500" colSpan={6}>
                    Queue is empty.
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <tr key={task.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-200">{task.task_type}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{task.id}</div>
                    </td>
                    <td className="px-6 py-4 text-xs uppercase text-slate-300">{task.status}</td>
                    <td className="px-6 py-4 text-xs uppercase text-slate-400">{task.priority || 'medium'}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">{task.vm_id || 'AUTO'}</td>
                    <td className="px-6 py-4 text-xs text-slate-300">{task.progress}%</td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {task.retry_count || 0}/{task.max_retries || 0}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default TaskScheduler;
