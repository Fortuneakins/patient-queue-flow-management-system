import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';
import Icon from '../../../components/ui/Icon';

const initial = { replications: 30, hours: 8, arrivals_per_hour: 12, servers: 2, mean_service_minutes: 12, seed: 20261015 };

function BatchMetric({ label, value }) {
  return <div className="synthetic-lab-result-metric"><span>{label}</span><strong>{value ?? '—'}</strong></div>;
}

function batchShape(item) {
  const output = item?.output && typeof item.output === 'object' ? item.output : {};
  const input = item?.input && typeof item.input === 'object' ? item.input : output.input;
  return { output, input };
}

export default function SyntheticLabPanel({ token }) {
  const [form, setForm] = useState(initial);
  const [profiles, setProfiles] = useState([]);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [historyBusy, setHistoryBusy] = useState(false);
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');

  const refreshRecent = useCallback(async () => {
    setHistoryBusy(true);
    setHistoryError('');
    try {
      const items = await api.listFlowSimulations(token, 100);
      setRecent(Array.isArray(items) ? items.filter(item => item.simulation_kind === 'SYNTHETIC_BATCH') : []);
    } catch (e) {
      setHistoryError(e.message || 'Unable to load saved synthetic batches.');
    } finally {
      setHistoryBusy(false);
    }
  }, [token]);

  useEffect(() => {
    api.benchmarkProfiles(token).then(setProfiles).catch(e => setError(e.message));
    refreshRecent();
  }, [token, refreshRecent]);

  async function run() {
    setBusy(true); setError('');
    try {
      const saved = await api.runSyntheticLab(token, form);
      setResult(saved);
      await refreshRecent();
    } catch (e) { setError(e.message || 'Unable to run synthetic batch.'); }
    finally { setBusy(false); }
  }

  function openSavedBatch(item) {
    const { output, input } = batchShape(item);
    if (!output.summary || !input) {
      setHistoryError('This saved synthetic batch does not contain a complete result summary. The saved record has not been changed.');
      return;
    }
    setHistoryError('');
    setResult({ ...output, simulation_id: item.simulation_id, input, name: item.name || 'Synthetic clinic laboratory' });
  }

  const change = key => e => setForm(current => ({ ...current, [key]: Number(e.target.value) }));
  const replicationCount = Number(result?.input?.replications) || 0;
  const longWaitReplications = Number(result?.summary?.replications_over_60_minute_p90) || 0;
  const longWaitShare = replicationCount > 0 ? Math.round((longWaitReplications / replicationCount) * 100) : 0;

  return <div className="space-y-5 synthetic-lab-panel">
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Synthetic scenario workbench</p><h2 className="font-display text-lg font-bold">Synthetic Clinic Laboratory</h2><p className="mt-1 text-sm text-stone-500">Repeatable clinic-day stress tests with a fixed seed. These outputs are synthetic scenarios, not clinic observations.</p></div><Badge tone="orange">Synthetic only</Badge></div>
      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Field label="Replications"><input className={inputClass} type="number" min="1" max="200" value={form.replications} onChange={change('replications')}/></Field>
        <Field label="Simulated hours"><input className={inputClass} type="number" min="4" max="12" value={form.hours} onChange={change('hours')}/></Field>
        <Field label="Arrivals per hour"><input className={inputClass} type="number" min="0" max="60" value={form.arrivals_per_hour} onChange={change('arrivals_per_hour')}/></Field>
        <Field label="Service stations"><input className={inputClass} type="number" min="1" max="20" value={form.servers} onChange={change('servers')}/></Field>
        <Field label="Mean service minutes"><input className={inputClass} type="number" min="3" max="90" value={form.mean_service_minutes} onChange={change('mean_service_minutes')}/></Field>
        <Field label="Random seed"><input className={inputClass} type="number" min="1" max="2147483647" value={form.seed} onChange={change('seed')}/></Field>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-4"><Button onClick={run} disabled={busy}>{busy ? 'Running…' : 'Run synthetic batch'}</Button></div>
    </Card>

    {result && <Card className="synthetic-lab-result-card p-5">
      <div className="flex flex-wrap justify-between gap-2"><div><p className="eyebrow">Synthetic batch result</p><h2 className="font-display font-bold">{result.name || 'Batch'} #{result.simulation_id}</h2><p className="mt-1 text-xs text-stone-500">{result.model_version || 'flowtwin-1.0.0'} · seed {result.input?.seed}</p></div><Badge tone="orange">{result.summary.model_quality}</Badge></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <BatchMetric label="Average completions" value={result.summary.average_projected_completed}/>
        <BatchMetric label="Average remaining" value={result.summary.average_projected_remaining}/>
        <BatchMetric label="Median P90 wait to service start" value={result.summary.median_p90_additional_wait_minutes == null ? '—' : result.summary.median_p90_additional_wait_minutes + ' min'}/>
        <BatchMetric label="Runs with P90 over 60 min" value={result.summary.replications_over_60_minute_p90 + '/' + result.input.replications}/>
      </div>
      <p className="mt-3 text-sm text-stone-600">Worst P90 wait: {result.summary.worst_p90_additional_wait_minutes} minutes. Outcomes depend on the configured assumptions.</p>
      <section className="synthetic-lab-threshold-visual" aria-label="Replications with P90 wait over 60 minutes">
        <div className="synthetic-lab-threshold-heading"><div><p className="eyebrow">Wait-threshold signal</p><h3>Replications with P90 wait over 60 minutes</h3><p>Share of this synthetic batch exceeding the configured review threshold.</p></div><strong>{longWaitShare}%</strong></div>
        <div className="synthetic-lab-threshold-track" role="progressbar" aria-label="Share of replications with P90 wait over 60 minutes" aria-valuemin={0} aria-valuemax={100} aria-valuenow={longWaitShare}><span style={{ width: longWaitShare + '%' }} /></div>
        <div className="synthetic-lab-threshold-foot"><span>{longWaitReplications} of {replicationCount} replications</span><span>Synthetic output · not observed clinic data</span></div>
      </section>
      <p className="mt-2 rounded-xl border border-stone-200 bg-stone-50 p-3 text-sm text-stone-600"><strong>Interpreting wait metrics.</strong> Waits measure simulated time from arrival until service can start. A queue can extend beyond the simulated arrival window, so wait values may exceed the simulated hours; they are not service-completion times or observed clinic waits.</p>
    </Card>}

    <Card className="synthetic-lab-history-card overflow-hidden">
      <header className="synthetic-lab-history-header">
        <div><p className="eyebrow">Saved operational evidence</p><h2 className="font-display font-bold">Recent synthetic batches</h2><p>Previously saved Synthetic Lab runs can be reopened here. FlowTwin scenarios remain in FlowTwin history.</p></div>
        <Button variant="secondary" icon="refresh" onClick={refreshRecent} disabled={historyBusy}>{historyBusy ? 'Refreshing…' : 'Refresh history'}</Button>
      </header>
      {historyError && <p role="alert" className="synthetic-lab-history-error">{historyError}</p>}
      {historyBusy && recent.length === 0 ? (
        <div className="p-5"><EmptyState title="Loading saved batches" message="Retrieving previously saved synthetic results."/></div>
      ) : recent.length ? (
        <div className="synthetic-lab-history-list">
          {recent.map(item => {
            const { output, input } = batchShape(item);
            const summary = output.summary || {};
            const completed = Number(summary.average_projected_completed);
            const p90 = Number(summary.median_p90_additional_wait_minutes);
            return (
              <article key={item.simulation_id} className="synthetic-lab-history-row">
                <span className="synthetic-lab-history-icon" aria-hidden="true"><Icon name="chart" size={19}/></span>
                <div className="synthetic-lab-history-main">
                  <strong>{item.name || 'Synthetic clinic laboratory'}</strong>
                  <span>#{item.simulation_id} · Synthetic Lab batch · {item.model_version || 'flowtwin-1.0.0'}</span>
                  <div className="synthetic-lab-history-chips">
                    <span>{input?.replications ?? '—'} replications</span>
                    <span>{input?.hours ?? '—'} simulated hours</span>
                    <span>Seed {input?.seed ?? '—'}</span>
                  </div>
                  {summary.average_projected_completed != null && <small>Average completions: {Number.isFinite(completed) ? completed.toLocaleString(undefined, { maximumFractionDigits: 1 }) : '—'} · Median P90 wait: {Number.isFinite(p90) ? p90 + ' min' : '—'}</small>}
                </div>
                <Button variant="secondary" onClick={() => openSavedBatch(item)}>View result</Button>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="p-5"><EmptyState title="No saved synthetic batches" message="Run a synthetic batch above to save a repeatable result. Previously saved batches will appear here."/></div>
      )}
      <footer className="synthetic-lab-history-footer"><span><span className="synthetic-lab-history-dot"/> Synthetic records</span><span>{recent.length} saved {recent.length === 1 ? 'batch' : 'batches'}</span></footer>
    </Card>

    <Card className="p-5"><h2 className="font-display font-bold">Reference profiles</h2><p className="mt-1 text-xs text-stone-500">Synthetic examples only; not measured clinic benchmarks.</p><div className="mt-3 grid gap-3 md:grid-cols-3">{profiles.map(item => <div key={item.code} className="rounded-xl border border-stone-200 p-3"><div className="font-semibold">{item.name}</div><div className="mt-2 text-xs text-stone-500">{item.arrivals_per_hour} arrivals/hour · {item.servers} stations · {item.mean_service_minutes} minutes/service</div><div className="mt-2"><Badge tone="orange">{item.provenance}</Badge></div></div>)}</div></Card>
  </div>;
}
