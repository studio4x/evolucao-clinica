import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CheckCircle2, CreditCard, Loader2, RefreshCw, Users } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type Funnel = {
  generatedAt: string;
  stages: Record<string, number>;
  rates: Record<string, number>;
  blockers: { googleScopeErrors: number };
  checkout: { users: number; total: number; byStatus: Record<string, number> };
};

const STAGES = [
  ['registered', 'Cadastros'],
  ['whatsappVerified', 'WhatsApp verificado'],
  ['withPatient', 'Primeiro paciente'],
  ['withLinkedRecord', 'Prontuário vinculado'],
  ['withFirstEvolution', 'Primeira evolução'],
  ['returnedSecondDay', 'Retorno em outro dia'],
  ['paid', 'Plano pago'],
] as const;

export function AdminConversionFunnel() {
  const [funnel, setFunnel] = useState<Funnel | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) throw new Error('Sessão expirada.');
      const response = await fetch('/api/admin/conversion-funnel?days=30', { headers: { Authorization: `Bearer ${token}` } });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Falha ao carregar funil.');
      setFunnel(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Falha ao carregar funil.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const registered = funnel?.stages.registered || 0;

  return (
    <section className="mb-6 rounded-3xl border border-brand-primary/15 bg-white p-5 shadow-sm sm:p-6" data-testid="admin-conversion-funnel">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-brand-primary"><Users size={18} /><h2 className="font-display text-lg font-bold">Funil de ativação — últimos 30 dias</h2></div>
          <p className="mt-1 text-xs text-brand-text-muted">Coorte comercial, sem administradores e planos cortesia.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="btn-outline inline-flex items-center justify-center gap-2 px-4 py-2 text-xs">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Atualizar
        </button>
      </div>

      {loading && !funnel ? (
        <div className="flex min-h-32 items-center justify-center gap-2 text-sm text-brand-text-muted"><Loader2 className="animate-spin" size={20} />Carregando...</div>
      ) : error ? (
        <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : funnel ? (
        <>
          <div className="mt-5 grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
            {STAGES.map(([key, label], index) => {
              const value = funnel.stages[key] || 0;
              const percentage = registered > 0 ? Math.round((value / registered) * 100) : 0;
              return (
                <div key={key} className="relative rounded-2xl border border-brand-border/60 bg-brand-bg/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">{label}</p>
                  <p className="mt-1 text-2xl font-bold text-brand-primary">{value}</p>
                  <p className="text-[11px] text-brand-text-muted">{percentage}% da coorte</p>
                  {index < STAGES.length - 1 && <ArrowRight className="absolute -right-2.5 top-1/2 z-10 hidden -translate-y-1/2 rounded-full bg-white text-brand-border xl:block" size={18} />}
                </div>
              );
            })}
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-emerald-800"><CheckCircle2 size={15} />Primeira evolução em até 48h</p>
              <p className="mt-1 text-xl font-bold text-emerald-900">{funnel.rates.firstEvolutionWithin48h || 0}%</p>
            </div>
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-amber-800"><AlertTriangle size={15} />Erros de permissão Google</p>
              <p className="mt-1 text-xl font-bold text-amber-900">{funnel.blockers.googleScopeErrors}</p>
            </div>
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <p className="flex items-center gap-2 text-xs font-bold text-sky-800"><CreditCard size={15} />Tentativas de checkout</p>
              <p className="mt-1 text-xl font-bold text-sky-900">{funnel.checkout.total}</p>
              <p className="text-[11px] text-sky-800">{funnel.checkout.users} profissionais · {funnel.checkout.byStatus.paid || 0} pagas · {funnel.checkout.byStatus.failed || 0} falhas · {funnel.checkout.byStatus.cancelled || 0} canceladas</p>
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
