import { Button, Modal } from '../ui';
import Icon from '../ui/Icon';

function Choice({ active, onClick, children, icon }) {
  return (
    <button
      type="button"
      className={`settings-choice ${active ? 'is-selected' : ''}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
      {active && <Icon name="checkCircle" size={16} className="settings-choice-check" />}
    </button>
  );
}

export default function AccessibilitySettingsModal({ preferences, onChange, onReset, onClose }) {
  const update = (key, value) => onChange({ ...preferences, [key]: value });

  return (
    <Modal
      title="Display & accessibility"
      onClose={onClose}
      wide
      scrollBody
      footer={
        <div className="settings-footer">
          <Button variant="secondary" icon="refresh" onClick={onReset}>Reset preferences</Button>
          <Button onClick={onClose}>Done</Button>
        </div>
      }
    >
      <p className="settings-intro">
        Adjust the interface to your needs. These preferences are saved on this device and do not change clinical data or account permissions.
      </p>

      <div className="settings-section">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="sun" size={18} /></span>
          <div>
            <h3>Appearance</h3>
            <p>Choose a comfortable colour theme.</p>
          </div>
        </div>
        <div className="settings-choice-grid" role="group" aria-label="Colour theme">
          <Choice active={preferences.theme === 'light'} onClick={() => update('theme', 'light')} icon="sun">Light</Choice>
          <Choice active={preferences.theme === 'dark'} onClick={() => update('theme', 'dark')} icon="moon">Dark</Choice>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="type" size={18} /></span>
          <div>
            <h3>Text size</h3>
            <p>Increase text across the application. Layouts will adapt where needed.</p>
          </div>
        </div>
        <div className="settings-choice-grid settings-choice-grid--four" role="group" aria-label="Text size">
          <Choice active={preferences.textSize === 'standard'} onClick={() => update('textSize', 'standard')}>Standard</Choice>
          <Choice active={preferences.textSize === 'large'} onClick={() => update('textSize', 'large')}>Large</Choice>
          <Choice active={preferences.textSize === 'larger'} onClick={() => update('textSize', 'larger')}>Larger</Choice>
          <Choice active={preferences.textSize === 'largest'} onClick={() => update('textSize', 'largest')}>Largest</Choice>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="contrast" size={18} /></span>
          <div>
            <h3>Contrast</h3>
            <p>Strengthen text, boundaries and status indicators.</p>
          </div>
        </div>
        <div className="settings-choice-grid" role="group" aria-label="Contrast preference">
          <Choice active={preferences.contrast === 'standard'} onClick={() => update('contrast', 'standard')}>Standard contrast</Choice>
          <Choice active={preferences.contrast === 'high'} onClick={() => update('contrast', 'high')} icon="contrast">High contrast</Choice>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-section-heading">
          <span className="settings-section-icon"><Icon name="accessibility" size={18} /></span>
          <div>
            <h3>Motion & interaction</h3>
            <p>Reduce non-essential movement or make controls easier to target.</p>
          </div>
        </div>
        <div className="settings-choice-grid" role="group" aria-label="Motion preference">
          <Choice active={preferences.motion === 'system'} onClick={() => update('motion', 'system')}>Use device setting</Choice>
          <Choice active={preferences.motion === 'reduced'} onClick={() => update('motion', 'reduced')}>Reduce motion</Choice>
        </div>
        <label className="settings-toggle-row">
          <span>
            <strong>Larger controls</strong>
            <small>Increase the size and spacing of buttons and form fields.</small>
          </span>
          <input
            type="checkbox"
            checked={preferences.largeTargets}
            onChange={(event) => update('largeTargets', event.target.checked)}
          />
        </label>
      </div>

    </Modal>
  );
}
