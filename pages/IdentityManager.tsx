
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../App';

interface Identity {
  vmId: string;
  country: string;
  publicIp: string;
  isp: string;
  asn: string;
  type: 'Datacenter' | 'Residential' | 'Mobile';
  status: 'Secure' | 'Warning' | 'Leaking';
  lastCheck: string;
}

const IdentityManager: React.FC = () => {
  const { t } = useTranslation();
  const [identities, setIdentities] = useState<Identity[]>([
    { vmId: 'vm-001', country: 'Spain', publicIp: '85.12.34.56', isp: 'DigitalOcean', asn: 'AS14061', type: 'Datacenter', status: 'Secure', lastCheck: '2m ago' },
    { vmId: 'vm-002', country: 'USA', publicIp: '104.21.5.88', isp: 'Cloudflare', asn: 'AS13335', type: 'Datacenter', status: 'Secure', lastCheck: '5m ago' },
    { vmId: 'vm-003', country: 'Japan', publicIp: '157.7.12.4', isp: 'Softbank', asn: 'AS17676', type: 'Residential', status: 'Warning', lastCheck: '1m ago' },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('identityManager')}</h2>
          <p className="text-sm text-slate-500 font-mono">{t('realTimeIdentity')}</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">
          {t('externalVerification')}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">VM ID</th>
                <th className="px-8 py-5">{t('assignedCountry')}</th>
                <th className="px-8 py-5">{t('publicIpReal')}</th>
                <th className="px-8 py-5">{t('ispVisible')}</th>
                <th className="px-8 py-5">{t('asn')}</th>
                <th className="px-8 py-5">{t('ipType')}</th>
                <th className="px-8 py-5">{t('leakTest')}</th>
                <th className="px-8 py-5 text-right">Last Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {identities.map((id) => (
                <tr key={id.vmId} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-6 font-mono font-bold text-sm">{id.vmId}</td>
                  <td className="px-8 py-6 text-sm font-medium text-slate-300">{id.country}</td>
                  <td className="px-8 py-6 text-xs font-mono text-emerald-400">{id.publicIp}</td>
                  <td className="px-8 py-6 text-xs text-slate-400 font-bold">{id.isp}</td>
                  <td className="px-8 py-6 text-[10px] font-mono text-slate-500">{id.asn}</td>
                  <td className="px-8 py-6">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${
                      id.type === 'Residential' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 
                      id.type === 'Mobile' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 
                      'bg-slate-500/10 text-slate-400 border border-slate-500/20'
                    }`}>
                      {id.type}
                    </span>
                  </td>
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-2">
                      <div className={`w-2 h-2 rounded-full ${
                        id.status === 'Secure' ? 'bg-emerald-500' : 
                        id.status === 'Warning' ? 'bg-amber-500' : 'bg-rose-500'
                      }`}></div>
                      <span className={`text-[10px] font-bold ${
                        id.status === 'Secure' ? 'text-emerald-500' : 
                        id.status === 'Warning' ? 'text-amber-500' : 'text-rose-500'
                      }`}>
                        {id.status === 'Secure' ? t('isolatedCorrectly') : id.status === 'Warning' ? t('possibleLeak') : t('trafficOutsideTunnel')}
                      </span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-right text-[10px] text-slate-600 font-mono italic">{id.lastCheck}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-6">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">{t('simulated')} vs {t('real')}</h3>
          <div className="space-y-3">
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">{t('hardware')}</span>
              <span className="text-emerald-500 font-bold">{t('simulated')}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">{t('virtualKernel')}</span>
              <span className="text-emerald-500 font-bold">{t('simulated')}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">{t('internalNetwork')}</span>
              <span className="text-emerald-500 font-bold">{t('simulated')}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">{t('publicIpReal')}</span>
              <span className="text-blue-500 font-bold">{t('real')}</span>
            </div>
            <div className="flex justify-between items-center text-xs">
              <span className="text-slate-400">{t('ispVisible')}</span>
              <span className="text-blue-500 font-bold">{t('real')}</span>
            </div>
          </div>
        </div>

        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-6 col-span-2">
          <h3 className="text-xs font-black text-slate-500 uppercase tracking-widest mb-4">{t('externalVerification')} Sources</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {['ipinfo.io', 'ifconfig.me', 'ip-api.com', 'icanhazip.com'].map(source => (
              <div key={source} className="p-3 bg-slate-900/50 rounded-xl border border-slate-800 flex flex-col items-center gap-2">
                <span className="text-xs font-mono text-slate-300">{source}</span>
                <span className="text-[9px] text-emerald-500 font-bold">ACTIVE</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default IdentityManager;
