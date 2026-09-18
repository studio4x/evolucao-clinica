import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Loader2, PenLine } from 'lucide-react';
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

  return (
    <div className="card border border-brand-primary/15 bg-gradient-to-br from-white to-brand-primary/[0.03] p-5">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary"><PenLine size={20} /></div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-brand-text">Controle de Sessões</h3>
          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-brand-text-muted"><Loader2 size={13} className="animate-spin" />Carregando...</div>
          ) : summary ? (
            <div className="mt-1.5 space-y-1 text-xs text-brand-text-muted">
              <p className="capitalize">{monthLabel}: <strong className="text-brand-text">{summary.total} sessões</strong></p>
              <p className="flex flex-wrap gap-3">
                <span className="inline-flex items-center gap-1 text-emerald-700"><CheckCircle2 size={12} />{summary.signed} assinadas</span>
                {summary.pending > 0 && <span>{summary.pending} aguardando assinatura</span>}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-brand-text-muted">Registre atendimentos e colete a assinatura diretamente no dispositivo.</p>
          )}
          <Link to={href} className="mt-3 inline-flex items-center text-xs font-bold text-brand-primary hover:underline">Abrir controle →</Link>
        </div>
      </div>
    </div>
  );
}
