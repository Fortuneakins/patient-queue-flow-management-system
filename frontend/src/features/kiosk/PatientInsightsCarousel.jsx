import { useEffect, useState } from 'react';
import Icon from '../../components/ui/Icon';

const ROTATION_INTERVAL_MS = 9500;

function readReducedMotionPreference() {
  const systemPreference = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const applicationPreference = typeof document !== 'undefined'
    && document.documentElement?.dataset.motion === 'reduced';
  return Boolean(systemPreference || applicationPreference);
}

const insights = [
  {
    label: 'CHECK-IN TIP',
    title: 'Keep your ticket number handy',
    message: 'After check-in, keep your ticket number available and watch the waiting-room display for updates. Reception can help if you are unsure what to do next.',
    icon: 'ticket',
    note: 'A simple way to stay oriented during your visit.'
  },
  {
    label: 'BEFORE YOU START',
    title: 'Have your identification ready',
    message: 'Use your South African ID number or passport number to verify your record. If the system cannot find your record, please ask Reception for assistance.',
    icon: 'checkCircle',
    note: 'Never enter another person’s identification details.'
  },
  {
    label: 'WAITING ROOM GUIDE',
    title: 'Waiting times are estimates',
    message: 'The estimate can change as the queue moves and patients are assessed. It is a planning guide, not a guaranteed consultation time or a signal that you have been called.',
    icon: 'clock',
    note: 'Always follow instructions from hospital staff.'
  },
  {
    label: 'YOUR PRIVACY',
    title: 'Your personal details stay private',
    message: 'The public waiting-room board shows ticket numbers rather than patient names. Avoid sharing your identification number or clinical details where others can see or hear them.',
    icon: 'shield',
    note: 'If you have a privacy concern, speak to Reception.'
  },
  {
    label: 'WE ARE HERE TO HELP',
    title: 'Ask for assistance when you need it',
    message: 'Reception can help with check-in difficulties, record verification and accessibility needs. If you feel suddenly unwell or have an urgent medical concern, alert hospital staff immediately.',
    icon: 'heart',
    note: 'Your safety comes before using the kiosk.'
  }
];

export default function PatientInsightsCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [interacting, setInteracting] = useState(false);
  const [manuallyPaused, setManuallyPaused] = useState(false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(readReducedMotionPreference);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return undefined;

    const query = typeof window.matchMedia === 'function'
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    const updatePreference = () => {
      setPrefersReducedMotion(Boolean(query?.matches || document.documentElement.dataset.motion === 'reduced'));
    };

    if (query && typeof query.addEventListener === 'function') {
      query.addEventListener('change', updatePreference);
    } else {
      query?.addListener?.(updatePreference);
    }

    const observer = typeof MutationObserver === 'function'
      ? new MutationObserver(updatePreference)
      : null;
    observer?.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });

    return () => {
      if (query && typeof query.removeEventListener === 'function') {
        query.removeEventListener('change', updatePreference);
      } else {
        query?.removeListener?.(updatePreference);
      }
      observer?.disconnect();
    };
  }, []);

  const isPaused = interacting || manuallyPaused || prefersReducedMotion;
  const activeInsight = insights[activeIndex];

  useEffect(() => {
    if (isPaused) return undefined;

    const timer = window.setInterval(() => {
      setActiveIndex(current => (current + 1) % insights.length);
    }, ROTATION_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [activeIndex, isPaused]);

  function showPrevious() {
    setActiveIndex(current => (current - 1 + insights.length) % insights.length);
  }

  function showNext() {
    setActiveIndex(current => (current + 1) % insights.length);
  }

  function handleBlur(event) {
    if (!event.currentTarget.contains(event.relatedTarget)) setInteracting(false);
  }

  return (
    <section
      className={`ui-card patient-insights-card p-6 ${isPaused ? 'is-paused' : ''}`}
      aria-label="Patient insights"
      aria-roledescription="carousel"
      onMouseEnter={() => setInteracting(true)}
      onMouseLeave={() => setInteracting(false)}
      onFocusCapture={() => setInteracting(true)}
      onBlurCapture={handleBlur}
    >
      <div className="patient-insights-heading">
        <div className="patient-insights-heading-copy">
          <span className="patient-insights-heading-icon"><Icon name="info" size={19} /></span>
          <div>
            <p className="eyebrow">Patient insights</p>
            <h2 className="patient-insights-title">A little guidance for your visit</h2>
            <p className="patient-insights-subtitle">Helpful things to know while you are here.</p>
          </div>
        </div>
        <span className="patient-insights-count" aria-label={`Tip ${activeIndex + 1} of ${insights.length}`}>
          {String(activeIndex + 1).padStart(2, '0')} <span>/ {String(insights.length).padStart(2, '0')}</span>
        </span>
      </div>

      <div className="patient-insight-slide" role="group" aria-roledescription="slide" aria-label={`Tip ${activeIndex + 1} of ${insights.length}`}>
        <div className="patient-insight-art" aria-hidden="true">
          <span className="patient-insight-orbit patient-insight-orbit--outer" />
          <span className="patient-insight-orbit patient-insight-orbit--inner" />
          <span className="patient-insight-symbol"><Icon name={activeInsight.icon} size={29} /></span>
        </div>
        <div className="patient-insight-copy" key={activeIndex}>
          <p className="patient-insight-label">{activeInsight.label}</p>
          <h3>{activeInsight.title}</h3>
          <p className="patient-insight-message">{activeInsight.message}</p>
          <p className="patient-insight-note"><Icon name="checkCircle" size={15} />{activeInsight.note}</p>
        </div>
      </div>

      <div className="patient-insights-footer">
        <div className="patient-insights-pagination" aria-label="Choose a patient insight">
          {insights.map((insight, index) => (
            <button
              key={insight.title}
              type="button"
              className={`patient-insight-dot ${index === activeIndex ? 'is-active' : ''}`}
              aria-label={`Show tip ${index + 1}: ${insight.title}`}
              aria-pressed={index === activeIndex}
              onClick={() => setActiveIndex(index)}
            />
          ))}
        </div>
        <div className="patient-insights-controls">
          <button
            type="button"
            className="patient-insight-control patient-insight-control--pause"
            onClick={() => setManuallyPaused(current => !current)}
            aria-pressed={manuallyPaused}
            disabled={prefersReducedMotion}
            aria-label={manuallyPaused ? 'Resume automatic tips' : 'Pause automatic tips'}
            title={prefersReducedMotion ? 'Automatic rotation is disabled by your reduced-motion preference' : undefined}
          >
            <span className="patient-insight-pause-mark" aria-hidden="true">{manuallyPaused ? '▶' : 'Ⅱ'}</span>
            <span>{prefersReducedMotion ? 'Motion reduced' : manuallyPaused ? 'Resume' : 'Pause tips'}</span>
          </button>
          <span className="patient-insight-control-divider" aria-hidden="true" />
          <button type="button" className="patient-insight-control" onClick={showPrevious} aria-label="Previous tip" title="Previous tip">
            <Icon name="arrow" size={17} className="patient-insight-arrow--previous" />
          </button>
          <button type="button" className="patient-insight-control" onClick={showNext} aria-label="Next tip" title="Next tip">
            <Icon name="arrow" size={17} />
          </button>
        </div>
      </div>

      <div className="patient-insight-progress" aria-hidden="true">
        <span key={`${activeIndex}-${isPaused}`} className="patient-insight-progress-fill" />
      </div>
    </section>
  );
}
