import { useMemo, useState } from 'react';
import { Card, EmptyState } from '../../components/ui';
import Icon from '../../components/ui/Icon';
import { formatDateTime } from '../../utils/format';

const EMPTY_ROWS = [];

function localDateKey(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function DischargeLogView({ rows = EMPTY_ROWS }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [dischargeDate, setDischargeDate] = useState('');

  const dischargeRows = Array.isArray(rows) ? rows : EMPTY_ROWS;
  const query = searchQuery.trim().toLocaleLowerCase();

  const filteredRows = useMemo(() => dischargeRows.filter(row => {
    const searchText = [row.ticket_number, row.full_name]
      .filter(Boolean)
      .join(' ')
      .toLocaleLowerCase();
    const matchesSearch = !query || searchText.includes(query);
    const matchesDate = !dischargeDate || localDateKey(row.discharged_at) === dischargeDate;
    return matchesSearch && matchesDate;
  }), [dischargeRows, query, dischargeDate]);

  function clearFilters() {
    setSearchQuery('');
    setDischargeDate('');
  }

  const hasFilters = Boolean(searchQuery.trim() || dischargeDate);

  return (
    <div className="discharge-log-view">
      <Card className="discharge-log-card overflow-hidden">
        <header className="discharge-log-header">
          <div className="discharge-log-title-row">
            <div className="discharge-log-title-copy">
              <span className="discharge-log-heading-icon" aria-hidden="true">
                <Icon name="ticket" size={22} />
              </span>
              <div>
                <p className="eyebrow">Completed visits</p>
                <h2 className="font-display">Discharge Log</h2>
                <p className="discharge-log-subtitle">Review completed visits and when they were discharged from the clinic.</p>
              </div>
            </div>
            <span className="discharge-log-total-badge">
              <Icon name="checkCircle" size={15} />
              {dischargeRows.length} {dischargeRows.length === 1 ? 'discharge' : 'discharges'}
            </span>
          </div>

          <div className="discharge-log-summary-row">
            <div className="discharge-log-summary">
              <span className="discharge-log-live-dot" aria-hidden="true" />
              <span>Recorded discharge history</span>
            </div>
            <span className="discharge-log-result-count" aria-live="polite">
              {filteredRows.length} {filteredRows.length === 1 ? 'result' : 'results'}
            </span>
          </div>

          <div className="discharge-log-filter-row">
            <label className="discharge-log-search">
              <Icon name="search" size={17} />
              <span className="sr-only">Search by ticket number or patient name</span>
              <input
                type="search"
                value={searchQuery}
                onChange={event => setSearchQuery(event.target.value)}
                placeholder="Search ticket number or patient name…"
                autoComplete="off"
              />
              {searchQuery && (
                <button type="button" onClick={() => setSearchQuery('')} aria-label="Clear search">
                  <Icon name="x" size={15} />
                </button>
              )}
            </label>
            <label className="discharge-log-date-filter">
              <Icon name="calendar" size={16} />
              <span className="sr-only">Filter by discharge date</span>
              <input
                type="date"
                value={dischargeDate}
                onChange={event => setDischargeDate(event.target.value)}
                aria-label="Filter by discharge date"
              />
            </label>
          </div>
          <div className="discharge-log-filter-help">
            <Icon name="info" size={14} />
            <span>Search by ticket or patient; use the date filter to view discharges from one day.</span>
            {hasFilters && (
              <button type="button" onClick={clearFilters}>Clear filters</button>
            )}
          </div>
        </header>

        {filteredRows.length ? (
          <div className="discharge-log-list" role="list" aria-label="Discharge records">
            {filteredRows.map((row, index) => (
              <article
                key={row.queue_id}
                className="discharge-log-row"
                role="listitem"
                style={{ '--discharge-row-index': Math.min(index, 5) }}
              >
                <span className="discharge-log-ticket-icon" aria-hidden="true">
                  <Icon name="ticket" size={19} />
                </span>
                <div className="discharge-log-ticket">
                  <span>Ticket number</span>
                  <strong>{row.ticket_number}</strong>
                  <span className="discharge-log-completed"><Icon name="checkCircle" size={13} /> Discharged</span>
                </div>
                <div className="discharge-log-patient">
                  <h3>{row.full_name || 'Patient name unavailable'}</h3>
                  <p>
                    <span className="discharge-log-tier">Tier {row.priority_level || 4}</span>
                    <span className="discharge-log-divider" aria-hidden="true">·</span>
                    <span>Discharged by {row.discharged_by_username || '—'}</span>
                  </p>
                </div>
                <div className="discharge-log-timestamp">
                  <span><Icon name="calendar" size={14} /> Discharge date</span>
                  <strong>{formatDateTime(row.discharged_at)}</strong>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="discharge-log-empty">
            <EmptyState
              title={dischargeRows.length ? 'No matching discharges' : 'No discharges yet'}
              message={dischargeRows.length
                ? 'Try a different ticket number, patient name or date.'
                : 'Completed consultations will appear here after patients are discharged.'}
              action={hasFilters ? (
                <button type="button" className="discharge-log-clear-button" onClick={clearFilters}>Clear filters</button>
              ) : null}
            />
          </div>
        )}

        <footer className="discharge-log-footer">
          <span><span className="discharge-log-live-dot" aria-hidden="true" /> Completed discharge records</span>
          <span>Read-only history</span>
        </footer>
      </Card>
    </div>
  );
}
