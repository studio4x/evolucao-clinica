import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, Loader2, PenLine } from 'lucide-react';
import { fetchPatientSessionSummary } from '../../services/patientSessions';

type Props = { patientId: string; href: string };

export default function PatientSessionsSummaryCard({ patientId, href }: Props) {
  const [summary, setSummary] = useState<{ total: number; signed: number; pending: number } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchPatientSessionSummary(patientId)
      .then((data) => active && setSummary(data))
      .catch((error) => {
        console.warn('[PatientSessions] Não foi possível carregar o resumo:', error);
        if (active) setSummary(null);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, [patientId]);

  const monthLabel = new Intl.DateTimeFormat('pt-BR', { month: 'long' }).format(new Date());
  const sessionLabel = summary?.total === 1 ? 'sessão' : 'sessões';
  const signedLabel = summary?.signed === 1 ? 'assinada' : 'assinadas';

  return (
    <div className="card group border border-brand-primary/15 bg-gradient-to-br from-white to-brand-primary/[0.03] p-5 transition-all hover:-translate-y-0.5 hover:border-brand-primary/30">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary ring-1 ring-brand-primary/10"><PenLine size={20} /></div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-semibold text-brand-text">Controle de Sessões</h3>
            <span className="rounded-full bg-brand-primary/10 px-2 py-0.5 text-[10px] font-bold text-brand-primary">Atendimentos</span>
          </div>
          {loading ? (
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
