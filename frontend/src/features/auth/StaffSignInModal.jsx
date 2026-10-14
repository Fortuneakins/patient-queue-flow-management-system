import { useState } from 'react';
import { Button, Field, Modal, inputClass, Spinner } from '../../components/ui';

export default function StaffSignInModal({ onClose, onLogin, busy, error }) {
  const [form, setForm] = useState({ username: '', password: '' });
  return <Modal title="Staff Sign-In" onClose={onClose}>
    <p className="mb-6 text-sm text-stone-500">Access is determined by your account role and permissions.</p>
    {error && <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">{error}</div>}
    <form className="space-y-4" onSubmit={async e => { e.preventDefault(); await onLogin(form); }}>
      <Field label="Username" required><input className={inputClass} autoFocus value={form.username} onChange={e => setForm({...form, username: e.target.value})}/></Field>
      <Field label="Password" required><input className={inputClass} type="password" value={form.password} onChange={e => setForm({...form, password: e.target.value})}/></Field>
      <Button type="submit" className="w-full" disabled={busy}>{busy ? <><Spinner/> Verifying…</> : 'Sign In'}</Button>
    </form>
  </Modal>;
}
