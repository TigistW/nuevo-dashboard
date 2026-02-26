
import React, { useState } from 'react';
import { useTranslation } from '../App';

interface HealingRule {
  id: string;
  trigger: string;
  action: string;
  enabled: boolean;
}

const AutoHealing: React.FC = () => {
  const { t } = useTranslation();
  const [rules, setRules] = useState<HealingRule[]>([
    { id: '1', trigger: 'WireGuard Tunnel Down', action: 'Auto-Reconnect', enabled: true },
    { id: '2', trigger: 'Endpoint Unreachable', action: 'Restart Micro-VM', enabled: true },
    { id: '3', trigger: 'Public IP Mismatch', action: 'Recreate Instance', enabled: false },
    { id: '4', trigger: 'RAM > 90%', action: 'Controlled Shutdown', enabled: true },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('autoHealing')}</h2>
          <p className="text-sm text-slate-500 font-mono">Watchdog Service & Automatic Recovery</p>
        </div>
        <div className="flex items-center gap-3 px-4 py-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{t('watchdogStatus')}: ACTIVE</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6">{t('healingRules')}</h3>
          <div className="space-y-4">
            {rules.map((rule) => (
              <div key={rule.id} className="flex items-center justify-between p-6 bg-slate-900/50 rounded-2xl border border-slate-800 group hover:border-blue-500/30 transition-all">
                <div className="flex items-center gap-6">
                  <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${rule.enabled ? 'bg-blue-500/10 text-blue-500' : 'bg-slate-800 text-slate-500'}`}>
                    {rule.enabled ? '🛡️' : '💤'}
                  </div>
                  <div>
                    <p className="text-sm font-bold text-slate-200">{rule.trigger}</p>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Action: {rule.action}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <button 
                    onClick={() => setRules(rules.map(r => r.id === rule.id ? {...r, enabled: !r.enabled} : r))}
                    className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase transition-all ${
                      rule.enabled ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    {rule.enabled ? 'Enabled' : 'Disabled'}
                  </button>
                  <button className="p-2 hover:bg-slate-800 rounded-lg text-slate-500 transition-colors">⚙️</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gradient-to-br from-blue-900/20 to-slate-900/20 border border-blue-500/20 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-4 italic uppercase tracking-tighter">Recent Healing Actions</h3>
          <div className="space-y-3">
            {[
              { time: '10:45:12', vm: 'vm-002', event: 'Tunnel Reconnect', status: 'Success' },
              { time: '09:30:05', vm: 'vm-005', event: 'Memory Guardrail', status: 'Success' },
              { time: '08:15:44', vm: 'vm-001', event: 'Health Check Failure', status: 'Success' },
            ].map((log, i) => (
              <div key={i} className="flex items-center justify-between text-[11px] font-mono py-2 border-b border-white/5 last:border-0">
                <span className="text-slate-500">[{log.time}]</span>
                <span className="text-blue-400 font-bold">{log.vm}</span>
                <span className="text-slate-300">{log.event}</span>
                <span className="text-emerald-500 font-black uppercase">{log.status}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AutoHealing;
