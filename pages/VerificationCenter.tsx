
import React, { useState } from 'react';
import { useTranslation } from '../App';

const VerificationCenter: React.FC = () => {
  const { t } = useTranslation();
  const [verifications, setVerifications] = useState([
    { id: 'V-101', workerId: 'W-001', type: 'SMS', status: 'Pending', provider: 'Twilio', phone: '+123456789', timestamp: '2024-03-20 14:30:00' },
    { id: 'V-102', workerId: 'W-002', type: 'QR', status: 'Verified', provider: 'Internal', phone: '---', timestamp: '2024-03-20 14:15:00' },
    { id: 'V-103', workerId: 'W-003', type: 'SMS', status: 'Failed', provider: 'SmsPVA', phone: '+987654321', timestamp: '2024-03-20 14:00:00' },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('verificationCenter')}</h2>
          <p className="text-sm text-slate-500 font-mono">SMS, QR & Device Verification Hub</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700">{t('successMetrics')}</button>
          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">{t('pendingSms')}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">ID</th>
                <th className="px-8 py-5">Worker</th>
                <th className="px-8 py-5">Type</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5">Provider</th>
                <th className="px-8 py-5 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {verifications.map((v) => (
                <tr key={v.id} className="hover:bg-slate-800/30 transition-colors group">
                  <td className="px-8 py-6 font-mono font-bold text-sm">{v.id}</td>
                  <td className="px-8 py-6 text-sm font-medium text-slate-300">{v.workerId}</td>
                  <td className="px-8 py-6 text-xs text-slate-500 font-mono">{v.type}</td>
                  <td className="px-8 py-6">
                    <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter ${
                      v.status === 'Verified' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 
                      v.status === 'Pending' ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' : 
                      'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                    }`}>
                      {v.status}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-xs font-mono text-slate-400">{v.provider}</td>
                  <td className="px-8 py-6 text-right">
                    <button className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-[10px] font-bold border border-slate-800 transition-all">{t('retry')}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-900/20 to-blue-900/20 border border-blue-500/20 rounded-3xl p-6">
            <h3 className="text-sm font-black mb-4 uppercase tracking-widest text-blue-400">{t('androidActivity')}</h3>
            <div className="space-y-4">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-2xl border border-slate-800">
                  <div className="w-10 h-10 bg-blue-500/10 rounded-xl flex items-center justify-center text-xl">📱</div>
                  <div className="flex-1">
                    <p className="text-xs font-bold">Device Pixel_{i}</p>
                    <p className="text-[10px] text-slate-500 font-mono">Emulating Activity...</p>
                  </div>
                  <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/20 rounded-3xl p-6">
            <h3 className="text-sm font-black mb-4 uppercase tracking-widest text-purple-400">{t('qrVerification')}</h3>
            <div className="aspect-square bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <span className="text-4xl grayscale group-hover:grayscale-0 transition-all">📸</span>
              <div className="absolute bottom-4 left-4 right-4 text-center">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter">Waiting for QR Scan</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerificationCenter;
