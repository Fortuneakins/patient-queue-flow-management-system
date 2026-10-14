import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon';

export default function DisplayBoardView({ publicQueue, predictions, liveConnected = false }) {
  const [clock, setClock] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setClock(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const now = publicQueue.now_serving;
  const tiers = [
    { id: 1, label: 'Immediate', tone: 'critical' },
    { id: 2, label: 'Urgent', tone: 'urgent' },
    { id: 3, label: 'Standard', tone: 'standard' },
    { id: 4, label: 'Routine', tone: 'routine' }
  ];

  return (
    <main id="main-content" tabIndex={-1} className="display-board app-page-enter">
      <div className="display-board-inner">
        <div className="display-topline">
          <div className="display-hospital-mark"><Icon name="heart" size={21} /></div>
          <div className="display-heading-copy"><p className="eyebrow eyebrow--gold">Robert Mangaliso Sobukwe Hospital</p><h1>Outpatient waiting room</h1><p>Clear, current queue information for patients and visitors.</p></div>
          <div className="display-clock-panel">
            <span className="display-clock-label">Local time · South Africa</span>
            <strong className="display-clock font-mono">{clock.toLocaleTimeString('en-ZA', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</strong>
            <span className={`display-live-indicator ${liveConnected ? 'is-connected' : 'is-disconnected'}`} role="status" aria-live="polite"><span className="connection-dot" aria-hidden="true" />{liveConnected ? 'Live queue' : 'Reconnecting to queue'}</span>
          </div>
        </div>

        <div className="display-board-grid">
          <section className="display-now-panel" aria-labelledby="display-now-title">
            <div className="display-section-header"><div><p className="eyebrow eyebrow--light">Queue announcement</p><h2 id="display-now-title">Now serving</h2></div><span className="display-announce-icon"><Icon name="volume" size={18} /></span></div>
            <div className="display-now-card" role="status" aria-live="polite" aria-atomic="true">
              <div className="display-signal-bar" aria-hidden="true" />
              <span className="display-now-kicker">Please have your ticket ready</span>
              <strong className="display-ticket-number font-mono">{now || '—'}</strong>
              <span className="display-now-divider" aria-hidden="true" />
              <p>{now ? 'Please proceed to the indicated consultation room.' : 'A ticket will appear here when a doctor calls the next patient.'}</p>
            </div>
            <div className="display-guidance-row"><Icon name="info" size={17} /><p>When your ticket is called, please proceed to the consultation room or follow staff instructions.</p></div>
          </section>

          <section className="display-wait-panel" aria-labelledby="display-estimate-title">
            <div className="display-section-header display-section-header--dark"><div><p className="eyebrow eyebrow--gold">Live service estimate</p><h2 id="display-estimate-title">Estimated waiting time</h2></div><span className="display-clock-symbol"><Icon name="clock" size={20} /></span></div>
            <div className="display-estimates-grid">
              {tiers.map(tier => (
                <div key={tier.id} className={`display-estimate-tile display-estimate-tile--${tier.tone}`}>
                  <div className="display-estimate-top"><span className="display-tier-indicator" /><span>Tier {tier.id}</span></div>
                  <strong
                    aria-label={predictions.degraded ? 'Estimate unavailable' : `${predictions[String(tier.id)] ?? 0} minutes`}
                  >
                    {predictions.degraded ? '—' : (
                      <>
                        <span>{predictions[String(tier.id)] ?? 0}</span>
                        <small> min</small>
                      </>
                    )}
                  </strong>
                  <span className="display-tier-label">{tier.label}</span>
                </div>
              ))}
            </div>
            <div className="display-waiting-list" aria-label="Current waiting counts" aria-live="polite" aria-atomic="false">
              {tiers.map(tier => (
                <div key={tier.id} className="display-waiting-row">
                  <div className={`display-tier-dot display-tier-dot--${tier.tone}`} aria-hidden="true" />
                  <span>Tier {tier.id} · {tier.label}</span>
                  <strong>{publicQueue.waiting_counts?.[tier.id] ?? 0}</strong>
                  <small>waiting</small>
                </div>
              ))}
            </div>
            {predictions.degraded && <div className="display-estimate-warning" role="status"><Icon name="alert" size={16} /> Waiting-time estimates are temporarily unavailable. Queue operations continue normally.</div>}
            <p className="display-estimate-disclaimer"><Icon name="shield" size={15} /> Estimates are guidance, not a guarantee. Patients are called by clinical staff; reaching zero does not automatically change queue status.</p>
          </section>
        </div>

        <footer className="display-footer">
          <div className="display-footer-brand"><Icon name="heart" size={16} /><span>RMSH Clinical System</span></div>
          <p>This board intentionally excludes patient names, identification numbers and clinical notes.</p>
          <span className="display-footer-live"><span className="connection-dot" aria-hidden="true" />{liveConnected ? 'Connected' : 'Connection pending'}</span>
        </footer>
      </div>
    </main>
  );
}
