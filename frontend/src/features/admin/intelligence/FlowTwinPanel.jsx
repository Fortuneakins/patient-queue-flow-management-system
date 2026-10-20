import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';
import Icon from '../../../components/ui/Icon';

const initialScenario = { name: 'Demand pressure test', horizon_minutes: '60', extra_arrivals: '8', additional_stations: '0', station_loss: '0', doctor_delay_minutes: '0', seed: '20261015' };
const numberFields = [
  ['horizon_minutes', 'Simulation horizon (minutes)', 30, 240],
  ['extra_arrivals', 'Additional arrivals', 0, 200],
  ['additional_stations', 'Hypothetical additional stations', 0, 8],
  ['station_loss', 'Stations temporarily unavailable', 0, 8],
  ['doctor_delay_minutes', 'Doctor delay (minutes)', 0, 180],
  ['seed', 'Repeatable scenario seed', 1, 2147483647]
];

const scenarioPresets = [
  {
    name: 'Demand surge',
    description: 'Test a sudden rise in arrivals with current modelled capacity.',
    icon: 'users',
    values: { name: 'Demand surge', horizon_minutes: '90', extra_arrivals: '20', additional_stations: '0', station_loss: '0', doctor_delay_minutes: '0', seed: '20261015' }
  },
  {
    name: 'Reduced capacity',
    description: 'Explore a scenario where one station is temporarily unavailable.',
    icon: 'settings',
    values: { name: 'Reduced capacity', horizon_minutes: '90', extra_arrivals: '0', additional_stations: '0', station_loss: '1', doctor_delay_minutes: '0', seed: '20261015' }
  },
  {
    name: 'Consultation delay',
    description: 'Explore the impact of a 30-minute doctor delay.',
    icon: 'clock',
    values: { name: 'Consultation delay', horizon_minutes: '90', extra_arrivals: '0', additional_stations: '0', station_loss: '0', doctor_delay_minutes: '30', seed: '20261015' }
  },
  {
    name: 'Capacity response',
    description: 'Compare a demand rise with one additional hypothetical station.',
    icon: 'checkCircle',
    values: { name: 'Capacity response', horizon_minutes: '90', extra_arrivals: '20', additional_stations: '1', station_loss: '0', doctor_delay_minutes: '0', seed: '20261015' }
  }
];

function Metric({ label, value, suffix = '', icon = 'chart' }) {
  const missing = value === null || value === undefined;
  const explanatory = typeof value === 'string' && value.length > 12;
  return (
    <div className="flowtwin-metric">
      <span className="flowtwin-metric-icon" aria-hidden="true"><Icon name={icon} size={17} /></span>
      <div className="flowtwin-metric-label">{label}</div>
      <div className={`flowtwin-metric-value${explanatory ? ' flowtwin-metric-value--explanatory' : ''}`}>{missing ? '—' : value}{missing ? '' : suffix}</div>
    </div>
  );
}

function showDelta(value, suffix = '', unavailableText = 'Not available') {
  if (value === null || value === undefined) return unavailableText;
  const n = Number(value);
  return (n > 0 ? '+' : '') + n + suffix;
}

function numericValue(value) {
  if (value === null || value === undefined || value === '') return null;
  const converted = Number(value);
  return Number.isFinite(converted) && converted >= 0 ? converted : null;
}

function displayValue(value, suffix = '') {
  return value === null || value === undefined || !Number.isFinite(Number(value))
    ? '—'
    : Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 }) + suffix;
}

function displayDeltaFallback(baselineValue, scenarioValue) {
  if (baselineValue === null || baselineValue === undefined) return 'No baseline sample';
  if (scenarioValue === null || scenarioValue === undefined) return 'No scenario sample';
  return 'Not available';
}

// Older saved runs may predate the persisted comparison-delta fields. Rebuild
// only the display delta from that run's own stored baseline and scenario;
// never simulate again or change the persisted result.
function resolveDelta(savedDelta, baselineValue, scenarioValue) {
  if (savedDelta !== null && savedDelta !== undefined && Number.isFinite(Number(savedDelta))) {
    return Number(savedDelta);
  }
  if (baselineValue === null || baselineValue === undefined || scenarioValue === null || scenarioValue === undefined) {
    return null;
  }
  const baselineNumber = Number(baselineValue);
  const scenarioNumber = Number(scenarioValue);
  if (!Number.isFinite(baselineNumber) || !Number.isFinite(scenarioNumber)) return null;
  return Number((scenarioNumber - baselineNumber).toFixed(1));
}

function ComparisonBar({ label, baseline, scenario, suffix = '', baselineMissingLabel = '—' }) {
  const base = numericValue(baseline);
  const projected = numericValue(scenario);
  const baselineDisplay = base === null ? baselineMissingLabel : displayValue(base, suffix);
  const scenarioDisplay = displayValue(projected, suffix);
  const scale = Math.max(base ?? 0, projected ?? 0);
  const barWidth = value => !value || scale === 0 ? 0 : Math.max(2, (value / scale) * 100);

  return (
    <div className="flowtwin-comparison-row" role="group" aria-label={`${label}: baseline ${baselineDisplay}, scenario ${scenarioDisplay}`}>
      <div className="flowtwin-comparison-row-heading">
        <span>{label}</span>
        <span className="flowtwin-comparison-values"><strong className={base === null ? 'flowtwin-comparison-value-missing' : ''}>{baselineDisplay}</strong><span aria-hidden="true">→</span><strong>{scenarioDisplay}</strong></span>
      </div>
      <div className="flowtwin-comparison-track" aria-hidden="true">
        <span className="flowtwin-comparison-bar flowtwin-comparison-bar--baseline" style={{ width: barWidth(base) + '%' }} />
      </div>
      <div className="flowtwin-comparison-track flowtwin-comparison-track--scenario" aria-hidden="true">
        <span className="flowtwin-comparison-bar flowtwin-comparison-bar--scenario" style={{ width: barWidth(projected) + '%' }} />
      </div>
    </div>
  );
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
    setBusy(true);
    setError('');
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
  const baseline = result?.baseline;
  const compare = result?.comparison;
  // The API's recent-simulation feed also includes Synthetic Lab batches.
  // FlowTwin can only render its own SCENARIO output contract.
  const flowTwinRecent = recent.filter(item => item.simulation_kind === 'SCENARIO');
  const resolvedDeltas = {
    completed: resolveDelta(compare?.projected_completed_delta, baseline?.projected_completed, scenario?.projected_completed),
    remaining: resolveDelta(compare?.projected_remaining_delta, baseline?.projected_remaining, scenario?.projected_remaining),
    p90Wait: resolveDelta(compare?.p90_additional_wait_delta_minutes, baseline?.p90_additional_wait_minutes, scenario?.p90_additional_wait_minutes),
    meanWait: resolveDelta(compare?.mean_additional_wait_delta_minutes, baseline?.mean_additional_wait_minutes, scenario?.mean_additional_wait_minutes),
    utilisation: resolveDelta(compare?.server_utilisation_delta_percentage_points, baseline?.server_utilisation_percent, scenario?.server_utilisation_percent)
  };

  function openSavedScenario(item) {
    const output = item?.output && typeof item.output === 'object' ? item.output : {};
    if (!output.scenario || !output.baseline || !output.comparison) {
      setError('This saved FlowTwin scenario does not contain a complete baseline comparison. The record has not been changed.');
      return;
    }
    setError('');
    setResult({ ...output, simulation_id: item.simulation_id, name: item.name, input: item.input });
  }

  return (
    <div className="space-y-5 flowtwin-panel">
      <Card className="flowtwin-config-card p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flowtwin-panel-heading">
            <span className="flowtwin-panel-heading-icon" aria-hidden="true"><Icon name="chart" size={20} /></span>
            <div><p className="eyebrow">Scenario workbench</p><h2 className="font-display text-lg font-bold">What happens if…?</h2><p className="mt-1 max-w-2xl text-sm text-stone-500">Compare the current operational snapshot with hypothetical demand, staffing or station disruption. No live queue actions are taken.</p></div>
          </div>
          <Badge tone="teal">Deterministic model</Badge>
        </div>
        <section className="mt-5 rounded-2xl border border-teal-100 bg-teal-50/50 p-4 md:p-5" aria-labelledby="flowtwin-presets-title">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <p className="eyebrow">Guided start</p>
              <h3 id="flowtwin-presets-title" className="font-display text-base font-bold">Choose a what-if scenario</h3>
              <p className="mt-1 text-sm text-stone-600">Load a sensible starting point first, then adjust any values below before running it.</p>
            </div>
            <Badge tone="teal">No live queue changes</Badge>
          </div>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {scenarioPresets.map(preset => (
              <button
                key={preset.name}
                type="button"
                onClick={() => { setForm(preset.values); setResult(null); setError(''); }}
                aria-label={`Use the ${preset.name} scenario preset`}
                className="group flex h-full flex-col items-start rounded-xl border border-stone-200 bg-white p-3 text-left transition hover:border-teal-400 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-50 text-teal-800"><Icon name={preset.icon} size={18} /></span>
                <strong className="mt-3 text-sm text-stone-900">{preset.name}</strong>
                <span className="mt-1 flex-1 text-xs leading-relaxed text-stone-500">{preset.description}</span>
                <span className="mt-3 text-xs font-bold text-teal-800">Use starting values →</span>
              </button>
            ))}
          </div>
        </section>
        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          <div className="md:col-span-2 xl:col-span-3">
            <Field label="Scenario name" required><input className={inputClass} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></Field>
          </div>
          {numberFields.map(([key, label, min, max]) => <Field key={key} label={label} hint={`Allowed: ${min}–${max}`}><input className={inputClass} type="number" min={min} max={max} step="1" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} /></Field>)}
        </div>
        <div className="flowtwin-input-summary">
          <div className="flowtwin-input-summary-heading"><span>Scenario inputs</span><small>Configured values · before simulation</small></div>
          <div className="flowtwin-input-summary-grid">
            {[
              { key: 'extra_arrivals', label: 'Additional arrivals', max: 200, unit: '' },
              { key: 'additional_stations', label: 'Additional stations', max: 8, unit: '' },
              { key: 'station_loss', label: 'Stations unavailable', max: 8, unit: '' },
              { key: 'doctor_delay_minutes', label: 'Doctor delay', max: 180, unit: ' min' }
            ].map(item => {
              const value = Number(form[item.key]) || 0;
              const width = Math.max(0, Math.min(100, (value / item.max) * 100));
              return (
                <div className="flowtwin-input-meter" key={item.key}>
                  <div><span>{item.label}</span><strong>{value}{item.unit}</strong></div>
                  <div className="flowtwin-input-meter-track" role="progressbar" aria-label={item.label} aria-valuemin={0} aria-valuemax={item.max} aria-valuenow={Math.max(0, Math.min(item.max, value))}><span style={{ width: width + '%' }} /></div>
                </div>
              );
            })}
          </div>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <div className="mt-5 flex flex-wrap gap-2"><Button icon="chart" onClick={run} disabled={busy}>{busy ? 'Simulating…' : 'Run comparison'}</Button><Button variant="secondary" onClick={() => { setForm(initialScenario); setResult(null); setError(''); }}>Reset scenario</Button></div>
      </Card>

      {result && <Card className="flowtwin-results-card space-y-5 p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Simulation result</p><h2 className="font-display text-lg font-bold">{result.name}</h2><p className="mt-1 text-xs text-stone-500">Simulation #{result.simulation_id} · {result.model_version} · seed {result.input?.seed}</p></div><Badge tone={scenario?.model_quality === 'OBSERVATION_BASED' ? 'green' : 'orange'}>{scenario?.model_quality?.replaceAll('_', ' ') || 'Estimate'}</Badge></div>

        <section className="flowtwin-projection-section">
          <div className="flowtwin-section-title"><div><p className="eyebrow">Projected scenario</p><h3>Estimated service picture</h3></div><span className="flowtwin-model-tag"><Icon name="info" size={14} /> Model output</span></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric label="Projected completions" value={scenario?.projected_completed} icon="checkCircle" />
            <Metric label="Projected remaining" value={scenario?.projected_remaining} icon="users" />
            <Metric label="Median wait to service start" value={scenario?.p50_additional_wait_minutes} suffix=" min" icon="clock" />
            <Metric label="P90 wait to service start" value={scenario?.p90_additional_wait_minutes} suffix=" min" icon="history" />
          </div>
        </section>

        {baseline && scenario && <section className="flowtwin-comparison-visual">
          <div className="flowtwin-section-title"><div><p className="eyebrow">Baseline vs scenario</p><h3>Compare projected outcomes</h3><p>Each pair uses its own scale so you can compare the baseline and scenario for that measure.</p></div></div>
          <div className="flowtwin-comparison-legend"><span><i className="flowtwin-legend-dot flowtwin-legend-dot--baseline" /> Baseline</span><span><i className="flowtwin-legend-dot flowtwin-legend-dot--scenario" /> Scenario</span></div>
          {(baseline.p50_additional_wait_minutes === null || baseline.p50_additional_wait_minutes === undefined || baseline.p90_additional_wait_minutes === null || baseline.p90_additional_wait_minutes === undefined) && <p className="flowtwin-baseline-note"><Icon name="info" size={15} /><span><strong>No baseline wait sample.</strong> This saved baseline had no waiting visits from which to estimate a wait-time distribution. The scenario values are shown, but median/P90 changes cannot be calculated; missing baseline data is not treated as zero.</span></p>}
          <div className="flowtwin-comparison-grid">
            <ComparisonBar label="Projected completions" baseline={baseline.projected_completed} scenario={scenario.projected_completed} />
            <ComparisonBar label="Remaining queue" baseline={baseline.projected_remaining} scenario={scenario.projected_remaining} />
            <ComparisonBar label="Median wait" baseline={baseline.p50_additional_wait_minutes} scenario={scenario.p50_additional_wait_minutes} suffix=" min" baselineMissingLabel="No baseline sample" />
            <ComparisonBar label="P90 wait" baseline={baseline.p90_additional_wait_minutes} scenario={scenario.p90_additional_wait_minutes} suffix=" min" baselineMissingLabel="No baseline sample" />
          </div>
        </section>}

        <section>
          <div className="flowtwin-section-title"><div><p className="eyebrow">Change from baseline</p><h3>Scenario impact</h3></div></div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Metric label="Change in completions" value={showDelta(resolvedDeltas.completed)} icon="checkCircle" />
            <Metric label="Change in remaining queue" value={showDelta(resolvedDeltas.remaining)} icon="users" />
            <Metric label="Change in P90 wait" value={showDelta(resolvedDeltas.p90Wait, ' min', displayDeltaFallback(baseline?.p90_additional_wait_minutes, scenario?.p90_additional_wait_minutes))} icon="history" />
            <Metric label="Change in mean wait" value={showDelta(resolvedDeltas.meanWait, ' min', displayDeltaFallback(baseline?.mean_additional_wait_minutes, scenario?.mean_additional_wait_minutes))} icon="clock" />
            <Metric label="Server utilisation change" value={showDelta(resolvedDeltas.utilisation, ' pp')} icon="chart" />
            <Metric label="Available modelled servers" value={scenario?.available_servers} icon="settings" />
          </div>
        </section>

        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950"><strong>Human review required.</strong> The simulator did not change queue records or clinical priorities. These projections depend on the service-time assumptions, arrival pattern and current staffing snapshot.</div>
        <p className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-600"><strong>Interpreting wait metrics.</strong> Median and P90 waits estimate time from arrival until service can start. Jobs may remain queued after the scenario horizon ends, so these waits can exceed the selected horizon. They are not service-completion times or observed clinical waits.</p>
        <details className="flowtwin-assumptions rounded-xl border border-stone-200 p-4"><summary className="cursor-pointer font-semibold">Model assumptions and data sufficiency</summary><ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-stone-600">{(scenario?.assumptions || []).map(item => <li key={item}>{item}</li>)}</ul><p className="mt-3 text-xs text-stone-500">Observed service samples used: {scenario?.service_samples_used ?? 0}. The absence of sufficient history is reported instead of being represented as model confidence.</p></details>
      </Card>}

      <Card className="overflow-hidden flowtwin-recent-card">
        <div className="border-b border-stone-100 p-5"><p className="eyebrow">Saved operational evidence</p><h2 className="font-display font-bold">Recent FlowTwin scenarios</h2><p className="mt-1 text-xs text-stone-500">Only FlowTwin scenario comparisons appear here. Synthetic Lab batches have their own results view in Synthetic Lab.</p></div>
        {flowTwinRecent.length ? <div className="divide-y divide-stone-100">{flowTwinRecent.map(item => <div key={item.simulation_id} className="flex flex-wrap items-center justify-between gap-3 p-4 flowtwin-recent-row"><div><div className="font-semibold">{item.name}</div><div className="mt-1 text-xs text-stone-500">#{item.simulation_id} · FlowTwin scenario · {item.model_version}</div></div><Button variant="secondary" onClick={() => openSavedScenario(item)}>View comparison</Button></div>)}</div> : <EmptyState title="No saved FlowTwin scenarios" message="Run a scenario above to save a baseline comparison. Synthetic Lab batches remain available in the Synthetic Lab tool."/>}
      </Card>
    </div>
  );
}
