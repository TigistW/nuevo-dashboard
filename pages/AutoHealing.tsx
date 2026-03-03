import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import {
  ApiCentralizedLogEntry,
  ApiHealingRule,
  ApiProtectionState,
  evaluateProtection,
  getCentralizedLogs,
  getProtectionState,
  listHealingRules,
  triggerSchedulerTick,
  updateHealingRule,
} from '../services/backendApi';

const HEALING_KEYWORDS = [
  'reconnect',
  'restart',
  'retry',
  'failsafe',
  'protective mode',
  'paused',
  'resumed',
  'deleted low-score vm',
  'guardrail',
  'recover',
];

const AutoHealing: React.FC = () => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<ApiHealingRule[]>([]);
  const [logs, setLogs] = useState<ApiCentralizedLogEntry[]>([]);
  const [protection, setProtection] = useState<ApiProtectionState | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rulesRows, logRows, protectionState] = await Promise.all([
        listHealingRules(),
        getCentralizedLogs('All'),
        getProtectionState(),
      ]);
      setRules(rulesRows);
      setLogs(logRows);
      setProtection(protectionState);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load auto-healing state.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 7000);
    return () => window.clearInterval(interval);
  }, [refresh]);

  const healingLogs = useMemo(() => {
    return logs
      .filter((item) => {
        const text = `${item.source} ${item.msg} ${item.details || ''}`.toLowerCase();
        return HEALING_KEYWORDS.some((keyword) => text.includes(keyword));
      })
      .slice(0, 20);
  }, [logs]);

  const handleEvaluate = useCallback(async () => {
    setIsBusy(true);
    try {
      const state = await evaluateProtection(true);
      setProtection(state);
      setInfoText(`Protection evaluated: protective=${state.protective_mode}, failsafe=${state.failsafe_active}.`);
      setErrorText('');
      const updatedLogs = await getCentralizedLogs('All');
      setLogs(updatedLogs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Protection evaluation failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const handleTick = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await triggerSchedulerTick();
      setInfoText(
        `Scheduler tick dispatched=${result.dispatched}, warmup=${result.warmup_jobs_enqueued}, active=${result.active_jobs}.`
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

  const handleToggleRule = useCallback(async (rule: ApiHealingRule) => {
    setIsBusy(true);
    try {
      const updated = await updateHealingRule(rule.id, !rule.enabled);
      setRules((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
      setInfoText(`Rule '${updated.id}' is now ${updated.enabled ? 'enabled' : 'disabled'}.`);
      setErrorText('');
      const updatedLogs = await getCentralizedLogs('All');
      setLogs(updatedLogs);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to update healing rule.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, []);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('autoHealing')}</h2>
          <p className="text-sm text-slate-500 font-mono">Watchdog service and automatic recovery state</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-slate-700 bg-slate-900/60">
            <span
              className={`w-2 h-2 rounded-full ${
                protection?.failsafe_active ? 'bg-rose-500' : protection?.protective_mode ? 'bg-amber-500' : 'bg-emerald-500'
              }`}
            />
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-300">
              {t('watchdogStatus')}: {protection?.failsafe_active ? 'FAILSAFE' : protection?.protective_mode ? 'PROTECTIVE' : 'ACTIVE'}
            </span>
          </div>
          <button
            onClick={() => void refresh()}
            disabled={isBusy}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold border border-slate-700"
          >
            Refresh
          </button>
          <button
            onClick={() => void handleEvaluate()}
            disabled={isBusy}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
          >
            Evaluate Protection
          </button>
          <button
            onClick={() => void handleTick()}
            disabled={isBusy}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-xl text-xs font-bold text-white"
          >
            Run Scheduler Tick
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

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6">{t('healingRules')}</h3>
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading healing rules...</p>
            ) : rules.length === 0 ? (
              <p className="text-sm text-slate-500">No healing rules found.</p>
            ) : (
              rules.map((rule) => (
                <div
                  key={rule.id}
                  className="flex items-center justify-between p-5 bg-slate-900/50 rounded-2xl border border-slate-800"
                >
                  <div>
                    <p className="text-sm font-bold text-slate-200">{rule.trigger}</p>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Action: {rule.action}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border ${
                        rule.enabled
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-slate-800 text-slate-500 border-slate-700'
                      }`}
                    >
                      {rule.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                    <button
                      onClick={() => void handleToggleRule(rule)}
                      disabled={isBusy}
                      className="px-3 py-1 rounded-lg text-[10px] font-black uppercase border border-blue-500/20 bg-blue-500/10 text-blue-400 hover:bg-blue-500/20 disabled:opacity-50"
                    >
                      Toggle
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-900/20 to-slate-900/20 border border-blue-500/20 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-4 italic uppercase tracking-tighter">Recent Healing Actions</h3>
          <div className="space-y-3">
            {healingLogs.length === 0 ? (
              <p className="text-sm text-slate-500">No recent healing-related logs.</p>
            ) : (
              healingLogs.map((item, index) => (
                <div
                  key={`${item.time}-${item.source}-${index}`}
                  className="flex flex-wrap items-center justify-between text-[11px] font-mono py-2 border-b border-white/5 last:border-0 gap-2"
                >
                  <span className="text-slate-500">[{item.time}]</span>
                  <span className="text-blue-400 font-bold">{item.source}</span>
                  <span className="text-slate-300 flex-1 min-w-[240px]">{item.msg}</span>
                  <span
                    className={`font-black uppercase ${
                      item.level.toUpperCase() === 'ERROR'
                        ? 'text-rose-500'
                        : item.level.toUpperCase() === 'WARNING'
                        ? 'text-amber-500'
                        : 'text-emerald-500'
                    }`}
                  >
                    {item.level}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoHealing;
