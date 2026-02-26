import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import { TaskType } from '../types';
import { ApiSchedulerTask, enqueueSchedulerJob, listSchedulerQueue } from '../services/backendApi';

type NewTaskForm = {
  id: string;
  taskType: string;
  vmId: string;
};

const DEFAULT_FORM: NewTaskForm = {
  id: '',
  taskType: TaskType.STABLE_DIFFUSION,
  vmId: '',
};

const STATUS_TABS = ['Queued', 'Running', 'Completed', 'Failed', 'ALL'] as const;

type StatusTab = (typeof STATUS_TABS)[number];

const TaskQueue: React.FC = () => {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<ApiSchedulerTask[]>([]);
  const [activeTab, setActiveTab] = useState<StatusTab>('Queued');
  const [showModal, setShowModal] = useState<boolean>(false);
  const [newTask, setNewTask] = useState<NewTaskForm>(DEFAULT_FORM);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refreshQueue = useCallback(async () => {
    setIsLoading(true);
    try {
      const queue = await listSchedulerQueue();
      setTasks(queue);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load task queue.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshQueue();
    const interval = window.setInterval(() => {
      void refreshQueue();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refreshQueue]);

  const handleCreateTask = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setIsSubmitting(true);
      const id = (newTask.id || `task-${Date.now()}`).trim();
      try {
        await enqueueSchedulerJob({
          id,
          task_type: newTask.taskType,
          vm_id: newTask.vmId.trim() || null,
          status: 'Queued',
          progress: 0,
        });
        setInfoText(`Task '${id}' queued.`);
        setErrorText('');
        setShowModal(false);
        setNewTask(DEFAULT_FORM);
        setActiveTab('ALL');
        await refreshQueue();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create task.';
        setErrorText(message);
      } finally {
        setIsSubmitting(false);
      }
    },
    [newTask, refreshQueue]
  );

  const filteredTasks = useMemo(() => {
    if (activeTab === 'ALL') {
      return tasks;
    }
    return tasks.filter((task) => task.status.toLowerCase() === activeTab.toLowerCase());
  }, [activeTab, tasks]);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void refreshQueue()}
            className="bg-slate-800 hover:bg-slate-700 text-white px-6 py-3 rounded-xl font-bold transition-all border border-slate-700"
          >
            Refresh
          </button>
          <button
            onClick={() => setShowModal(true)}
            className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg"
          >
            {t('createTask')}
          </button>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">{errorText}</div>
      ) : null}
      {infoText ? (
        <div className="px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-900/20 text-emerald-300 text-sm">{infoText}</div>
      ) : null}

      <div className="grid grid-cols-1 gap-4">
        {isLoading ? (
          <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
            <p className="text-slate-500 text-lg">Loading tasks...</p>
          </div>
        ) : filteredTasks.map((task) => (
          <div key={task.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col md:flex-row items-center gap-6 hover:border-slate-500 transition-colors">
            <div className={`p-3 rounded-lg text-2xl ${
              task.task_type === TaskType.STABLE_DIFFUSION ? 'bg-purple-500/10 text-purple-500' :
              task.task_type === TaskType.LLM_INFERENCE ? 'bg-blue-500/10 text-blue-500' :
              'bg-emerald-500/10 text-emerald-500'
            }`}>
              {task.task_type === TaskType.STABLE_DIFFUSION ? 'SD' : task.task_type === TaskType.LLM_INFERENCE ? 'LLM' : 'JOB'}
            </div>

            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg">{task.id}</span>
                <span className="text-xs px-2 py-0.5 rounded font-bold uppercase tracking-widest bg-slate-700 text-slate-300">
                  {task.status}
                </span>
              </div>
              <p className="text-slate-400 text-sm">{task.task_type}</p>
              {(task.retry_count || 0) > 0 ? <p className="text-amber-400 text-xs">Retry count: {task.retry_count}</p> : null}
              {task.error_message ? (
                <p className="text-rose-400 text-xs truncate" title={task.error_message}>
                  {task.error_message}
                </p>
              ) : null}
            </div>

            <div className="w-full md:w-64 space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">{t('progress')}</span>
                <span className="text-emerald-500 font-bold">{task.progress}%</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${
                    task.status.toLowerCase().includes('fail') ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${task.progress}%` }}
                ></div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="text-sm font-medium">{task.vm_id || t('waitingForAccount')}</div>
              <div className="text-xs text-slate-500">Status: {task.status}</div>
            </div>
          </div>
        ))}

        {!isLoading && filteredTasks.length === 0 && (
          <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
            <p className="text-slate-500 text-lg">{t('noTasksFoundCategory')}</p>
          </div>
        )}
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 w-full max-w-md rounded-2xl border border-slate-700 p-8 shadow-2xl animate-in zoom-in duration-200">
            <h2 className="text-2xl font-bold mb-6">{t('newTaskTitle')}</h2>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">Task ID (optional)</label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={newTask.id}
                  onChange={(event) => setNewTask((prev) => ({ ...prev, id: event.target.value }))}
                  placeholder="task-<timestamp>"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('taskType')}</label>
                <select
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={newTask.taskType}
                  onChange={(event) => setNewTask((prev) => ({ ...prev, taskType: event.target.value }))}
                >
                  <option value={TaskType.STABLE_DIFFUSION}>Stable Diffusion</option>
                  <option value={TaskType.LLM_INFERENCE}>LLM Inference</option>
                  <option value={TaskType.TRAINING}>Model Training</option>
                  <option value={TaskType.DATA_PROCESSING}>Data Processing</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">VM ID (optional)</label>
                <input
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={newTask.vmId}
                  onChange={(event) => setNewTask((prev) => ({ ...prev, vmId: event.target.value }))}
                  placeholder="vm1"
                />
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors">{t('cancel')}</button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold transition-colors disabled:opacity-50"
                >
                  {isSubmitting ? 'Dispatching...' : t('dispatchBtn')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default TaskQueue;
