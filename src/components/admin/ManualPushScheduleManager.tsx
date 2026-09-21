import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Loader2, RefreshCw, Trash2, AlertTriangle } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { showConfirm } from '../../store/modalStore';

type ManualPushSchedule = {
  id: string;
  title: string;
  message: string;
  type: string;
  audience_segment?: { label?: string } | null;
  scheduled_at: string;
  status: 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
  recipient_ids?: unknown;
  sent_count: number;
  failed_count: number;
  push_accepted_count: number;
  error_message?: string | null;
  executed_at?: string | null;
  cancelled_at?: string | null;
};

type Props = { refreshKey: number };

const statusLabels: Record<ManualPushSchedule['status'], string> = {
  pending: 'Programada',
  processing: 'Processando',
  completed: 'Concluída',
  failed: 'Falhou',
  cancelled: 'Cancelada',
};

const statusClasses: Record<ManualPushSchedule['status'], string> = {
  pending: 'border-blue-200 bg-blue-50 text-blue-700',
  processing: 'border-amber-200 bg-amber-50 text-amber-700',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  failed: 'border-red-200 bg-red-50 text-red-700',
  cancelled: 'border-slate-200 bg-slate-50 text-slate-600',
};

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

export default function ManualPushScheduleManager({ refreshKey }: Props) {
  const [schedules, setSchedules] = useState<ManualPushSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  const loadSchedules = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch('/api/admin/notifications/schedules', {
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível carregar os agendamentos.');
      setSchedules(Array.isArray(payload.schedules) ? payload.schedules : []);
    } catch (loadError: any) {
      setError(loadError.message || 'Não foi possível carregar os agendamentos.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadSchedules(); }, [loadSchedules, refreshKey]);

  const cancelSchedule = async (schedule: ManualPushSchedule) => {
    if (schedule.status !== 'pending') return;
    const confirmed = await showConfirm('Cancelar esta notificação programada?', {
      title: 'Cancelar agendamento',
      confirmLabel: 'Cancelar agendamento',
      cancelLabel: 'Manter agendamento',
      variant: 'warning',
      icon: 'warning',
    });
    if (!confirmed) return;
    setCancellingId(schedule.id);
    setError('');
    try {
      const { data } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/notifications/schedules/${schedule.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${data.session?.access_token || ''}` },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível cancelar o agendamento.');
      await loadSchedules();
    } catch (cancelError: any) {
      setError(cancelError.message || 'Não foi possível cancelar o agendamento.');
    } finally {
      setCancellingId(null);
    }
  };

  return (
    <section className="card border border-brand-border/60 bg-white p-6 shadow-sm">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-semibold text-brand-text">
            <CalendarClock size={18} className="text-brand-primary" />
            Notificações programadas
          </h3>
          <p className="mt-1 text-xs text-brand-text-muted">O processamento ocorre automaticamente a cada poucos minutos. O horário usa o fuso local convertido para o servidor.</p>
        </div>
        <button type="button" onClick={() => void loadSchedules()} disabled={loading} className="btn-outline inline-flex items-center gap-1.5 px-3 py-2 text-xs disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />Atualizar
        </button>
      </div>

      {error && <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700"><AlertTriangle size={16} className="mt-0.5 shrink-0" />{error}</div>}
      {loading ? (
        <div className="flex items-center justify-center gap-2 p-8 text-sm text-brand-text-muted"><Loader2 size={18} className="animate-spin" />Carregando agendamentos...</div>
      ) : schedules.length === 0 ? (
        <p className="rounded-xl border border-dashed border-brand-border p-6 text-center text-sm text-brand-text-muted">Nenhuma notificação programada.</p>
      ) : (
        <div className="space-y-3">
          {schedules.map((schedule) => {
            const recipientCount = Array.isArray(schedule.recipient_ids) ? schedule.recipient_ids.length : 0;
            return (
              <div key={schedule.id} className="rounded-xl border border-brand-border/60 bg-brand-bg/20 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h4 className="truncate text-sm font-semibold text-brand-text">{schedule.title}</h4>
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-bold ${statusClasses[schedule.status]}`}>{statusLabels[schedule.status]}</span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-brand-text-muted">{schedule.message}</p>
                    <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-brand-text-muted">
                      <span>Envio: <strong className="text-brand-text">{formatDateTime(schedule.scheduled_at)}</strong></span>
                      <span>{recipientCount} destinatário{recipientCount === 1 ? '' : 's'}</span>
                      {schedule.audience_segment?.label && <span>{schedule.audience_segment.label}</span>}
                    </div>
                    {schedule.status === 'completed' && <p className="mt-1 text-[11px] text-emerald-700">{schedule.sent_count} registro{schedule.sent_count === 1 ? '' : 's'} criado{schedule.sent_count === 1 ? '' : 's'} · {schedule.push_accepted_count} push aceito{schedule.push_accepted_count === 1 ? '' : 's'} pelo provedor.</p>}
                    {schedule.error_message && <p className="mt-1 text-[11px] text-red-700">{schedule.error_message}</p>}
                  </div>
                  {schedule.status === 'pending' && (
                    <button type="button" onClick={() => void cancelSchedule(schedule)} disabled={cancellingId === schedule.id} className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50">
                      {cancellingId === schedule.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}Cancelar
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
