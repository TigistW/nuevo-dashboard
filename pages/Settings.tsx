
import React, { useState, useRef } from 'react';
import { loadData, saveData, addTemplate, removeTemplate } from '../services/state';
import { AppSettings, NotebookTemplate, Language } from '../types';
import { useTranslation } from '../App';

const Settings: React.FC = () => {
  const { t, setLanguage } = useTranslation();
  const [data, setData] = useState(loadData());
  const [settings, setSettings] = useState<AppSettings>(data.settings);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleSave = () => {
    const newData = { ...data, settings };
    saveData(newData);
    setData(newData);
    setLanguage(settings.language);
    setSaveStatus(settings.language === 'es' ? 'Configuración guardada.' : 'Settings saved.');
    setTimeout(() => setSaveStatus(null), 3000);
  };

  const toggle = (key: keyof AppSettings) => {
    setSettings({ ...settings, [key]: !settings[key] });
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.name.endsWith('.ipynb')) {
      addTemplate(file.name, `${settings.notebooksPath}/${file.name}`);
      setData(loadData());
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-4 duration-500 pb-20">
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-8 shadow-xl">
        <h2 className="text-2xl font-bold mb-8 flex items-center gap-3">
          🛠️ {t('settings')}
        </h2>
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('general')}</h3>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t('languageIdioma')}</label>
              <select 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                value={settings.language}
                onChange={(e) => setSettings({...settings, language: e.target.value as Language})}
              >
                <option value="es">🇪🇸 Español</option>
                <option value="en">🇺🇸 English</option>
                <option value="ja">🇯🇵 日本語</option>
                <option value="zh">🇨🇳 中文</option>
                <option value="ko">🇰🇷 한국어</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t('driveBaseFolder')}</label>
              <input 
                type="text" 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500" 
                value={settings.drivePath}
                onChange={(e) => setSettings({...settings, drivePath: e.target.value})}
              />
            </div>
          </div>

          <div className="space-y-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('executionLimits')}</h3>
            <div>
              <label className="block text-sm font-medium text-slate-400 mb-1">{t('maxSimultaneousAccounts')}</label>
              <input 
                type="number" 
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none focus:ring-1 focus:ring-emerald-500" 
                value={settings.maxAccounts}
                onChange={(e) => setSettings({...settings, maxAccounts: parseInt(e.target.value)})}
              />
            </div>
          </div>
        </div>

        <div className="mt-12 space-y-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('features')}</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-center justify-between p-4 bg-slate-900 rounded-xl border border-slate-700">
              <span className="font-semibold">{t('headlessMode')}</span>
              <button 
                onClick={() => toggle('headlessMode')}
                className={`w-12 h-6 rounded-full transition-colors relative ${settings.headlessMode ? 'bg-emerald-600' : 'bg-slate-700'}`}
              >
                <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${settings.headlessMode ? 'left-7' : 'left-1'}`}></div>
              </button>
            </div>
          </div>
        </div>

        {/* Added: Notebook Template Management Section to support handleFileUpload and removeTemplate */}
        <div className="mt-12 space-y-4">
          <h3 className="text-sm font-bold text-slate-500 uppercase tracking-widest">{t('templates')}</h3>
          <div className="bg-slate-900 rounded-xl border border-slate-700 p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">{t('executionTemplates')}</p>
                <p className="text-xs text-slate-500">{t('registerNotebooks')}</p>
              </div>
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-xs font-bold border border-slate-700 transition-all"
              >
                + {t('registerIpynb')}
              </button>
              <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".ipynb" 
                onChange={handleFileUpload} 
              />
            </div>
            <div className="grid grid-cols-1 gap-2">
              {data.templates.map(tpl => (
                <div key={tpl.id} className="flex items-center justify-between p-3 bg-slate-800/50 rounded-lg border border-slate-700/50 group">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">📝</span>
                    <div>
                      <p className="text-xs font-bold text-slate-200">{tpl.name}</p>
                      <p className="text-[10px] text-slate-500 font-mono">{tpl.path}</p>
                    </div>
                  </div>
                  <button 
                    onClick={() => { removeTemplate(tpl.id); setData(loadData()); }}
                    className="p-1.5 bg-slate-700 hover:bg-rose-900/40 text-slate-400 hover:text-rose-500 rounded-lg transition-all"
                  >
                    🗑️
                  </button>
                </div>
              ))}
              {data.templates.length === 0 && (
                <div className="text-center py-6 border border-dashed border-slate-700 rounded-lg">
                  <p className="text-xs text-slate-500 italic">{t('noTemplatesAvailable')}</p>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-12 pt-8 border-t border-slate-700 flex items-center justify-between">
          <p className="text-xs text-slate-500">Colab Farm Dashboard v2.6.0</p>
          <div className="flex items-center gap-4">
            {saveStatus && <span className="text-emerald-500 text-sm animate-pulse">{saveStatus}</span>}
            <button 
              onClick={handleSave}
              className="px-8 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg transition-all"
            >
              {t('saveConfig')}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
