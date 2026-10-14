import { useState } from 'react';
import Icon from '../ui/Icon';
import { displayRole, initials } from '../../utils/format';

export default function AppHeader({
  user,
  mode,
  onModeChange,
  onLogin,
  onLogout,
  darkMode,
  onToggleDark,
  onOpenAccessibility,
  liveConnected
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigate = (nextMode) => {
    onModeChange(nextMode);
    setMenuOpen(false);
  };

  const modeButton = (key, label, icon) => (
    <button
      key={key}
      type="button"
      onClick={() => navigate(key)}
      aria-pressed={mode === key}
      className={`app-nav-link ${mode === key ? 'is-active' : ''}`}
    >
      {icon && <Icon name={icon} size={16} />}
      <span>{label}</span>
    </button>
  );

  return (
    <>
      <a className="skip-link" href="#main-content">Skip to main content</a>
      <header className={`app-header ${darkMode ? 'is-dark' : ''}`}>
        <div className="app-header-inner">
          <div className="brand-lockup" aria-label="Robert Mangaliso Sobukwe Hospital Clinical System">
            <div className="brand-mark"><Icon name="heart" size={21} /></div>
            <div className="brand-copy">
              <div className="brand-name">RMSH Clinical System</div>
              <div className="brand-subtitle">Patient Queue &amp; Flow Management</div>
            </div>
          </div>

          <button
            type="button"
            className="mobile-menu-toggle"
            aria-expanded={menuOpen}
            aria-controls="primary-navigation"
            aria-label={menuOpen ? 'Close navigation menu' : 'Open navigation menu'}
            onClick={() => setMenuOpen((open) => !open)}
          >
            <Icon name={menuOpen ? 'x' : 'menu'} size={20} />
          </button>

          <nav
            id="primary-navigation"
            aria-label="Primary navigation"
            className={`app-navigation ${menuOpen ? 'is-open' : ''}`}
          >
            {!user && modeButton('KIOSK', 'Kiosk', 'ticket')}
            {modeButton('DISPLAY', 'Display Board', 'monitor')}

            {!user ? (
              <button type="button" onClick={() => { setMenuOpen(false); onLogin(); }} className="app-nav-link app-nav-signin">
                <Icon name="lock" size={16} />
                <span>Staff Sign-In</span>
              </button>
            ) : (
              <>
                <button type="button" onClick={() => navigate(user.role)} className="app-nav-link app-nav-workspace">
                  <Icon name="layout" size={16} />
                  <span>{displayRole(user.role)} Workspace</span>
                </button>
                <div className="header-user-pill">
                  <div className="header-user-avatar" aria-hidden="true">{initials(user.username)}</div>
                  <div className="header-user-copy">
                    <span className="header-user-name">{user.username}</span>
                    <span className="header-user-role">{displayRole(user.role)}</span>
                  </div>
                </div>
                <button type="button" onClick={() => { setMenuOpen(false); onLogout(); }} className="app-icon-button app-logout-button" aria-label="Sign out">
                  <Icon name="logout" size={17} />
                  <span className="mobile-action-label">Sign out</span>
                </button>
              </>
            )}

            <span className="nav-divider" aria-hidden="true" />
            <button type="button" onClick={onToggleDark} className="app-icon-button" aria-label={`Switch to ${darkMode ? 'light' : 'dark'} theme`} title={`Switch to ${darkMode ? 'light' : 'dark'} theme`}>
              <Icon name={darkMode ? 'sun' : 'moon'} size={18} />
              <span className="mobile-action-label">{darkMode ? 'Light theme' : 'Dark theme'}</span>
            </button>
            <button type="button" onClick={() => { setMenuOpen(false); onOpenAccessibility(); }} className="app-icon-button accessibility-open-button" aria-label="Display and accessibility settings" title="Display and accessibility settings">
              <Icon name="accessibility" size={18} />
              <span className="mobile-action-label">Accessibility</span>
            </button>
            <div className={`connection-status ${liveConnected ? 'is-connected' : 'is-disconnected'}`} role="status" aria-live="polite" title={liveConnected ? 'Live updates connected' : 'Live updates offline'}>
              <span className="connection-dot" aria-hidden="true" />
              <span>{liveConnected ? 'Live' : 'Offline'}</span>
            </div>
          </nav>
        </div>
      </header>
    </>
  );
}
