
import React from 'react';
import { useTranslation } from '../App';

const SecurityAudit: React.FC = () => {
  const { t } = useTranslation();

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('securityAudit')}</h2>
          <p className="text-sm text-slate-500 font-mono">Isolation Verification & nftables Audit</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700">
            {t('isolationAudit')}
          </button>
          <button className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-blue-600/20 transition-all">
            {t('testIsolation')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">{t('activeNamespaces')}</h3>
            <span className="text-[10px] font-black text-emerald-500 bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20 uppercase tracking-widest">Secure</span>
          </div>
          <div className="space-y-4">
            {['netns-vm-001', 'netns-vm-002', 'netns-wg-es', 'netns-wg-us'].map((ns) => (
              <div key={ns} className="flex items-center justify-between p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <div className="flex items-center gap-3">
                  <span className="text-emerald-500">🔗</span>
                  <span className="font-mono text-sm text-slate-300">{ns}</span>
                </div>
                <span className="text-[10px] text-slate-500 font-mono">PID: {Math.floor(Math.random() * 10000)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <div className="flex items-center justify-between mb-8">
            <h3 className="text-lg font-bold">{t('nftablesRules')}</h3>
            <span className="text-[10px] font-black text-blue-500 bg-blue-500/10 px-2 py-1 rounded border border-blue-500/20 uppercase tracking-widest">Active</span>
          </div>
          <div className="bg-slate-950 rounded-2xl p-6 font-mono text-[11px] text-slate-400 overflow-x-auto">
            <pre className="leading-relaxed">
{`table inet filter {
    chain input {
        type filter hook input priority 0; policy drop;
        iifname "lo" accept
        ct state established,related accept
    }
    chain forward {
        type filter hook forward priority 0; policy drop;
        iifname "vm-*" oifname "wg-*" accept
    }
    chain output {
        type filter hook output priority 0; policy accept;
    }
}`}
            </pre>
          </div>
        </div>

        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-8">{t('routingPolicy')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              { table: '101', mark: '0x1', gateway: '10.0.1.1', dev: 'wg-es-01' },
              { table: '102', mark: '0x2', gateway: '10.0.2.1', dev: 'wg-us-01' },
              { table: '103', mark: '0x3', gateway: '10.0.3.1', dev: 'wg-jp-01' },
            ].map((route) => (
              <div key={route.table} className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex justify-between items-center">
                  <span className="text-[10px] font-black text-slate-500 uppercase">Table {route.table}</span>
                  <span className="text-[10px] font-mono text-emerald-500">Active</span>
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-mono text-slate-400">Mark: {route.mark}</p>
                  <p className="text-xs font-mono text-slate-400">GW: {route.gateway}</p>
                  <p className="text-xs font-mono text-slate-400">Dev: {route.dev}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SecurityAudit;
