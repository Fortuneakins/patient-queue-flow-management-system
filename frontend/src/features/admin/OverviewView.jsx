import { Card, Badge } from '../../components/ui';
import Icon from '../../components/ui/Icon';

const metricDefinitions = [
  { key: 'waiting', label: 'Waiting', icon: 'users', tone: 'waiting', hint: 'Patients in the waiting queue' },
  { key: 'in_consultation', label: 'In consultation', icon: 'clock', tone: 'consultation', hint: 'Visits currently being seen' },
  { key: 'discharged_today', label: 'Discharged today', icon: 'checkCircle', tone: 'discharged', hint: 'Completed visits today' },
  { key: 'discharged_tier_1', label: 'Tier 1 discharged', icon: 'shield', tone: 'priority', hint: 'Tier 1 visits discharged today' }
];

export default function OverviewView({ overview, performance = [] }) {
  const cards = metricDefinitions.map(metric => ({
    ...metric,
    value: overview?.[metric.key] ?? 0
  }));
  const staffDischarges = Array.isArray(performance) ? performance : [];

  return (
    <div className="overview-dashboard">
      <section className="overview-metrics-card" aria-label="Current clinic metrics">
        <div className="overview-section-heading">
          <div>
            <p className="eyebrow">Live operational snapshot</p>
            <h2 className="font-display">Clinic at a glance</h2>
            <p>Current queue position and completed visit totals from the operational records.</p>
          </div>
          <span className="overview-snapshot-badge"><span className="overview-snapshot-dot" /> Current snapshot</span>
        </div>

        <div className="overview-metrics-grid">
          {cards.map((card, index) => (
            <article
              key={card.key}
              className={`overview-metric-card overview-metric-card--${card.tone}`}
              style={{ '--overview-card-index': index }}
              title={card.hint}
            >
              <div className="overview-metric-topline">
                <span className="overview-metric-icon"><Icon name={card.icon} size={19} /></span>
                <span className="overview-metric-label">{card.label}</span>
              </div>
              <div className="overview-metric-value" aria-label={`${card.label}: ${card.value}`}>{card.value}</div>
              <p className="overview-metric-hint">{card.hint}</p>
            </article>
          ))}
        </div>
      </section>

      <Card className="overview-performance-card overflow-hidden">
        <header className="overview-performance-header">
          <div className="overview-performance-title">
            <span className="overview-performance-icon" aria-hidden="true"><Icon name="users" size={19} /></span>
            <div>
              <p className="eyebrow">Team activity</p>
              <h2 className="font-display">Discharges by staff today</h2>
              <p>Completed discharge records grouped by the staff member who processed them.</p>
            </div>
          </div>
          <Badge tone="teal">{staffDischarges.length} {staffDischarges.length === 1 ? 'staff member' : 'staff members'}</Badge>
        </header>

        {staffDischarges.length ? (
          <div className="overview-performance-list" role="list" aria-label="Discharges grouped by staff">
            {staffDischarges.map((item, index) => (
              <div
                key={item.staff_id}
                role="listitem"
                className="overview-performance-row"
                style={{ '--overview-row-index': Math.min(index, 5) }}
              >
                <span className="overview-staff-avatar" aria-hidden="true"><Icon name="user" size={18} /></span>
                <span className="overview-staff-name">{item.username}</span>
                <span className="overview-staff-count">{item.discharged_today} discharged</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="overview-performance-empty">
            <div className="overview-empty-art" aria-hidden="true">
              <span className="overview-empty-orbit overview-empty-orbit--outer" />
              <span className="overview-empty-orbit overview-empty-orbit--inner" />
              <span className="overview-empty-icon"><Icon name="chart" size={24} /></span>
            </div>
            <p className="overview-empty-kicker">Daily activity</p>
            <h3>No discharge activity yet</h3>
            <p>Completed consultations will appear here as discharge records are recorded today.</p>
          </div>
        )}
        <footer className="overview-performance-footer">
          <span><span className="overview-snapshot-dot" /> Operational records</span>
          <span>Figures reflect the current dashboard data</span>
        </footer>
      </Card>
    </div>
  );
}
