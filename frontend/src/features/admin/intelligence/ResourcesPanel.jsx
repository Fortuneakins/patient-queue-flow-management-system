import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';

const OUTBOX_KEY = 'pqfms_offline_resource_outbox_v1';
function readOutbox() {
  try { const value = JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]'); return Array.isArray(value) ? value : []; }
  catch { return []; }
}
function uuid() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0;
    return (c === 'x' ? r : (r & 3 | 8)).toString(16);
  });
}
const statusTone = status => ({ AVAILABLE: 'green', LIMITED: 'orange', UNAVAILABLE: 'red' }[status] || 'neutral');

export default function ResourcesPanel({ token, currentUser, canManage = false }) {
  const [resources, setResources] = useState([]);
  const [draftStatus, setDraftStatus] = useState({});
  const [form, setForm] = useState({ resource_code: '', name: '', resource_type: 'ROOM', capacity: '1', location_label: '', notes: '' });
  const [outbox, setOutbox] = useState(readOutbox);
  const [online, setOnline] = useState(typeof navigator === 'undefined' ? true : navigator.onLine);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  function saveOutbox(next) {
    setOutbox(next);
    try { localStorage.setItem(OUTBOX_KEY, JSON.stringify(next)); } catch { setError('Local storage is unavailable; this offline operation was not retained.'); }
  }
  const refresh = useCallback(async () => {
    try { setResources(await api.listResources(token)); } catch (e) { setError(e.message); }
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); };
  }, []);

  async function createResource() {
    setError(''); setNotice(''); setBusy(true);
    try {
      await api.createResource(token, { ...form, capacity: Number(form.capacity) });
      setForm({ resource_code: '', name: '', resource_type: 'ROOM', capacity: '1', location_label: '', notes: '' });
      setNotice('Resource created on the server.');
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function updateStatus(resource) {
    const status = draftStatus[resource.resource_id] || resource.status;
    if (status === resource.status) return;
    setError(''); setNotice('');
    if (!online) {
      const operation = {
        idempotency_key: uuid(), operation_type: 'RESOURCE_STATUS', resource_id: resource.resource_id,
        status, actor_staff_id: currentUser?.staff_id, actor_username: currentUser?.username || '',
        created_at: new Date().toISOString()
      };
      saveOutbox([...outbox, operation]);
      setNotice('Resource status queued on this device. The server has not been updated until synchronisation succeeds.');
      return;
    }
    try {
      await api.updateResourceStatus(token, resource.resource_id, status);
      setNotice('Resource status updated.');
      setDraftStatus(current => ({ ...current, [resource.resource_id]: status }));
      await refresh();
    } catch (e) { setError(e.message); }
  }
  async function syncOutbox() {
    setError(''); setNotice('');
    if (!online) { setError('Connect to the clinic server before synchronising the local outbox.'); return; }
    const owned = outbox.filter(item => Number(item.actor_staff_id) === Number(currentUser?.staff_id));
    const other = outbox.length - owned.length;
    if (!owned.length) {
      setNotice(other ? 'Pending updates were created by a different staff account. Sign in with that account to synchronise them.' : 'No pending resource updates.');
      return;
    }
    setBusy(true);
    try {
      const completedKeys = [];
      for (let index = 0; index < owned.length; index += 50) {
        const chunk = owned.slice(index, index + 50);
        await api.syncOfflineResourceOperations(token, chunk.map(({ idempotency_key, operation_type, resource_id, status }) => ({ idempotency_key, operation_type, resource_id, status })));
        completedKeys.push(...chunk.map(item => item.idempotency_key));
      }
      saveOutbox(outbox.filter(item => !completedKeys.includes(item.idempotency_key)));
      setNotice('Synchronised ' + completedKeys.length + ' resource update(s). Duplicate requests are protected by idempotency keys.');
      await refresh();
    } catch (e) { setError(e.message + ' Pending operations have been retained locally.'); }
    finally { setBusy(false); }
  }
  const ownedCount = outbox.filter(item => Number(item.actor_staff_id) === Number(currentUser?.staff_id)).length;
  const pendingFor = id => outbox.filter(item => Number(item.actor_staff_id) === Number(currentUser?.staff_id) && Number(item.resource_id) === Number(id)).slice(-1)[0];

  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Resource dependency registry</h2><p className="mt-1 text-sm text-stone-500">Rooms, equipment, services and supplies have explicit operational states and capacity.</p></div><Badge tone={online ? 'green' : 'orange'}>{online ? 'Online' : 'Offline'}</Badge></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {['ROOM','EQUIPMENT','SERVICE','SUPPLY'].map(type => <div key={type} className="rounded-xl border border-stone-200 p-3"><div className="text-xs text-stone-500">{type.toLowerCase()} resources</div><div className="mt-1 font-display text-2xl font-bold">{resources.filter(item => item.resource_type === type).length}</div><div className="mt-1 text-xs text-stone-500">{resources.filter(item => item.resource_type === type && item.status === 'AVAILABLE').length} available</div></div>)}
        </div>
        {canManage && <>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Field label="Resource code" required><input className={inputClass} maxLength={40} value={form.resource_code} onChange={e => setForm({ ...form, resource_code: e.target.value })}/></Field>
            <Field label="Name" required><input className={inputClass} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></Field>
            <Field label="Type" required><select className={inputClass} value={form.resource_type} onChange={e => setForm({ ...form, resource_type: e.target.value })}>{['ROOM','EQUIPMENT','SERVICE','SUPPLY'].map(type => <option key={type}>{type}</option>)}</select></Field>
            <Field label="Capacity" hint="Operational capacity, not patients' clinical acuity"><input className={inputClass} type="number" min="1" max="100" step="1" value={form.capacity} onChange={e => setForm({ ...form, capacity: e.target.value })}/></Field>
            <Field label="Location label"><input className={inputClass} maxLength={120} value={form.location_label} onChange={e => setForm({ ...form, location_label: e.target.value })}/></Field>
            <Field label="General resource notes" hint="Never enter patient details here"><input className={inputClass} maxLength={500} value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })}/></Field>
          </div>
          <div className="mt-4"><Button onClick={createResource} disabled={busy || !online}>{busy ? 'Saving…' : 'Create resource'}</Button></div>
        </>}
      </Card>
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-100 p-5"><div><h2 className="font-display font-bold">Resource status</h2><p className="mt-1 text-xs text-stone-500">{canManage ? "Offline queueing supports resource states only—never patient records, triage or clinical actions." : "Read-only operational resource state. Contact an administrator to request availability changes."}</p></div>{canManage && <Button variant="secondary" icon="refresh" onClick={syncOutbox} disabled={busy || !online}>Sync outbox ({ownedCount})</Button>}</div>
        {resources.length ? <div className="divide-y divide-stone-100">{resources.map(resource => {
          const pending = canManage ? pendingFor(resource.resource_id) : null;
          return <div key={resource.resource_id} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{resource.name}</span><Badge tone={statusTone(pending?.status || resource.status)}>{pending ? 'Pending ' + pending.status : resource.status}</Badge></div><div className="mt-1 text-xs text-stone-500">{resource.resource_code} · {resource.resource_type} · Capacity {resource.capacity}{resource.location_label ? ' · ' + resource.location_label : ''}</div>{pending && <div className="mt-1 text-xs text-orange-700">Queued at {new Date(pending.created_at).toLocaleString()} — not yet server-authoritative</div>}</div>
            {canManage && <div className="flex flex-wrap gap-2"><select aria-label={'New status for ' + resource.name} className={inputClass + ' min-w-36'} value={draftStatus[resource.resource_id] || resource.status} onChange={e => setDraftStatus({ ...draftStatus, [resource.resource_id]: e.target.value })}>{['AVAILABLE','LIMITED','UNAVAILABLE'].map(status => <option key={status}>{status}</option>)}</select><Button variant="secondary" onClick={() => updateStatus(resource)} disabled={busy || (draftStatus[resource.resource_id] || resource.status) === resource.status}>Set status</Button></div>}
          </div>;
        })}</div> : <EmptyState title="No resources configured" message="Add rooms, equipment or other operational resources to model service capacity."/>}
        {canManage && outbox.length > 0 && <div className="border-t border-stone-100 bg-stone-50 p-4 text-xs text-stone-600">This device has {outbox.length} pending resource update(s). Updates are linked to the staff account that created them and use server-verified idempotency keys.</div>}
      </Card>
      {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
    </div>
  );
}
