import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';

const initialScenario = { name: 'Demand pressure test', horizon_minutes: '60', extra_arrivals: '8', additional_stations: '0', station_loss: '0', doctor_delay_minutes: '0', seed: '20261015' };
const numberFields = [
  ['horizon_minutes', 'Simulation horizon (minutes)', 30, 240],
  ['extra_arrivals', 'Additional arrivals', 0, 200],
  ['additional_stations', 'Hypothetical additional stations', 0, 8],
  ['station_loss', 'Stations temporarily unavailable', 0, 8],
  ['doctor_delay_minutes', 'Doctor delay (minutes)', 0, 180],
  ['seed', 'Repeatable scenario seed', 1, 2147483647]
];
function Metric({ label, value, suffix = '' }) {
  return <div className="rounded-xl border border-stone-200 bg-white p-3"><div className="text-xs text-stone-500">{label}</div><div className="mt-1 font-display text-2xl font-bold text-stone-900">{value === null || value === undefined ? '—' : value}{value === null || value === undefined ? '' : suffix}</div></div>;
}
function showDelta(value, suffix = '') {
  if (value === null || value === undefined) return 'Not available';
  const n = Number(value);
  return (n > 0 ? '+' : '') + n + suffix;
}
export default function FlowTwinPanel({ token }) {
  const [form, setForm] = useState(initialScenario);
  const [result, setResult] = useState(null);
  const [recent, setRecent] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    try { setRecent(await api.listFlowSimulations(token, 8)); } catch (e) { setError(e.message); }
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  async function run() {
    setBusy(true); setError('');
    try {
      const payload = { ...form };
      numberFields.forEach(([key]) => { payload[key] = Number(form[key]); });
      const next = await api.runFlowSimulation(token, payload);
      setResult(next);
      await refresh();
    } catch (e) { setError(e.message || 'The simulation could not be run.'); }
    finally { setBusy(false); }
  }
  const scenario = result?.scenario;
  const compare = result?.comparison;
  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-display text-lg font-bold">What happens if…?</h2><p className="mt-1 max-w-2xl text-sm text-stone-500">Compare the current operational snapshot with a hypothetical demand, staffing or station disruption. No live queue actions are taken.</p></div>
          <Badge tone="teal">Deterministic model</Badge>
        </div>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <Field label="Scenario name" required><input className={inputClass} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          </div>
          {numberFields.map(([key, label, min, max]) => <Field key={key} label={label} hint={`Allowed: ${min}–${max}`}><input className={inputClass} type="number" min={min} max={max} step="1" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></Field>)}
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-2"><Button icon="chart" onClick={run} disabled={busy}>{busy ? 'Simulating…' : 'Run comparison'}</Button><Button variant="secondary" onClick={() => { setForm(initialScenario); setResult(null); setError(''); }}>Reset scenario</Button></div>
      </Card>
      {result && <Card className="space-y-5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">{result.name}</h2><p className="mt-1 text-xs text-stone-500">Simulation #{result.simulation_id} · {result.model_version} · seed {result.input?.seed}</p></div><Badge tone={scenario?.model_quality === 'OBSERVATION_BASED' ? 'green' : 'orange'}>{scenario?.model_quality?.replaceAll('_', ' ') || 'Estimate'}</Badge></div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label="Projected completions" value={scenario?.projected_completed} />
          <Metric label="Projected remaining" value={scenario?.projected_remaining} />
          <Metric label="Median wait to service start" value={scenario?.p50_additional_wait_minutes} suffix=" min" />
          <Metric label="P90 wait to service start" value={scenario?.p90_additional_wait_minutes} suffix=" min" />
        </div>
        <div><h3 className="font-semibold">Scenario impact vs baseline</h3><div className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <Metric label="Change in completions" value={showDelta(compare?.projected_completed_delta)} />
          <Metric label="Change in remaining queue" value={showDelta(compare?.projected_remaining_delta)} />
          <Metric label="Change in P90 wait" value={showDelta(compare?.p90_additional_wait_delta_minutes, ' min')} />
          <Metric label="Change in mean wait" value={showDelta(compare?.mean_additional_wait_delta_minutes, ' min')} />
          <Metric label="Server utilisation change" value={showDelta(compare?.server_utilisation_delta_percentage_points, ' pp')} />
          <Metric label="Available modelled servers" value={scenario?.available_servers} />
        </div></div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Human review required.</strong> The simulator did not change queue records or clinical priorities. These projections depend on the service-time assumptions, arrival pattern and current staffing snapshot.</div>
        <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600"><strong>Interpreting wait metrics.</strong> Median and P90 waits estimate time from arrival until service can start. Jobs may remain queued after the scenario horizon ends, so these waits can exceed the selected horizon. They are not service-completion times or observed clinical waits.</p>
        <details className="rounded-xl border border-stone-200 p-4"><summary className="cursor-pointer font-semibold">Model assumptions and data sufficiency</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-stone-600">{(scenario?.assumptions || []).map(item => <li key={item}>{item}</li>)}</ul><p className="mt-3 text-xs text-stone-500">Observed service samples used: {scenario?.service_samples_used ?? 0}. The absence of sufficient history is reported instead of being represented as model confidence.</p></details>
      </Card>}
      <Card className="overflow-hidden">
        <div className="border-b border-stone-100 p-5"><h2 className="font-display font-bold">Recent simulations</h2><p className="mt-1 text-xs text-stone-500">Stored scenarios are operational evidence; synthetic reference profiles are not real clinic benchmarks.</p></div>
        {recent.length ? <div className="divide-y divide-stone-100">{recent.map(item => <div key={item.simulation_id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div><div className="font-semibold">{item.name}</div><div className="mt-1 text-xs text-stone-500">#{item.simulation_id} · {item.simulation_kind.replaceAll('_', ' ')} · {item.model_version}</div></div><Button variant="secondary" onClick={() => setResult({ ...item.output, simulation_id: item.simulation_id, name: item.name, input: item.input })}>View result</Button></div>)}</div> : <EmptyState title="No simulations saved yet" message="Run a scenario above to record a baseline comparison."/>}
      </Card>
    </div>
  );
}
