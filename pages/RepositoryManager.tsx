
import React, { useState } from 'react';
import { useTranslation } from '../App';

interface Repository {
  id: string;
  name: string;
  url: string;
  status: 'active' | 'syncing' | 'error';
  lastSync: string;
  apiEndpoint: string;
}

const RepositoryManager: React.FC = () => {
  const { t } = useTranslation();
  const [repos, setRepos] = useState<Repository[]>([
    { id: '1', name: 'Global ISP Database', url: 'https://github.com/example/isp-db', status: 'active', lastSync: '2024-05-20 10:00', apiEndpoint: '/api/v1/identity/isp-db' },
    { id: '2', name: 'Residential Proxy List', url: 'https://api.proxies.com/v2/list', status: 'syncing', lastSync: '2024-05-20 11:30', apiEndpoint: '/api/v1/identity/residential' }
  ]);
  const [newRepoUrl, setNewRepoUrl] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const handleAddRepo = () => {
    if (!newRepoUrl) return;
    setIsCreating(true);
    
    // Simulate API creation and repo addition
    setTimeout(() => {
      const newRepo: Repository = {
        id: Date.now().toString(),
        name: newRepoUrl.split('/').pop() || 'New Repo',
        url: newRepoUrl,
        status: 'active',
        lastSync: new Date().toISOString().replace('T', ' ').slice(0, 16),
        apiEndpoint: `/api/v1/identity/custom-${Math.random().toString(36).substring(7)}`
      };
      setRepos([...repos, newRepo]);
      setNewRepoUrl('');
      setIsCreating(false);
    }, 2000);
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('repositoryManager')}</h2>
          <p className="text-sm text-slate-500 font-mono">Manage external data sources for IP/ISP intelligence</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Add Repository Form */}
        <div className="lg:col-span-1 bg-slate-800/30 border border-slate-700/50 rounded-3xl p-8 backdrop-blur-sm h-fit">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <span>➕</span> {t('addRepository')}
          </h3>
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-[10px] font-black text-slate-500 uppercase tracking-widest">{t('repoUrl')}</label>
              <input 
                type="text" 
                value={newRepoUrl}
                onChange={(e) => setNewRepoUrl(e.target.value)}
                placeholder="https://github.com/user/repo"
                className="w-full bg-slate-900 border border-slate-800 rounded-xl px-4 py-3 text-xs outline-none focus:ring-2 focus:ring-emerald-500 transition-all font-mono"
              />
            </div>
            <button 
              onClick={handleAddRepo}
              disabled={isCreating || !newRepoUrl}
              className="w-full py-3 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-black text-[10px] uppercase shadow-lg shadow-emerald-500/10 transition-all disabled:opacity-50"
            >
              {isCreating ? 'Creating API...' : t('createApi')}
            </button>
          </div>
        </div>

        {/* Repository List */}
        <div className="lg:col-span-2 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-2">{t('repoList')}</h3>
          <div className="grid grid-cols-1 gap-4">
            {repos.map(repo => (
              <div key={repo.id} className="bg-slate-900/50 border border-slate-800 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 hover:border-emerald-500/30 transition-all group">
                <div className="space-y-1">
                  <div className="flex items-center gap-3">
                    <h4 className="font-bold text-slate-200">{repo.name}</h4>
                    <span className={`px-2 py-0.5 rounded-full text-[8px] font-black uppercase ${
                      repo.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 
                      repo.status === 'syncing' ? 'bg-blue-500/10 text-blue-500 animate-pulse' : 
                      'bg-rose-500/10 text-rose-500'
                    }`}>
                      {repo.status}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 font-mono truncate max-w-md">{repo.url}</p>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="text-right">
                    <p className="text-[9px] font-black text-slate-600 uppercase tracking-widest">API Endpoint</p>
                    <p className="text-[10px] text-emerald-400 font-mono bg-emerald-400/5 px-2 py-1 rounded border border-emerald-400/10">{repo.apiEndpoint}</p>
                  </div>
                  <p className="text-[9px] text-slate-600 uppercase">Last Sync: {repo.lastSync}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RepositoryManager;
