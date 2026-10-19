import { useMemo, useState } from 'react';
import { Badge, Card, EmptyState } from '../../components/ui';
import Icon from '../../components/ui/Icon';

const ROLE_OPTIONS = [
  { value: 'ALL', label: 'All roles' },
  { value: 'ADMIN', label: 'Administrators' },
  { value: 'DOCTOR', label: 'Doctors' },
  { value: 'NURSE', label: 'Nurses' },
  { value: 'RECEPTION', label: 'Reception' }
];

function roleIcon(role) {
  if (role === 'DOCTOR') return 'heart';
  if (role === 'NURSE') return 'checkCircle';
  if (role === 'ADMIN') return 'shield';
  return 'user';
}

function roleClass(role) {
  return String(role || 'staff').toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

export default function StaffDirectoryView({ staff = [] }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState('ALL');

  const activeStaff = useMemo(
    () => (Array.isArray(staff) ? staff : []).filter(item => item.is_active !== false),
    [staff]
  );

  const filteredStaff = useMemo(() => {
    const query = searchQuery.trim().toLocaleLowerCase();
    return activeStaff.filter(item => {
      const searchable = [item.username, item.employee_id, item.role]
        .filter(Boolean)
        .join(' ')
        .toLocaleLowerCase();
      return (!query || searchable.includes(query))
        && (roleFilter === 'ALL' || item.role === roleFilter);
    });
  }, [activeStaff, searchQuery, roleFilter]);

  function clearFilters() {
    setSearchQuery('');
    setRoleFilter('ALL');
  }

  return (
    <div className="staff-directory-view">
      <Card className="staff-directory-card overflow-hidden">
        <header className="staff-directory-header">
          <div className="staff-directory-title-row">
            <div className="staff-directory-title-copy">
              <span className="staff-directory-heading-icon" aria-hidden="true">
                <Icon name="users" size={22} />
              </span>
              <div>
                <p className="eyebrow">People &amp; permissions</p>
                <h2 className="font-display">Staff Directory</h2>
                <p className="staff-directory-subtitle">Find authorised team members and view their directory details.</p>
              </div>
            </div>
            <span className="staff-directory-readonly-badge">
              <Icon name="shield" size={14} />
              Read only
            </span>
          </div>

          <div className="staff-directory-summary-row">
            <div className="staff-directory-summary">
              <span className="staff-directory-summary-icon" aria-hidden="true"><Icon name="users" size={16} /></span>
              <span><strong>{activeStaff.length}</strong> active {activeStaff.length === 1 ? 'staff member' : 'staff members'}</span>
            </div>
            <span className="staff-directory-result-count" aria-live="polite">
              {filteredStaff.length} {filteredStaff.length === 1 ? 'result' : 'results'}
            </span>
          </div>

          <div className="staff-directory-filter-row">
            <label className="staff-directory-search">
              <Icon name="search" size={17} />
              <span className="sr-only">Search by username or employee ID</span>
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search username or employee ID…"
                autoComplete="off"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                  <Icon name="x" size={15} />
                </button>
              )}
            </label>
            <label className="staff-directory-role-filter">
              <span className="sr-only">Filter staff by role</span>
              <Icon name="users" size={15} />
              <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)}>
                {ROLE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>

          <div className="staff-directory-permission-note">
            <Icon name="lock" size={15} />
            <p>This is a read-only directory. Access is controlled by the <code>VIEW_STAFF_DIRECTORY</code> permission.</p>
          </div>
        </header>

        <div className="staff-directory-list" role="list" aria-label="Active staff directory results">
          {filteredStaff.map((item, index) => {
            const role = roleClass(item.role);
            return (
              <article
                key={item.staff_id}
                className="staff-directory-row"
                role="listitem"
                style={{ '--directory-row-index': Math.min(index, 5) }}
              >
                <span className={`staff-directory-avatar staff-directory-avatar--${role}`} aria-hidden="true">
                  <Icon name={roleIcon(item.role)} size={20} />
                </span>
                <div className="staff-directory-person">
                  <h3>{item.username}</h3>
                  <div className="staff-directory-employee">
                    <Icon name="id-card" size={13} />
                    <span>{item.employee_id || 'No employee ID provided'}</span>
                  </div>
                </div>
                <span className={`staff-directory-role-badge staff-directory-role-badge--${role}`}>
                  {item.role}
                </span>
              </article>
            );
          })}

          {!filteredStaff.length && (
            <div className="staff-directory-empty">
              {activeStaff.length ? (
                <EmptyState
                  title="No matching staff"
                  message="Try another username, employee ID or role filter."
                  action={<button type="button" className="staff-directory-clear-button" onClick={clearFilters}>Clear filters</button>}
                />
              ) : (
                <EmptyState title="No active staff" message="No active staff accounts are currently available." />
              )}
            </div>
          )}
        </div>

        <footer className="staff-directory-footer">
          <span><span className="staff-directory-live-dot" aria-hidden="true" /> Active directory view</span>
          <span>Staff details are view-only</span>
        </footer>
      </Card>
    </div>
  );
}
