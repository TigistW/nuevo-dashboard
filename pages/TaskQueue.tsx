
import React, { useState, useEffect } from 'react';
import { loadData, addTask, saveData } from '../services/state';
import { Task, TaskStatus, TaskType, NotebookTemplate } from '../types';
import { useTranslation } from '../App';

const TaskQueue: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(loadData());
  const [activeTab, setActiveTab] = useState<TaskStatus | 'ALL'>(TaskStatus.PENDING);
  const [showModal, setShowModal] = useState(false);

  // New task form state
  const [newTask, setNewTask] = useState({
    type: TaskType.STABLE_DIFFUSION,
    priority: 'Medium' as any,
    estimatedTime: '30m',
    notebookTemplate: ''
  });

  useEffect(() => {
    const interval = setInterval(() => setData(loadData()), 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    // Set default template if available when modal opens
    if (showModal && data.templates.length > 0 && !newTask.notebookTemplate) {
      setNewTask(prev => ({ ...prev, notebookTemplate: data.templates[0].path }));
    }
  }, [showModal, data.templates]);

  const handleCreateTask = (e: React.FormEvent) => {
    e.preventDefault();
    addTask(newTask);
    setShowModal(false);
    setData(loadData());
  };

  const filteredTasks = data.tasks.filter(t => activeTab === 'ALL' || t.status === activeTab);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex bg-slate-800 p-1 rounded-lg border border-slate-700">
          {[TaskStatus.PENDING, TaskStatus.PROCESSING, TaskStatus.COMPLETED, 'ALL'].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                activeTab === tab ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'
              }`}
            >
              {tab.charAt(0) + tab.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <button 
          onClick={() => setShowModal(true)}
          className="bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3 rounded-xl font-bold transition-all shadow-lg"
        >
          {t('createTask')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {filteredTasks.map((task) => (
          <div key={task.id} className="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col md:flex-row items-center gap-6 hover:border-slate-500 transition-colors">
            <div className={`p-3 rounded-lg text-2xl ${
              task.type === TaskType.STABLE_DIFFUSION ? 'bg-purple-500/10 text-purple-500' :
              task.type === TaskType.LLM_INFERENCE ? 'bg-blue-500/10 text-blue-500' :
              'bg-emerald-500/10 text-emerald-500'
            }`}>
              {task.type === TaskType.STABLE_DIFFUSION ? '🎨' : task.type === TaskType.LLM_INFERENCE ? '🤖' : '⚙️'}
            </div>
            
            <div className="flex-1 space-y-1">
              <div className="flex items-center gap-3">
                <span className="font-bold text-lg">{task.id}</span>
                <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase tracking-widest ${
                  task.priority === 'Critical' ? 'bg-rose-500/20 text-rose-500' :
                  task.priority === 'High' ? 'bg-orange-500/20 text-orange-500' : 'bg-slate-700 text-slate-400'
                }`}>
                  {task.priority}
                </span>
              </div>
              <p className="text-slate-400 text-sm">{task.type}</p>
              <p className="text-[10px] text-slate-500 truncate max-w-[200px]" title={task.notebookTemplate}>
                {task.notebookTemplate?.split('/').pop() || 'No template'}
              </p>
              <p className="text-[10px] text-slate-600 italic">Created {new Date(task.createdAt).toLocaleString()}</p>
            </div>

            <div className="w-full md:w-64 space-y-2">
              <div className="flex justify-between text-xs font-mono">
                <span className="text-slate-500">{t('progress')}</span>
                <span className="text-emerald-500 font-bold">{task.progress}%</span>
              </div>
              <div className="w-full bg-slate-900 h-2 rounded-full overflow-hidden">
                <div 
                  className={`h-full transition-all duration-1000 ${
                    task.status === TaskStatus.FAILED ? 'bg-rose-500' : 'bg-emerald-500'
                  }`}
                  style={{ width: `${task.progress}%` }}
                ></div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-1">
              <div className="text-sm font-medium">{task.accountAssigned || t('waitingForAccount')}</div>
              <div className="text-xs text-slate-500">{t('estTimeRemaining')}: {task.estimatedTime}</div>
            </div>

            <div className="flex gap-2">
              <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">🗑️</button>
              <button className="p-2 hover:bg-slate-700 rounded-lg text-slate-400 transition-colors">▶️</button>
            </div>
          </div>
        ))}

        {filteredTasks.length === 0 && (
          <div className="text-center py-20 bg-slate-800/50 rounded-xl border border-dashed border-slate-700">
            <p className="text-slate-500 text-lg">{t('noTasksFoundCategory')}</p>
          </div>
        )}
      </div>

      {/* Simple Modal Overlay */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-slate-800 w-full max-w-md rounded-2xl border border-slate-700 p-8 shadow-2xl animate-in zoom-in duration-200">
            <h2 className="text-2xl font-bold mb-6">{t('newTaskTitle')}</h2>
            <form onSubmit={handleCreateTask} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('taskType')}</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={newTask.type}
                  onChange={(e) => setNewTask({...newTask, type: e.target.value as any})}
                >
                  <option value={TaskType.STABLE_DIFFUSION}>Stable Diffusion</option>
                  <option value={TaskType.LLM_INFERENCE}>LLM Inference</option>
                  <option value={TaskType.TRAINING}>Model Training</option>
                  <option value={TaskType.DATA_PROCESSING}>Data Processing</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('priority')}</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={newTask.priority}
                  onChange={(e) => setNewTask({...newTask, priority: e.target.value as any})}
                >
                  <option value="Low">Low</option>
                  <option value="Medium">Medium</option>
                  <option value="High">High</option>
                  <option value="Critical">Critical</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-slate-400 mb-1">{t('selectNotebookTemplate')}</label>
                <select 
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                  value={newTask.notebookTemplate}
                  onChange={(e) => setNewTask({...newTask, notebookTemplate: e.target.value})}
                  required
                >
                  {data.templates.map(tpl => (
                    <option key={tpl.id} value={tpl.path}>{tpl.name}</option>
                  ))}
                  {data.templates.length === 0 && (
                    <option value="" disabled>{t('noTemplatesAvailableSettings')}</option>
                  )}
                </select>
                <p className="mt-1 text-[10px] text-slate-500 italic">{t('templatesManagedSettings')}</p>
              </div>
              <div className="flex gap-4 mt-8">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 transition-colors">{t('cancel')}</button>
                <button 
                  type="submit" 
                  disabled={data.templates.length === 0}
                  className="flex-1 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {t('dispatchBtn')}
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
