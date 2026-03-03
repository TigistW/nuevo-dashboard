import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiGoogleAccount,
  ApiMicroVm,
  assignGoogleAccount,
  createGoogleAccount,
  getAccountMode,
  listGoogleAccounts,
  listMicroVms,
  releaseGoogleAccount,
  setAccountMode,
} from '../services/backendApi';

const Accounts: React.FC = () => {
  const [accounts, setAccounts] = useState<ApiGoogleAccount[]>([]);
  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [mode, setMode] = useState<'one_to_one' | 'dynamic_pool'>('one_to_one');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const [newEmail, setNewEmail] = useState<string>('');
  const [newId, setNewId] = useState<string>('');

  const [assignVmId, setAssignVmId] = useState<string>('');
  const [assignAccountId, setAssignAccountId] = useState<string>('');

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const [accountRows, vmRows, modeRow] = await Promise.all([
        listGoogleAccounts(),
        listMicroVms(),
        getAccountMode(),
      ]);
      setAccounts(accountRows);
      setVms(vmRows);
      setMode(modeRow.mode);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load account state.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const runningVms = useMemo(
    () => vms.filter((vm) => String(vm.status || '').toLowerCase() === 'running'),
    [vms]
  );

  const handleModeChange = useCallback(
    async (nextMode: 'one_to_one' | 'dynamic_pool') => {
      setIsBusy(true);
      try {
        const updated = await setAccountMode(nextMode);
        setMode(updated.mode);
        setInfoText(`Account mode updated to '${updated.mode}'.`);
        setErrorText('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to update account mode.';
        setErrorText(message);
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  const handleCreateAccount = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      const email = newEmail.trim();
      if (!email) {
        setErrorText('Email is required.');
        return;
      }
      setIsBusy(true);
      try {
        await createGoogleAccount({
          id: newId.trim() || undefined,
          email,
        });
        setNewEmail('');
        setNewId('');
        setInfoText(`Account '${email}' created.`);
        setErrorText('');
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create account.';
        setErrorText(message);
      } finally {
        setIsBusy(false);
      }
    },
    [newEmail, newId, refresh]
  );

  const handleAssign = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      if (!assignVmId.trim()) {
        setErrorText('Select a VM before assigning.');
        return;
      }
      setIsBusy(true);
      try {
        const result = await assignGoogleAccount({
          vm_id: assignVmId.trim(),
          ...(assignAccountId.trim() ? { account_id: assignAccountId.trim() } : {}),
        });
        setInfoText(
          `Assigned ${result.email} (${result.account_id}) to ${result.vm_id} [mode=${result.mode}, reassigned=${result.reassigned}].`
        );
        setErrorText('');
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to assign account.';
        setErrorText(message);
      } finally {
        setIsBusy(false);
      }
    },
    [assignVmId, assignAccountId, refresh]
  );

  const handleRelease = useCallback(
    async (accountId: string) => {
      setIsBusy(true);
      try {
        const released = await releaseGoogleAccount(accountId);
        setInfoText(`Released account '${released.email}'.`);
        setErrorText('');
        await refresh();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to release account.';
        setErrorText(message);
      } finally {
        setIsBusy(false);
      }
    },
    [refresh]
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">Google Account Management</h2>
          <p className="text-sm text-slate-500 font-mono">Mode A (1:1) and Mode B (Dynamic Pool)</p>
        </div>
        <button
          onClick={() => void refresh()}
          disabled={isBusy}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border border-slate-700"
        >
          Refresh
        </button>
      </div>

      <div className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6 space-y-5">
        <div className="flex gap-3">
          <button
            onClick={() => void handleModeChange('one_to_one')}
            disabled={isBusy}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              mode === 'one_to_one'
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            Mode A - 1:1
          </button>
          <button
            onClick={() => void handleModeChange('dynamic_pool')}
            disabled={isBusy}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              mode === 'dynamic_pool'
                ? 'bg-blue-600 text-white border-blue-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            Mode B - Dynamic Pool
          </button>
        </div>
        <p className="text-xs font-mono text-slate-500">
          Current mode: <span className="text-slate-300">{mode}</span>
        </p>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}
      {infoText ? (
        <div className="px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-900/20 text-emerald-300 text-sm">
          {infoText}
        </div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Create Account</h3>
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Account ID (optional)</label>
              <input
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                value={newId}
                onChange={(event) => setNewId(event.target.value)}
                placeholder="acc-1001"
              />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Email</label>
              <input
                type="email"
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-emerald-500"
                value={newEmail}
                onChange={(event) => setNewEmail(event.target.value)}
                placeholder="worker@example.com"
              />
            </div>
            <button
              type="submit"
              disabled={isBusy}
              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded-lg text-white text-xs font-bold"
            >
              Create Account
            </button>
          </form>
        </section>

        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400 mb-4">Assign Account</h3>
          <form onSubmit={handleAssign} className="space-y-4">
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Target VM</label>
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500"
                value={assignVmId}
                onChange={(event) => setAssignVmId(event.target.value)}
              >
                <option value="">Select VM</option>
                {runningVms.map((vm) => (
                  <option key={vm.id} value={vm.id}>
                    {vm.id} ({vm.country})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Preferred Account (optional)</label>
              <select
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-blue-500"
                value={assignAccountId}
                onChange={(event) => setAssignAccountId(event.target.value)}
              >
                <option value="">Auto-select</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>
                    {account.id} ({account.email})
                  </option>
                ))}
              </select>
            </div>
            <button
              type="submit"
              disabled={isBusy}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg text-white text-xs font-bold"
            >
              Assign
            </button>
          </form>
        </section>
      </div>

      <section className="bg-[#0d1225] border border-slate-800 rounded-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 flex justify-between items-center">
          <h3 className="text-sm font-black uppercase tracking-widest text-slate-400">Account Inventory</h3>
          <span className="text-xs text-slate-500 font-mono">Total: {accounts.length}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest">
              <tr>
                <th className="px-6 py-4">Account</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4">VM</th>
                <th className="px-6 py-4">Risk</th>
                <th className="px-6 py-4">Warmup</th>
                <th className="px-6 py-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td className="px-6 py-5 text-sm text-slate-500" colSpan={6}>
                    Loading accounts...
                  </td>
                </tr>
              ) : accounts.length === 0 ? (
                <tr>
                  <td className="px-6 py-5 text-sm text-slate-500" colSpan={6}>
                    No accounts registered.
                  </td>
                </tr>
              ) : (
                accounts.map((account) => (
                  <tr key={account.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="px-6 py-4">
                      <div className="font-semibold text-slate-200">{account.email}</div>
                      <div className="text-[10px] text-slate-500 font-mono">{account.id}</div>
                    </td>
                    <td className="px-6 py-4 text-xs text-slate-300 uppercase">{account.status}</td>
                    <td className="px-6 py-4 text-xs text-slate-400 font-mono">{account.vm_id || 'unassigned'}</td>
                    <td className="px-6 py-4 text-xs text-slate-300">{account.risk_score}</td>
                    <td className="px-6 py-4 text-xs text-slate-300">{account.warmup_state}</td>
                    <td className="px-6 py-4 text-right">
                      <button
                        onClick={() => void handleRelease(account.id)}
                        disabled={isBusy || !account.vm_id}
                        className="px-3 py-1.5 bg-rose-900/20 hover:bg-rose-900/40 disabled:opacity-50 rounded-lg text-[10px] font-bold border border-rose-500/20 text-rose-400"
                      >
                        Release
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
};

export default Accounts;
