import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../App';
import { ApiIdentity, listIdentities } from '../services/backendApi';

type IdentityRow = {
  vmId: string;
  country: string;
  publicIp: string;
  isp: string;
  asn: string;
  type: string;
  status: string;
  lastCheck: string;
};

const IdentityManager: React.FC = () => {
  const { t } = useTranslation();
  const [identities, setIdentities] = useState<IdentityRow[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string>('');

  const refreshIdentities = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await listIdentities();
      setIdentities(mapIdentities(rows));
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load identities.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshIdentities();
  }, [refreshIdentities]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('identityManager')}</h2>
          <p className="text-sm text-slate-500 font-mono">{t('realTimeIdentity')}</p>
        </div>
        <button
          onClick={() => void refreshIdentities()}
          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
        >
          {t('externalVerification')}
        </button>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">
          {errorText}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6">
        <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">VM ID</th>
                <th className="px-8 py-5">{t('assignedCountry')}</th>
                <th className="px-8 py-5">{t('publicIpReal')}</th>
                <th className="px-8 py-5">{t('ispVisible')}</th>
                <th className="px-8 py-5">{t('asn')}</th>
                <th className="px-8 py-5">{t('ipType')}</th>
                <th className="px-8 py-5">{t('leakTest')}</th>
                <th className="px-8 py-5 text-right">Last Check</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={8}>
                    Loading identities...
                  </td>
                </tr>
              ) : identities.length === 0 ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={8}>
                    No identities found.
                  </td>
                </tr>
              ) : (
                identities.map((id) => (
                  <tr key={id.vmId} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-6 font-mono font-bold text-sm">{id.vmId}</td>
                    <td className="px-8 py-6 text-sm font-medium text-slate-300">{id.country}</td>
                    <td className="px-8 py-6 text-xs font-mono text-emerald-400">{id.publicIp}</td>
                    <td className="px-8 py-6 text-xs text-slate-400 font-bold">{id.isp}</td>
                    <td className="px-8 py-6 text-[10px] font-mono text-slate-500">{id.asn}</td>
                    <td className="px-8 py-6">
                      <span className="px-2 py-0.5 rounded text-[9px] font-black uppercase bg-slate-500/10 text-slate-300 border border-slate-500/20">
                        {id.type}
                      </span>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-2">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            id.status === 'Secure'
                              ? 'bg-emerald-500'
                              : id.status === 'Warning'
                              ? 'bg-amber-500'
                              : 'bg-rose-500'
                          }`}
                        ></div>
                        <span
                          className={`text-[10px] font-bold ${
                            id.status === 'Secure'
                              ? 'text-emerald-500'
                              : id.status === 'Warning'
                              ? 'text-amber-500'
                              : 'text-rose-500'
                          }`}
                        >
                          {id.status}
                        </span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right text-[10px] text-slate-600 font-mono italic">{id.lastCheck}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

function mapIdentities(rows: ApiIdentity[]): IdentityRow[] {
  return rows.map((row) => ({
    vmId: row.vm_id,
    country: row.country,
    publicIp: row.public_ip,
    isp: row.isp,
    asn: row.asn,
    type: row.ip_type,
    status: row.status,
    lastCheck: formatLastCheck(row.last_check),
  }));
}

function formatLastCheck(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export default IdentityManager;
