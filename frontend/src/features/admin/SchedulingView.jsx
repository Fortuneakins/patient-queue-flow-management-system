import { useState } from 'react';
import { Button, Card, Field, inputClass } from '../../components/ui';
import Icon from '../../components/ui/Icon';

export default function SchedulingView({ staff, shifts, onCreateShift, onDeleteShift }) {
  const [form, setForm] = useState({ staff_id: '', shift_date: '', start_time: '', end_time: '' });
  const [error, setError] = useState('');

  async function save() {
    setError('');
    try {
      await onCreateShift(form);
      setForm({ staff_id: '', shift_date: '', start_time: '', end_time: '' });
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <div className="scheduling-layout grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
      <Card className="scheduling-form-card p-6">
        <div className="scheduling-form-heading">
          <p className="eyebrow">Shift planning</p>
          <h2 className="font-display text-lg font-bold">Schedule a shift</h2>
          <p>Schedule shifts for active staff. Doctor availability informs the wait-time estimate.</p>
        </div>

        <div className="scheduling-form-fields">
          <Field label="Staff member" required>
            <select className={inputClass} value={form.staff_id} onChange={e => setForm({ ...form, staff_id: e.target.value })}>
              <option value="">Select staff</option>
              {staff.filter(s => s.is_active).map(s => (
                <option key={s.staff_id} value={s.staff_id}>{s.username} ({s.role})</option>
              ))}
            </select>
          </Field>

          <Field label="Date" required>
            <input type="date" className={inputClass} value={form.shift_date} onChange={e => setForm({ ...form, shift_date: e.target.value })} />
          </Field>

          <div className="scheduling-time-grid grid grid-cols-2 gap-3">
            <Field label="Start" required>
              <input type="time" className={inputClass} value={form.start_time} onChange={e => setForm({ ...form, start_time: e.target.value })} />
            </Field>
            <Field label="End" required>
              <input type="time" className={inputClass} value={form.end_time} onChange={e => setForm({ ...form, end_time: e.target.value })} />
            </Field>
          </div>

          {error && (
            <div className="scheduling-error" role="alert">
              <Icon name="alert" size={17} />
              <span>{error}</span>
            </div>
          )}

          <Button onClick={save} icon="calendar">Create Shift</Button>
        </div>
      </Card>

      <Card className="scheduling-list-card overflow-hidden">
        <div className="scheduling-list-header">
          <div>
            <p className="eyebrow">Roster overview</p>
            <h2 className="font-display text-lg font-bold">Upcoming shifts</h2>
            <p>Scheduled coverage for your active team.</p>
          </div>
          <span className="scheduling-shift-count">
            <Icon name="calendar" size={15} />
            {shifts.length} {shifts.length === 1 ? 'shift' : 'shifts'}
          </span>
        </div>

        {shifts.length ? (
          <div className="scheduling-shift-list">
            {shifts.map(shift => (
              <article key={shift.shift_id} className="scheduling-shift-row">
                <div className="scheduling-shift-icon" aria-hidden="true">
                  <Icon name="calendar" size={19} />
                </div>
                <div className="scheduling-shift-details">
                  <h3>{shift.username}</h3>
                  <p>
                    <Icon name="calendar" size={14} />
                    <span>{shift.shift_date}</span>
                    <span className="scheduling-shift-separator" aria-hidden="true">·</span>
                    <Icon name="clock" size={14} />
                    <span>{shift.start_time?.slice(0, 5)}–{shift.end_time?.slice(0, 5)}</span>
                  </p>
                </div>
                <Button variant="danger" onClick={() => onDeleteShift(shift.shift_id)}>Remove</Button>
              </article>
            ))}
          </div>
        ) : (
          <div className="scheduling-empty-state">
            <div className="scheduling-empty-art" aria-hidden="true">
              <span className="scheduling-empty-orbit scheduling-empty-orbit--outer" />
              <span className="scheduling-empty-orbit scheduling-empty-orbit--inner" />
              <span className="scheduling-empty-icon"><Icon name="calendar" size={28} /></span>
              <span className="scheduling-empty-spark scheduling-empty-spark--one" />
              <span className="scheduling-empty-spark scheduling-empty-spark--two" />
            </div>
            <p className="scheduling-empty-kicker">Your roster starts here</p>
            <h3>No upcoming shifts</h3>
            <p className="scheduling-empty-copy">Create a shift for an active staff member and it will appear here, ready for a quick review.</p>
            <div className="scheduling-empty-hint">
              <Icon name="info" size={15} />
              <span>Doctor availability informs the wait-time estimate.</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
