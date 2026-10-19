import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';

const defaultStages = 'Registration and identity check\nNurse triage\nClinical consultation\nDischarge and next-step instructions';
function codeFor(index) { return 'STAGE_' + (index + 1); }
function defaultRole(index) { return ['RECEPTION', 'NURSE', 'DOCTOR', 'DOCTOR'][index] || null; }
function defaultResource(index) { return index === 1 ? 'SERVICE' : index === 2 ? 'ROOM' : null; }
const stageTone = status => ({ COMPLETED: 'green', READY: 'teal', IN_PROGRESS: 'orange', BLOCKED: 'red', PENDING: 'neutral' }[status] || 'neutral');

export default function CareGraphPanel({ token, canManage = false, currentRole = null }) {
  const [pathways, setPathways] = useState([]);
  const [visits, setVisits] = useState([]);
  const [queueId, setQueueId] = useState('');
  const [pathwayId, setPathwayId] = useState('');
  const [journey, setJourney] = useState(null);
  const [form, setForm] = useState({ pathway_code: '', name: '', description: '', stage_lines: defaultStages });
  const [blockReason, setBlockReason] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    const [paths, active] = await Promise.all([api.listPathways(token), api.intelligenceActiveVisits(token)]);
    setPathways(paths); setVisits(active);
    setPathwayId(current => current || String(paths.find(item => item.pathway_code === 'OPD_STANDARD')?.pathway_id || paths[0]?.pathway_id || ''));
    setQueueId(current => current || String(active[0]?.queue_id || ''));
  }, [token]);
  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);
  useEffect(() => {
    if (!queueId) { setJourney(null); return; }
    let live = true;
    api.journey(token, queueId).then(value => { if (live) setJourney(value); }).catch(e => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [token, queueId]);

  async function create() {
    setError(''); setNotice('');
    const names = form.stage_lines.split('\n').map(value => value.trim()).filter(Boolean);
    const stages = names.map((name, index) => ({
      stage_code: codeFor(index), name, required_role: defaultRole(index), resource_type: defaultResource(index), is_required: true
    }));
    setBusy(true);
    try {
      const created = await api.createPathway(token, { pathway_code: form.pathway_code, name: form.name, description: form.description, stages });
      setNotice('Care pathway created with ' + created.stages.length + ' ordered stages.');
      setForm({ pathway_code: '', name: '', description: '', stage_lines: defaultStages });
      await refresh();
      setPathwayId(String(created.pathway_id));
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function assign() {
    if (!queueId || !pathwayId) return;
    setError(''); setNotice('');
    try {
      await api.assignPathway(token, queueId, pathwayId);
      setJourney(await api.journey(token, queueId));
      setNotice('Pathway assigned. Existing progress is preserved unless no stages have started.');
    } catch (e) { setError(e.message); }
  }
  const canActOnStage = stage => canManage || !stage.required_role || stage.required_role === currentRole;

  async function stageAction(stage, status) {
    setError(''); setNotice('');
    try {
      const body = { status };
      if (status === 'BLOCKED') body.block_reason = blockReason;
      await api.updateJourneyStage(token, queueId, stage.stage_id, body);
      setJourney(await api.journey(token, queueId));
      setBlockReason('');
      setNotice('Stage status updated.');
    } catch (e) { setError(e.message); }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div><h2 className="font-display text-lg font-bold">CareGraph pathways</h2><p className="mt-1 text-sm text-stone-500">New queue check-ins receive the standard pathway automatically. Configure additional ordered workflows without changing clinical triage rules.</p></div>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {pathways.map(item => <div key={item.pathway_id} className="rounded-xl border border-stone-200 p-4"><div className="flex items-start justify-between gap-3"><div><div className="font-semibold">{item.name}</div><div className="mt-1 font-mono text-xs text-stone-500">{item.pathway_code}</div></div><Badge tone={item.is_active ? 'green' : 'neutral'}>{item.is_active ? 'Active' : 'Inactive'}</Badge></div><p className="mt-2 text-xs text-stone-500">{item.description || 'No description'}</p><div className="mt-3 flex flex-wrap gap-1">{(item.stages || []).map(stage => <span key={stage.stage_id} className="rounded-lg bg-stone-100 px-2 py-1 text-[11px] text-stone-600">{stage.sequence_no}. {stage.name}</span>)}</div></div>)}
          {!pathways.length && <EmptyState title="No pathways found" message="Run database migrations 003 and later to initialise the clinic intelligence schema."/>}
        </div>
      </Card>
      <div className={canManage ? "grid gap-5 xl:grid-cols-[0.8fr_1.2fr]" : "grid gap-5"}>
        {canManage && <Card className="caregraph-create-card p-5">
          <h3 className="font-display text-base font-bold">Create an operational pathway</h3><p className="mt-1 text-xs text-stone-500">Stages are ordered; defaults assign Reception, Nurse and Doctor responsibilities to the first four stages. Review before using in a real workflow.</p>
          <div className="mt-4 space-y-3">
            <Field label="Pathway code" required><input className={inputClass} maxLength={40} placeholder="E.G. FOLLOW_UP" value={form.pathway_code} onChange={e => setForm({ ...form, pathway_code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '') })}/></Field>
            <Field label="Name" required><input className={inputClass} maxLength={120} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}/></Field>
            <Field label="Description"><input className={inputClass} maxLength={800} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></Field>
            <Field label="Ordered stages" hint="One stage name per line; 2 to 15 stages." required><textarea className={inputClass + ' min-h-40'} value={form.stage_lines} onChange={e => setForm({ ...form, stage_lines: e.target.value })}/></Field>
            <Button onClick={create} disabled={busy}>{busy ? 'Creating…' : 'Create pathway'}</Button>
          </div>
        </Card>}
        <Card className="p-5">
          <h3 className="font-display text-base font-bold">Journey progress</h3><p className="mt-1 text-xs text-stone-500">Stage completion is role-checked server-side. Required predecessors must be completed before later stages start.</p>
          <div className={canManage ? "mt-4 grid gap-3 md:grid-cols-2" : "mt-4"}>
            <Field label="Active queue visit"><select className={inputClass} value={queueId} onChange={e => setQueueId(e.target.value)}><option value="">Select queue visit</option>{visits.map(v => <option key={v.queue_id} value={v.queue_id}>#{v.ticket_number} · {v.status} · {v.priority_level ? 'Tier ' + v.priority_level : 'Untriaged'}</option>)}</select></Field>
            {canManage && <Field label="Assign pathway"><select className={inputClass} value={pathwayId} onChange={e => setPathwayId(e.target.value)}><option value="">Select pathway</option>{pathways.filter(p => p.is_active).map(p => <option key={p.pathway_id} value={p.pathway_id}>{p.name}</option>)}</select></Field>}
          </div>
          {canManage && <div className="mt-3"><Button variant="secondary" onClick={assign} disabled={!queueId || !pathwayId}>Assign or confirm pathway</Button></div>}
          {journey?.pathway && <div className="mt-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><div><div className="font-semibold">{journey.pathway.name}</div><div className="text-xs text-stone-500">Ticket #{journey.visit.ticket_number} · {journey.visit.visit_status}</div></div><Badge tone="teal">{journey.stages.filter(s => s.status === 'COMPLETED').length}/{journey.stages.length} complete</Badge></div>
            {journey.stages.map(stage => <div key={stage.stage_id} className="rounded-xl border border-stone-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2"><div className="flex min-w-0 gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-stone-100 text-xs font-bold">{stage.sequence_no}</span><div><div className="font-semibold">{stage.name}</div><div className="mt-1 text-xs text-stone-500">{stage.required_role || 'Any authorised role'}{stage.resource_type ? ' · Resource: ' + stage.resource_type : ''}</div>{stage.status === 'BLOCKED' && <p className="mt-1 text-xs text-red-700">{stage.block_reason}</p>}</div></div><Badge tone={stageTone(stage.status)}>{stage.status.replaceAll('_', ' ')}</Badge></div>
              {journey.visit.visit_status !== 'Discharged' && <div className="mt-3 flex flex-wrap gap-2">{stage.status === 'READY' && canActOnStage(stage) && <Button onClick={() => stageAction(stage, 'IN_PROGRESS')}>Start stage</Button>}{stage.status === 'IN_PROGRESS' && canActOnStage(stage) && <Button variant="success" onClick={() => stageAction(stage, 'COMPLETED')}>Complete stage</Button>}{['PENDING','BLOCKED'].includes(stage.status) && <div className="text-xs text-stone-500">Waiting for the required earlier stages.</div>}{!canActOnStage(stage) && ['READY','IN_PROGRESS'].includes(stage.status) && <div className="text-xs text-stone-500">This stage is reserved for {stage.required_role} staff.</div>}{canActOnStage(stage) && !['COMPLETED','IN_PROGRESS','READY'].includes(stage.status) && <div className="basis-full"><input className={inputClass} maxLength={300} placeholder="Short, non-clinical reason for blocking a stage" value={blockReason} onChange={e => setBlockReason(e.target.value)}/><Button className="mt-2" variant="secondary" onClick={() => stageAction(stage, 'BLOCKED')} disabled={blockReason.trim().length < 3}>Mark blocked</Button></div>}</div>}
            </div>)}
          </div>}
          {journey && !journey.pathway && <EmptyState title="No pathway assigned" message="Select an active pathway and assign it to this queue visit."/>}
          {!journey && <EmptyState title="Select a queue visit" message="The stage timeline will appear here."/>}
        </Card>
      </div>
      {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
    </div>
  );
}
