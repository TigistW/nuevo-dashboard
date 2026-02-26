
import React, { useState, useEffect } from 'react';
import { useTranslation } from '../App';

interface MicroVM {
  id: string;
  country: string;
  publicIp: string;
  status: 'Running' | 'Stopped';
  ram: string;
  cpu: string;
  uptime: string;
}

const MicroVMs: React.FC = () => {
  const { t } = useTranslation();
  const [vms, setVms] = useState<MicroVM[]>([
    { id: 'vm-001', country: 'Spain', publicIp: '85.12.34.56', status: 'Running', ram: '128MB', cpu: '1 vCPU', uptime: '12h 45m' },
    { id: 'vm-002', country: 'USA', publicIp: '104.21.5.88', status: 'Running', ram: '256MB', cpu: '1 vCPU', uptime: '3d 2h' },
    { id: 'vm-003', country: 'Japan', publicIp: '157.7.12.4', status: 'Stopped', ram: '128MB', cpu: '1 vCPU', uptime: '0m' },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('microVms')}</h2>
          <p className="text-sm text-slate-500 font-mono">Firecracker Micro-VM Orchestration Layer</p>
        </div>
        <div className="flex gap-3">
          <button className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700">{t('cloneMicroVm')}</button>
          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">{t('createMicroVm')}</button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {vms.map((vm) => (
          <div key={vm.id} className="bg-[#0d1225] border border-slate-800 rounded-3xl p-6 relative overflow-hidden group hover:border-emerald-500/50 transition-all duration-300">
            <div className={`absolute -right-4 -top-4 w-24 h-24 ${vm.status === 'Running' ? 'bg-emerald-500/5' : 'bg-rose-500/5'} blur-3xl rounded-full`}></div>
            
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-lg font-black font-mono">{vm.id}</h3>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">{vm.country}</p>
              </div>
              <span className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter ${
                vm.status === 'Running' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
              }`}>
                {vm.status}
              </span>
            </div>

            <div className="space-y-4 mb-8">
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">{t('publicIp')}</span>
                <span className="font-mono text-slate-300">{vm.publicIp}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">{t('ramUsed')}</span>
                <span className="font-mono text-slate-300">{vm.ram}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">{t('cpuUsed')}</span>
                <span className="font-mono text-slate-300">{vm.cpu}</span>
              </div>
              <div className="flex justify-between items-center text-xs">
                <span className="text-slate-500">{t('uptime')}</span>
                <span className="font-mono text-slate-300">{vm.uptime}</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button className="py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-bold border border-slate-800 transition-colors">{t('stopMicroVm')}</button>
              <button className="py-2 bg-slate-900 hover:bg-slate-800 rounded-xl text-[10px] font-bold border border-slate-800 transition-colors">{t('restartMicroVm')}</button>
              <button className="py-2 bg-rose-900/20 hover:bg-rose-900/40 rounded-xl text-[10px] font-bold border border-rose-500/20 text-rose-500 transition-all">{t('deleteMicroVm')}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MicroVMs;
