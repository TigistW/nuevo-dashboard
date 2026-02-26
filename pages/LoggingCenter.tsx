
import React, { useState } from 'react';
import { useTranslation } from '../App';

const LoggingCenter: React.FC = () => {
  const { t } = useTranslation();
  const [filter, setFilter] = useState('All');

  const logs = [
    { time: '14:55:01', source: 'Firecracker', level: 'INFO', msg: 'Micro-VM vm-001 started successfully' },
    { time: '14:54:45', source: 'WireGuard', level: 'DEBUG', msg: 'Tunnel wg-es-01 handshake completed' },
    { time: '14:54:30', source: 'Ansible', level: 'INFO', msg: 'Playbook setup_vm.yml completed for vm-001' },
    { time: '14:52:12', source: 'System', level: 'WARN', msg: 'High CPU load detected on host' },
    { time: '14:50:05', source: 'Firecracker', level: 'ERROR', msg: 'Failed to mount rootfs for vm-005' },
  ];

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('loggingCenter')}</h2>
          <p className="text-sm text-slate-500 font-mono">Unified Log Aggregator & Analysis</p>
        </div>
        <div className="flex gap-3">
          <input type="text" placeholder="Search logs..." className="bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs outline-none focus:ring-1 focus:ring-blue-500" />
          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700">{t('clearLogs')}</button>
        </div>
      </div>

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl flex flex-col h-[600px]">
        <div className="p-4 border-b border-slate-800 bg-slate-900/50 flex gap-4">
          {['All', 'Firecracker', 'WireGuard', 'Ansible', 'System'].map(s => (
            <button key={s} onClick={() => setFilter(s)} className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase transition-all ${filter === s ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-slate-300'}`}>
              {s}
            </button>
          ))}
        </div>
        <div className="flex-1 overflow-y-auto p-6 font-mono text-[11px] space-y-2 custom-scrollbar">
          {logs.filter(l => filter === 'All' || l.source === filter).map((log, i) => (
            <div key={i} className="flex gap-4 group hover:bg-slate-800/30 p-1 rounded transition-colors">
              <span className="text-slate-600 shrink-0">[{log.time}]</span>
              <span className={`shrink-0 w-20 font-black ${
                log.level === 'ERROR' ? 'text-rose-500' : 
                log.level === 'WARN' ? 'text-amber-500' : 
                log.level === 'DEBUG' ? 'text-blue-500' : 'text-emerald-500'
              }`}>{log.level}</span>
              <span className="text-slate-400 shrink-0 w-24">[{log.source}]</span>
              <span className="text-slate-200">{log.msg}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default LoggingCenter;
