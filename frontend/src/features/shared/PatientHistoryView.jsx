import { useState } from 'react';
import { Badge, Button, Card, EmptyState, inputClass } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

export default function PatientHistoryView({ history, onRefreshHistory, canSeeNotes = false }) {
  const [identificationNumber, setIdentificationNumber] = useState('');
  const [error, setError] = useState('');

  async function load(e) {
    e.preventDefault();
    setError('');
    try {
      await onRefreshHistory(identificationNumber.trim());
    } catch (err) {
      setError(err.message || 'Unable to load patient history.');
    }
  }

  return <div className="space-y-4">
    <Card className="p-5">
      <form className="flex flex-col gap-2 sm:flex-row" onSubmit={load}>
        <input aria-label="Patient identification number" className={inputClass} placeholder="Patient identification number" value={identificationNumber} onChange={e=>setIdentificationNumber(e.target.value.toUpperCase())}/>
        <Button type="submit" icon="history" disabled={!identificationNumber.trim()}>Load History</Button>
      </form>
      {error && <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    </Card>
    {history.length ? <Card className="overflow-hidden"><div className="divide-y divide-stone-100">{history.map(item => <div key={item.queue_id} className="p-4"><div className="flex flex-wrap items-center gap-2"><span className="font-mono font-bold">{item.ticket_number}</span><Badge tone="green">Discharged</Badge><span className="text-xs text-stone-400">{formatDateTime(item.discharged_at)}</span></div><p className="mt-2 text-sm text-stone-600">{item.symptoms}</p><p className="mt-1 text-xs text-stone-400">Priority tier {item.priority_level || 4}</p>{canSeeNotes && item.doctor_notes && <div className="mt-3 rounded-xl bg-stone-50 p-3 text-sm text-stone-700"><b>Consultation notes:</b> {item.doctor_notes}</div>}</div>)}</div></Card> : <EmptyState title="No history loaded" message="Search a patient to view discharged visits."/>}
  </div>;
}
