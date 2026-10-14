import { Badge, Button, Card, EmptyState } from '../../components/ui';
import Icon from '../../components/ui/Icon';
import { formatDateTime, minutesWaiting } from '../../utils/format';

const priority = { 1: ['red', 'Immediate'], 2: ['orange', 'Urgent'], 3: ['yellow', 'Standard'], 4: ['green', 'Routine'] };

export default function QueueList({ queue, role, onPriority, onCall, onDischarge, onNotes }) {
  if (!queue.length) return <EmptyState title="Queue is clear" message="No active visits match this workspace right now." />;

  return (
    <div className="queue-entry-list" aria-label="Active patient visits">
      {queue.map(item => {
        const tier = item.priority_level || 4;
        const [tone, label] = priority[tier];
        return (
          <Card key={item.queue_id} className={`queue-entry-card queue-entry-card--tier-${tier} overflow-hidden`}>
            <div className="queue-entry-content">
              <div className="queue-entry-main">
                <div className="queue-entry-topline">
                  <span className="queue-entry-ticket font-mono">{item.ticket_number}</span>
                  <Badge tone={item.status === 'In-Consultation' ? 'teal' : tone}>{label}</Badge>
                  <Badge tone="neutral">{item.status}</Badge>
                </div>
                <div className="queue-entry-patient">{item.full_name}</div>
                <div className="queue-entry-reason">{item.symptoms}</div>
                <div className="queue-entry-meta">
                  <span><IconMeta /> Arrived {formatDateTime(item.queued_at)}</span>
                  <span><span className="queue-meta-dot" aria-hidden="true" /> Waiting {minutesWaiting(item.queued_at)}m</span>
                </div>
                {item.status === 'In-Consultation' && <div className="queue-consultation-note"><span className="consultation-live-dot" /> Consultation in progress.</div>}
              </div>
              <div className="queue-entry-actions">
                {['NURSE', 'DOCTOR'].includes(role) && item.status === 'Waiting' && (
                  <label className="priority-control">
                    <span>Priority</span>
                    <select aria-label={`Priority for ${item.ticket_number}`} value={item.priority_level || ''} onChange={event => onPriority?.(item.queue_id, Number(event.target.value))}>
                      <option value="">Set tier</option>
                      {[1, 2, 3, 4].map(t => <option key={t} value={t}>Tier {t} · {priority[t][1]}</option>)}
                    </select>
                  </label>
                )}
                {role === 'DOCTOR' && item.status === 'Waiting' && <Button icon="arrow" onClick={() => onCall(item)}>Call to room</Button>}
                {role === 'DOCTOR' && item.status === 'In-Consultation' && <>
                  <Button variant="secondary" icon="check" onClick={() => onNotes(item)}>Consultation notes</Button>
                  <Button variant="success" icon="check" onClick={() => onDischarge(item)}>Discharge patient</Button>
                </>}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

function IconMeta() {
  return <Icon name="clock" size={13} className="queue-meta-clock" />;
}
