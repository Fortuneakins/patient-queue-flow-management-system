import { Card, Badge } from '../../../components/ui';
const bands = [
  { key: 'under_15', label: 'Under 15 minutes' },
  { key: 'minutes_15_29', label: '15–29 minutes' },
  { key: 'minutes_30_59', label: '30–59 minutes' },
  { key: 'over_60', label: '60 minutes or more' }
];
const bandTone = band => ({ CRITICAL: 'red', HIGH: 'orange', MODERATE: 'blue', LOW: 'green' }[band] || 'neutral');

export default function OperationalPressurePanel({ pressure, ageBands, staffing, capacity }) {
  if (!pressure) return <Card className="p-5"><p className="text-sm text-stone-500">Operational pressure analysis is unavailable until the queue snapshot has loaded.</p></Card>;
  const total = bands.reduce((sum, band) => sum + Number(ageBands?.[band.key] || 0), 0);
  const maximum = Math.max(1, ...bands.map(band => Number(ageBands?.[band.key] || 0)));
  const score = pressure.score === null || pressure.score === undefined ? '—' : pressure.score + '/100';
  const ratio = pressure.waiting_per_doctor === null || pressure.waiting_per_doctor === undefined ? 'Unavailable' : pressure.waiting_per_doctor.toFixed(1);
  const roomCapacity = capacity?.available_room_capacity === null || capacity?.available_room_capacity === undefined ? 'Not configured' : String(capacity.available_room_capacity);
  return (
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="eyebrow">Operational pressure analysis</p><h3 className="font-display text-xl font-bold">Understand where the queue is building</h3>
          <p className="mt-1 max-w-3xl text-sm text-stone-500">Aggregate queue ageing, roster coverage and recorded room capacity. This is a transparent planning heuristic, not a clinical acuity score.</p></div>
        <Badge tone={bandTone(pressure.band)}>{pressure.band || 'UNAVAILABLE'}</Badge>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Pressure index</p><p className="mt-1 font-display text-3xl font-bold tabular-nums">{score}</p><p className="mt-1 text-xs text-stone-500">Version {pressure.model_version}</p></div>
        <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Waiting per doctor</p><p className="mt-1 font-display text-2xl font-bold tabular-nums">{ratio}</p><p className="mt-1 text-xs text-stone-500">{staffing?.on_duty_doctors ?? '—'} rostered doctor(s)</p></div>
        <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Nurses on duty</p><p className="mt-1 font-display text-2xl font-bold tabular-nums">{staffing?.on_duty_nurses ?? '—'}</p><p className="mt-1 text-xs text-stone-500">Active rostered shifts</p></div>
        <div className="rounded-xl border border-stone-200 p-4"><p className="text-xs font-bold uppercase tracking-wide text-stone-500">Available room capacity</p><p className="mt-1 font-display text-2xl font-bold tabular-nums">{roomCapacity}</p><p className="mt-1 text-xs text-stone-500">Administrator-maintained registry</p></div>
      </div>
      <div className="mt-5 grid gap-6 lg:grid-cols-2">
        <section aria-labelledby="queue-age-bands-title"><div className="mb-3 flex items-center justify-between gap-2"><h4 id="queue-age-bands-title" className="font-semibold">Waiting queue age bands</h4><span className="text-xs text-stone-500">{total} waiting visit(s)</span></div>
          <div className="space-y-3">{bands.map(band => { const value = Number(ageBands?.[band.key] || 0); return <div key={band.key}><div className="mb-1 flex items-center justify-between gap-2 text-sm"><span className="text-stone-600">{band.label}</span><strong className="tabular-nums">{value}</strong></div><div className="h-2 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={band.label + ': ' + value + ' waiting visit(s)'}><div className="h-full rounded-full bg-teal-700" style={{ width: (value / maximum * 100) + '%' }} /></div></div>; })}</div>
        </section>
        <section aria-labelledby="pressure-components-title"><h4 id="pressure-components-title" className="mb-3 font-semibold">How the index is calculated</h4><div className="space-y-3">{(pressure.components || []).map(component => <div key={component.id} className="rounded-xl border border-stone-100 p-3"><div className="flex items-center justify-between gap-2 text-sm"><strong>{component.label}</strong><span className="tabular-nums">{component.points}/{component.maximum} points</span></div><p className="mt-1 text-xs leading-relaxed text-stone-500">{component.basis}</p></div>)}</div></section>
      </div>
      <p className="mt-4 border-t border-stone-100 pt-3 text-xs leading-relaxed text-stone-500">{pressure.explanation || 'Planning indicator only. Confirm all recorded conditions with the responsible staff member.'}</p>
    </Card>
  );
}
