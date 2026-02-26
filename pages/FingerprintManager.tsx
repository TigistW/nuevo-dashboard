
import React, { useState } from 'react';
import { useTranslation } from '../App';

interface EnvConfig {
  vmId: string;
  timezone: string;
  locale: string;
  language: string;
  dns: string;
}

const FingerprintManager: React.FC = () => {
  const { t } = useTranslation();
  const [configs] = useState<any[]>([
    { 
      vmId: 'vm-001', 
      timezone: 'Europe/Madrid', 
      locale: 'es_ES.UTF-8', 
      language: 'Spanish', 
      dns: '1.1.1.1',
      deviceAge: '2.4 years',
      cookies: 452,
      hardware: 'MacBook Pro M2',
      behaviorScore: 94
    },
    { 
      vmId: 'vm-002', 
      timezone: 'America/New_York', 
      locale: 'en_US.UTF-8', 
      language: 'English', 
      dns: '8.8.8.8',
      deviceAge: '1.1 years',
      cookies: 128,
      hardware: 'iPhone 14 Pro',
      behaviorScore: 88
    },
    { 
      vmId: 'vm-003', 
      timezone: 'Asia/Tokyo', 
      locale: 'ja_JP.UTF-8', 
      language: 'Japanese', 
      dns: '1.1.1.1',
      deviceAge: '6 months',
      cookies: 45,
      hardware: 'Galaxy S23',
      behaviorScore: 72
    },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('fingerprintManager')}</h2>
          <p className="text-sm text-slate-500 font-mono">Persistent Digital Identity & Environment Coherence</p>
        </div>
        <button className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-blue-600/20 transition-all">
          Sync All Identities
        </button>
      </div>

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">Identity ID</th>
                <th className="px-8 py-5">Hardware Profile</th>
                <th className="px-8 py-5">Device Age</th>
                <th className="px-8 py-5">Cookies</th>
                <th className="px-8 py-5">Behavior Score</th>
                <th className="px-8 py-5 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {configs.map((cfg) => (
                <tr key={cfg.vmId} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-6">
                    <span className="font-mono font-bold text-sm block">{cfg.vmId}</span>
                    <span className="text-[9px] text-slate-500 uppercase">{cfg.timezone} // {cfg.locale}</span>
                  </td>
                  <td className="px-8 py-6 text-xs text-slate-300 font-bold">{cfg.hardware}</td>
                  <td className="px-8 py-6 text-xs font-mono text-slate-400">{cfg.deviceAge}</td>
                  <td className="px-8 py-6 text-xs text-blue-400 font-mono">{cfg.cookies} sessions</td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className={`h-full ${cfg.behaviorScore > 80 ? 'bg-emerald-500' : 'bg-amber-500'}`} style={{ width: `${cfg.behaviorScore}%` }}></div>
                      </div>
                      <span className="text-[10px] font-mono font-bold">{cfg.behaviorScore}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 border border-emerald-500/20 rounded text-[9px] font-black uppercase tracking-widest">Persistent</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-sm">
        <h3 className="text-lg font-bold mb-6 italic uppercase tracking-tighter">{t('environmentCoherence')}</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
          <div className="space-y-4">
            <p className="text-sm text-slate-400 leading-relaxed">
              This module ensures that the internal system configuration of each Micro-VM matches its assigned geolocation. 
              This includes setting the correct system clock, language packs, and regional DNS to prevent detection of the host's actual location.
            </p>
            <div className="flex gap-4">
              <div className="flex-1 p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Active Locales</p>
                <p className="text-xl font-black">14</p>
              </div>
              <div className="flex-1 p-4 bg-slate-900/50 rounded-2xl border border-slate-800">
                <p className="text-[10px] font-black text-slate-500 uppercase mb-2">Sync Rate</p>
                <p className="text-xl font-black text-emerald-500">100%</p>
              </div>
            </div>
          </div>
          <div className="bg-slate-950 rounded-2xl p-6 font-mono text-[11px] text-slate-400">
            <p className="text-blue-500 mb-2"># System Fingerprint Audit</p>
            <p>$ timedatectl status</p>
            <p className="text-slate-500">Time zone: Europe/Madrid (CET, +0100)</p>
            <p>$ localectl status</p>
            <p className="text-slate-500">System Locale: LANG=es_ES.UTF-8</p>
            <p>$ cat /etc/resolv.conf</p>
            <p className="text-slate-500">nameserver 1.1.1.1</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default FingerprintManager;
