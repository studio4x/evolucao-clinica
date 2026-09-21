import React, { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft, CalendarDays, CheckCircle2, ChevronLeft, ChevronRight, Clock3,
  Download, Edit3, Loader2, PenLine, Plus, Trash2, X, ShieldAlert, ShieldCheck
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { hasActiveYearlyAccess } from '../utils/subscriptionAccess';
import SessionSignaturePad from '../components/patients/sessions/SessionSignaturePad';
import { showAlert, showConfirm } from '../store/modalStore';
import {
  cancelPatientSessionPackage, closePatientSessionMonth, createPatientSession, createPatientSessionPackage, createSignatureSignedUrl,
  fetchPatientSessionMonthClosure, fetchPatientSessionPackages, fetchPatientSessions, fetchPatientSessionsRange, revokePatientSessionSignature,
  savePatientSessionSignature, softDeletePatientSession, updatePatientSession,
  type PatientSession, type PatientSessionMonthClosure, type PatientSessionPackage, type PatientSessionStatus
} from '../services/patientSessions';
import { downloadPatientSessionsPdf, generatePatientSessionsPdf, getPatientSessionsPdfFileName } from '../utils/patientSessionsPdf';

type FormState = { date: string; time: string; status: PatientSessionStatus; notes: string; evolutionId: string; packageId: string };
const today = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};
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
  const siteConfig = useSiteConfig();
  const { id } = useParams();
  const user = useAuthStore((state) => state.user);
  const [patient, setPatient] = useState<any>(null);
  const [professional, setProfessional] = useState<any>(null);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [sessions, setSessions] = useState<PatientSession[]>([]);
  const [monthClosure, setMonthClosure] = useState<PatientSessionMonthClosure | null>(null);
  const [packages, setPackages] = useState<PatientSessionPackage[]>([]);
  const [evolutions, setEvolutions] = useState<any[]>([]);
  const [statusFilter, setStatusFilter] = useState<'all' | PatientSessionStatus>('all');
  const [signatureFilter, setSignatureFilter] = useState<'all' | 'signed' | 'unsigned'>('all');
  const [exportMode, setExportMode] = useState<'month' | 'year' | 'custom'>('month');
  const [exportStart, setExportStart] = useState(today());
  const [exportEnd, setExportEnd] = useState(today());
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [packageTarget, setPackageTarget] = useState(6);
  const [packageLabel, setPackageLabel] = useState('Pacote de sessões');
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [formSession, setFormSession] = useState<PatientSession | null | undefined>(undefined);
  const [form, setForm] = useState<FormState>({ date: today(), time: currentTime(), status: 'completed', notes: '', evolutionId: '', packageId: '' });
  const [signSession, setSignSession] = useState<PatientSession | null>(null);
  const [signatureBlob, setSignatureBlob] = useState<Blob | null>(null);
  const [signerType, setSignerType] = useState<'patient' | 'responsible'>('patient');
  const [signerName, setSignerName] = useState('');

  const load = async () => {
    if (!id || !user) return;
    setLoading(true);
    try {
      const [{ data: patientData, error: patientError }, { data: profData, error: profError }, sessionData, closureData, packageData, evolutionResult] = await Promise.all([
        supabase.from('patients').select('id, full_name, professional_id, session_days, session_time').eq('id', id).single(),
        supabase.from('professionals').select('id, full_name, professional_register, professional_title, custom_logo_url, custom_logo_settings, role, subscription_plan, subscription_status, subscription_ends_at').eq('id', user.id).single(),
        fetchPatientSessions(id, month),
        fetchPatientSessionMonthClosure(id, month),
        fetchPatientSessionPackages(id),
        supabase.from('evolutions').select('id, session_date, session_time, created_at').eq('patient_id', id).eq('professional_id', user.id).eq('transcription_status', 'completed').order('session_date', { ascending: false, nullsFirst: false }),
      ]);
      if (patientError) throw patientError;
      if (profError) throw profError;
      setPatient(patientData);
      setProfessional(profData);
      if (evolutionResult.error) throw evolutionResult.error;
      setSessions(sessionData);
      setMonthClosure(closureData);
      setPackages(packageData);
      setEvolutions(evolutionResult.data || []);
    } catch (error: any) {
      console.error('[PatientSessions] Falha ao carregar:', error);
      void showAlert(error.message || 'Não foi possível carregar o controle de sessões.', { title: 'Controle de sessões', variant: 'danger', icon: 'warning' });
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
  const unsignedCompletedCount = sessions.filter((item) => item.status === 'completed' && !item.signature).length;
  const scheduledCount = sessions.filter((item) => item.status === 'scheduled').length;
  const monthIsClosed = Boolean(monthClosure);
  const canCloseMonth = sessions.length > 0 && scheduledCount === 0 && unsignedCompletedCount === 0 && !monthIsClosed;
  const activePackage = packages.find((item) => item.status === 'active') || null;
  const filteredSessions = sessions.filter((session) => {
    if (statusFilter !== 'all' && session.status !== statusFilter) return false;
    if (signatureFilter === 'signed' && !session.signature) return false;
    if (signatureFilter === 'unsigned' && session.signature) return false;
    return true;
  });
  const habitualToday = Boolean(patient?.session_days?.includes(new Date().getDay()));
  const sameDayEvolutions = evolutions.filter((evolution) => evolution.session_date === form.date);

  const openCreate = (quick = false) => {
    if (monthIsClosed) {
      void showAlert('Este mês já foi fechado e assinado. Não é possível adicionar novas sessões.', { title: 'Mês fechado', variant: 'info', icon: 'info' });
      return;
    }
    setFormSession(null);
    setForm({ date: today(), time: quick ? currentTime() : (patient?.session_time?.slice(0, 5) || ''), status: 'completed', notes: '', evolutionId: '', packageId: activePackage?.id || '' });
  };

  const openEdit = (session: PatientSession) => {
    if (monthIsClosed) {
      void showAlert('Este mês já foi fechado e assinado e não pode mais ser alterado.', { title: 'Mês fechado', variant: 'info', icon: 'info' });
      return;
    }
    if (session.signature) {
      void showAlert('Revogue a assinatura antes de editar data, horário ou situação da sessão.', { title: 'Sessão assinada', variant: 'info', icon: 'info' });
      return;
    }
    setFormSession(session);
    setForm({ date: session.sessionDate, time: session.sessionTime?.slice(0, 5) || '', status: session.status, notes: session.notes || '', evolutionId: session.evolutionId || '', packageId: session.packageId || '' });
  };

  const saveForm = async () => {
    if (!id || !user || !form.date) return;
    setWorking(true);
    try {
      if (formSession) {
        await updatePatientSession(formSession, {
          sessionDate: form.date, sessionTime: form.time || null, status: form.status, notes: form.notes, evolutionId: form.evolutionId || null, packageId: form.packageId || null
        });
      } else {
        await createPatientSession({
          patientId: id, professionalId: user.id, sessionDate: form.date,
          sessionTime: form.time || null, status: form.status, notes: form.notes, evolutionId: form.evolutionId || null, packageId: form.packageId || null
        });
      }
      setFormSession(undefined);
      await load();
    } catch (error: any) {
      void showAlert(error.message || 'Não foi possível salvar a sessão.', { title: 'Controle de sessões', variant: 'danger', icon: 'warning' });
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
    catch (error: any) { void showAlert(error.message || 'Não foi possível excluir.', { title: 'Erro', variant: 'danger', icon: 'warning' }); }
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
      void showAlert(error.message || 'Não foi possível registrar a assinatura.', { title: 'Assinatura', variant: 'danger', icon: 'warning' });
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
    catch (error: any) { void showAlert(error.message || 'Não foi possível revogar a assinatura.', { title: 'Assinatura', variant: 'danger', icon: 'warning' }); }
    finally { setWorking(false); }
  };

  const generateAndDownloadPdf = async (options: {
    exportSessions: PatientSession[];
    exportMonth: Date;
    exportPeriodLabel: string;
    closure?: PatientSessionMonthClosure | null;
  }) => {
    const signatureImages: Record<string, string> = {};
    for (const session of options.exportSessions) {
      if (!session.signature) continue;
      const url = await createSignatureSignedUrl(session.signature.signaturePath, 120);
      const response = await fetch(url);
      if (response.ok) signatureImages[session.signature.id] = await blobToDataUrl(await response.blob());
    }

    const canUseCustomLogo = hasActiveYearlyAccess({
      profileRole: professional.role,
      subscriptionPlan: professional.subscription_plan,
      subscriptionStatus: professional.subscription_status,
      subscriptionEndsAt: professional.subscription_ends_at,
    });
    const logoUrl = canUseCustomLogo && professional.custom_logo_url
      ? professional.custom_logo_url
      : siteConfig.logo_light_url;
    let logoBase64: string | null = null;
    if (logoUrl) {
      try {
        const logoResponse = await fetch(logoUrl);
        if (logoResponse.ok) logoBase64 = await blobToDataUrl(await logoResponse.blob());
      } catch (logoError) {
        console.warn('[PatientSessions] Continuando PDF sem logotipo:', logoError);
      }
    }

    const doc = generatePatientSessionsPdf({
      patientName: patient.full_name,
      professionalName: professional.full_name,
      professionalRegister: professional.professional_register,
      professionalTitle: professional.professional_title,
      month: options.exportMonth,
      periodLabel: options.exportPeriodLabel,
      sessions: options.exportSessions,
      signatureImages,
      siteConfig,
      logoBase64,
      customLogoSettings: professional.custom_logo_settings,
      monthClosure: options.closure || null,
    });
    await downloadPatientSessionsPdf(doc, getPatientSessionsPdfFileName(patient.full_name, options.exportMonth));
  };

  const exportPdf = async () => {
    if (!patient || !professional || !id) return;
    setWorking(true);
    try {
      let exportSessions = sessions;
      let exportMonth = month;
      let exportPeriodLabel = monthLabel;
      let closure: PatientSessionMonthClosure | null = monthClosure;

      if (exportMode === 'year') {
        const start = `${month.getFullYear()}-01-01`;
        const end = `${month.getFullYear()}-12-31`;
        exportSessions = await fetchPatientSessionsRange(id, start, end);
        exportMonth = new Date(month.getFullYear(), 0, 1);
        exportPeriodLabel = String(month.getFullYear());
        closure = null;
      } else if (exportMode === 'custom') {
        if (!exportStart || !exportEnd || exportStart > exportEnd) throw new Error('Informe um intervalo de datas válido.');
        exportSessions = await fetchPatientSessionsRange(id, exportStart, exportEnd);
        exportMonth = new Date(`${exportStart}T12:00:00`);
        exportPeriodLabel = `De ${exportStart.split('-').reverse().join('/')} até ${exportEnd.split('-').reverse().join('/')}`;
        closure = null;
      }

      await generateAndDownloadPdf({ exportSessions, exportMonth, exportPeriodLabel, closure });
    } catch (error: any) {
      void showAlert(error.message || 'Não foi possível gerar o PDF.', { title: 'Exportar PDF', variant: 'danger', icon: 'warning' });
    } finally { setWorking(false); }
  };

  const closeMonth = async () => {
    if (!patient || !professional || !id || !user) return;

    if (!canCloseMonth) {
      const reasons = [
        scheduledCount > 0 ? `${scheduledCount} sessão(ões) ainda agendada(s)` : '',
        unsignedCompletedCount > 0 ? `${unsignedCompletedCount} sessão(ões) realizada(s) sem assinatura` : '',
      ].filter(Boolean).join(' e ');
      void showAlert(
        reasons ? `Antes de fechar o mês, resolva: ${reasons}.` : 'Este mês não pode ser fechado neste momento.',
        { title: 'Fechar mês', variant: 'info', icon: 'info' }
      );
      return;
    }

    const confirmed = await showConfirm(
      `O fechamento confirma todas as sessões de ${monthLabel}. Depois da assinatura, não será possível adicionar, editar, excluir sessões ou revogar assinaturas deste mês.`,
      { title: 'Fechar e assinar mês?', confirmLabel: 'Fechar e assinar', variant: 'danger' }
    );
    if (!confirmed) return;

    setWorking(true);
    try {
      const closure = await closePatientSessionMonth({
        patientId: id,
        professionalId: user.id,
        month,
      });
      const finalSessions = await fetchPatientSessions(id, month);
      setMonthClosure(closure);
      setSessions(finalSessions);
      await generateAndDownloadPdf({
        exportSessions: finalSessions,
        exportMonth: month,
        exportPeriodLabel: monthLabel,
        closure,
      });
      void showAlert(
        'Mês fechado e assinado com sucesso. O PDF assinado foi gerado e os registros deste período agora estão bloqueados.',
        { title: 'Mês assinado', variant: 'success', icon: 'success' }
      );
    } catch (error: any) {
      void showAlert(error.message || 'Não foi possível fechar e assinar o mês.', { title: 'Fechar mês', variant: 'danger', icon: 'warning' });
    } finally {
      setWorking(false);
    }
  };

  const createPackage = async () => {
    if (!id || !user || packageTarget < 1) return;
    setWorking(true);
    try {
      await createPatientSessionPackage({ patientId: id, professionalId: user.id, targetSessions: packageTarget, label: packageLabel });
      setShowPackageForm(false);
      await load();
    } catch (error: any) {
      void showAlert(error.message || 'Não foi possível iniciar o pacote.', { title: 'Pacote de sessões', variant: 'danger', icon: 'warning' });
    } finally { setWorking(false); }
  };

  const cancelPackage = async () => {
    if (!activePackage) return;
    const confirmed = await showConfirm('O acompanhamento deste pacote será encerrado. As sessões já registradas permanecem no histórico.', { title: 'Cancelar pacote?', confirmLabel: 'Cancelar pacote', variant: 'danger' });
    if (!confirmed) return;
    setWorking(true);
    try { await cancelPatientSessionPackage(activePackage.id); await load(); }
    catch (error: any) { void showAlert(error.message || 'Não foi possível cancelar o pacote.', { title: 'Pacote de sessões', variant: 'danger', icon: 'warning' }); }
    finally { setWorking(false); }
  };

  return (
    <div className="space-y-6 pb-24">
      <PanelPageHeader
        title="Controle de Sessões"
        description={patient ? patient.full_name : 'Registro mensal de atendimentos e assinaturas'}
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
            <button type="button" onClick={() => void exportPdf()} disabled={working || sessions.length === 0} className="btn-outline"><Download size={16} /><span>{monthIsClosed && exportMode === 'month' ? 'Baixar PDF assinado' : 'Exportar PDF'}</span></button>
            {monthIsClosed ? (
              <span className="inline-flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700"><ShieldCheck size={16} />Mês fechado</span>
            ) : (
              <>
                <button type="button" onClick={() => void closeMonth()} disabled={working || !canCloseMonth} className="btn-outline border-emerald-300 text-emerald-700"><ShieldCheck size={16} /><span>Fechar e assinar mês</span></button>
                <button type="button" onClick={() => openCreate(false)} className="btn-outline"><Plus size={16} /><span>Nova sessão</span></button>
                <button type="button" onClick={() => openCreate(true)} className="btn-primary"><PenLine size={16} /><span>Registrar sessão de hoje</span></button>
              </>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-3 gap-2 border-t border-brand-border/60 pt-4 text-center">
          <div><strong className="block text-lg text-brand-primary">{sessions.length}</strong><span className="text-[10px] text-brand-text-muted">sessões</span></div>
          <div><strong className="block text-lg text-emerald-700">{signedCount}</strong><span className="text-[10px] text-brand-text-muted">assinadas</span></div>
          <div><strong className="block text-lg text-brand-text">{sessions.length - signedCount}</strong><span className="text-[10px] text-brand-text-muted">sem assinatura</span></div>
        </div>
        {monthClosure ? (
          <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
            <strong>Mês fechado e assinado em {new Date(monthClosure.signatureDate).toLocaleString('pt-BR')}.</strong>
            <span className="mt-1 block">Hash: {monthClosure.signatureHash.slice(0, 20)}… • Os registros deste período estão bloqueados.</span>
          </div>
        ) : (scheduledCount > 0 || unsignedCompletedCount > 0) ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            Para fechar o mês: {scheduledCount > 0 ? `${scheduledCount} agendada(s)` : ''}{scheduledCount > 0 && unsignedCompletedCount > 0 ? ' • ' : ''}{unsignedCompletedCount > 0 ? `${unsignedCompletedCount} realizada(s) sem assinatura` : ''}.
          </div>
        ) : null}
      </div>

      {habitualToday && (
        <div className="rounded-2xl border border-brand-primary/15 bg-brand-primary/5 p-4 text-sm text-brand-text">
          <strong className="text-brand-primary">Atendimento habitual hoje.</strong>
          <span className="ml-1">Este paciente tem {patient?.session_time ? `horário habitual às ${String(patient.session_time).slice(0,5)}` : 'sessão habitual configurada'}.</span>
          <button type="button" onClick={() => openCreate(true)} className="ml-2 font-bold text-brand-primary hover:underline">Registrar sessão</button>
        </div>
      )}

      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold text-brand-text">Pacote de sessões</h3>
            <p className="text-xs text-brand-text-muted">Opcional: acompanhe apenas a quantidade de sessões, sem registrar cobrança ou valores.</p>
          </div>
          {!activePackage && <button type="button" onClick={() => setShowPackageForm(true)} className="btn-outline"><Plus size={15} /><span>Iniciar pacote</span></button>}
        </div>
        {activePackage ? (
          <div className="mt-4">
            <div className="flex items-end justify-between gap-3">
              <div><p className="text-sm font-semibold text-brand-text">{activePackage.label}</p><p className="text-xs text-brand-text-muted">{activePackage.completedSessions} de {activePackage.targetSessions} sessões realizadas</p></div>
              <button type="button" onClick={() => void cancelPackage()} className="text-xs font-semibold text-red-600 hover:underline">Cancelar pacote</button>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-brand-bg"><div className="h-full rounded-full bg-brand-primary transition-all" style={{ width: `${Math.min(100, (activePackage.completedSessions / activePackage.targetSessions) * 100)}%` }} /></div>
          </div>
        ) : packages[0]?.status === 'completed' ? (
          <p className="mt-3 text-xs font-semibold text-emerald-700">Último pacote concluído: {packages[0].completedSessions} de {packages[0].targetSessions} sessões.</p>
        ) : (
          <p className="mt-3 text-xs text-brand-text-muted">Nenhum pacote ativo.</p>
        )}
      </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="text-xs font-semibold text-brand-text">Situação<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | PatientSessionStatus)} className="input-field mt-1">
          <option value="all">Todas</option><option value="completed">Realizadas</option><option value="scheduled">Agendadas</option><option value="cancelled">Canceladas</option><option value="missed">Faltas</option>
        </select></label>
        <label className="text-xs font-semibold text-brand-text">Assinatura<select value={signatureFilter} onChange={(e) => setSignatureFilter(e.target.value as 'all' | 'signed' | 'unsigned')} className="input-field mt-1">
          <option value="all">Todas</option><option value="signed">Assinadas</option><option value="unsigned">Sem assinatura</option>
        </select></label>
        <label className="text-xs font-semibold text-brand-text">PDF<select value={exportMode} onChange={(e) => setExportMode(e.target.value as 'month' | 'year' | 'custom')} className="input-field mt-1">
          <option value="month">Mês atual</option><option value="year">Ano inteiro</option><option value="custom">Período personalizado</option>
        </select></label>
        {exportMode === 'custom' && <><label className="text-xs font-semibold text-brand-text">De<input type="date" value={exportStart} onChange={(e) => setExportStart(e.target.value)} className="input-field mt-1" /></label><label className="text-xs font-semibold text-brand-text">Até<input type="date" value={exportEnd} onChange={(e) => setExportEnd(e.target.value)} className="input-field mt-1" /></label></>}
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
          {filteredSessions.map((session) => (
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
                  {monthIsClosed ? (
                    <span className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700"><ShieldCheck size={14} />Mês fechado</span>
                  ) : session.signature ? (
                    <button type="button" onClick={() => void revoke(session)} disabled={working} className="btn-outline border-amber-300 text-amber-700"><ShieldAlert size={15} /><span>Revogar assinatura</span></button>
                  ) : (
                    <>
                      {session.status === 'completed' && <button type="button" onClick={() => { setSignSession(session); setSignatureBlob(null); }} className="btn-primary"><PenLine size={15} /><span>Assinar</span></button>}
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
              <label className="text-xs font-semibold text-brand-text sm:col-span-2">Vincular à evolução (opcional)<select value={form.evolutionId} onChange={(e) => setForm((v) => ({ ...v, evolutionId: e.target.value }))} className="input-field mt-1 w-full"><option value="">Sem vínculo</option>{sameDayEvolutions.map((evolution) => <option key={evolution.id} value={evolution.id}>{evolution.session_time?.slice(0,5) || 'Sem horário'} • evolução deste dia</option>)}</select><span className="mt-1 block text-[10px] font-normal text-brand-text-muted">{sameDayEvolutions.length ? 'Foram encontradas evoluções na mesma data.' : 'Nenhuma evolução encontrada nesta data.'}</span></label>
              <label className="text-xs font-semibold text-brand-text sm:col-span-2">Pacote (opcional)<select value={form.packageId} onChange={(e) => setForm((v) => ({ ...v, packageId: e.target.value }))} className="input-field mt-1 w-full"><option value="">Sem pacote</option>{packages.filter((item) => item.status === 'active' || item.id === form.packageId).map((item) => <option key={item.id} value={item.id}>{item.label} • {item.completedSessions}/{item.targetSessions}</option>)}</select></label>
            </div>
            <div className="flex justify-end gap-2 border-t border-brand-border p-4"><button type="button" onClick={() => setFormSession(undefined)} className="btn-outline">Cancelar</button><button type="button" onClick={() => void saveForm()} disabled={working || !form.date} className="btn-primary">{working && <Loader2 size={15} className="animate-spin" />}<span>Salvar sessão</span></button></div>
          </div>
        </div>
      )}

      {showPackageForm && (
        <div className="fixed inset-0 z-[105] flex items-end bg-black/55 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className="w-full max-w-md rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl">
            <div className="flex items-center justify-between border-b border-brand-border p-5"><div><h3 className="font-semibold text-brand-text">Iniciar pacote</h3><p className="text-xs text-brand-text-muted">Apenas controle de quantidade de sessões.</p></div><button type="button" onClick={() => setShowPackageForm(false)} className="p-2 text-brand-text-muted"><X size={20} /></button></div>
            <div className="space-y-4 p-5"><label className="text-xs font-semibold text-brand-text">Nome<input value={packageLabel} onChange={(e) => setPackageLabel(e.target.value)} maxLength={120} className="input-field mt-1 w-full" /></label><label className="text-xs font-semibold text-brand-text">Quantidade de sessões<input type="number" min={1} max={100} value={packageTarget} onChange={(e) => setPackageTarget(Number(e.target.value))} className="input-field mt-1 w-full" /></label></div>
            <div className="flex justify-end gap-2 border-t border-brand-border p-4"><button type="button" onClick={() => setShowPackageForm(false)} className="btn-outline">Cancelar</button><button type="button" onClick={() => void createPackage()} disabled={working || packageTarget < 1 || packageTarget > 100} className="btn-primary">Iniciar pacote</button></div>
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
