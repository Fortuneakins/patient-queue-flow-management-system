import { useState } from 'react';
import { Button, Field, Modal, inputClass } from '../../components/ui';

const productionPasswordPolicy = import.meta.env.PROD;
const minimumPasswordLength = productionPasswordPolicy ? 14 : 8;
const passwordPolicyText = productionPasswordPolicy
  ? 'Use at least 14 characters, including uppercase, lowercase, a number and a special character. Do not use demo or placeholder passwords.'
  : 'Use a strong password of at least 8 characters.';

function meetsPasswordPolicy(value) {
  if (value.length < minimumPasswordLength) return false;
  if (!productionPasswordPolicy) return true;
  return /[a-z]/.test(value)
    && /[A-Z]/.test(value)
    && /[0-9]/.test(value)
    && /[^A-Za-z0-9]/.test(value)
    && !/DemoPass2026!|password|change-me/i.test(value);
}

export default function ChangePasswordModal({ forced, onClose, onSubmit, busy }) {
  const [form, setForm] = useState({ current_password: '', new_password: '', confirm_password: '' });
  const [error, setError] = useState('');
  async function submit(e) {
    e.preventDefault(); setError('');
    if (!meetsPasswordPolicy(form.new_password)) return setError(passwordPolicyText);
    if (form.new_password !== form.confirm_password) return setError('Password confirmation does not match.');
    try { await onSubmit({ current_password: form.current_password, new_password: form.new_password }); onClose(); } catch (err) { setError(err.message || 'Could not update password.'); }
  }
  return <Modal title={forced ? 'Set Your Password' : 'Change Password'} onClose={forced ? undefined : onClose}>
    <p className="mb-5 text-sm text-stone-500">{forced ? 'Your temporary password must be changed before you can use the staff workspace. ' : ''}{passwordPolicyText}</p>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
    <form className="space-y-4" onSubmit={submit}>
      <Field label="Current password" required><input className={inputClass} type="password" value={form.current_password} onChange={e=>setForm({...form,current_password:e.target.value})}/></Field>
      <Field label="New password" required><input className={inputClass} type="password" minLength={minimumPasswordLength} autoComplete="new-password" value={form.new_password} onChange={e=>setForm({...form,new_password:e.target.value})}/></Field>
      <Field label="Confirm new password" required><input className={inputClass} type="password" minLength={minimumPasswordLength} autoComplete="new-password" value={form.confirm_password} onChange={e=>setForm({...form,confirm_password:e.target.value})}/></Field>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? 'Updating…' : 'Update Password'}</Button>
    </form>
  </Modal>;
}
