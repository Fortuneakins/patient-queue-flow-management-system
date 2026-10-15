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

const sections = [
  { id: 'flow', label: 'FlowTwin', icon: 'chart', desc: 'Predict and simulate operational pressure' },
  { id: 'journeys', label: 'CareGraph', icon: 'layout', desc: 'Track configurable patient-service stages' },
  { id: 'resources', label: 'Resources & continuity', icon: 'settings', desc: 'Manage resources and safely sync offline status changes' },
  { id: 'learning', label: 'Safety & prediction truth', icon: 'shield', desc: 'Review overdue waits and prediction accuracy' },
  { id: 'lab', label: 'Synthetic lab', icon: 'chart', desc: 'Run repeatable synthetic clinic scenarios' },
  { id: 'events', label: 'Flight Recorder', icon: 'history', desc: 'Inspect the append-only operational event history' },
  { id: 'referrals', label: 'Referral Relay', icon: 'arrow', desc: 'Track referral acknowledgements and hand-offs' },
  { id: 'access', label: 'Access Bridge', icon: 'volume', desc: 'Manage contact consent and operational SMS updates' }
];

export default function ClinicIntelligenceView({ token, currentUser }) {
  const [active, setActive] = useState('flow');
  const selected = sections.find(section => section.id === active) || sections[0];
  let panel;
  if (active === 'flow') panel = <FlowTwinPanel token={token} />;
  else if (active === 'journeys') panel = <CareGraphPanel token={token} canManage={true} />;
  else if (active === 'resources') panel = <ResourcesPanel token={token} currentUser={currentUser} />;
  else if (active === 'learning') panel = <LearningPanel token={token} />;
  else if (active === 'lab') panel = <SyntheticLabPanel token={token} />;
  else if (active === 'events') panel = <FlightRecorderPanel token={token} />;
  else if (active === 'referrals') panel = <ReferralRelayPanel token={token} />;
  else panel = <AccessBridgePanel token={token} />;

  return (
    <div className="space-y-6">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-slate-700">Operational intelligence</p>
          <Badge tone="teal">FlowTwin · v1 foundations</Badge>
        </div>
        <h1 className="mt-1 font-display text-2xl font-bold">Clinic Intelligence</h1>
        <p className="mt-1 max-w-3xl text-sm text-stone-500">Model patient-flow dependencies, simulate operational scenarios, audit what happened and measure forecasts. This supports authorised staff; it never changes clinical priority automatically.</p>
      </div>
      <Card className="p-3">
        <nav aria-label="Clinic intelligence sections" className="flex flex-wrap gap-2">
          {sections.map(section => (
            <button key={section.id} type="button" onClick={() => setActive(section.id)} aria-current={active === section.id ? 'page' : undefined} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition ${active === section.id ? 'border-teal-800 bg-teal-800 text-white shadow-sm' : 'border-stone-200 bg-white text-stone-600 hover:border-teal-300 hover:bg-teal-50'}`}>
              <Icon name={section.icon} size={16} />
              <span>{section.label}</span>
            </button>
          ))}
        </nav>
      </Card>
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500"><Icon name="info" size={15} /><span>{selected.desc}. Use synthetic scenarios for demonstrations; simulation outputs are estimates, not clinical guarantees.</span></div>
      {panel}
    </div>
  );
}
