import { useEffect, useId, useRef, useState } from 'react';
import { Button, Card, Field, inputClass } from '../../components/ui';
import Icon from '../../components/ui/Icon';

export default function SchedulingView({ staff, shifts, onCreateShift, onDeleteShift }) {
  const [form, setForm] = useState({ staff_id: '', shift_date: '', start_time: '', end_time: '' });
  const [error, setError] = useState('');
  const [staffPickerOpen, setStaffPickerOpen] = useState(false);
  const [activeStaffIndex, setActiveStaffIndex] = useState(0);
  const staffPickerRef = useRef(null);
  const staffPickerId = useId().replace(/:/g, '');

  const activeStaff = staff.filter(member => member.is_active);
  const selectedStaffIndex = activeStaff.findIndex(member => String(member.staff_id) === String(form.staff_id));
  const selectedStaff = selectedStaffIndex >= 0 ? activeStaff[selectedStaffIndex] : null;

  useEffect(() => {
    function closeOnOutsidePointer(event) {
      if (!staffPickerRef.current?.contains(event.target)) setStaffPickerOpen(false);
    }

    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, []);

  async function save() {
    setError('');
    try {
      await onCreateShift(form);
      setForm({ staff_id: '', shift_date: '', start_time: '', end_time: '' });
      setStaffPickerOpen(false);
    } catch (e) {
      setError(e.message);
    }
  }

  function openStaffPicker(preferSelected = true) {
    const initialIndex = preferSelected && selectedStaffIndex >= 0
      ? selectedStaffIndex
      : 0;
    setActiveStaffIndex(Math.max(0, Math.min(initialIndex, activeStaff.length - 1)));
    setStaffPickerOpen(true);
  }

  function chooseStaff(member) {
    setForm(current => ({ ...current, staff_id: String(member.staff_id) }));
    setActiveStaffIndex(activeStaff.findIndex(option => String(option.staff_id) === String(member.staff_id)));
    setStaffPickerOpen(false);
    setError('');
  }

  function handleStaffPickerKeyDown(event) {
    if (event.key === 'Escape' && staffPickerOpen) {
      event.preventDefault();
      setStaffPickerOpen(false);
      return;
    }

    if (event.key === 'Tab') {
      setStaffPickerOpen(false);
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!staffPickerOpen) {
        openStaffPicker(true);
      } else {
        setActiveStaffIndex(index => Math.min(index + 1, activeStaff.length - 1));
      }
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!staffPickerOpen) {
        const lastIndex = Math.max(activeStaff.length - 1, 0);
        setActiveStaffIndex(lastIndex);
        setStaffPickerOpen(true);
      } else {
        setActiveStaffIndex(index => Math.max(index - 1, 0));
      }
      return;
    }

    if (event.key === 'Home' && staffPickerOpen) {
      event.preventDefault();
      setActiveStaffIndex(0);
      return;
    }

    if (event.key === 'End' && staffPickerOpen) {
      event.preventDefault();
      setActiveStaffIndex(Math.max(activeStaff.length - 1, 0));
      return;
    }

    if (event.key === 'Enter' || event.key === ' ') {
      if (!staffPickerOpen) {
        event.preventDefault();
        openStaffPicker(true);
      } else if (activeStaff[activeStaffIndex]) {
        event.preventDefault();
        chooseStaff(activeStaff[activeStaffIndex]);
      }
    }
  }

  return (
    <div className="scheduling-layout grid gap-6 lg:grid-cols-[.75fr_1.25fr]">
      <Card className="scheduling-form-card p-6">
        <div className="scheduling-form-heading">
          <p className="eyebrow">Shift planning</p>
          <h2 className="font-display text-lg font-bold">Schedule a shift</h2>
          <p>Select an active staff member and set the shift date and hours to build the roster.</p>
        </div>

        <div className="scheduling-form-fields">
          <Field label="Staff member" required htmlFor={staffPickerId}>
            <div className="scheduling-staff-picker" ref={staffPickerRef}>
              <button
                id={staffPickerId}
                type="button"
                className={`scheduling-staff-trigger ${staffPickerOpen ? 'is-open' : ''} ${selectedStaff ? 'has-selection' : ''}`}
                role="combobox"
                aria-haspopup="listbox"
                aria-expanded={staffPickerOpen}
                aria-controls={`${staffPickerId}-listbox`}
                aria-required="true"
                aria-activedescendant={staffPickerOpen && activeStaff[activeStaffIndex] ? `${staffPickerId}-option-${activeStaffIndex}` : undefined}
                onClick={() => staffPickerOpen ? setStaffPickerOpen(false) : openStaffPicker(true)}
                onKeyDown={handleStaffPickerKeyDown}
                disabled={!activeStaff.length}
              >
                <span className={`scheduling-staff-trigger-avatar ${selectedStaff ? 'is-selected' : ''}`} aria-hidden="true">
                  <Icon name={selectedStaff ? 'user' : 'users'} size={18} />
                </span>
                {selectedStaff ? (
                  <span className="scheduling-staff-selected-copy">
                    <strong>{selectedStaff.username}</strong>
                    <span>{selectedStaff.role.replace(/_/g, ' ')}</span>
                  </span>
                ) : (
                  <span className="scheduling-staff-placeholder">
                    {activeStaff.length ? 'Select a staff member' : 'No active staff available'}
                    <small>{activeStaff.length ? `${activeStaff.length} active ${activeStaff.length === 1 ? 'member' : 'members'} available` : 'Activate a staff account to schedule a shift'}</small>
                  </span>
                )}
                <span className={`scheduling-staff-chevron ${staffPickerOpen ? 'is-open' : ''}`} aria-hidden="true">
                  <svg viewBox="0 0 20 20" fill="none"><path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </span>
              </button>

              {staffPickerOpen && (
                <div
                  id={`${staffPickerId}-listbox`}
                  className="scheduling-staff-menu"
                  role="listbox"
                  aria-label="Active staff members"
                >
                  <div className="scheduling-staff-menu-header">
                    <span>Choose a staff member</span>
                    <span>{activeStaff.length} available</span>
                  </div>
                  <div className="scheduling-staff-options">
                    {activeStaff.map((member, index) => {
                      const selected = String(member.staff_id) === String(form.staff_id);
                      const active = index === activeStaffIndex;
                      const roleClass = String(member.role || 'staff').toLowerCase().replace(/[^a-z0-9-]/g, '-');

                      return (
                        <div
                          id={`${staffPickerId}-option-${index}`}
                          key={member.staff_id}
                          className={`scheduling-staff-option ${selected ? 'is-selected' : ''} ${active ? 'is-active' : ''}`}
                          role="option"
                          aria-selected={selected}
                          onMouseEnter={() => setActiveStaffIndex(index)}
                          onMouseDown={event => event.preventDefault()}
                          onClick={() => chooseStaff(member)}
                        >
                          <span className={`scheduling-staff-option-avatar scheduling-staff-option-avatar--${roleClass}`} aria-hidden="true">
                            <Icon name={member.role === 'DOCTOR' ? 'heart' : member.role === 'NURSE' ? 'checkCircle' : member.role === 'ADMIN' ? 'shield' : 'user'} size={17} />
                          </span>
                          <span className="scheduling-staff-option-copy">
                            <strong>{member.username}</strong>
                            <span>{member.role.replace(/_/g, ' ')}</span>
                          </span>
                          <span className={`scheduling-staff-role scheduling-staff-role--${roleClass}`}>{member.role}</span>
                          {selected && <Icon name="checkCircle" size={17} className="scheduling-staff-option-check" />}
                        </div>
                      );
                    })}
                    {!activeStaff.length && <p className="scheduling-staff-empty">No active staff members are available.</p>}
                  </div>
                  <div className="scheduling-staff-menu-footer">
                    <Icon name="info" size={14} />
                    Only active staff accounts can be scheduled.
                  </div>
                </div>
              )}
            </div>
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

          <div className="scheduling-availability-note">
            <span className="scheduling-availability-note-icon" aria-hidden="true"><Icon name="info" size={16} /></span>
            <p><strong>How waiting-time estimates work</strong> Doctor availability helps inform estimates. Estimates use scheduled doctors currently on duty and may fall back to the configured staffing default when no active doctor shift is found.</p>
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
              <span>Doctor availability helps inform waiting-time estimates; these use scheduled doctors currently on duty or the configured staffing fallback.</span>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
