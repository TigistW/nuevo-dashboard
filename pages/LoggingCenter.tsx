import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import { ApiCentralizedLogEntry, getCentralizedLogs } from '../services/backendApi';

const DEFAULT_SOURCES = ['All', 'Automation', 'Intelligence', 'Security', 'Network', 'Orchestrator'];

const LoggingCenter: React.FC = () => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<string>('All');
  const [searchText, setSearchText] = useState<string>('');
  const [logs, setLogs] = useState<ApiCentralizedLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await getCentralizedLogs(filter);
      setLogs(rows);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load centralized logs.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const sources = useMemo(() => {
    const values = new Set<string>(DEFAULT_SOURCES);
    for (const item of logs) {
      values.add(item.source);
    }
    return Array.from(values);
  }, [logs]);

  const filteredLogs = useMemo(() => {
    const term = searchText.trim().toLowerCase();
    if (!term) {
      return logs;
    }
    return logs.filter((item) => {
      const text = `${item.time} ${item.source} ${item.level} ${item.msg} ${item.details || ''}`.toLowerCase();
      return text.includes(term);
    });
  }, [logs, searchText]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('loggingCenter')}</h2>
          <p className="text-sm text-slate-500 font-mono">Unified log aggregator and analysis</p>
        </div>
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Search logs..."
            value={searchText}
            onChange={(event) => setSearchText(event.target.value)}
            className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500"
          />
          <button
            onClick={() => void refresh()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            Refresh
          </button>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[600px]">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex flex-wrap gap-2">
          {sources.map((source) => (
            <button
              key={source}
              onClick={() => setFilter(source)}
              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${
                filter === source ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'
              }`}
            >
              {source}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] space-y-2 custom-scrollbar">
          {isLoading ? <div className="text-slate-500">Loading logs...</div> : null}
          {filteredLogs.map((log, index) => (
            <div key={`${log.time}-${log.source}-${index}`} className="flex gap-4 group hover:bg-slate-800/30 p-1 rounded transition-colors">
              <span className="text-slate-600 shrink-0">[{log.time}]</span>
              <span
                className={`shrink-0 w-20 font-black ${
                  log.level.toUpperCase() === 'ERROR'
                    ? 'text-rose-500'
                    : log.level.toUpperCase() === 'WARNING'
                    ? 'text-amber-500'
                    : log.level.toUpperCase() === 'DEBUG'
                    ? 'text-blue-500'
                    : 'text-emerald-500'
                }`}
              >
                {log.level.toUpperCase()}
              </span>
              <span className="text-slate-400 shrink-0 w-28 truncate">[{log.source}]</span>
              <span className="text-slate-200">
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
    </div>
  );
};

export default LoggingCenter;
