const DATABASE_NAME = 'pqfms-continuity';
const STORE_NAME = 'operational-outbox';

function openDatabase() {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support the continuity outbox.'));
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'client_event_id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Could not open the continuity outbox.'));
    request.onblocked = () => reject(new Error('The continuity outbox upgrade is blocked by another open tab.'));
  });
}

async function withStore(mode, action) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const store = transaction.objectStore(STORE_NAME);
    let request;
    try { request = action(store); } catch (error) { db.close(); reject(error); return; }
    transaction.oncomplete = () => { db.close(); resolve(request?.result); };
    transaction.onerror = () => { db.close(); reject(transaction.error || new Error('Continuity outbox transaction failed.')); };
    transaction.onabort = () => { db.close(); reject(transaction.error || new Error('Continuity outbox transaction was aborted.')); };
  });
}

export async function enqueueOperationalObservation(eventType, payload) {
  const safeTypes = ['OPERATIONAL_INCIDENT_RECORDED', 'RESOURCE_STATUS_OBSERVED'];
  if (!safeTypes.includes(eventType)) throw new Error('This offline action is not permitted.');

  let safePayload;
  if (eventType === 'OPERATIONAL_INCIDENT_RECORDED') {
    const incident = String(payload?.incident_code || '').toUpperCase();
    const allowedIncidents = ['NETWORK_UNAVAILABLE', 'POWER_DISRUPTION', 'MANUAL_WORKFLOW_STARTED', 'RESOURCE_UNAVAILABLE', 'SERVICE_UNAVAILABLE'];
    if (!allowedIncidents.includes(incident)) throw new Error('Choose a supported operational incident.');
    safePayload = { incident_code: incident };
  } else {
    const resourceId = Number(payload?.resource_id);
    const status = String(payload?.observed_status || '').toUpperCase();
    if (!Number.isSafeInteger(resourceId) || resourceId < 1) throw new Error('A valid resource ID is required.');
    if (!['AVAILABLE', 'LIMITED', 'UNAVAILABLE', 'MAINTENANCE'].includes(status)) throw new Error('Choose a supported resource status.');
    safePayload = { resource_id: resourceId, observed_status: status };
  }

  const pending = await listOperationalOutbox();
  if (pending.length >= 1000) throw new Error('The local outbox has reached 1,000 observations. Sync pending records before adding more.');
  if (!globalThis.crypto?.randomUUID) throw new Error('Secure unique IDs are unavailable in this browser; use a supported HTTPS or localhost browser context.');
  return withStore('readwrite', store => store.put({
    client_event_id: globalThis.crypto.randomUUID(),
    event_type: eventType,
    payload: safePayload,
    queued_at: new Date().toISOString()
  }));
}

export function listOperationalOutbox() {
  return withStore('readonly', store => store.getAll());
}

export function removeOperationalObservation(clientEventId) {
  return withStore('readwrite', store => store.delete(clientEventId));
}
