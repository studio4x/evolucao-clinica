import { FormEvent, useMemo, useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, MessageSquareText } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';

const OPTIONS = [
  'Não tive tempo suficiente para testar',
  'Tive dificuldade para conectar minha conta Google',
  'Não consegui criar a primeira evolução',
  'Tive dificuldade para entender como a plataforma funciona',
  'O valor dos planos não se encaixa no momento',
  'Senti falta de alguma funcionalidade',
  'A plataforma não se adaptou à minha rotina',
  'Encontrei um problema técnico',
  'Decidi utilizar outra solução',
  'Outro motivo',
] as const;

export default function ContinuityFeedback() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token') || '';
  const [reason, setReason] = useState<string>('');
  const [comment, setComment] = useState('');
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState('');
  const [ticketId, setTicketId] = useState('');
  const canSubmit = useMemo(() => Boolean(token && reason && status !== 'submitting'), [reason, status, token]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit) return;
    setStatus('submitting');
    setError('');
    try {
      const response = await fetch('/api/lifecycle/continuity-feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, reason, comment }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Não foi possível enviar seu feedback.');
      setTicketId(data.ticketId || '');
      setStatus('success');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Não foi possível enviar seu feedback.');
      setStatus('error');
    }
  }

  if (status === 'success') {
    return (
      <main className="min-h-screen bg-slate-50 px-4 py-12 text-slate-900">
        <section className="mx-auto max-w-xl rounded-3xl bg-white p-8 text-center shadow-xl shadow-slate-200/60 sm:p-12">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 size={34} />
          </div>
          <p className="mb-2 text-sm font-semibold uppercase tracking-[0.18em] text-emerald-600">Feedback recebido</p>
          <h1 className="mb-4 text-3xl font-bold tracking-tight">Obrigado por compartilhar.</h1>
          <p className="text-base leading-7 text-slate-600">Sua resposta foi registrada como um ticket de suporte. Nossa equipe poderá analisar o contexto e orientar você, se necessário.</p>
          {ticketId && <p className="mt-5 text-xs text-slate-400">Ticket registrado com sucesso.</p>}
          <Link to="/" className="mt-8 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-3 text-sm font-semibold text-white transition hover:bg-slate-700">
            Voltar ao Evolução Clínica <ChevronRight size={16} />
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-14">
      <section className="mx-auto max-w-2xl rounded-3xl bg-white p-6 shadow-xl shadow-slate-200/60 sm:p-10">
        <div className="mb-8 flex items-start gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-indigo-100 text-indigo-600">
            <MessageSquareText size={24} />
          </div>
          <div>
            <p className="mb-1 text-sm font-semibold uppercase tracking-[0.16em] text-indigo-600">Sua experiência importa</p>
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">O que dificultou sua continuidade?</h1>
            <p className="mt-3 leading-6 text-slate-600">Escolha o principal motivo. A resposta é rápida e ajuda a melhorar a experiência de outros profissionais.</p>
          </div>
        </div>

        {!token ? (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-800">Este link de feedback está incompleto. Abra o formulário a partir do e-mail recebido.</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-7">
            <fieldset>
              <legend className="mb-3 text-sm font-bold text-slate-800">Qual foi o principal motivo?</legend>
              <div className="space-y-2">
                {OPTIONS.map((option) => (
                  <label key={option} className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-4 text-sm transition ${reason === option ? 'border-indigo-500 bg-indigo-50 text-indigo-950' : 'border-slate-200 hover:border-indigo-300'}`}>
                    <input type="radio" name="reason" value={option} checked={reason === option} onChange={() => setReason(option)} className="mt-0.5 h-4 w-4 accent-indigo-600" />
                    <span>{option}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block">
              <span className="mb-2 block text-sm font-bold text-slate-800">Quer contar um pouco mais? <span className="font-normal text-slate-400">(opcional)</span></span>
              <textarea value={comment} onChange={(event) => setComment(event.target.value)} maxLength={2000} rows={5} placeholder="Se quiser, descreva o que aconteceu ou como poderíamos ajudar." className="w-full resize-y rounded-2xl border border-slate-200 px-4 py-3 text-sm outline-none transition placeholder:text-slate-400 focus:border-indigo-500 focus:ring-4 focus:ring-indigo-100" />
              <span className="mt-1 block text-right text-xs text-slate-400">{comment.length}/2000</span>
            </label>

            {error && <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm leading-6 text-red-700">{error}</div>}
            <button type="submit" disabled={!canSubmit} className="inline-flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-5 py-3.5 text-sm font-bold text-white transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50">
              {status === 'submitting' ? <><Loader2 size={17} className="animate-spin" /> Enviando...</> : <>Contar o que aconteceu <ChevronRight size={17} /></>}
            </button>
          </form>
        )}
      </section>
    </main>
  );
}
