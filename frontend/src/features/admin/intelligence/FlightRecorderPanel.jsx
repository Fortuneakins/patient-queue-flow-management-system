import { useCallback, useEffect, useMemo, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';
import Icon from '../../../components/ui/Icon';

function eventTransition(event) {
  if (!event.from_state && !event.to_state) return 'No state transition';
  if (!event.from_state) return '—  →  ' + event.to_state;
  if (!event.to_state) return event.from_state + '  →  —';
  return event.from_state + '  →  ' + event.to_state;
}

function metadataFor(event) {
  const value = event.metadata && typeof event.metadata === 'object' ? event.metadata : {};
  return { value, keys: Object.keys(value) };
}

export default function FlightRecorderPanel({ token }) {
  const [events, setEvents] = useState([]);
  const [eventType, setEventType] = useState('');
  const [limit, setLimit] = useState('100');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      setEvents(await api.intelligenceEvents(token, Number(limit) || 100, eventType));
    } catch (e) {
      setError(e.message || 'Unable to load operational events.');
    } finally {
      setBusy(false);
    }
  }, [token, limit, eventType]);

  useEffect(() => { refresh(); }, [refresh]);

  const summary = useMemo(() => ({
    total: events.length,
    types: new Set(events.map(event => event.event_type).filter(Boolean)).size,
    withMetadata: events.filter(event => metadataFor(event).keys.length > 0).length
  }), [events]);

  return (
    <Card className="intelligence-data-card flight-recorder-card overflow-hidden">
      <header className="flight-recorder-header">
        <div className="flight-recorder-title-row">
          <div className="flight-recorder-title-copy">
            <span className="flight-recorder-heading-icon" aria-hidden="true"><Icon name="history" size={22} /></span>
            <div>
              <p className="eyebrow">Operational event stream</p>
              <h2 className="font-display">Flight Recorder</h2>
              <p>Inspect the append-only trace of queue transitions, resource changes, simulations, referrals and communication attempts.</p>
            </div>
          </div>
          <Badge tone="teal">Append-only log</Badge>
        </div>
        <div className="flight-recorder-privacy-note">
          <Icon name="shield" size={15} />
          <p>Consultation-note content and patient contact numbers are intentionally excluded from event metadata.</p>
        </div>
        <div className="flight-recorder-summary-grid" aria-label="Loaded event summary">
          <div className="flight-recorder-summary-item">
            <span className="flight-recorder-summary-icon"><Icon name="history" size={17} /></span>
            <span><strong>{summary.total}</strong><small>Events loaded</small></span>
          </div>
          <div className="flight-recorder-summary-item">
            <span className="flight-recorder-summary-icon"><Icon name="chart" size={17} /></span>
            <span><strong>{summary.types}</strong><small>Event types</small></span>
          </div>
          <div className="flight-recorder-summary-item">
            <span className="flight-recorder-summary-icon"><Icon name="database" size={17} /></span>
            <span><strong>{summary.withMetadata}</strong><small>With metadata</small></span>
          </div>
        </div>
        <div className="flight-recorder-filter-panel">
          <div>
            <p className="eyebrow">Narrow the event stream</p>
            <p className="flight-recorder-filter-caption">Use a full or partial event type, such as <code>VISIT</code> or <code>RESOURCE_STATUS_CHANGED</code>.</p>
          </div>
          <div className="flight-recorder-filter-controls">
            <Field label="Event type filter">
              <input className={inputClass} value={eventType} maxLength={60} placeholder="e.g. VISIT_CHECKED_IN" onChange={e => setEventType(e.target.value)} />
            </Field>
            <Field label="Maximum events">
              <select className={inputClass} value={limit} onChange={e => setLimit(e.target.value)}>{['25', '50', '100', '200'].map(v => <option key={v}>{v}</option>)}</select>
            </Field>
            <Button icon="refresh" onClick={refresh} disabled={busy}>{busy ? 'Loading…' : 'Refresh events'}</Button>
          </div>
        </div>
      </header>

      {error && <p role="alert" className="flight-recorder-message flight-recorder-message--error">{error}</p>}

      {events.length ? (
        <div className="flight-recorder-event-list" role="list" aria-label="Operational event records" aria-busy={busy}>
          {events.map((event, index) => {
            const metadata = metadataFor(event);
            return (
              <article
                key={event.event_id}
                className="flight-recorder-event"
                role="listitem"
                style={{ '--flight-event-index': Math.min(index, 5) }}
              >
                <div className="flight-recorder-event-top">
                  <div className="flight-recorder-event-type">
                    <span className="flight-recorder-event-icon" aria-hidden="true"><Icon name="activity" size={17} /></span>
                    <div>
                      <h3>{event.event_type}</h3>
                      <span className="flight-recorder-event-id">Event #{event.event_id}</span>
                    </div>
                  </div>
                  <time className="flight-recorder-timestamp" dateTime={event.created_at}>
                    <Icon name="clock" size={14} />
                    {event.created_at ? new Date(event.created_at).toLocaleString() : 'Timestamp unavailable'}
                  </time>
                </div>

                <div className="flight-recorder-event-details">
                  <div className="flight-recorder-detail">
                    <span>Entity</span>
                    <strong>{event.entity_type || '—'}</strong>
                    <small>{event.entity_id ? 'Record #' + event.entity_id : 'No entity ID'}</small>
                  </div>
                  <div className="flight-recorder-detail">
                    <span>Transition</span>
                    <strong className="flight-recorder-transition">{eventTransition(event)}</strong>
                  </div>
                  <div className="flight-recorder-detail">
                    <span>Actor</span>
                    <strong>{event.actor_staff_id || 'System / kiosk'}</strong>
                  </div>
                </div>

                <details className="flight-recorder-metadata">
                  <summary>
                    <span className="flight-recorder-metadata-leading"><Icon name="database" size={15} /> Event metadata</span>
                    <span className="flight-recorder-metadata-count">{metadata.keys.length} {metadata.keys.length === 1 ? 'field' : 'fields'}</span>
                    <span className="flight-recorder-metadata-toggle"><Icon name="chevronDown" size={15} /></span>
                  </summary>
                  {metadata.keys.length ? (
                    <pre>{JSON.stringify(metadata.value, null, 2)}</pre>
                  ) : (
                    <p className="flight-recorder-no-metadata">No additional metadata was recorded for this event.</p>
                  )}
                </details>
              </article>
            );
          })}
        </div>
      ) : (
        <div className="flight-recorder-empty">
          <EmptyState
            title={busy ? 'Loading operational events' : 'No matching events'}
            message={busy ? 'Retrieving the latest operational trace.' : 'Events appear as queue visits, pathways, resources, forecasts and other operational tasks change.'}
          />
        </div>
      )}

      <footer className="flight-recorder-footer">
        <span><span className="flight-recorder-footer-dot" /> Append-only operational trace</span>
        <span>Event rows reject application-level UPDATE and DELETE.</span>
        <p>Retention, backup and privileged database administration still require deployment policy. This log is not a complete clinical record.</p>
      </footer>
    </Card>
  );
}
