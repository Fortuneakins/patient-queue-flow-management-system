import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState } from '../../../components/ui';

function serviceEvidenceLabel(detail, model) {
  if (detail?.service_model === 'TIER_HISTORY') {
    return `Tier-specific median · ${detail.tier_service_samples} completed visits`;
  }
  if (detail?.service_model === 'GLOBAL_HISTORY') {
    return `Pooled clinic median · ${model?.valid_service_samples || 0} completed visits`;
  }
  return '12-minute fallback assumption';
}

export default function LearningPanel({ token }) {
  const [fairness, setFairness] = useState(null);
  const [truth, setTruth] = useState(null);
  const [livePrediction, setLivePrediction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setRefreshing(true);
    const [fairnessResult, truthResult, predictionResult] = await Promise.allSettled([
      api.fairnessMetrics(token),
      api.forecastTruth(token, 20),
      api.predictions()
    ]);
    const errors = [];

    if (fairnessResult.status === 'fulfilled') setFairness(fairnessResult.value);
    else errors.push('Delay review could not be loaded: ' + (fairnessResult.reason?.message || 'request failed'));

    if (truthResult.status === 'fulfilled') setTruth(truthResult.value);
    else errors.push('Prediction truth history could not be loaded: ' + (truthResult.reason?.message || 'request failed'));

    if (predictionResult.status === 'fulfilled') setLivePrediction(predictionResult.value);
    else setLivePrediction({
      degraded: true,
      model: { method: 'UNAVAILABLE' },
      warnings: [predictionResult.reason?.message || 'Live prediction service is unavailable.']
    });

    setError(errors.join(' '));
    setRefreshing(false);
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
      const modelVersion = prediction?.model?.version || 'pqfms-analytics-unversioned';
      const saved = await api.recordFlowForecast(token, {
        horizon_minutes: 60,
        tier_estimates: estimates,
        model_version: modelVersion
      });
      setNotice('Forecast #' + saved.forecast_id + ' recorded with ' + saved.tracked_visits + ' waiting-visit sample(s).');
      await refresh();
    } catch (e) { setError(e.message || 'The forecast could not be recorded.'); }
    finally { setBusy(false); }
  }

  const predictionModel = livePrediction?.model;
  const tierEvidence = predictionModel?.tiers || {};

  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Live operational model</p>
            <h2 className="font-display text-lg font-bold">Observed-data wait estimates</h2>
            <p className="mt-1 max-w-3xl text-sm text-stone-500">
              Estimates combine the currently recorded priority-ordered queue with completed consultation durations from the last 90 days. The model reports which evidence source it used for each tier instead of presenting every number as equally reliable.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={livePrediction?.degraded ? 'orange' : predictionModel?.valid_service_samples >= 8 ? 'teal' : 'orange'}>
              {livePrediction?.degraded ? 'Unavailable' : predictionModel?.valid_service_samples >= 8 ? 'Observed timings available' : 'Fallback in use'}
            </Badge>
            <Button icon="refresh" variant="secondary" onClick={refresh} disabled={refreshing}>{refreshing ? 'Refreshing…' : 'Refresh model'}</Button>
          </div>
        </div>

        {livePrediction && !livePrediction.degraded ? (
          <>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map(tier => {
                const detail = tierEvidence[String(tier)] || {};
                const estimate = livePrediction[String(tier)];
                return (
                  <div key={tier} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-stone-700">Tier {tier}</span>
                      <span className="text-xs text-stone-500">{detail.tier_service_samples || 0} tier samples</span>
                    </div>
                    <p className="mt-2 font-display text-3xl font-bold tabular-nums">{estimate ?? '—'}<span className="ml-1 text-sm font-medium text-stone-500">min</span></p>
                    <p className="mt-2 text-xs font-semibold text-stone-700">{serviceEvidenceLabel(detail, predictionModel)}</p>
                    <p className="mt-1 text-xs text-stone-500">
                      Prior observed queue-to-call median: {detail.historical_wait_median_minutes === null || detail.historical_wait_median_minutes === undefined ? 'not available' : detail.historical_wait_median_minutes + ' min'}
                      {detail.historical_wait_samples ? ` · n=${detail.historical_wait_samples}` : ''}
                    </p>
                  </div>
                );
              })}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Service observations</span><p className="mt-1 font-semibold tabular-nums">{predictionModel?.valid_service_samples ?? 0}</p></div>
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Recorded waiting visits</span><p className="mt-1 font-semibold tabular-nums">{predictionModel?.waiting_visits ?? 0}</p></div>
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Active consultations</span><p className="mt-1 font-semibold tabular-nums">{predictionModel?.active_consultations ?? 0}</p></div>
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Staffing source</span><p className="mt-1 text-sm font-semibold">{predictionModel?.staffing_source === 'SHIFT_SCHEDULE' ? 'Verified shift schedule' : 'Configured fallback'}</p></div>
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Model version</span><p className="mt-1 break-all text-sm font-semibold">{predictionModel?.version || 'Not reported'}</p></div>
            </div>
            {livePrediction.warnings?.length > 0 && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <h3 className="text-sm font-semibold text-amber-950">Evidence and interpretation notes</h3>
                <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">
                  {livePrediction.warnings.map((warning, index) => <li key={index}>{warning}</li>)}
                </ul>
              </div>
            )}
          </>
        ) : (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900" role="status">
            {refreshing ? 'Loading current prediction evidence…' : 'Live estimates are unavailable. Queue operations continue normally; do not interpret missing estimates as zero-minute waits.'}
            {livePrediction?.warnings?.map((warning, index) => <p key={index} className="mt-1">{warning}</p>)}
          </div>
        )}
      </Card>

      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><h2 className="font-display text-lg font-bold">Prediction Truth Ledger</h2><p className="mt-1 max-w-3xl text-sm text-stone-500">Record the current wait estimate and later compare it with the observed remaining time from forecast capture to the first consultation call. Metrics are descriptive operational checks, not clinical validation.</p></div>
          <Button icon="chart" onClick={captureForecast} disabled={busy}>{busy ? 'Recording…' : 'Capture current forecast'}</Button>
        </div>
        <div className="mt-4 rounded-xl border border-teal-100 bg-teal-50 p-4 text-sm text-teal-950">A forecast only becomes evaluable after a tracked visit reaches its observed first call. Small samples, incomplete timestamps and changing conditions should be considered before drawing conclusions.</div>
        {truth?.forecasts?.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500"><tr><th className="p-3">Forecast</th><th className="p-3">Captured</th><th className="p-3">Tracked visits</th><th className="p-3">Observed</th><th className="p-3">Mean absolute error</th></tr></thead><tbody className="divide-y divide-stone-100">{truth.forecasts.map(item => <tr key={item.forecast_id}><td className="p-3 font-semibold">#{item.forecast_id}<div className="text-xs font-normal text-stone-500">{item.model_version}</div></td><td className="p-3 text-stone-600">{new Date(item.created_at).toLocaleString()}</td><td className="p-3">{item.tracked_samples}</td><td className="p-3">{item.observed_samples}</td><td className="p-3">{item.mean_absolute_error_minutes === null ? 'Pending observations' : item.mean_absolute_error_minutes + ' min'}</td></tr>)}</tbody></table></div> : <EmptyState title="No forecasts recorded" message="Capture a forecast to start building an evidence ledger. Predictions are not scored until actual call times are observed."/>}
      </Card>

      <Card className="overflow-hidden">
        <div className="border-b border-stone-100 p-5"><h2 className="font-display font-bold">Patient Fairness Sentinel</h2><p className="mt-1 text-xs text-stone-500">Operational delay review by clinician-assigned tier over the last 30 days, plus currently overdue waiting visits.</p></div>
        {fairness?.tiers?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[650px] text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500"><tr><th className="p-3">Tier</th><th className="p-3">Completed sample</th><th className="p-3">Mean queue-to-call wait</th><th className="p-3">P90 queue-to-call wait</th><th className="p-3">Over 60 min waiting</th><th className="p-3">Review</th></tr></thead><tbody className="divide-y divide-stone-100">{fairness.tiers.map(item => <tr key={item.tier}><td className="p-3 font-semibold">Tier {item.tier}</td><td className="p-3">{item.sample_size}</td><td className="p-3">{item.mean_wait_minutes === null ? '—' : item.mean_wait_minutes + ' min'}</td><td className="p-3">{item.p90_wait_minutes === null ? '—' : item.p90_wait_minutes + ' min'}</td><td className="p-3">{item.overdue_waiting}</td><td className="p-3"><Badge tone={item.review_required ? 'orange' : 'green'}>{item.review_required ? 'Review delay' : 'No threshold flag'}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No fairness metrics" message="Metrics become available after the database intelligence migration is applied."/>}
        {fairness?.interpretation && <p className="border-t border-stone-100 p-4 text-xs leading-relaxed text-stone-500">{fairness.interpretation} This view never changes clinical triage priority.</p>}
      </Card>
      {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
    </div>
  );
}
