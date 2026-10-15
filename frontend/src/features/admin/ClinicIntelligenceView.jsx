import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../services/api';
import { enqueueOperationalObservation, listOperationalOutbox, removeOperationalObservation } from '../../services/continuityOutbox';
import { Badge, Button, Card, EmptyState, Field, inputClass, Spinner } from '../../components/ui';

const SECTIONS = [
  ['overview', 'Overview'], ['flow', 'FlowTwin'], ['pathways', 'CareGraph'],
  ['resources', 'Resources'], ['referrals', 'Referral Relay'], ['access', 'Access Bridge'],
  ['continuity', 'Continuity']
];
const INITIAL = { summary: null, events: [], resources: [], queue: [], pathways: [], instances: [], fairness: null, referrals: [], forecasts: [], simulations: [], receipts: [] };

function messageFor(error) { return error?.data?.error || error?.message || 'The request could not be completed.'; }
function timeLabel(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}
function minutes(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number.toFixed(1) + ' min' : '—';
}
function Stat({ label, value, help }) {
  return <div className="rounded-2xl border border-stone-200 bg-white p-4"><p className="text-xs font-semibold uppercase tracking-wide text-stone-500">{label}</p><p className="mt-2 font-display text-2xl font-bold text-stone-900">{value}</p>{help && <p className="mt-1 text-xs text-stone-500">{help}</p>}</div>;
}
function SectionTitle({ title, description, action }) {
  return <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-xl font-bold text-stone-900">{title}</h2><p className="mt-1 max-w-3xl text-sm text-stone-500">{description}</p></div>{action}</div>;
}
function StatusBadge({ status }) {
  const tones = { AVAILABLE: 'green', COMPLETED: 'green', SENT: 'teal', ACKNOWLEDGED: 'teal', IN_PROGRESS: 'teal', LIMITED: 'yellow', OPEN: 'orange', BLOCKED: 'red', UNAVAILABLE: 'red', MAINTENANCE: 'orange', FAILED: 'red', SKIPPED: 'neutral', CANCELLED: 'neutral' };
  return <Badge tone={tones[status] || 'neutral'}>{String(status || 'UNKNOWN').replaceAll('_', ' ')}</Badge>;
}

export default function ClinicIntelligenceView({ token }) {
  const [section, setSection] = useState('overview');
  const [data, setData] = useState(INITIAL);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [flowForm, setFlowForm] = useState({ additional_arrivals: 6, horizon_minutes: 60, station_delta: 0, outage_minutes: 0 });
  const [flowResult, setFlowResult] = useState(null);
  const [labResult, setLabResult] = useState(null);
  const [resourceForm, setResourceForm] = useState({ resource_name: '', resource_type: 'STATION', status: 'AVAILABLE', capacity: 1, service_tags: 'consultation', is_critical: false });
  const [pathwayForm, setPathwayForm] = useState({ queue_id: '', template_id: '' });
  const [referralForm, setReferralForm] = useState({ queue_id: '', target_facility: '', target_service: '', reason: '' });
  const [patientId, setPatientId] = useState('');
  const [contactPreference, setContactPreference] = useState(null);
  const [consentForm, setConsentForm] = useState({ opted_in: false, consent_source: 'RECEPTION' });
  const [estimatedWait, setEstimatedWait] = useState(30);
  const [outbox, setOutbox] = useState([]);
  const [incidentCode, setIncidentCode] = useState('NETWORK_UNAVAILABLE');
  const [observedResource, setObservedResource] = useState({ resource_id: '', observed_status: 'UNAVAILABLE' });
  const [forecastActuals, setForecastActuals] = useState({});

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      const results = await Promise.all([
        api.intelligenceSummary(token),
        api.intelligenceEvents(token, 40),
        api.intelligenceResources(token),
        api.intelligenceQueue(token),
        api.carePathways(token),
        api.pathwayInstances(token),
        api.intelligenceFairness(token),
        api.intelligenceReferrals(token),
        api.intelligenceForecasts(token),
        api.intelligenceSimulations(token),
        api.continuityReceipts(token),
        listOperationalOutbox().catch(() => [])
      ]);
      setData({ summary: results[0], events: results[1], resources: results[2], queue: results[3], pathways: results[4], instances: results[5], fairness: results[6], referrals: results[7], forecasts: results[8], simulations: results[9], receipts: results[10] });
      setOutbox(results[11]);
      setError('');
    } catch (loadError) {
      setError(messageFor(loadError));
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [token]);

  useEffect(() => { loadData(); }, [loadData]);

  const execute = async (operation, successMessage) => {
    setWorking(true);
    setError('');
    setNotice('');
    try {
      const result = await operation();
      setNotice(typeof successMessage === 'function' ? successMessage(result) : successMessage);
      await loadData(true);
    } catch (operationError) {
      setError(messageFor(operationError));
    } finally {
      setWorking(false);
    }
  };

  const queueOptions = useMemo(() => data.queue.map(row => ({
    value: String(row.queue_id),
    label: row.ticket_number + ' · ' + row.status + ' · tier ' + (row.priority_level || 'unassigned')
  })), [data.queue]);

  const createResource = event => {
    event.preventDefault();
    const tags = resourceForm.service_tags.split(',').map(value => value.trim()).filter(Boolean);
    execute(async () => {
      await api.createIntelligenceResource(token, { ...resourceForm, capacity: Number(resourceForm.capacity), service_tags: tags });
      setResourceForm({ resource_name: '', resource_type: 'STATION', status: 'AVAILABLE', capacity: 1, service_tags: 'consultation', is_critical: false });
    }, 'Resource added to the operational inventory.');
  };

  const startPathway = event => {
    event.preventDefault();
    execute(async () => {
      await api.openPathway(token, { queue_id: Number(pathwayForm.queue_id), template_id: Number(pathwayForm.template_id) });
    }, 'Care pathway opened. Required stages must be completed in order.');
  };

  const createReferral = event => {
    event.preventDefault();
    execute(async () => {
      await api.createIntelligenceReferral(token, { ...referralForm, queue_id: Number(referralForm.queue_id) });
      setReferralForm({ queue_id: '', target_facility: '', target_service: '', reason: '' });
    }, 'Referral created. It remains open until staff progress its status.');
  };

  const lookupPreference = async event => {
    event.preventDefault();
    setWorking(true);
    setError('');
    setNotice('');
    setContactPreference(null);
    try {
      const result = await api.contactPreference(token, Number(patientId));
      setContactPreference(result);
      setConsentForm({ opted_in: Boolean(result.opted_in), consent_source: result.consent_source || 'RECEPTION' });
    } catch (lookupError) {
      setError(messageFor(lookupError));
    } finally {
      setWorking(false);
    }
  };

  const addOfflineIncident = () => execute(async () => {
    await enqueueOperationalObservation('OPERATIONAL_INCIDENT_RECORDED', { incident_code: incidentCode });
    setOutbox(await listOperationalOutbox());
  }, 'Operational observation saved locally. Sync it when the server is reachable.');

  const addResourceObservation = () => execute(async () => {
    await enqueueOperationalObservation('RESOURCE_STATUS_OBSERVED', { resource_id: Number(observedResource.resource_id), observed_status: observedResource.observed_status });
    setOutbox(await listOperationalOutbox());
  }, 'Resource observation saved locally for later sync.');

  const syncOutbox = () => execute(async () => {
    const pending = await listOperationalOutbox();
    let synced = 0;
    let rejected = 0;
    for (const item of pending) {
      try {
        await api.syncContinuityObservation(token, { client_event_id: item.client_event_id, event_type: item.event_type, payload: item.payload });
        await removeOperationalObservation(item.client_event_id);
        synced += 1;
      } catch {
        rejected += 1;
      }
    }
    setOutbox(await listOperationalOutbox());
    if (rejected) throw new Error(String(synced) + ' observation(s) synced; ' + String(rejected) + ' remain pending. Check the connection and retry.');
  }, 'Pending operational observations synced.');

  const resolvedForecasts = data.forecasts.filter(item => item.actual_wait_minutes !== null && item.actual_wait_minutes !== undefined);
  const meanAbsoluteError = resolvedForecasts.length
    ? resolvedForecasts.reduce((sum, item) => sum + Math.abs(Number(item.actual_wait_minutes) - Number(item.predicted_p50_minutes)), 0) / resolvedForecasts.length
    : null;

  if (loading) return <div className="flex items-center gap-3 p-8 text-sm text-stone-500"><Spinner /> Loading clinic intelligence…</div>;

  return <div className="space-y-6">
    <div className="rounded-2xl border border-teal-100 bg-gradient-to-r from-teal-50 to-emerald-50 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[11px] font-bold uppercase tracking-[0.2em] text-teal-800">PQFMS Intelligence Suite</p><h2 className="mt-1 font-display text-2xl font-bold text-stone-900">Clinic operations, explained</h2><p className="mt-2 max-w-3xl text-sm text-stone-600">Observe service flow, model bottlenecks and record operational outcomes. Simulations are planning aids, not clinical advice or validated promises of waiting time.</p></div>
        <Button variant="secondary" icon="refresh" disabled={working} onClick={() => loadData()}>Refresh data</Button>
      </div>
    </div>

    {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}
    {notice && <div role="status" className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">{notice}</div>}

    <nav aria-label="Clinic intelligence sections" className="flex flex-wrap gap-2">
      {SECTIONS.map(([key, label]) => <button key={key} type="button" onClick={() => setSection(key)} aria-current={section === key ? 'page' : undefined} className={'rounded-xl border px-3 py-2 text-sm font-semibold transition ' + (section === key ? 'border-teal-800 bg-teal-800 text-white' : 'border-stone-200 bg-white text-stone-700 hover:border-teal-300')}>{label}</button>)}
    </nav>

    {section === 'overview' && <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat label="Waiting now" value={data.summary?.context?.waiting ?? 0} help="Active waiting queue" />
        <Stat label="In consultation" value={data.summary?.context?.in_consultation ?? 0} help="Currently being seen" />
        <Stat label="On-duty doctors" value={data.summary?.context?.doctors_on_duty ?? 0} help="From current shifts" />
        <Stat label="Operational events · 24h" value={data.summary?.operational_events_24h ?? 0} help="Non-identifying event history" />
      </div>
      {data.summary?.context?.service_duration_source !== 'observed_median_last_90_days' && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Model-data limitation:</strong> the simulator is using an illustrative 15-minute service-duration fallback because there are not yet enough recent completed consultations for a measured median. Do not treat its output as a calibrated forecast.</div>}
      {!data.summary?.context?.staffing_schedule_found && <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Staffing schedule not detected:</strong> capacity scenarios are hypothetical. Confirm actual staffing before acting on any result.</div>}
      <div className="grid gap-4 xl:grid-cols-2">
        <Card className="p-5"><SectionTitle title="Resource availability" description="Registered operational resources and their state."/><div className="mt-4 space-y-3">{data.resources.map(resource => <div key={resource.resource_id} className="flex flex-wrap items-center justify-between gap-2 border-b border-stone-100 pb-3 last:border-0"><div><p className="font-semibold text-stone-800">{resource.resource_name}</p><p className="text-xs text-stone-500">{resource.resource_type} · capacity {resource.capacity}</p></div><StatusBadge status={resource.status}/></div>)}{!data.resources.length && <EmptyState title="No resources" message="Add the clinic’s service resources in Resource twin."/>}</div></Card>
        <Card className="p-5"><SectionTitle title="Delay signals by priority" description="Group-level waiting-time dispersion only. This does not determine clinical urgency."/><div className="mt-4 space-y-3">{(data.fairness?.groups || []).map(group => <div key={group.priority_group} className="rounded-xl border border-stone-100 p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm">Tier {group.priority_group}</strong>{group.operational_delay_signal ? <Badge tone="orange">Review delay spread</Badge> : <Badge tone="neutral">No signal</Badge>}</div><div className="mt-2 grid grid-cols-3 gap-2 text-xs"><span>Waiting<strong className="block text-base text-stone-800">{group.waiting_count}</strong></span><span>Median<strong className="block text-base text-stone-800">{minutes(group.median_wait_minutes)}</strong></span><span>P90<strong className="block text-base text-stone-800">{minutes(group.p90_wait_minutes)}</strong></span></div></div>)}<p className="text-xs text-stone-500">{data.fairness?.note}</p></div></Card>
      </div>
      <Card className="p-5"><SectionTitle title="Flight Recorder" description="Recent events omit patient names, identification numbers, symptoms and consultation notes."/><div className="mt-4 divide-y divide-stone-100">{data.events.slice(0, 12).map(item => <div key={item.event_id} className="flex flex-wrap items-start justify-between gap-2 py-3"><div><p className="font-semibold text-stone-800">{item.event_type.replaceAll('_', ' ')}</p><p className="text-xs text-stone-500">{item.entity_type} · {item.entity_id}{item.actor_staff_id ? ' · staff #' + item.actor_staff_id : ''}</p></div><span className="text-xs text-stone-500">{timeLabel(item.event_at)}</span></div>)}{!data.events.length && <EmptyState title="Event history is ready" message="Queue activity will be recorded as new visits and lifecycle changes occur."/>}</div></Card>
    </>}

    {section === 'flow' && <>
      <SectionTitle title="FlowTwin scenario laboratory" description="Compare baseline queue capacity with a hypothetical plan. It does not assign triage, alter the live queue or approve staffing actions."/>
      <Card className="p-5"><form className="grid gap-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={event => { event.preventDefault(); execute(async () => { setFlowResult(await api.runFlowSimulation(token, Object.fromEntries(Object.entries(flowForm).map(([key, value]) => [key, Number(value)])))); }, 'FlowTwin scenario completed and recorded.'); }}>
        <Field label="Additional arrivals" hint="Hypothetical arrivals in the horizon"><input className={inputClass} type="number" min="0" max="500" required value={flowForm.additional_arrivals} onChange={e => setFlowForm(p => ({ ...p, additional_arrivals: e.target.value }))}/></Field>
        <Field label="Horizon (minutes)"><select className={inputClass} value={flowForm.horizon_minutes} onChange={e => setFlowForm(p => ({ ...p, horizon_minutes: e.target.value }))}><option value="30">30 minutes</option><option value="60">60 minutes</option><option value="120">120 minutes</option><option value="240">240 minutes</option></select></Field>
        <Field label="Station change" hint="Negative reduces modelled capacity"><input className={inputClass} type="number" min="-20" max="20" value={flowForm.station_delta} onChange={e => setFlowForm(p => ({ ...p, station_delta: e.target.value }))}/></Field>
        <Field label="Initial outage (minutes)"><input className={inputClass} type="number" min="0" max="240" value={flowForm.outage_minutes} onChange={e => setFlowForm(p => ({ ...p, outage_minutes: e.target.value }))}/></Field>
        <div className="md:col-span-2 xl:col-span-4"><Button type="submit" disabled={working}>Run scenario comparison</Button></div>
      </form></Card>
      {flowResult && <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-display text-lg font-bold">Scenario #{flowResult.simulation_id}</h3><StatusBadge status="COMPLETED"/></div><div className="mt-4 grid gap-3 md:grid-cols-3"><Stat label="P50 wait change" value={minutes(flowResult.impact.p50_wait_change_minutes)} help="Negative indicates shorter modelled wait"/><Stat label="P90 wait change" value={minutes(flowResult.impact.p90_wait_change_minutes)} help="Tail-wait estimate change"/><Stat label="Completion change" value={flowResult.impact.completion_change} help="Average simulated completions by horizon"/></div><div className="mt-4 grid gap-4 md:grid-cols-2"><div className="rounded-xl bg-stone-50 p-4"><h4 className="font-bold">Baseline</h4><p className="mt-2 text-sm">P50 {minutes(flowResult.baseline.predicted_wait_p50_minutes)}</p><p className="text-sm">P90 {minutes(flowResult.baseline.predicted_wait_p90_minutes)}</p><p className="text-sm">Completed by horizon {flowResult.baseline.average_completed_by_horizon}</p></div><div className="rounded-xl bg-teal-50 p-4"><h4 className="font-bold">Proposed</h4><p className="mt-2 text-sm">P50 {minutes(flowResult.proposed.predicted_wait_p50_minutes)}</p><p className="text-sm">P90 {minutes(flowResult.proposed.predicted_wait_p90_minutes)}</p><p className="text-sm">Completed by horizon {flowResult.proposed.average_completed_by_horizon}</p></div></div>{flowResult.assumptions?.feasibility_warnings?.length > 0 && <div role="alert" className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"><strong>Plan feasibility warnings</strong><ul className="mt-2 list-disc space-y-1 pl-5">{flowResult.assumptions.feasibility_warnings.map(warning => <li key={warning}>{warning}</li>)}</ul></div>}<ul className="mt-4 space-y-2 text-xs text-stone-600">{Object.entries(flowResult.assumptions || {}).filter(([key]) => key !== 'feasibility_warnings').map(([key, value]) => <li key={key}><strong>{key.replaceAll('_', ' ')}:</strong> {typeof value === 'object' ? JSON.stringify(value) : String(value ?? 'not available')}</li>)}</ul></Card>}
      <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-display text-lg font-bold">Synthetic Clinic Laboratory</h3><p className="text-sm text-stone-500">Repeatable synthetic operating days, not real patient data.</p></div><Button disabled={working} onClick={() => execute(async () => { setLabResult(await api.runSyntheticLab(token, { cases: 100, seed: 20261015 })); }, 'Synthetic scenario batch completed.')}>Run 100 synthetic cases</Button></div>{labResult && <div className="mt-4 grid gap-3 md:grid-cols-3"><Stat label="Scenarios" value={labResult.cases} help="Generated, synthetic only"/><Stat label="Median scenario P90" value={minutes(labResult.p50_p90_wait_minutes)}/><Stat label="Backlog cases" value={String(labResult.backlog_case_rate_percent) + '%'} help="Of generated cases"/></div>}</Card>
      <Card className="p-5"><SectionTitle title="Prediction Truth Ledger" description="Record a forecast and a comparable observed result. It does not automatically claim model accuracy." action={<Button disabled={working} onClick={() => execute(async () => { await api.captureForecast(token); }, 'Forecast captured with its assumptions.')}>Capture 60-minute forecast</Button>}/>{meanAbsoluteError !== null && <p className="mt-3 text-sm text-stone-600">Mean absolute error among resolved records: <strong>{meanAbsoluteError.toFixed(1)} minutes</strong> ({resolvedForecasts.length} records). This is meaningful only when observed outcomes represent the forecast cohort consistently.</p>}<div className="mt-4 space-y-3">{data.forecasts.map(forecast => <div key={forecast.forecast_id} className="rounded-xl border border-stone-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><strong>Forecast #{forecast.forecast_id}</strong><p className="text-xs text-stone-500">{timeLabel(forecast.created_at)} · {forecast.model_version} · n={forecast.sample_size}</p></div>{forecast.actual_wait_minutes === null || forecast.actual_wait_minutes === undefined ? <Badge tone="orange">Outcome pending</Badge> : <Badge tone="green">Outcome recorded</Badge>}</div><div className="mt-2 flex flex-wrap gap-4 text-sm"><span>P50 <strong>{minutes(forecast.predicted_p50_minutes)}</strong></span><span>P90 <strong>{minutes(forecast.predicted_p90_minutes)}</strong></span>{forecast.actual_wait_minutes !== null && forecast.actual_wait_minutes !== undefined && <span>Actual <strong>{minutes(forecast.actual_wait_minutes)}</strong></span>}</div>{(forecast.actual_wait_minutes === null || forecast.actual_wait_minutes === undefined) && <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={event => { event.preventDefault(); execute(async () => { await api.resolveForecast(token, forecast.forecast_id, { actual_wait_minutes: Number(forecastActuals[forecast.forecast_id]) }); }, 'Observed outcome recorded.'); }}><Field label="Comparable observed wait (minutes)"><input className={inputClass} type="number" min="0" max="1440" required value={forecastActuals[forecast.forecast_id] ?? ''} onChange={e => setForecastActuals(p => ({ ...p, [forecast.forecast_id]: e.target.value }))}/></Field><Button type="submit" disabled={working || forecastActuals[forecast.forecast_id] === undefined || forecastActuals[forecast.forecast_id] === ''}>Record outcome</Button></form>}</div>)}{!data.forecasts.length && <EmptyState title="No forecasts captured yet" message="Capture a forecast and record a comparable observed outcome when available."/>}</div></Card>
      <Card className="p-5"><SectionTitle title="Saved simulations" description="Previous scenario results and recorded assumptions."/><div className="mt-3 space-y-2">{data.simulations.map(item => <div key={item.simulation_id} className="flex flex-wrap justify-between gap-2 rounded-xl border border-stone-100 p-3"><div><strong className="text-sm">{item.title}</strong><p className="text-xs text-stone-500">{item.simulation_type} · {timeLabel(item.created_at)}</p></div><span className="text-xs text-stone-500">#{item.simulation_id}</span></div>)}{!data.simulations.length && <p className="text-sm text-stone-500">No simulations saved yet.</p>}</div></Card>
    </>}

    {section === 'pathways' && <>
      <SectionTitle title="CareGraph pathway tracking" description="Coordinate operational stages for active visits. These stages do not prescribe or approve clinical treatment."/>
      <Card className="p-5"><form className="grid gap-4 md:grid-cols-3" onSubmit={startPathway}><Field label="Active visit" required><select className={inputClass} required value={pathwayForm.queue_id} onChange={e => setPathwayForm(p => ({ ...p, queue_id: e.target.value }))}><option value="">Select ticket</option>{queueOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Field label="Workflow template" required><select className={inputClass} required value={pathwayForm.template_id} onChange={e => setPathwayForm(p => ({ ...p, template_id: e.target.value }))}><option value="">Select template</option>{data.pathways.map(item => <option key={item.template_id} value={item.template_id}>{item.name}</option>)}</select></Field><div className="flex items-end"><Button type="submit" disabled={working || !pathwayForm.queue_id || !pathwayForm.template_id}>Start pathway</Button></div></form></Card>
      <div className="space-y-4">{data.instances.map(instance => <Card key={instance.instance_id} className="p-5"><div className="flex flex-wrap items-start justify-between gap-2"><div><h3 className="font-bold">{instance.ticket_number} · {instance.template_name}</h3><p className="text-xs text-stone-500">Opened {timeLabel(instance.created_at)}</p></div><StatusBadge status={instance.status}/></div><div className="mt-4 grid gap-3 md:grid-cols-3">{instance.stages.map(stage => <div key={stage.instance_stage_id} className="rounded-xl border border-stone-200 p-3"><p className="text-xs text-stone-500">Stage {stage.stage_order}</p><p className="mt-1 font-semibold">{stage.stage_name}</p><p className="mt-1 text-xs text-stone-500">Requires: {(stage.required_resource_tags || []).join(', ') || 'no tagged resource'}</p><div className="mt-2"><StatusBadge status={stage.status}/></div>{instance.status === 'IN_PROGRESS' && <div className="mt-3">{(stage.status === 'PENDING' || stage.status === 'BLOCKED') ? <Button className="w-full" variant="secondary" disabled={working} onClick={() => execute(async () => api.updatePathwayStage(token, instance.instance_id, stage.instance_stage_id, { status: 'IN_PROGRESS' }), result => result.status === 'BLOCKED' ? result.blocked_reason || 'Stage blocked by unavailable resources.' : 'Stage started.')}>{stage.status === 'BLOCKED' ? 'Retry stage' : 'Start stage'}</Button> : stage.status === 'IN_PROGRESS' ? <Button className="w-full" disabled={working} onClick={() => execute(async () => { await api.updatePathwayStage(token, instance.instance_id, stage.instance_stage_id, { status: 'COMPLETED' }); }, 'Stage completion recorded.')}>Complete stage</Button> : <p className="text-xs text-emerald-700">Completed {timeLabel(stage.completed_at)}</p>}</div>}</div>)}</div></Card>)}{!data.instances.length && <EmptyState title="No tracked pathways" message="Select an active visit and a template to begin stage tracking."/>}</div>
    </>}

    {section === 'resources' && <>
      <SectionTitle title="Resource Dependency Twin" description="Maintain capacity for rooms, stations, equipment and supplies. Resource state informs planning but does not authorise clinical staffing decisions."/>
      <Card className="p-5"><form className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" onSubmit={createResource}><Field label="Resource name" required><input className={inputClass} required maxLength="100" value={resourceForm.resource_name} onChange={e => setResourceForm(p => ({ ...p, resource_name: e.target.value }))}/></Field><Field label="Resource type"><select className={inputClass} value={resourceForm.resource_type} onChange={e => setResourceForm(p => ({ ...p, resource_type: e.target.value }))}><option>STATION</option><option>ROOM</option><option>EQUIPMENT</option><option>SUPPLY</option></select></Field><Field label="Initial status"><select className={inputClass} value={resourceForm.status} onChange={e => setResourceForm(p => ({ ...p, status: e.target.value }))}><option>AVAILABLE</option><option>LIMITED</option><option>UNAVAILABLE</option><option>MAINTENANCE</option></select></Field><Field label="Capacity"><input className={inputClass} type="number" min="1" max="500" value={resourceForm.capacity} onChange={e => setResourceForm(p => ({ ...p, capacity: e.target.value }))}/></Field><Field label="Service tags" hint="Comma-separated, e.g. consultation, triage"><input className={inputClass} maxLength="300" value={resourceForm.service_tags} onChange={e => setResourceForm(p => ({ ...p, service_tags: e.target.value }))}/></Field><div className="flex items-center gap-2 pt-5"><input id="resource-critical" type="checkbox" checked={resourceForm.is_critical} onChange={e => setResourceForm(p => ({ ...p, is_critical: e.target.checked }))}/><label htmlFor="resource-critical" className="text-sm">Critical resource</label></div><div className="md:col-span-2 xl:col-span-3"><Button type="submit" disabled={working}>Add resource</Button></div></form></Card>
      <Card className="overflow-hidden"><div className="divide-y divide-stone-100">{data.resources.map(resource => <div key={resource.resource_id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-[180px]"><p className="font-semibold">{resource.resource_name} {resource.is_critical && <span className="text-xs text-orange-700">· Critical</span>}</p><p className="text-xs text-stone-500">{resource.resource_type} · capacity {resource.capacity} · tags {resource.service_tags.join(', ') || 'none'}</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge status={resource.status}/><select aria-label={'Update ' + resource.resource_name + ' status'} className="rounded-lg border border-stone-200 bg-white px-2 py-2 text-sm" value={resource.status} onChange={e => execute(async () => { await api.updateIntelligenceResource(token, resource.resource_id, { status: e.target.value }); }, 'Resource status updated.')}><option>AVAILABLE</option><option>LIMITED</option><option>UNAVAILABLE</option><option>MAINTENANCE</option></select></div></div>)}</div></Card>
    </>}

    {section === 'referrals' && <>
      <SectionTitle title="Referral Relay" description="Track a referral hand-off. This local workflow does not transmit to an external facility unless a separate integration is configured."/>
      <Card className="p-5"><form className="grid gap-4 md:grid-cols-2" onSubmit={createReferral}><Field label="Source visit" required><select className={inputClass} required value={referralForm.queue_id} onChange={e => setReferralForm(p => ({ ...p, queue_id: e.target.value }))}><option value="">Select ticket</option>{queueOptions.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select></Field><Field label="Target facility" required><input className={inputClass} required maxLength="140" value={referralForm.target_facility} onChange={e => setReferralForm(p => ({ ...p, target_facility: e.target.value }))}/></Field><Field label="Target service" required><input className={inputClass} required maxLength="120" value={referralForm.target_service} onChange={e => setReferralForm(p => ({ ...p, target_service: e.target.value }))}/></Field><Field label="Operational referral reason" required hint="Do not paste full consultation notes."><input className={inputClass} required maxLength="500" value={referralForm.reason} onChange={e => setReferralForm(p => ({ ...p, reason: e.target.value }))}/></Field><div className="md:col-span-2"><Button type="submit" disabled={working || !referralForm.queue_id}>Create referral</Button></div></form></Card>
      <Card className="overflow-hidden"><div className="divide-y divide-stone-100">{data.referrals.map(referral => { const next = ({ OPEN: 'SENT', SENT: 'ACKNOWLEDGED', ACKNOWLEDGED: 'COMPLETED' })[referral.status]; return <div key={referral.referral_id} className="p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-bold">{referral.reference_code} · {referral.target_facility}</p><p className="text-sm text-stone-600">{referral.target_service} · {referral.ticket_number || 'Source ticket unavailable'}</p><p className="mt-1 text-xs text-stone-500">{referral.reason}</p></div><StatusBadge status={referral.status}/></div><div className="mt-3 flex flex-wrap gap-2">{next && <Button variant="secondary" disabled={working} onClick={() => execute(async () => { await api.updateIntelligenceReferral(token, referral.referral_id, { status: next }); }, 'Referral moved to ' + next.toLowerCase() + '.')}>Mark {next.toLowerCase()}</Button>}{!['COMPLETED', 'CANCELLED'].includes(referral.status) && <Button variant="ghost" disabled={working} onClick={() => execute(async () => { await api.updateIntelligenceReferral(token, referral.referral_id, { status: 'CANCELLED' }); }, 'Referral cancelled.')}>Cancel</Button>}</div></div>; })}{!data.referrals.length && <div className="p-4"><EmptyState title="No referrals recorded" message="Create a referral from an existing visit to track its hand-off."/></div>}</div></Card>
    </>}

    {section === 'access' && <>
      <SectionTitle title="Access Bridge" description="Consent-gated wait-estimate SMS. No health details are sent in this templated message."/>
      <Card className="p-5"><form className="flex flex-wrap items-end gap-3" onSubmit={lookupPreference}><Field label="Internal patient record ID" required hint="Use the ID from the authorised directory, not an identification number."><input className={inputClass} required type="number" min="1" value={patientId} onChange={e => { setPatientId(e.target.value); setContactPreference(null); }}/></Field><Button type="submit" disabled={working || !patientId}>Load contact consent</Button></form></Card>
      {contactPreference && <Card className="p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="font-bold">Patient: {contactPreference.first_name}</h3><p className="text-sm text-stone-500">Contact {contactPreference.masked_contact || 'not recorded'} · SMS</p></div><StatusBadge status={contactPreference.opted_in ? 'AVAILABLE' : 'UNAVAILABLE'}/></div><form className="mt-4 space-y-4" onSubmit={event => { event.preventDefault(); execute(async () => { const saved = await api.setContactPreference(token, Number(patientId), consentForm); setContactPreference(current => ({ ...current, ...saved })); }, consentForm.opted_in ? 'Consent recorded.' : 'SMS consent withdrawn.'); }}><div className="flex items-start gap-3 rounded-xl border border-stone-200 p-3"><input id="sms-opt-in" type="checkbox" checked={consentForm.opted_in} onChange={e => setConsentForm(p => ({ ...p, opted_in: e.target.checked }))}/><label htmlFor="sms-opt-in" className="text-sm">The patient has explicitly agreed to queue updates by SMS, or consent is being withdrawn if unchecked.</label></div><Field label="Consent recorded through"><select className={inputClass} value={consentForm.consent_source} onChange={e => setConsentForm(p => ({ ...p, consent_source: e.target.value }))}><option value="RECEPTION">Reception</option><option value="KIOSK">Kiosk</option><option value="PAPER_FORM">Paper form</option><option value="PATIENT_REQUEST">Patient request</option></select></Field><Button type="submit" disabled={working}>Save consent preference</Button></form><div className="mt-5 border-t border-stone-100 pt-4"><form className="flex flex-wrap items-end gap-3" onSubmit={event => { event.preventDefault(); execute(async () => { await api.sendWaitEstimate(token, Number(patientId), { estimated_wait_minutes: Number(estimatedWait) }); }, 'Notification request processed; review the recorded delivery status.'); }}><Field label="Estimated wait (minutes)"><input className={inputClass} type="number" min="0" max="1440" required value={estimatedWait} onChange={e => setEstimatedWait(e.target.value)}/></Field><Button type="submit" disabled={working || !contactPreference.opted_in}>Send consented estimate</Button></form><p className="mt-2 text-xs text-stone-500">SMS must be enabled and configured. Disabled or unavailable delivery is recorded as skipped or failed, not reported as success.</p></div></Card>}
    </>}

    {section === 'continuity' && <>
      <SectionTitle title="Continuity Mode" description="Store non-clinical operational observations in this browser, then sync them when authenticated connectivity returns. Clinical actions remain online-only."/>
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>Safety boundary:</strong> never store patient identifiers, check-ins, triage changes, clinical notes or treatment decisions in this outbox.</div>
      <Card className="p-5"><Field label="Operational incident"><select className={inputClass} value={incidentCode} onChange={e => setIncidentCode(e.target.value)}><option value="NETWORK_UNAVAILABLE">Network unavailable</option><option value="POWER_DISRUPTION">Power disruption</option><option value="MANUAL_WORKFLOW_STARTED">Manual workflow started</option><option value="RESOURCE_UNAVAILABLE">Resource unavailable</option><option value="SERVICE_UNAVAILABLE">Service unavailable</option></select></Field><div className="mt-3"><Button variant="secondary" disabled={working} onClick={addOfflineIncident}>Save incident locally</Button></div></Card>
      <Card className="p-5"><h3 className="font-display text-lg font-bold">Resource observation</h3><p className="mb-3 text-sm text-stone-500">Record the operator’s observation. It does not change the authoritative server status.</p><div className="grid gap-3 md:grid-cols-2"><Field label="Resource"><select className={inputClass} value={observedResource.resource_id} onChange={e => setObservedResource(p => ({ ...p, resource_id: e.target.value }))}><option value="">Select resource</option>{data.resources.map(resource => <option key={resource.resource_id} value={resource.resource_id}>{resource.resource_name}</option>)}</select></Field><Field label="Observed status"><select className={inputClass} value={observedResource.observed_status} onChange={e => setObservedResource(p => ({ ...p, observed_status: e.target.value }))}><option>AVAILABLE</option><option>LIMITED</option><option>UNAVAILABLE</option><option>MAINTENANCE</option></select></Field></div><div className="mt-3"><Button variant="secondary" disabled={working || !observedResource.resource_id} onClick={addResourceObservation}>Save observation locally</Button></div></Card>
      <Card className="p-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-display text-lg font-bold">Pending outbox</h3><p className="text-sm text-stone-500">{outbox.length} non-clinical observation(s) stored in this browser.</p></div><Button disabled={working || !outbox.length} onClick={syncOutbox}>Sync pending observations</Button></div><div className="mt-4 space-y-2">{outbox.map(item => <div key={item.client_event_id} className="rounded-xl border border-stone-100 p-3"><p className="font-semibold text-stone-800">{item.event_type.replaceAll('_', ' ')}</p><p className="text-xs text-stone-500">{timeLabel(item.queued_at)} · idempotency key {item.client_event_id}</p></div>)}{!outbox.length && <p className="text-sm text-stone-500">No pending local observations.</p>}</div><div className="mt-4 border-t border-stone-100 pt-4"><h4 className="font-bold">Recent server receipts</h4><div className="mt-2 space-y-2">{data.receipts.slice(0, 10).map(item => <div key={item.client_event_id} className="flex flex-wrap justify-between gap-2 text-sm"><span>{item.event_type.replaceAll('_', ' ')}</span><span className="text-xs text-stone-500">{timeLabel(item.received_at)}</span></div>)}{!data.receipts.length && <p className="text-sm text-stone-500">No observations have been synchronised yet.</p>}</div></div></Card>
    </>}
  </div>;
}
