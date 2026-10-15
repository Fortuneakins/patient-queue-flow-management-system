import { useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, Field, inputClass } from '../../../components/ui';

const initial = { replications: 30, hours: 8, arrivals_per_hour: 12, servers: 2, mean_service_minutes: 12, seed: 20261015 };
export default function SyntheticLabPanel({ token }) {
  const [form, setForm] = useState(initial);
  const [profiles, setProfiles] = useState([]);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { api.benchmarkProfiles(token).then(setProfiles).catch(e => setError(e.message)); }, [token]);
  async function run() {
    setBusy(true); setError('');
    try {
      const saved = await api.runSyntheticLab(token, form);
      setResult(saved);
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  const change = key => e => setForm(current => ({ ...current, [key]: Number(e.target.value) }));
  return <div className="space-y-5">
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Synthetic Clinic Laboratory</h2><p className="mt-1 text-sm text-stone-500">Repeatable clinic-day stress tests with a fixed seed. These outputs are synthetic scenarios, not clinic observations.</p></div><Badge tone="orange">Synthetic only</Badge></div>
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
    {result && <Card className="p-5"><div className="flex flex-wrap justify-between gap-2"><h2 className="font-display font-bold">Batch #{result.simulation_id}</h2><Badge tone="orange">{result.summary.model_quality}</Badge></div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[
        ['Average completions', result.summary.average_projected_completed],
        ['Average remaining', result.summary.average_projected_remaining],
        ['Median P90 wait', (result.summary.median_p90_additional_wait_minutes ?? '—') + ' min'],
        ['Runs with P90 > 60 min', result.summary.replications_over_60_minute_p90 + '/' + result.input.replications]
      ].map(item => <div key={item[0]} className="rounded-xl border border-stone-200 p-3"><div className="text-xs text-stone-500">{item[0]}</div><div className="mt-1 text-2xl font-bold">{item[1]}</div></div>)}</div>
      <p className="mt-3 text-sm text-stone-600">Worst P90 wait: {result.summary.worst_p90_additional_wait_minutes} minutes. Outcomes depend on the configured assumptions.</p>
    </Card>}
    <Card className="p-5"><h2 className="font-display font-bold">Reference profiles</h2><p className="mt-1 text-xs text-stone-500">Synthetic examples only; not measured clinic benchmarks.</p><div className="mt-3 grid gap-3 md:grid-cols-3">{profiles.map(item => <div key={item.code} className="rounded-xl border border-stone-200 p-3"><div className="font-semibold">{item.name}</div><div className="mt-2 text-xs text-stone-500">{item.arrivals_per_hour} arrivals/hour · {item.servers} stations · {item.mean_service_minutes} minutes/service</div><div className="mt-2"><Badge tone="orange">{item.provenance}</Badge></div></div>)}</div></Card>
  </div>;
}
