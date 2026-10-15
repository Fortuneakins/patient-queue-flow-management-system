import { useState } from 'react';
import { api } from '../../../services/api';
import { Badge, Button, Card, Field, inputClass } from '../../../components/ui';

const languages = [
  ['en','English'],['af','Afrikaans'],['zu','isiZulu'],['xh','isiXhosa'],['st','Sesotho'],['tn','Setswana'],
  ['nso','Sepedi'],['ts','Xitsonga'],['ss','siSwati'],['ve','Tshivenda'],['nr','isiNdebele']
];
const initial = { preferred_language_code: 'en', preferred_channel: 'NONE', contact_consent: false, consent_method: 'STAFF_RECORDED', consent_version: 'v1' };
export default function AccessBridgePanel({ token }) {
  const [patientId, setPatientId] = useState('');
  const [patientSearch, setPatientSearch] = useState('');
  const [patientMatches, setPatientMatches] = useState([]);
  const [prefs, setPrefs] = useState(initial);
  const [loaded, setLoaded] = useState(false);
  const [template, setTemplate] = useState('SERVICE_DELAY');
  const [lastMessage, setLastMessage] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  async function searchPatients(event) {
    event.preventDefault();
    setError(''); setNotice('');
    const term = patientSearch.trim();
    if (term.length < 2) { setError('Enter at least two characters to search patient records.'); return; }
    setBusy(true);
    try {
      const rows = await api.listPatients(token, term);
      setPatientMatches(rows);
      setNotice(rows.length ? rows.length + ' patient record(s) found.' : 'No matching patient records found.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function load() {
    setError(''); setNotice('');
    if (!Number.isInteger(Number(patientId)) || Number(patientId) < 1) { setError('Enter a valid patient ID first.'); return; }
    setBusy(true);
    try {
      const saved = await api.contactPreferences(token, Number(patientId));
      setPrefs({ preferred_language_code: saved.preferred_language_code || 'en', preferred_channel: saved.preferred_channel || 'NONE', contact_consent: Boolean(saved.contact_consent), consent_method: saved.consent_method || 'STAFF_RECORDED', consent_version: saved.consent_version || 'v1' });
      setLoaded(true);
      setNotice(saved.not_configured ? 'No preference record existed; safe defaults were loaded.' : 'Contact preferences loaded.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function save() {
    if (!loaded) { setError('Load an existing patient preference record first.'); return; }
    setError(''); setNotice(''); setBusy(true);
    try {
      const saved = await api.updateContactPreferences(token, Number(patientId), {
        ...prefs,
        contact_consent: Boolean(prefs.contact_consent),
        preferred_channel: prefs.contact_consent ? prefs.preferred_channel : (prefs.preferred_channel === 'NONE' ? 'NONE' : prefs.preferred_channel),
        consent_confirmed: Boolean(prefs.contact_consent),
        consent_method: prefs.contact_consent ? 'STAFF_RECORDED' : 'REVOKED'
      });
      setPrefs({ ...prefs, ...saved });
      setNotice(saved.contact_consent ? 'Consent recorded. SMS can be attempted only if a verified contact number and provider configuration are available.' : 'Contact consent is off. No Access Bridge messages will be sent.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  async function send() {
    setError(''); setNotice(''); setBusy(true);
    try {
      const result = await api.sendAccessUpdate(token, Number(patientId), { template_code: template });
      setLastMessage(result);
      setNotice('Communication attempt recorded as ' + result.delivery_status + '.');
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  }
  return <div className="grid gap-5 xl:grid-cols-[.9fr_1.1fr]">
    <Card className="p-5 md:p-6">
      <h2 className="font-display text-lg font-bold">Consent-based contact preferences</h2>
      <p className="mt-1 text-sm text-stone-500">Contact preferences are separate from clinical care. Staff should record explicit consent and honour revocation before sending operational updates.</p>
      <form className="mt-4 flex items-end gap-2" onSubmit={searchPatients}><div className="flex-1"><Field label="Find patient by name or ID number"><input className={inputClass} value={patientSearch} maxLength={150} onChange={e => setPatientSearch(e.target.value)} placeholder="Search patient records"/></Field></div><Button type="submit" variant="secondary" icon="search" disabled={busy}>Search</Button></form>
      {patientMatches.length > 0 && <div className="mt-3"><Field label="Matching patient records"><select className={inputClass} value={patientId} onChange={e => { setPatientId(e.target.value); setLoaded(false); }}><option value="">Choose a patient record</option>{patientMatches.map(patient => <option key={patient.patient_id} value={patient.patient_id}>{patient.full_name} · record #{patient.patient_id}</option>)}</select></Field></div>}
      <div className="mt-3 flex items-end gap-2"><div className="flex-1"><Field label="Selected patient record ID" required><input className={inputClass} type="number" min="1" value={patientId} onChange={e => { setPatientId(e.target.value); setLoaded(false); }} /></Field></div><Button onClick={load} variant="secondary" disabled={busy || !patientId}>Load preferences</Button></div>
      <div className="mt-4 space-y-3">
        <Field label="Preferred language"><select className={inputClass} value={prefs.preferred_language_code} onChange={e => setPrefs({ ...prefs, preferred_language_code: e.target.value })}>{languages.map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></Field>
        <Field label="Preferred channel"><select className={inputClass} value={prefs.preferred_channel} onChange={e => setPrefs({ ...prefs, preferred_channel: e.target.value })}><option value="NONE">No messages</option><option value="SMS">SMS</option><option value="VOICE">Voice (preference only; provider not implemented)</option></select></Field>
        <label className="flex items-start gap-3 rounded-xl border border-stone-200 p-3 text-sm"><input type="checkbox" className="mt-1" checked={prefs.contact_consent} onChange={e => setPrefs({ ...prefs, contact_consent: e.target.checked, preferred_channel: e.target.checked ? (prefs.preferred_channel === 'NONE' ? 'SMS' : prefs.preferred_channel) : 'NONE' })}/><span><strong>Explicit contact consent recorded</strong><span className="mt-1 block text-xs text-stone-500">Only check this after consent has actually been obtained. Unchecking it revokes consent.</span></span></label>
        <Field label="Consent version"><input className={inputClass} maxLength={30} value={prefs.consent_version} onChange={e => setPrefs({ ...prefs, consent_version: e.target.value })}/></Field>
        <Button onClick={save} disabled={busy || !loaded}>Save preferences</Button>
      </div>
      {prefs.preferred_language_code !== 'en' && <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">The selected language is saved as a preference, but the SMS provider currently sends the approved English template only. Reviewed translations are still required before sending local-language content.</p>}
    </Card>
    <Card className="p-5 md:p-6">
      <h2 className="font-display text-lg font-bold">Operational message</h2>
      <p className="mt-1 text-sm text-stone-500">Only non-clinical waiting or service-delay templates are permitted. No diagnosis, symptoms, triage priority or consultation notes are sent.</p>
      <div className="mt-4 space-y-3">
        <Field label="Message template"><select className={inputClass} value={template} onChange={e => setTemplate(e.target.value)}><option value="SERVICE_DELAY">Service delay notice</option><option value="WAIT_ESTIMATE">Estimated wait</option></select></Field>
        <div className="rounded-xl border border-stone-200 bg-stone-50 p-4 text-sm text-stone-700">{template === 'WAIT_ESTIMATE' ? 'The server calculates the estimate from the patient’s current waiting visit and priority tier at send time. If the analytics estimate is unavailable, no wait-estimate message will be sent.' : 'RMSH clinic update: there is an operational delay. This update is not a clinical assessment. Please alert clinic staff if your condition worsens.'}</div>
        <Button onClick={send} disabled={busy || !loaded || !prefs.contact_consent || prefs.preferred_channel !== 'SMS'}>Send consented SMS update</Button>
        {!prefs.contact_consent && <p className="text-xs text-stone-500">Send is disabled until consent is explicitly recorded.</p>}
      </div>
      {lastMessage && <div className="mt-4 rounded-xl border border-stone-200 p-4"><div className="flex flex-wrap items-center justify-between gap-2"><strong>Attempt #{lastMessage.communication_id}</strong><Badge tone={lastMessage.delivery_status === 'SENT' ? 'green' : lastMessage.delivery_status === 'FAILED' ? 'red' : 'orange'}>{lastMessage.delivery_status}</Badge></div><p className="mt-2 text-xs text-stone-500">{lastMessage.status_message || 'No provider detail returned'} · {lastMessage.created_at ? new Date(lastMessage.created_at).toLocaleString() : ''}</p>{lastMessage.estimated_wait_minutes !== null && lastMessage.estimated_wait_minutes !== undefined && <p className="mt-2 text-sm">Estimate used: <strong>{lastMessage.estimated_wait_minutes} minutes</strong></p>}{lastMessage.translation_review_required && <p className="mt-2 text-xs text-amber-700">English fallback was used; localised translation has not yet received review.</p>}</div>}
    </Card>
    {(error || notice) && <p role={error ? 'alert' : 'status'} className={`rounded-xl border p-3 text-sm xl:col-span-2 ${error ? 'border-red-200 bg-red-50 text-red-700' : 'border-emerald-200 bg-emerald-50 text-emerald-800'}`}>{error || notice}</p>}
  </div>;
}
