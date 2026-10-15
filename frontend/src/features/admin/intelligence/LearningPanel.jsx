import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState } from '../../../components/ui';

export default function LearningPanel({ token }) {
  const [fairness, setFairness] = useState(null);
  const [truth, setTruth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    try {
      const [fair, ledger] = await Promise.all([api.fairnessMetrics(token), api.forecastTruth(token, 20)]);
      setFairness(fair); setTruth(ledger);
    } catch (e) { setError(e.message); }
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  async function captureForecast() {
    setBusy(true); setError(''); setNotice('');
    try {
      const prediction = await api.predictions();
      if (prediction?.degraded) throw new Error('The analytics service is in degraded mode. No forecast was recorded because the estimate is not available.');
      const estimates = {};
      for (let tier = 1; tier <= 4; tier += 1) {
        const value = Number(prediction[String(tier)]);
        if (!Number.isFinite(value) || value < 0) throw new Error('The analytics service returned an invalid tier estimate.');
        estimates[tier] = value;
      }
      const saved = await api.recordFlowForecast(token, { horizon_minutes: 60, tier_estimates: estimates, model_version: 'pqfms-analytics-current' });
      setNotice('Forecast #' + saved.forecast_id + ' recorded with ' + saved.tracked_visits + ' waiting-visit sample(s).');
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Prediction Truth Ledger</h2><p className="mt-1 max-w-3xl text-sm text-stone-500">Record the current wait estimate and later compare it with the observed remaining time from forecast capture to the first consultation call. Metrics are descriptive operational checks, not clinical validation.</p></div><Button icon="chart" onClick={captureForecast} disabled={busy}>{busy ? 'Recording…' : 'Capture current forecast'}</Button></div>
        <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-950">A forecast only becomes evaluable after a tracked visit reaches its observed first call. Small samples, incomplete timestamps and changing conditions should be considered before drawing conclusions.</div>
        {truth?.forecasts?.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500"><tr><th className="p-3">Forecast</th><th className="p-3">Captured</th><th className="p-3">Tracked visits</th><th className="p-3">Observed</th><th className="p-3">Mean absolute error</th></tr></thead><tbody className="divide-y divide-stone-100">{truth.forecasts.map(item => <tr key={item.forecast_id}><td className="p-3 font-semibold">#{item.forecast_id}<div className="text-xs font-normal text-stone-500">{item.model_version}</div></td><td className="p-3 text-stone-600">{new Date(item.created_at).toLocaleString()}</td><td className="p-3">{item.tracked_samples}</td><td className="p-3">{item.observed_samples}</td><td className="p-3">{item.mean_absolute_error_minutes === null ? 'Pending observations' : item.mean_absolute_error_minutes + ' min'}</td></tr>)}</tbody></table></div> : <EmptyState title="No forecasts recorded" message="Capture a forecast to start building an evidence ledger. Predictions are not scored until actual call times are observed."/>}
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-stone-100 p-5"><h2 className="font-display font-bold">Patient Fairness Sentinel</h2><p className="mt-1 text-xs text-stone-500">Operational delay review by clinician-assigned tier over the last 30 days, plus currently overdue waiting visits.</p></div>
        {fairness?.tiers?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500"><tr><th className="p-3">Tier</th><th className="p-3">Completed sample</th><th className="p-3">Mean total elapsed</th><th className="p-3">P90 total elapsed</th><th className="p-3">Over 60 min waiting</th><th className="p-3">Review</th></tr></thead><tbody className="divide-y divide-stone-100">{fairness.tiers.map(item => <tr key={item.tier}><td className="p-3 font-semibold">Tier {item.tier}</td><td className="p-3">{item.sample_size}</td><td className="p-3">{item.mean_wait_minutes === null ? '—' : item.mean_wait_minutes + ' min'}</td><td className="p-3">{item.p90_wait_minutes === null ? '—' : item.p90_wait_minutes + ' min'}</td><td className="p-3">{item.overdue_waiting}</td><td className="p-3"><Badge tone={item.review_required ? 'orange' : 'green'}>{item.review_required ? 'Review delay' : 'No threshold flag'}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No fairness metrics" message="Metrics become available after the database intelligence migration is applied."/>}
        {fairness?.interpretation && <p className="border-t border-stone-100 p-4 text-xs leading-relaxed text-stone-500">{fairness.interpretation} This view never changes clinical triage priority.</p>}
      </Card>
      {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
    </div>
  );
}
