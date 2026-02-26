
import React, { useState, useEffect, createContext, useContext } from 'react';
import { Routes, Route, Link, useLocation } from 'react-router-dom';
import Overview from './pages/Overview';
import Workers from './pages/Workers';
import Accounts from './pages/Accounts';
import Jobs from './pages/Jobs';
import TaskQueue from './pages/TaskQueue';
import Assets from './pages/Assets';
import Logs from './pages/Logs';
import Settings from './pages/Settings';
import MicroVMs from './pages/MicroVMs';
import IdentityManager from './pages/IdentityManager';
import NetworkManager from './pages/NetworkManager';
import SecurityAudit from './pages/SecurityAudit';
import AutoHealing from './pages/AutoHealing';
import TemplateManager from './pages/TemplateManager';
import Telemetry from './pages/Telemetry';
import FingerprintManager from './pages/FingerprintManager';
import TaskScheduler from './pages/TaskScheduler';
import ResourceGuardrails from './pages/ResourceGuardrails';
import LoggingCenter from './pages/LoggingCenter';
import DeploymentSimulator from './pages/DeploymentSimulator';
import RepositoryManager from './pages/RepositoryManager';
import TerminalConsole from './pages/TerminalConsole';
import WorkflowBuilder from './pages/WorkflowBuilder';
import SecurityShield from './pages/SecurityShield';
import VerificationCenter from './pages/VerificationCenter';
import SystemIntelligence from './components/SystemIntelligence';
import { translations } from './translations';
import { loadData } from './services/state';
import { Language } from './types';

const LanguageContext = createContext({
  t: (key: string) => key,
  language: 'es' as Language,
  setLanguage: (lang: Language) => {}
});

export const useTranslation = () => useContext(LanguageContext);

const App: React.FC = () => {
  const location = useLocation();
  const [currentLang, setCurrentLang] = useState<Language>(loadData().settings.language || 'es');
  const t = (key: string) => {
    const langSet = translations[currentLang] || translations['en'];
    return langSet[key] || key;
  };

  const sections = [
    { 
      title: t('operations'), 
      items: [
        { label: t('dashboard'), path: '/', icon: '📊' },
        { label: t('workers'), path: '/workers', icon: '🤖' },
        { label: t('verification'), path: '/verification', icon: '✅' },
      ]
    },
    { 
      title: t('automation'), 
      items: [
        { label: t('workflows'), path: '/workflows', icon: '🔗' },
        { label: t('jobs'), path: '/jobs', icon: '⚡' },
        { label: t('tasks'), path: '/tasks', icon: '📋' },
        { label: t('scheduler'), path: '/scheduler', icon: '📅' },
      ]
    },
    { 
      title: t('networkAndIdentity'), 
      items: [
        { label: t('networkManager'), path: '/network', icon: '🌐' },
        { label: t('identityManager'), path: '/identity', icon: '🆔' },
        { label: t('fingerprintManager'), path: '/fingerprint', icon: '👤' },
        { label: t('repositoryManager'), path: '/identity/repos', icon: '📂' },
      ]
    },
    { 
      title: t('infrastructure'), 
      items: [
        { label: t('microVms'), path: '/microvms', icon: '📦' },
        { label: t('terminal'), path: '/terminal', icon: '📟' },
        { label: t('resourceGuardrails'), path: '/guardrails', icon: '🚧' },
        { label: t('templateManager'), path: '/templates', icon: '💿' },
      ]
    },
    { 
      title: t('securityAndRisk'), 
      items: [
        { label: t('securityShield'), path: '/security-shield', icon: '🛡️' },
        { label: t('securityAudit'), path: '/security', icon: '🔍' },
        { label: t('autoHealing'), path: '/auto-healing', icon: '🩹' },
      ]
    },
    { 
      title: t('analytics'), 
      items: [
        { label: t('telemetry'), path: '/telemetry', icon: '📈' },
        { label: t('loggingCenter'), path: '/central-logs', icon: '📜' },
      ]
    },
    { 
      title: t('governance'), 
      items: [
        { label: t('accounts'), path: '/accounts', icon: '🔐' },
        { label: t('simulator'), path: '/simulator', icon: '🧪' },
      ]
    },
    { 
      title: t('assets'), 
      items: [
        { label: t('models'), path: '/assets?tab=models', icon: '💎' },
        { label: t('datasets'), path: '/assets?tab=datasets', icon: '📂' },
      ]
    }
  ];

  const languages: {code: Language, label: string, flag: string}[] = [
    { code: 'es', label: 'Español', flag: '🇪🇸' },
    { code: 'en', label: 'English', flag: '🇺🇸' },
    { code: 'ja', label: '日本語', flag: '🇯🇵' },
    { code: 'zh', label: '中文', flag: '🇨🇳' },
    { code: 'ko', label: '한국어', flag: '🇰🇷' }
  ];

  return (
    <LanguageContext.Provider value={{ t, language: currentLang, setLanguage: setCurrentLang }}>
      <div className="flex h-screen bg-[#0a0f1d] text-slate-100 font-inter select-none">
        {/* Sidebar Pro - UNTOUCHED */}
        <aside className="w-64 bg-[#0d1225] border-r border-slate-800/50 flex flex-col">
          <div className="p-6 border-b border-slate-800/50 flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-emerald-500 to-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <span className="font-black text-white italic">CF</span>
            </div>
            <div>
              <h1 className="font-bold text-sm tracking-tight">COLAB FARM</h1>
              <p className="text-[10px] text-slate-500 font-mono">CORE v3.2.0-ADVANCED</p>
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-4 space-y-8 scrollbar-hide">
            {sections.map((sec, i) => (
              <div key={i} className="space-y-2">
                <h3 className="text-[10px] font-black text-slate-600 uppercase tracking-[2px] px-3">{sec.title}</h3>
                <div className="space-y-1">
                  {sec.items.map((item) => (
                    <Link
                      key={item.path}
                      to={item.path}
                      className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                        location.pathname + location.search === item.path 
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                        : 'text-slate-500 hover:bg-slate-800/50 hover:text-slate-300'
                      }`}
                    >
                      <span className="text-lg opacity-80 group-hover:scale-110 transition-transform">{item.icon}</span>
                      <span className="text-sm font-medium">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="p-4 border-t border-slate-800/50">
             <Link to="/settings" className="flex items-center gap-3 p-3 rounded-xl hover:bg-slate-800 transition-colors text-slate-400 text-sm">
               <span>⚙️</span>
               <span>{t('settings')}</span>
             </Link>
          </div>
        </aside>

        <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
          <header className="h-16 border-b border-slate-800/50 flex items-center justify-between px-8 bg-[#0a0f1d]/50 backdrop-blur-xl z-10">
            <div className="flex items-center gap-6">
               <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-full text-[11px] font-mono">
                 <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                 <span className="text-slate-400">{t('orchestrator')}: </span>
                 <span className="text-emerald-500">{t('ready')}</span>
               </div>
            </div>

            <div className="flex items-center gap-6">
              {/* GLOBAL LANGUAGE SELECTOR - ENHANCEMENT 1 */}
              <div className="relative group">
                <button className="flex items-center gap-2 px-3 py-1.5 bg-slate-800 border border-slate-700 rounded-lg text-xs font-bold hover:bg-slate-700 transition-all">
                  <span>🌐</span>
                  <span>{languages.find(l => l.code === currentLang)?.label}</span>
                  <span className="text-[8px] opacity-50">▼</span>
                </button>
                <div className="absolute right-0 mt-2 w-40 bg-[#1e293b] border border-slate-700 rounded-xl shadow-2xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-50">
                  {languages.map(lang => (
                    <button 
                      key={lang.code}
                      onClick={() => setCurrentLang(lang.code)}
                      className={`w-full flex items-center gap-3 px-4 py-3 text-xs hover:bg-emerald-500/10 transition-colors first:rounded-t-xl last:rounded-b-xl ${currentLang === lang.code ? 'text-emerald-500 font-bold' : 'text-slate-300'}`}
                    >
                      <span>{lang.flag}</span>
                      <span>{lang.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="h-8 w-[1px] bg-slate-800"></div>
              
              <div className="flex items-center gap-3">
                <div className="text-right hidden sm:block">
                  <p className="text-xs font-bold">Admin Root</p>
                  <p className="text-[10px] text-emerald-500 font-mono uppercase">{currentLang}_MODE</p>
                </div>
                <div className="w-9 h-9 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center text-lg">👤</div>
              </div>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto p-8 custom-scrollbar relative">
            <SystemIntelligence />
            <Routes>
              <Route path="/" element={<Overview />} />
              <Route path="/workers" element={<Workers />} />
              <Route path="/verification" element={<VerificationCenter />} />
              <Route path="/accounts" element={<Accounts />} />
              <Route path="/jobs" element={<Jobs />} />
              <Route path="/assets" element={<Assets />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/tasks" element={<TaskQueue />} />
              <Route path="/microvms" element={<MicroVMs />} />
              <Route path="/terminal" element={<TerminalConsole />} />
              <Route path="/identity" element={<IdentityManager />} />
              <Route path="/identity/repos" element={<RepositoryManager />} />
              <Route path="/network" element={<NetworkManager />} />
              <Route path="/security" element={<SecurityAudit />} />
              <Route path="/security-shield" element={<SecurityShield />} />
              <Route path="/auto-healing" element={<AutoHealing />} />
              <Route path="/templates" element={<TemplateManager />} />
              <Route path="/telemetry" element={<Telemetry />} />
              <Route path="/workflows" element={<WorkflowBuilder />} />
              <Route path="/fingerprint" element={<FingerprintManager />} />
              <Route path="/scheduler" element={<TaskScheduler />} />
              <Route path="/guardrails" element={<ResourceGuardrails />} />
              <Route path="/central-logs" element={<LoggingCenter />} />
              <Route path="/simulator" element={<DeploymentSimulator />} />
              <Route path="/colab" element={<div className="flex items-center justify-center h-full text-slate-500 font-mono">COLAB_AUTOMATION_PLACEHOLDER</div>} />
              <Route path="/comfyui" element={<div className="flex items-center justify-center h-full text-slate-500 font-mono">COMFYUI_TASKS_PLACEHOLDER</div>} />
              <Route path="/dist-ai" element={<div className="flex items-center justify-center h-full text-slate-500 font-mono">DISTRIBUTED_AI_PLACEHOLDER</div>} />
              <Route path="/settings" element={<Settings />} />
              <Route path="*" element={<div className="flex items-center justify-center h-full text-slate-500 font-mono">{t('pathNotFound')}</div>} />
            </Routes>
          </div>
        </main>
      </div>
    </LanguageContext.Provider>
  );
};

export default App;
