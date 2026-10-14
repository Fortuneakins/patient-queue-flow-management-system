import { Badge, Card, EmptyState } from '../../components/ui';

export default function StaffDirectoryView({ staff }) {
  const active = staff.filter(item => item.is_active !== false);
  return <Card className="overflow-hidden"><div className="border-b border-stone-100 p-5"><p className="text-sm text-stone-500">Read-only directory available to staff members with the VIEW_STAFF_DIRECTORY permission.</p></div><div className="divide-y divide-stone-100">{active.map(item => <div key={item.staff_id} className="flex items-center justify-between gap-3 p-4"><div><div className="font-semibold text-stone-900">{item.username}</div><div className="mt-1 text-xs text-stone-400">{item.employee_id || 'No employee ID'}</div></div><Badge tone="teal">{item.role}</Badge></div>)}{!active.length && <EmptyState title="No active staff" message="No active staff accounts are currently available."/>}</div></Card>;
}
