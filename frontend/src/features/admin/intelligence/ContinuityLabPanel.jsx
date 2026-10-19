import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, Field, inputClass } from '../../../components/ui';

const initialSeed = '20261019';
const initialOutage = '45';

function dispositionTone(value) {
  if (value === 'RECONSTRUCTED') return 'green';
  if (value === 'REVIEW_REQUIRED') return 'orange';
  return 'neutral';
}

function severityTone(value) {
  if (value === 'HIGH') return 'red';
  if (value === 'MEDIUM') return 'orange';
  if (value === 'LOW') return 'teal';
  return 'gray';
}

export default function ContinuityLabPanel({ token }) {
  const [seed, setSeed] = useState(initialSeed);
  const [outageMinutes, setOutageMinutes] = useState(initialOutage);
  const [runs, setRuns] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [loadingRuns, setLoadingRuns] = useState(false);
  const [error, setError] = useState('');

  const refreshRuns = useCallback(async () => {
    setLoadingRuns(true);
    try {
      setRuns(await api.continuityRuns(token, 10));
    } catch (e) {
      setError(e.message);
    } finally {
      setLoadingRuns(false);
    }
  }, [token]);

  useEffect(() => { refreshRuns(); }, [refreshRuns]);

  async function runScenario(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    try {
      const run = await api.runContinuityScenario(token, {
        scenario_code: 'RMSH_DOWNTIME_RECOVERY',
        seed: Number(seed),
        outage_minutes: Number(outageMinutes)
      });
      setResult(run);
      await refreshRuns();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function loadRun(run) {
    setResult({
      ...run.output,
      continuity_run_id: run.continuity_run_id,
      created_at: run.created_at,
      input: run.input
    });
    setError('');
  }

  const summary = result?.summary;

  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-xl font-bold">Operational Continuity Lab</h2>
            <p className="mt-1 max-w-3xl text-sm text-stone-500">
              Replay a repeatable synthetic clinic downtime scenario. Reconstruct visit timelines, detect duplicate or invalid events, and identify records that require human review.
            </p>
          </div>
          <Badge tone="orange">Synthetic only</Badge>
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          This first release does not import, change or reconcile real patient records. Visit references are synthetic, times are relative to a simulated clinic session, and findings are operational test results—not clinical decisions.
        </div>
        <form onSubmit={runScenario} className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto] md:items-end">
          <Field label="Random seed" hint="Same inputs produce the same scenario.">
            <input className={inputClass} type="number" min="1" max="2147483647" value={seed} onChange={e => setSeed(e.target.value)} required />
          </Field>
          <Field label="Simulated outage (minutes)" hint="Choose between 45 and 240 minutes.">
            <input className={inputClass} type="number" min="45" max="240" value={outageMinutes} onChange={e => setOutageMinutes(e.target.value)} required />
          </Field>
          <div className="self-end">
            <Button type="submit" icon="play" disabled={busy}>{busy ? 'Reconstructing…' : 'Run recovery scenario'}</Button>
          </div>
        </form>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      </Card>

      {result && summary && (
        <Card className="overflow-hidden">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-stone-100 p-5 md:p-6">
            <div>
              <h2 className="font-display text-lg font-bold">Reconstruction result</h2>
              <p className="mt-1 text-sm text-stone-500">
                Run #{result.continuity_run_id || 'preview'} · {result.engine_version} · seed {result.seed}
              </p>
            </div>
            <Badge tone="teal">{result.source_scope || 'SYNTHETIC_ONLY'}</Badge>
          </div>
          <div className="grid gap-3 p-5 sm:grid-cols-2 lg:grid-cols-4 md:p-6">
            <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs text-stone-500">Source events</p><p className="mt-1 font-display text-2xl font-bold">{summary.source_event_count}</p><p className="text-xs text-stone-500">{summary.unique_event_count} unique after duplicate handling</p></div>
            <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs text-stone-500">Visit timelines</p><p className="mt-1 font-display text-2xl font-bold">{summary.reconstructed_visit_count}</p><p className="text-xs text-stone-500">{summary.reconstructed_count} reconstructed without review flags</p></div>
            <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs text-stone-500">Require review</p><p className="mt-1 font-display text-2xl font-bold">{summary.review_required_count}</p><p className="text-xs text-stone-500">Visit-level review flags</p></div>
            <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs text-stone-500">Detected discrepancies</p><p className="mt-1 font-display text-2xl font-bold">{summary.discrepancy_count}</p><p className="text-xs text-stone-500">{summary.invalid_transition_count} invalid transitions</p></div>
          </div>
          <div className="mx-5 mb-5 rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700 md:mx-6">
            <strong>Scenario timeline.</strong> The simulated outage starts at minute {result.outage?.start_minute} and recovery occurs at minute {result.outage?.recovery_minute}. Paper entries may be recorded after recovery and are ordered by their occurrence time for reconstruction. Any flagged inconsistency remains visible for review; invalid transitions are not accepted into the reconstructed state.
          </div>

          <div className="border-t border-stone-100 p-5 md:p-6">
            <h3 className="font-semibold">Reconstructed visit timelines</h3>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[680px] text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500">
                  <tr><th className="px-3 py-3">Synthetic visit</th><th className="px-3 py-3">Reconstructed state</th><th className="px-3 py-3">Disposition</th><th className="px-3 py-3">Accepted events</th></tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {result.visits.map(visit => (
                    <tr key={visit.visit_ref} className="align-top">
                      <td className="px-3 py-3 font-mono text-xs">{visit.visit_ref}</td>
                      <td className="px-3 py-3">{visit.reconstructed_state || 'Unknown'}</td>
                      <td className="px-3 py-3"><Badge tone={dispositionTone(visit.disposition)}>{visit.disposition.replaceAll('_', ' ')}</Badge></td>
                      <td className="px-3 py-3">{visit.accepted_event_count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="border-t border-stone-100 p-5 md:p-6">
            <h3 className="font-semibold">Discrepancies and evidence</h3>
            {!result.anomalies?.length ? <p className="mt-2 text-sm text-stone-500">No discrepancies detected in this scenario.</p> : (
              <div className="mt-3 space-y-2">
                {result.anomalies.map((anomaly, index) => (
                  <div key={anomaly.type + '-' + anomaly.event_ref + '-' + index} className="rounded-xl border border-stone-200 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone={severityTone(anomaly.severity)}>{anomaly.severity}</Badge>
                      <strong className="text-sm">{anomaly.type.replaceAll('_', ' ')}</strong>
                      <span className="font-mono text-xs text-stone-500">{anomaly.visit_ref} · {anomaly.event_ref}</span>
                      {anomaly.requires_review && <Badge tone="orange">Human review</Badge>}
                    </div>
                    <p className="mt-2 text-sm text-stone-600">{anomaly.message}</p>
                    {anomaly.from_state && <p className="mt-1 text-xs text-stone-500">Proposed transition: {anomaly.from_state} → {anomaly.proposed_state}</p>}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="border-t border-stone-100 p-5 md:p-6">
            <h3 className="font-semibold">Reconstructed event replay</h3>
            <p className="mt-1 text-sm text-stone-500">Events below are ordered by occurrence time, not by when they were received.</p>
            <div className="mt-3 space-y-2">
              {result.visits.map(visit => (
                <details key={visit.visit_ref} className="rounded-xl border border-stone-200 p-3">
                  <summary className="cursor-pointer font-semibold">{visit.visit_ref} <span className="ml-2 text-xs font-normal text-stone-500">{visit.timeline.length} accepted events</span></summary>
                  <ol className="mt-3 space-y-2 border-l-2 border-teal-100 pl-4">
                    {visit.timeline.map(event => (
                      <li key={event.event_ref} className="text-sm">
                        <div className="font-medium">{event.state} <span className="ml-1 text-xs font-normal text-stone-500">minute {event.occurred_minute}</span></div>
                        <div className="text-xs text-stone-500">{event.source} source · recorded minute {event.recorded_minute} · {event.event_ref}</div>
                      </li>
                    ))}
                  </ol>
                </details>
              ))}
            </div>
          </div>
          <div className="border-t border-stone-100 bg-stone-50 p-5 md:p-6">
            <h3 className="font-semibold">Model assumptions and limitations</h3>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-stone-600">
              {result.assumptions?.map(item => <li key={item}>{item}</li>)}
            </ul>
          </div>
        </Card>
      )}

      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5">
          <div>
            <h2 className="font-display text-lg font-bold">Previous recovery runs</h2>
            <p className="mt-1 text-sm text-stone-500">Persisted synthetic scenarios can be re-opened for repeatable review.</p>
          </div>
          <Button variant="secondary" icon="refresh" onClick={refreshRuns} disabled={loadingRuns}>{loadingRuns ? 'Refreshing…' : 'Refresh history'}</Button>
        </div>
        {runs.length ? <div className="divide-y divide-stone-100">
          {runs.map(run => (
            <div key={run.continuity_run_id} className="flex flex-wrap items-center justify-between gap-3 p-4">
              <div>
                <p className="font-semibold">Run #{run.continuity_run_id} · seed {run.seed} · {run.outage_minutes} minute outage</p>
                <p className="mt-1 text-xs text-stone-500">{run.created_at ? new Date(run.created_at).toLocaleString() : ''} · {run.output?.summary?.discrepancy_count ?? 0} discrepancies · {run.source_scope}</p>
              </div>
              <Button variant="secondary" onClick={() => loadRun(run)}>Open result</Button>
            </div>
          ))}
        </div> : <p className="p-5 text-sm text-stone-500">{loadingRuns ? 'Loading run history…' : 'No continuity runs recorded yet. Run the synthetic scenario to create the first result.'}</p>}
      </Card>
    </div>
  );
}
