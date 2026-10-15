import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';

const nextStatuses = {
  REQUESTED: ['ACKNOWLEDGED', 'CANCELLED'],
  ACKNOWLEDGED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: []
};
export default function ReferralRelayPanel({ token, canManage = false }) {
  const [form, setForm] = useState({ patient_id: '', queue_id: '', referred_to: '', reason: '', due_at: '' });
  const [referrals, setReferrals] = useState([]);
  const [updates, setUpdates] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const refresh = useCallback(async () => {
    try { setReferrals(await api.listReferrals(token)); } catch (e) { setError(e.message); }
  }, [token]);
  useEffect(() => { refresh(); }, [refresh]);
  async function create() {
    setBusy(true); setError(''); setNotice('');
    try {
      const payload = { ...form, patient_id: Number(form.patient_id), queue_id: form.queue_id ? Number(form.queue_id) : null, due_at: form.due_at || null };
      const saved = await api.createReferral(token, payload);
      setNotice('Referral #' + saved.referral_id + ' created. The receiving service has not been contacted automatically.');
      setForm({ patient_id: '', queue_id: '', referred_to: '', reason: '', due_at: '' });
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function update(item) {
    const status = updates[item.referral_id] || item.status;
    if (status === item.status) return;
    setBusy(true); setError(''); setNotice('');
    try {
      await api.updateReferral(token, item.referral_id, { status, acknowledgement_note: item.acknowledgement_note || '' });
      setNotice('Referral #' + item.referral_id + ' status updated.');
      await refresh();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className={canManage ? "grid gap-5 xl:grid-cols-[0.8fr_1.2fr]" : "grid gap-5"}>
    {canManage && (
          <Card className="p-5">
            <h2 className="font-display text-lg font-bold">Create referral record</h2>
            <p className="mt-1 text-sm text-stone-500">Tracks a hand-off inside this PQFMS installation. It does not send a referral to an external health system.</p>
            <div className="mt-4 space-y-3">
              <Field label="Patient ID" required><input className={inputClass} type="number" min="1" value={form.patient_id} onChange={e => setForm({ ...form, patient_id: e.target.value })}/></Field>
              <Field label="Queue visit ID" hint="Optional; must belong to the selected patient"><input className={inputClass} type="number" min="1" value={form.queue_id} onChange={e => setForm({ ...form, queue_id: e.target.value })}/></Field>
              <Field label="Receiving service" required><input className={inputClass} maxLength={160} value={form.referred_to} onChange={e => setForm({ ...form, referred_to: e.target.value })} placeholder="Service or facility name"/></Field>
              <Field label="Operational referral reason" required hint="Avoid unnecessary sensitive details"><textarea className={inputClass + ' min-h-24'} maxLength={1000} value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })}/></Field>
              <Field label="Follow-up due" hint="Optional local date and time"><input className={inputClass} type="datetime-local" value={form.due_at} onChange={e => setForm({ ...form, due_at: e.target.value })}/></Field>
              <Button onClick={create} disabled={busy || !form.patient_id || !form.referred_to.trim() || !form.reason.trim()}>{busy ? 'Saving…' : 'Create referral'}</Button>
            </div>
          </Card>
    )}
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-stone-100 p-5"><div><h2 className="font-display font-bold">Referral tracking</h2><p className="mt-1 text-xs text-stone-500">{referrals.length} record(s) · latest and outstanding first</p></div><Button variant="secondary" icon="refresh" onClick={refresh}>Refresh</Button></div>
      {referrals.length ? <div className="divide-y divide-stone-100">{referrals.map(item => <div key={item.referral_id} className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3"><div><div className="font-semibold">{item.referred_to}</div><div className="mt-1 text-xs text-stone-500">Referral #{item.referral_id} · {item.patient_name} · Patient ID {item.patient_id}{item.queue_id ? ' · Queue #' + item.queue_id : ''}</div></div><Badge tone={item.status === 'COMPLETED' ? 'green' : item.status === 'CANCELLED' ? 'neutral' : 'orange'}>{item.status.replaceAll('_', ' ')}</Badge></div>
        <p className="mt-2 whitespace-pre-wrap text-sm text-stone-600">{item.reason}</p><div className="mt-2 text-xs text-stone-500">Created {new Date(item.created_at).toLocaleString()}{item.due_at ? ' · Due ' + new Date(item.due_at).toLocaleString() : ''}</div>
        {canManage && (nextStatuses[item.status] || []).length > 0 && <div className="mt-3 flex flex-wrap gap-2"><select aria-label={'Referral status ' + item.referral_id} className={inputClass + ' max-w-56'} value={updates[item.referral_id] || item.status} onChange={e => setUpdates({ ...updates, [item.referral_id]: e.target.value })}><option value={item.status}>{item.status}</option>{nextStatuses[item.status].map(status => <option key={status}>{status}</option>)}</select><Button variant="secondary" disabled={busy || (updates[item.referral_id] || item.status) === item.status} onClick={() => update(item)}>Update state</Button></div>}
      </div>)}</div> : <EmptyState title="No referrals recorded" message="Create a referral task to track its acknowledgement and completion status."/>}
    </Card>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm xl:col-span-2 ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
  </div>;
}
