import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Download, Edit3, Loader2, PenLine, Plus, Trash2, X, ShieldAlert
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import SessionSignaturePad from '../components/patients/sessions/SessionSignaturePad';
import { showAlert, showConfirm } from '../store/modalStore';
import {
  createPatientSession, createSignatureSignedUrl, fetchPatientSessions, revokePatientSessionSignature,
  savePatientSessionSignature, softDeletePatientSession, updatePatientSession,
  type PatientSession, type PatientSessionStatus
} from '../services/patientSessions';
import { downloadPatientSessionsPdf, generatePatientSessionsPdf, getPatientSessionsPdfFileName } from '../utils/patientSessionsPdf';

type FormState = { date: string; time: string; status: PatientSessionStatus; notes: string };
const today = () => new Date().toISOString().slice(0, 10);
const currentTime = () => new Date().toTimeString().slice(0, 5);

const statusLabels: Record<PatientSessionStatus, string> = {
  scheduled: 'Agendada', completed: 'Realizada', cancelled: 'Cancelada', missed: 'Falta'
};

const shiftMonth = (date: Date, delta: number) => new Date(date.getFullYear(), date.getMonth() + delta, 1);

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

export default function PatientSessions() {
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const [patient, setPatient] = useState<any>(null);
  const [professional, setProfessional] = useState<any>(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [sessions, setSessions] = useState<PatientSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [formSession, setFormSession] = useState<PatientSession | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>({ date: today(), time: currentTime(), status: 'completed', notes: '' });
  const [signSession, setSignSession] = useState<PatientSession | null>(null);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signerType, setSignerType] = useState<'patient' | 'responsible'>('patient');
  const [signerName, setSignerName] = useState('');

  const load = async () => {
    if (!id || !user) return;
    setLoading(true);
    try {
      const [{ data: patientData, error: patientError }, { data: profData, error: profError }, sessionData] = await Promise.all([
        supabase.from('patients').select('id, full_name, professional_id').eq('id', id).single(),
        supabase.from('professionals').select('id, full_name, professional_register').eq('id', user.id).single(),
        fetchPatientSessions(id, month),
      ]);
      if (patientError) throw patientError;
      if (profError) throw profError;
      setPatient(patientData);
      setProfessional(profData);
      setSessions(sessionData);
    } catch (error: any) {
      console.error('[PatientSessions] Falha ao carregar:', error);
      void showAlert(error.message || 'Não foi possível carregar o controle de sessões.', { title: 'Controle de sessões', variant: 'error', icon: 'alert' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, [id, user?.id, month.getFullYear(), month.getMonth()]);

  const monthLabel = useMemo(
    () => new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(month),
    [month]
  );
  const signedCount = sessions.filter((item) => item.signature).length;

  const openCreate = (quick = false) => {
    setFormSession(null);
    setForm({ date: today(), time: quick ? currentTime() : '', status: 'completed', notes: '' });
  };

  const openEdit = (session: PatientSession) => {
    if (session.signature) {
      void showAlert('Revogue a assinatura antes de editar data, horário ou situação da sessão.', { title: 'Sessão assinada', variant: 'info', icon: 'info' });
      return;
    }
    setFormSession(session);
    setForm({ date: session.sessionDate, time: session.sessionTime?.slice(0, 5) || '', status: session.status, notes: session.notes || '' });
  };

  const saveForm = async () => {
    if (!id || !user || !form.date) return;
    setWorking(true);
    try {
      if (formSession) {
        await updatePatientSession(formSession, {
          sessionDate: form.date, sessionTime: form.time || null, status: form.status, notes: form.notes
        });
      } else {
        await createPatientSession({
          patientId: id, professionalId: user.id, sessionDate: form.date,
          sessionTime: form.time || null, status: form.status, notes: form.notes
        });
      }
      setFormSession(undefined);
      await load();
    } catch (error: any) {
      void showAlert(error.message || 'Não foi possível salvar a sessão.', { title: 'Controle de sessões', variant: 'error', icon: 'alert' });
    } finally { setWorking(false); }
  };

  const remove = async (session: PatientSession) => {
    if (session.signature) {
      void showAlert('Revogue a assinatura antes de excluir esta sessão.', { title: 'Sessão assinada', variant: 'info', icon: 'info' });
      return;
    }
    const confirmed = await showConfirm('Excluir esta sessão do controle?', { title: 'Excluir sessão', confirmLabel: 'Excluir', variant: 'danger' });
    if (!confirmed) return;
    setWorking(true);
    try { await softDeletePatientSession(session); await load(); }
    catch (error: any) { void showAlert(error.message || 'Não foi possível excluir.', { title: 'Erro', variant: 'error', icon: 'alert' }); }
    finally { setWorking(false); }
  };

  const saveSignature = async () => {
    if (!signSession || !signatureBlob) return;
    setWorking(true);
    try {
      await savePatientSessionSignature({ session: signSession, signatureBlob, signerType, signerName });
      setSignSession(null); setSignatureBlob(null); setSignerName(''); setSignerType('patient');
      await load();
    } catch (error: any) {
      void showAlert(error.message || 'Não foi possível registrar a assinatura.', { title: 'Assinatura', variant: 'error', icon: 'alert' });
    } finally { setWorking(false); }
  };

  const revoke = async (session: PatientSession) => {
    const confirmed = await showConfirm(
      'A assinatura atual será preservada no histórico como revogada. Depois disso, a sessão poderá ser corrigida e assinada novamente.',
      { title: 'Revogar assinatura?', confirmLabel: 'Revogar assinatura', variant: 'danger' }
    );
    if (!confirmed) return;
    setWorking(true);
    try { await revokePatientSessionSignature(session, 'Revogada pelo profissional para correção do registro.'); await load(); }
    catch (error: any) { void showAlert(error.message || 'Não foi possível revogar a assinatura.', { title: 'Assinatura', variant: 'error', icon: 'alert' }); }
    finally { setWorking(false); }
  };

  const exportPdf = async () => {
    if (!patient || !professional) return;
    setWorking(true);
    try {
      const signatureImages: Record<string, string> = {};
      for (const session of sessions) {
        if (!session.signature) continue;
        const url = await createSignatureSignedUrl(session.signature.signaturePath, 120);
        const response = await fetch(url);
        if (response.ok) signatureImages[session.signature.id] = await blobToDataUrl(await response.blob());
      }
      const doc = generatePatientSessionsPdf({
        patientName: patient.full_name,
        professionalName: professional.full_name,
        professionalRegister: professional.professional_register,
        month, sessions, signatureImages,
      });
      await downloadPatientSessionsPdf(doc, getPatientSessionsPdfFileName(patient.full_name, month));
    } catch (error: any) {
      void showAlert(error.message || 'Não foi possível gerar o PDF.', { title: 'Exportar PDF', variant: 'error', icon: 'alert' });
    } finally { setWorking(false); }
  };

  return (
    <div className="space-y-6 pb-24">
      <PanelPageHeader
        title="Controle de Sessões"
        subtitle={patient ? patient.full_name : 'Registro mensal de atendimentos e assinaturas'}
        actions={<Link to={id ? `/painel/patients/${id}` : '/painel/patients'} className="btn-outline"><ArrowLeft size={16} /><span>Voltar</span></Link>}
      />

      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <button type="button" onClick={() => setMonth((value) => shiftMonth(value, -1))} className="rounded-xl border border-brand-border p-2.5 text-brand-primary hover:bg-brand-bg"><ChevronLeft size={18} /></button>
            <div className="min-w-[190px] text-center">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Período</p>
              <h2 className="capitalize font-semibold text-brand-text">{monthLabel}</h2>
            </div>
            <button type="button" onClick={() => setMonth((value) => shiftMonth(value, 1))} className="rounded-xl border border-brand-border p-2.5 text-brand-primary hover:bg-brand-bg"><ChevronRight size={18} /></button>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => void exportPdf()} disabled={working || sessions.length === 0} className="btn-outline"><Download size={16} /><span>Exportar PDF</span></button>
            <button type="button" onClick={() => openCreate(false)} className="btn-outline"><Plus size={16} /><span>Nova sessão</span></button>
            <button type="button" onClick={() => openCreate(true)} className="btn-primary"><PenLine size={16} /><span>Registrar sessão de hoje</span></button>
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-brand-border/60 pt-4 text-center">
          <div><strong className="block text-lg text-brand-primary">{sessions.length}</strong><span className="text-[10px] text-brand-text-muted">sessões</span></div>
          <div><strong className="block text-lg text-emerald-700">{signedCount}</strong><span className="text-[10px] text-brand-text-muted">assinadas</span></div>
          <div><strong className="block text-lg text-brand-text">{sessions.length - signedCount}</strong><span className="text-[10px] text-brand-text-muted">sem assinatura</span></div>
        </div>
      </div>

      {loading ? (
        <div className="card flex min-h-48 items-center justify-center gap-2 text-brand-text-muted"><Loader2 className="animate-spin" size={20} />Carregando sessões...</div>
      ) : sessions.length === 0 ? (
        <div className="card p-8 text-center">
          <CalendarDays className="mx-auto text-brand-primary/60" size={34} />
          <h3 className="mt-3 font-semibold text-brand-text">Nenhuma sessão neste mês</h3>
          <p className="mt-1 text-sm text-brand-text-muted">Registre a primeira sessão para começar o controle mensal.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map((session) => (
            <div key={session.id} className="card p-4 sm:p-5">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-brand-text">{session.sessionDate.split('-').reverse().join('/')}</strong>
                    <span className="inline-flex items-center gap-1 text-sm text-brand-text-muted"><Clock3 size={14} />{session.sessionTime?.slice(0,5) || 'Sem horário'}</span>
                    <span className="rounded-full bg-brand-bg px-2 py-1 text-[10px] font-bold text-brand-text-muted">{statusLabels[session.status]}</span>
                  </div>
                  {session.notes && <p className="mt-2 text-xs text-brand-text-muted">{session.notes}</p>}
                  {session.signature ? (
                    <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-700"><CheckCircle2 size={14} />Assinatura registrada em {new Date(session.signature.signedAt).toLocaleString('pt-BR')}</p>
                  ) : (
                    <p className="mt-2 text-xs text-brand-text-muted">Assinatura ainda não registrada.</p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {session.signature ? (
                    <button type="button" onClick={() => void revoke(session)} disabled={working} className="btn-outline border-amber-300 text-amber-700"><ShieldAlert size={15} /><span>Revogar assinatura</span></button>
                  ) : (
                    <>
                      <button type="button" onClick={() => { setSignSession(session); setSignatureBlob(null); }} className="btn-primary"><PenLine size={15} /><span>Assinar</span></button>
                      <button type="button" onClick={() => openEdit(session)} className="btn-outline"><Edit3 size={15} /><span>Editar</span></button>
                      <button type="button" onClick={() => void remove(session)} className="btn-outline border-red-200 text-red-700"><Trash2 size={15} /><span>Excluir</span></button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {formSession !== undefined && (
        <div className="fixed inset-0 z-[100] flex items-end bg-black/55 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full max-w-lg rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-brand-border p-5">
              <div><h3 className="font-semibold text-brand-text">{formSession ? 'Editar sessão' : 'Nova sessão'}</h3><p className="text-xs text-brand-text-muted">{patient?.full_name}</p></div>
              <button type="button" onClick={() => setFormSession(undefined)} className="p-2 text-brand-text-muted"><X size={20} /></button>
            </div>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="text-xs font-semibold text-brand-text">Data<input type="date" value={form.date} onChange={(e) => setForm((v) => ({ ...v, date: e.target.value }))} className="input-field mt-1 w-full" /></label>
              <label className="text-xs font-semibold text-brand-text">Horário<input type="time" value={form.time} onChange={(e) => setForm((v) => ({ ...v, time: e.target.value }))} className="input-field mt-1 w-full" /></label>
              <label className="text-xs font-semibold text-brand-text sm:col-span-2">Situação<select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as PatientSessionStatus }))} className="input-field mt-1 w-full">
                <option value="completed">Realizada</option><option value="scheduled">Agendada</option><option value="cancelled">Cancelada</option><option value="missed">Falta</option>
              </select></label>
              <label className="text-xs font-semibold text-brand-text sm:col-span-2">Observação opcional<textarea value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} maxLength={2000} rows={3} className="input-field mt-1 w-full resize-y" /></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-brand-border p-4"><button type="button" onClick={() => setFormSession(undefined)} className="btn-outline">Cancelar</button><button type="button" onClick={() => void saveForm()} disabled={working || !form.date} className="btn-primary">{working && <Loader2 size={15} className="animate-spin" />}<span>Salvar sessão</span></button></div>
          </div>
        </div>
      )}

      {signSession && (
        <div className="fixed inset-0 z-[110] flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full max-w-2xl rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-brand-border p-5">
              <div><h3 className="font-semibold text-brand-text">Confirmar sessão</h3><p className="text-xs text-brand-text-muted">{patient?.full_name} • {signSession.sessionDate.split('-').reverse().join('/')} {signSession.sessionTime?.slice(0,5) || ''}</p></div>
              <button type="button" onClick={() => setSignSession(null)} className="p-2 text-brand-text-muted"><X size={20} /></button>
            </div>
            <div className="space-y-4 p-5">
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-xs font-semibold text-brand-text">Quem está assinando?<select value={signerType} onChange={(e) => setSignerType(e.target.value as 'patient' | 'responsible')} className="input-field mt-1 w-full"><option value="patient">Paciente</option><option value="responsible">Responsável</option></select></label>
                <label className="text-xs font-semibold text-brand-text">Nome (opcional)<input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="input-field mt-1 w-full" maxLength={160} /></label>
              </div>
              <SessionSignaturePad onChange={setSignatureBlob} />
            </div>
            <div className="flex justify-end gap-2 border-t border-brand-border p-4"><button type="button" onClick={() => setSignSession(null)} className="btn-outline">Cancelar</button><button type="button" disabled={!signatureBlob || working} onClick={() => void saveSignature()} className="btn-primary">{working && <Loader2 size={15} className="animate-spin" />}<span>Confirmar assinatura</span></button></div>
          </div>
        </div>
      )}
    </div>
  );
}
