const paths = {
  lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
  logout: <><path d="M10 21H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M14 8l4 4-4 4M18 12H9"/></>,
  user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></>,
  idCard: <><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8" cy="10" r="2"/><path d="M5.5 15c.6-1.5 1.4-2 2.5-2s1.9.5 2.5 2M13 9h5M13 12h5M13 15h3"/></>,
  users: <><circle cx="9" cy="8" r="3"/><path d="M2 21c0-4 3-6 7-6s7 2 7 6"/><path d="M16 4a3 3 0 0 1 0 6M18 15c2 .5 4 2 4 5"/></>,
  search: <><circle cx="11" cy="11" r="7"/><path d="M16 16l5 5"/></>,
  plus: <><path d="M12 5v14M5 12h14"/></>,
  check: <path d="M5 12l4 4L19 6"/>,
  x: <><path d="M6 6l12 12M18 6L6 18"/></>,
  clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
  heart: <path d="M20.8 8.8c0 5.5-8.8 10.2-8.8 10.2S3.2 14.3 3.2 8.8A4.8 4.8 0 0 1 12 6.1a4.8 4.8 0 0 1 8.8 2.7Z"/>,
  chart: <><path d="M5 19V10M12 19V5M19 19v-8"/></>,
  ticket: <><path d="M5 6h14v4a2 2 0 0 0 0 4v4H5v-4a2 2 0 0 0 0-4V6Z"/><path d="M9 9h6M9 15h6"/></>,
  history: <><path d="M4 12a8 8 0 1 0 2-5.3L4 9"/><path d="M4 4v5h5"/><path d="M12 8v4l3 2"/></>,
  shield: <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6l7-3Z"/>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
  refresh: <><path d="M20 11a8 8 0 0 0-14-4L3 10"/><path d="M3 5v5h5M4 13a8 8 0 0 0 14 4l3-3"/><path d="M21 19v-5h-5"/></>,
  moon: <path d="M20 15.5A8 8 0 0 1 8.5 4 8 8 0 1 0 20 15.5Z"/>,
  sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></>,
  menu: <><path d="M4 7h16M4 12h16M4 17h16"/></>,
  info: <><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7h.01"/></>,
  alert: <><path d="M12 3l9 16H3L12 3Z"/><path d="M12 9v4M12 16h.01"/></>,
  arrow: <path d="M5 12h14M13 6l6 6-6 6"/>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-1.7 2.9-.2-.1a1.7 1.7 0 0 0-1.8.2l-.2.1h-3.4l-.1-.2a1.7 1.7 0 0 0-1.5-1l-.2-.1-1.7-2.9.1-.2a1.7 1.7 0 0 0-.1-1.7l-.1-.2v-3.4l.2-.1a1.7 1.7 0 0 0 1-1.5l.1-.2 2.9-1.7.2.1a1.7 1.7 0 0 0 1.7-.1l.2-.1h3.4l.1.2a1.7 1.7 0 0 0 1.5 1l.2.1 1.7 2.9-.1.2a1.7 1.7 0 0 0-.1 1.7z" transform="translate(-3 -3)"/></>,
  accessibility: <><circle cx="12" cy="4.5" r="1.8"/><path d="M4 8h16M12 8v5m0 0-4 7m4-7 4 7M7 8l2 5m8-5-2 5"/></>,
  contrast: <><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 0 0 18z"/></>,
  type: <><path d="M4 6V4h16v2M12 4v16M8 20h8"/></>,
  checkCircle: <><circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/></>,
  keyboard: <><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M6 9h.01M9 9h.01M12 9h.01M15 9h.01M18 9h.01M6 12h.01M9 12h.01M12 12h.01M15 12h.01M18 12h.01M8 15h8"/></>,
  monitor: <><rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/></>,
  layout: <><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18M9 9h12"/></>,
  volume: <><path d="M11 5 6 9H3v6h3l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></>
};

export default function Icon({ name, size = 18, className = '' }) {
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={className}>{paths[name] || paths.info}</svg>;
}
