import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';
const CLOSED = ['RESOLVED', 'DISMISSED'];
const STATUS_OPTIONS = { OPEN: ['ACKNOWLEDGED','IN_PROGRESS','DISMISSED'], ACKNOWLEDGED: ['IN_PROGRESS','RESOLVED','DISMISSED'], IN_PROGRESS: ['RESOLVED','DISMISSED'], RESOLVED: [], DISMISSED: [] };
const severityTone = value => ({ CRITICAL:'red', HIGH:'red', MEDIUM:'orange', LOW:'blue', INFO:'neutral' }[value] || 'neutral');
const statusTone = value => ({ OPEN:'orange', ACKNOWLEDGED:'blue', IN_PROGRESS:'teal', RESOLVED:'green', DISMISSED:'neutral' }[value] || 'neutral');
function timestamp(value) { if (!value) return 'Not recorded'; const d = new Date(value); return Number.isNaN(d.getTime()) ? 'Timestamp unavailable' : d.toLocaleString(); }

export default function OperationalActionRegisterPanel({ token }) {
  const [overview,setOverview] = useState(null), [actions,setActions] = useState([]), [staff,setStaff] = useState([]);
  const [statusFilter,setStatusFilter] = useState(''), [busy,setBusy] = useState(''), [error,setError] = useState(''), [notice,setNotice] = useState('');
  const refresh = useCallback(async () => {
    setError('');
    const results = await Promise.allSettled([api.intelligenceOverview(token),api.listOperationalActions(token,statusFilter),api.listStaff(token)]);
    if (results[0].status === 'fulfilled') setOverview(results[0].value); else setError('Current review prompts could not be loaded: '+results[0].reason.message);
    if (results[1].status === 'fulfilled') setActions(results[1].value); else setError(current => current || ('Tracked actions could not be loaded: '+results[1].reason.message));
    if (results[2].status === 'fulfilled') setStaff(results[2].value.filter(item => item.is_active)); else setError(current => current || ('Staff assignments could not be loaded: '+results[2].reason.message));
  },[token,statusFilter]);
  useEffect(() => { refresh(); },[refresh]);
  async function createAction(ruleId) {
    setBusy('create:'+ruleId); setError(''); setNotice('');
    try { const result=await api.createOperationalAction(token,ruleId); setNotice(result.already_open ? 'An open action already exists for '+ruleId+'.' : 'Review prompt converted into a tracked action.'); await refresh(); }
    catch(e){setError(e.message);} finally{setBusy('');}
  }
  async function updateAction(actionId,patch) {
    setBusy('update:'+actionId); setError(''); setNotice('');
    try { await api.updateOperationalAction(token,actionId,patch); setNotice('Action record updated and the change was written to Flight Recorder.'); await refresh(); }
    catch(e){setError(e.message);} finally{setBusy('');}
  }
  const prompts = Array.isArray(overview?.insights) ? overview.insights : [];
  return <div className="space-y-5">
    <Card className="p-5 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="eyebrow">Operational accountability</p><h2 className="font-display text-xl font-bold">Operational Action Register</h2><p className="mt-1 max-w-3xl text-sm text-stone-500">Convert a current server-generated review prompt into an owned action. The register retains its evidence snapshot, status and staff accountability.</p></div><Button variant="secondary" icon="refresh" onClick={refresh} disabled={busy!==''}>Refresh</Button></div>
      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm leading-relaxed text-amber-950">Actions organise human follow-up only. They do not contact patients, change queue order, allocate clinicians or alter triage priority.</div>
      {error && <p className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{error}</p>}
      {notice && <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800" role="status">{notice}</p>}
    </Card>
    <Card className="p-5 md:p-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-display font-bold">Current system-generated review prompts</h3><p className="mt-1 text-sm text-stone-500">Only prompts present in the latest snapshot can be converted.</p></div><Badge tone="blue">{prompts.length} active prompt(s)</Badge></div>
      {prompts.length ? <div className="mt-4 space-y-3">{prompts.map(prompt => <div key={prompt.rule_id} className="rounded-xl border border-stone-200 p-4"><div className="flex flex-wrap items-center gap-2"><strong>{prompt.title}</strong><Badge tone={severityTone(prompt.severity)}>{prompt.severity}</Badge><code className="rounded bg-stone-100 px-2 py-1 text-xs">{prompt.rule_id}</code></div><p className="mt-2 text-sm leading-relaxed text-stone-600">{prompt.summary}</p><p className="mt-2 text-sm leading-relaxed"><strong>Suggested human action:</strong> {prompt.recommended_action}</p><Button className="mt-3" size="sm" disabled={busy!==''} onClick={() => createAction(prompt.rule_id)}>{busy==='create:'+prompt.rule_id ? 'Creating…' : 'Create tracked action'}</Button></div>)}</div>
        : <div className="mt-4"><EmptyState title="No current review prompts" message="The current snapshot has no active rule-based prompt. This is not a safety clearance."/></div>}
    </Card>
    <Card className="overflow-hidden"><div className="flex flex-wrap items-end justify-between gap-3 border-b border-stone-100 p-5"><div><h3 className="font-display font-bold">Tracked actions</h3><p className="mt-1 text-sm text-stone-500">Status transitions are controlled on the server and each change is audited.</p></div><Field label="Filter by status"><select className={inputClass} value={statusFilter} onChange={event => setStatusFilter(event.target.value)}><option value="">All statuses</option>{['OPEN','ACKNOWLEDGED','IN_PROGRESS','RESOLVED','DISMISSED'].map(status => <option key={status}>{status}</option>)}</select></Field></div>
      {actions.length ? <div className="divide-y divide-stone-100">{actions.map(action => <article key={action.action_id} className="space-y-3 p-5"><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold">{action.title}</h4><Badge tone={severityTone(action.severity)}>{action.severity}</Badge><Badge tone={statusTone(action.status)}>{action.status.replaceAll('_',' ')}</Badge><code className="rounded bg-stone-100 px-2 py-1 text-xs">{action.source_rule_id}</code></div><p className="text-sm leading-relaxed text-stone-600">{action.summary}</p><div className="rounded-lg bg-stone-50 p-3 text-sm leading-relaxed"><strong>Recommended response:</strong> {action.recommended_action}<ul className="mt-2 list-disc space-y-1 pl-5 text-stone-600">{(Array.isArray(action.evidence)?action.evidence:[]).map((item,index)=><li key={index}>{item}</li>)}</ul></div>
        <div className="grid gap-3 sm:grid-cols-2"><Field label="Action owner"><select className={inputClass} disabled={busy!==''||CLOSED.includes(action.status)} value={action.owner_staff_id||''} onChange={event=>updateAction(action.action_id,{owner_staff_id:event.target.value?Number(event.target.value):null})}><option value="">Unassigned</option>{staff.map(person=><option key={person.staff_id} value={person.staff_id}>{person.username} · {person.role}</option>)}</select></Field><Field label="Progress status"><select className={inputClass} disabled={busy!==''||CLOSED.includes(action.status)} value={action.status} onChange={event=>updateAction(action.action_id,{status:event.target.value})}><option value={action.status}>{action.status.replaceAll('_',' ')}</option>{(STATUS_OPTIONS[action.status]||[]).map(status=><option key={status} value={status}>{status.replaceAll('_',' ')}</option>)}</select></Field></div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-stone-500"><span>Created by {action.created_by_username}</span><span>Updated by {action.updated_by_username}</span><span>Created {timestamp(action.created_at)}</span>{action.owner_username&&<span>Owner: {action.owner_username} ({action.owner_role})</span>}{action.resolved_at&&<span>Resolved {timestamp(action.resolved_at)}</span>}</div>
      </article>)}</div> : <div className="p-5"><EmptyState title="No tracked actions in this view" message="Create an action from a current review prompt, or change the status filter."/></div>}
    </Card>
  </div>;
}
