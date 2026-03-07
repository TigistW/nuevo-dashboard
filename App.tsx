import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Navigate, NavLink, Route, Routes } from 'react-router-dom';
import FleetConsole from './pages/FleetConsole';
import AutomationConsole from './pages/AutomationConsole';
import { translations } from './translations';
import { loadData, saveData } from './services/state';
import { Language } from './types';

const LanguageContext = createContext({
  t: (key: string) => key,
  language: 'es' as Language,
  setLanguage: (_lang: Language) => {},
});

export const useTranslation = () => useContext(LanguageContext);

const legacyAutomationRoutes = ['/verification', '/workflows', '/fingerprint'];

const legacyFleetRoutes = [
  '/microvms',
  '/network',
  '/identity',
  '/advanced-ops',
  '/accounts',
  '/workers',
  '/jobs',
  '/tasks',
  '/assets',
  '/logs',
  '/terminal',
  '/security',
  '/security-shield',
  '/auto-healing',
  '/templates',
  '/telemetry',
  '/scheduler',
  '/guardrails',
  '/central-logs',
  '/simulator',
  '/settings',
  '/identity/repos',
];

const App: React.FC = () => {
  const [currentLang, setCurrentLang] = useState<Language>(loadData().settings.language || 'es');

  useEffect(() => {
    const data = loadData();
    if (data.settings.language !== currentLang) {
      saveData({
        ...data,
        settings: {
          ...data.settings,
          language: currentLang,
        },
      });
    }
  }, [currentLang]);

  const t = (key: string) => {
    const langSet = translations[currentLang] || translations.en;
    return langSet[key] || key;
  };

  const shellCopy = useMemo(
    () =>
      currentLang === 'en'
        ? {
            badge: 'Basic Control Mode',
            title: 'SMTP MicroVM Dashboard',
            description:
              'Reduced to the two workflows you actually use: VM lifecycle and the operational tools around fingerprint, workflow execution, and SMS or QR verification.',
            layoutLabel: 'Active layout',
            layoutValue: '2 tabs only',
            tabs: [
              { label: 'VM Console', path: '/' },
              { label: 'Workflow Ops', path: '/automation' },
            ],
          }
        : {
            badge: 'Modo de Control Basico',
            title: 'Panel SMTP MicroVM',
            description:
              'Reducido a los dos flujos que realmente usas: ciclo de vida de VMs y las herramientas operativas para huella digital, ejecucion de flujos y verificacion por SMS o QR.',
            layoutLabel: 'Diseno activo',
            layoutValue: 'Solo 2 pestanas',
            tabs: [
              { label: 'Consola VM', path: '/' },
              { label: 'Operaciones de Flujo', path: '/automation' },
            ],
          },
    [currentLang]
  );

  return (
    <LanguageContext.Provider value={{ t, language: currentLang, setLanguage: setCurrentLang }}>
      <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(34,197,94,0.12),_transparent_28%),radial-gradient(circle_at_top_right,_rgba(14,165,233,0.10),_transparent_24%),linear-gradient(180deg,_#08111b_0%,_#0b1420_52%,_#0f172a_100%)] text-slate-100">
        <header className="sticky top-0 z-20 border-b border-slate-800/80 bg-slate-950/85 backdrop-blur-xl">
          <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
              <div className="space-y-2">
                <p className="text-[11px] font-bold uppercase tracking-[0.28em] text-emerald-400/80">
                  {shellCopy.badge}
                </p>
                <div>
                  <h1 className="text-3xl font-black uppercase tracking-tight text-white sm:text-4xl">
                    {shellCopy.title}
                  </h1>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">
                    {shellCopy.description}
                  </p>
                </div>
              </div>
              <div className="flex flex-col gap-3 rounded-2xl border border-slate-800 bg-slate-900/70 px-4 py-3 text-sm text-slate-300">
                <div>
                  <div className="font-mono text-xs uppercase tracking-[0.22em] text-slate-500">{shellCopy.layoutLabel}</div>
                  <div className="mt-1 font-semibold text-white">{shellCopy.layoutValue}</div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCurrentLang('en')}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] transition ${
                      currentLang === 'en'
                        ? 'border-sky-400/50 bg-sky-400/15 text-sky-200'
                        : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    English
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentLang('es')}
                    className={`rounded-full border px-3 py-1.5 text-xs font-bold uppercase tracking-[0.18em] transition ${
                      currentLang === 'es'
                        ? 'border-emerald-400/50 bg-emerald-400/15 text-emerald-200'
                        : 'border-slate-700 bg-slate-950/70 text-slate-300 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    Espanol
                  </button>
                </div>
              </div>
            </div>

            <nav className="flex flex-wrap gap-2">
              {shellCopy.tabs.map((tab) => (
                <NavLink
                  key={tab.path}
                  to={tab.path}
                  end={tab.path === '/'}
                  className={({ isActive }) =>
                    `rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                      isActive
                        ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300'
                        : 'border-slate-800 bg-slate-900/70 text-slate-300 hover:border-slate-700 hover:text-white'
                    }`
                  }
                >
                  {tab.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Routes>
            <Route path="/" element={<FleetConsole />} />
            <Route path="/automation" element={<AutomationConsole />} />
            {legacyAutomationRoutes.map((path) => (
              <Route key={path} path={path} element={<Navigate to="/automation" replace />} />
            ))}
            {legacyFleetRoutes.map((path) => (
              <Route key={path} path={path} element={<Navigate to="/" replace />} />
            ))}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </main>
      </div>
    </LanguageContext.Provider>
  );
};

export default App;
