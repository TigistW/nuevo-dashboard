import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../App';
import {
  ApiCaptchaEvent,
  ApiCaptchaSummary,
  ApiVerificationRequest,
  createCaptchaEvent,
  createVerificationRequest,
  getCaptchaEvents,
  getCaptchaSummary,
  getOperation,
  listVerificationRequests,
  retryVerificationRequest,
} from '../services/backendApi';

const VerificationCenter: React.FC = () => {
  const { t } = useTranslation();
  const [verifications, setVerifications] = useState<ApiVerificationRequest[]>([]);
  const [captchaEvents, setCaptchaEvents] = useState<ApiCaptchaEvent[]>([]);
  const [captchaSummary, setCaptchaSummary] = useState<ApiCaptchaSummary>({
    total: 0,
    solved: 0,
    failed: 0,
    timeout: 0,
    bypassed: 0,
    success_rate: 0,
    avg_latency_ms: 0,
  });
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [errorText, setErrorText] = useState<string>('');
  const [retryingId, setRetryingId] = useState<string>('');
  const [creatingVerification, setCreatingVerification] = useState<boolean>(false);
  const [creatingCaptcha, setCreatingCaptcha] = useState<boolean>(false);
  const [newVerification, setNewVerification] = useState<{
    vm_id: string;
    worker_id: string;
    verification_type: 'SMS' | 'QR';
    provider: string;
    destination: string;
  }>({
    vm_id: 'vm-n8n-001',
    worker_id: 'worker-vm-n8n-001',
    verification_type: 'SMS',
    provider: 'SmsPVA',
    destination: '+15550001111',
  });
  const [newCaptcha, setNewCaptcha] = useState<{
    vm_id: string;
    provider: string;
    status: 'solved' | 'failed' | 'timeout' | 'bypassed';
    source: string;
    latency_ms: number;
    details: string;
  }>({
    vm_id: '',
    provider: 'google-recaptcha',
    status: 'solved',
    source: 'dashboard-manual',
    latency_ms: 1200,
    details: 'manual event',
  });

  const refreshData = useCallback(async () => {
    setIsLoading(true);
    try {
      const [requests, events, summary] = await Promise.all([
        listVerificationRequests(200),
        getCaptchaEvents(50),
        getCaptchaSummary(24),
      ]);
      setVerifications(requests);
      setCaptchaEvents(events);
      setCaptchaSummary(summary);
      setErrorText('');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to load verification data.';
      setErrorText(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  const pendingSmsCount = useMemo(
    () =>
      verifications.filter(
        (item) => item.verification_type.toUpperCase() === 'SMS' && item.status.toLowerCase() === 'pending'
      ).length,
    [verifications]
  );

  const latestQrRequest = useMemo(
    () => verifications.find((item) => item.verification_type.toUpperCase() === 'QR'),
    [verifications]
  );

  const recentCaptchaEvents = useMemo(() => captchaEvents.slice(0, 4), [captchaEvents]);

  const handleRetry = useCallback(
    async (requestId: string) => {
      setRetryingId(requestId);
      try {
        const operation = await retryVerificationRequest(requestId);
        await waitForOperation(operation.id);
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Retry request failed.';
        setErrorText(message);
      } finally {
        setRetryingId('');
      }
    },
    [refreshData]
  );

  const handleCreateVerification = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setCreatingVerification(true);
      try {
        await createVerificationRequest({
          vm_id: newVerification.vm_id.trim(),
          worker_id: newVerification.worker_id.trim(),
          verification_type: newVerification.verification_type,
          status: 'Pending',
          provider: newVerification.provider.trim(),
          destination: newVerification.destination.trim(),
        });
        setErrorText('');
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create verification request.';
        setErrorText(message);
      } finally {
        setCreatingVerification(false);
      }
    },
    [newVerification, refreshData]
  );

  const handleCreateCaptcha = useCallback(
    async (event: React.FormEvent) => {
      event.preventDefault();
      setCreatingCaptcha(true);
      try {
        await createCaptchaEvent({
          vm_id: newCaptcha.vm_id.trim() || undefined,
          provider: newCaptcha.provider.trim(),
          status: newCaptcha.status,
          source: newCaptcha.source.trim(),
          latency_ms: newCaptcha.latency_ms,
          details: newCaptcha.details.trim() || undefined,
        });
        setErrorText('');
        await refreshData();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Failed to create CAPTCHA event.';
        setErrorText(message);
      } finally {
        setCreatingCaptcha(false);
      }
    },
    [newCaptcha, refreshData]
  );

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">{t('verificationCenter')}</h2>
          <p className="text-sm text-slate-500 font-mono">SMS, QR & Device Verification Hub</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void refreshData()}
            className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs font-bold transition-all border border-slate-700"
          >
            {t('successMetrics')}
          </button>
          <button className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold shadow-lg shadow-emerald-600/20 transition-all">
            {t('pendingSms')}: {pendingSmsCount}
          </button>
        </div>
      </div>

      {errorText ? (
        <div className="px-4 py-3 rounded-xl border border-rose-500/20 bg-rose-900/20 text-rose-300 text-sm">{errorText}</div>
      ) : null}

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <form onSubmit={handleCreateVerification} className="bg-[#0d1225] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-emerald-400">Create SMS/QR Request</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              placeholder="VM ID"
              value={newVerification.vm_id}
              onChange={(event) => setNewVerification((prev) => ({ ...prev, vm_id: event.target.value }))}
            />
            <input
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              placeholder="Worker ID"
              value={newVerification.worker_id}
              onChange={(event) => setNewVerification((prev) => ({ ...prev, worker_id: event.target.value }))}
            />
            <select
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              value={newVerification.verification_type}
              onChange={(event) =>
                setNewVerification((prev) => ({ ...prev, verification_type: event.target.value as 'SMS' | 'QR' }))
              }
            >
              <option value="SMS">SMS</option>
              <option value="QR">QR</option>
            </select>
            <input
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              placeholder="Provider"
              value={newVerification.provider}
              onChange={(event) => setNewVerification((prev) => ({ ...prev, provider: event.target.value }))}
            />
          </div>
          <input
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Destination (phone or QR session)"
            value={newVerification.destination}
            onChange={(event) => setNewVerification((prev) => ({ ...prev, destination: event.target.value }))}
          />
          <button
            type="submit"
            disabled={creatingVerification}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 rounded-lg text-xs font-bold text-white"
          >
            {creatingVerification ? 'Creating...' : 'Create Verification Request'}
          </button>
        </form>

        <form onSubmit={handleCreateCaptcha} className="bg-[#0d1225] border border-slate-800 rounded-2xl p-5 space-y-3">
          <h3 className="text-sm font-black uppercase tracking-widest text-blue-400">Create CAPTCHA Event</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <input
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              placeholder="VM ID (optional)"
              value={newCaptcha.vm_id}
              onChange={(event) => setNewCaptcha((prev) => ({ ...prev, vm_id: event.target.value }))}
            />
            <input
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              placeholder="Provider"
              value={newCaptcha.provider}
              onChange={(event) => setNewCaptcha((prev) => ({ ...prev, provider: event.target.value }))}
            />
            <select
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              value={newCaptcha.status}
              onChange={(event) =>
                setNewCaptcha((prev) => ({
                  ...prev,
                  status: event.target.value as 'solved' | 'failed' | 'timeout' | 'bypassed',
                }))
              }
            >
              <option value="solved">solved</option>
              <option value="failed">failed</option>
              <option value="timeout">timeout</option>
              <option value="bypassed">bypassed</option>
            </select>
            <input
              type="number"
              min={0}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
              placeholder="Latency ms"
              value={newCaptcha.latency_ms}
              onChange={(event) => setNewCaptcha((prev) => ({ ...prev, latency_ms: Number(event.target.value || 0) }))}
            />
          </div>
          <input
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Source"
            value={newCaptcha.source}
            onChange={(event) => setNewCaptcha((prev) => ({ ...prev, source: event.target.value }))}
          />
          <input
            className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm"
            placeholder="Details (optional)"
            value={newCaptcha.details}
            onChange={(event) => setNewCaptcha((prev) => ({ ...prev, details: event.target.value }))}
          />
          <button
            type="submit"
            disabled={creatingCaptcha}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-60 rounded-lg text-xs font-bold text-white"
          >
            {creatingCaptcha ? 'Creating...' : 'Create CAPTCHA Event'}
          </button>
        </form>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-[#0d1225] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl">
          <table className="w-full text-left">
            <thead className="bg-slate-900/50 text-[10px] text-slate-500 uppercase font-black tracking-widest border-b border-slate-800">
              <tr>
                <th className="px-8 py-5">ID</th>
                <th className="px-8 py-5">Worker</th>
                <th className="px-8 py-5">Type</th>
                <th className="px-8 py-5">Status</th>
                <th className="px-8 py-5">Provider</th>
                <th className="px-8 py-5">Destination</th>
                <th className="px-8 py-5 text-right">{t('actions')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {isLoading ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={7}>
                    Loading verification requests...
                  </td>
                </tr>
              ) : verifications.length === 0 ? (
                <tr>
                  <td className="px-8 py-6 text-sm text-slate-500" colSpan={7}>
                    No verification requests found.
                  </td>
                </tr>
              ) : (
                verifications.map((v) => (
                  <tr key={v.id} className="hover:bg-slate-800/30 transition-colors group">
                    <td className="px-8 py-6 font-mono font-bold text-sm">{v.id}</td>
                    <td className="px-8 py-6 text-sm font-medium text-slate-300">
                      {v.worker_id}
                      <div className="text-[10px] text-slate-500 font-mono">{v.vm_id}</div>
                    </td>
                    <td className="px-8 py-6 text-xs text-slate-500 font-mono">{v.verification_type}</td>
                    <td className="px-8 py-6">
                      <span
                        className={`px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-tighter ${
                          v.status === 'Verified'
                            ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20'
                            : v.status === 'Pending'
                            ? 'bg-blue-500/10 text-blue-500 border border-blue-500/20'
                            : 'bg-rose-500/10 text-rose-500 border border-rose-500/20'
                        }`}
                      >
                        {v.status}
                      </span>
                      {v.last_error ? <div className="text-[10px] text-rose-400 mt-1">{v.last_error}</div> : null}
                    </td>
                    <td className="px-8 py-6 text-xs font-mono text-slate-400">{v.provider}</td>
                    <td className="px-8 py-6 text-xs font-mono text-slate-400">
                      {v.destination}
                      <div className="text-[10px] text-slate-500">{formatDate(v.updated_at)}</div>
                    </td>
                    <td className="px-8 py-6 text-right">
                      <button
                        disabled={retryingId === v.id}
                        onClick={() => void handleRetry(v.id)}
                        className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 rounded-lg text-[10px] font-bold border border-slate-800 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {retryingId === v.id ? 'Retrying...' : t('retry')}
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="space-y-6">
          <div className="bg-gradient-to-br from-indigo-900/20 to-blue-900/20 border border-blue-500/20 rounded-3xl p-6">
            <h3 className="text-sm font-black mb-4 uppercase tracking-widest text-blue-400">CAPTCHA Metrics</h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <MetricCard label="Success Rate" value={`${captchaSummary.success_rate}%`} />
                <MetricCard label="Avg Latency" value={`${captchaSummary.avg_latency_ms} ms`} />
                <MetricCard label="Solved" value={String(captchaSummary.solved)} />
                <MetricCard label="Failed" value={String(captchaSummary.failed + captchaSummary.timeout)} />
              </div>
              <div className="space-y-2">
                {recentCaptchaEvents.length === 0 ? (
                  <p className="text-xs text-slate-500">No CAPTCHA events yet.</p>
                ) : (
                  recentCaptchaEvents.map((event) => (
                    <div key={event.id} className="flex items-center gap-4 p-3 bg-slate-900/50 rounded-2xl border border-slate-800">
                      <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                      <div className="flex-1">
                        <p className="text-xs font-bold">
                          {event.provider} / {event.status}
                        </p>
                        <p className="text-[10px] text-slate-500 font-mono">
                          {event.source} | {event.latency_ms}ms | {formatDate(event.created_at)}
                        </p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>

          <div className="bg-gradient-to-br from-purple-900/20 to-pink-900/20 border border-purple-500/20 rounded-3xl p-6">
            <h3 className="text-sm font-black mb-4 uppercase tracking-widest text-purple-400">{t('qrVerification')}</h3>
            <div className="aspect-square bg-slate-900 rounded-2xl border border-slate-800 flex items-center justify-center relative overflow-hidden group">
              <div className="absolute inset-0 bg-emerald-500/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
              <div className="text-center px-4">
                <p className="text-sm font-bold">{latestQrRequest ? latestQrRequest.id : 'No QR Request'}</p>
                <p className="text-[10px] text-slate-500 font-mono mt-1">
                  {latestQrRequest ? latestQrRequest.destination : 'Waiting for QR session'}
                </p>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-tighter mt-3">
                  {latestQrRequest ? latestQrRequest.status : 'Waiting for QR Scan'}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

function MetricCard({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div className="p-3 bg-slate-900/50 rounded-2xl border border-slate-800">
      <p className="text-[10px] font-black text-slate-500 uppercase">{label}</p>
      <p className="text-sm font-bold text-slate-200 mt-1">{value}</p>
    </div>
  );
}

async function waitForOperation(operationId: string): Promise<void> {
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const operation = await getOperation(operationId);
    const status = (operation.status || '').toLowerCase();
    if (status === 'succeeded') {
      return;
    }
    if (status === 'failed') {
      throw new Error(operation.message || `Operation ${operationId} failed.`);
    }
    await delay(800);
  }
  throw new Error(`Operation ${operationId} timed out.`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleString();
}

export default VerificationCenter;
