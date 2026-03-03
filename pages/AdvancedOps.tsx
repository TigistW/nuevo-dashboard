import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ApiN8nRun,
  ApiN8nWorkflow,
  ApiFootprintActivity,
  ApiGoogleAccount,
  ApiIpHistoryRecord,
  ApiMicroVm,
  ApiNotebookSession,
  ApiSmtpTask,
  ApiTunnelBenchmarkResult,
  assignGoogleAccount,
  createNotebookSession,
  createN8nRun,
  evaluateIpCandidate,
  importN8nWorkflow,
  listN8nRuns,
  listN8nWorkflows,
  getN8nRoleConfig,
  listFootprintActivities,
  listGoogleAccounts,
  listIpHistory,
  listMicroVms,
  listNotebookSessions,
  listSmtpTasks,
  listTunnelBenchmarkResults,
  planNotebookDistribution,
  recordIpEvent,
  reportNotebookEvent,
  runTunnelBenchmark,
  scheduleFootprintActivity,
  sendSmtpTask,
  setN8nRoleConfig,
  appendN8nRunEvent,
  tickFootprint,
  tickNotebookSessions,
  updateN8nRunStatus,
} from '../services/backendApi';

type TabKey = 'notebook' | 'ip' | 'smtp' | 'footprint' | 'benchmark' | 'architecture';

const TABS: Array<{ id: TabKey; label: string }> = [
  { id: 'notebook', label: 'Notebook Care' },
  { id: 'ip', label: 'IP Policy' },
  { id: 'smtp', label: 'SMTP Module' },
  { id: 'footprint', label: 'Footprint' },
  { id: 'benchmark', label: 'Tunnel Benchmark' },
  { id: 'architecture', label: 'Architecture' },
];

const AdvancedOps: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabKey>('notebook');
  const [isBusy, setIsBusy] = useState<boolean>(false);
  const [errorText, setErrorText] = useState<string>('');
  const [infoText, setInfoText] = useState<string>('');

  const [vms, setVms] = useState<ApiMicroVm[]>([]);
  const [accounts, setAccounts] = useState<ApiGoogleAccount[]>([]);
  const runningVms = useMemo(
    () => vms.filter((item) => String(item.status || '').toLowerCase() === 'running'),
    [vms]
  );

  const [notebooks, setNotebooks] = useState<ApiNotebookSession[]>([]);
  const [ipHistory, setIpHistory] = useState<ApiIpHistoryRecord[]>([]);
  const [smtpTasks, setSmtpTasks] = useState<ApiSmtpTask[]>([]);
  const [footprintActivities, setFootprintActivities] = useState<ApiFootprintActivity[]>([]);
  const [benchmarkResults, setBenchmarkResults] = useState<ApiTunnelBenchmarkResult[]>([]);
  const [n8nRole, setN8nRole] = useState<'main_orchestrator' | 'secondary_automation' | 'eliminated'>(
    'secondary_automation'
  );
  const [n8nWorkflows, setN8nWorkflows] = useState<ApiN8nWorkflow[]>([]);
  const [n8nRuns, setN8nRuns] = useState<ApiN8nRun[]>([]);
  const [selectedWorkflowId, setSelectedWorkflowId] = useState<string>('');

  const [selectedVm, setSelectedVm] = useState<string>('');
  const [selectedAccount, setSelectedAccount] = useState<string>('');
  const [checkIp, setCheckIp] = useState<string>('203.0.113.10');
  const [checkContext, setCheckContext] = useState<'google' | 'smtp'>('google');
  const [smtpDomain, setSmtpDomain] = useState<string>('example.org');
  const [smtpSender, setSmtpSender] = useState<string>('ops@example.org');
  const [smtpRecipients, setSmtpRecipients] = useState<string>('a@example.net,b@example.net');
  const [smtpPreferredIp, setSmtpPreferredIp] = useState<string>('');
  const [footprintDelay, setFootprintDelay] = useState<number>(0);
  const [benchmarkSamples, setBenchmarkSamples] = useState<number>(1);
  const [benchmarkProtocols, setBenchmarkProtocols] = useState<string>('wireguard,openvpn,ssh,pyngrok');

  const refreshCore = useCallback(async () => {
    const [vmRows, accountRows] = await Promise.all([listMicroVms(), listGoogleAccounts()]);
    setVms(vmRows);
    setAccounts(accountRows);
    if (!selectedVm && vmRows.length > 0) {
      setSelectedVm(vmRows[0].id);
    }
    if (!selectedAccount && accountRows.length > 0) {
      setSelectedAccount(accountRows[0].id);
    }
  }, [selectedAccount, selectedVm]);

  const refreshByTab = useCallback(
    async (tab: TabKey) => {
      if (tab === 'notebook') {
        setNotebooks(await listNotebookSessions());
      } else if (tab === 'ip') {
        setIpHistory(await listIpHistory(80));
      } else if (tab === 'smtp') {
        setSmtpTasks(await listSmtpTasks(50));
      } else if (tab === 'footprint') {
        setFootprintActivities(await listFootprintActivities(80));
      } else if (tab === 'benchmark') {
        setBenchmarkResults(await listTunnelBenchmarkResults(undefined, 80));
      } else if (tab === 'architecture') {
        const [role, workflows] = await Promise.all([getN8nRoleConfig(), listN8nWorkflows(true)]);
        const preferredWorkflow =
          selectedWorkflowId && workflows.some((item) => item.workflow_id === selectedWorkflowId)
            ? selectedWorkflowId
            : workflows[0]?.workflow_id || '';
        const runs = await listN8nRuns(80, preferredWorkflow || undefined);
        setN8nRole(role.role);
        setN8nWorkflows(workflows);
        setSelectedWorkflowId(preferredWorkflow);
        setN8nRuns(runs);
      }
    },
    [selectedWorkflowId]
  );

  const safeRun = useCallback(
    async (action: () => Promise<void>) => {
      setIsBusy(true);
      try {
        await action();
        setErrorText('');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Operation failed.';
        setErrorText(message);
      } finally {
        setIsBusy(false);
      }
    },
    []
  );

  useEffect(() => {
    void safeRun(async () => {
      await refreshCore();
      await refreshByTab(activeTab);
    });
  }, [activeTab, refreshByTab, refreshCore, safeRun]);

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-black italic tracking-tighter uppercase">Advanced Operations</h2>
          <p className="text-sm text-slate-500 font-mono">Notebook/IP/SMTP/Footprint/Benchmark/N8N Controls</p>
        </div>
        <button
          onClick={() => void safeRun(async () => {
            await refreshCore();
            await refreshByTab(activeTab);
          })}
          disabled={isBusy}
          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 rounded-xl text-xs font-bold border border-slate-700"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 rounded-lg text-xs font-bold border transition-all ${
              activeTab === tab.id
                ? 'bg-emerald-600 text-white border-emerald-500'
                : 'bg-slate-900 text-slate-400 border-slate-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
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

      {activeTab === 'notebook' ? (
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">VM</label>
              <select
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
                value={selectedVm}
                onChange={(event) => setSelectedVm(event.target.value)}
              >
                <option value="">Select VM</option>
                {runningVms.map((vm) => (
                  <option key={vm.id} value={vm.id}>{vm.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Account</label>
              <select
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2"
                value={selectedAccount}
                onChange={(event) => setSelectedAccount(event.target.value)}
              >
                <option value="">Optional account</option>
                {accounts.map((account) => (
                  <option key={account.id} value={account.id}>{account.email}</option>
                ))}
              </select>
            </div>
            <button
              onClick={() =>
                void safeRun(async () => {
                  if (!selectedVm) {
                    throw new Error('Select VM first.');
                  }
                  await createNotebookSession({ vm_id: selectedVm });
                  if (selectedAccount) {
                    await assignGoogleAccount({ vm_id: selectedVm, account_id: selectedAccount });
                  }
                  await refreshByTab('notebook');
                  setInfoText('Notebook session created.');
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold text-white"
            >
              Create Session
            </button>
            <button
              onClick={() =>
                void safeRun(async () => {
                  const result = await tickNotebookSessions();
                  setInfoText(
                    `Notebook tick: updated=${result.updated}, rotated=${result.rotated}, resting=${result.resting}.`
                  );
                  await refreshByTab('notebook');
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold text-white"
            >
              Run Tick
            </button>
            <button
              onClick={() =>
                void safeRun(async () => {
                  const plan = await planNotebookDistribution({ required_gpu_gb: 30 });
                  setInfoText(`Distribution plan: notebooks=${plan.notebooks_required}, targets=${plan.per_notebook_target_gb.join(', ')}`);
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-slate-700 hover:bg-slate-600 rounded text-xs font-bold text-white"
            >
              Plan 30GB
            </button>
          </div>
          <div className="space-y-2">
            {notebooks.map((session) => (
              <div key={session.id} className="bg-slate-900 border border-slate-800 rounded p-3 flex justify-between items-center">
                <div>
                  <p className="text-sm font-semibold">{session.id} ({session.vm_id})</p>
                  <p className="text-[11px] text-slate-500">
                    status={session.status}, load={session.load_percent}%, gpu={session.gpu_usage_gb}/{session.gpu_assigned_gb}GB, risk={session.risk_score}
                  </p>
                </div>
                <button
                  onClick={() =>
                    void safeRun(async () => {
                      await reportNotebookEvent(session.id, { event_type: 'imminent_disconnect', details: 'manual test event' });
                      await refreshByTab('notebook');
                      setInfoText(`Notebook event sent for ${session.id}.`);
                    })
                  }
                  disabled={isBusy}
                  className="px-2 py-1 bg-amber-600 hover:bg-amber-500 rounded text-[10px] font-bold text-white"
                >
                  Simulate Warning
                </button>
              </div>
            ))}
            {notebooks.length === 0 ? <p className="text-sm text-slate-500">No notebook sessions.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'ip' ? (
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">IP</label>
              <input className="bg-slate-900 border border-slate-700 rounded px-3 py-2" value={checkIp} onChange={(event) => setCheckIp(event.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Context</label>
              <select className="bg-slate-900 border border-slate-700 rounded px-3 py-2" value={checkContext} onChange={(event) => setCheckContext(event.target.value as 'google' | 'smtp')}>
                <option value="google">google</option>
                <option value="smtp">smtp</option>
              </select>
            </div>
            <button
              onClick={() =>
                void safeRun(async () => {
                  const result = await evaluateIpCandidate({ ip: checkIp, context: checkContext, cooldown_minutes: 120 });
                  setInfoText(`IP check: recommended=${result.recommended}, score=${result.reputation_score}, reasons=${result.reasons.join(' | ') || 'none'}`);
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold text-white"
            >
              Evaluate
            </button>
            <button
              onClick={() =>
                void safeRun(async () => {
                  await recordIpEvent({ ip: checkIp, event: 'manual_negative_event', severity: 'moderate' });
                  await refreshByTab('ip');
                  setInfoText('IP history event recorded.');
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-rose-600 hover:bg-rose-500 rounded text-xs font-bold text-white"
            >
              Record Negative Event
            </button>
          </div>
          <div className="space-y-2">
            {ipHistory.map((item) => (
              <div key={`${item.ip}-${item.last_used_at}`} className="bg-slate-900 border border-slate-800 rounded p-3">
                <p className="text-sm font-semibold">{item.ip}</p>
                <p className="text-[11px] text-slate-500">
                  score={item.reputation_score}, neg={item.negative_events}, restricted={String(item.restricted)}, discarded={String(item.discarded)}, last={item.last_event || 'n/a'}
                </p>
              </div>
            ))}
            {ipHistory.length === 0 ? <p className="text-sm text-slate-500">No IP history entries.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'smtp' ? (
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input className="bg-slate-900 border border-slate-700 rounded px-3 py-2" placeholder="domain" value={smtpDomain} onChange={(event) => setSmtpDomain(event.target.value)} />
            <input className="bg-slate-900 border border-slate-700 rounded px-3 py-2" placeholder="sender" value={smtpSender} onChange={(event) => setSmtpSender(event.target.value)} />
            <input className="bg-slate-900 border border-slate-700 rounded px-3 py-2" placeholder="recipient1,recipient2" value={smtpRecipients} onChange={(event) => setSmtpRecipients(event.target.value)} />
            <input className="bg-slate-900 border border-slate-700 rounded px-3 py-2" placeholder="preferred ip (optional)" value={smtpPreferredIp} onChange={(event) => setSmtpPreferredIp(event.target.value)} />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() =>
                void safeRun(async () => {
                  const recipients = smtpRecipients
                    .split(/[,\s]+/)
                    .map((item) => item.trim())
                    .filter(Boolean);
                  await sendSmtpTask({
                    domain: smtpDomain,
                    sender: smtpSender,
                    recipients,
                    implementation: 'postfix',
                    country: 'us',
                    preferred_ip: smtpPreferredIp.trim() || undefined,
                  });
                  await refreshByTab('smtp');
                  setInfoText('SMTP task queued.');
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold text-white"
            >
              Send SMTP Task
            </button>
          </div>
          <div className="space-y-2">
            {smtpTasks.map((task) => (
              <div key={task.id} className="bg-slate-900 border border-slate-800 rounded p-3">
                <p className="text-sm font-semibold">{task.id} ({task.status})</p>
                <p className="text-[11px] text-slate-500">
                  domain={task.domain}, sent={task.success_count}/{task.recipients_count}, ip={task.ip_used || 'n/a'}, dns={String(task.spf_enabled && task.dkim_enabled && task.dmarc_enabled && task.rdns_enabled && task.tls_enabled)}
                </p>
              </div>
            ))}
            {smtpTasks.length === 0 ? <p className="text-sm text-slate-500">No SMTP tasks yet.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'footprint' ? (
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">VM</label>
              <select className="bg-slate-900 border border-slate-700 rounded px-3 py-2" value={selectedVm} onChange={(event) => setSelectedVm(event.target.value)}>
                <option value="">Select VM</option>
                {runningVms.map((vm) => (
                  <option key={vm.id} value={vm.id}>{vm.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Delay (sec)</label>
              <input type="number" min={0} max={3600} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 w-32" value={footprintDelay} onChange={(event) => setFootprintDelay(Number(event.target.value || 0))} />
            </div>
            <button
              onClick={() =>
                void safeRun(async () => {
                  if (!selectedVm) {
                    throw new Error('Select VM first.');
                  }
                  await scheduleFootprintActivity({ vm_id: selectedVm, delay_seconds: footprintDelay });
                  await refreshByTab('footprint');
                  setInfoText('Footprint activity scheduled.');
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold text-white"
            >
              Schedule Activity
            </button>
            <button
              onClick={() =>
                void safeRun(async () => {
                  const result = await tickFootprint();
                  await refreshByTab('footprint');
                  setInfoText(`Footprint tick: scheduled=${result.scheduled}, executed=${result.executed}.`);
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold text-white"
            >
              Run Tick
            </button>
          </div>
          <div className="space-y-2">
            {footprintActivities.map((activity) => (
              <div key={activity.id} className="bg-slate-900 border border-slate-800 rounded p-3">
                <p className="text-sm font-semibold">{activity.activity_type} ({activity.status})</p>
                <p className="text-[11px] text-slate-500">vm={activity.vm_id}, scheduled={activity.scheduled_at || 'n/a'}, executed={activity.executed_at || 'n/a'}</p>
              </div>
            ))}
            {footprintActivities.length === 0 ? <p className="text-sm text-slate-500">No footprint activities.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'benchmark' ? (
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6 space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Protocols</label>
              <input className="bg-slate-900 border border-slate-700 rounded px-3 py-2 w-80" value={benchmarkProtocols} onChange={(event) => setBenchmarkProtocols(event.target.value)} />
            </div>
            <div>
              <label className="block text-xs text-slate-500 mb-1 uppercase">Samples</label>
              <input type="number" min={1} max={20} className="bg-slate-900 border border-slate-700 rounded px-3 py-2 w-24" value={benchmarkSamples} onChange={(event) => setBenchmarkSamples(Number(event.target.value || 1))} />
            </div>
            <button
              onClick={() =>
                void safeRun(async () => {
                  const protocols = benchmarkProtocols
                    .split(/[,\s]+/)
                    .map((item) => item.trim().toLowerCase())
                    .filter(Boolean);
                  await runTunnelBenchmark({ protocols, samples: benchmarkSamples });
                  await refreshByTab('benchmark');
                  setInfoText('Tunnel benchmark run completed.');
                })
              }
              disabled={isBusy}
              className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-bold text-white"
            >
              Run Benchmark
            </button>
          </div>
          <div className="space-y-2">
            {benchmarkResults.map((result, index) => (
              <div key={`${result.protocol}-${result.created_at}-${index}`} className="bg-slate-900 border border-slate-800 rounded p-3">
                <p className="text-sm font-semibold">{result.protocol}</p>
                <p className="text-[11px] text-slate-500">
                  latency={result.latency_ms}ms, throughput={result.throughput_mbps}Mbps, stability={result.stability_score}, persistence={result.persistence_score}, detection={result.detection_score}
                </p>
              </div>
            ))}
            {benchmarkResults.length === 0 ? <p className="text-sm text-slate-500">No benchmark samples.</p> : null}
          </div>
        </section>
      ) : null}

      {activeTab === 'architecture' ? (
        <section className="bg-[#0d1225] border border-slate-800 rounded-2xl p-6 space-y-6">
          <div className="space-y-3">
            <p className="text-sm text-slate-300">Set explicit role of n8n in final architecture.</p>
            <div className="flex flex-wrap gap-3">
              {(['main_orchestrator', 'secondary_automation', 'eliminated'] as const).map((role) => (
                <button
                  key={role}
                  onClick={() =>
                    void safeRun(async () => {
                      const updated = await setN8nRoleConfig({ role, notes: `Updated from dashboard to ${role}.` });
                      setN8nRole(updated.role);
                      setInfoText(`n8n role updated to '${updated.role}'.`);
                    })
                  }
                  disabled={isBusy}
                  className={`px-4 py-2 rounded text-xs font-bold border ${
                    n8nRole === role
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-900 border-slate-700 text-slate-300'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4">
            <div className="flex flex-wrap items-center gap-3">
              <p className="text-xs font-black uppercase text-slate-500 tracking-widest">n8n Workflows</p>
              <button
                onClick={() =>
                  void safeRun(async () => {
                    const existing = n8nWorkflows.find((item) => item.workflow_id === 'real-api-lane');
                    const imported = await importN8nWorkflow({
                      workflow_id: 'real-api-lane',
                      name: 'Real API Lane - VM + IP + Verification + CAPTCHA + Job',
                      source: 'dashboard',
                      active: false,
                      definition:
                        existing?.definition || {
                          name: 'Real API Lane - VM + IP + Verification + CAPTCHA + Job',
                          nodes: [],
                          connections: {},
                        },
                    });
                    setSelectedWorkflowId(imported.workflow_id);
                    await refreshByTab('architecture');
                    setInfoText(`Workflow '${imported.workflow_id}' imported/updated.`);
                  })
                }
                disabled={isBusy}
                className="px-3 py-2 bg-blue-600 hover:bg-blue-500 rounded text-xs font-bold text-white"
              >
                Import/Refresh Bundled Workflow
              </button>
              <select
                className="bg-slate-900 border border-slate-700 rounded px-3 py-2 text-xs"
                value={selectedWorkflowId}
                onChange={(event) =>
                  (() => {
                    const workflowId = event.target.value;
                    void safeRun(async () => {
                      setSelectedWorkflowId(workflowId);
                      setN8nRuns(await listN8nRuns(80, workflowId || undefined));
                    });
                  })()
                }
              >
                <option value="">All workflows</option>
                {n8nWorkflows.map((workflow) => (
                  <option key={workflow.workflow_id} value={workflow.workflow_id}>
                    {workflow.workflow_id}
                  </option>
                ))}
              </select>
              <button
                onClick={() =>
                  void safeRun(async () => {
                    if (!selectedWorkflowId) {
                      throw new Error('Select workflow first.');
                    }
                    const run = await createN8nRun({
                      workflow_id: selectedWorkflowId,
                      trigger: 'manual',
                      context: { source: 'advanced-ops' },
                    });
                    await appendN8nRunEvent(run.id, {
                      phase: 'dispatch',
                      status: 'running',
                      message: 'Dispatched from Advanced Ops.',
                    });
                    await refreshByTab('architecture');
                    setInfoText(`n8n run '${run.id}' started.`);
                  })
                }
                disabled={isBusy || !selectedWorkflowId}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-xs font-bold text-white"
              >
                Start Run
              </button>
            </div>

            <div className="space-y-2">
              {n8nWorkflows.map((workflow) => (
                <div key={workflow.workflow_id} className="bg-slate-900 border border-slate-800 rounded p-3">
                  <p className="text-sm font-semibold">
                    {workflow.name} ({workflow.workflow_id})
                  </p>
                  <p className="text-[11px] text-slate-500">
                    source={workflow.source}, active={String(workflow.active)}, version={workflow.version_hash.slice(0, 12)}
                  </p>
                </div>
              ))}
              {n8nWorkflows.length === 0 ? <p className="text-sm text-slate-500">No n8n workflows registered.</p> : null}
            </div>
          </div>

          <div className="space-y-3 border-t border-slate-800 pt-4">
            <p className="text-xs font-black uppercase text-slate-500 tracking-widest">n8n Runs</p>
            <div className="space-y-2">
              {n8nRuns.map((run) => (
                <div key={run.id} className="bg-slate-900 border border-slate-800 rounded p-3">
                  <div className="flex justify-between gap-3 items-start">
                    <div>
                      <p className="text-sm font-semibold">{run.id}</p>
                      <p className="text-[11px] text-slate-500">
                        workflow={run.workflow_id}, status={run.status}, trigger={run.trigger}, events={run.events.length}
                      </p>
                      <p className="text-[11px] text-slate-500">{run.last_message || 'No message'}</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() =>
                          void safeRun(async () => {
                            await appendN8nRunEvent(run.id, {
                              phase: 'manual',
                              status: 'running',
                              message: 'Manual progress update from dashboard.',
                            });
                            await refreshByTab('architecture');
                            setInfoText(`Run '${run.id}' event appended.`);
                          })
                        }
                        disabled={isBusy || ['succeeded', 'failed', 'cancelled'].includes(run.status)}
                        className="px-2 py-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded text-[10px] font-bold text-white"
                      >
                        Event
                      </button>
                      <button
                        onClick={() =>
                          void safeRun(async () => {
                            await updateN8nRunStatus(run.id, {
                              status: 'succeeded',
                              message: 'Marked succeeded from dashboard.',
                            });
                            await refreshByTab('architecture');
                            setInfoText(`Run '${run.id}' marked succeeded.`);
                          })
                        }
                        disabled={isBusy || ['succeeded', 'failed', 'cancelled'].includes(run.status)}
                        className="px-2 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 rounded text-[10px] font-bold text-white"
                      >
                        Complete
                      </button>
                      <button
                        onClick={() =>
                          void safeRun(async () => {
                            await updateN8nRunStatus(run.id, {
                              status: 'failed',
                              message: 'Marked failed from dashboard.',
                            });
                            await refreshByTab('architecture');
                            setInfoText(`Run '${run.id}' marked failed.`);
                          })
                        }
                        disabled={isBusy || ['succeeded', 'failed', 'cancelled'].includes(run.status)}
                        className="px-2 py-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 rounded text-[10px] font-bold text-white"
                      >
                        Fail
                      </button>
                    </div>
                  </div>
                </div>
              ))}
              {n8nRuns.length === 0 ? <p className="text-sm text-slate-500">No n8n runs found.</p> : null}
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
};

export default AdvancedOps;
