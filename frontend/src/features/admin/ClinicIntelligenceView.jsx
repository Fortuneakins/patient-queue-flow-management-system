import { useState } from 'react';
import Icon from '../../components/ui/Icon';
import { Badge, Button, Card } from '../../components/ui';
import ClinicIntelligenceHome from './ClinicIntelligenceHome';
import FlowTwinPanel from './intelligence/FlowTwinPanel';
import CareGraphPanel from './intelligence/CareGraphPanel';
import ResourcesPanel from './intelligence/ResourcesPanel';
import LearningPanel from './intelligence/LearningPanel';
import FlightRecorderPanel from './intelligence/FlightRecorderPanel';
import SyntheticLabPanel from './intelligence/SyntheticLabPanel';
import ReferralRelayPanel from './intelligence/ReferralRelayPanel';
import AccessBridgePanel from './intelligence/AccessBridgePanel';
import ContinuityLabPanel from './intelligence/ContinuityLabPanel';

const homeSection = { id: 'home', label: 'Overview', icon: 'chart', desc: 'Live operational pulse, review prompts and guided next actions' };
const sections = [
  { id: 'flow', label: 'FlowTwin', icon: 'chart', desc: 'Compare current operations with a what-if scenario' },
  { id: 'journeys', label: 'CareGraph', icon: 'layout', desc: 'Track role-controlled patient-service stages' },
  { id: 'resources', label: 'Resource status', icon: 'settings', desc: 'Inspect resources and synchronise administrator status changes' },
  { id: 'referrals', label: 'Referral Relay', icon: 'arrow', desc: 'Track internal referral acknowledgements and handovers' },
  { id: 'lab', label: 'Synthetic Lab', icon: 'activity', desc: 'Run repeatable synthetic clinic stress tests' },
  { id: 'continuity', label: 'Continuity Lab', icon: 'refresh', desc: 'Inspect synthetic downtime-recovery discrepancies' },
  { id: 'learning', label: 'Safety and prediction truth', icon: 'shield', desc: 'Review operational delays and observed forecast errors' },
  { id: 'events', label: 'Flight Recorder', icon: 'history', desc: 'Trace recorded operational events and state transitions' },
  { id: 'access', label: 'Access Bridge', icon: 'users', desc: 'Review contact consent and operational message controls' }
];

export default function ClinicIntelligenceView({ token, currentUser }) {
  const [active, setActive] = useState('home');
  const selected = active === 'home'
    ? homeSection
    : sections.find(section => section.id === active) || homeSection;
  let panel;
  if (active === 'home') panel = <ClinicIntelligenceHome token={token} onOpenTool={setActive} />;
  else if (active === 'flow') panel = <FlowTwinPanel token={token} />;
  else if (active === 'journeys') panel = <CareGraphPanel token={token} canManage={true} currentRole="ADMIN" />;
  else if (active === 'resources') panel = <ResourcesPanel token={token} currentUser={currentUser} canManage={true} />;
  else if (active === 'learning') panel = <LearningPanel token={token} />;
  else if (active === 'lab') panel = <SyntheticLabPanel token={token} />;
  else if (active === 'events') panel = <FlightRecorderPanel token={token} />;
  else if (active === 'continuity') panel = <ContinuityLabPanel token={token} />;
  else if (active === 'referrals') panel = <ReferralRelayPanel token={token} canManage={true} />;
  else if (active === 'access') panel = <AccessBridgePanel token={token} />;

  return (
    <div className="clinic-intelligence-view space-y-4">
      <header className="clinic-intelligence-hero">
        <span className="clinic-intelligence-hero-icon" aria-hidden="true">
          <Icon name="chart" size={25} />
        </span>
        <div className="clinic-intelligence-hero-copy">
          <div className="clinic-intelligence-eyebrows">
            <p className="eyebrow">Operational intelligence</p>
            <Badge tone="teal">Human-reviewed · evidence-led</Badge>
          </div>
          <h1 className="font-display">Clinic Intelligence</h1>
          <p>Understand the current operating picture, explore scenarios, track dependencies and examine what the system has recorded. Intelligence assists authorised staff; it does not change clinical priority automatically.</p>
        </div>
      </header>

      {active !== 'home' && (
        <Card className="p-3 md:p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="secondary" icon="arrow" onClick={() => setActive('home')}>Back to overview</Button>
            <label className="flex flex-1 flex-col gap-1 sm:max-w-md">
              <span className="text-xs font-bold uppercase tracking-wide text-stone-500">Switch specialist tool</span>
              <select
                aria-label="Switch Clinic Intelligence tool"
                className="w-full rounded-xl border border-stone-300 bg-white px-3 py-2.5 text-sm text-stone-900 outline-none focus:border-teal-700 focus:ring-2 focus:ring-teal-100"
                value={active}
                onChange={event => setActive(event.target.value)}
              >
                {sections.map(section => <option key={section.id} value={section.id}>{section.label}</option>)}
              </select>
            </label>
            <p className="text-sm text-stone-500 sm:max-w-xs">{selected.desc}</p>
          </div>
        </Card>
      )}

      {active !== 'home' && (
        <section className="clinic-intelligence-context" aria-live="polite">
          <span className="clinic-intelligence-context-icon"><Icon name={selected.icon} size={18} /></span>
          <div className="clinic-intelligence-context-copy">
            <span className="clinic-intelligence-context-label">What this tool is for</span>
            <strong>{selected.label}</strong>
            <p>{selected.desc}</p>
          </div>
          <div className="clinic-intelligence-safety-note">
            <Icon name="info" size={16} />
            <span>Simulations are estimates, not clinical guarantees. Synthetic scenarios do not change live queue actions or clinical priority.</span>
          </div>
        </section>
      )}

      <div key={active} className="clinic-intelligence-panel-enter">
        {panel}
      </div>
    </div>
  );
}
