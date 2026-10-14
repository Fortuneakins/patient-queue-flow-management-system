import { useState } from 'react';
import Icon from '../../components/ui/Icon';
import { Button, Card, Field, inputClass, Badge, Spinner } from '../../components/ui';
import { firstName } from '../../utils/format';

export default function KioskView({ publicQueue, predictions, onVerify, onCheckIn, liveConnected = false }) {
  const [form, setForm] = useState({ identification_number: '', symptoms: '' });
  const [verified, setVerified] = useState(null);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [ticket, setTicket] = useState(null);

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    setBusy(true);
    try {
      const result = await onCheckIn({ identification_number: form.identification_number, symptoms: form.symptoms.trim() });
      setTicket(result.ticket_number);
      setForm({ identification_number: '', symptoms: '' });
      setVerified(null);
    } catch (error) {
      setMessage(error.message || 'Check-in failed. Please try again or ask Reception for assistance.');
    } finally {
      setBusy(false);
    }
  }

  async function verify() {
    setMessage('');
    setBusy(true);
    try {
      const result = await onVerify(form.identification_number);
      setVerified(result);
    } catch (error) {
      setVerified(null);
      setMessage(error.message || 'Patient record could not be verified.');
    } finally {
      setBusy(false);
    }
  }

  if (ticket) {
    return (
      <main id="main-content" tabIndex={-1} className="kiosk-success-page app-page-enter">
        <Card className="kiosk-ticket-success w-full max-w-2xl overflow-hidden">
          <div className="kiosk-ticket-success-hero">
            <div className="success-icon-wrap"><Icon name="checkCircle" size={30} /></div>
            <p className="eyebrow eyebrow--gold">Check-in successful</p>
            <h1 className="ticket-number font-mono">{ticket}</h1>
            <p className="success-message">Your place in the queue is confirmed. Please take a seat; your ticket will be called when a doctor is ready.</p>
            <div className="success-confirmation"><Icon name="shield" size={16} /> Ticket created successfully</div>
          </div>
          <div className="kiosk-ticket-success-actions">
            <Button onClick={() => setTicket(null)} icon="refresh">Return to Kiosk</Button>
            <p>Keep your ticket number available for reference.</p>
          </div>
        </Card>
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="kiosk-page app-page-enter">
      <div className="kiosk-intro-strip">
        <div className="kiosk-intro-icon"><Icon name="heart" size={22} /></div>
        <div className="kiosk-intro-copy">
          <p className="eyebrow">Robert Mangaliso Sobukwe Hospital</p>
          <h1>Outpatient check-in</h1>
          <p>Welcome. Verify your patient record to join the queue, or ask Reception if you need assistance.</p>
        </div>
        <div className={`connection-chip ${liveConnected ? 'is-connected' : 'is-disconnected'}`} role="status" aria-live="polite">
          <span className="connection-dot" aria-hidden="true" /> {liveConnected ? 'Live updates' : 'Reconnecting'}
        </div>
      </div>

      <div className="kiosk-layout">
        <Card className="kiosk-form-card p-7 md:p-9">
          <div className="kiosk-section-heading">
            <div className="kiosk-section-symbol"><Icon name={verified ? 'checkCircle' : 'ticket'} size={23} /></div>
            <div>
              <p className="eyebrow">Patient kiosk</p>
              <h2>{verified ? 'Confirm your visit details' : 'Join the outpatient queue'}</h2>
              <p>{verified ? 'Your patient record has been verified. Tell us why you are visiting today.' : 'Use your identification number or passport number. No staff sign-in is required.'}</p>
            </div>
          </div>

          {!verified ? (
            <form className="kiosk-form-body" onSubmit={(event) => { event.preventDefault(); verify(); }}>
              <Field label="Identification number" required htmlFor="kiosk-identification" hint="Enter your South African ID number or passport number.">
                <div className="kiosk-input-row">
                  <input id="kiosk-identification" className={inputClass} autoComplete="off" inputMode="text" maxLength={20} required value={form.identification_number} onChange={event => setForm({ ...form, identification_number: event.target.value.toUpperCase() })} />
                  <Button type="submit" disabled={!form.identification_number.trim() || busy} icon={busy ? undefined : 'search'}>{busy ? <><Spinner /> Verifying</> : 'Verify record'}</Button>
                </div>
              </Field>
            </form>
          ) : (
            <form onSubmit={submit} className="kiosk-form-body">
              <div className="verified-patient-banner">
                <div className="verified-patient-mark"><Icon name="checkCircle" size={20} /></div>
                <div className="verified-patient-copy"><p className="eyebrow">Patient verified</p><strong>{firstName(verified.first_name)}</strong><span>Identity check complete</span></div>
                <Badge tone="green">Ready to check in</Badge>
              </div>
              <Field label="Reason for visit" required id="kiosk-reason" hint={`${form.symptoms.length}/500 characters. Please do not include unnecessary sensitive details.`}>
                <textarea className={`${inputClass} kiosk-reason-field resize-y`} maxLength={500} id="kiosk-reason" required value={form.symptoms} onChange={event => setForm({ ...form, symptoms: event.target.value })} />
              </Field>
              <div className="kiosk-form-actions">
                <Button type="submit" disabled={busy || !form.symptoms.trim()} icon="ticket">{busy ? <><Spinner /> Creating ticket</> : 'Join queue'}</Button>
                <Button variant="secondary" type="button" onClick={() => { setVerified(null); setMessage(''); }} disabled={busy}>Use another patient</Button>
              </div>
            </form>
          )}

          {message && <div className="form-message form-message--error" role="alert"><Icon name="alert" size={17} /><span>{message}</span></div>}
          <div className="kiosk-privacy-note"><Icon name="shield" size={16} /><p><strong>Your privacy matters.</strong> Your identification number and clinical details are not shown on the public waiting-room board.</p></div>
        </Card>

        <aside className="kiosk-side-panels" aria-label="Live queue information">
          <Card className="queue-status-card p-6">
            <div className="panel-heading-row">
              <div><p className="eyebrow">Queue status</p><h2>Live waiting room</h2></div>
              <span className={`status-pill ${liveConnected ? 'is-connected' : 'is-disconnected'}`}><span className="connection-dot" aria-hidden="true" />{liveConnected ? 'Live' : 'Offline'}</span>
            </div>
            <div className="now-serving-card" role="status" aria-live="polite" aria-atomic="true">
              <span className="now-serving-label">Now serving</span>
              <strong className="now-serving-ticket font-mono">{publicQueue.now_serving || '—'}</strong>
              <span className="now-serving-subtitle">Ticket number only · no patient names displayed</span>
            </div>
            <div className="queue-tier-grid" aria-label="Patients waiting by priority tier">
              {[1, 2, 3, 4].map(tier => (
                <div key={tier} className={`queue-tier-card queue-tier-card--${tier}`}>
                  <span>Tier {tier}</span>
                  <strong>{publicQueue.waiting_counts?.[tier] ?? 0}</strong>
                  <small>{['Immediate', 'Urgent', 'Standard', 'Routine'][tier - 1]}</small>
                </div>
              ))}
            </div>
          </Card>

          <Card className="estimate-card p-6">
            <div className="panel-heading-row estimate-heading">
              <div className="section-title-with-icon"><span className="section-title-icon"><Icon name="clock" size={18} /></span><div><p className="eyebrow">Planning estimate</p><h2>Estimated waiting time</h2></div></div>
              <span className="estimate-refresh-note"><span className="pulse-dot" /> Auto-updating</span>
            </div>
            <div className="estimate-grid">
              {[1, 2, 3, 4].map(tier => (
                <div key={tier} className={`estimate-tile estimate-tile--${tier}`}>
                  <span>Tier {tier}</span>
                  <strong>{predictions.degraded ? '—' : `${predictions[String(tier)] ?? 0} min`}</strong>
                  <small>{['Immediate', 'Urgent', 'Standard', 'Routine'][tier - 1]}</small>
                </div>
              ))}
            </div>
            <p className="estimate-footnote"><Icon name="info" size={14} /> Estimates are refreshed automatically. Actual waiting times vary and do not automatically call a patient.</p>
            {predictions.degraded && <div className="form-message form-message--warning" role="status">Estimate unavailable. Queue operations continue normally.</div>}
          </Card>
        </aside>
      </div>
    </main>
  );
}
