import { useEffect, useState, type ReactNode } from 'react';
import {
  Briefcase,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Database,
  FileText,
  Loader2,
  Globe,
  History,
  Mail,
  MessageCircle,
  RefreshCw,
  Sparkles,
  User,
  Users,
  X,
  XCircle,
  type LucideIcon
} from 'lucide-react';
import { supabase } from '../../supabaseClient';

type ProfessionalSummary = {
  id: string;
  full_name: string;
  google_email: string;
};

type ProfessionalDetails = {
  professional: Record<string, any>;
  communicationPreferences: Record<string, any> | null;
  onboardingEligibility: {
    evaluatedAt: string;
    blockedReason: string | null;
    emails: Array<{
      key: string;
      subject: string;
      campaignName: string;
      stepPosition: number;
      kind: 'sequence' | 'conditional';
      status: 'eligible' | 'scheduled' | 'waiting';
      scheduledFor: string | null;
      reason: string;
    }>;
  };
  clinicalMetrics: {
    patientCount: number;
    evolutionCount: number;
    transcribedSeconds: number;
    patients: Array<{
      id: string;
      name: string;
      status: string | null;
      evolutionCount: number;
      transcribedSeconds: number;
    }>;
  };
  auth: {
    created_at: string | null;
    last_sign_in_at: string | null;
    email_confirmed_at: string | null;
  } | null;
};

type CommunicationChannel = 'all' | 'email' | 'notification' | 'whatsapp';

type CommunicationHistoryItem = {
  id: string;
  channel: Exclude<CommunicationChannel, 'all'>;
  title: string;
  message: string;
  status: string;
  source: string | null;
  createdAt: string;
  readAt: string | null;
  deliveredAt: string | null;
  errorMessage: string | null;
  metadata: {
    provider?: string | null;
    recipient?: string | null;
    messageType?: string | null;
    templateName?: string | null;
    attemptCount?: number | null;
    link?: string | null;
  };
};

type CommunicationHistory = {
  items: CommunicationHistoryItem[];
  counts: Record<CommunicationChannel, number>;
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
};

type Props = {
  professional: ProfessionalSummary | null;
  onClose: () => void;
};

const dateValue = (value: unknown) => {
  if (!value) return 'Não informado';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? String(value) : parsed.toLocaleString('pt-BR');
};

const textValue = (value: unknown) => {
  if (value === null || value === undefined || value === '') return 'Não informado';
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return String(value);
};

const Detail = ({ label, value, mono = false }: { label: string; value: unknown; mono?: boolean }) => (
  <div className="rounded-xl border border-brand-border/50 bg-brand-bg/30 p-3">
    <span className="block text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">{label}</span>
    <span className={`mt-1 block break-words text-sm font-semibold text-brand-text ${mono ? 'font-mono text-xs' : ''}`}>
      {textValue(value)}
    </span>
  </div>
);

const Section = ({ icon: Icon, title, children }: { icon: LucideIcon; title: string; children: ReactNode }) => (
  <section className="space-y-3">
    <h4 className="flex items-center gap-2 border-b border-brand-border/40 pb-2 text-xs font-bold uppercase tracking-wider text-brand-primary">
      <Icon className="h-4 w-4" />
      {title}
    </h4>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>
  </section>
);

const HISTORY_PAGE_SIZE = 10;
const COMMUNICATION_CHANNELS: { key: CommunicationChannel; label: string; icon: LucideIcon }[] = [
  { key: 'all', label: 'Todos', icon: History },
  { key: 'email', label: 'E-mails', icon: Mail },
  { key: 'notification', label: 'Notificações', icon: Bell },
  { key: 'whatsapp', label: 'WhatsApp', icon: MessageCircle }
];

const channelPresentation = (channel: CommunicationHistoryItem['channel']) => {
  if (channel === 'email') return { label: 'E-mail', icon: Mail, className: 'bg-sky-50 text-sky-700 border-sky-200' };
  if (channel === 'notification') return { label: 'Notificação', icon: Bell, className: 'bg-violet-50 text-violet-700 border-violet-200' };
  return { label: 'WhatsApp', icon: MessageCircle, className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
};

const statusPresentation = (status: string) => {
  const normalized = status.toLowerCase();
  const labels: Record<string, string> = {
    available: 'Disponível no app',
    sent: 'Enviado',
    delivered: 'Entregue',
    read: 'Lido',
    accepted: 'Aceito pela Meta',
    pending: 'Pendente',
    failed: 'Falhou'
  };
  const className = normalized === 'failed'
    ? 'bg-red-50 text-red-700 border-red-200'
    : normalized === 'pending' || normalized === 'accepted'
      ? 'bg-amber-50 text-amber-700 border-amber-200'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200';
  return { label: labels[normalized] || status, className };
};

const formatTranscribedMinutes = (secondsValue: unknown) => {
  const seconds = Number(secondsValue || 0);
  if (!Number.isFinite(seconds) || seconds <= 0) return '0 min';
  const minutes = seconds / 60;
  if (minutes < 1) return '< 1 min';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 }).format(minutes)} min`;
};

const eligibilityPresentation = (status: 'eligible' | 'scheduled' | 'waiting') => {
  if (status === 'scheduled') return { label: 'Agendado', className: 'border-sky-200 bg-sky-50 text-sky-700' };
  if (status === 'waiting') return { label: 'Aguardando', className: 'border-amber-200 bg-amber-50 text-amber-700' };
  return { label: 'Elegível agora', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' };
};

const patientStatusLabel = (status: string | null) => {
  if (status === 'active') return 'Ativo';
  if (status === 'inactive') return 'Inativo';
  if (status === 'archived') return 'Arquivado';
  return status || 'Sem status';
};

export default function ProfessionalDetailsModal({ professional, onClose }: Props) {
  const [details, setDetails] = useState<ProfessionalDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [communicationChannel, setCommunicationChannel] = useState<CommunicationChannel>('all');
  const [communicationExpanded, setCommunicationExpanded] = useState(false);
  const [communicationPage, setCommunicationPage] = useState(1);
  const [communicationHistory, setCommunicationHistory] = useState<CommunicationHistory | null>(null);
  const [communicationLoading, setCommunicationLoading] = useState(false);
  const [communicationError, setCommunicationError] = useState('');
  const [communicationReloadKey, setCommunicationReloadKey] = useState(0);

  useEffect(() => {
    if (!professional) return;
    let active = true;

    const load = async () => {
      setLoading(true);
      setError('');
      setDetails(null);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Sessão administrativa não encontrada.');

        const response = await fetch(`/api/admin/professionals/${professional.id}/details`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os dados do profissional.');
        if (active) setDetails(payload);
      } catch (loadError: any) {
        if (active) setError(loadError.message || 'Não foi possível carregar os dados do profissional.');
      } finally {
        if (active) setLoading(false);
      }
    };

    void load();
    return () => { active = false; };
  }, [professional]);

  useEffect(() => {
    setCommunicationExpanded(false);
    setCommunicationChannel('all');
    setCommunicationPage(1);
    setCommunicationHistory(null);
    setCommunicationError('');
  }, [professional?.id]);

  useEffect(() => {
    if (!professional) return;
    let active = true;

    const loadHistory = async () => {
      setCommunicationLoading(true);
      setCommunicationError('');
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error('Sessão administrativa não encontrada.');
        const params = new URLSearchParams({
          channel: communicationChannel,
          page: String(communicationPage),
          pageSize: String(HISTORY_PAGE_SIZE)
        });
        const response = await fetch(`/api/admin/professionals/${professional.id}/communications?${params}`, {
          cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` }
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o histórico de comunicação.');
        if (active) setCommunicationHistory(payload);
      } catch (loadError: any) {
        if (active) setCommunicationError(loadError.message || 'Não foi possível carregar o histórico de comunicação.');
      } finally {
        if (active) setCommunicationLoading(false);
      }
    };

    void loadHistory();
    return () => { active = false; };
  }, [professional, communicationChannel, communicationPage, communicationReloadKey]);

  if (!professional) return null;
  const p = details?.professional || {};
  const preferences = details?.communicationPreferences;
  const acquisition = p.acquisition_info || p.signup_acquisition_info || {};

  return (
    <div className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fadeIn" role="dialog" aria-modal="true" aria-labelledby="professional-details-title">
      <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-3xl border border-brand-border/60 bg-white shadow-2xl">
        <header className="flex items-center justify-between border-b border-brand-border/50 bg-gradient-to-r from-brand-primary/10 to-brand-accent/10 px-5 py-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="rounded-xl bg-brand-primary p-2.5 text-white"><User className="h-5 w-5" /></div>
            <div className="min-w-0">
              <h3 id="professional-details-title" className="font-display text-base font-bold text-brand-primary">Dados e histórico do profissional</h3>
              <p className="truncate text-xs text-brand-text-muted">{professional.full_name} ({professional.google_email})</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-brand-text-muted transition-colors hover:bg-black/5 hover:text-brand-text" aria-label="Fechar detalhes">
            <X className="h-5 w-5" />
          </button>
        </header>

        <div className="flex-1 space-y-6 overflow-y-auto p-5 sm:p-6">
          {loading ? (
            <div className="flex min-h-64 flex-col items-center justify-center gap-3 text-brand-text-muted">
              <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
              <span className="text-sm">Carregando informações...</span>
            </div>
          ) : error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
          ) : details ? (
            <>
              <Section icon={User} title="Identificação">
                <Detail label="Nome completo" value={p.full_name} />
                <Detail label="E-mail" value={p.google_email} />
                <Detail label="ID do usuário" value={p.id} mono />
                <Detail label="Perfil de acesso" value={p.role === 'admin' ? 'Administrador' : 'Profissional'} />
                <Detail label="Status" value={p.status} />
                <Detail label="Onboarding concluído" value={p.onboarding_completed} />
              </Section>

              <section className="space-y-3" data-testid="professional-onboarding-eligibility">
                <div className="border-b border-brand-border/40 pb-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-primary">
                    <Sparkles className="h-4 w-4" />
                    Elegível para os e-mails
                  </h4>
                  <p className="mt-1 text-xs text-brand-text-muted">Modelos do onboarding que podem ser enviados conforme o estado atual do profissional.</p>
                </div>

                {details.onboardingEligibility.emails.length ? (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {details.onboardingEligibility.emails.map(email => {
                      const presentation = eligibilityPresentation(email.status);
                      return (
                        <article key={email.key} className="rounded-2xl border border-brand-border/60 bg-brand-bg/20 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wide text-brand-primary">
                              Passo {email.stepPosition} · {email.kind === 'conditional' ? 'Condicional' : 'Jornada'}
                            </span>
                            <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${presentation.className}`}>{presentation.label}</span>
                          </div>
                          <h5 className="mt-2 text-sm font-bold text-brand-text">{email.subject}</h5>
                          <p className="mt-1 text-xs text-brand-text-muted">{email.campaignName} · {email.reason}</p>
                          {email.scheduledFor && (
                            <p className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-brand-text-muted">
                              <Clock3 className="h-3.5 w-3.5" />
                              {email.status === 'scheduled' ? 'Envio previsto' : 'Disponível a partir de'}: {dateValue(email.scheduledFor)}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-brand-border bg-brand-bg/20 p-4 text-sm text-brand-text-muted">
                    {details.onboardingEligibility.blockedReason || 'Nenhum e-mail elegível neste momento.'}
                  </div>
                )}
              </section>

              <section className="space-y-3" data-testid="professional-clinical-metrics">
                <div className="border-b border-brand-border/40 pb-2">
                  <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-primary">
                    <Users className="h-4 w-4" />
                    Pacientes e uso clínico
                  </h4>
                  <p className="mt-1 text-xs text-brand-text-muted">Resumo dos pacientes, evoluções registradas e tempo efetivamente transcrito.</p>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
                    <Users className="h-5 w-5 text-sky-700" />
                    <strong className="mt-2 block text-2xl text-sky-950">{details.clinicalMetrics.patientCount}</strong>
                    <span className="text-xs font-semibold text-sky-700">Pacientes</span>
                  </div>
                  <div className="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                    <FileText className="h-5 w-5 text-violet-700" />
                    <strong className="mt-2 block text-2xl text-violet-950">{details.clinicalMetrics.evolutionCount}</strong>
                    <span className="text-xs font-semibold text-violet-700">Evoluções</span>
                  </div>
                  <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <Clock3 className="h-5 w-5 text-emerald-700" />
                    <strong className="mt-2 block text-2xl text-emerald-950">{formatTranscribedMinutes(details.clinicalMetrics.transcribedSeconds)}</strong>
                    <span className="text-xs font-semibold text-emerald-700">Minutos transcritos</span>
                  </div>
                </div>

                {details.clinicalMetrics.patients.length ? (
                  <div className="max-h-72 overflow-auto rounded-2xl border border-brand-border/60">
                    <table className="w-full min-w-[560px] text-left text-xs">
                      <thead className="sticky top-0 bg-brand-bg text-[10px] uppercase tracking-wide text-brand-text-muted">
                        <tr>
                          <th className="px-4 py-3">Paciente</th>
                          <th className="px-4 py-3 text-center">Evoluções</th>
                          <th className="px-4 py-3 text-right">Áudio transcrito</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border/50 bg-white">
                        {details.clinicalMetrics.patients.map(patient => (
                          <tr key={patient.id}>
                            <td className="px-4 py-3">
                              <strong className="block text-brand-text">{patient.name}</strong>
                              <span className="text-[10px] text-brand-text-muted">{patientStatusLabel(patient.status)}</span>
                            </td>
                            <td className="px-4 py-3 text-center font-bold text-brand-text">{patient.evolutionCount}</td>
                            <td className="px-4 py-3 text-right font-semibold text-brand-text">{formatTranscribedMinutes(patient.transcribedSeconds)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-brand-border bg-brand-bg/20 p-4 text-sm text-brand-text-muted">
                    Este profissional ainda não possui pacientes cadastrados.
                  </div>
                )}
                <p className="text-[11px] text-brand-text-muted">O total usa os registros efetivos de transcrição; a distribuição por paciente considera os áudios vinculados às evoluções.</p>
              </section>

              <section className="space-y-3" data-testid="professional-communication-history">
                <button
                  type="button"
                  onClick={() => setCommunicationExpanded(current => !current)}
                  aria-expanded={communicationExpanded}
                  aria-controls="professional-communication-history-content"
                  className="flex w-full items-center justify-between gap-4 rounded-2xl border border-brand-border/60 bg-brand-bg/20 px-4 py-4 text-left transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/5"
                >
                  <div className="min-w-0">
                    <h4 className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-brand-primary">
                      <History className="h-4 w-4" />
                      Histórico de comunicação
                    </h4>
                    <p className="mt-1 text-xs text-brand-text-muted">Linha do tempo de todos os contatos registrados pela plataforma.</p>
                  </div>
                  <span className="flex shrink-0 items-center gap-2 text-xs font-bold text-brand-primary">
                    {communicationExpanded ? 'Recolher' : 'Expandir'}
                    <ChevronDown className={`h-4 w-4 transition-transform ${communicationExpanded ? 'rotate-180' : ''}`} />
                  </span>
                </button>

                {communicationExpanded && (
                  <div id="professional-communication-history-content" className="space-y-3">
                    <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setCommunicationReloadKey(current => current + 1)}
                    disabled={communicationLoading}
                    className="inline-flex items-center justify-center gap-1.5 self-start rounded-lg border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-brand-text transition-colors hover:border-brand-primary/40 hover:text-brand-primary disabled:opacity-60 sm:self-auto"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${communicationLoading ? 'animate-spin' : ''}`} />
                    Atualizar
                  </button>
                    </div>

                    <div className="flex flex-wrap gap-2" aria-label="Filtrar histórico por canal">
                  {COMMUNICATION_CHANNELS.map(({ key, label, icon: Icon }) => {
                    const count = communicationHistory?.counts?.[key] ?? 0;
                    const active = communicationChannel === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          setCommunicationChannel(key);
                          setCommunicationPage(1);
                        }}
                        aria-pressed={active}
                        className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${active
                          ? 'border-brand-primary bg-brand-primary text-white'
                          : 'border-brand-border bg-white text-brand-text hover:border-brand-primary/40 hover:text-brand-primary'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5" />
                        {label} ({count})
                      </button>
                    );
                  })}
                </div>

                {communicationLoading && !communicationHistory ? (
                  <div className="flex min-h-36 items-center justify-center gap-2 rounded-2xl border border-brand-border/50 bg-brand-bg/20 text-sm text-brand-text-muted">
                    <Loader2 className="h-5 w-5 animate-spin text-brand-primary" />
                    Carregando histórico...
                  </div>
                ) : communicationError ? (
                  <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                    {communicationError}
                  </div>
                ) : communicationHistory?.items.length ? (
                  <div className={`space-y-3 ${communicationLoading ? 'opacity-60' : ''}`} aria-busy={communicationLoading}>
                    {communicationHistory.items.map(item => {
                      const channel = channelPresentation(item.channel);
                      const status = statusPresentation(item.status);
                      const ChannelIcon = channel.icon;
                      return (
                        <article key={item.id} className="rounded-2xl border border-brand-border/60 bg-white p-4 shadow-sm">
                          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                            <div className="min-w-0">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-bold uppercase tracking-wide ${channel.className}`}>
                                  <ChannelIcon className="h-3 w-3" />
                                  {channel.label}
                                </span>
                                <span className={`rounded-full border px-2 py-1 text-[10px] font-bold ${status.className}`}>{status.label}</span>
                              </div>
                              <h5 className="mt-2 break-words text-sm font-bold text-brand-text">{item.title}</h5>
                            </div>
                            <time className="shrink-0 text-[11px] font-medium text-brand-text-muted" dateTime={item.createdAt}>
                              {dateValue(item.createdAt)}
                            </time>
                          </div>

                          {item.message && (
                            <p className="mt-2 whitespace-pre-wrap break-words text-xs leading-relaxed text-brand-text-muted">{item.message}</p>
                          )}

                          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 border-t border-brand-border/40 pt-3 text-[11px] text-brand-text-muted">
                            {item.source && <span><strong className="text-brand-text">Origem:</strong> {item.source}</span>}
                            {item.metadata.provider && <span><strong className="text-brand-text">Provedor:</strong> {item.metadata.provider}</span>}
                            {item.metadata.recipient && <span><strong className="text-brand-text">Destinatário:</strong> {item.metadata.recipient}</span>}
                            {item.metadata.messageType && <span><strong className="text-brand-text">Tipo:</strong> {item.metadata.messageType}</span>}
                            {item.metadata.attemptCount != null && <span><strong className="text-brand-text">Tentativas:</strong> {item.metadata.attemptCount}</span>}
                            {item.deliveredAt && <span><strong className="text-brand-text">Entrega:</strong> {dateValue(item.deliveredAt)}</span>}
                            {item.readAt && <span><strong className="text-brand-text">Leitura:</strong> {dateValue(item.readAt)}</span>}
                            {item.metadata.link && <span className="break-all"><strong className="text-brand-text">Destino:</strong> {item.metadata.link}</span>}
                          </div>

                          {item.errorMessage && (
                            <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                              <strong>Falha:</strong> {item.errorMessage}
                            </p>
                          )}
                        </article>
                      );
                    })}
                  </div>
                ) : (
                  <div className="rounded-2xl border border-dashed border-brand-border bg-brand-bg/20 p-6 text-center text-sm text-brand-text-muted">
                    Nenhum registro encontrado neste canal.
                  </div>
                )}

                {communicationHistory && communicationHistory.pagination.total > 0 && (
                  <div className="flex flex-col gap-2 rounded-xl bg-brand-bg/30 px-3 py-2 text-xs text-brand-text-muted sm:flex-row sm:items-center sm:justify-between">
                    <span>
                      Página {communicationHistory.pagination.page} de {communicationHistory.pagination.totalPages} · {communicationHistory.pagination.total} registros
                    </span>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setCommunicationPage(current => Math.max(1, current - 1))}
                        disabled={communicationLoading || communicationPage <= 1}
                        className="inline-flex items-center gap-1 rounded-lg border border-brand-border bg-white px-2.5 py-1.5 font-semibold text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        Anterior
                      </button>
                      <button
                        type="button"
                        onClick={() => setCommunicationPage(current => Math.min(communicationHistory.pagination.totalPages, current + 1))}
                        disabled={communicationLoading || communicationPage >= communicationHistory.pagination.totalPages}
                        className="inline-flex items-center gap-1 rounded-lg border border-brand-border bg-white px-2.5 py-1.5 font-semibold text-brand-text disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Próxima
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-[11px] text-brand-text-muted">
                  O WhatsApp registra template, status e datas de entrega; o conteúdo completo não é armazenado por segurança.
                </p>
                  </div>
                )}
              </section>

              <Section icon={MessageCircle} title="WhatsApp e comunicação">
                <Detail label="Número do WhatsApp" value={preferences?.whatsapp_number} />
                <Detail label="Autorizou mensagens" value={preferences?.whatsapp_opt_in} />
                <Detail label="WhatsApp habilitado" value={preferences?.whatsapp_enabled} />
                <Detail label="Origem da autorização" value={preferences?.whatsapp_opt_in_source} />
                <Detail label="Autorizado em" value={dateValue(preferences?.whatsapp_opt_in_at)} />
                <Detail label="Cancelado em" value={dateValue(preferences?.whatsapp_opt_out_at)} />
              </Section>

              <Section icon={Bell} title="Preferências de comunicação">
                <Detail label="E-mail habilitado" value={preferences?.email_enabled} />
                <Detail label="Push habilitado" value={preferences?.push_enabled} />
                <Detail label="Jornada habilitada" value={preferences?.lifecycle_enabled} />
                <Detail label="Conteúdo educativo" value={preferences?.product_education_enabled} />
                <Detail label="Conteúdo comercial" value={preferences?.commercial_enabled} />
                <Detail label="Preferências criadas em" value={dateValue(preferences?.created_at)} />
              </Section>

              <Section icon={Briefcase} title="Informações profissionais">
                <Detail label="Profissão / rótulo" value={p.professional_title} />
                <Detail label="Registro profissional" value={p.professional_register} />
                <Detail label="Contexto de atuação" value={p.work_context} />
                <Detail label="Logo personalizado" value={p.custom_logo_url} />
              </Section>

              <Section icon={CreditCard} title="Assinatura">
                <Detail label="Plano" value={p.subscription_plan} />
                <Detail label="Status da assinatura" value={p.subscription_status} />
                <Detail label="Provedor de cobrança" value={p.billing_provider} />
                <Detail label="ID do cliente Stripe" value={p.stripe_customer_id} mono />
                <Detail label="Fim do período de teste" value={dateValue(p.trial_ends_at)} />
                <Detail label="Vencimento da assinatura" value={dateValue(p.subscription_ends_at)} />
                <Detail label="Aviso de fim do teste enviado" value={dateValue(p.trial_expiration_email_sent_at)} />
              </Section>

              <Section icon={Database} title="Backup e integrações">
                <Detail label="Backup automático" value={p.auto_backup_enabled} />
                <Detail label="Frequência do backup" value={p.backup_frequency} />
                <Detail label="Último backup" value={dateValue(p.last_backup_at)} />
                <Detail label="Desconexão do Google forçada" value={p.force_google_disconnect} />
              </Section>

              <Section icon={Calendar} title="Datas da conta">
                <Detail label="Cadastro na plataforma" value={dateValue(p.created_at)} />
                <Detail label="Última atualização" value={dateValue(p.updated_at)} />
                <Detail label="Cadastro no Auth" value={dateValue(details.auth?.created_at)} />
                <Detail label="Último acesso" value={dateValue(details.auth?.last_sign_in_at)} />
                <Detail label="E-mail confirmado em" value={dateValue(details.auth?.email_confirmed_at)} />
                <Detail label="Consentimento atualizado em" value={dateValue(preferences?.updated_at)} />
              </Section>

              <Section icon={Globe} title="Origem do cadastro">
                <Detail label="Canal" value={acquisition.channel} />
                <Detail label="UTM Source" value={acquisition.utm_source} />
                <Detail label="UTM Medium" value={acquisition.utm_medium} />
                <Detail label="UTM Campaign" value={acquisition.utm_campaign} />
                <Detail label="Página de entrada" value={acquisition.landing_page} />
                <Detail label="Primeiro acesso detectado" value={dateValue(acquisition.first_seen_at)} />
              </Section>

              <div className="rounded-2xl border border-brand-border/50 bg-brand-bg/30 p-4 text-xs text-brand-text-muted">
                <div className="flex items-center gap-2 font-semibold text-brand-text">
                  {preferences?.whatsapp_number ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <XCircle className="h-4 w-4 text-red-600" />}
                  {preferences?.whatsapp_number ? 'WhatsApp cadastrado' : 'WhatsApp ainda não cadastrado'}
                </div>
                <p className="mt-1">Os dados desta janela são carregados somente para administradores autenticados.</p>
              </div>
            </>
          ) : null}
        </div>

        <footer className="flex justify-end border-t border-brand-border/50 bg-brand-bg/30 px-5 py-4 sm:px-6">
          <button type="button" onClick={onClose} className="btn-primary px-5 py-2 text-xs font-semibold">Fechar</button>
        </footer>
      </div>
    </div>
  );
}
