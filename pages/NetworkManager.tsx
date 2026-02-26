
import React, { useState } from 'react';
import { useTranslation } from '../App';

const NetworkManager: React.FC = () => {
  const { t } = useTranslation();
  const [tunnels, setTunnels] = useState([
    { 
      id: 'wg-es-01', 
      country: 'Spain', 
      provider: 'DigitalOcean', 
      latency: '45ms', 
      status: 'Connected', 
      ip: '85.12.34.56',
      ipType: 'Residential',
      asn: 'AS12345',
      trustScore: 98,
      geoMatch: true,
      tzMatch: true
    },
    { 
      id: 'wg-us-01', 
      country: 'USA', 
      provider: 'Linode', 
      latency: '120ms', 
      status: 'Connected', 
      ip: '104.21.5.88',
      ipType: 'DataCenter',
      asn: 'AS54321',
      trustScore: 75,
      geoMatch: true,
      tzMatch: false
    },
    { 
      id: 'wg-jp-01', 
      country: 'Japan', 
      provider: 'Vultr', 
      latency: '280ms', 
      status: 'Disconnected', 
      ip: '---',
      ipType: 'Mobile',
      asn: 'AS99999',
      trustScore: 0,
      geoMatch: false,
      tzMatch: false
    },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('networkManager')}</h2>
          <p className="text-sm text-slate-500 font-mono">Network Intelligence & Geolocation Layer</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700">{t('dnsLeakTest')}</button>
          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">{t('vpsRegistry')}</button>
        </div>
      </div>

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="h-64 bg-slate-900/50 relative flex items-center justify-center overflow-hidden border-b border-slate-800">
          <div className="absolute inset-0 opacity-10 pointer-events-none">
            <svg viewBox="0 0 1000 500" className="w-full h-full fill-slate-400">
              <path d="M150,100 Q200,50 250,100 T350,100 T450,150 T550,100 T650,150 T750,100 T850,150" fill="none" stroke="currentColor" strokeWidth="1" />
            </svg>
          </div>
          <div className="relative z-10 flex gap-8">
            <div className="flex flex-col items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse"></div>
              <span className="text-[10px] font-black uppercase text-slate-500">Madrid</span>
            </div>
            <div className="flex flex-col items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)] animate-pulse"></div>
              <span className="text-[10px] font-black uppercase text-slate-500">New York</span>
            </div>
          </div>
          <div className="absolute top-4 left-4">
            <span className="px-2 py-1 bg-emerald-500/10 text-emerald-500 text-[8px] font-black rounded uppercase">Global Connectivity Map</span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">Tunnel ID</th>
                <th className="px-8 py-5">Intel</th>
                <th className="px-8 py-5">Latency</th>
                <th className="px-8 py-5">Public IP</th>
                <th className="px-8 py-5">Trust Score</th>
                <th className="px-8 py-5 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {tunnels.map((tunnel) => (
                <tr key={tunnel.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${tunnel.status === 'Connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`}></div>
                      <div>
                        <span className="font-mono font-bold text-sm block">{tunnel.id}</span>
                        <span className="text-[9px] text-slate-500 uppercase">{tunnel.country} // {tunnel.provider}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase ${
                          tunnel.ipType === 'Residential' ? 'bg-emerald-500/10 text-emerald-500' :
                          tunnel.ipType === 'Mobile' ? 'bg-blue-500/10 text-blue-500' : 'bg-amber-500/10 text-amber-500'
                        }`}>{tunnel.ipType}</span>
                        <span className="text-[9px] font-mono text-slate-500">{tunnel.asn}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${tunnel.geoMatch ? 'bg-emerald-500' : 'bg-rose-500'}`} title="Geo Consistency"></span>
                        <span className={`w-1.5 h-1.5 rounded-full ${tunnel.tzMatch ? 'bg-emerald-500' : 'bg-rose-500'}`} title="Timezone Consistency"></span>
                      </div>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-xs font-mono text-emerald-400">{tunnel.latency}</td>
                  <td className="px-8 py-6 text-xs font-mono text-slate-400">{tunnel.ip}</td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                        <div className={`h-full ${tunnel.trustScore > 80 ? 'bg-emerald-500' : tunnel.trustScore > 50 ? 'bg-amber-500' : 'bg-rose-500'}`} style={{ width: `${tunnel.trustScore}%` }}></div>
                      </div>
                      <span className="text-[10px] font-mono font-bold">{tunnel.trustScore}%</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-[10px] font-bold border border-slate-800 transition-all">{t('generateKeys')}</button>
                      <button className="px-3 py-1.5 bg-rose-900/20 hover:bg-rose-900/40 rounded-lg text-[10px] font-bold border border-rose-500/20 text-rose-500 transition-all">{t('killSwitch')}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/20 rounded-3xl p-8">
          <h3 className="text-lg font-black mb-4 italic uppercase tracking-tighter">Global Exit Nodes</h3>
          <div className="flex items-center gap-6">
            <div className="text-4xl">🌍</div>
            <div className="space-y-1">
              <p className="text-2xl font-black">12 Countries</p>
              <p className="text-xs text-slate-500 font-mono">Active WireGuard Endpoints</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border border-emerald-500/20 rounded-3xl p-8">
          <h3 className="text-lg font-black mb-4 italic uppercase tracking-tighter">Network Isolation</h3>
          <div className="flex items-center gap-6">
            <div className="text-4xl">🛡️</div>
            <div className="space-y-1">
              <p className="text-2xl font-black">100% Leak-Proof</p>
              <p className="text-xs text-slate-500 font-mono">Kill-switch active on all nodes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default NetworkManager;
