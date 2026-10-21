import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState } from '../../../components/ui';

function formatErrorDuration(value) {
  const minutes = Number(value);
  if (!Number.isFinite(minutes) || minutes < 0) return 'Unavailable';
  if (minutes < 1440) return `${minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} min`;
  const rounded = Math.round(minutes);
  const days = Math.floor(rounded / 1440);
  const hours = Math.floor((rounded % 1440) / 60);
  const remainder = rounded % 60;
  return `${days} d ${hours} h ${remainder} min (${minutes.toLocaleString(undefined, { maximumFractionDigits: 1 })} min)`;
}

function describeTierServiceProfile(profile) {
  if (!profile) return 'Service-time evidence not reported';
  const minutes = Number(profile.service_minutes);
  const value = Number.isFinite(minutes) ? minutes + ' min' : 'duration unavailable';
  if (profile.service_model === 'TIER_HISTORY') {
    return `Tier-specific median ${value} · n=${profile.tier_service_samples} completed visit(s)`;
  }
  if (profile.service_model === 'POOLED_HISTORY') {
    return `Pooled clinic median ${value} · clinic n=${profile.pooled_service_samples}, tier n=${profile.tier_service_samples}`;
  }
  return `Default ${value} assumption · clinic n=${profile.pooled_service_samples || 0}`;
}

export default function LearningPanel({ token, onOpenTool }) {
  const [fairness, setFairness] = useState(null);
  const [truth, setTruth] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const forecasts = truth?.forecasts || [];
  const horizonBreakdownUnavailable = forecasts.some(item =>
    item.within_horizon_samples == null
    || item.out_of_horizon_samples == null
    || item.unclassified_out_of_horizon_samples == null
    || item.excluded_synthetic_observed_samples == null
    || item.excluded_synthetic_out_of_horizon_samples == null
    || item.operational_observed_samples == null
    || item.unclassified_observed_samples == null
    || item.excluded_synthetic_samples == null
    || item.operational_mean_absolute_error_minutes === undefined
    || item.within_horizon_mean_absolute_error_minutes === undefined
    || item.unclassified_mean_absolute_error_minutes === undefined
  );
  const outOfHorizonForecasts = forecasts.filter(item =>
    Number(item.out_of_horizon_samples) > 0
    || Number(item.unclassified_out_of_horizon_samples) > 0
    || Number(item.excluded_synthetic_out_of_horizon_samples) > 0
  );
  const operationalOutOfHorizonCount = outOfHorizonForecasts.reduce((total, item) => total + Number(item.out_of_horizon_samples || 0), 0);
  const unclassifiedOutOfHorizonCount = outOfHorizonForecasts.reduce((total, item) => total + Number(item.unclassified_out_of_horizon_samples || 0), 0);
  const excludedOutOfHorizonCount = outOfHorizonForecasts.reduce((total, item) => total + Number(item.excluded_synthetic_out_of_horizon_samples || 0), 0);
  const unclassifiedCompletedCount = (fairness?.tiers || []).reduce((total, item) => total + Number(item.unclassified_sample_size || 0), 0);
  const excludedCompletedCount = (fairness?.tiers || []).reduce((total, item) => total + Number(item.excluded_synthetic_sample_size || 0), 0);
  const unclassifiedWaitingCount = (fairness?.tiers || []).reduce((total, item) => total + Number(item.unclassified_waiting || 0), 0);
  const refresh = useCallback(async () => {
    try {
      const [fair, ledger, evidence] = await Promise.all([api.fairnessMetrics(token), api.forecastTruth(token, 20), api.predictionEvidence(token)]);
      setFairness(fair); setTruth(ledger); setPrediction(evidence);
    } catch (e) { setError(e.message); }
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  async function captureForecast() {
    setBusy(true); setError(''); setNotice('');
    try {
      // The API captures its current predictor output itself; browser-supplied
      // estimates or model-version strings are not accepted as ledger truth.
      const saved = await api.recordFlowForecast(token, { horizon_minutes: 60 });
      setNotice('Forecast #' + saved.forecast_id + ' recorded with ' + saved.tracked_visits + ' waiting-visit sample(s) using model ' + saved.model_version + '.');
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Evidence-aware operational estimate</p>
            <h2 className="font-display text-lg font-bold">Current queue workload projection</h2>
            <p className="mt-1 max-w-3xl text-sm text-stone-500">
              Estimates combine the recorded queue, the current roster and completed operational call-to-discharge timings. This is a workload proxy, not a guarantee for an individual patient, a diagnosis or a triage recommendation.
            </p>
          </div>
          <Badge tone={prediction?.degraded ? 'red' : prediction?.estimate_quality === 'OBSERVATION_BASED' ? 'teal' : 'orange'}>
            {prediction?.degraded ? 'Unavailable' : prediction?.estimate_quality === 'OBSERVATION_BASED' ? 'Observation-based' : prediction?.estimate_quality === 'LIMITED_OBSERVATIONS' ? 'Limited history' : 'Fallback assumption'}
          </Badge>
        </div>
        {prediction ? (
          <>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[1, 2, 3, 4].map(tier => {
                const raw = prediction[String(tier)];
                const profile = prediction.tier_service_profiles?.[String(tier)];
                const available = raw !== null && raw !== undefined && Number.isFinite(Number(raw));
                return <div key={tier} className="rounded-xl border border-stone-200 bg-stone-50 p-4">
                  <span className="text-sm font-semibold text-stone-700">Tier {tier}</span>
                  <p className="mt-2 font-display text-3xl font-bold tabular-nums">{available && !prediction.degraded ? Number(raw) : '—'}<span className="ml-1 text-sm font-medium text-stone-500">{available && !prediction.degraded ? 'min' : ''}</span></p>
                  <p className="mt-2 text-xs leading-relaxed text-stone-600">{describeTierServiceProfile(profile)}</p>
                </div>;
              })}
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Completed timing samples</span><p className="mt-1 font-semibold tabular-nums">{prediction.service_history_samples ?? 0}</p></div>
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Rostered doctors</span><p className="mt-1 font-semibold tabular-nums">{prediction.staffed_doctors ?? 'Unknown'}</p></div>
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Model version</span><p className="mt-1 break-all text-sm font-semibold">{prediction.model_version || 'Not reported'}</p></div>
              <div className="rounded-lg border border-stone-200 p-3"><span className="text-xs text-stone-500">Data provenance</span><p className="mt-1 text-sm font-semibold">{prediction.provenance_mode || 'Not reported'}</p></div>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-stone-600">{prediction.service_time_basis || 'Service-time basis not reported.'}</p>
            {Array.isArray(prediction.warnings) && prediction.warnings.length > 0 && <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-sm font-semibold text-amber-950">Model evidence warnings</p>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-amber-900">{prediction.warnings.map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>}
            {Array.isArray(prediction.limitations) && prediction.limitations.length > 0 && <ul className="mt-3 list-disc space-y-1 pl-5 text-xs leading-relaxed text-stone-500">{prediction.limitations.map((item, i) => <li key={i}>{item}</li>)}</ul>}
          </>
        ) : <EmptyState title="Prediction evidence unavailable" message="The protected model endpoint did not provide current evidence. Do not treat missing estimates as zero-minute waits."/>}
      </Card>

      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Prediction Truth Ledger</h2><p className="mt-1 max-w-3xl text-sm text-stone-500">Record the current wait estimate and later compare it with the observed remaining time from forecast capture to the first consultation call. Metrics are descriptive operational checks, not clinical validation.</p></div><Button icon="chart" onClick={captureForecast} disabled={busy}>{busy ? 'Recording…' : 'Capture current forecast'}</Button></div>
        <div className="prediction-truth-guidance mt-4 rounded-xl border p-4 text-sm">A forecast only becomes evaluable after a tracked visit reaches its observed first call. Small samples, incomplete timestamps and changing conditions should be considered before drawing conclusions.</div>
        {horizonBreakdownUnavailable && <div className="prediction-truth-warning mt-3 rounded-xl border p-4 text-sm" role="status">
          <p className="font-bold">Horizon breakdown unavailable</p>
          <p className="mt-1 leading-relaxed">The current API response does not include all horizon-aware fields. Missing counts are shown as unavailable, not zero. Refresh the backend service after updating the application, then refresh this panel before interpreting these metrics.</p>
        </div>}
        {!horizonBreakdownUnavailable && outOfHorizonForecasts.length > 0 && <div className="prediction-truth-warning mt-3 rounded-xl border p-4 text-sm" role="status">
          <p className="font-bold">Review out-of-horizon observations</p>
          <p className="mt-1 leading-relaxed">{operationalOutOfHorizonCount} classified operational observation(s), {unclassifiedOutOfHorizonCount} unclassified observation(s), and {excludedOutOfHorizonCount} excluded test/demo observation(s) exceeded the configured forecast horizon. All-sample error remains visible for auditability; only reviewed operational records contribute to operational and within-horizon accuracy. Test/demo outcomes remain visible for traceability but never count as operational accuracy.</p>
          {(unclassifiedOutOfHorizonCount > 0 || excludedOutOfHorizonCount > 0) && <div className="mt-3"><Button variant="secondary" onClick={() => onOpenTool?.('provenance')}>Review visit provenance</Button></div>}
        </div>}
        {truth?.forecasts?.length ? <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[1160px] text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500"><tr><th className="p-3">Forecast</th><th className="p-3">Captured</th><th className="p-3">Horizon</th><th className="p-3">Tracked / observed</th><th className="p-3">Provenance split</th><th className="p-3">Horizon outcomes</th><th className="p-3">All-sample MAE</th><th className="p-3">Operational MAE</th><th className="p-3">Within-horizon operational MAE</th></tr></thead><tbody className="divide-y divide-stone-100">{truth.forecasts.map(item => <tr key={item.forecast_id}><td className="p-3 font-semibold">#{item.forecast_id}<div className="text-xs font-normal text-stone-500">{item.model_version}</div></td><td className="p-3 text-stone-600">{new Date(item.created_at).toLocaleString()}</td><td className="p-3">{Number(item.horizon_minutes).toLocaleString()} min</td><td className="p-3">{item.tracked_samples} tracked<div className="text-xs text-stone-500">{item.observed_samples} observed</div></td><td className="p-3 text-xs leading-relaxed"><div>Operational: {item.operational_observed_samples}</div><div>Unclassified: {item.unclassified_observed_samples}</div><div>Excluded test/demo tracked: {item.excluded_synthetic_samples}</div><div>Excluded test/demo observed: {item.excluded_synthetic_observed_samples}</div></td><td className="p-3 text-xs leading-relaxed"><div>Within (operational): {item.within_horizon_samples}</div><div>Outside (operational): {item.out_of_horizon_samples}</div><div>Outside (unclassified): {item.unclassified_out_of_horizon_samples}</div><div>Outside (test/demo): {item.excluded_synthetic_out_of_horizon_samples}</div></td><td className="p-3"><span className="font-semibold">{item.mean_absolute_error_minutes == null ? 'Pending observations' : formatErrorDuration(item.mean_absolute_error_minutes)}</span><div className="text-xs text-stone-500">Includes all observed provenance states</div></td><td className="p-3">{item.operational_mean_absolute_error_minutes == null ? 'No classified operational samples' : <span className="font-semibold">{formatErrorDuration(item.operational_mean_absolute_error_minutes)}</span>}</td><td className="p-3">{item.within_horizon_mean_absolute_error_minutes === undefined ? 'Unavailable' : item.within_horizon_mean_absolute_error_minutes === null ? (Number(item.operational_observed_samples) > 0 ? 'No in-horizon operational samples' : 'No classified operational samples') : <span className="font-semibold">{formatErrorDuration(item.within_horizon_mean_absolute_error_minutes)}</span>}</td></tr>)}</tbody></table></div> : <EmptyState title="No forecasts recorded" message="Capture a forecast to start building an evidence ledger. Predictions are not scored until actual call times are observed."/>}
      </Card>
      <Card className="overflow-hidden">
        <div className="border-b border-stone-100 p-5"><h2 className="font-display font-bold">Patient Fairness Sentinel</h2><p className="mt-1 text-xs text-stone-500">Operational delay review by clinician-assigned tier over the last 30 days, plus currently overdue waiting visits.</p></div>
        {(unclassifiedCompletedCount > 0 || excludedCompletedCount > 0 || unclassifiedWaitingCount > 0) && <div className="border-b border-amber-200 bg-amber-50 p-4 text-sm text-amber-950">
          <p className="font-bold">Data provenance needs attention</p>
          <p className="mt-1 leading-relaxed">{unclassifiedCompletedCount} completed visit(s) remain unclassified and are excluded from historical mean/P90 calculations. {excludedCompletedCount} completed visit(s) are explicitly labelled synthetic/demo and excluded. {unclassifiedWaitingCount} active waiting visit(s) remain unclassified and are kept visible for delay review until an administrator verifies their provenance.</p>
          <div className="mt-3"><Button variant="secondary" onClick={() => onOpenTool?.('provenance')}>Review data provenance</Button></div>
        </div>}
        {fairness?.tiers?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[1000px] text-left text-sm"><thead className="border-b border-stone-200 text-xs uppercase tracking-wide text-stone-500"><tr><th className="p-3">Tier</th><th className="p-3">Operational sample</th><th className="p-3">Unclassified completed</th><th className="p-3">Excluded test/demo</th><th className="p-3">Mean operational wait</th><th className="p-3">P90 operational wait</th><th className="p-3">Over 60 min waiting</th><th className="p-3">Unclassified waiting</th><th className="p-3">Review</th></tr></thead><tbody className="divide-y divide-stone-100">{fairness.tiers.map(item => <tr key={item.tier}><td className="p-3 font-semibold">Tier {item.tier}</td><td className="p-3">{item.sample_size}</td><td className="p-3">{item.unclassified_sample_size}</td><td className="p-3">{item.excluded_synthetic_sample_size}</td><td className="p-3">{item.mean_wait_minutes == null ? '—' : item.mean_wait_minutes + ' min'}</td><td className="p-3">{item.p90_wait_minutes == null ? '—' : item.p90_wait_minutes + ' min'}</td><td className="p-3">{item.overdue_waiting}</td><td className="p-3">{item.unclassified_waiting}</td><td className="p-3"><Badge tone={item.review_required ? 'orange' : 'green'}>{item.review_required ? 'Review delay' : 'No threshold flag'}</Badge></td></tr>)}</tbody></table></div> : <EmptyState title="No fairness metrics" message="Metrics become available after the database intelligence migration is applied."/>}
        {fairness?.interpretation && <p className="border-t border-stone-100 p-4 text-xs leading-relaxed text-stone-500">{fairness.interpretation} This view never changes clinical triage priority.</p>}
      </Card>
      {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
    </div>
  );
}
