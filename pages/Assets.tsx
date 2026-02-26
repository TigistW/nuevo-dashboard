
import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useTranslation } from '../App';
import { loadData, saveData } from '../services/state';
import { GoogleGenAI } from '@google/genai';

const Assets: React.FC = () => {
  const { t } = useTranslation();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const [activeSubTab, setActiveSubTab] = useState(searchParams.get('tab') || 'models');
  const [githubQuery, setGithubQuery] = useState('');
  const [githubResults, setGithubResults] = useState<any[]>([]);
  const [isSearchingGit, setIsSearchingGit] = useState(false);

  // Dataset Assistant State
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab) setActiveSubTab(tab);
  }, [location.search]);

  const searchGithub = async () => {
    if (!githubQuery) return;
    setIsSearchingGit(true);
    try {
      const response = await fetch(`https://api.github.com/search/repositories?q=${githubQuery}+topic:ai-model+stars:>100&sort=stars&order=desc`);
      const data = await response.json();
      setGithubResults(data.items || []);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSearchingGit(false);
    }
  };

  const askAiAssistant = async () => {
    if (!aiPrompt) return;
    setIsAiLoading(true);
    setAiResponse(null);
    try {
      const ai = new GoogleGenAI({ apiKey: (process.env.API_KEY as string) });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Como experto en Machine Learning, recomienda datasets abiertos para la siguiente necesidad: "${aiPrompt}". 
        Proporciona el nombre del dataset, por qué es relevante y dónde encontrarlo (ej: HuggingFace, Kaggle, UCI). 
        Usa formato Markdown.`
      });
      setAiResponse(response.text || 'No response from assistant.');
    } catch (err) {
      setAiResponse("Error connecting to AI Assistant.");
    } finally {
      setIsAiLoading(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 pb-20">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('assets')}</h2>
          <p className="text-sm text-slate-500 font-mono">{t('internalExternalResources')}</p>
        </div>
        <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-800">
          {['models', 'datasets', 'templates'].map(tab => (
            <button
              key={tab}
              onClick={() => setActiveSubTab(tab)}
              className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${
                activeSubTab === tab ? 'bg-emerald-600 text-white shadow-xl' : 'text-slate-500'
              }`}
            >
              {t(tab)}
            </button>
          ))}
        </div>
      </div>

      {/* RENDER MODELS CONTENT */}
      {activeSubTab === 'models' && (
        <div className="space-y-12">
          {/* Section A: GitHub Model Explorer (ENHANCEMENT 2) */}
          <section className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
               <span className="text-2xl">⭐</span>
               <h3 className="text-xl font-bold">{t('githubExplorer')}</h3>
            </div>
            <div className="flex gap-4 mb-8">
              <input 
                type="text" 
                placeholder={t('searchRepoPlaceholder')}
                className="flex-1 bg-slate-900 border border-slate-800 rounded-xl px-5 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono text-xs"
                value={githubQuery}
                onChange={e => setGithubQuery(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && searchGithub()}
              />
              <button 
                onClick={searchGithub}
                disabled={isSearchingGit}
                className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-xl font-bold text-xs uppercase transition-all border border-slate-700 disabled:opacity-50"
              >
                {isSearchingGit ? t('searching') : t('search')}
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {githubResults.map(repo => (
                <div key={repo.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-5 hover:border-emerald-500/50 transition-all flex flex-col group">
                  <div className="flex justify-between items-start mb-3">
                    <h4 className="font-bold text-emerald-400 truncate max-w-[70%]">{repo.name}</h4>
                    <span className="text-[10px] font-mono text-slate-500">⭐ {repo.stargazers_count}</span>
                  </div>
                  <p className="text-xs text-slate-400 line-clamp-2 mb-4 h-8">{repo.description || 'No description provided.'}</p>
                  <div className="mt-auto pt-4 flex justify-between items-center border-t border-slate-800">
                    <span className="text-[9px] font-black uppercase text-slate-600">{repo.language || 'Unknown'}</span>
                    <button className="text-[10px] bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white px-3 py-1.5 rounded-lg transition-all border border-emerald-500/20">
                      {t('importReference')}
                    </button>
                  </div>
                </div>
              ))}
              {githubResults.length === 0 && !isSearchingGit && (
                <div className="col-span-full py-10 text-center text-slate-600 italic text-sm">
                  {t('discoverNewModels')}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* RENDER DATASETS CONTENT */}
      {activeSubTab === 'datasets' && (
        <div className="space-y-12">
          {/* Section B: Dataset Discovery Assistant (ENHANCEMENT 3) */}
          <section className="bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-sm">
            <div className="flex items-center gap-3 mb-6">
               <span className="text-2xl">🧠</span>
               <h3 className="text-xl font-bold">{t('dbDiscoveryAssistant')}</h3>
            </div>
            
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-10">
              {/* Direct Search Panel */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('directDiscovery')}</p>
                <div className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 space-y-4">
                  <input 
                    type="text" 
                    placeholder={t('quickDatasetPlaceholder')}
                    className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-2 text-xs outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                  <div className="space-y-2">
                    {['ImageNet-21k', 'Common Crawl', 'LAION-5B', 'WikiText-103'].map(ds => (
                      <div key={ds} className="flex justify-between items-center p-3 bg-slate-800/40 rounded-xl border border-slate-700/30">
                        <span className="text-xs font-bold">{ds}</span>
                        <span className="text-[9px] text-slate-500">Source: Web</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* AI Assistant Panel */}
              <div className="space-y-4">
                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('aiIntentAnalysis')}</p>
                <div className="bg-slate-950/50 border border-slate-800 rounded-2xl p-6 flex flex-col h-full">
                  <textarea 
                    className="flex-1 bg-transparent text-xs font-mono outline-none resize-none min-h-[100px]"
                    placeholder={t('aiPromptPlaceholder')}
                    value={aiPrompt}
                    onChange={e => setAiPrompt(e.target.value)}
                  ></textarea>
                  <button 
                    onClick={askAiAssistant}
                    disabled={isAiLoading || !aiPrompt}
                    className="mt-4 w-full py-2.5 bg-gradient-to-r from-emerald-600 to-blue-600 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-emerald-500/10 disabled:opacity-50"
                  >
                    {isAiLoading ? t('analyzingIntention') : t('askAssistant')}
                  </button>
                </div>
              </div>
            </div>

            {/* AI Result View */}
            {aiResponse && (
              <div className="mt-8 bg-emerald-500/5 border border-emerald-500/20 rounded-2xl p-8 animate-in slide-in-from-top-4 duration-300">
                <div className="flex items-center gap-2 mb-4">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-black text-emerald-500 uppercase">{t('analysisResults')}</span>
                </div>
                <div className="text-xs text-slate-300 leading-relaxed font-mono whitespace-pre-wrap">
                  {aiResponse}
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
};

export default Assets;
