import { useState } from 'react';
import { Button, Field, Modal, inputClass } from '../../components/ui';

export default function ChangePasswordModal({ forced, onClose, onSubmit, busy }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError('');
    if (form.new_password.length < 8) return setError('Password must be at least 8 characters.');
    if (form.new_password !== form.confirm_password) return setError('Password confirmation does not match.');
    try { await onSubmit({ current_password: form.current_password, new_password: form.new_password }); onClose(); } catch (err) { setError(err.message || 'Could not update password.'); }
  }
  return <Modal title={forced ? 'Set Your Password' : 'Change Password'} onClose={forced ? undefined : onClose}>
    <p className="mb-5 text-sm text-stone-500">{forced ? 'Your temporary password must be changed before you can use the staff workspace.' : 'Use a strong password of at least 8 characters.'}</p>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    <form className="space-y-4" onSubmit={submit}>
      <Field label="Current password" required><input className={inputClass} type="password" value={form.current_password} onChange={e=>setForm({...form,current_password:e.target.value})}/></Field>
      <Field label="New password" required><input className={inputClass} type="password" value={form.new_password} onChange={e=>setForm({...form,new_password:e.target.value})}/></Field>
      <Field label="Confirm new password" required><input className={inputClass} type="password" value={form.confirm_password} onChange={e=>setForm({...form,confirm_password:e.target.value})}/></Field>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</Button>
    </form>
  </Modal>;
}
