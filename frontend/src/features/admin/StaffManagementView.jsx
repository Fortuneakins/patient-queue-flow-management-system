import { useState } from 'react';
import { Button, Card, EmptyState, Field, Modal, Badge, inputClass } from '../../components/ui';
import Icon from '../../components/ui/Icon';
import { formatDateTime } from '../../utils/format';

const STATUS_FILTERS = [
  { value: 'all', label: 'All accounts' },
  { value: 'active', label: 'Active only' },
  { value: 'deactivated', label: 'Deactivated only' },
  { value: 'potential-test', label: 'Potential test accounts' }
];

function isPotentialTestAccount(item) {
  return /^temp_\d+$/i.test(String(item.username || '')) && !String(item.employee_id || '').trim();
}

function getSearchableStaffText(item) {
  return [item.username, item.role, item.employee_id, item.contact_no]
    .filter(Boolean)
    .join(' ')
    .toLocaleLowerCase();
}

export default function StaffManagementView({
  staff,
  currentUser,
  onCreateStaff,
  onUpdateStatus,
  onUpdatePermission,
  onLoginHistory
}) {
  const [form, setForm] = useState({
    username: '',
    password: '',
    role: 'RECEPTION',
    contact_no: '',
    employee_id: ''
  });
  const [error, setError] = useState('');
  const [events, setEvents] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState('all');

  const staffRecords = Array.isArray(staff) ? staff : [];
  const activeCount = staffRecords.filter(item => item.is_active).length;
  const deactivatedCount = staffRecords.length - activeCount;
  const potentialTestCount = staffRecords.filter(isPotentialTestAccount).length;
  const normalizedSearch = searchQuery.trim().toLocaleLowerCase();

  const filteredStaff = staffRecords.filter(item => {
    const matchesSearch = !normalizedSearch || getSearchableStaffText(item).includes(normalizedSearch);
    const matchesFilter = accountFilter === 'all'
      || (accountFilter === 'active' && item.is_active)
      || (accountFilter === 'deactivated' && !item.is_active)
      || (accountFilter === 'potential-test' && isPotentialTestAccount(item));
    return matchesSearch && matchesFilter;
  });

  async function create() {
    setError('');
    try {
      await onCreateStaff(form);
      setForm({ username: '', password: '', role: 'RECEPTION', contact_no: '', employee_id: '' });
    } catch (createError) {
      setError(createError.message || 'The staff account could not be created.');
    }
  }

  async function history(item) {
    setError('');
    try {
      const loginEvents = await onLoginHistory(item.staff_id);
      setEvents({ staff: item, events: Array.isArray(loginEvents) ? loginEvents : [] });
    } catch (historyError) {
      setError(historyError.message || 'Sign-in history could not be loaded.');
    }
  }

  async function toggle(item) {
    setError('');
    if (item.staff_id === currentUser?.staff_id && !item.is_active) return;

    try {
      await onUpdateStatus(item.staff_id, !item.is_active);
    } catch (statusError) {
      setError(statusError.message || 'The staff account status could not be updated.');
    }
  }

  async function toggleDirectoryPermission(item) {
    setError('');
    const currentlyGranted = (item.extra_permissions || []).includes('VIEW_STAFF_DIRECTORY');
    try {
      await onUpdatePermission(item.staff_id, 'VIEW_STAFF_DIRECTORY', !currentlyGranted);
    } catch (permissionError) {
      setError(permissionError.message || 'The directory permission could not be updated.');
    }
  }

  function clearFilters() {
    setSearchQuery('');
    setAccountFilter('all');
  }

  return (
    <div className="staff-management-view">
      {error && (
        <div className="staff-management-error" role="alert">
          <Icon name="alert" size={17} />
          <span>{error}</span>
          <button type="button" onClick={() => setError('')} aria-label="Dismiss message">
            <Icon name="x" size={15} />
          </button>
        </div>
      )}

      <div className="staff-management-layout grid items-start gap-6 lg:grid-cols-[.75fr_1.25fr]">
        <Card className="staff-create-card p-6">
          <div className="staff-create-heading">
            <p className="eyebrow">Account administration</p>
            <h2 className="font-display text-lg font-bold">Create staff account</h2>
            <p className="mt-1 text-xs text-stone-500">
              New accounts receive a temporary password and must change it at first sign-in.
            </p>
          </div>

          <form
            autoComplete="off"
            className="staff-create-form"
            onSubmit={event => {
              event.preventDefault();
              create();
            }}
          >
            <Field label="Username" required>
              <input
                className={inputClass}
                name="new-staff-username"
                autoComplete="off"
                autoCapitalize="none"
                spellCheck={false}
                value={form.username}
                onChange={event => setForm({ ...form, username: event.target.value })}
              />
            </Field>
            <Field label="Temporary password" required>
              <input
                className={inputClass}
                type="password"
                name="new-staff-temporary-password"
                autoComplete="new-password"
                value={form.password}
                onChange={event => setForm({ ...form, password: event.target.value })}
              />
            </Field>
            <Field label="Role" required>
              <select className={inputClass} value={form.role} onChange={event => setForm({ ...form, role: event.target.value })}>
                {['RECEPTION', 'NURSE', 'DOCTOR', 'ADMIN'].map(role => <option key={role}>{role}</option>)}
              </select>
            </Field>
            <Field label="Contact number">
              <input className={inputClass} value={form.contact_no} onChange={event => setForm({ ...form, contact_no: event.target.value })} />
            </Field>
            <Field label="Employee ID">
              <input className={inputClass} value={form.employee_id} onChange={event => setForm({ ...form, employee_id: event.target.value })} />
            </Field>
            <Button type="submit" icon="plus">Create account</Button>
          </form>
        </Card>

        <Card className="staff-list-card">
          <div className="staff-list-header">
            <div className="staff-list-title-row">
              <div>
                <p className="eyebrow">Directory controls</p>
                <h2 className="font-display text-lg font-bold">Staff accounts</h2>
                <p className="mt-1 text-xs text-stone-500">Search staff and review account status without leaving this page.</p>
              </div>
              <Badge tone="teal">{filteredStaff.length} shown</Badge>
            </div>

            <div className="staff-summary-grid" aria-label="Staff account summary">
              <div className="staff-summary-item">
                <span>Total accounts</span>
                <strong>{staffRecords.length}</strong>
              </div>
              <div className="staff-summary-item staff-summary-item--active">
                <span>Active</span>
                <strong>{activeCount}</strong>
              </div>
              <div className="staff-summary-item staff-summary-item--deactivated">
                <span>Deactivated</span>
                <strong>{deactivatedCount}</strong>
              </div>
              <div className="staff-summary-item staff-summary-item--review">
                <span>Potential test</span>
                <strong>{potentialTestCount}</strong>
              </div>
            </div>

            <div className="staff-list-filter-row">
              <label className="staff-search-control">
                <Icon name="search" size={17} />
                <span className="sr-only">Search by username, role, employee ID or contact number</span>
                <input
                  type="search"
                  value={searchQuery}
                  onChange={event => setSearchQuery(event.target.value)}
                  placeholder="Search staff accounts…"
                  autoComplete="off"
                />
                {searchQuery && (
                  <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                    <Icon name="x" size={15} />
                  </button>
                )}
              </label>
              <label className="staff-status-filter">
                <span className="sr-only">Filter staff accounts</span>
                <select value={accountFilter} onChange={event => setAccountFilter(event.target.value)}>
                  {STATUS_FILTERS.map(filter => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
                </select>
              </label>
            </div>

            {potentialTestCount > 0 && (
              <div className="staff-review-notice">
                <Icon name="info" size={16} />
                <p>
                  Accounts named <code>temp_</code> followed by digits match the timestamped username pattern used by the integration tests.
                  They are marked as <strong>potential test accounts</strong>, not confirmed test data. Verify their origin before changing their status.
                </p>
              </div>
            )}
          </div>

          <div className="staff-list-scroll" role="region" aria-label="Filtered staff accounts" tabIndex={0}>
            {filteredStaff.map(item => {
              const hasDirectoryAccess = (item.extra_permissions || []).includes('VIEW_STAFF_DIRECTORY');
              const potentialTestAccount = isPotentialTestAccount(item);

              return (
                <article key={item.staff_id} className={`staff-account-row ${potentialTestAccount ? 'staff-account-row--review' : ''}`}>
                  <div className="staff-account-topline">
                    <div className="staff-account-identity">
                      <div className="staff-account-avatar" aria-hidden="true">
                        <Icon name="user" size={18} />
                      </div>
                      <div className="staff-account-copy">
                        <div className="staff-account-name-row">
                          <h3>{item.username}</h3>
                          {potentialTestAccount && (
                            <span
                              className="staff-potential-test-tag"
                              title="This username matches the timestamped pattern used by integration tests; its origin is not confirmed."
                            >
                              Potential test account
                            </span>
                          )}
                        </div>
                        <p>{item.role} <span aria-hidden="true">·</span> {item.employee_id || 'No employee ID'}</p>
                      </div>
                    </div>
                    <Badge tone={item.is_active ? 'green' : 'neutral'}>{item.is_active ? 'Active' : 'Deactivated'}</Badge>
                  </div>

                  <div className="staff-account-actions">
                    <Button variant="secondary" icon="history" onClick={() => history(item)}>Sign-in history</Button>
                    <Button variant="secondary" onClick={() => toggleDirectoryPermission(item)}>
                      {hasDirectoryAccess ? 'Revoke directory access' : 'Grant directory access'}
                    </Button>
                    <Button
                      variant={item.is_active ? 'danger' : 'success'}
                      disabled={item.staff_id === currentUser?.staff_id && item.is_active}
                      onClick={() => toggle(item)}
                    >
                      {item.is_active ? 'Deactivate' : 'Reactivate'}
                    </Button>
                  </div>
                </article>
              );
            })}

            {!filteredStaff.length && (
              <EmptyState
                title={staffRecords.length ? 'No matching accounts' : 'No staff accounts'}
                message={staffRecords.length ? 'Try another search term or status filter.' : 'Create a staff account to begin.'}
                action={staffRecords.length && (searchQuery || accountFilter !== 'all')
                  ? <Button variant="secondary" onClick={clearFilters}>Clear filters</Button>
                  : null}
              />
            )}
          </div>
        </Card>
      </div>

      {events && (
        <Modal title={`Sign-in history — ${events.staff.username}`} onClose={() => setEvents(null)} scrollBody>
          {events.events.length ? (
            <div className="staff-login-history-table-wrap">
              <table className="staff-login-history-table">
                <thead>
                  <tr>
                    <th scope="col">Date &amp; time</th>
                    <th scope="col">Source IP</th>
                  </tr>
                </thead>
                <tbody>
                  {events.events.map(event => (
                    <tr key={event.event_id}>
                      <td>{formatDateTime(event.logged_in_at)}</td>
                      <td><span className="font-mono text-xs">{event.ip_address || '—'}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState title="No sign-ins" message="No sign-in events have been recorded for this account." />
          )}
        </Modal>
      )}
    </div>
  );
}
