import { useState } from 'react';
import { Badge, Button, Card, EmptyState, inputClass } from '../../components/ui';
import Icon from '../../components/ui/Icon';
import { formatDateTime } from '../../utils/format';

export default function PatientHistoryView({ history = [], onRefreshHistory, canSeeNotes = false }) {
  const [identificationNumber, setIdentificationNumber] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [searchedFor, setSearchedFor] = useState(null);

  const records = Array.isArray(history) ? history : [];
  const currentIdentifier = identificationNumber.trim().toUpperCase();
  const resultsAreCurrent = Boolean(searchedFor && searchedFor === currentIdentifier);
  const visibleHistory = resultsAreCurrent ? records : [];

  async function load(event) {
    event.preventDefault();
    const identifier = currentIdentifier;
    if (!identifier || loading) return;

    setError('');
    setLoading(true);
    setSearchedFor(null);
    try {
      await onRefreshHistory(identifier);
      setSearchedFor(identifier);
    } catch (err) {
      setError(err.message || 'Unable to load patient history.');
    } finally {
      setLoading(false);
    }
  }

  function updateIdentifier(value) {
    setIdentificationNumber(value.toUpperCase());
    setError('');
  }

  function clearIdentifier() {
    setIdentificationNumber('');
    setError('');
    setSearchedFor(null);
  }

  return (
    <div className="patient-history-view">
      <Card className="patient-history-lookup-card">
        <header className="patient-history-lookup-header">
          <div className="patient-history-heading-icon" aria-hidden="true">
            <Icon name="idCard" size={22} />
          </div>
          <div className="patient-history-heading-copy">
            <p className="eyebrow">Patient records</p>
            <h2 className="font-display">Patient History</h2>
            <p>Look up previously discharged visits using a patient identification number.</p>
          </div>
          <span className="patient-history-secure-badge">
            <Icon name="shield" size={14} />
            Restricted access
          </span>
        </header>

        <form className="patient-history-lookup-form" onSubmit={load} aria-busy={loading}>
          <label className="patient-history-identifier">
            <Icon name="idCard" size={18} />
            <span className="sr-only">Patient identification number</span>
            <input
              type="search"
              className={inputClass}
              placeholder="Enter patient identification number"
              value={identificationNumber}
              onChange={event => updateIdentifier(event.target.value)}
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              required
            />
            {identificationNumber && (
              <button type="button" onClick={clearIdentifier} aria-label="Clear patient identification number">
                <Icon name="x" size={15} />
              </button>
            )}
          </label>
          <Button
            type="submit"
            icon={loading ? undefined : 'history'}
            disabled={!currentIdentifier || loading}
            className="patient-history-load-button"
            aria-busy={loading}
          >
            {loading ? <><span className="patient-history-spinner" aria-hidden="true" /> Loading history</> : 'Load history'}
          </Button>
        </form>

        <div className="patient-history-privacy-note">
          <Icon name="lock" size={15} />
          <p>Patient history is confidential. Only look up a record when authorised to access it.</p>
        </div>
        {error && (
          <div className="patient-history-error" role="alert">
            <Icon name="alert" size={17} />
            <span>{error}</span>
            <button type="button" onClick={() => setError('')} aria-label="Dismiss error">
              <Icon name="x" size={15} />
            </button>
          </div>
        )}
      </Card>

      {loading ? (
        <Card className="patient-history-state-card" aria-live="polite">
          <div className="patient-history-empty-state">
            <div className="patient-history-empty-icon patient-history-empty-icon--loading" aria-hidden="true">
              <Icon name="history" size={27} />
            </div>
            <p className="patient-history-state-kicker">Retrieving records</p>
            <h3>Loading patient history</h3>
            <p>Securely retrieving discharged visits for the requested identifier.</p>
          </div>
        </Card>
      ) : visibleHistory.length ? (
        <Card className="patient-history-results-card">
          <header className="patient-history-results-header">
            <div>
              <p className="eyebrow">Visit timeline</p>
              <h2 className="font-display">Discharged visits</h2>
              <p>Previous visits recorded for the requested patient.</p>
            </div>
            <span className="patient-history-result-count">
              <Icon name="history" size={15} />
              {visibleHistory.length} {visibleHistory.length === 1 ? 'visit' : 'visits'}
            </span>
          </header>

          <div className="patient-history-timeline" role="list" aria-label="Patient discharged visit history">
            {visibleHistory.map((item, index) => (
              <article
                key={item.queue_id}
                className="patient-history-visit"
                role="listitem"
                style={{ '--patient-history-row-index': Math.min(index, 5) }}
              >
                <div className="patient-history-timeline-rail" aria-hidden="true">
                  <span><Icon name="checkCircle" size={17} /></span>
                </div>
                <div className="patient-history-visit-content">
                  <div className="patient-history-visit-topline">
                    <div className="patient-history-ticket">
                      <span>Ticket number</span>
                      <strong>{item.ticket_number}</strong>
                    </div>
                    <Badge tone="green">Discharged</Badge>
                  </div>

                  <div className="patient-history-visit-meta">
                    <span><Icon name="calendar" size={14} /> {formatDateTime(item.discharged_at)}</span>
                    <span className="patient-history-priority">Priority tier {item.priority_level || 4}</span>
                  </div>

                  <div className="patient-history-symptoms">
                    <span className="patient-history-section-label">Recorded symptoms</span>
                    <p>{item.symptoms || 'No symptom description recorded.'}</p>
                  </div>

                  {canSeeNotes && item.doctor_notes && (
                    <div className="patient-history-doctor-notes">
                      <span className="patient-history-section-label">
                        <Icon name="lock" size={13} /> Consultation notes
                      </span>
                      <p>{item.doctor_notes}</p>
                    </div>
                  )}
                </div>
              </article>
            ))}
          </div>
          <footer className="patient-history-results-footer">
            <span><span className="patient-history-footer-dot" aria-hidden="true" /> Confidential patient history</span>
            <span>{visibleHistory.length} recorded {visibleHistory.length === 1 ? 'visit' : 'visits'}</span>
          </footer>
        </Card>
      ) : (
        <Card className="patient-history-state-card">
          <div className="patient-history-empty-state">
            <div className="patient-history-empty-art" aria-hidden="true">
              <span className="patient-history-empty-orbit patient-history-empty-orbit--outer" />
              <span className="patient-history-empty-orbit patient-history-empty-orbit--inner" />
              <span className="patient-history-empty-icon">
                <Icon name="history" size={27} />
              </span>
              <span className="patient-history-empty-spark patient-history-empty-spark--one" />
              <span className="patient-history-empty-spark patient-history-empty-spark--two" />
            </div>
            <p className="patient-history-state-kicker">
              {resultsAreCurrent ? 'Lookup complete' : searchedFor && !resultsAreCurrent ? 'New lookup needed' : 'Secure record lookup'}
            </p>
            <h3>
              {resultsAreCurrent
                ? 'No discharged visits found'
                : searchedFor && !resultsAreCurrent
                  ? 'Load the new patient history'
                  : 'No history loaded'}
            </h3>
            <p>
              {resultsAreCurrent
                ? 'No discharged visits were returned for this identification number.'
                : searchedFor && !resultsAreCurrent
                  ? 'The previous results are hidden until you load history for the identifier currently entered.'
                  : 'Enter an authorised patient identification number above to view their recorded discharged visits.'}
            </p>
            {!resultsAreCurrent && !currentIdentifier && (
              <div className="patient-history-empty-hint">
                <Icon name="lock" size={14} />
                Patient details are shown only after an authorised lookup.
              </div>
            )}
          </div>
        </Card>
      )}
    </div>
  );
}
