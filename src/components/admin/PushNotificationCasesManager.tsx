import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Bell, Check, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';

type PushNotificationCase = 'general' | 'onboarding' | 'support' | 'migration' | 'session_reminder' | 'lifecycle';
type PushNotificationCases = Record<PushNotificationCase, boolean>;

const CASES: Array<{ key: PushNotificationCase; label: string; description: string }> = [
  { key: 'general', label: 'Notificações gerais e manuais', description: 'Avisos enviados manualmente pela administração e comunicados gerais da plataforma.' },
  { key: 'onboarding', label: 'Cadastro e liberação de acesso', description: 'Confirmação de cadastro em análise, aviso aos administradores e liberação do profissional.' },
  { key: 'support', label: 'Chamados de suporte', description: 'Criação, resposta, andamento e encerramento de chamados.' },
  { key: 'migration', label: 'Migração de prontuários', description: 'Recebimento e atualizações de solicitações de migração.' },
  { key: 'session_reminder', label: 'Lembretes de sessão e evolução', description: 'Lembretes automáticos dos atendimentos agendados para o dia.' },
  { key: 'lifecycle', label: 'Jornada automática de ativação', description: 'Mensagens push das jornadas automáticas de onboarding e ativação.' },
];

export default function PushNotificationCasesManager() {
  const [cases, setCases] = useState<PushNotificationCases | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState<PushNotificationCase | null>(null);
  const [error, setError] = useState('');

  const loadCases = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/push-notification-cases', {
        headers: { Authorization: `Bearer ${sessionData.session?.access_token || ''}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os casos de push.');
      setCases(payload.cases as PushNotificationCases);
    } catch (loadError: any) {
      setError(loadError.message || 'Não foi possível carregar os casos de push.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCases();
  }, [loadCases]);

  const toggleCase = async (key: PushNotificationCase) => {
    if (!cases) return;
    const nextCases = { ...cases, [key]: !cases[key] };
    setCases(nextCases);
    setSavingKey(key);
    setError('');
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/push-notification-cases', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token || ''}`,
        },
        body: JSON.stringify({ cases: nextCases }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível salvar os casos de push.');
      setCases(payload.cases as PushNotificationCases);
    } catch (saveError: any) {
      setCases(cases);
      setError(saveError.message || 'Não foi possível salvar os casos de push.');
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <section className="card overflow-hidden border border-brand-border/60 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-border/40 p-5">
        <div className="flex items-start gap-3">
          <span className="rounded-xl bg-brand-primary/10 p-2 text-brand-primary"><Bell size={20} /></span>
          <div>
            <h2 className="text-lg font-semibold text-brand-text">Casos de envio de notificações push</h2>
            <p className="mt-0.5 text-xs text-brand-text-muted">Escolha em quais situações a plataforma pode enviar um push. As notificações internas continuam registradas no painel.</p>
          </div>
        </div>
        <button type="button" onClick={() => void loadCases()} disabled={loading || savingKey !== null} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Atualizar
        </button>
      </div>

      {error && <div className="m-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}

      {loading || !cases ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-brand-text-muted"><Loader2 size={18} className="animate-spin" />Carregando controles...</div>
      ) : (
        <div className="divide-y divide-brand-border/40">
          {CASES.map((item) => {
            const enabled = cases[item.key];
            const saving = savingKey === item.key;
            return (
              <div key={item.key} className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><h3 className="text-sm font-semibold text-brand-text">{item.label}</h3>{enabled && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700"><Check size={11} />Ativo</span>}</div>
                  <p className="mt-1 text-xs leading-relaxed text-brand-text-muted">{item.description}</p>
                </div>
                <button type="button" role="switch" aria-checked={enabled} aria-label={`${enabled ? 'Desativar' : 'Ativar'} ${item.label}`} onClick={() => void toggleCase(item.key)} disabled={saving} className={`relative h-7 w-12 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? 'bg-brand-primary' : 'bg-brand-border'}`}>
                  {saving ? <Loader2 size={14} className="absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 animate-spin text-white" /> : <span className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />}
                </button>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t border-brand-border/40 bg-brand-bg/20 px-5 py-3 text-xs leading-relaxed text-brand-text-muted">O <strong className="text-brand-text">Lembrete Diário Global</strong> possui o controle próprio logo abaixo, pois também define os dias, horário e conteúdo do envio.</div>
    </section>
  );
}
