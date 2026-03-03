import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import { ApiCentralizedLogEntry, getCentralizedLogs } from '../services/backendApi';

const Logs: React.FC = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<ApiCentralizedLogEntry[]>([]);
  const [levelFilter, setLevelFilter] = useState<'all' | 'info' | 'warning' | 'error' | 'debug'>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('All');
  const [searchText, setSearchText] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await getCentralizedLogs(sourceFilter);
      setLogs(rows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load logs.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [sourceFilter]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 4000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const sources = useMemo(() => {
    const values = new Set<string>(['All']);
    for (const item of logs) {
      values.add(item.source);
    }
    return Array.from(values);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    return logs.filter((item) => {
      const level = (item.level || '').toLowerCase();
      const text = `${item.msg} ${item.details || ''} ${item.source}`.toLowerCase();
      if (levelFilter !== 'all' && level !== levelFilter) {
        return false;
      }
      if (searchText.trim() && !text.includes(searchText.trim().toLowerCase())) {
        return false;
      }
      return true;
    });
  }, [logs, levelFilter, searchText]);

  const getLevelStyles = (level: string): string => {
    switch (level.toLowerCase()) {
      case 'info':
        return 'text-blue-400';
      case 'warning':
        return 'text-orange-400';
      case 'error':
        return 'text-rose-400';
      case 'debug':
        return 'text-cyan-400';
      default:
        return 'text-slate-400';
    }
  };

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex flex-wrap justify-between items-center gap-3 bg-slate-800 p-4 rounded-xl border border-slate-700">
        <div className="flex flex-wrap gap-2">
          <select
            className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none text-xs"
            value={sourceFilter}
            onChange={(event) => setSourceFilter(event.target.value)}
          >
            {sources.map((source) => (
              <option key={source} value={source}>
                {source}
              </option>
            ))}
          </select>
          <select
            className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none text-xs"
            value={levelFilter}
            onChange={(event) =>
              setLevelFilter(event.target.value as 'all' | 'info' | 'warning' | 'error' | 'debug')
            }
          >
            <option value="all">{t('allLevels')}</option>
            <option value="info">Info</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="debug">Debug</option>
          </select>
          <input
            className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none text-xs min-w-[220px]"
            placeholder="Search logs..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
          />
        </div>
        <button
          onClick={() => void refresh()}
          className="bg-slate-700 hover:bg-slate-600 px-4 py-2 rounded-lg transition-colors text-xs font-bold"
        >
          Refresh
        </button>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}

      <div className="flex-1 bg-slate-950 rounded-xl border border-slate-800 p-4 font-mono text-sm overflow-y-auto shadow-inner">
        {isLoading ? <div className="text-center py-6 text-slate-500">Loading logs...</div> : null}
        {filteredLogs.map((log, index) => (
          <div key={`${log.time}-${log.source}-${index}`} className="py-1 border-b border-slate-900/50 flex gap-4 hover:bg-slate-900/20">
            <span className="text-slate-500 whitespace-nowrap">[{log.time}]</span>
            <span className={`uppercase font-bold whitespace-nowrap w-20 ${getLevelStyles(log.level)}`}>
              {log.level}
            </span>
            <span className="text-emerald-500 whitespace-nowrap w-36 truncate">@{log.source}</span>
            <span className="text-slate-300 flex-1">
              {log.msg}
              {log.details ? <span className="text-slate-500"> | {log.details}</span> : null}
            </span>
          </div>
        ))}
        {!isLoading && filteredLogs.length === 0 ? (
          <div className="text-center py-12 text-slate-600 italic">{t('noLogsFound')}</div>
        ) : null}
      </div>
    </div>
  );
};

export default Logs;
