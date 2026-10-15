const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000').replace(/\/$/, '');
const ANALYTICS_BASE_URL = (import.meta.env.VITE_ANALYTICS_BASE_URL || 'http://localhost:5001').replace(/\/$/, '');
export const SOCKET_URL = (import.meta.env.VITE_SOCKET_URL || API_BASE_URL).replace(/\/$/, '');

export class ApiError extends Error {
  constructor(status, message, data = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.data = data;
  }
}

async function request(path, options = {}) {
  // Allow both backend-relative paths and absolute URLs, such as the
  // separate analytics service URL.
  const url = /^https?:\/\//i.test(path)
    ? path
    : `${API_BASE_URL}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    }
  });

  const contentType = response.headers.get('content-type') || '';

  const data = contentType.includes('application/json')
    ? await response.json()
    : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data?.error || `Request failed (${response.status}).`,
      data
    );
  }

  return data;
}

const authOptions = token => ({ headers: { Authorization: `Bearer ${token}` } });
const authJsonOptions = (token, body, method = 'POST') => ({ method, ...authOptions(token), body: JSON.stringify(body) });

export const api = {
  login: body => request('/api/auth/login', { method: 'POST', body: JSON.stringify(body) }),
  changePassword: (token, body) => request('/api/auth/change-password', authJsonOptions(token, body, 'PUT')),
  createStaff: (token, body) => request('/api/auth/register', authJsonOptions(token, body)),
  listStaff: token => request('/api/staff', authOptions(token)),
  updateStaffStatus: (token, id, body) => request(`/api/staff/${id}/status`, authJsonOptions(token, body, 'PUT')),
  updatePermission: (token, id, body) => request(`/api/staff/${id}/permissions`, authJsonOptions(token, body, 'PUT')),
  loginHistory: (token, id) => request(`/api/staff/${id}/logins`, authOptions(token)),
  listPatients: (token, q = '') => request(`/api/patients${q ? `?q=${encodeURIComponent(q)}` : ''}`, authOptions(token)),
  createPatient: (token, body) => request('/api/patients', authJsonOptions(token, body)),
  verifyPatient: identificationNumber => request(`/api/patients/verify/${encodeURIComponent(identificationNumber)}`),
  publicQueue: () => request('/api/queue/public'),
  checkIn: body => request('/api/queue/check-in', { method: 'POST', body: JSON.stringify(body) }),
  assistedCheckIn: (token, body) => request('/api/queue', authJsonOptions(token, body)),
  staffQueue: token => request('/api/queue', authOptions(token)),
  setPriority: (token, id, tier) => request(`/api/queue/${id}/priority`, authJsonOptions(token, { priority_level: tier }, 'PUT')),
  callPatient: (token, id) => request(`/api/queue/${id}/call`, authJsonOptions(token, {}, 'PUT')),
  saveNotes: (token, id, notes) => request(`/api/queue/${id}/notes`, authJsonOptions(token, { doctor_notes: notes }, 'PUT')),
  discharge: (token, id) => request(`/api/queue/${id}/discharge`, authJsonOptions(token, {}, 'PUT')),
  history: (token, identificationNumber) => request(`/api/history?identification_number=${encodeURIComponent(identificationNumber)}&limit=50&offset=0`, authOptions(token)),
  overview: token => request('/api/history/overview', authOptions(token)),
  dischargeLog: token => request('/api/history/discharge-log?limit=100&offset=0', authOptions(token)),
  staffPerformance: token => request('/api/history/staff-performance', authOptions(token)),
  listShifts: (token, date = '') => request(`/api/shifts${date ? `?date=${encodeURIComponent(date)}` : ''}`, authOptions(token)),
  createShift: (token, body) => request('/api/shifts', authJsonOptions(token, body)),
  deleteShift: (token, id) => request(`/api/shifts/${id}`, { method: 'DELETE', ...authOptions(token) }),
  predictions: () => request(`${ANALYTICS_BASE_URL}/api/predict`),

  intelligenceSummary: token => request('/api/intelligence/summary', authOptions(token)),
  intelligenceEvents: (token, limit = 200, filters = {}) => {
    const params = new URLSearchParams({ limit: String(limit) });
    if (filters.since) params.set('since', filters.since);
    if (filters.until) params.set('until', filters.until);
    if (filters.event_type) params.set('event_type', filters.event_type);
    if (filters.window_hours) params.set('window_hours', String(filters.window_hours));
    return request('/api/intelligence/events?' + params.toString(), authOptions(token));
  },
  intelligenceResources: token => request('/api/intelligence/resources', authOptions(token)),
  createIntelligenceResource: (token, body) => request('/api/intelligence/resources', authJsonOptions(token, body)),
  updateIntelligenceResource: (token, id, body) => request('/api/intelligence/resources/' + id, authJsonOptions(token, body, 'PATCH')),
  intelligenceQueue: token => request('/api/intelligence/active-queue', authOptions(token)),
  carePathways: token => request('/api/intelligence/pathways', authOptions(token)),
  createCarePathwayTemplate: (token, body) => request('/api/intelligence/pathways', authJsonOptions(token, body)),
  pathwayInstances: token => request('/api/intelligence/pathway-instances', authOptions(token)),
  openPathway: (token, body) => request('/api/intelligence/pathway-instances', authJsonOptions(token, body)),
  updatePathwayStage: (token, instanceId, stageId, body) => request('/api/intelligence/pathway-instances/' + instanceId + '/stages/' + stageId, authJsonOptions(token, body, 'PATCH')),
  intelligenceFairness: token => request('/api/intelligence/fairness', authOptions(token)),
  runFlowSimulation: (token, body) => request('/api/intelligence/simulations/flow', authJsonOptions(token, body)),
  runSyntheticLab: (token, body) => request('/api/intelligence/simulations/synthetic-lab', authJsonOptions(token, body)),
  intelligenceSimulations: (token, limit = 20) => request('/api/intelligence/simulations?limit=' + limit, authOptions(token)),
  captureForecast: token => request('/api/intelligence/forecasts/capture', authJsonOptions(token, {})),
  intelligenceForecasts: (token, limit = 50) => request('/api/intelligence/forecasts?limit=' + limit, authOptions(token)),
  resolveForecast: (token, id, body) => request('/api/intelligence/forecasts/' + id + '/actual', authJsonOptions(token, body, 'PATCH')),
  intelligenceReferrals: (token, limit = 100) => request('/api/intelligence/referrals?limit=' + limit, authOptions(token)),
  createIntelligenceReferral: (token, body) => request('/api/intelligence/referrals', authJsonOptions(token, body)),
  updateIntelligenceReferral: (token, id, body) => request('/api/intelligence/referrals/' + id + '/status', authJsonOptions(token, body, 'PATCH')),
  contactPreference: (token, patientId) => request('/api/intelligence/patients/' + patientId + '/contact-preferences', authOptions(token)),
  setContactPreference: (token, patientId, body) => request('/api/intelligence/patients/' + patientId + '/contact-preferences', authJsonOptions(token, body, 'PUT')),
  sendWaitEstimate: (token, patientId, body) => request('/api/intelligence/patients/' + patientId + '/wait-estimate-notifications', authJsonOptions(token, body)),
  syncContinuityObservation: (token, body) => request('/api/intelligence/continuity/sync', authJsonOptions(token, body)),
  continuityReceipts: (token, limit = 50) => request('/api/intelligence/continuity/receipts?limit=' + limit, authOptions(token))
};
