import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, ArrowRight, CalendarDays, CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Clock3,
  Crown, Download, Edit3, Eye, FileText, HelpCircle, Loader2, Lock, PenLine, Plus, Trash2, X, ShieldAlert, ShieldCheck
} from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import { FeatureGuideModal, type FeatureGuideStep } from '../components/common/FeatureGuideModal';
import { FeatureGuideButton } from '../components/common/FeatureGuideButton';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { hasActiveYearlyAccess } from '../utils/subscriptionAccess';
import { RichTextPreview } from '../components/common/RichTextEditor';
import NewEvolution from './NewEvolution';
import {
  buildPatientSessionSuggestions,
  getPatientSessionSlotsForDate,
  normalizePatientSessionSchedule,
} from '../utils/patientSessionSchedule';
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

const sessionSelectClass = 'input-field mt-1 h-11 min-h-11 w-full px-3.5 py-2.5 text-sm leading-normal';

const shiftMonth = (date: Date, delta: number) => new Date(date.getFullYear(), date.getMonth() + delta, 1);

const blobToDataUrl = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error);
  reader.readAsDataURL(blob);
});

const SESSION_GUIDE_STEPS: FeatureGuideStep[] = [
  {
    title: 'Escolha o período que deseja acompanhar',
    description: 'Use as setas para navegar entre os meses. A agenda configurada do paciente e as sugestões de datas ajudam a organizar os atendimentos do período selecionado.',
    icon: CalendarDays,
  },
  {
    title: 'Registre ou agende cada sessão',
    description: 'Use “Nova sessão”, “Registrar sessão de hoje” ou uma sugestão da agenda. Informe data, horário, situação, observações e, quando fizer sentido, vincule uma evolução clínica.',
    icon: Plus,
  },
  {
    title: 'Acompanhe pacotes e evoluções vinculadas',
    description: 'Você pode iniciar um pacote apenas para controlar a quantidade de sessões e abrir ou criar uma evolução relacionada a cada atendimento.',
    icon: FileText,
  },
  {
    title: 'Assine os registros e feche o mês',
    description: 'Assine as sessões realizadas para registrar a confirmação do atendimento. Quando não houver pendências, feche e assine o mês; depois disso, os registros ficam bloqueados para preservação.',
    icon: ShieldCheck,
  },
  {
    title: 'Filtre e exporte o acompanhamento',
    description: 'Filtre por situação ou assinatura e escolha um período mensal, anual ou personalizado para gerar o PDF. Se o mês estiver fechado, o arquivo será identificado como PDF assinado.',
    icon: Download,
  },
];

const SESSION_SUPPORT_HREF = `/painel/support?${new URLSearchParams({
  new: '1',
  subject: 'Dúvida sobre o Controle de Sessões',
  category: 'general',
  description: 'Olá! Estou com uma dúvida sobre a funcionalidade de Controle de Sessões.\n\nMinha dúvida:\n\n',
}).toString()}`;

type SessionGuideButtonProps = {
  compact?: boolean;
  expanded: boolean;
  onOpen: () => void;
};

function SessionGuideButton({ compact = false, expanded, onOpen }: SessionGuideButtonProps) {
  return (
    <FeatureGuideButton
      label="o Controle de Sessões"
      compact={compact}
      expanded={expanded}
      onOpen={onOpen}
    />
  );
}

export default function PatientSessions() {
  const siteConfig = useSiteConfig();
  const navigate = useNavigate();
  const { id } = useParams();
  const { user, profileRole, subscriptionPlan, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  const hasYearlyAccess = hasActiveYearlyAccess({ profileRole, subscriptionPlan, subscriptionStatus, subscriptionEndsAt });
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
  const [isScheduleSuggestionsOpen, setIsScheduleSuggestionsOpen] = useState(false);
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
  const [evolutionModal, setEvolutionModal] = useState<{ mode: 'view' | 'create'; session: PatientSession; evolution?: any } | null>(null);
  const [evolutionModalSaving, setEvolutionModalSaving] = useState(false);
  const [guideOpen, setGuideOpen] = useState(false);

  const load = async () => {
    if (!id || !user || !hasYearlyAccess) return;
    setLoading(true);
    try {
      const [{ data: patientData, error: patientError }, { data: profData, error: profError }, sessionData, closureData, packageData, evolutionResult] = await Promise.all([
        supabase.from('patients').select('id, full_name, professional_id, session_days, session_time, session_schedule, default_template_id').eq('id', id).single(),
        supabase.from('professionals').select('id, full_name, professional_register, professional_title, custom_logo_url, custom_logo_settings, role, subscription_plan, subscription_status, subscription_ends_at').eq('id', user.id).single(),
        fetchPatientSessions(id, month),
        fetchPatientSessionMonthClosure(id, month),
        fetchPatientSessionPackages(id),
        supabase.from('evolutions').select('id, session_date, session_time, created_at, transcription_text, original_transcription_text, template_id, status, transcription_status').eq('patient_id', id).eq('professional_id', user.id).eq('transcription_status', 'completed').order('session_date', { ascending: false, nullsFirst: false }),
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

  useEffect(() => { void load(); }, [hasYearlyAccess, id, user?.id, month.getFullYear(), month.getMonth()]);

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
  const recurringSchedule = useMemo(
    () => normalizePatientSessionSchedule(patient?.session_schedule, patient?.session_days, patient?.session_time),
    [patient?.session_schedule, patient?.session_days, patient?.session_time]
  );
  const todaySlots = useMemo(
    () => getPatientSessionSlotsForDate(recurringSchedule, new Date()),
    [recurringSchedule]
  );
  const scheduleSuggestions = useMemo(
    () => buildPatientSessionSuggestions(recurringSchedule, month, sessions),
    [recurringSchedule, month.getFullYear(), month.getMonth(), sessions]
  );
  const sameDayEvolutions = evolutions.filter((evolution) => evolution.session_date === form.date);
  const findEvolutionForSession = (date: string, time?: string | null) => {
    const normalizedTime = String(time || '').slice(0, 5);
    return evolutions.find((evolution) => (
      evolution.session_date === date && normalizedTime && String(evolution.session_time || '').slice(0, 5) === normalizedTime
    )) || evolutions.find((evolution) => evolution.session_date === date);
  };

  const openCreate = (quick = false) => {
    if (monthIsClosed) {
      void showAlert('Este mês já foi fechado e assinado. Não é possível adicionar novas sessões.', { title: 'Mês fechado', variant: 'info', icon: 'info' });
      return;
    }
    setFormSession(null);
    const preferredTime = todaySlots[0]?.time || '';
    setForm({ date: today(), time: quick ? currentTime() : preferredTime, status: 'completed', notes: '', evolutionId: '', packageId: activePackage?.id || '' });
  };

  const openSuggestion = (suggestion: { date: string; time: string }) => {
    if (monthIsClosed) {
      void showAlert('Este mês já foi fechado e assinado. Não é possível adicionar novas sessões.', { title: 'Mês fechado', variant: 'info', icon: 'info' });
      return;
    }
    const isFuture = suggestion.date > today();
    setFormSession(null);
    setForm({
      date: suggestion.date,
      time: suggestion.time,
      status: isFuture ? 'scheduled' : 'completed',
      notes: '',
      evolutionId: findEvolutionForSession(suggestion.date, suggestion.time)?.id || '',
      packageId: activePackage?.id || ''
    });
  };

  const openExistingEvolution = (session: PatientSession) => {
    const evolution = evolutions.find((item) => item.id === session.evolutionId);
    if (!evolution) {
      void showAlert('A evolução vinculada não foi encontrada.', { title: 'Evolução', variant: 'warning', icon: 'warning' });
      return;
    }
    setEvolutionModal({ mode: 'view', session, evolution });
  };

  const openCreateEvolution = (session: PatientSession) => {
    if (monthIsClosed) {
      void showAlert('Este mês já foi fechado e assinado. Não é possível criar uma evolução vinculada.', { title: 'Mês fechado', variant: 'info', icon: 'info' });
      return;
    }
    if (session.signature) {
      void showAlert('Revogue a assinatura antes de vincular uma nova evolução a esta sessão.', { title: 'Sessão assinada', variant: 'info', icon: 'info' });
      return;
    }
    setEvolutionModal({ mode: 'create', session });
  };

  const closeEvolutionModal = (force = false) => {
    if (evolutionModalSaving && !force) return;
    setEvolutionModal(null);
    setEvolutionModalSaving(false);
  };

  const handleCreatedEvolution = async (evolutionId: string) => {
    if (!evolutionModal || evolutionModal.mode !== 'create' || !id || !user) return;
    setEvolutionModalSaving(true);
    await updatePatientSession(evolutionModal.session, {
      sessionDate: evolutionModal.session.sessionDate,
      sessionTime: evolutionModal.session.sessionTime,
      status: evolutionModal.session.status,
      notes: evolutionModal.session.notes,
      evolutionId,
      packageId: evolutionModal.session.packageId,
    });
    closeEvolutionModal(true);
    await load();
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

  if (!hasYearlyAccess) {
    return (
      <div className="space-y-6 pb-12">
        <Link to={id ? `/painel/patients/${id}` : '/painel/patients'} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline">
          <ArrowLeft size={14} />
          Voltar para o paciente
        </Link>

        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center text-3xl font-display font-bold text-brand-text">
              <CalendarDays className="mr-3 shrink-0 text-brand-primary" size={32} />
              <span>Controle de Sessões</span>
              <span className="ml-3 hidden shrink-0 sm:inline-flex"><SessionGuideButton expanded={guideOpen} onOpen={() => setGuideOpen(true)} /></span>
            </h1>
            <p className="mt-1 text-sm text-brand-text-muted">Organize e acompanhe os atendimentos, assinaturas e registros clínicos deste paciente.</p>
          </div>
          <span className="sm:hidden"><SessionGuideButton compact expanded={guideOpen} onOpen={() => setGuideOpen(true)} /></span>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="card space-y-6 rounded-3xl border border-brand-border bg-white p-8 lg:col-span-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-brand-text"><CalendarDays className="text-brand-primary" size={24} /><span>Como funciona o Controle de Sessões?</span></h2>
            <div className="space-y-4">
              {SESSION_GUIDE_STEPS.slice(0, 3).map((step, index) => (
                <div key={step.title} className="flex items-start gap-3">
                  <div className="mt-0.5 rounded-lg bg-brand-bg p-2 font-bold text-brand-primary">{index + 1}</div>
                  <div><h3 className="text-sm font-semibold text-brand-text">{step.title}</h3><p className="mt-0.5 text-xs text-brand-text-muted">{step.description}</p></div>
                </div>
              ))}
            </div>
            <div className="border-t border-brand-border/60 pt-4"><div className="flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-xs text-sky-800"><ShieldCheck className="mt-0.5 shrink-0 text-sky-600" size={16} /><div><span className="mb-0.5 block font-bold">Registros protegidos:</span>As assinaturas e o fechamento mensal preservam o acompanhamento dos atendimentos.</div></div></div>
          </section>

          <aside className="card relative flex flex-col justify-between overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-white p-8 text-center shadow-sm lg:col-span-2">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-amber-400/15 to-transparent blur-3xl" />
            <div className="relative z-10 space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20"><Lock size={32} /></div>
              <div className="space-y-2"><h2 className="text-lg font-bold text-amber-950">Disponível no Plano Anual</h2><p className="text-xs leading-relaxed text-amber-800/80">O Controle de Sessões é exclusivo para assinantes do Plano Anual.</p></div>
              <div className="space-y-2.5 rounded-2xl border border-amber-200/50 bg-amber-50 p-4 text-left">{['Agenda e registro dos atendimentos', 'Assinatura do paciente ou responsável', 'Fechamento mensal e exportação em PDF'].map((benefit) => <div key={benefit} className="flex items-center gap-2 text-xs font-semibold text-amber-900"><Crown size={14} className="shrink-0 fill-amber-500 text-amber-600" />{benefit}</div>)}</div>
            </div>
            <div className="relative z-10 pt-8"><button type="button" onClick={() => navigate('/painel/subscription')} className="flex w-full cursor-pointer items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3.5 font-bold text-white shadow-md shadow-orange-500/10 transition-all hover:from-amber-600 hover:to-orange-600"><span>Fazer Upgrade Agora</span><ArrowRight size={16} /></button><p className="mt-2 text-[10px] text-amber-800/60">Mude para o Plano Anual para ativar o controle completo</p></div>
          </aside>
        </div>

        <FeatureGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} eyebrow="Controle de Sessões" title="Como funciona o Controle de Sessões" description="Use este fluxo para planejar, registrar, assinar e acompanhar os atendimentos do paciente." steps={SESSION_GUIDE_STEPS} note="O Controle de Sessões é uma funcionalidade exclusiva do Plano Anual." supportHref={SESSION_SUPPORT_HREF} />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-2">
        <Link to={id ? `/painel/patients/${id}` : '/painel/patients'} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline">
          <ArrowLeft size={14} />
          Voltar para o paciente
        </Link>
      </div>

      <PanelPageHeader
        icon={CalendarDays}
        title={`Controle de Sessões${patient?.full_name ? ` — ${patient.full_name}` : ''}`}
        description="Organize e acompanhe os atendimentos, assinaturas e registros clínicos deste paciente."
        titleActions={
          <SessionGuideButton
            expanded={guideOpen}
            onOpen={() => setGuideOpen(true)}
          />
        }
        actions={
          <span className="md:hidden">
            <SessionGuideButton
              compact
              expanded={guideOpen}
              onOpen={() => setGuideOpen(true)}
            />
          </span>
        }
      />

      <section aria-labelledby="session-planning-heading" className="space-y-4 rounded-3xl border border-brand-primary/15 bg-brand-primary/[0.025] p-3 sm:p-4">
        <div className="px-1">
          <h2 id="session-planning-heading" className="text-sm font-bold text-brand-primary">Planejamento do mês</h2>
          <p className="mt-1 text-xs text-brand-text-muted">Configure a agenda e organize o pacote antes de consultar os registros.</p>
        </div>

      <div className="card p-4 sm:p-5">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-2 sm:justify-start">
            <button type="button" onClick={() => setMonth((value) => shiftMonth(value, -1))} className="rounded-xl border border-brand-border p-2 text-brand-primary hover:bg-brand-bg sm:p-2.5"><ChevronLeft size={18} /></button>
            <div className="min-w-0 flex-1 text-center sm:min-w-[190px]">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-text-muted">Período</p>
              <h2 className="capitalize font-semibold text-brand-text">{monthLabel}</h2>
            </div>
            <button type="button" onClick={() => setMonth((value) => shiftMonth(value, 1))} className="rounded-xl border border-brand-border p-2 text-brand-primary hover:bg-brand-bg sm:p-2.5"><ChevronRight size={18} /></button>
          </div>
          <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:flex-wrap">
            <button type="button" onClick={() => void exportPdf()} disabled={working || sessions.length === 0} className="btn-outline min-w-0 px-2.5 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm"><Download size={16} /><span className="truncate">{monthIsClosed && exportMode === 'month' ? 'Baixar PDF assinado' : 'Exportar PDF'}</span></button>
            {monthIsClosed ? (
              <span className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 sm:text-sm"><ShieldCheck size={16} />Mês fechado</span>
            ) : (
              <>
                <button type="button" onClick={() => void closeMonth()} disabled={working || !canCloseMonth} className="btn-outline min-w-0 px-2.5 py-2 text-xs border-emerald-300 text-emerald-700 sm:px-4 sm:py-2 sm:text-sm" aria-label="Fechar e assinar mês"><ShieldCheck size={16} /><span className="truncate sm:hidden">Fechar mês</span><span className="hidden truncate sm:inline">Fechar e assinar mês</span></button>
                <button type="button" onClick={() => openCreate(false)} className="btn-outline min-w-0 px-2.5 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm"><Plus size={16} /><span className="truncate">Nova sessão</span></button>
                <button type="button" onClick={() => openCreate(true)} className="btn-primary min-w-0 px-2.5 py-2 text-xs sm:px-4 sm:py-2 sm:text-sm" aria-label="Registrar sessão de hoje"><PenLine size={16} /><span className="truncate sm:hidden">Registrar hoje</span><span className="hidden truncate sm:inline">Registrar sessão de hoje</span></button>
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

      {recurringSchedule.length > 0 && (
        <div className="rounded-2xl border border-brand-primary/15 bg-brand-primary/5 p-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <strong className="text-sm text-brand-primary">Agenda configurada</strong>
              <p className="mt-1 text-xs text-brand-text-muted">
                Os dias e horários abaixo vêm da configuração do paciente.
              </p>
            </div>
            {todaySlots.length > 0 && (
              <button type="button" onClick={() => openSuggestion({ date: today(), time: todaySlots[0].time })} className="text-xs font-bold text-brand-primary hover:underline">
                Registrar sessão de hoje
              </button>
            )}
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {recurringSchedule.map((slot, index) => (
              <span key={`${slot.weekday}-${slot.time}-${index}`} className="rounded-full border border-brand-primary/15 bg-white px-3 py-1.5 text-xs font-semibold text-brand-text">
                {['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'][slot.weekday]} • {slot.time}
              </span>
            ))}
          </div>
        </div>
      )}

      {!monthIsClosed && scheduleSuggestions.length > 0 && (
        <div className="card overflow-hidden p-0">
          <button
            type="button"
            onClick={() => setIsScheduleSuggestionsOpen((value) => !value)}
            aria-expanded={isScheduleSuggestionsOpen}
            aria-controls="schedule-suggestions-content"
            className="flex w-full items-center justify-between gap-4 p-4 text-left sm:p-5"
          >
            <span>
              <strong className="block font-semibold text-brand-text">Sugestões da agenda</strong>
              <span className="text-xs text-brand-text-muted">Datas deste mês ainda não registradas no Controle de Sessões.</span>
            </span>
            <ChevronDown size={18} className={`shrink-0 text-brand-primary transition-transform ${isScheduleSuggestionsOpen ? 'rotate-180' : ''}`} />
          </button>
          {isScheduleSuggestionsOpen && (
            <div id="schedule-suggestions-content" className="border-t border-brand-border/70 p-4 sm:p-5">
              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {scheduleSuggestions.slice(0, 12).map((suggestion) => (
                  (() => {
                    const matchingEvolution = findEvolutionForSession(suggestion.date, suggestion.time);
                    return (
                      <button
                        key={`${suggestion.date}-${suggestion.time}`}
                        type="button"
                        onClick={() => openSuggestion(suggestion)}
                        className="flex items-center justify-between rounded-xl border border-brand-border bg-white px-3 py-2 text-left transition-colors hover:border-brand-primary/30 hover:bg-brand-primary/5"
                      >
                        <span>
                          <strong className="block text-xs text-brand-text">{suggestion.weekdayLabel}</strong>
                          <span className="text-xs text-brand-text-muted">{suggestion.date.split('-').reverse().join('/')} • {suggestion.time}</span>
                          {matchingEvolution && <span className="mt-1 inline-flex rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700">Evolução Existente</span>}
                        </span>
                        <Plus size={15} className="text-brand-primary" />
                      </button>
                    );
                  })()
                ))}
              </div>
              {scheduleSuggestions.length > 12 && (
                <p className="mt-2 text-[11px] text-brand-text-muted">Mostrando as próximas 12 sugestões deste mês.</p>
              )}
            </div>
          )}
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

      </section>

      <section aria-labelledby="session-records-heading" className="space-y-4 border-t border-brand-border/70 pt-6">
        <div>
          <h2 id="session-records-heading" className="text-sm font-bold text-brand-primary">Registro das sessões</h2>
          <p className="mt-1 text-xs text-brand-text-muted">Filtre e acompanhe as sessões já criadas para este paciente.</p>
        </div>

      <div className="card flex flex-col gap-3 p-4 sm:flex-row sm:items-end">
        <label className="min-w-[160px] flex-1 text-xs font-semibold text-brand-text">Situação<select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as 'all' | PatientSessionStatus)} className={sessionSelectClass}>
          <option value="all">Todas</option><option value="completed">Realizadas</option><option value="scheduled">Agendadas</option><option value="cancelled">Canceladas</option><option value="missed">Faltas</option>
        </select></label>
        <label className="min-w-[160px] flex-1 text-xs font-semibold text-brand-text">Assinatura<select value={signatureFilter} onChange={(e) => setSignatureFilter(e.target.value as 'all' | 'signed' | 'unsigned')} className={sessionSelectClass}>
          <option value="all">Todas</option><option value="signed">Assinadas</option><option value="unsigned">Sem assinatura</option>
        </select></label>
        <label className="min-w-[160px] flex-1 text-xs font-semibold text-brand-text">PDF<select value={exportMode} onChange={(e) => setExportMode(e.target.value as 'month' | 'year' | 'custom')} className={sessionSelectClass}>
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
          {filteredSessions.map((session) => {
            const linkedEvolution = session.evolutionId ? evolutions.find((evolution) => evolution.id === session.evolutionId) : null;
            return (
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
                  {linkedEvolution ? (
                    <button type="button" onClick={() => openExistingEvolution(session)} className="btn-outline px-2.5" title="Abrir evolução vinculada" aria-label="Abrir evolução vinculada">
                      <Eye size={15} /><span className="hidden sm:inline">Abrir evolução</span>
                    </button>
                  ) : (
                    <button type="button" onClick={() => openCreateEvolution(session)} disabled={working || monthIsClosed || Boolean(session.signature)} className="btn-outline border-brand-primary/30 text-brand-primary disabled:cursor-not-allowed disabled:opacity-50" title={session.signature ? 'Revogue a assinatura para criar o vínculo' : 'Criar evolução vinculada'}>
                      <Plus size={15} /><span>Criar evolução</span>
                    </button>
                  )}
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
            );
          })}
        </div>
      )}

      </section>

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
              <label className="text-xs font-semibold text-brand-text sm:col-span-2">Situação<select value={form.status} onChange={(e) => setForm((v) => ({ ...v, status: e.target.value as PatientSessionStatus }))} className={sessionSelectClass}>
                <option value="completed">Realizada</option><option value="scheduled">Agendada</option><option value="cancelled">Cancelada</option><option value="missed">Falta</option>
              </select></label>
              <label className="text-xs font-semibold text-brand-text sm:col-span-2">Observação opcional<textarea value={form.notes} onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))} maxLength={2000} rows={3} className="input-field mt-1 w-full resize-y" /></label>
              <label className="text-xs font-semibold text-brand-text sm:col-span-2">Vincular à evolução (opcional)<select value={form.evolutionId} onChange={(e) => setForm((v) => ({ ...v, evolutionId: e.target.value }))} className={sessionSelectClass}><option value="">Sem vínculo</option>{sameDayEvolutions.map((evolution) => <option key={evolution.id} value={evolution.id}>{evolution.session_time?.slice(0,5) || 'Sem horário'} • evolução deste dia</option>)}</select><span className="mt-1 block text-[10px] font-normal text-brand-text-muted">{sameDayEvolutions.length ? 'Foram encontradas evoluções na mesma data.' : 'Nenhuma evolução encontrada nesta data.'}</span></label>
              <label className="text-xs font-semibold text-brand-text sm:col-span-2">Pacote (opcional)<select value={form.packageId} onChange={(e) => setForm((v) => ({ ...v, packageId: e.target.value }))} className={sessionSelectClass}><option value="">Sem pacote</option>{packages.filter((item) => item.status === 'active' || item.id === form.packageId).map((item) => <option key={item.id} value={item.id}>{item.label} • {item.completedSessions}/{item.targetSessions}</option>)}</select></label>
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
                <label className="text-xs font-semibold text-brand-text">Quem está assinando?<select value={signerType} onChange={(e) => setSignerType(e.target.value as 'patient' | 'responsible')} className={sessionSelectClass}><option value="patient">Paciente</option><option value="responsible">Responsável</option></select></label>
                <label className="text-xs font-semibold text-brand-text">Nome (opcional)<input value={signerName} onChange={(e) => setSignerName(e.target.value)} className="input-field mt-1 w-full" maxLength={160} /></label>
              </div>
              <SessionSignaturePad onChange={setSignatureBlob} />
            </div>
            <div className="flex justify-end gap-2 border-t border-brand-border p-4"><button type="button" onClick={() => setSignSession(null)} className="btn-outline">Cancelar</button><button type="button" disabled={!signatureBlob || working} onClick={() => void saveSignature()} className="btn-primary">{working && <Loader2 size={15} className="animate-spin" />}<span>Confirmar assinatura</span></button></div>
          </div>
        </div>
      )}

      {evolutionModal && (
        <div className="fixed inset-0 z-[115] flex items-end bg-black/60 p-0 sm:items-center sm:justify-center sm:p-4">
          <div className={`flex max-h-[calc(100dvh-1rem)] w-full flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[92vh] sm:rounded-2xl ${evolutionModal.mode === 'create' ? 'max-w-4xl' : 'max-w-2xl'}`}>
            <div className="flex items-center justify-between border-b border-brand-border p-5">
              <div>
                <h3 className="font-semibold text-brand-text">{evolutionModal.mode === 'create' ? 'Nova evolução' : 'Evolução vinculada'}</h3>
                <p className="text-xs text-brand-text-muted">{patient?.full_name} • {evolutionModal.session.sessionDate.split('-').reverse().join('/')} {evolutionModal.session.sessionTime?.slice(0, 5) || ''}</p>
              </div>
              <button type="button" onClick={() => closeEvolutionModal()} disabled={evolutionModalSaving} className="p-2 text-brand-text-muted hover:bg-brand-bg disabled:opacity-50" aria-label="Fechar modal de evolução"><X size={20} /></button>
            </div>

            {evolutionModal.mode === 'create' ? (
              <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
                <NewEvolution
                  embedded
                  patientId={id}
                  initialSessionDate={evolutionModal.session.sessionDate}
                  initialSessionTime={evolutionModal.session.sessionTime}
                  onCreated={handleCreatedEvolution}
                  onProcessingChange={setEvolutionModalSaving}
                />
              </div>
            ) : (
              <>
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                  {evolutionModal.evolution && (
                    <>
                      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-primary/15 bg-brand-primary/5 p-3 text-xs text-brand-text-muted">
                        <FileText size={15} className="text-brand-primary" />
                        <span>Data da sessão: <strong className="text-brand-text">{evolutionModal.evolution.session_date?.split('-').reverse().join('/') || 'Não informada'}</strong></span>
                        {evolutionModal.evolution.session_time && <span>às <strong className="text-brand-text">{evolutionModal.evolution.session_time.slice(0, 5)}</strong></span>}
                        {evolutionModal.evolution.created_at && <span className="text-[10px]">Criada em {new Date(evolutionModal.evolution.created_at).toLocaleString('pt-BR')}</span>}
                      </div>
                      <div className="rounded-xl border border-brand-border bg-brand-bg/40 p-4 text-sm text-brand-text-muted">
                        {evolutionModal.evolution.transcription_text ? (
                          <RichTextPreview value={evolutionModal.evolution.transcription_text} />
                        ) : (
                          <p className="italic text-brand-text-muted">Esta evolução não possui conteúdo textual disponível.</p>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="flex justify-end gap-2 border-t border-brand-border bg-stone-50 p-4">
                  <button type="button" onClick={() => closeEvolutionModal()} className="btn-outline">Fechar</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <FeatureGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        eyebrow="Controle de Sessões"
        title="Como funciona o Controle de Sessões"
        description="Use este fluxo para planejar, registrar, assinar e acompanhar os atendimentos do paciente."
        steps={SESSION_GUIDE_STEPS}
        note="A assinatura e o fechamento do mês preservam os registros do período. Revise as informações antes de assinar e mantenha a responsabilidade profissional sobre o conteúdo registrado."
        supportHref={SESSION_SUPPORT_HREF}
      />
    </div>
  );
}
