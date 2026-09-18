import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, Clock, Loader2, Pencil, RefreshCw, Trash2 } from 'lucide-react';

type ManualPushNotification = {
  id: string;
  user_id?: string | null;
  title?: string | null;
  message?: string | null;
  type?: 'info' | 'success' | 'warning' | 'error' | string | null;
  read_at?: string | null;
  created_at?: string | null;
  image_url?: string | null;
  link?: string | null;
  audience_segment?: unknown;
  professionals?: {
    full_name?: string | null;
    google_email?: string | null;
  } | null;
};

type Props = {
  notifications: ManualPushNotification[];
  loading: boolean;
  deletingNotificationId: string | null;
  resendingNotificationId: string | null;
  getAudienceLabel: (notification: ManualPushNotification) => string;
  onClear: () => void;
  onCopy: (notification: ManualPushNotification) => void;
  onResend: (notification: ManualPushNotification) => void;
  onDelete: (notificationId: string) => void;
};

const GROUPS_PER_PAGE = 10;

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const notificationGroupKey = (notification: ManualPushNotification) => JSON.stringify([
  String(notification.title || '').trim(),
  String(notification.message || '').trim(),
]);

export default function ManualPushNotificationHistory({
  notifications,
  loading,
  deletingNotificationId,
  resendingNotificationId,
  getAudienceLabel,
  onClear,
  onCopy,
  onResend,
  onDelete,
}: Props) {
  const [page, setPage] = useState(1);
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(() => new Set());

  const groups = useMemo(() => {
    const grouped = new Map<string, {
      key: string;
      title: string;
      message: string;
      latestAt: number;
      latestCreatedAt: string | null;
      imageUrl: string | null;
      notifications: ManualPushNotification[];
    }>();

    notifications.forEach((notification) => {
      const key = notificationGroupKey(notification);
      const createdAt = notification.created_at ? new Date(notification.created_at).getTime() : 0;
      const current = grouped.get(key);
      if (current) {
        current.notifications.push(notification);
        if (createdAt > current.latestAt) {
          current.latestAt = createdAt;
          current.latestCreatedAt = notification.created_at || null;
          current.imageUrl = notification.image_url || current.imageUrl;
        }
        return;
      }

      grouped.set(key, {
        key,
        title: String(notification.title || 'Sem título'),
        message: String(notification.message || ''),
        latestAt: Number.isFinite(createdAt) ? createdAt : 0,
        latestCreatedAt: notification.created_at || null,
        imageUrl: notification.image_url || null,
        notifications: [notification],
      });
    });

    return Array.from(grouped.values())
      .map((group) => ({
        ...group,
        notifications: [...group.notifications].sort((left, right) => {
          const leftTime = left.created_at ? new Date(left.created_at).getTime() : 0;
          const rightTime = right.created_at ? new Date(right.created_at).getTime() : 0;
          return rightTime - leftTime;
        }),
      }))
      .sort((left, right) => right.latestAt - left.latestAt);
  }, [notifications]);

  const totalPages = Math.max(1, Math.ceil(groups.length / GROUPS_PER_PAGE));
  const pageGroups = groups.slice((page - 1) * GROUPS_PER_PAGE, page * GROUPS_PER_PAGE);

  useEffect(() => {
    setPage((current) => Math.min(current, totalPages));
  }, [totalPages]);

  const goToPage = (nextPage: number) => {
    const safePage = Math.min(Math.max(1, nextPage), totalPages);
    setPage(safePage);
    setExpandedGroups(new Set());
  };

  const toggleGroup = (key: string) => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  return (
    <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
            <Clock size={18} className="text-brand-primary" />
            <span>Notificações push enviadas manualmente</span>
          </h3>
          {!loading && groups.length > 0 && (
            <p className="mt-1 text-xs text-brand-text-muted">
              {groups.length} grupo{groups.length === 1 ? '' : 's'} por título / mensagem · {notifications.length} envio{notifications.length === 1 ? '' : 's'}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onClear}
          disabled={notifications.length === 0 || loading}
          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Trash2 size={14} />
          <span>Limpar histórico</span>
        </button>
      </div>

      {loading ? (
        <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
          <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
          <span className="text-sm">Carregando logs...</span>
        </div>
      ) : notifications.length === 0 ? (
        <div className="p-12 text-center text-brand-text-muted text-sm italic">
          Nenhuma notificação manual cadastrada no sistema.
        </div>
      ) : (
        <div className="space-y-3">
          {pageGroups.map((group) => {
            const expanded = expandedGroups.has(group.key);
            return (
              <div key={group.key} className="overflow-hidden rounded-2xl border border-brand-border/60 bg-white">
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={expanded}
                  className="flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-brand-bg/20"
                >
                  {group.imageUrl && (
                    <img
                      src={group.imageUrl}
                      alt="Capa"
                      className="h-10 w-10 shrink-0 rounded-lg border border-brand-border/40 object-cover"
                    />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="font-semibold text-sm text-brand-text">{group.title}</p>
                        <p className="mt-0.5 line-clamp-2 text-xs leading-relaxed text-brand-text-muted">{group.message || 'Sem mensagem'}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        <span className="rounded-full border border-brand-primary/15 bg-brand-primary/5 px-2 py-1 text-[10px] font-bold text-brand-primary">
                          {group.notifications.length} registro{group.notifications.length === 1 ? '' : 's'}
                        </span>
                        <ChevronDown size={17} className={`text-brand-text-muted transition-transform ${expanded ? 'rotate-180' : ''}`} />
                      </div>
                    </div>
                    <p className="mt-2 text-[10px] text-brand-text-muted">
                      Último envio: {formatDateTime(group.latestCreatedAt)}
                    </p>
                  </div>
                </button>

                {expanded && (
                  <div className="border-t border-brand-border/50 overflow-x-auto">
                    <table className="w-full min-w-[920px] text-left text-sm border-collapse">
                      <thead>
                        <tr className="border-b border-brand-border/60 bg-brand-bg/20 text-brand-text font-bold text-xs uppercase tracking-wider">
                          <th className="py-2.5 px-3">Profissional</th>
                          <th className="py-2.5 px-3">Segmentação utilizada</th>
                          <th className="py-2.5 px-3">Tipo</th>
                          <th className="py-2.5 px-3">Lido em</th>
                          <th className="py-2.5 px-3">Enviado em</th>
                          <th className="py-2.5 px-3 text-right">Ação</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-brand-border/30 text-xs">
                        {group.notifications.map((notification) => (
                          <tr key={notification.id} className="hover:bg-brand-bg/10 transition-colors">
                            <td className="py-2.5 px-3">
                              <p className="font-semibold text-brand-text">{notification.professionals?.full_name || 'Profissional'}</p>
                              <p className="text-[10px] text-brand-text-muted">{notification.professionals?.google_email || ''}</p>
                            </td>
                            <td className="py-2.5 px-3 min-w-[180px]">
                              <span className="inline-flex rounded-full border border-brand-primary/20 bg-brand-primary/5 px-2 py-1 text-[10px] font-semibold text-brand-primary">
                                {getAudienceLabel(notification)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3">
                              <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                notification.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' :
                                notification.type === 'error' ? 'bg-red-50 text-red-700 border border-red-150' :
                                notification.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-150' :
                                'bg-blue-50 text-blue-700 border border-blue-150'
                              }`}>
                                {notification.type || 'info'}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-brand-text-muted">
                              {notification.read_at ? formatDateTime(notification.read_at) : (
                                <span className="text-[10px] text-red-500 font-semibold uppercase">Não lido</span>
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-brand-text-muted">{formatDateTime(notification.created_at)}</td>
                            <td className="py-2.5 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => onCopy(notification)}
                                className="p-1 text-brand-primary hover:bg-brand-bg rounded transition-colors mr-1 cursor-pointer"
                                title="Editar conteúdo e preparar novo envio"
                              >
                                <Pencil size={15} />
                              </button>
                              <button
                                type="button"
                                onClick={() => onResend(notification)}
                                disabled={resendingNotificationId === notification.id}
                                className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors mr-1 disabled:opacity-50 cursor-pointer"
                                title="Reenviar Notificação Imediatamente"
                              >
                                {resendingNotificationId === notification.id ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => onDelete(notification.id)}
                                disabled={deletingNotificationId === notification.id}
                                className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 cursor-pointer"
                                title="Excluir registro"
                              >
                                {deletingNotificationId === notification.id ? <Loader2 className="animate-spin" size={15} /> : <Trash2 size={15} />}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          {totalPages > 1 && (
            <div className="flex flex-col gap-2 border-t border-brand-border/40 pt-4 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-brand-text-muted">
                Página {page} de {totalPages} · até {GROUPS_PER_PAGE} grupos por página
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => goToPage(page - 1)}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-brand-text transition-colors hover:border-brand-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft size={14} />Anterior
                </button>
                <button
                  type="button"
                  onClick={() => goToPage(page + 1)}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1 rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-brand-text transition-colors hover:border-brand-primary/40 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Próxima<ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
