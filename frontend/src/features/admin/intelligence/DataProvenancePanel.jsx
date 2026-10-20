import { useCallback, useEffect, useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, EmptyState, Field, inputClass } from '../../../components/ui';

const PROVENANCE_OPTIONS = [
  { value: 'UNCLASSIFIED', label: 'Needs review' },
  { value: 'OPERATIONAL', label: 'Operational record' },
  { value: 'SYNTHETIC_TEST', label: 'Synthetic test' },
  { value: 'DEMO', label: 'Demo / seeded data' }
];

function labelFor(value) {
  return PROVENANCE_OPTIONS.find(item => item.value === value)?.label || value || 'Unclassified';
}

function toneFor(value) {
  if (value === 'OPERATIONAL') return 'green';
  if (value === 'SYNTHETIC_TEST' || value === 'DEMO') return 'orange';
  return 'neutral';
}

function sourceLabel(value) {
  if (value === 'SERVER_POLICY') return 'Assigned automatically';
  if (value === 'ADMIN_REVIEW') return 'Administrator reviewed';
  return 'Historical / review required';
}

function sourceTone(value) {
  if (value === 'SERVER_POLICY') return 'blue';
  if (value === 'ADMIN_REVIEW') return 'green';
  return 'orange';
}

function dateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Timestamp unavailable' : parsed.toLocaleString();
}

export default function DataProvenancePanel({ token }) {
  const [filter, setFilter] = useState('UNCLASSIFIED');
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState({ UNCLASSIFIED: 0, OPERATIONAL: 0, SYNTHETIC_TEST: 0, DEMO: 0 });
  const [policy, setPolicy] = useState(null);
  const [edits, setEdits] = useState({});
  const [busy, setBusy] = useState(false);
  const [savingId, setSavingId] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    setBusy(true);
    setError('');
    try {
      const result = await api.queueProvenance(token, 100, filter === 'ALL' ? '' : filter);
      setRecords(result.records || []);
      setSummary(result.summary || { UNCLASSIFIED: 0, OPERATIONAL: 0, SYNTHETIC_TEST: 0, DEMO: 0 });
      setPolicy(result.policy || null);
      setEdits(current => {
        const next = { ...current };
        for (const row of result.records || []) {
          if (!next[row.queue_id] || next[row.queue_id].provenance !== row.data_provenance) {
            next[row.queue_id] = { provenance: row.data_provenance, reason: '' };
          }
        }
        return next;
      });
    } catch (requestError) {
      setError(requestError.message || 'Could not load data-provenance records.');
    } finally {
      setBusy(false);
    }
  }, [token, filter]);

  useEffect(() => { refresh(); }, [refresh]);

  function updateEdit(queueId, key, value) {
    setEdits(current => ({
      ...current,
      [queueId]: { ...(current[queueId] || {}), [key]: value }
    }));
  }

  async function save(row) {
    const edit = edits[row.queue_id] || { provenance: row.data_provenance, reason: '' };
    if (edit.reason.trim().length < 5) {
      setError('Enter a review reason of at least 5 characters.');
      return;
    }
    if (['SYNTHETIC_TEST', 'DEMO'].includes(edit.provenance) && row.status !== 'Discharged') {
      setError('Complete the active visit through the normal workflow before classifying it as synthetic or demo data.');
      return;
    }
    setSavingId(row.queue_id);
    setError('');
    setNotice('');
    try {
      const updated = await api.updateQueueProvenance(token, row.queue_id, {
        provenance: edit.provenance,
        reason: edit.reason.trim()
      });
      setNotice(`${updated.ticket_number} provenance saved as “${labelFor(updated.data_provenance)}”. The change is recorded in Flight Recorder.`);
      setEdits(current => ({
        ...current,
        [row.queue_id]: { provenance: updated.data_provenance, reason: '' }
      }));
      await refresh();
    } catch (requestError) {
      setError(requestError.message || 'Could not save the provenance classification.');
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="max-w-3xl">
            <p className="eyebrow">Data quality workbench</p>
            <h2 className="font-display text-xl font-bold">Queue data provenance</h2>
            <p className="mt-2 text-sm leading-relaxed text-stone-600">New check-ins receive a provenance classification automatically from the server's configured policy. Existing historical records are never silently reclassified; ambiguous legacy records remain Unclassified until an authorised administrator reviews them.</p>
          </div>
          <Button variant="secondary" icon="refresh" onClick={refresh} disabled={busy}>{busy ? 'Refreshing…' : 'Refresh records'}</Button>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {PROVENANCE_OPTIONS.map(option => (
            <div key={option.value} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
              <p className="text-xs font-bold uppercase tracking-wide text-stone-500">{option.label}</p>
              <p className="mt-1 font-display text-2xl font-bold text-stone-900">{summary[option.value] ?? '—'}</p>
            </div>
          ))}
        </div>
        <div className="mt-4 rounded-xl border border-teal-200 bg-teal-50 p-4 text-sm leading-relaxed text-teal-950">
          <div className="flex flex-wrap items-center gap-2">
            <strong>Automatic check-in policy</strong>
            {policy && <Badge tone={toneFor(policy.new_visit_mode)}>{labelFor(policy.new_visit_mode)}</Badge>}
            {policy && <Badge tone="neutral">{policy.policy_source === 'ENVIRONMENT_CONFIG' ? 'Explicit server setting' : 'Environment default'}</Badge>}
          </div>
          {policy ? (
            <p className="mt-1">The server currently assigns new visits as <strong>{labelFor(policy.new_visit_mode)}</strong> using <code>DATA_PROVENANCE_MODE</code> ({policy.environment}). This is server-controlled and cannot be chosen in a check-in request. Status, triage and discharge updates preserve the classification; only an authorised provenance review changes it.</p>
          ) : (
            <p className="mt-1">Loading the server-controlled policy…</p>
          )}
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm leading-relaxed text-amber-950">
          <strong>Review rule:</strong> do not classify a record from a name, ticket number or symptom text alone. Use your test notes or other reliable context. Classification changes analytic inclusion only; it does not delete a visit, edit clinical notes, change visit status or alter triage priority. Every saved change requires a reason and is recorded in the append-only event log.
        </div>
      </Card>

      <Card className="overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-stone-200 p-4 sm:flex-row sm:items-end sm:justify-between md:p-5">
          <div>
            <h3 className="font-display text-lg font-bold">Visit records for review</h3>
            <p className="mt-1 text-sm text-stone-500">Up to 100 newest records. Patient names, identification numbers and symptom descriptions are intentionally omitted.</p>
          </div>
          <div className="w-full sm:max-w-xs">
            <Field label="Filter by provenance">
              <select className={inputClass} value={filter} onChange={event => setFilter(event.target.value)}>
                <option value="UNCLASSIFIED">Needs review</option>
                <option value="ALL">All provenance states</option>
                <option value="OPERATIONAL">Operational records</option>
                <option value="SYNTHETIC_TEST">Synthetic test records</option>
                <option value="DEMO">Demo / seeded data</option>
              </select>
            </Field>
          </div>
        </div>

        {busy && records.length === 0 ? (
          <div className="p-5"><EmptyState title="Loading visit records" message="Retrieving queue metadata and provenance classifications."/></div>
        ) : records.length === 0 ? (
          <div className="p-5"><EmptyState title={filter === 'UNCLASSIFIED' ? 'No unclassified records in this result' : 'No records found'} message={filter === 'UNCLASSIFIED' ? 'No additional visits need provenance review in the current result.' : 'Try another provenance filter.'}/></div>
        ) : (
          <div className="space-y-3 p-3 md:p-5">
            {records.map(row => {
              const edit = edits[row.queue_id] || { provenance: row.data_provenance, reason: '' };
              const isSaving = savingId === row.queue_id;
              const activeVisit = row.status !== 'Discharged';
              const forbiddenActiveLabel = activeVisit && ['SYNTHETIC_TEST', 'DEMO'].includes(edit.provenance);
              return (
                <article key={row.queue_id} className="rounded-xl border border-stone-200 bg-white p-4 md:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold text-stone-900">{row.ticket_number}</h4>
                        <Badge tone={toneFor(row.data_provenance)}>{labelFor(row.data_provenance)}</Badge>
                        <Badge tone={sourceTone(row.data_provenance_source)}>{sourceLabel(row.data_provenance_source)}</Badge>
                        <Badge tone="neutral">{row.status}</Badge>
                      </div>
                      <p className="mt-1 text-xs text-stone-500">Queue record #{row.queue_id} · Tier {row.priority_level} · Ticket date {row.ticket_date}</p>
                      {row.provenance_updated_by_staff_id && <p className="mt-1 text-xs text-stone-500">Last reviewed by staff record #{row.provenance_updated_by_staff_id}</p>}
                    </div>
                    <div className="text-xs leading-relaxed text-stone-500">
                      <p>Queued: {dateTime(row.queued_at)}</p>
                      <p>First call: {dateTime(row.called_at)}</p>
                      <p>Discharged: {dateTime(row.discharged_at)}</p>
                    </div>
                  </div>
                  {row.data_provenance_note && <p className="mt-3 rounded-lg bg-stone-50 p-3 text-xs leading-relaxed text-stone-600"><strong>Previous review note:</strong> {row.data_provenance_note}</p>}
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(12rem,.8fr)_minmax(18rem,1.6fr)_auto] lg:items-end">
                    <Field label="Classification">
                      <select className={inputClass} value={edit.provenance} onChange={event => updateEdit(row.queue_id, 'provenance', event.target.value)}>
                        {PROVENANCE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                      </select>
                    </Field>
                    <Field label="Review reason" hint="Required; 5–300 characters. Avoid sensitive clinical details.">
                      <textarea className={inputClass} rows={2} maxLength={300} value={edit.reason} onChange={event => updateEdit(row.queue_id, 'reason', event.target.value)} placeholder="e.g. Matched to the synthetic acceptance-test run on 20 October."/>
                    </Field>
                    <Button icon="check" onClick={() => save(row)} disabled={isSaving || edit.reason.trim().length < 5 || forbiddenActiveLabel}>
                      {isSaving ? 'Saving…' : 'Save classification'}
                    </Button>
                  </div>
                  {forbiddenActiveLabel && <p className="mt-2 text-xs text-amber-800">This visit is still active. Complete it through the normal workflow before marking it as synthetic or demo data.</p>}
                  {row.provenance_updated_at && <p className="mt-3 text-xs text-stone-500">Last reviewed: {dateTime(row.provenance_updated_at)}</p>}
                </article>
              );
            })}
          </div>
        )}
      </Card>

      {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
    </div>
  );
}
