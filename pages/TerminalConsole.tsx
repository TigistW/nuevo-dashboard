
import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from '../App';

const TerminalConsole: React.FC = () => {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<string[]>([
    'Connecting to micro-vm-manager...',
    'Authentication successful.',
    'Session established with ns-01 (10.0.0.5)',
    'Welcome to Alpine Linux 3.18',
    'farm-vm-01:~$ '
  ]);
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleCommand = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input) return;

    const newLogs = [...logs, `farm-vm-01:~$ ${input}`];
    
    // Simulate command output
    if (input === 'ls') {
      newLogs.push('bin  dev  etc  home  lib  media  mnt  opt  proc  root  run  sbin  srv  sys  tmp  usr  var');
    } else if (input === 'ifconfig') {
      newLogs.push('eth0      Link encap:Ethernet  HWaddr 02:42:AC:11:00:02');
      newLogs.push('          inet addr:10.0.0.5  Bcast:10.0.0.255  Mask:255.255.255.0');
    } else if (input === 'clear') {
      setLogs(['farm-vm-01:~$ ']);
      setInput('');
      return;
    } else {
      newLogs.push(`sh: ${input}: command not found`);
    }

    newLogs.push('farm-vm-01:~$ ');
    setLogs(newLogs);
    setInput('');
  };

  return (
    <div className="h-full flex flex-col space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('terminal')}</h2>
          <p className="text-sm text-slate-500 font-mono">Direct SSH/Serial access to active Micro-VMs</p>
        </div>
        <div className="flex gap-3">
          <select className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-emerald-500 transition-all">
            <option>ns-01 (10.0.0.5)</option>
            <option>ns-02 (10.0.0.6)</option>
            <option>ns-03 (10.0.0.7)</option>
          </select>
          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">
            {t('connectTerminal')}
          </button>
        </div>
      </div>

      <div className="flex-1 bg-black border border-slate-800 rounded-3xl p-6 font-mono text-xs text-emerald-500 overflow-hidden flex flex-col shadow-2xl">
        <div className="flex items-center gap-2 mb-4 border-b border-emerald-500/10 pb-2">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="text-[10px] uppercase font-black tracking-widest opacity-70">{t('activeSession')}: ns-01</span>
        </div>
        
        <div ref={scrollRef} className="flex-1 overflow-y-auto space-y-1 custom-scrollbar pr-2">
          {logs.map((log, i) => (
            <div key={i} className="whitespace-pre-wrap break-all">{log}</div>
          ))}
        </div>

        <form onSubmit={handleCommand} className="mt-4 flex items-center gap-2">
          <span className="text-emerald-500 font-bold">❯</span>
          <input 
            type="text" 
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            className="flex-1 bg-transparent outline-none border-none text-emerald-400 placeholder-emerald-900"
            placeholder="Type command..."
          />
        </form>
      </div>
    </div>
  );
};

export default TerminalConsole;
