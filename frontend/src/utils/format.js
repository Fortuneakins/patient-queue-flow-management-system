export const firstName = name => String(name || '').trim().split(/\s+/)[0] || 'Patient';
export const displayRole = role => String(role || '').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
export const formatDate = value => value ? new Date(value).toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
export const formatDateTime = value => value ? new Date(value).toLocaleString('en-ZA', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';
export const minutesWaiting = value => Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 60000));
export const initials = name => String(name || '?').slice(0, 2).toUpperCase();
