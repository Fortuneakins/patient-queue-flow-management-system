import { useEffect, useState } from 'react';
import AppHeader from './components/layout/AppHeader';
import AccessibilitySettingsModal from './components/layout/AccessibilitySettingsModal';
import { Card } from './components/ui';
import Icon from './components/ui/Icon';
import StaffSignInModal from './features/auth/StaffSignInModal';
import ChangePasswordModal from './features/auth/ChangePasswordModal';
import KioskView from './features/kiosk/KioskView';
import DisplayBoardView from './features/display/DisplayBoardView';
import ReceptionWorkspace from './features/reception/ReceptionWorkspace';
import NurseWorkspace from './features/nurse/NurseWorkspace';
import DoctorWorkspace from './features/doctor/DoctorWorkspace';
import AdminWorkspace from './features/admin/AdminWorkspace';
import StaffDirectoryView from './features/shared/StaffDirectoryView';
import { useIdleLogout, usePQFMS } from './hooks/usePQFMS';
import { displayRole } from './utils/format';

const PREFERENCE_KEY = 'pqfms_display_preferences';
const DEFAULT_PREFERENCES = {
  theme: 'light',
  textSize: 'standard',
  contrast: 'standard',
  motion: 'system',
  largeTargets: false
};
const TEXT_SIZE_PERCENT = { standard: 100, large: 112, larger: 124, largest: 136 };

function readPreferences() {
  try {
    const stored = JSON.parse(localStorage.getItem(PREFERENCE_KEY) || 'null');
    return { ...DEFAULT_PREFERENCES, ...(stored && typeof stored === 'object' ? stored : {}) };
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

const ROLE_TABS = {
  RECEPTION: [['register', 'Register Patient'], ['directory', 'Patient Directory']],
  NURSE: [['triage', 'Triage Board'], ['directory', 'Patient Directory'], ['history', 'Patient History']],
  DOCTOR: [['roster', 'Consultation Roster'], ['directory', 'Patient Directory'], ['history', 'Patient History'], ['overview', 'Today’s Overview']],
  ADMIN: [['overview', 'Overview'], ['intelligence', 'Clinic Intelligence'], ['log', 'Discharge Log'], ['history', 'Patient History'], ['staff', 'Staff Management'], ['shifts', 'Scheduling'], ['directory', 'Staff Directory']]
};

const TAB_ICONS = {
  register: 'user', directory: 'users', triage: 'shield', history: 'history',
  roster: 'calendar', overview: 'chart', intelligence: 'chart', log: 'history', staff: 'users', shifts: 'calendar', staffDirectory: 'users'
};

function WorkspaceShell({ user, activeTab, setActiveTab, onLogout, onChangePassword, children }) {
  const tabs = ROLE_TABS[user.role] || [];
  const allTabs = [...tabs];
  if (user.extra_permissions?.includes('VIEW_STAFF_DIRECTORY') && user.role !== 'ADMIN') {
    allTabs.push(['staffDirectory', 'Staff Directory']);
  }

  return (
    <main id="main-content" tabIndex={-1} className="workspace-page app-page-enter">
      <div className="workspace-toolbar">
        <div className="workspace-breadcrumbs">
          <span className="workspace-breadcrumb-home"><Icon name="layout" size={15} /> RMSH Operations</span>
          <span className="breadcrumb-divider" aria-hidden="true">/</span>
          <span>{displayRole(user.role)} workspace</span>
        </div>
        <div className="workspace-toolbar-actions">
          <button type="button" onClick={onChangePassword} className="toolbar-button"><Icon name="shield" size={15} /> Change password</button>
          <button type="button" onClick={onLogout} className="toolbar-button toolbar-button--danger"><Icon name="logout" size={15} /> Sign out</button>
        </div>
      </div>

      <div className="workspace-layout">
        <aside className="workspace-sidebar" aria-label={`${displayRole(user.role)} navigation`}>
          <div className="workspace-sidebar-heading">
            <span className="workspace-sidebar-kicker">Workspace</span>
            <span className="workspace-sidebar-role">{displayRole(user.role)}</span>
          </div>
          <nav className="workspace-tab-list" aria-label={`${displayRole(user.role)} workspace sections`}>
            {allTabs.map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setActiveTab(key)}
                aria-current={activeTab === key ? 'page' : undefined}
                className={`workspace-tab ${activeTab === key ? 'is-active' : ''}`}
              >
                <span className="workspace-tab-icon"><Icon name={TAB_ICONS[key] || 'arrow'} size={17} /></span>
                <span>{label}</span>
                {activeTab === key && <span className="workspace-tab-indicator" aria-hidden="true" />}
              </button>
            ))}
          </nav>
          <div className="workspace-sidebar-note">
            <span className="workspace-security-icon"><Icon name="shield" size={16} /></span>
            <span><strong>Protected workspace</strong><small>Your role controls the actions available here.</small></span>
          </div>
        </aside>

        <Card className="workspace-main-card p-6 md:p-8">
          <div className="workspace-main-content">{children}</div>
        </Card>
      </div>
    </main>
  );
}

function App() {
  const state = usePQFMS();
  const { user, error, clearError, refreshStaff } = state;
  const [mode, setMode] = useState(user?.role || 'KIOSK');
  const [loginOpen, setLoginOpen] = useState(false);
  const [passwordModal, setPasswordModal] = useState(user?.must_reset_password ? { forced: true } : null);
  const [accessibilityOpen, setAccessibilityOpen] = useState(false);
  const [preferences, setPreferences] = useState(readPreferences);
  const [notice, setNotice] = useState('');
  const [activeTab, setActiveTab] = useState(ROLE_TABS[user?.role]?.[0]?.[0] || 'overview');
  const darkMode = preferences.theme === 'dark';

  useIdleLogout(user, () => { state.logout(); setMode('KIOSK'); }, message => setNotice(message));

  useEffect(() => {
    if (user?.role !== 'ADMIN' && user?.extra_permissions?.includes('VIEW_STAFF_DIRECTORY')) refreshStaff();
  }, [user, refreshStaff]);

  useEffect(() => {
    try { localStorage.setItem(PREFERENCE_KEY, JSON.stringify(preferences)); } catch { /* Preferences are optional if storage is unavailable. */ }
    const root = document.documentElement;
    root.dataset.theme = preferences.theme;
    root.dataset.contrast = preferences.contrast;
    root.dataset.targets = preferences.largeTargets ? 'large' : 'standard';
    if (preferences.motion === 'reduced') root.dataset.motion = 'reduced';
    else delete root.dataset.motion;
    root.style.fontSize = `${TEXT_SIZE_PERCENT[preferences.textSize] || 100}%`;
  }, [preferences]);

  useEffect(() => {
    if (!error) return undefined;
    const id = setTimeout(clearError, 7000);
    return () => clearTimeout(id);
  }, [clearError, error]);

  const effectiveMode = user ? (mode === 'DISPLAY' ? 'DISPLAY' : user.role) : mode;
  const queueSummary = state.publicQueue;

  function notify(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 3500);
  }

  async function login(credentials) {
    try {
      const next = await state.login(credentials);
      setLoginOpen(false);
      setMode(next.role);
      setActiveTab(ROLE_TABS[next.role]?.[0]?.[0] || 'overview');
      if (next.must_reset_password) setPasswordModal({ forced: true });
      notify(`Signed in as ${displayRole(next.role)}.`);
    } catch { /* surfaced by hook */ }
  }

  async function changePassword(payload) {
    await state.changePassword(payload);
    notify('Password updated successfully.');
    const updated = { ...user, must_reset_password: false };
    localStorage.setItem('pqfms_user', JSON.stringify(updated));
    window.location.reload();
  }

  let content;
  if (effectiveMode === 'KIOSK' && !user) {
    content = <KioskView publicQueue={queueSummary} predictions={state.predictions} onVerify={state.verifyPatient} onCheckIn={state.checkIn} liveConnected={state.liveConnected} />;
  } else if (effectiveMode === 'DISPLAY') {
    content = <DisplayBoardView publicQueue={queueSummary} predictions={state.predictions} liveConnected={state.liveConnected} />;
  } else {
    const common = { patients: state.patients, onRefreshPatients: state.refreshPatients };
    const roleView = effectiveMode === 'RECEPTION'
      ? <ReceptionWorkspace {...common} activeTab={activeTab} onTabChange={setActiveTab} onCreatePatient={state.createPatient} onVerifyPatient={state.verifyPatient} onAssistedCheckIn={state.assistedCheckIn} busy={state.busy} />
      : effectiveMode === 'NURSE'
        ? <NurseWorkspace {...common} activeTab={activeTab} onTabChange={setActiveTab} queue={state.staffQueue} history={state.history} onRefreshHistory={state.refreshHistory} onSetPriority={state.setPriority} />
        : effectiveMode === 'DOCTOR'
          ? <DoctorWorkspace {...common} activeTab={activeTab} onTabChange={setActiveTab} queue={state.staffQueue} overview={state.overview} history={state.history} onSetPriority={state.setPriority} onCall={state.callPatient} onDischarge={state.discharge} onSaveNotes={state.saveNotes} onRefreshHistory={state.refreshHistory} />
          : <AdminWorkspace {...common} activeTab={activeTab} currentUser={user} staff={state.staff} shifts={state.shifts} overview={state.overview} history={state.history} dischargeLog={state.dischargeLog} performance={state.staffPerformance} token={state.token} onRefreshStaff={state.refreshStaff} onRefreshShifts={state.refreshShifts} onRefreshOverview={state.refreshOverview} onRefreshPerformance={state.refreshPerformance} onRefreshHistory={state.refreshHistory} onCreateStaff={state.createStaff} onUpdateStatus={state.updateStaffStatus} onUpdatePermission={state.updatePermission} onLoginHistory={state.getLoginHistory} onCreateShift={state.createShift} onDeleteShift={state.deleteShift} />;
    const finalRoleView = activeTab === 'staffDirectory' && user.role !== 'ADMIN' && user.extra_permissions?.includes('VIEW_STAFF_DIRECTORY')
      ? <StaffDirectoryView staff={state.staff} />
      : roleView;
    content = <WorkspaceShell user={user} activeTab={activeTab} setActiveTab={setActiveTab} onLogout={() => { state.logout(); setMode('KIOSK'); }} onChangePassword={() => setPasswordModal({ forced: false })}>{finalRoleView}</WorkspaceShell>;
  }

  return (
    <div className={`app-root min-h-screen ${darkMode ? 'theme-dark' : 'theme-light'}`} data-theme={preferences.theme} data-contrast={preferences.contrast} data-targets={preferences.largeTargets ? 'large' : 'standard'}>
      <AppHeader
        user={user}
        mode={effectiveMode}
        onModeChange={setMode}
        onLogin={() => setLoginOpen(true)}
        onLogout={() => { state.logout(); setMode('KIOSK'); }}
        darkMode={darkMode}
        onToggleDark={() => setPreferences(current => ({ ...current, theme: current.theme === 'dark' ? 'light' : 'dark' }))}
        onOpenAccessibility={() => setAccessibilityOpen(true)}
        liveConnected={state.liveConnected}
      />
      <div className="app-content">{content}</div>

      {(error || notice) && (
        <div className="app-toast-stack" aria-live="polite" aria-atomic="false">
          {error && <div className="app-toast app-toast--error" role="alert"><Icon name="alert" size={18} /><span>{error}</span><button className="toast-dismiss" onClick={clearError} aria-label="Dismiss error"><Icon name="x" size={16} /></button></div>}
          {notice && <div className="app-toast app-toast--success" role="status"><Icon name="checkCircle" size={18} /><span>{notice}</span></div>}
        </div>
      )}

      {loginOpen && !user && <StaffSignInModal onClose={() => setLoginOpen(false)} onLogin={login} busy={state.busy} error={error} />}
      {passwordModal && user && <ChangePasswordModal forced={passwordModal.forced} onClose={() => !passwordModal.forced && setPasswordModal(null)} onSubmit={changePassword} busy={state.busy} />}
      {accessibilityOpen && <AccessibilitySettingsModal preferences={preferences} onChange={setPreferences} onReset={() => setPreferences(DEFAULT_PREFERENCES)} onClose={() => setAccessibilityOpen(false)} />}
    </div>
  );
}

export default App;
