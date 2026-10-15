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

export function enqueueOperationalObservation(eventType, payload) {
  const safeTypes = ['OPERATIONAL_INCIDENT_RECORDED', 'RESOURCE_STATUS_OBSERVED'];
  if (!safeTypes.includes(eventType)) return Promise.reject(new Error('This offline action is not permitted.'));
  const safePayload = eventType === 'OPERATIONAL_INCIDENT_RECORDED'
    ? { incident_code: String(payload?.incident_code || '') }
    : { resource_id: Number(payload?.resource_id), observed_status: String(payload?.observed_status || '') };
  return withStore('readwrite', store => store.put({
    client_event_id: crypto.randomUUID(),
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
