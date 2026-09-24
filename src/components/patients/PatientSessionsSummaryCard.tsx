import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Crown, Loader2, Lock, PenLine } from 'lucide-react';
import { fetchPatientSessionSummary } from '../../services/patientSessions';
import { useAuthStore } from '../../store/authStore';
import { hasActiveYearlyAccess } from '../../utils/subscriptionAccess';

type Props = { patientId: string; href: string };

export default function PatientSessionsSummaryCard({ patientId, href }: Props) {
  const { profileRole, subscriptionPlan, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  const hasYearlyAccess = hasActiveYearlyAccess({ profileRole, subscriptionPlan, subscriptionStatus, subscriptionEndsAt });
  const [summary, setSummary] = useState<{ total: number; signed: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    if (!hasYearlyAccess) {
      setSummary(null);
      setLoading(false);
      return () => { active = false; };
    }
    setLoading(true);
    fetchPatientSessionSummary(patientId)
      .then((data) => active && setSummary(data))
      .catch((error) => {
        console.warn('[PatientSessions] Não foi possível carregar o resumo:', error);
        if (active) setSummary(null);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [hasYearlyAccess, patientId]);

  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date());
  const sessionLabel = summary?.total === 1 ? 'sessão' : 'sessões';
  const signedLabel = summary?.signed === 1 ? 'assinada' : 'assinadas';

  return (
    <div className="card group border border-brand-primary/15 bg-gradient-to-br from-white to-brand-primary/[0.03] p-5 transition-all hover:-translate-y-0.5 hover:border-brand-primary/30">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary ring-1 ring-brand-primary/10"><PenLine size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="font-semibold text-brand-text">Controle de Sessões</h3>
              <span className="inline-flex items-center gap-1 rounded-md border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[9px] font-bold text-amber-600" title="Recurso Premium do Plano Anual">
                <Crown size={10} className="fill-current" /> Plano Anual
              </span>
            </div>
          <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">Atendimentos</span>
          </div>
          {!hasYearlyAccess ? (
            <div className="mt-2 space-y-2">
              <p className="flex items-center gap-1.5 text-xs leading-relaxed text-brand-text-muted"><Lock size={13} className="shrink-0 text-brand-primary" />Esta funcionalidade é somente para assinantes do Plano Anual.</p>
              <Link to="/painel/subscription" className="inline-flex text-xs font-bold text-brand-primary hover:underline">Conhecer o Plano Anual →</Link>
            </div>
          ) : loading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-brand-text-muted"><Loader2 size={13} className="animate-spin" />Carregando...</div>
          ) : summary ? (
            <div className="mt-1.5 space-y-1 text-xs text-brand-text-muted">
              <p className="capitalize">{monthLabel}: <strong className="text-brand-text">{summary.total} {sessionLabel}</strong></p>
              <p className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} />{summary.signed} {signedLabel}</span>
                {summary.pending > 0 && <span>{summary.pending} aguardando assinatura</span>}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-brand-text-muted">Registre atendimentos e colete a assinatura diretamente no dispositivo.</p>
          )}
        </div>
      </div>
      <Link
        to={href}
        className="mt-4 flex w-full items-center justify-between rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-3.5 py-2.5 text-sm font-semibold text-brand-primary transition-colors hover:border-brand-primary/40 hover:bg-brand-primary/10 focus:outline-none focus:ring-2 focus:ring-brand-primary/30"
      >
        <span>Abrir controle de sessões</span>
        <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
      </Link>
    </div>
  );
}
