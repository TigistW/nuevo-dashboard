import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from '../App';
import {
  ApiIdentity,
  ApiTunnel,
  dnsLeakTest,
  listIdentities,
  listTunnels,
  registerTunnel,
  rotateVmTunnel,
} from '../services/backendApi';

type EnrichedTunnel = {
  id: string;
  country: string;
  provider: string;
  latency: string;
  status: string;
  ip: string;
  ipType: string;
  asn: string;
  trustScore: number;
  geoMatch: boolean;
  tzMatch: boolean;
  vmId: string | null;
};

const NetworkManager: React.FC = () => {
  const { t } = useTranslation();
  const [tunnels, setTunnels] = useState<EnrichedTunnel[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tunnelRows, identityRows] = await Promise.all([listTunnels(), listIdentities()]);
      const mapped = enrichTunnels(tunnelRows, identityRows);
      setTunnels(mapped);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load network data.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const runDnsLeakTest = useCallback(async () => {
    setIsBusy(true);
    try {
      const result = await dnsLeakTest();
      if (result.status === 'Secure') {
        setInfoText('DNS leak test passed.');
      } else {
        const details = result.leaks.map((item) => `${item.vm_id}: ${item.issue}`).join('; ');
        setInfoText(`Leak detected: ${details}`);
      }
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'DNS leak test failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, []);

  const runVpsRegistry = useCallback(async () => {
    const country = window.prompt('Country/profile for VPS registration (examples: us, de, ca, es):', '');
    if (!country) {
      return;
    }
    const ip = window.prompt('Public IP for VPS registration:', '');
    if (!ip) {
      return;
    }
    const provider = window.prompt('Provider name:', 'Custom') || 'Custom';

    setIsBusy(true);
    try {
      const result = await registerTunnel(country, ip, provider);
      setInfoText(`Registered tunnel ${result.id} for ${result.country}.`);
      setErrorText('');
      await refreshData();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'VPS registration failed.';
      setErrorText(message);
    } finally {
      setIsBusy(false);
    }
  }, [refreshData]);

  const rotateTunnelByVm = useCallback(
    async (vmId: string) => {
      setIsBusy(true);
      try {
        await rotateVmTunnel(vmId);
        setInfoText(`Rotation requested for VM ${vmId}.`);
        setErrorText('');
        window.setTimeout(() => {
          void refreshData();
        }, 900);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Tunnel rotation failed.';
        setErrorText(message);
      } finally {
        setIsBusy(false);
      }
    },
    [refreshData]
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('networkManager')}</h2>
          <p className="text-sm text-slate-500 font-mono">Network Intelligence & Geolocation Layer</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void runDnsLeakTest()}
            disabled={isBusy}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            {t('dnsLeakTest')}
          </button>
          <button
            onClick={() => void runVpsRegistry()}
            disabled={isBusy}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all"
          >
            {t('vpsRegistry')}
          </button>
          <button
            onClick={() => void refreshData()}
            disabled={isBusy}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            Refresh
          </button>
        </div>
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

      <div className="bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">Tunnel ID</th>
                <th className="px-8 py-5">Intel</th>
                <th className="px-8 py-5">Latency</th>
                <th className="px-8 py-5">Public IP</th>
                <th className="px-8 py-5">Trust Score</th>
                <th className="px-8 py-5 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={6}>
                    Loading tunnels...
                  </td>
                </tr>
              ) : tunnels.length === 0 ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={6}>
                    No tunnels found.
                  </td>
                </tr>
              ) : (
                tunnels.map((tunnel) => (
                  <tr key={tunnel.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-2 h-2 rounded-full ${
                            tunnel.status.toLowerCase() === 'connected' ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'
                          }`}
                        ></div>
                        <div>
                          <span className="font-mono font-bold text-sm block">{tunnel.id}</span>
                          <span className="text-[9px] text-slate-500 uppercase">
                            {tunnel.country} // {tunnel.provider}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="px-1.5 py-0.5 rounded text-[8px] font-black uppercase bg-amber-500/10 text-amber-500">
                            {tunnel.ipType}
                          </span>
                          <span className="text-[9px] font-mono text-slate-500">{tunnel.asn}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${tunnel.geoMatch ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            title="Geo Consistency"
                          ></span>
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${tunnel.tzMatch ? 'bg-emerald-500' : 'bg-rose-500'}`}
                            title="Timezone Consistency"
                          ></span>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-xs font-mono text-emerald-400">{tunnel.latency}</td>
                    <td className="px-8 py-6 text-xs font-mono text-slate-400">{tunnel.ip || '---'}</td>
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-1.5 bg-slate-900 rounded-full overflow-hidden">
                          <div
                            className={`h-full ${
                              tunnel.trustScore > 80
                                ? 'bg-emerald-500'
                                : tunnel.trustScore > 50
                                ? 'bg-amber-500'
                                : 'bg-rose-500'
                            }`}
                            style={{ width: `${tunnel.trustScore}%` }}
                          ></div>
                        </div>
                        <span className="text-[10px] font-mono font-bold">{tunnel.trustScore}%</span>
                      </div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          onClick={() => (tunnel.vmId ? void rotateTunnelByVm(tunnel.vmId) : undefined)}
                          disabled={isBusy || !tunnel.vmId}
                          className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 rounded-lg text-[10px] font-bold border border-slate-800 transition-all"
                          title={tunnel.vmId ? `Rotate via VM ${tunnel.vmId}` : 'No VM mapped to this tunnel'}
                        >
                          Rotate
                        </button>
                        <button
                          onClick={() => void refreshData()}
                          disabled={isBusy}
                          className="px-3 py-1.5 bg-rose-900/20 hover:bg-rose-900/40 disabled:opacity-40 rounded-lg text-[10px] font-bold border border-rose-500/20 text-rose-500 transition-all"
                        >
                          Refresh
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-gradient-to-br from-blue-900/20 to-indigo-900/20 border border-blue-500/20 rounded-3xl p-8">
          <h3 className="text-lg font-black mb-4 italic uppercase tracking-tighter">Global Exit Nodes</h3>
          <div className="flex items-center gap-6">
            <div className="text-4xl">??</div>
            <div className="space-y-1">
              <p className="text-2xl font-black">{tunnels.length} Tunnels</p>
              <p className="text-xs text-slate-500 font-mono">Live backend network inventory</p>
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-900/20 to-teal-900/20 border border-emerald-500/20 rounded-3xl p-8">
          <h3 className="text-lg font-black mb-4 italic uppercase tracking-tighter">Network Isolation</h3>
          <div className="flex items-center gap-6">
            <div className="text-4xl">???</div>
            <div className="space-y-1">
              <p className="text-2xl font-black">
                {tunnels.filter((item) => item.status.toLowerCase() === 'connected').length} Connected
              </p>
              <p className="text-xs text-slate-500 font-mono">Tunnel status from backend</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function enrichTunnels(tunnels: ApiTunnel[], identities: ApiIdentity[]): EnrichedTunnel[] {
  const identityByIp = new Map<string, ApiIdentity>();
  for (const identity of identities) {
    if (identity.public_ip && !identityByIp.has(identity.public_ip)) {
      identityByIp.set(identity.public_ip, identity);
    }
  }

  return tunnels.map((tunnel) => {
    const identity = identityByIp.get(tunnel.public_ip);
    const connected = tunnel.status.toLowerCase() === 'connected';
    return {
      id: tunnel.id,
      country: tunnel.country,
      provider: tunnel.provider,
      latency: tunnel.latency,
      status: tunnel.status,
      ip: tunnel.public_ip,
      ipType: identity?.ip_type || 'Datacenter',
      asn: identity?.asn || 'Unknown',
      trustScore: identity?.trust_score ?? (connected ? 90 : 35),
      geoMatch: connected,
      tzMatch: connected,
      vmId: identity?.vm_id || null,
    };
  });
}

export default NetworkManager;
