import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';
import {
  Clock,
  Loader2,
  Trash2,
  AlertTriangle,
  RefreshCw,
  Mail,
  User,
  CalendarDays,
  Search,
  ChevronLeft,
  Inbox,
  ShieldAlert,
  Send,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { showAlert, showConfirm } from '../store/modalStore';

interface NotificationRecord {
  id: string;
  recipient_name: string | null;
  recipient_email: string;
  subject: string;
  message: string;
  provider: 'smtp' | 'brevo';
  source: string;
  status: 'sent' | 'failed';
  error_message: string | null;
  provider_message_id: string | null;
  created_at: string;
}

function isMissingEmailDeliveriesTableError(error: any) {
  const message = String(error?.message || error?.details || error?.hint || '');
  return (
    message.includes('Could not find the table') ||
    message.includes('schema cache') ||
    message.includes('email_deliveries')
  );
}

export default function EmailHistory() {
  const navigate = useNavigate();

  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [historyUnavailable, setHistoryUnavailable] = useState(false);

  const [search, setSearch] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [resendingId, setResendingId] = useState<string | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [confirmClearAll, setConfirmClearAll] = useState(false);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    setError('');
    setHistoryUnavailable(false);
    try {
      const { data, error: fetchError } = await supabase
        .from('email_deliveries')
        .select('*')
        .order('created_at', { ascending: false });

      if (fetchError) throw fetchError;
      setNotifications(data || []);
    } catch (err: any) {
      if (isMissingEmailDeliveriesTableError(err)) {
        console.warn('[EmailHistory] Tabela email_deliveries indisponível; exibindo histórico vazio.');
        setNotifications([]);
        setHistoryUnavailable(true);
        return;
      }

      setError('Erro ao carregar histórico: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  const handleDelete = async (id: string) => {
    const confirmed = await showConfirm('Excluir este registro do histórico?', {
      title: "Excluir Registro",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "danger",
      icon: "trash"
    });
    if (!confirmed) return;
    setDeletingId(id);
    try {
      const { error } = await supabase.from('email_deliveries').delete().eq('id', id);
      if (error) throw error;
      setNotifications(prev => prev.filter(n => n.id !== id));
    } catch (err: any) {
      await showAlert('Erro ao excluir: ' + err.message, {
        title: "Erro ao Excluir",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleResend = async (notification: NotificationRecord) => {
    const confirmed = await showConfirm(`Deseja reenviar este e-mail para ${notification.recipient_name || notification.recipient_email}?`, {
      title: "Reenviar E-mail",
      confirmLabel: "Reenviar",
      cancelLabel: "Cancelar",
      variant: "info",
      icon: "question"
    });
    if (!confirmed) return;
    setResendingId(notification.id);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const response = await fetch(`/api/admin/email-deliveries/${notification.id}/resend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token || ''}`
        }
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.error || 'Não foi possível reenviar o e-mail.');
      await showAlert(payload.message || 'E-mail reenviado com sucesso.', {
        title: "E-mail Reenviado",
        variant: "success",
        icon: "success"
      });
      await fetchHistory();
    } catch (err: any) {
      await showAlert('Erro ao reenviar: ' + (err.message || 'Erro desconhecido'), {
        title: "Erro ao Reenviar",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setResendingId(null);
    }
  };

  const handleClearAll = async () => {
    if (!confirmClearAll) {
      setConfirmClearAll(true);
      return;
    }
    setClearingAll(true);
    setConfirmClearAll(false);
    try {
      const { error } = await supabase
        .from('email_deliveries')
        .delete()
        .neq('id', '00000000-0000-0000-0000-000000000000'); // deleta tudo
      if (error) throw error;
      setNotifications([]);
    } catch (err: any) {
      await showAlert('Erro ao limpar histórico: ' + err.message, {
        title: "Erro ao Limpar",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setClearingAll(false);
    }
  };

  const filtered = notifications.filter(n => {
    const q = search.toLowerCase();
    return (
      n.subject?.toLowerCase().includes(q) ||
      n.message?.toLowerCase().includes(q) ||
      n.recipient_name?.toLowerCase().includes(q) ||
      n.recipient_email?.toLowerCase().includes(q) ||
      n.provider?.toLowerCase().includes(q) ||
      n.source?.toLowerCase().includes(q) ||
      n.status?.toLowerCase().includes(q)
    );
  });

  const formatDate = (iso: string) =>
    new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/admin/email-notifications')}
            className="p-2 rounded-xl hover:bg-brand-border/30 text-brand-text-muted transition-colors cursor-pointer"
            title="Voltar para E-mail Notifications"
          >
            <ChevronLeft size={20} />
          </button>
          <div>
          <h2 className="text-xl font-bold text-brand-text flex items-center gap-2">
              <Clock size={20} className="text-brand-primary" />
              Histórico de E-mails Enviados
            </h2>
            <p className="text-xs text-brand-text-muted mt-0.5">
              {notifications.length} registro{notifications.length !== 1 ? 's' : ''} no total
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchHistory}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-brand-border/60 text-brand-text-muted hover:bg-brand-bg/40 transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            Atualizar
          </button>

          {notifications.length > 0 && (
            confirmClearAll ? (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-600 font-medium">Confirmar exclusão de todo o histórico?</span>
                <button
                  onClick={handleClearAll}
                  disabled={clearingAll}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer disabled:opacity-50"
                >
                  {clearingAll ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                  Sim, excluir tudo
                </button>
                <button
                  onClick={() => setConfirmClearAll(false)}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-brand-border/60 text-brand-text-muted hover:bg-brand-bg/40 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                onClick={handleClearAll}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border border-red-200 text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
              >
                <Trash2 size={14} />
                Limpar Histórico
              </button>
            )
          )}
        </div>
      </div>

      {/* Search */}
      {notifications.length > 0 && (
        <div className="relative">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por destinatário, assunto, provedor ou mensagem..."
            className="w-full pl-10 pr-4 py-2.5 text-sm border border-brand-border/60 rounded-xl bg-white focus:outline-none focus:border-brand-primary transition-all"
          />
        </div>
      )}

      {/* Erro */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
          <AlertTriangle size={18} className="flex-shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}

      {historyUnavailable && !error && (
        <div className="flex items-center gap-3 p-4 bg-amber-50 border border-amber-100 rounded-xl text-sm text-amber-800">
          <ShieldAlert size={18} className="flex-shrink-0 text-amber-500" />
          <span>
            O histórico de e-mails ainda está sendo inicializado neste ambiente. A tela está aberta em modo degradado até a tabela
            <strong> email_deliveries</strong> ficar disponível.
          </span>
        </div>
      )}

      {/* Conteúdo */}
      <div className="card bg-white shadow-sm border border-brand-border/60 overflow-hidden">
        {loading ? (
          <div className="p-16 flex flex-col items-center justify-center text-brand-text-muted">
            <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
            <span className="text-sm">Carregando histórico...</span>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-16 flex flex-col items-center justify-center text-brand-text-muted">
            <Inbox size={40} className="mb-3 opacity-30" />
            <p className="text-sm font-medium">
              {search ? 'Nenhum resultado para sua busca.' : 'Nenhum e-mail no histórico.'}
            </p>
            {search && (
              <button
                onClick={() => setSearch('')}
                className="mt-2 text-xs text-brand-primary hover:underline cursor-pointer"
              >
                Limpar busca
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="border-b border-brand-border/60 bg-brand-bg/20">
                  <th className="py-3 px-4 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <User size={11} />
                      Destinatário
                    </div>
                  </th>
                  <th className="py-3 px-4 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <Mail size={11} />
                      Assunto / Mensagem
                    </div>
                  </th>
                  <th className="py-3 px-4 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                    <div className="flex items-center gap-1.5">
                      <CalendarDays size={11} />
                      Provedor / Origem
                    </div>
                  </th>
                  <th className="py-3 px-4 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                    Status
                  </th>
                  <th className="py-3 px-4 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                    Enviado em
                  </th>
                  <th className="py-3 px-4 text-[10px] font-bold text-brand-text-muted uppercase tracking-wider text-right">
                    Ação
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border/20">
                {filtered.map((n) => (
                  <tr
                    key={n.id}
                    className="hover:bg-brand-bg/10 transition-colors group"
                  >
                    {/* Profissional */}
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-full bg-brand-primary/10 flex items-center justify-center flex-shrink-0">
                          <User size={14} className="text-brand-primary" />
                        </div>
                        <div>
                          <p className="font-semibold text-brand-text text-xs leading-tight">
                            {n.recipient_name || 'Destinatário'}
                          </p>
                          <p className="text-[10px] text-brand-text-muted mt-0.5">
                            {n.recipient_email || '—'}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Assunto / Mensagem */}
                    <td className="py-3 px-4 max-w-sm">
                      <p className="font-semibold text-brand-text text-xs truncate">{n.subject}</p>
                      <p className="text-[10px] text-brand-text-muted truncate mt-0.5">{n.message}</p>
                    </td>

                    {/* Provedor / Origem */}
                    <td className="py-3 px-4">
                      <div className="flex flex-col gap-1.5">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                          n.provider === 'brevo'
                            ? 'bg-sky-50 text-sky-700 border-sky-200'
                            : 'bg-amber-50 text-amber-700 border-amber-200'
                        }`}>
                          {n.provider === 'brevo' ? 'Brevo' : 'SMTP'}
                        </span>
                        <span className="text-[10px] text-brand-text-muted">
                          {n.source === 'legacy-notification' ? 'Legado' : n.source}
                        </span>
                      </div>
                    </td>

                    {/* Status */}
                    <td className="py-3 px-4">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        n.status === 'sent'
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                          : 'bg-red-50 text-red-700 border-red-200'
                      }`}>
                        {n.status === 'sent' ? 'Enviado' : 'Falha'}
                      </span>
                      {n.error_message && (
                        <p className="mt-1 text-[10px] text-red-500 max-w-[180px] truncate">{n.error_message}</p>
                      )}
                    </td>

                    {/* Data */}
                    <td className="py-3 px-4">
                      <span className="text-xs text-brand-text-muted whitespace-nowrap">
                        {n.created_at ? formatDate(n.created_at) : '—'}
                      </span>
                    </td>

                    {/* Ação */}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleResend(n)}
                        disabled={resendingId === n.id}
                        title="Reenviar este e-mail"
                        className="p-1.5 text-brand-primary hover:text-brand-primary-hover hover:bg-brand-primary/10 rounded-lg transition-colors disabled:opacity-50 cursor-pointer opacity-0 group-hover:opacity-100"
                      >
                        {resendingId === n.id
                          ? <Loader2 size={15} className="animate-spin" />
                          : <Send size={15} />
                        }
                      </button>
                      <button
                        onClick={() => handleDelete(n.id)}
                        disabled={deletingId === n.id}
                        title="Excluir este registro"
                        className="p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer opacity-0 group-hover:opacity-100"
                      >
                        {deletingId === n.id
                          ? <Loader2 size={15} className="animate-spin" />
                          : <Trash2 size={15} />
                        }
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Footer da tabela */}
            <div className="px-4 py-2.5 border-t border-brand-border/30 bg-brand-bg/10 flex items-center justify-between">
              <span className="text-[10px] text-brand-text-muted">
                Exibindo {filtered.length} de {notifications.length} registros
              </span>
              {search && filtered.length < notifications.length && (
                <button
                  onClick={() => setSearch('')}
                  className="text-[10px] text-brand-primary hover:underline cursor-pointer"
                >
                  Limpar filtro
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Aviso de segurança */}
      {notifications.length > 0 && (
        <div className="flex items-start gap-2.5 p-3.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-800">
          <ShieldAlert size={15} className="flex-shrink-0 text-amber-500 mt-0.5" />
          <span>
            <strong>Atenção:</strong> O histórico contém todas as notificações in-app e de e-mail enviadas pela plataforma.
            A exclusão é permanente e não pode ser desfeita.
          </span>
        </div>
      )}
    </div>
  );
}
