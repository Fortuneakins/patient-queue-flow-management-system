import { useState } from 'react';
import Icon from '../../components/ui/Icon';
import { Badge, Card } from '../../components/ui';
import FlowTwinPanel from './intelligence/FlowTwinPanel';
import CareGraphPanel from './intelligence/CareGraphPanel';
import ResourcesPanel from './intelligence/ResourcesPanel';
import LearningPanel from './intelligence/LearningPanel';
import FlightRecorderPanel from './intelligence/FlightRecorderPanel';
import SyntheticLabPanel from './intelligence/SyntheticLabPanel';
import ReferralRelayPanel from './intelligence/ReferralRelayPanel';
import AccessBridgePanel from './intelligence/AccessBridgePanel';
import ContinuityLabPanel from './intelligence/ContinuityLabPanel';

const sections = [
  { id: 'flow', label: 'FlowTwin', icon: 'chart', desc: 'Predict and simulate operational pressure' },
  { id: 'journeys', label: 'CareGraph', icon: 'layout', desc: 'Track configurable patient-service stages' },
  { id: 'resources', label: 'Resources & continuity', icon: 'settings', desc: 'Manage resources and safely sync offline status changes' },
  { id: 'learning', label: 'Safety & prediction truth', icon: 'shield', desc: 'Review overdue waits and prediction accuracy' },
  { id: 'lab', label: 'Synthetic lab', icon: 'chart', desc: 'Run repeatable synthetic clinic scenarios' },
  { id: 'events', label: 'Flight Recorder', icon: 'history', desc: 'Inspect the append-only operational event history' },
  { id: 'continuity', label: 'Continuity Lab', icon: 'refresh', desc: 'Reconstruct synthetic downtime events and inspect discrepancies' },
  { id: 'referrals', label: 'Referral Relay', icon: 'arrow', desc: 'Track referral acknowledgements and hand-offs' },
  { id: 'access', label: 'Access Bridge', icon: 'volume', desc: 'Manage contact consent and operational SMS updates' }
];

export default function ClinicIntelligenceView({ token, currentUser }) {
  const [active, setActive] = useState('flow');
  const selected = sections.find(section => section.id === active) || sections[0];
  let panel;
  if (active === 'flow') panel = <FlowTwinPanel token={token} />;
  else if (active === 'journeys') panel = <CareGraphPanel token={token} canManage={true} currentRole="ADMIN" />;
  else if (active === 'resources') panel = <ResourcesPanel token={token} currentUser={currentUser} canManage={true} />;
  else if (active === 'learning') panel = <LearningPanel token={token} />;
  else if (active === 'lab') panel = <SyntheticLabPanel token={token} />;
  else if (active === 'events') panel = <FlightRecorderPanel token={token} />;
  else if (active === 'continuity') panel = <ContinuityLabPanel token={token} />;
  else if (active === 'referrals') panel = <ReferralRelayPanel token={token} canManage={true} />;
  else if (active === 'access') panel = <AccessBridgePanel token={token} />;
  else panel = <FlowTwinPanel token={token} />;

  return (
    <div className="clinic-intelligence-view">
      <header className="clinic-intelligence-hero">
        <span className="clinic-intelligence-hero-icon" aria-hidden="true">
          <Icon name="chart" size={25} />
        </span>
        <div className="clinic-intelligence-hero-copy">
          <div className="clinic-intelligence-eyebrows">
            <p className="eyebrow">Operational intelligence</p>
            <Badge tone="teal">FlowTwin · v1 foundations</Badge>
          </div>
          <h1 className="font-display">Clinic Intelligence</h1>
          <p>Model patient-flow dependencies, simulate operational scenarios, audit what happened and measure forecasts. This supports authorised staff; it never changes clinical priority automatically.</p>
        </div>
      </header>

      <Card className="clinic-intelligence-navigation-card">
        <div className="clinic-intelligence-nav-heading">
          <div>
            <p className="eyebrow">Intelligence workspace</p>
            <h2 className="font-display">Choose an operational tool</h2>
          </div>
          <span className="clinic-intelligence-tool-count">{sections.length} tools</span>
        </div>
        <nav aria-label="Clinic intelligence sections" className="clinic-intelligence-nav-grid">
          {sections.map(section => (
            <button
              key={section.id}
              type="button"
              onClick={() => setActive(section.id)}
              aria-current={active === section.id ? 'page' : undefined}
              aria-pressed={active === section.id}
              className={`clinic-intelligence-nav-item ${active === section.id ? 'is-active' : ''}`}
            >
              <span className="clinic-intelligence-nav-icon"><Icon name={section.icon} size={18} /></span>
              <span className="clinic-intelligence-nav-copy">
                <strong>{section.label}</strong>
                <small>{section.desc}</small>
              </span>
              <Icon name="arrow" size={15} className="clinic-intelligence-nav-arrow" />
            </button>
          ))}
        </nav>
      </Card>

      <section className="clinic-intelligence-context" aria-live="polite">
        <span className="clinic-intelligence-context-icon"><Icon name={selected.icon} size={18} /></span>
        <div className="clinic-intelligence-context-copy">
          <span className="clinic-intelligence-context-label">Selected tool</span>
          <strong>{selected.label}</strong>
          <p>{selected.desc}</p>
        </div>
        <div className="clinic-intelligence-safety-note">
          <Icon name="info" size={16} />
          <span>Simulations are estimates, not clinical guarantees. Synthetic scenarios do not change live queue actions or clinical priority.</span>
        </div>
      </section>

      <div key={active} className="clinic-intelligence-panel-enter">
        {panel}
      </div>
    </div>
  );
}
