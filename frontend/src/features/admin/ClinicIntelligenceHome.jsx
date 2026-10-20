import { useCallback, useEffect, useState } from 'react';
import { api } from '../../services/api';
import { Badge, Button, Card, EmptyState } from '../../components/ui';
import Icon from '../../components/ui/Icon';

const initialSnapshot = {
  overview: null,
  visits: null,
  resources: null,
  referrals: null,
  pathways: null,
  simulations: null,
  events: null
};

const workbenches = [
  {
    title: 'Run today’s clinic',
    description: 'Understand patient journey progress and operational dependencies.',
    tools: [
      { id: 'journeys', label: 'CareGraph', detail: 'See stage-by-stage journey progress.', icon: 'layout' },
      { id: 'resources', label: 'Resource status', detail: 'Check rooms, equipment, services and supplies.', icon: 'settings' },
      { id: 'referrals', label: 'Referral Relay', detail: 'Track locally recorded handovers.', icon: 'arrow' }
    ]
  },
  {
    title: 'Plan and stress-test',
    description: 'Explore possible pressure before changing real operations.',
    tools: [
      { id: 'flow', label: 'FlowTwin', detail: 'Compare a current snapshot with a what-if scenario.', icon: 'chart' },
      { id: 'lab', label: 'Synthetic Lab', detail: 'Repeat stress tests with controlled synthetic inputs.', icon: 'activity' },
      { id: 'continuity', label: 'Continuity Lab', detail: 'Review synthetic downtime-recovery scenarios.', icon: 'refresh' }
    ]
  },
  {
    title: 'Prove and improve',
    description: 'Review evidence, delay signals and communication safeguards.',
    tools: [
      { id: 'learning', label: 'Safety and prediction truth', detail: 'Review long waits and forecast observations.', icon: 'shield' },
      { id: 'events', label: 'Flight Recorder', detail: 'Trace recorded operational events and transitions.', icon: 'history' },
      { id: 'access', label: 'Access Bridge', detail: 'Review consent and operational message controls.', icon: 'users' }
    ]
  }
];

function count(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatTimestamp(value) {
  if (!value) return 'No event recorded yet';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Timestamp unavailable' : date.toLocaleString();
}

function MetricCard({ label, value, caption, icon, tone = 'teal' }) {
  const toneClasses = {
    teal: 'border-teal-100 bg-teal-50/70 text-teal-950',
    blue: 'border-blue-100 bg-blue-50/70 text-blue-950',
    amber: 'border-amber-200 bg-amber-50/70 text-amber-950',
    red: 'border-red-200 bg-red-50/70 text-red-950',
    neutral: 'border-stone-200 bg-white text-stone-900'
  };
  return (
    <Card className={`border p-4 md:p-5 ${toneClasses[tone] || toneClasses.teal}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-[0.12em] opacity-70">{label}</p>
          <p className="mt-2 font-display text-3xl font-bold tabular-nums">{value === null || value === undefined ? '—' : value}</p>
          <p className="mt-1 text-xs leading-relaxed opacity-75">{caption}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/80">
          <Icon name={icon} size={19} />
        </span>
      </div>
    </Card>
  );
}

function SignalRow({ tone = 'amber', title, detail, action, onClick }) {
  const tones = {
    red: 'border-red-200 bg-red-50 text-red-950',
    amber: 'border-amber-200 bg-amber-50 text-amber-950',
    teal: 'border-teal-100 bg-teal-50 text-teal-950',
    neutral: 'border-stone-200 bg-stone-50 text-stone-900'
  };
  return (
    <div className={`flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between ${tones[tone] || tones.amber}`}>
      <div className="flex min-w-0 gap-3">
        <span className="mt-0.5 shrink-0"><Icon name={tone === 'red' ? 'alert' : tone === 'teal' ? 'checkCircle' : 'info'} size={18} /></span>
        <div className="min-w-0">
          <p className="font-semibold">{title}</p>
          <p className="mt-1 text-sm leading-relaxed opacity-80">{detail}</p>
        </div>
      </div>
      {action && <Button variant="secondary" icon="arrow" onClick={onClick} className="shrink-0">{action}</Button>}
    </div>
  );
}

export default function ClinicIntelligenceHome({ token, onOpenTool }) {
  const [snapshot, setSnapshot] = useState(initialSnapshot);
  const [busy, setBusy] = useState(false);
  const [sourceIssues, setSourceIssues] = useState([]);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    const requests = [
      ['overview', api.intelligenceOverview(token)],
      ['visits', api.intelligenceActiveVisits(token)],
      ['resources', api.listResources(token)],
      ['referrals', api.listReferrals(token)],
      ['pathways', api.listPathways(token)],
      ['simulations', api.listFlowSimulations(token, 20)],
      ['events', api.intelligenceEvents(token, 10)]
    ];
    const settled = await Promise.allSettled(requests.map(([, request]) => request));
    const next = { ...initialSnapshot };
    const issues = [];
    settled.forEach((result, index) => {
      const key = requests[index][0];
      if (result.status === 'fulfilled') next[key] = result.value;
      else issues.push(key);
    });
    setSnapshot(next);
    setSourceIssues(issues);
    setLastUpdated(new Date());
    setBusy(false);
  }, [token]);

  useEffect(() => { refresh(); }, [refresh]);

  const overview = snapshot.overview;
  const waiting = overview ? count(overview.waiting) : null;
  const inConsultation = overview ? count(overview.in_consultation) : null;
  const overdue = overview ? count(overview.overdue_waiting) : null;
  const dischargedToday = overview ? count(overview.discharged_today) : null;
  const resourceIssues = snapshot.resources
    ? snapshot.resources.filter(item => ['LIMITED', 'UNAVAILABLE'].includes(String(item.status).toUpperCase())).length
    : null;
  const openReferrals = snapshot.referrals
    ? snapshot.referrals.filter(item => !['COMPLETED', 'CANCELLED'].includes(String(item.status).toUpperCase())).length
    : null;
  const activePathways = snapshot.pathways ? snapshot.pathways.filter(item => item.is_active).length : null;
  const scenarios = snapshot.simulations
    ? snapshot.simulations.filter(item => item.simulation_kind === 'SCENARIO').length
    : null;
  const syntheticBatches = snapshot.simulations
    ? snapshot.simulations.filter(item => item.simulation_kind === 'SYNTHETIC_BATCH').length
    : null;
  const latestEvent = snapshot.events?.[0] || null;
  const sampleCount = overview ? count(overview.service_history_samples) : null;
  const sourceLabels = {
    overview: 'operational overview',
    visits: 'active visits',
    resources: 'resource registry',
    referrals: 'referrals',
    pathways: 'care pathways',
    simulations: 'simulation history',
    events: 'event history'
  };
  const unavailableSources = sourceIssues.map(key => sourceLabels[key] || key);

  const signals = [];
  if (overdue !== null && overdue > 0) {
    signals.push({
      tone: 'red',
      title: `${overdue} waiting ${overdue === 1 ? 'visit needs' : 'visits need'} a delay review`,
      detail: 'These waiting visits have crossed the system’s 60-minute operational review threshold. Check the context with authorised clinical staff; this is not an automatic change to triage priority.',
      action: 'Review delay signals',
      tool: 'learning'
    });
  }
  if (resourceIssues !== null && resourceIssues > 0) {
    signals.push({
      tone: 'amber',
      title: `${resourceIssues} resource ${resourceIssues === 1 ? 'record needs' : 'records need'} attention`,
      detail: 'At least one resource is marked Limited or Unavailable. Confirm the recorded state with the responsible administrator before relying on it for planning.',
      action: 'Inspect resources',
      tool: 'resources'
    });
  }
  if (openReferrals !== null && openReferrals > 0) {
    signals.push({
      tone: 'amber',
      title: `${openReferrals} referral ${openReferrals === 1 ? 'record remains' : 'records remain'} open`,
      detail: 'Review acknowledgement and follow-up status. Referral Relay records handovers locally; it does not contact an external service automatically.',
      action: 'Review referrals',
      tool: 'referrals'
    });
  }
  if (waiting !== null && waiting > 0 && (overdue === null || overdue === 0)) {
    signals.push({
      tone: 'teal',
      title: `${waiting} ${waiting === 1 ? 'visit is' : 'visits are'} currently waiting`,
      detail: 'Use FlowTwin to explore a hypothetical demand or capacity change without altering the live queue.',
      action: 'Explore a scenario',
      tool: 'flow'
    });
  }
  if (sampleCount !== null && sampleCount < 10) {
    signals.push({
      tone: 'neutral',
      title: 'Limited historical service-time evidence',
      detail: sampleCount === 0
        ? 'No eligible completed service-time samples were found in the recent history used by the model. Treat wait projections as assumption-led until more observations accumulate.'
        : `Only ${sampleCount} eligible completed service-time ${sampleCount === 1 ? 'sample was' : 'samples were'} found. Review model assumptions and sample size before drawing conclusions.`,
      action: 'Review prediction evidence',
      tool: 'learning'
    });
  }
  if (snapshot.events && snapshot.events.length === 0) {
    signals.push({
      tone: 'neutral',
      title: 'No operational events were returned',
      detail: 'The current event query is empty. This may reflect a fresh database or a lack of recorded actions, rather than a system failure.',
      action: 'Open Flight Recorder',
      tool: 'events'
    });
  }

  const go = tool => onOpenTool?.(tool);

  return (
    <div className="space-y-5">
      <Card className="overflow-hidden border-0 p-0">
        <div className="rounded-2xl bg-[#102b27] text-white">
        <div className="grid gap-5 p-5 md:grid-cols-[1fr_auto] md:items-end md:p-7">
          <div className="max-w-3xl">
            <div className="flex flex-wrap items-center gap-2">
              <Badge tone="teal">Operations cockpit</Badge>
              <span className="text-xs text-teal-100/80">Server snapshot · read-only summary</span>
            </div>
            <h2 className="mt-3 font-display text-2xl font-bold md:text-3xl">See what needs attention.</h2>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-teal-50/90">
              One starting point for queue pressure, recorded resource constraints, referrals and evidence quality. Signals are prompts for human review, not clinical decisions.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-teal-100/80">
              <span className="inline-flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-300" /> API-backed data</span>
              <span>{lastUpdated ? `Updated ${lastUpdated.toLocaleTimeString()}` : 'Waiting for first snapshot'}</span>
              {overview?.model_version && <span>Model {overview.model_version}</span>}
            </div>
          </div>
          <Button onClick={refresh} disabled={busy} icon="refresh" variant="secondary">{busy ? 'Refreshing…' : 'Refresh snapshot'}</Button>
        </div>
        </div>
      </Card>

      {sourceIssues.length > 0 && (
        <SignalRow
          tone="amber"
          title="Some intelligence data could not be loaded"
          detail={`Unavailable sources: ${unavailableSources.join(', ')}. Metrics from those sources are shown as unavailable rather than as zero. Refresh to try again.`}
          action="Retry"
          onClick={refresh}
        />
      )}

      <section aria-labelledby="clinic-pulse-title">
        <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">Operational pulse</p>
            <h3 id="clinic-pulse-title" className="font-display text-xl font-bold">Current picture</h3>
          </div>
          <span className="text-xs text-stone-500">Values reflect loaded server records, not predictions.</span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <MetricCard label="Waiting now" value={waiting === null ? null : waiting.toLocaleString()} caption="Visits with Waiting status" icon="users" tone={overdue > 0 ? 'amber' : 'teal'} />
          <MetricCard label="In consultation" value={inConsultation === null ? null : inConsultation.toLocaleString()} caption="Active visits in consultation" icon="activity" tone="blue" />
          <MetricCard label="Over 60 minutes" value={overdue === null ? null : overdue.toLocaleString()} caption="Operational delay-review threshold" icon="clock" tone={overdue > 0 ? 'red' : 'neutral'} />
          <MetricCard label="Discharged today" value={dischargedToday === null ? null : dischargedToday.toLocaleString()} caption="Recorded for the South African clinic date" icon="checkCircle" tone="neutral" />
          <MetricCard label="Resources to review" value={resourceIssues === null ? null : resourceIssues.toLocaleString()} caption="Resource records marked Limited or Unavailable" icon="settings" tone={resourceIssues > 0 ? 'amber' : 'neutral'} />
          <MetricCard label="Open referrals" value={openReferrals === null ? null : openReferrals.toLocaleString()} caption="Requested, acknowledged or in progress" icon="arrow" tone={openReferrals > 0 ? 'amber' : 'neutral'} />
        </div>
      </section>

      <section aria-labelledby="signals-title" className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">Suggested review queue</p>
            <h3 id="signals-title" className="font-display text-xl font-bold">Signals and next actions</h3>
          </div>
          <Badge tone={signals.some(item => item.tone === 'red') ? 'red' : signals.length ? 'orange' : 'teal'}>
            {signals.length ? `${signals.length} review prompt${signals.length === 1 ? '' : 's'}` : 'No current prompt'}
          </Badge>
        </div>
        {busy && !overview ? (
          <Card className="p-5"><EmptyState title="Building the operational picture" message="Loading queue, resource, referral and evidence summaries from the server."/></Card>
        ) : signals.length ? (
          <div className="space-y-3">{signals.map(item => <SignalRow key={item.title} {...item} onClick={() => go(item.tool)} />)}</div>
        ) : sourceIssues.length > 0 ? (
          <SignalRow
            tone="neutral"
            title="Review prompts are incomplete"
            detail="One or more data sources did not load, so this page cannot provide a complete operational summary. Retry the snapshot before relying on its signals."
            action="Retry snapshot"
            onClick={refresh}
          />
        ) : (
          <SignalRow
            tone="teal"
            title="No threshold-based prompt from the loaded summary"
            detail="This is not a safety clearance. Continue normal operational monitoring and use the workbenches below to inspect the details relevant to your task."
          />
        )}
      </section>

      <section aria-labelledby="workbench-title" className="space-y-3">
        <div>
          <p className="eyebrow">Guided workbenches</p>
          <h3 id="workbench-title" className="font-display text-xl font-bold">Choose the job you need to do</h3>
          <p className="mt-1 text-sm text-stone-500">Tools are grouped by intent so you can start with a task instead of remembering module names.</p>
        </div>
        <div className="grid gap-4 xl:grid-cols-3">
          {workbenches.map(group => (
            <Card key={group.title} className="flex flex-col p-4 md:p-5">
              <div className="mb-4">
                <h4 className="font-display text-lg font-bold">{group.title}</h4>
                <p className="mt-1 text-sm leading-relaxed text-stone-500">{group.description}</p>
              </div>
              <div className="space-y-2">
                {group.tools.map(tool => (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => go(tool.id)}
                    className="group flex w-full items-start gap-3 rounded-xl border border-stone-200 p-3 text-left transition hover:border-teal-300 hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-700"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-stone-700 transition group-hover:bg-white">
                      <Icon name={tool.icon} size={17} />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-stone-900">{tool.label}</span>
                      <span className="mt-0.5 block text-xs leading-relaxed text-stone-500">{tool.detail}</span>
                    </span>
                    <Icon name="arrow" size={15} className="mt-1 shrink-0 text-stone-400 transition group-hover:text-teal-800" />
                  </button>
                ))}
              </div>
            </Card>
          ))}
        </div>
      </section>

      <Card className="p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow">Evidence and system footing</p>
            <h3 className="font-display text-lg font-bold">Know what the intelligence is based on</h3>
            <p className="mt-1 text-sm text-stone-500">These counts describe the available evidence. They do not certify prediction accuracy or clinical safety.</p>
          </div>
          <Button variant="secondary" icon="history" onClick={() => go('events')}>Inspect event trace</Button>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-xs text-stone-500">Active pathways</p><p className="mt-1 font-display text-2xl font-bold">{activePathways === null ? '—' : activePathways}</p></div>
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-xs text-stone-500">Eligible service samples</p><p className="mt-1 font-display text-2xl font-bold">{sampleCount === null ? '—' : sampleCount}</p><p className="mt-1 text-xs text-stone-500">Used to inform operational service-time estimates when available.</p></div>
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-xs text-stone-500">Saved FlowTwin scenarios</p><p className="mt-1 font-display text-2xl font-bold">{scenarios === null ? '—' : scenarios}</p><p className="mt-1 text-xs text-stone-500">{syntheticBatches === null ? '—' : syntheticBatches} synthetic batches also saved.</p></div>
          <div className="rounded-xl border border-stone-200 p-3"><p className="text-xs text-stone-500">Latest operational event</p><p className="mt-1 text-sm font-semibold">{formatTimestamp(latestEvent?.created_at || overview?.last_event_at)}</p><p className="mt-1 text-xs text-stone-500">{overview?.event_count == null ? 'Event count unavailable' : `${count(overview.event_count).toLocaleString()} events recorded in total`}</p></div>
        </div>
        {snapshot.visits && <p className="mt-3 text-xs text-stone-500">The live queue query returned {snapshot.visits.length} active visit(s), including waiting and in-consultation states. Patient names are intentionally not displayed on this aggregate landing page.</p>}
      </Card>

      <p className="text-xs leading-relaxed text-stone-500">
        Safety boundary: Clinic Intelligence provides operational summaries, simulations and audit views. It does not diagnose patients, automatically assign clinical priority, guarantee waiting times, or send Referral Relay records to another health system.
      </p>
    </div>
  );
}
