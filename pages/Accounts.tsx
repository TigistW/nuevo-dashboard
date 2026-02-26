
import React, { useState, useEffect } from 'react';
import { loadData, saveData, appendLog, addAccount, generateAiAccount } from '../services/state';
import { Account, AccountStatus } from '../types';
import { useTranslation } from '../App';

const Accounts: React.FC = () => {
  const { t } = useTranslation();
  const [data, setData] = useState(loadData());
  const [filter, setFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState<AccountStatus | 'All'>('All');
  
  // Creation States
  const [creationMode, setCreationMode] = useState<'single' | 'bulk'>('single');
  const [newAccEmail, setNewAccEmail] = useState('');
  const [newAccGpu, setNewAccGpu] = useState('T4');
  const [bulkEmails, setBulkEmails] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handleAiCreate = async () => {
    setIsGenerating(true);
    await generateAiAccount();
    setData(loadData());
    setIsGenerating(false);
  };

  useEffect(() => {
    const interval = setInterval(() => setData(loadData()), 8000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (creationMode === 'single') {
      if (!newAccEmail) return;
      addAccount(newAccEmail, newAccGpu);
      setNewAccEmail('');
    } else {
      const emails = bulkEmails.split(/[\s,]+/).filter(e => e.includes('@'));
      emails.forEach(email => addAccount(email, newAccGpu));
      setBulkEmails('');
    }
    setData(loadData());
  };

  const handleAction = (id: string, action: string) => {
    const newData = { ...data };
    const idx = newData.accounts.findIndex(a => a.id === id);
    if (idx === -1) return;

    const email = newData.accounts[idx].email;
    
    switch (action) {
      case 'reset':
        newData.accounts[idx].status = AccountStatus.FREE;
        newData.accounts[idx].currentTask = null;
        appendLog('info', email, 'Manual reset triggered.');
        break;
      case 'disconnect':
        newData.accounts[idx].status = AccountStatus.DISCONNECTED;
        appendLog('warning', email, 'Account manually disconnected.');
        break;
      case 'delete':
        newData.accounts.splice(idx, 1);
        appendLog('error', 'System', `Account deleted: ${email}`);
        break;
    }

    saveData(newData);
    setData(newData);
  };

  const getStatusLabel = (status: AccountStatus) => {
    switch (status) {
      case AccountStatus.FREE: return t('statusFree');
      case AccountStatus.BUSY: return t('statusBusy');
      case AccountStatus.DISCONNECTED: return t('statusDisconnected');
      default: return status;
    }
  };

  const filteredAccounts = data.accounts.filter(acc => {
    const matchesSearch = acc.email.toLowerCase().includes(filter.toLowerCase());
    const matchesStatus = statusFilter === 'All' || acc.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      
      {/* SECCIÓN DE CREACIÓN DE CUENTAS (PERSISTENTE) */}
      <section className="bg-slate-800 rounded-2xl border border-slate-700 shadow-xl overflow-hidden">
        <div className="border-b border-slate-700 p-6 bg-slate-800/50 flex justify-between items-center">
          <div>
            <h2 className="text-xl font-bold flex items-center gap-2">
              <span className="text-emerald-500">➕</span> {t('newAccountTitle')}
            </h2>
            <p className="text-sm text-slate-400">{t('registerIdentities')}</p>
          </div>
          <div className="flex bg-slate-900 p-1 rounded-lg border border-slate-700">
            <button 
              onClick={() => setCreationMode('single')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${creationMode === 'single' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t('individual')}
            </button>
            <button 
              onClick={() => setCreationMode('bulk')}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all ${creationMode === 'bulk' ? 'bg-emerald-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
            >
              {t('bulk')}
            </button>
            <button 
              onClick={handleAiCreate}
              disabled={isGenerating}
              className={`px-4 py-1.5 rounded-md text-xs font-bold transition-all flex items-center gap-2 ${isGenerating ? 'bg-purple-900/50 text-purple-300' : 'bg-purple-600 text-white hover:bg-purple-500 shadow-lg'}`}
            >
              {isGenerating ? '🤖 ...' : `✨ ${t('aiAutoCreate')}`}
            </button>
          </div>
        </div>

        <form onSubmit={handleCreateAccount} className="p-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-5 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('emailLabel')}</label>
            {creationMode === 'single' ? (
              <input 
                type="email" 
                placeholder="farm-user-01@gmail.com"
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all"
                value={newAccEmail}
                onChange={(e) => setNewAccEmail(e.target.value)}
              />
            ) : (
              <textarea 
                placeholder="user1@gmail.com, user2@gmail.com..."
                rows={1}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all min-h-[48px] resize-none"
                value={bulkEmails}
                onChange={(e) => setBulkEmails(e.target.value)}
              />
            )}
          </div>

          <div className="lg:col-span-4 space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wider">{t('gpuLabel')}</label>
            <select 
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition-all cursor-pointer appearance-none"
              value={newAccGpu}
              onChange={(e) => setNewAccGpu(e.target.value)}
            >
              <option value="T4">NVIDIA Tesla T4</option>
              <option value="L4">NVIDIA L4 Next-Gen</option>
              <option value="V100">NVIDIA V100 Tensor Core</option>
              <option value="A100">NVIDIA A100 (80GB/40GB)</option>
              <option value="CPU">CPU Only (No GPU)</option>
            </select>
          </div>

          <div className="lg:col-span-3">
            <button 
              type="submit" 
              className="w-full bg-emerald-600 hover:bg-emerald-500 text-white px-6 py-3.5 rounded-xl font-bold shadow-lg shadow-emerald-900/20 transition-all active:scale-95 flex items-center justify-center gap-2"
            >
              <span>🚀</span> {creationMode === 'single' ? t('save') : t('importList')}
            </button>
          </div>
        </form>
      </section>

      {/* LISTADO Y FILTROS */}
      <div className="space-y-6">
        <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-800 p-4 rounded-xl border border-slate-700">
          <div className="flex flex-1 gap-4 w-full">
            <div className="relative flex-1">
              <span className="absolute left-3 top-2.5 text-slate-500">🔍</span>
              <input 
                type="text" 
                placeholder={t('searchEmail')}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg pl-10 pr-4 py-2 focus:ring-2 focus:ring-emerald-500 outline-none transition-all"
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
              />
            </div>
            <select 
              className="bg-slate-900 border border-slate-700 rounded-lg px-4 py-2 outline-none cursor-pointer"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
            >
              <option value="All">{t('allStatus')}</option>
              <option value={AccountStatus.FREE}>{t('statusFree')}</option>
              <option value={AccountStatus.BUSY}>{t('statusBusy')}</option>
              <option value={AccountStatus.DISCONNECTED}>{t('statusDisconnected')}</option>
            </select>
          </div>
        </div>

        <div className="bg-slate-800 rounded-xl border border-slate-700 overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-900/50 text-xs text-slate-400 uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">{t('accounts')}</th>
                  <th className="px-6 py-4">{t('nickname')}</th>
                  <th className="px-6 py-4">{t('password')}</th>
                  <th className="px-6 py-4">{t('originalCountry')}</th>
                  <th className="px-6 py-4">{t('status')}</th>
                  <th className="px-6 py-4">{t('gpu')}</th>
                  <th className="px-6 py-4 text-center">{t('actions')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {filteredAccounts.map((acc) => (
                  <tr key={acc.id} className="hover:bg-slate-700/30 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-200">{acc.email}</div>
                      <div className="text-[10px] text-slate-500 font-mono">ID: {acc.id}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {acc.nickname || '—'}
                    </td>
                    <td className="px-6 py-4 font-mono text-xs text-slate-400">
                      {acc.password || '••••••••'}
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300">
                      {acc.originalCountry || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        acc.status === AccountStatus.FREE ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                        acc.status === AccountStatus.BUSY ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20' :
                        'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                      }`}>
                        {getStatusLabel(acc.status)}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-mono text-sm text-slate-400">
                      {acc.currentTask || '—'}
                    </td>
                    <td className="px-6 py-4">
                      <span className="text-xs px-2 py-0.5 bg-slate-900 rounded border border-slate-700 text-slate-300">
                        {acc.gpuType}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-400">{acc.runningTime}</td>
                    <td className="px-6 py-4">
                      <div className="flex justify-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => handleAction(acc.id, 'reset')} title="Reiniciar" className="p-2 bg-slate-700 hover:bg-slate-600 rounded-lg text-slate-300">🔄</button>
                        <button onClick={() => handleAction(acc.id, 'disconnect')} title="Detener" className="p-2 bg-rose-900/20 hover:bg-rose-900/40 rounded-lg text-rose-500">🛑</button>
                        <button onClick={() => handleAction(acc.id, 'delete')} title="Eliminar" className="p-2 bg-rose-900/40 hover:bg-rose-600 rounded-lg text-white">🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredAccounts.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-6 py-12 text-center text-slate-500 italic">{t('noAccountsFound')}</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Accounts;
