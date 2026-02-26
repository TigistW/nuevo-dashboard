
import React, { useState } from 'react';
import { useTranslation } from '../App';

interface WorkflowStep {
  id: string;
  type: string;
  label: string;
  icon: string;
}

const WorkflowBuilder: React.FC = () => {
  const { t } = useTranslation();
  const availableSteps = [
    { type: 'infra', label: 'Create Micro-VM', icon: '📦' },
    { type: 'network', label: 'Assign Network/IP', icon: '🌐' },
    { type: 'identity', label: 'Generate Fingerprint', icon: '👤' },
    { type: 'automation', label: 'Execute Automation', icon: '⚡' },
    { type: 'verification', label: 'Handle Verification', icon: '✅' },
    { type: 'task', label: 'Execute Task', icon: '📋' },
    { type: 'session', label: 'Persist Session', icon: '💾' },
  ];

  const [steps, setSteps] = useState<WorkflowStep[]>([
    { id: '1', type: 'infra', label: 'Create Micro-VM', icon: '📦' },
    { id: '2', type: 'network', label: 'Assign Network/IP', icon: '🌐' },
    { id: '3', type: 'identity', label: 'Generate Fingerprint', icon: '👤' },
    { id: '4', type: 'automation', label: 'Execute Automation', icon: '⚡' },
  ]);

  const addStep = (step: any) => {
    setSteps([...steps, { ...step, id: Date.now().toString() }]);
  };

  const removeStep = (id: string) => {
    setSteps(steps.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('workflows')}</h2>
          <p className="text-sm text-slate-500 font-mono">Design automated multi-step operational pipelines</p>
        </div>
        <button className="px-6 py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-bold text-xs uppercase shadow-lg shadow-emerald-600/20 transition-all">
          {t('executeWorkflow')}
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Available Steps */}
        <div className="lg:col-span-1 bg-slate-800/30 border border-slate-700/50 rounded-3xl p-6 backdrop-blur-sm h-fit">
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-6">{t('addStep')}</h3>
          <div className="space-y-3">
            {availableSteps.map((step, i) => (
              <button 
                key={i}
                onClick={() => addStep(step)}
                className="w-full flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-800 rounded-xl hover:border-emerald-500/30 transition-all group text-left"
              >
                <span className="text-xl group-hover:scale-110 transition-transform">{step.icon}</span>
                <span className="text-xs font-bold text-slate-300">{step.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Builder Canvas */}
        <div className="lg:col-span-3 bg-[#0d1225] border border-slate-800 rounded-3xl p-8 relative overflow-hidden">
          <div className="absolute inset-0 opacity-5 pointer-events-none" style={{ backgroundImage: 'radial-gradient(#475569 1px, transparent 1px)', backgroundSize: '20px 20px' }}></div>
          
          <h3 className="text-[10px] font-black text-slate-500 uppercase tracking-widest mb-8 relative z-10">{t('workflowSteps')}</h3>
          
          <div className="flex flex-col items-center gap-6 relative z-10">
            {steps.map((step, i) => (
              <React.Fragment key={step.id}>
                <div className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-5 flex items-center justify-between group hover:border-emerald-500/50 transition-all shadow-xl">
                  <div className="flex items-center gap-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${step.type === 'trigger' ? 'bg-amber-500/10 text-amber-500' : 'bg-blue-500/10 text-blue-500'}`}>
                      {step.icon}
                    </div>
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-widest opacity-40">{step.type}</p>
                      <p className="text-sm font-bold text-slate-200">{step.label}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => removeStep(step.id)}
                    className="opacity-0 group-hover:opacity-100 p-2 text-rose-500 hover:bg-rose-500/10 rounded-lg transition-all"
                  >
                    ✕
                  </button>
                </div>
                {i < steps.length - 1 && (
                  <div className="w-0.5 h-6 bg-slate-800"></div>
                )}
              </React.Fragment>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowBuilder;
