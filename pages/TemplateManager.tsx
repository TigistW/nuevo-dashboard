
import React, { useState } from 'react';
import { useTranslation } from '../App';

interface Template {
  id: string;
  name: string;
  version: string;
  base: string;
  lastUpdated: string;
}

const TemplateManager: React.FC = () => {
  const { t } = useTranslation();
  const [templates] = useState<Template[]>([
    { id: 't-001', name: 'Alpine Minimal v3.18', version: '1.2.0', base: 'alpine-rootfs-3.18', lastUpdated: '2d ago' },
    { id: 't-002', name: 'Ubuntu Core 24.04', version: '0.9.5', base: 'ubuntu-minimal-24.04', lastUpdated: '5d ago' },
    { id: 't-003', name: 'AI Worker Base', version: '2.1.0', base: 'alpine-ai-stack', lastUpdated: '1h ago' },
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('templateManager')}</h2>
          <p className="text-sm text-slate-500 font-mono">Versioned Micro-VM Images & Snapshots</p>
        </div>
        <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">
          + Create Template
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6">{t('versionHistory')}</h3>
          <div className="space-y-4">
            {templates.map((tpl) => (
              <div key={tpl.id} className="p-6 bg-slate-900/50 rounded-2xl border border-slate-800 flex justify-between items-center group hover:border-emerald-500/30 transition-all">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 bg-slate-800 rounded-lg flex items-center justify-center text-xl">💿</div>
                  <div>
                    <h4 className="text-sm font-bold text-slate-200">{tpl.name}</h4>
                    <p className="text-[10px] text-slate-500 font-mono uppercase tracking-widest">Version: {tpl.version} // {tpl.id}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] font-bold transition-all border border-slate-700">Clone</button>
                  <button className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 rounded-lg text-[10px] font-bold transition-all border border-slate-700">Rollback</button>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl p-8">
          <h3 className="text-lg font-bold mb-6">Snapshot Control</h3>
          <div className="p-8 border-2 border-dashed border-slate-800 rounded-2xl text-center">
            <div className="text-4xl mb-4">📸</div>
            <p className="text-sm text-slate-400 mb-6">Take a snapshot of a running Micro-VM to create a new versioned template.</p>
            <select className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs outline-none mb-4">
              <option>Select Running VM...</option>
              <option>vm-001 (Spain)</option>
              <option>vm-002 (USA)</option>
            </select>
            <button className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white rounded-xl font-bold text-xs uppercase transition-all">Capture Snapshot</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TemplateManager;
