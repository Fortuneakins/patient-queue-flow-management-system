import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';

export default function FlightRecorderPanel({ token }) {
  const [events, setEvents] = useState([]);
  const [eventType, setEventType] = useState('');
  const [limit, setLimit] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const refresh = useCallback(async () => {
    setBusy(true); setError('');
    try { setEvents(await api.intelligenceEvents(token, Number(limit) || 100, eventType)); }
    catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }, [token, limit, eventType]);
  useEffect(() => { refresh(); }, [refresh]);
  return (
    <Card className="overflow-hidden">
      <div className="border-b border-stone-100 p-5 md:p-6"><div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Flight Recorder</h2><p className="mt-1 max-w-3xl text-sm text-stone-500">Append-only operational events capture queue transitions, resource changes, simulations, referrals and communication attempts. Consultation note contents and patient contact numbers are intentionally not stored in event metadata.</p></div><Badge tone="teal">Append-only log</Badge></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_10rem_auto]"><Field label="Event type filter"><input className={inputClass} value={eventType} maxLength={60} placeholder="e.g. VISIT_CHECKED_IN" onChange={e => setEventType(e.target.value)}/></Field><Field label="Limit"><select className={inputClass} value={limit} onChange={e => setLimit(e.target.value)}>{['25','50','100','200'].map(v => <option key={v}>{v}</option>)}</select></Field><div className="self-end"><Button icon="refresh" onClick={refresh} disabled={busy}>{busy ? 'Loading…' : 'Refresh events'}</Button></div></div>
      </div>
      {error && <p role="alert" className="m-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {events.length ? <div className="overflow-x-auto"><table className="w-full min-w-[780px] text-left text-sm"><thead className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wide text-stone-500"><tr><th className="p-3">Timestamp</th><th className="p-3">Event</th><th className="p-3">Entity</th><th className="p-3">Transition</th><th className="p-3">Actor ID</th><th className="p-3">Metadata</th></tr></thead><tbody className="divide-y divide-stone-100">{events.map(event => <tr key={event.event_id} className="align-top"><td className="whitespace-nowrap p-3 text-xs text-stone-500">{new Date(event.created_at).toLocaleString()}</td><td className="p-3"><div className="font-semibold">{event.event_type}</div><div className="mt-1 font-mono text-[11px] text-stone-400">#{event.event_id}</div></td><td className="p-3">{event.entity_type}<div className="font-mono text-xs text-stone-500">{event.entity_id || '—'}</div></td><td className="p-3 text-xs">{event.from_state || '—'} {event.to_state ? '→ ' + event.to_state : ''}</td><td className="p-3 text-xs">{event.actor_staff_id || 'System / kiosk'}</td><td className="max-w-xs p-3"><pre className="whitespace-pre-wrap break-words text-[11px] text-stone-600">{JSON.stringify(event.metadata || {})}</pre></td></tr>)}</tbody></table></div> : <EmptyState title="No matching events" message="Events will appear as queue visits, stages, resources, forecasts and other operational tasks change."/>}
      <div className="border-t border-stone-100 bg-stone-50 p-4 text-xs text-stone-500">This is an operational trace, not a complete clinical record. Event rows reject application-level UPDATE and DELETE. Retention, backup and privileged database administration still require deployment policy.</div>
    </Card>
  );
}
