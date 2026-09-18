import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Clock3, Loader2 } from 'lucide-react';
import { fetchCurrentPatientAnamnesis, type PatientAnamnesis } from '../../services/anamnesis';

type Props = {
  patientId: string;
  href: string;
};

const formatUpdatedAt = (value: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));

export default function PatientAnamnesisSummaryCard({ patientId, href }: Props) {
  const [anamnesis, setAnamnesis] = useState<PatientAnamnesis | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);

    fetchCurrentPatientAnamnesis(patientId)
      .then((data) => {
        if (active) setAnamnesis(data);
      })
      .catch((error) => {
        console.warn('[Anamnesis] Não foi possível carregar o resumo:', error);
        if (active) setAnamnesis(null);
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [patientId]);

  return (
    <div className="card p-5 border border-brand-primary/15 bg-gradient-to-br from-white to-brand-primary/[0.03]">
      <div className="flex items-start gap-3">
        <div className="rounded-xl bg-brand-primary/10 p-2.5 text-brand-primary">
          <ClipboardList size={20} />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-brand-text">Anamnese</h3>

          {loading ? (
            <div className="mt-2 flex items-center gap-2 text-xs text-brand-text-muted">
              <Loader2 size={13} className="animate-spin" />
              Carregando...
            </div>
          ) : anamnesis ? (
            <div className="mt-1.5 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-semibold text-brand-text">{anamnesis.templateName}</span>
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  anamnesis.status === 'completed'
                    ? 'bg-emerald-50 text-emerald-700'
                    : 'bg-amber-50 text-amber-700'
                }`}>
                  {anamnesis.status === 'completed' ? <CheckCircle2 size={11} /> : <Clock3 size={11} />}
                  {anamnesis.status === 'completed' ? 'Concluída' : 'Rascunho'}
                </span>
              </div>
              <p className="text-[10px] text-brand-text-muted">
                Atualizada em {formatUpdatedAt(anamnesis.updatedAt)}
              </p>
            </div>
          ) : (
            <p className="mt-1.5 text-xs text-brand-text-muted">
              Registre informações iniciais e dados relevantes para o acompanhamento.
            </p>
          )}

          <Link
            to={href}
            className="mt-3 inline-flex items-center text-xs font-bold text-brand-primary hover:underline"
          >
            {anamnesis ? 'Abrir anamnese' : 'Preencher anamnese'} →
          </Link>
        </div>
      </div>
    </div>
  );
}
