
import React, { useState, useEffect, useRef } from 'react';
import { loadData, saveData } from '../services/state';
import { useTranslation } from '../App';

const Logs: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(loadData());
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warning' | 'error'>('all');
  const logContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      const freshData = loadData();
      setData(freshData);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  const clearLogs = () => {
    const newData = { ...data, logs: [] };
    saveData(newData);
    setData(newData);
  };

  const filteredLogs = data.logs.filter(l => levelFilter === 'all' || l.level === levelFilter);

  const getLevelStyles = (level: string) => {
    switch(level) {
      case 'info': return 'text-blue-400';
      case 'warning': return 'text-orange-400';
      case 'error': return 'text-rose-400';
      default: return 'text-slate-400';
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div className="flex gap-4">
          <select 
            className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none"
            value={levelFilter}
            onChange={(e) => setLevelFilter(e.target.value as any)}
          >
            <option value="all">{t('allLevels')}</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
          </select>
        </div>
        <button 
          onClick={clearLogs}
          className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors"
        >
          {t('clearLogs')}
        </button>
      </div>

      <div 
        ref={logContainerRef}
        className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-sm overflow-y-auto shadow-inner"
      >
        {filteredLogs.map((log) => (
          <div key={log.id} className="py-1 border-b border-slate-900/50 flex gap-4 hover:bg-slate-900/20">
            <span className="text-slate-500 whitespace-nowrap">[{new Date(log.timestamp).toLocaleTimeString()}]</span>
            <span className={`uppercase font-bold whitespace-nowrap w-20 ${getLevelStyles(log.level)}`}>{log.level}</span>
            <span className="text-emerald-500 whitespace-nowrap w-40 truncate">@{log.account}</span>
            <span className="text-slate-300 flex-1">{log.message}</span>
          </div>
        ))}
        {filteredLogs.length === 0 && (
          <div className="text-center py-12 text-slate-600 italic">{t('noLogsFound')}</div>
        )}
      </div>
    </div>
  );
};

export default Logs;
