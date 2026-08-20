import { useState } from 'react';
import { CheckCircle2, ChevronRight, Clock3, Gift, Loader2, ShieldCheck } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

type RedemptionStatus = 'idle' | 'submitting' | 'success' | 'already-redeemed' | 'error';

function formatTrialEnd(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(date);
}

export default function TrialExtensionRedeem() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [status, setStatus] = useState<RedemptionStatus>('idle');
  const [error, setError] = useState('');
  const [trialEndsAt, setTrialEndsAt] = useState<string | null>(null);

  async function redeemOffer() {
    if (!token || status === 'submitting') return;
    setStatus('submitting');
    setError('');
    try {
      const response = await fetch('/api/lifecycle/trial-extension/redeem', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível ativar os dias adicionais.');
      window.history.replaceState({}, '', '/reativar-teste');
      setTrialEndsAt(data.trialEndsAt || null);
      setStatus(data.alreadyRedeemed ? 'already-redeemed' : 'success');
    } catch (redeemError) {
      setError(redeemError instanceof Error ? redeemError.message : 'Não foi possível ativar os dias adicionais.');
      setStatus('error');
    }
  }

  if (status === 'success' || status === 'already-redeemed') {
    const formattedEnd = formatTrialEnd(trialEndsAt);
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
        <section className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-xl shadow-slate-200/60 sm:p-12">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={34} />
          </div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">Teste gratuito ativo</p>
          <h1 className="mb-4 text-3xl font-bold tracking-tight">Seus 7 dias estão liberados.</h1>
          <p className="text-base leading-7 text-slate-600">
            {status === 'already-redeemed' ? 'Este convite já havia sido utilizado. Seu acesso continua ativo.' : 'Sua conta foi reativada e você já pode voltar a explorar a plataforma.'}
            {formattedEnd && <> O novo período de teste termina em <strong>{formattedEnd}</strong>.</>}
          </p>
          <Link to="/painel/dashboard" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700">
            Acessar o Evolução Clínica <ChevronRight size={16} />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-14">
      <section className="mx-auto max-w-xl rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-10">
        <div className="mb-7 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <Gift size={25} />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Uma nova oportunidade</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">Ative mais 7 dias gratuitos</h1>
            <p className="mt-3 leading-6 text-slate-600">Confirme abaixo para reativar seu teste e conhecer o Evolução Clínica com mais calma.</p>
          </div>
        </div>

        <div className="space-y-3 rounded-2xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-700">
          <p className="flex items-start gap-3"><Clock3 className="mt-0.5 shrink-0 text-indigo-600" size={18} /><span>Os 7 dias começam a contar somente depois da sua confirmação.</span></p>
          <p className="flex items-start gap-3"><ShieldCheck className="mt-0.5 shrink-0 text-indigo-600" size={18} /><span>Este convite é individual e pode ser utilizado uma única vez.</span></p>
        </div>

        {!token ? (
          <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-800">Este link está incompleto. Abra novamente o botão recebido no e-mail.</div>
        ) : (
          <>
            {error && <div className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">{error}</div>}
            <button type="button" onClick={() => void redeemOffer()} disabled={status === 'submitting'} className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-60">
              {status === 'submitting' ? <><Loader2 size={17} className="animate-spin" /> Ativando...</> : <>Confirmar e ativar 7 dias <ChevronRight size={17} /></>}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
