import { Card, EmptyState } from '../../components/ui';
import { formatDateTime } from '../../utils/format';

export default function DischargeLogView({ rows }) {
  return <Card className="overflow-hidden"><div className="divide-y divide-stone-100">{rows.map(row=><div key={row.queue_id} className="grid gap-2 p-4 md:grid-cols-[120px_1fr_180px]"><div className="font-mono font-bold">{row.ticket_number}</div><div><div className="font-semibold">{row.full_name}</div><div className="mt-1 text-xs text-stone-500">Tier {row.priority_level || 4} · {row.discharged_by_username || '—'}</div></div><div className="text-xs text-stone-400">{formatDateTime(row.discharged_at)}</div></div>)}{!rows.length&&<EmptyState title="No discharges" message="The discharge log is empty."/>}</div></Card>;
}
