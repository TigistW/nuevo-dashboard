import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../App';
import { getSecurityAudit, testIsolation } from '../services/backendApi';

type AuditState = {
  namespaces: string[];
  nftables_status: string;
  routing_tables: Array<{ table: string; dev: string }>;
};

const SecurityAudit: React.FC = () => {
  const { t } = useTranslation();
  const [audit, setAudit] = useState<AuditState>({
    namespaces: [],
    nftables_status: 'Unknown',
    routing_tables: [],
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refreshAudit = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await getSecurityAudit();
      setAudit(data);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load security audit.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshAudit();
  }, [refreshAudit]);

  const runIsolationTest = useCallback(async () => {
    setIsTesting(true);
    try {
      const result = await testIsolation();
      setInfoText(`${result.status}: ${result.details}`);
      setErrorText('');
      await refreshAudit();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Isolation test failed.';
      setErrorText(message);
    } finally {
      setIsTesting(false);
    }
  }, [refreshAudit]);

  const nftStatus = audit.nftables_status || 'Unknown';
  const nftIsSecure = nftStatus.toLowerCase().includes('secure') && !nftStatus.toLowerCase().includes('warning');

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('securityAudit')}</h2>
          <p className="text-sm text-slate-500 font-mono">Isolation Verification & nftables Audit</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void refreshAudit()}
            disabled={isTesting}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            {t('isolationAudit')}
          </button>
          <button
            onClick={() => void runIsolationTest()}
            disabled={isTesting}
            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-blue-600/20 transition-all"
          >
            {isTesting ? 'Testing...' : t('testIsolation')}
          </button>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}
      {infoText ? (
        <div className="px-4 py-3 rounded-xl border border-blue-500/20 bg-blue-900/20 text-blue-300 text-sm">
          {infoText}
        </div>
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">{t('activeNamespaces')}</h3>
            <span
              className={`text-[10px] font-black px-2 py-1 rounded border uppercase tracking-widest ${
                nftIsSecure
                  ? 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                  : 'text-rose-500 bg-rose-500/10 border-rose-500/20'
              }`}
            >
              {nftIsSecure ? 'Secure' : 'Warning'}
            </span>
          </div>
          <div className="space-y-4">
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading namespaces...</p>
            ) : audit.namespaces.length === 0 ? (
              <p className="text-sm text-slate-500">No namespaces detected.</p>
            ) : (
              audit.namespaces.map((ns) => (
                <div key={ns} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                  <div className="flex items-center gap-3">
                    <span className="text-emerald-500">link</span>
                    <span className="font-mono text-sm text-slate-300">{ns}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">{t('nftablesRules')}</h3>
            <span
              className={`text-[10px] font-black px-2 py-1 rounded border uppercase tracking-widest ${
                nftIsSecure
                  ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                  : 'text-rose-500 bg-rose-500/10 border-rose-500/20'
              }`}
            >
              {nftStatus}
            </span>
          </div>
          <div className="bg-slate-950 rounded-2xl p-6 font-mono text-[11px] text-slate-400 overflow-x-auto">
            <pre className="leading-relaxed">{`nftables_status: ${nftStatus}`}</pre>
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-8">{t('routingPolicy')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {isLoading ? (
              <p className="text-sm text-slate-500">Loading routing tables...</p>
            ) : audit.routing_tables.length === 0 ? (
              <p className="text-sm text-slate-500">No routing table entries returned.</p>
            ) : (
              audit.routing_tables.map((route, index) => (
                <div key={`${route.table}-${route.dev}-${index}`} className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800 space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-[10px] font-black text-slate-500 uppercase">Table {route.table}</span>
                    <span className="text-[10px] font-mono text-emerald-500">Active</span>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-mono text-slate-400">Dev: {route.dev}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityAudit;
