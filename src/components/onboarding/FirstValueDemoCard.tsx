import { useEffect, useState } from 'react';
import { ArrowRight, CheckCircle2, FileText, Mic, PlayCircle, Sparkles, WandSparkles } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { trackLifecycleEvent } from '../../services/lifecycleTelemetry';

type Props = { userId: string };

const SAMPLE_EVOLUTION = 'Paciente demonstrativo participou da atividade planejada, manteve boa adesão às orientações e apresentou progresso compatível com o objetivo da sessão. Recomenda-se manter o plano de acompanhamento e reavaliar a resposta no próximo encontro.';

export function FirstValueDemoCard({ userId }: Props) {
  const navigate = useNavigate();
  const [hasRealEvolution, setHasRealEvolution] = useState(true);
  const [step, setStep] = useState(0);

  useEffect(() => {
    let active = true;
    void supabase
      .from('evolutions')
      .select('id', { count: 'exact', head: true })
      .eq('professional_id', userId)
      .eq('transcription_status', 'completed')
      .eq('google_doc_append_status', 'completed')
      .then(({ count, error }) => {
        if (active && !error) setHasRealEvolution((count || 0) > 0);
      });
    return () => { active = false; };
  }, [userId]);

  if (hasRealEvolution) return null;

  const startDemo = () => {
    setStep(1);
    void trackLifecycleEvent('guided_demo_started', {
      metadata: { step: 'sample_input' },
      dedupeKey: `guided_demo_started:${userId}`,
    });
  };

  const completeDemo = () => {
    setStep(3);
    void trackLifecycleEvent('guided_demo_completed', {
      metadata: { step: 'sample_result' },
      dedupeKey: `guided_demo_completed:${userId}`,
    });
  };

  return (
    <section className="overflow-hidden rounded-3xl border border-emerald-200 bg-gradient-to-br from-emerald-50 via-white to-brand-primary/[0.06] shadow-sm" data-testid="first-value-demo">
      <div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
        <div className="p-5 sm:p-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-white px-3 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-700">
            <Sparkles size={12} /> Demonstração de 2 minutos
          </div>
          <h2 className="mt-3 font-display text-xl font-bold text-brand-text">Veja o resultado antes de configurar tudo</h2>
          <p className="mt-2 text-sm leading-6 text-brand-text-muted">
            Esta demonstração usa somente conteúdo fictício. Nenhum paciente ou prontuário será criado.
          </p>
          {step === 0 ? (
            <button type="button" onClick={startDemo} className="btn-primary mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm">
              <PlayCircle size={17} /> Iniciar demonstração
            </button>
          ) : step < 3 ? (
            <button type="button" onClick={() => step === 1 ? setStep(2) : completeDemo()} className="btn-primary mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm">
              {step === 1 ? 'Gerar exemplo' : 'Ver próximo passo'} <ArrowRight size={16} />
            </button>
          ) : (
            <button type="button" onClick={() => navigate('/painel/patients/new?onboarding=1')} className="btn-primary mt-5 inline-flex items-center gap-2 px-5 py-2.5 text-sm">
              Cadastrar meu primeiro paciente <ArrowRight size={16} />
            </button>
          )}
        </div>

        <div className="border-t border-emerald-100 bg-white/80 p-5 sm:p-6 lg:border-l lg:border-t-0">
          <div className="mb-4 flex items-center justify-between gap-3 text-xs font-semibold text-brand-text-muted">
            <span>Paciente demonstrativo</span>
            <span>Etapa {Math.max(step, 1)} de 3</span>
          </div>
          {step <= 1 ? (
            <div className="rounded-2xl border border-brand-border bg-brand-bg/35 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-brand-primary"><Mic size={17} /> Resumo fictício da sessão</div>
              <p className="mt-3 text-sm leading-6 text-brand-text-muted">“Realizamos a atividade planejada. Houve boa participação e melhora na execução das orientações.”</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
              <div className="flex items-center gap-2 text-sm font-bold text-emerald-800"><WandSparkles size={17} /> Exemplo de evolução organizada</div>
              <p className="mt-3 text-sm leading-6 text-emerald-950">{SAMPLE_EVOLUTION}</p>
            </div>
          )}
          <div className="mt-4 flex items-center gap-2 text-xs font-medium text-brand-text-muted">
            {step === 3 ? <CheckCircle2 size={16} className="text-emerald-600" /> : <FileText size={16} className="text-brand-primary" />}
            {step === 3 ? 'Demonstração concluída. Agora faça o fluxo com um paciente real.' : 'O prontuário real continua protegido no seu Google Docs.'}
          </div>
        </div>
      </div>
    </section>
  );
}
