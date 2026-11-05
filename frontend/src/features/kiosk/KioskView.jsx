
import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon';
import {
  Button,
  Card,
  Field,
  inputClass,
  Badge,
  Spinner
} from '../../components/ui';
import { firstName } from '../../utils/format';
import PatientInsightsCarousel from './PatientInsightsCarousel';

const QUEUE_TIERS = [
  { tier: 1, label: 'Immediate' },
  { tier: 2, label: 'Urgent' },
  { tier: 3, label: 'Standard' },
  { tier: 4, label: 'Routine' }
];

const KNOWN_ESTIMATE_BASES = new Set([
  'OBSERVED_TIMINGS',
  'LIMITED_OBSERVATIONS',
  'FALLBACK_ASSUMPTION'
]);

function displayWaitEstimate(predictions, tier) {
  if (
    predictions?.degraded === true ||
    predictions?.estimate_basis === 'UNAVAILABLE' ||
    !KNOWN_ESTIMATE_BASES.has(predictions?.estimate_basis)
  ) {
    return '—';
  }

  const value = predictions[String(tier)];

  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '—';
  }

  const minutes = Number(value);

  if (
    !Number.isFinite(minutes) ||
    minutes < 0 ||
    minutes > 720
  ) {
    return '—';
  }

  return `${Math.round(minutes)} min`;
}

function displayWaitingCount(value) {
  if (value === null || value === undefined || value === '') {
    return '—';
  }

  const count = Number(value);

  if (!Number.isSafeInteger(count) || count < 0) {
    return '—';
  }

  return count;
}

function normaliseWarnings(warnings) {
  if (!Array.isArray(warnings)) {
    return [];
  }

  return [
    ...new Set(
      warnings
        .filter(item => typeof item === 'string')
        .map(item => item.trim().slice(0, 500))
        .filter(Boolean)
    )
  ].slice(0, 5);
}

function EstimateWarningDetails({
  warnings,
  title = 'View estimate limitations'
}) {
  if (!warnings.length) {
    return null;
  }

  return (
    <details className="estimate-warning-details">
      <summary>{title}</summary>

      <ul>
        {warnings.map((warning, index) => (
          <li key={`${index}-${warning}`}>
            {warning}
          </li>
        ))}
      </ul>
    </details>
  );
}

export default function KioskView({
  publicQueue,
  predictions,
  onVerify,
  onCheckIn,
  liveConnected = false
}) {
  const [form, setForm] = useState({
    identification_number: '',
    symptoms: ''
  });
  const [verified, setVerified] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(null);

  const queue =
    publicQueue && typeof publicQueue === 'object'
      ? publicQueue
      : {};

  const forecast =
    predictions && typeof predictions === 'object'
      ? predictions
      : {};

  const estimateBasis = forecast.estimate_basis;

  const estimateUnavailable =
    forecast.degraded === true ||
    estimateBasis === 'UNAVAILABLE';

  const estimateQualityUnknown =
    !estimateUnavailable &&
    !KNOWN_ESTIMATE_BASES.has(estimateBasis);

  const warnings = normaliseWarnings(forecast.warnings);

  useEffect(() => {
    if (!ticket) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setTicket(null);
    }, 60_000);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [ticket]);

  async function submit(event) {
    event.preventDefault();

    if (busy) {
      return;
    }

    setMessage('');

    const identificationNumber =
      form.identification_number.trim().toUpperCase();

    const symptoms = form.symptoms.trim();

    if (!identificationNumber || !symptoms) {
      setMessage(
        'Enter your identification number and reason for visit.'
      );
      return;
    }

    setBusy(true);

    try {
      const result = await onCheckIn({
        identification_number: identificationNumber,
        symptoms
      });

      const ticketNumber =
        typeof result?.ticket_number === 'string'
          ? result.ticket_number.trim()
          : '';

      if (!ticketNumber) {
        throw new Error(
          'We could not confirm your ticket number. ' +
          'Please ask Reception to verify your queue status before trying again.'
        );
      }

      setTicket(ticketNumber);
      setForm({
        identification_number: '',
        symptoms: ''
      });
      setVerified(null);
    } catch (error) {
      setMessage(
        error?.message ||
        'Check-in could not be confirmed. Please ask Reception for assistance.'
      );
    } finally {
      setBusy(false);
    }
  }

  async function verify(event) {
    event.preventDefault();

    if (busy) {
      return;
    }

    setMessage('');

    const identificationNumber =
      form.identification_number.trim().toUpperCase();

    if (!identificationNumber) {
      setMessage('Enter your identification number first.');
      return;
    }

    setBusy(true);

    try {
      const result = await onVerify(identificationNumber);

      if (!result || typeof result !== 'object') {
        throw new Error('Patient record could not be verified.');
      }

      setVerified(result);
    } catch (error) {
      setVerified(null);
      setMessage(
        error?.message ||
        'Patient record could not be verified. Please ask Reception for assistance.'
      );
    } finally {
      setBusy(false);
    }
  }

  function changePatient() {
  if (busy) {
    return;
  }

  setVerified(null);
  setMessage('');
  setForm({
    identification_number: '',
    symptoms: ''
  });
}

  if (ticket) {
    return (
      <main
        id="main-content"
        tabIndex={-1}
        className="kiosk-success-page app-page-enter"
      >
        <Card className="kiosk-ticket-success w-full max-w-2xl overflow-hidden">
          <div className="kiosk-ticket-success-hero">
            <div className="success-icon-wrap">
              <Icon name="checkCircle" size={30} />
            </div>

            <p className="eyebrow eyebrow--gold">
              Check-in successful
            </p>

            <h1 className="ticket-number font-mono">
              {ticket}
            </h1>

            <p className="success-message">
              Your place in the queue is confirmed. Please take a
              seat and watch the waiting-room display for updates.
            </p>

            <div className="success-confirmation">
              <Icon name="shield" size={16} />
              Ticket created successfully
            </div>
          </div>

          <div className="kiosk-ticket-success-actions">
            <Button
              onClick={() => setTicket(null)}
              icon="refresh"
            >
              Return to Kiosk
            </Button>

            <p>
              Keep your ticket number available for reference.
              For privacy, this screen returns to the kiosk
              automatically after 60 seconds.
            </p>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="kiosk-page app-page-enter"
    >
      <div className="kiosk-intro-strip">
        <div className="kiosk-intro-icon">
          <Icon name="heart" size={22} />
        </div>

        <div className="kiosk-intro-copy">
          <p className="eyebrow">
            Robert Mangaliso Sobukwe Hospital
          </p>

          <h1>Outpatient check-in</h1>

          <p>
            Welcome. Verify your patient record to join the queue,
            or ask Reception if you need assistance.
          </p>
        </div>

        <div
          className={`connection-chip ${
            liveConnected ? 'is-connected' : 'is-disconnected'
          }`}
          role="status"
          aria-live="polite"
        >
          <span className="connection-dot" aria-hidden="true" />
          {liveConnected ? 'Live updates' : 'Reconnecting'}
        </div>
      </div>

      <div className="kiosk-layout">
        <div className="kiosk-main-column">
          <Card className="kiosk-form-card p-7 md:p-9">
            <div className="kiosk-section-heading">
              <div className="kiosk-section-symbol">
                <Icon
                  name={verified ? 'checkCircle' : 'ticket'}
                  size={23}
                />
              </div>

              <div>
                <p className="eyebrow">Patient kiosk</p>

                <h2>
                  {verified
                    ? 'Confirm your visit details'
                    : 'Join the outpatient queue'}
                </h2>

                <p>
                  {verified
                    ? 'Your patient record has been verified. Tell us why you are visiting today.'
                    : 'Use your identification number or passport number. No staff sign-in is required.'}
                </p>
              </div>
            </div>

            {!verified ? (
              <form
                className="kiosk-form-body"
                onSubmit={verify}
              >
                <Field
                  label="Identification number"
                  required
                  htmlFor="kiosk-identification"
                  hint="Enter your South African ID number or passport number."
                >
                  <div className="kiosk-input-row">
                    <input
                      id="kiosk-identification"
                      name="identification_number"
                      className={inputClass}
                      type="text"
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      inputMode="text"
                      maxLength={20}
                      required
                      disabled={busy}
                      value={form.identification_number}
                      onChange={event => {
                        setForm(current => ({
                          ...current,
                          identification_number:
                            event.target.value.toUpperCase()
                        }));
                      }}
                    />

                    <Button
                      type="submit"
                      disabled={
                        !form.identification_number.trim() || busy
                      }
                      icon={busy ? undefined : 'search'}
                    >
                      {busy ? (
                        <>
                          <Spinner />
                          Verifying
                        </>
                      ) : (
                        'Verify record'
                      )}
                    </Button>
                  </div>
                </Field>
              </form>
            ) : (
              <form onSubmit={submit} className="kiosk-form-body">
                <div className="verified-patient-banner">
                  <div className="verified-patient-mark">
                    <Icon name="checkCircle" size={20} />
                  </div>

                  <div className="verified-patient-copy">
                    <p className="eyebrow">Patient verified</p>
                    <strong>{firstName(verified.first_name)}</strong>
                    <span>Identity check complete</span>
                  </div>

                  <Badge tone="green">
                    Ready to check in
                  </Badge>
                </div>

                <Field
                  label="Reason for visit"
                  required
                  id="kiosk-reason"
                  hint={`${form.symptoms.length}/500 characters. Please do not include unnecessary sensitive details.`}
                >
                  <textarea
                    className={`${inputClass} kiosk-reason-field resize-y`}
                    name="symptoms"
                    maxLength={500}
                    id="kiosk-reason"
                    required
                    disabled={busy}
                    value={form.symptoms}
                    onChange={event => {
                      setForm(current => ({
                        ...current,
                        symptoms: event.target.value
                      }));
                    }}
                  />
                </Field>

                <div className="kiosk-form-actions">
                  <Button
                    type="submit"
                    disabled={busy || !form.symptoms.trim()}
                    icon="ticket"
                  >
                    {busy ? (
                      <>
                        <Spinner />
                        Creating ticket
                      </>
                    ) : (
                      'Join queue'
                    )}
                  </Button>

                  <Button
                    variant="secondary"
                    type="button"
                    onClick={changePatient}
                    disabled={busy}
                  >
                    Use another patient
                  </Button>
                </div>
              </form>
            )}

            {message && (
              <div
                className="form-message form-message--error"
                role="alert"
              >
                <Icon name="alert" size={17} />
                <span>{message}</span>
              </div>
            )}

            <div className="kiosk-privacy-note">
              <Icon name="shield" size={16} />
              <p>
                <strong>Your privacy matters.</strong>{' '}
                Your identification number and clinical details
                are not shown on the public waiting-room board.
              </p>
            </div>
          </Card>

          <PatientInsightsCarousel />
        </div>

        <aside
          className="kiosk-side-panels"
          aria-label="Live queue information"
        >
          <Card className="queue-status-card p-6">
            <div className="panel-heading-row">
              <div>
                <p className="eyebrow">Queue status</p>
                <h2>Live waiting room</h2>
              </div>

              <span
                className={`status-pill ${
                  liveConnected ? 'is-connected' : 'is-disconnected'
                }`}
              >
                <span
                  className="connection-dot"
                  aria-hidden="true"
                />
                {liveConnected ? 'Live' : 'Offline'}
              </span>
            </div>

            <div
              className="now-serving-card"
              role="status"
              aria-live="polite"
              aria-atomic="true"
            >
              <span className="now-serving-label">
                Now serving
              </span>

              <strong className="now-serving-ticket font-mono">
                {queue.now_serving || '—'}
              </strong>

              <span className="now-serving-subtitle">
                Ticket number only · no patient names displayed
              </span>
            </div>

            <div
              className="queue-tier-grid"
              aria-label="Patients waiting by priority tier"
            >
              {QUEUE_TIERS.map(({ tier, label }) => (
                <div
                  key={tier}
                  className={`queue-tier-card queue-tier-card--${tier}`}
                >
                  <span>Tier {tier}</span>

                  <strong>
                    {displayWaitingCount(
                      queue.waiting_counts?.[tier]
                    )}
                  </strong>

                  <small>{label}</small>
                </div>
              ))}
            </div>
          </Card>

          <Card className="estimate-card p-6">
            <div className="panel-heading-row estimate-heading">
              <div className="section-title-with-icon">
                <span className="section-title-icon">
                  <Icon name="clock" size={18} />
                </span>

                <div>
  <p className="eyebrow">Planning estimate · By priority tier</p>
  <h2>Estimated wait for a new visit</h2>
  <p className="estimate-context">
    Indicative workload estimates, not a countdown for an
    existing ticket or a guaranteed waiting time.
  </p>
</div>
              </div>

              <span className="estimate-refresh-note">
                <span className="pulse-dot" />
                Auto-updating
              </span>
            </div>

            <div
              className="estimate-grid"
              aria-label="Estimated waiting time by priority tier"
            >
              {QUEUE_TIERS.map(({ tier, label }) => (
                <div
                  key={tier}
                  className={`estimate-tile estimate-tile--${tier}`}
                >
                  <span>Tier {tier}</span>

                  <strong>
                    {displayWaitEstimate(forecast, tier)}
                  </strong>

                  <small>{label}</small>
                </div>
              ))}
            </div>

            <p className="estimate-footnote">
              <Icon name="info" size={14} />
              <span>
                Estimates are planning guidance, not guarantees.
                Actual waiting times vary, and estimates do not
                automatically call a patient.
              </span>
            </p>

            {!estimateUnavailable &&
              estimateBasis === 'FALLBACK_ASSUMPTION' && (
                <div
                  className="form-message form-message--warning"
                  role="status"
                >
                  <Icon name="info" size={17} />

                  <div className="estimate-warning-copy">
                    <strong>
                      Baseline estimate — not calibrated.
                    </strong>

                    <p>
                      This planning estimate uses a default
                      service-time assumption because there is
                      not enough verified operational history.
                      Actual waiting times may vary; this is not
                      a guaranteed wait.
                    </p>

                    <EstimateWarningDetails
                      warnings={warnings}
                    />
                  </div>
                </div>
              )}

            {!estimateUnavailable &&
              estimateBasis === 'LIMITED_OBSERVATIONS' && (
                <div
                  className="form-message form-message--warning"
                  role="status"
                >
                  <Icon name="info" size={17} />

                  <div className="estimate-warning-copy">
                    <strong>
                      Estimate based on limited observations.
                    </strong>

                    <p>
                      Historical evidence is limited. Treat this
                      figure as planning guidance, not a
                      guaranteed waiting time.
                    </p>

                    <EstimateWarningDetails
                      warnings={warnings}
                    />
                  </div>
                </div>
              )}

            {estimateQualityUnknown && (
              <div
                className="form-message form-message--warning"
                role="status"
              >
                <Icon name="alert" size={17} />

                <div className="estimate-warning-copy">
                  <strong>
                    Estimate quality could not be confirmed.
                  </strong>

                  <p>
                    The system has not provided a recognised
                    estimate basis. Waiting-time figures are
                    hidden until the estimate quality can be
                    verified. Please ask Reception for assistance.
                  </p>

                  <EstimateWarningDetails
                    warnings={warnings}
                  />
                </div>
              </div>
            )}

            {estimateUnavailable && (
              <div
                className="form-message form-message--warning"
                role="status"
              >
                <Icon name="alert" size={17} />

                <div className="estimate-warning-copy">
                  <strong>
                    Waiting-time estimate unavailable.
                  </strong>

                  <p>
                    Queue operations continue normally. Please
                    ask Reception for the latest information.
                  </p>

                  <EstimateWarningDetails
                    warnings={warnings}
                  />
                </div>
              </div>
            )}

            {estimateBasis === 'OBSERVED_TIMINGS' &&
              warnings.length > 0 && (
                <div className="estimate-warning-copy">
                  <EstimateWarningDetails
                    warnings={warnings}
                    title="Forecast notes"
                  />
                </div>
              )}
          </Card>
        </aside>
      </div>
    </main>
  );
}
