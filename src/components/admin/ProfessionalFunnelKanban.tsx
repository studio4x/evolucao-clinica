import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  CreditCard,
  Filter,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  UserRound,
  Users,
  X,
} from 'lucide-react';
import { supabase } from '../../supabaseClient';
import {
  buildProfessionalFunnelMessage,
  buildProfessionalWhatsAppUrl,
} from '../../utils/professionalFunnelMessages';
import ProfessionalDetailsModal from './ProfessionalDetailsModal';

type StageKey = 'registered' | 'whatsapp_verified' | 'onboarding_choice' | 'first_patient' | 'linked_record' | 'first_evolution' | 'returned' | 'paid';
type CommercialStatus = 'paid' | 'courtesy' | 'trial_active' | 'trial_expired' | 'no_plan';
type CommercialFilter = 'all' | CommercialStatus;

type FunnelProfessional = {
  id: string;
  fullName: string;
  email: string;
  whatsappNumber: string | null;
  whatsappOptIn: boolean;
  accountStatus: string;
  createdAt: string;
  onboardingInitialMode: string | null;
  onboardingChoiceAt: string | null;
  subscriptionPlan: string | null;
  subscriptionStatus: string | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  commercialStatus: CommercialStatus;
  stage: StageKey;
  stageReachedAt: string;
  metrics: {
    usageDaysCount: number;
    patientsCount: number;
    linkedRecordsCount: number;
    evolutionsCount: number;
  };
};

type FunnelBoard = {
  generatedAt: string;
  total: number;
  stageCounts: Record<StageKey, number>;
  commercialCounts: Record<CommercialStatus, number>;
  stages: Array<{ key: StageKey; label: string; description: string }>;
  professionals: FunnelProfessional[];
};

const FILTERS: Array<{ key: CommercialFilter; label: string }> = [
  { key: 'all', label: 'Todos' },
  { key: 'trial_active', label: 'Trial ativo' },
  { key: 'trial_expired', label: 'Trial esgotado' },
  { key: 'paid', label: 'Plano pago' },
  { key: 'courtesy', label: 'Cortesia' },
  { key: 'no_plan', label: 'Sem plano' },
];

const STAGE_COLORS: Record<StageKey, { header: string; count: string; border: string }> = {
  registered: { header: 'bg-slate-100 text-slate-800', count: 'bg-slate-200 text-slate-800', border: 'border-slate-200' },
  whatsapp_verified: { header: 'bg-cyan-50 text-cyan-800', count: 'bg-cyan-100 text-cyan-800', border: 'border-cyan-200' },
  onboarding_choice: { header: 'bg-sky-50 text-sky-800', count: 'bg-sky-100 text-sky-800', border: 'border-sky-200' },
  first_patient: { header: 'bg-blue-50 text-blue-800', count: 'bg-blue-100 text-blue-800', border: 'border-blue-200' },
  linked_record: { header: 'bg-indigo-50 text-indigo-800', count: 'bg-indigo-100 text-indigo-800', border: 'border-indigo-200' },
  first_evolution: { header: 'bg-violet-50 text-violet-800', count: 'bg-violet-100 text-violet-800', border: 'border-violet-200' },
  returned: { header: 'bg-amber-50 text-amber-800', count: 'bg-amber-100 text-amber-800', border: 'border-amber-200' },
  paid: { header: 'bg-emerald-50 text-emerald-800', count: 'bg-emerald-100 text-emerald-800', border: 'border-emerald-200' },
};

const COMMERCIAL_PRESENTATION: Record<CommercialStatus, { label: string; className: string }> = {
  paid: { label: 'Plano pago', className: 'border-emerald-200 bg-emerald-50 text-emerald-700' },
  courtesy: { label: 'Cortesia', className: 'border-purple-200 bg-purple-50 text-purple-700' },
  trial_active: { label: 'Trial ativo', className: 'border-sky-200 bg-sky-50 text-sky-700' },
  trial_expired: { label: 'Trial esgotado', className: 'border-red-200 bg-red-50 text-red-700' },
  no_plan: { label: 'Sem plano', className: 'border-slate-200 bg-slate-50 text-slate-600' },
};

const NEXT_ACTION: Record<StageKey, string> = {
  registered: 'Próximo: verificar WhatsApp',
  whatsapp_verified: 'Próximo: escolher como começar',
  onboarding_choice: 'Próximo: cadastrar paciente',
  first_patient: 'Próximo: vincular prontuário',
  linked_record: 'Próximo: concluir evolução',
  first_evolution: 'Próximo: retornar ao app',
  returned: 'Próximo: assinar um plano',
  paid: 'Fluxo principal concluído',
};

const formatDate = (value?: string | null) => {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Não informado';
  return parsed.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Não informado';
  return parsed.toLocaleString('pt-BR');
};

const initialModeLabel = (mode: string | null) => {
  if (mode === 'guided') return 'Configurar com ajuda';
  if (mode === 'explore') return 'Conhecer o app primeiro';
  return 'Caminho não registrado';
};

const daysUntil = (value?: string | null) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return Math.ceil((timestamp - Date.now()) / (24 * 60 * 60 * 1000));
};

function ProfessionalCard({
  professional,
  onOpen,
  onOpenEmail,
}: {
  professional: FunnelProfessional;
  onOpen: () => void;
  onOpenEmail: () => void;
}) {
  const commercial = COMMERCIAL_PRESENTATION[professional.commercialStatus];
  const trialDays = daysUntil(professional.trialEndsAt);
  const message = buildProfessionalFunnelMessage({
    fullName: professional.fullName,
    stage: professional.stage,
    commercialStatus: professional.commercialStatus,
  });
  const whatsappUrl = professional.whatsappNumber
    ? buildProfessionalWhatsAppUrl(professional.whatsappNumber, message.whatsappText)
    : null;
  const hasEmail = professional.email.includes('@');
  const initials = professional.fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'PR';

  return (
    <article className="overflow-hidden rounded-2xl border border-brand-border/70 bg-white shadow-sm transition hover:-translate-y-0.5 hover:border-brand-primary/35 hover:shadow-md">
      <button
        type="button"
        onClick={onOpen}
        className="group w-full p-4 text-left focus:outline-none focus:ring-2 focus:ring-inset focus:ring-brand-primary/30"
        aria-label={`Abrir detalhes de ${professional.fullName}`}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-primary/10 text-xs font-bold text-brand-primary">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-brand-text" title={professional.fullName}>{professional.fullName}</p>
                <p className="truncate text-[11px] text-brand-text-muted" title={professional.email}>{professional.email}</p>
              </div>
              <ChevronRight className="mt-1 shrink-0 text-brand-text-muted transition group-hover:translate-x-0.5 group-hover:text-brand-primary" size={16} />
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${commercial.className}`}>{commercial.label}</span>
          <span className="rounded-full border border-brand-border bg-brand-bg/60 px-2 py-0.5 text-[10px] font-semibold text-brand-text-muted">
            {initialModeLabel(professional.onboardingInitialMode)}
          </span>
          {professional.accountStatus !== 'active' && (
            <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-700">
              Conta {professional.accountStatus === 'pending' ? 'pendente' : 'inativa'}
            </span>
          )}
        </div>

        <div className="mt-3 grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-lg bg-brand-bg/60 px-1 py-2" title="Pacientes cadastrados">
            <p className="text-sm font-bold text-brand-text">{professional.metrics.patientsCount}</p>
            <p className="text-[9px] uppercase text-brand-text-muted">Pacientes</p>
          </div>
          <div className="rounded-lg bg-brand-bg/60 px-1 py-2" title="Evoluções concluídas ou registradas">
            <p className="text-sm font-bold text-brand-text">{professional.metrics.evolutionsCount}</p>
            <p className="text-[9px] uppercase text-brand-text-muted">Evoluções</p>
          </div>
          <div className="rounded-lg bg-brand-bg/60 px-1 py-2" title="Dias com uso real da plataforma">
            <p className="text-sm font-bold text-brand-text">{professional.metrics.usageDaysCount}</p>
            <p className="text-[9px] uppercase text-brand-text-muted">Dias de uso</p>
          </div>
        </div>

        <div className="mt-3 space-y-1.5 border-t border-brand-border/50 pt-3 text-[10px] text-brand-text-muted">
          <p className="flex items-center gap-1.5"><CalendarDays size={12} />Cadastro: {formatDate(professional.createdAt)}</p>
          {professional.commercialStatus === 'trial_active' && trialDays !== null && (
            <p className="flex items-center gap-1.5 text-sky-700"><Clock3 size={12} />Trial termina {trialDays <= 0 ? 'hoje' : `em ${trialDays} dia${trialDays === 1 ? '' : 's'}`}</p>
          )}
          <p className={`flex items-center gap-1.5 font-semibold ${professional.stage === 'paid' ? 'text-emerald-700' : 'text-brand-primary'}`}>
            {professional.stage === 'paid' ? <CheckCircle2 size={12} /> : <ChevronRight size={12} />}{NEXT_ACTION[professional.stage]}
          </p>
        </div>
      </button>

      {(whatsappUrl || hasEmail) && <div className={`grid gap-2 border-t border-brand-border/60 bg-brand-bg/20 p-2.5 ${whatsappUrl && hasEmail ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {whatsappUrl && (
          <a
            href={whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-2 text-[11px] font-bold text-emerald-700 transition hover:bg-emerald-100"
            aria-label={`Preparar WhatsApp para ${professional.fullName}`}
            title={professional.whatsappOptIn ? 'Abrir conversa no WhatsApp' : 'Abrir conversa no WhatsApp; não há opt-in registrado na plataforma'}
          >
            <MessageCircle size={14} />WhatsApp
          </a>
        )}
        {hasEmail && (
          <button
            type="button"
            onClick={onOpenEmail}
            className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-2 py-2 text-[11px] font-bold text-sky-700 transition hover:bg-sky-100"
            aria-label={`Preparar e-mail para ${professional.fullName}`}
          >
            <Mail size={14} />E-mail
          </button>
        )}
      </div>}
    </article>
  );
}

function FunnelEmailModal({ professional, onClose }: { professional: FunnelProfessional | null; onClose: () => void }) {
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    setSending(false);
    setError('');
    setSuccess('');
  }, [professional?.id]);

  useEffect(() => {
    if (!professional) return;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !sending) onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose, professional, sending]);

  if (!professional) return null;

  const content = buildProfessionalFunnelMessage({
    fullName: professional.fullName,
    stage: professional.stage,
    commercialStatus: professional.commercialStatus,
  });
  const firstName = professional.fullName.trim().split(/\s+/)[0] || 'profissional';

  const sendEmail = async () => {
    setSending(true);
    setError('');
    setSuccess('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão administrativa não encontrada.');
      const response = await fetch('/api/admin/professional-funnel/email', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ professionalId: professional.id, stage: professional.stage }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível enviar o e-mail.');
      setSuccess(`E-mail enviado com sucesso via ${payload.provider === 'brevo' ? 'Brevo' : 'SMTP'}.`);
    } catch (sendError) {
      setError(sendError instanceof Error ? sendError.message : 'Não foi possível enviar o e-mail.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" role="dialog" aria-modal="true" aria-label="Preparar e-mail do funil">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl">
        <header className="flex items-start justify-between gap-4 border-b border-brand-border px-5 py-4 sm:px-6">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-brand-primary">E-mail conforme a etapa atual</p>
            <h2 className="mt-1 font-display text-xl font-bold text-brand-text">Revisar e enviar</h2>
            <p className="mt-1 text-xs text-brand-text-muted">O conteúdo está pronto e não precisa ser editado.</p>
          </div>
          <button type="button" onClick={onClose} disabled={sending} className="rounded-full p-2 text-brand-text-muted transition hover:bg-brand-bg hover:text-brand-text disabled:opacity-50" aria-label="Fechar e-mail">
            <X size={20} />
          </button>
        </header>

        <div className="overflow-y-auto p-5 sm:p-6">
          <div className="mb-4 grid gap-3 rounded-2xl border border-brand-border bg-brand-bg/30 p-4 text-xs sm:grid-cols-2">
            <div><span className="block font-bold uppercase tracking-wide text-brand-text-muted">Para</span><span className="mt-1 block break-all font-semibold text-brand-text">{professional.fullName} · {professional.email}</span></div>
            <div><span className="block font-bold uppercase tracking-wide text-brand-text-muted">Assunto</span><span className="mt-1 block font-semibold text-brand-text">{content.subject}</span></div>
          </div>

          <div className="mx-auto max-w-2xl overflow-hidden rounded-2xl border border-brand-border bg-white shadow-sm">
            <div className="flex items-center justify-between border-b border-brand-border px-6 py-4">
              <span className="font-display text-base font-extrabold text-brand-primary">Evolução Clínica</span>
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-text-muted">Seu próximo passo</span>
            </div>
            <div className="bg-gradient-to-br from-brand-primary to-brand-secondary px-6 py-7 text-white">
              <h3 className="text-xl font-bold">{content.subject}</h3>
              <p className="mt-2 text-sm text-white/85">{content.preheader}</p>
            </div>
            <div className="space-y-4 px-6 py-7 text-sm leading-relaxed text-brand-text">
              <p>Olá, <strong>{firstName}</strong>!</p>
              {content.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              <div className="pt-2 text-center">
                <span className="inline-flex rounded-xl bg-brand-primary px-5 py-3 font-bold text-white">{content.actionLabel}</span>
              </div>
            </div>
            <div className="border-t border-brand-border bg-brand-bg/40 px-6 py-4 text-center text-[10px] text-brand-text-muted">
              Mensagem enviada pela equipe da Evolução Clínica · Preferências de comunicação · Descadastro · Suporte
            </div>
          </div>

          {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
          {success && <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">{success}</div>}
        </div>

        <footer className="border-t border-brand-border bg-white p-4 sm:px-6">
          <button
            type="button"
            onClick={() => void sendEmail()}
            disabled={sending || Boolean(success)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-3 text-sm font-bold text-white transition hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {sending ? <Loader2 className="animate-spin" size={18} /> : success ? <CheckCircle2 size={18} /> : <Send size={18} />}
            {sending ? 'Enviando...' : success ? 'E-mail enviado' : 'Enviar e-mail'}
          </button>
        </footer>
      </div>
    </div>
  );
}

export default function ProfessionalFunnelKanban() {
  const [board, setBoard] = useState<FunnelBoard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [commercialFilter, setCommercialFilter] = useState<CommercialFilter>('all');
  const [selectedProfessional, setSelectedProfessional] = useState<FunnelProfessional | null>(null);
  const [emailProfessional, setEmailProfessional] = useState<FunnelProfessional | null>(null);

  const loadBoard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData.session?.access_token;
      if (!token) throw new Error('Sessão administrativa não encontrada.');
      const response = await fetch('/api/admin/professional-funnel', {
        cache: 'no-store',
        headers: { Authorization: `Bearer ${token}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar o funil dos profissionais.');
      setBoard(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Não foi possível carregar o funil dos profissionais.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBoard(); }, [loadBoard]);

  const filteredProfessionals = useMemo(() => {
    if (!board) return [];
    const normalizedSearch = search.trim().toLocaleLowerCase('pt-BR');
    return board.professionals.filter((professional) => {
      const matchesFilter = commercialFilter === 'all' || professional.commercialStatus === commercialFilter;
      const matchesSearch = !normalizedSearch
        || professional.fullName.toLocaleLowerCase('pt-BR').includes(normalizedSearch)
        || professional.email.toLocaleLowerCase('pt-BR').includes(normalizedSearch);
      return matchesFilter && matchesSearch;
    });
  }, [board, commercialFilter, search]);

  const filteredCounts = useMemo(() => filteredProfessionals.reduce<Partial<Record<StageKey, number>>>((counts, professional) => {
    counts[professional.stage] = (counts[professional.stage] || 0) + 1;
    return counts;
  }, {}), [filteredProfessionals]);

  return (
    <div className="space-y-5 animate-fadeIn" data-testid="professional-funnel-kanban">
      <section className="rounded-3xl border border-brand-primary/15 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <div className="flex items-center gap-2 text-brand-primary">
              <Users size={22} />
              <h1 className="font-display text-2xl font-bold">Funil dos profissionais</h1>
            </div>
            <p className="mt-1 max-w-3xl text-sm text-brand-text-muted">
              Cada profissional aparece somente na etapa mais avançada que alcançou. Clique em um cartão para consultar todos os detalhes.
            </p>
          </div>
          <button type="button" onClick={() => void loadBoard()} disabled={loading} className="btn-outline inline-flex items-center justify-center gap-2 px-4 py-2 text-xs">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar dados
          </button>
        </div>

        {board && (
          <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div className="rounded-2xl border border-brand-border bg-brand-bg/30 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-brand-text-muted"><UserRound size={14} />Profissionais</p>
              <p className="mt-1 text-2xl font-bold text-brand-primary">{board.total}</p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-sky-700"><Clock3 size={14} />Trials ativos</p>
              <p className="mt-1 text-2xl font-bold text-sky-800">{board.commercialCounts.trial_active}</p>
            </div>
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-red-700"><Clock3 size={14} />Trials esgotados</p>
              <p className="mt-1 text-2xl font-bold text-red-800">{board.commercialCounts.trial_expired}</p>
            </div>
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-emerald-700"><CreditCard size={14} />Planos pagos</p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">{board.commercialCounts.paid}</p>
            </div>
            <div className="rounded-2xl border border-purple-200 bg-purple-50 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold text-purple-700"><CheckCircle2 size={14} />Cortesias</p>
              <p className="mt-1 text-2xl font-bold text-purple-800">{board.commercialCounts.courtesy}</p>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <label className="relative block w-full lg:max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-brand-text-muted" size={16} />
            <span className="sr-only">Buscar profissional</span>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou e-mail"
              className="w-full rounded-xl border border-brand-border bg-white py-2.5 pl-10 pr-3 text-sm outline-none transition focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/10"
            />
          </label>
          <div className="flex items-center gap-2 overflow-x-auto pb-1" aria-label="Filtrar por situação comercial">
            <Filter className="shrink-0 text-brand-text-muted" size={15} />
            {FILTERS.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setCommercialFilter(filter.key)}
                aria-pressed={commercialFilter === filter.key}
                className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold transition ${commercialFilter === filter.key
                  ? 'border-brand-primary bg-brand-primary text-white'
                  : 'border-brand-border bg-white text-brand-text-muted hover:border-brand-primary/40 hover:text-brand-primary'}`}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {loading && !board ? (
        <div className="flex min-h-64 items-center justify-center gap-2 rounded-3xl border border-brand-border bg-white text-sm text-brand-text-muted">
          <Loader2 className="animate-spin" size={22} />Carregando todos os profissionais...
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-700">{error}</div>
      ) : board ? (
        <>
          <div className="flex items-center justify-between px-1 text-xs text-brand-text-muted">
            <span>{filteredProfessionals.length} de {board.total} profissionais exibidos</span>
            <span>Atualizado em {formatDateTime(board.generatedAt)}</span>
          </div>
          <div className="overflow-x-auto pb-4" aria-label="Funil kanban dos profissionais">
            <div className="flex min-w-max items-start gap-4">
              {board.stages.map((stage) => {
                const colors = STAGE_COLORS[stage.key];
                const professionals = filteredProfessionals.filter((professional) => professional.stage === stage.key);
                return (
                  <section key={stage.key} className={`w-[300px] shrink-0 overflow-hidden rounded-2xl border bg-brand-bg/20 ${colors.border}`} data-stage={stage.key}>
                    <header className={`min-h-[106px] border-b p-4 ${colors.header} ${colors.border}`}>
                      <div className="flex items-center justify-between gap-3">
                        <h2 className="text-sm font-bold">{stage.label}</h2>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${colors.count}`}>{filteredCounts[stage.key] || 0}</span>
                      </div>
                      <p className="mt-2 text-[11px] leading-relaxed opacity-80">{stage.description}</p>
                    </header>
                    <div className="max-h-[62vh] space-y-3 overflow-y-auto p-3">
                      {professionals.length > 0 ? professionals.map((professional) => (
                        <ProfessionalCard
                          key={professional.id}
                          professional={professional}
                          onOpen={() => setSelectedProfessional(professional)}
                          onOpenEmail={() => setEmailProfessional(professional)}
                        />
                      )) : (
                        <div className="rounded-xl border border-dashed border-brand-border bg-white/60 px-3 py-8 text-center text-xs text-brand-text-muted">
                          Nenhum profissional nesta etapa com os filtros atuais.
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </div>
        </>
      ) : null}

      <ProfessionalDetailsModal
        professional={selectedProfessional ? {
          id: selectedProfessional.id,
          full_name: selectedProfessional.fullName,
          google_email: selectedProfessional.email,
        } : null}
        onClose={() => setSelectedProfessional(null)}
      />
      <FunnelEmailModal professional={emailProfessional} onClose={() => setEmailProfessional(null)} />
    </div>
  );
}
