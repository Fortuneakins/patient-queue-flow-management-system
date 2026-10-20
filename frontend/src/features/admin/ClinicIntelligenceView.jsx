import { useEffect, useRef, useState } from 'react';
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

function ToolSwitcher({ active, sections, onSelect }) {
  const [open, setOpen] = useState(false);
  const [focusIndex, setFocusIndex] = useState(() => Math.max(0, sections.findIndex(section => section.id === active)));
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const optionRefs = useRef([]);
  const selectedIndex = Math.max(0, sections.findIndex(section => section.id === active));
  const selected = sections[selectedIndex] || sections[0];

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event) {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    }
    function handleEscape(event) {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    }
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleEscape);
    optionRefs.current[focusIndex]?.focus();
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open, focusIndex]);

  function showMenu(index = selectedIndex) {
    setFocusIndex(Math.max(0, Math.min(sections.length - 1, index)));
    setOpen(true);
  }

  function choose(section) {
    onSelect(section.id);
    setOpen(false);
    triggerRef.current?.focus();
  }

  function handleTriggerKeyDown(event) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      showMenu(selectedIndex);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      showMenu(selectedIndex);
    } else if (event.key === 'Home') {
      event.preventDefault();
      showMenu(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      showMenu(sections.length - 1);
    }
  }

  function handleOptionKeyDown(event, index) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setFocusIndex((index + 1) % sections.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setFocusIndex((index - 1 + sections.length) % sections.length);
    } else if (event.key === 'Home') {
      event.preventDefault();
      setFocusIndex(0);
    } else if (event.key === 'End') {
      event.preventDefault();
      setFocusIndex(sections.length - 1);
    } else if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      choose(sections[index]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      setOpen(false);
      triggerRef.current?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  }

  return (
    <div className="clinic-tool-switcher" ref={rootRef}>
      <span className="clinic-tool-switcher-label" id="clinic-tool-switcher-label">Switch specialist tool</span>
      <button
        ref={triggerRef}
        type="button"
        className={`clinic-tool-switcher-trigger${open ? ' is-open' : ''}`}
        aria-labelledby="clinic-tool-switcher-label"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="clinic-tool-switcher-menu"
        onClick={() => open ? setOpen(false) : showMenu()}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className="clinic-tool-switcher-trigger-icon"><Icon name={selected.icon} size={18} /></span>
        <span className="clinic-tool-switcher-trigger-copy">
          <strong>{selected.label}</strong>
          <small>{selected.desc}</small>
        </span>
        <span className="clinic-tool-switcher-trigger-meta">9 tools</span>
        <Icon name="chevronDown" size={17} className={`clinic-tool-switcher-chevron${open ? ' is-open' : ''}`} />
      </button>

      {open && (
        <div className="clinic-tool-switcher-menu" id="clinic-tool-switcher-menu" role="listbox" aria-labelledby="clinic-tool-switcher-label">
          <div className="clinic-tool-switcher-menu-header">
            <div>
              <strong>Choose a workbench</strong>
              <span>Switch tools without losing the clinic context.</span>
            </div>
            <span className="clinic-tool-switcher-menu-count">{sections.length} available</span>
          </div>
          <div className="clinic-tool-switcher-options">
            {sections.map((section, index) => (
              <button
                key={section.id}
                ref={node => { optionRefs.current[index] = node; }}
                type="button"
                role="option"
                aria-selected={section.id === active}
                className={`clinic-tool-switcher-option${section.id === active ? ' is-selected' : ''}`}
                onClick={() => choose(section)}
                onKeyDown={event => handleOptionKeyDown(event, index)}
                tabIndex={focusIndex === index ? 0 : -1}
              >
                <span className="clinic-tool-switcher-option-icon"><Icon name={section.icon} size={17} /></span>
                <span className="clinic-tool-switcher-option-copy">
                  <strong>{section.label}</strong>
                  <small>{section.desc}</small>
                </span>
                {section.id === active && <span className="clinic-tool-switcher-current"><Icon name="checkCircle" size={15} /> Current</span>}
                {section.id !== active && <Icon name="arrow" size={15} className="clinic-tool-switcher-option-arrow" />}
              </button>
            ))}
          </div>
          <div className="clinic-tool-switcher-menu-footer">
            <Icon name="info" size={15}/>
            <span>Simulations are advisory and do not change live queue records or clinical priority.</span>
          </div>
        </div>
      )}
    </div>
  );
}

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
        <Card className="clinic-tool-switcher-shell p-3 md:p-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <Button variant="secondary" icon="arrow" onClick={() => setActive('home')}>Back to overview</Button>
            <div className="min-w-0 flex-1">
              <ToolSwitcher active={active} sections={sections} onSelect={setActive} />
            </div>
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
