import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, X, Download, AlertCircle, FileText, CheckCircle2, Sparkles, RefreshCw, Bot, Pencil, Trash2, Check, Clock3 } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { showConfirm } from '../store/modalStore';
import {
  fetchSupportTicketDetail,
  sendSupportMessage,
  updateSupportMessage,
  deleteSupportMessage,
  updateSupportTicketStatus,
  setSupportTicketLastSeen,
  subscribeToSupportTicketDetail,
  SupportTicket,
  SupportMessage
} from '../services/support';
import {
  fetchSupportAiDraft,
  processSupportAiEvent,
  regenerateSupportAiDraft,
  setSupportAiDraftStatus,
  SupportAiDraft,
} from '../services/supportAi';
import TicketStatusBadge from '../components/support/TicketStatusBadge';
import TicketSlaBadge from '../components/support/TicketSlaBadge';
import { RichTextEditor, RichTextPreview } from '../components/common/RichTextEditor';

export default function SupportTicketDetail() {
  const { ticketId: routeTicketId } = useParams<{ ticketId: string }>();
  const location = useLocation();
  const { user, profileRole } = useAuthStore();
  const pathnameTicketId = location.pathname.match(/^\/(?:admin|painel)\/support\/([^/]+)$/)?.[1] ?? null;
  const ticketId = routeTicketId ?? pathnameTicketId;
  const isAdmin = profileRole === 'admin';

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editingMessageText, setEditingMessageText] = useState('');
  const [messageMutationLoading, setMessageMutationLoading] = useState(false);
  const [aiDraft, setAiDraft] = useState<SupportAiDraft | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const aiInitialDraftRequestedRef = useRef<string | null>(null);

  const loadAiState = async (silent = false) => {
    if (!ticketId || !isAdmin) return;
    try {
      if (!silent) setAiLoading(true);
      setAiError('');
      const draft = await fetchSupportAiDraft(ticketId);
      setAiDraft(draft);

      if (!draft && aiInitialDraftRequestedRef.current !== ticketId) {
        aiInitialDraftRequestedRef.current = ticketId;
        try {
          await regenerateSupportAiDraft(ticketId);
          const generatedDraft = await fetchSupportAiDraft(ticketId);
          setAiDraft(generatedDraft);
        } catch (generationError: any) {
          aiInitialDraftRequestedRef.current = null;
          console.error('[SupportAI] Erro ao gerar sugestão inicial:', generationError);
          setAiError(generationError.message || 'Não foi possível gerar a sugestão de resposta.');
        }
      }
    } catch (err: any) {
      console.error('[SupportAI] Erro ao carregar estado:', err);
      if (!silent) setAiError(err.message || 'Não foi possível carregar a IA do atendimento.');
    } finally {
      if (!silent) setAiLoading(false);
    }
  };

  const loadTicketDetail = async (silent = false) => {
    if (!ticketId) return;
    try {
      if (!silent) setLoading(true);
      setError('');
      const data = await fetchSupportTicketDetail(ticketId);
      setTicket(data.ticket);
      setMessages(data.messages);
      const latestMessage = data.messages[data.messages.length - 1];
      if (latestMessage) {
        setSupportTicketLastSeen(ticketId, latestMessage.createdAt);
      } else if (data.ticket.updatedAt) {
        setSupportTicketLastSeen(ticketId, data.ticket.updatedAt);
      }
      if (isAdmin) void loadAiState(true);
    } catch (err: any) {
      console.error('Error loading ticket detail:', err);
      setError('Não foi possível carregar os detalhes do chamado.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    if (!ticketId) return;
    loadTicketDetail();
    if (isAdmin) void loadAiState();

    const refreshTicketDetail = () => loadTicketDetail(true);
    const unsubscribe = subscribeToSupportTicketDetail(ticketId, refreshTicketDetail);
    const pollInterval = window.setInterval(refreshTicketDetail, 5000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') refreshTicketDetail();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ticketId, isAdmin]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ticketId || (!newMessage.trim() && !file)) return;

    try {
      setSending(true);
      setError('');
      const sentMsg = await sendSupportMessage(ticketId, newMessage, file);
      setMessages((prev) => [...prev, sentMsg]);
      setNewMessage('');
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      setSupportTicketLastSeen(ticketId, sentMsg.createdAt);

      if (isAdmin) {
        if (aiDraft?.status === 'pending') {
          void setSupportAiDraftStatus(aiDraft.id, 'used')
            .then(() => setAiDraft((current) => current ? { ...current, status: 'used' } : current))
            .catch((draftError) => console.warn('[SupportAI] Falha ao finalizar rascunho:', draftError));
        }
      } else {
        void processSupportAiEvent(ticketId, 'message', sentMsg.id)
          .catch((aiProcessError) => console.error('[SupportAI] Falha ao processar nova mensagem:', aiProcessError));
      }

      loadTicketDetail(true);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleStartEditMessage = (message: SupportMessage) => {
    setEditingMessageId(message.id);
    setEditingMessageText(message.message);
    setError('');
  };

  const handleCancelEditMessage = () => {
    setEditingMessageId(null);
    setEditingMessageText('');
  };

  const handleSaveEditedMessage = async (messageId: string) => {
    if (!editingMessageText.trim()) {
      setError('A mensagem não pode ficar vazia.');
      return;
    }

    try {
      setMessageMutationLoading(true);
      setError('');
      await updateSupportMessage(messageId, editingMessageText);
      setMessages((current) => current.map((message) => (
        message.id === messageId ? { ...message, message: editingMessageText.trim() } : message
      )));
      handleCancelEditMessage();
      await loadTicketDetail(true);
    } catch (err: any) {
      console.error('Error editing support message:', err);
      setError(err.message || 'Não foi possível editar a mensagem.');
    } finally {
      setMessageMutationLoading(false);
    }
  };

  const handleDeleteMessage = async (message: SupportMessage) => {
    const confirmed = await showConfirm(
      'Esta mensagem será removida da conversa e não ficará visível para o profissional. Deseja continuar?',
      {
        title: 'Excluir mensagem',
        confirmLabel: 'Excluir',
        cancelLabel: 'Cancelar',
        variant: 'warning',
        icon: 'question',
      }
    );
    if (!confirmed) return;

    try {
      setMessageMutationLoading(true);
      setError('');
      await deleteSupportMessage(message.id);
      setMessages((current) => current.filter((item) => item.id !== message.id));
      if (editingMessageId === message.id) handleCancelEditMessage();
      await loadTicketDetail(true);
    } catch (err: any) {
      console.error('Error deleting support message:', err);
      setError(err.message || 'Não foi possível excluir a mensagem.');
    } finally {
      setMessageMutationLoading(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!ticketId) return;
    const confirmed = await showConfirm('Tem certeza de que deseja encerrar este chamado de suporte?', {
      title: 'Encerrar Chamado',
      confirmLabel: 'Encerrar',
      cancelLabel: 'Voltar',
      variant: 'warning',
      icon: 'question'
    });
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await updateSupportTicketStatus(ticketId, 'closed');
      await loadTicketDetail(true);
    } catch (err) {
      console.error('Error closing ticket:', err);
      setError('Não foi possível encerrar o chamado.');
    } finally {
      setActionLoading(false);
    }
  };

  const handleRegenerateDraft = async () => {
    if (!ticketId) return;
    try {
      setAiLoading(true);
      setAiError('');
      await regenerateSupportAiDraft(ticketId);
      await loadAiState(true);
    } catch (err: any) {
      setAiError(err.message || 'Não foi possível gerar uma nova resposta.');
    } finally {
      setAiLoading(false);
    }
  };

  const handleUseDraft = async () => {
    if (!aiDraft) return;
    setNewMessage(aiDraft.content);
    try {
      await setSupportAiDraftStatus(aiDraft.id, 'used');
      setAiDraft({ ...aiDraft, status: 'used' });
    } catch (err) {
      console.warn('[SupportAI] Não foi possível marcar o rascunho como utilizado:', err);
    }
  };

  const handleDismissDraft = async () => {
    if (!aiDraft) return;
    try {
      await setSupportAiDraftStatus(aiDraft.id, 'dismissed');
      setAiDraft({ ...aiDraft, status: 'dismissed' });
    } catch (err: any) {
      setAiError(err.message || 'Não foi possível descartar o rascunho.');
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 10 * 1024 * 1024) {
        setError('O arquivo excede o limite de tamanho de 10MB.');
        return;
      }
      setFile(selectedFile);
      setError('');
    }
  };

  const isImage = (url: string | null) => {
    if (!url) return false;
    const lower = url.toLowerCase();
    return lower.includes('.jpg') || lower.includes('.jpeg') || lower.includes('.png') || lower.includes('.gif') || lower.includes('.webp');
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'payment': return 'Pagamento & Cobrança';
      case 'technical': return 'Problema Técnico';
      case 'account': return 'Conta & Acesso';
      default: return 'Dúvida Geral';
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[50vh]"><Loader2 className="animate-spin text-brand-primary" size={32} /></div>;
  }

  if (error || !ticket) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto mt-8 bg-white border border-brand-border rounded-3xl">
        <AlertCircle className="text-rose-500 mx-auto mb-3" size={36} />
        <h4 className="font-bold text-brand-text">Erro ao abrir chamado</h4>
        <p className="text-xs text-brand-text-muted mt-2">{error || 'Chamado não encontrado.'}</p>
        <Link to={isAdmin ? '/admin/support' : '/painel/support'} className="mt-6 inline-flex items-center justify-center bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold px-4 py-2 rounded-2xl transition-all">Voltar para Lista</Link>
      </div>
    );
  }

  return (
    <div className="flex min-h-[calc(100vh-140px)] flex-col space-y-4 pb-4 md:min-h-[calc(100vh-80px)]">
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <Link to={isAdmin ? '/admin/support' : '/painel/support'} className="p-2 rounded-2xl hover:bg-white text-brand-text-muted hover:text-brand-text border border-transparent hover:border-brand-border bg-white/40 backdrop-blur-sm transition-all"><ArrowLeft size={18} /></Link>
          <div>
            <span className="text-xs text-brand-text-muted block">Voltar para chamados</span>
            <h2 className="text-lg font-bold text-brand-text font-display truncate max-w-[200px] sm:max-w-xs md:max-w-md">{ticket.subject}</h2>
          </div>
        </div>
        {ticket.status !== 'closed' && (
          <button onClick={handleCloseTicket} disabled={actionLoading} className="border border-rose-200 hover:border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-4 py-2 rounded-2xl text-xs flex items-center space-x-1.5 transition-all"><CheckCircle2 size={14} /><span>Encerrar Chamado</span></button>
        )}
      </div>

      <div className="card p-5 bg-white border border-brand-border rounded-3xl shrink-0 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full">{getCategoryLabel(ticket.category)}</span>
            <TicketStatusBadge status={ticket.status} />
            <TicketSlaBadge status={ticket.slaStatus} />
            {isAdmin && (
              <span className={`text-xs px-2.5 py-1 rounded-full border font-bold flex items-center ${ticket.userPlan === 'yearly' || ticket.userPlan === 'courtesy' ? 'bg-amber-50 text-amber-800 border-amber-200' : ticket.userPlan === 'monthly' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-gray-50 text-gray-800 border-gray-200'}`}>
                {ticket.userPlan === 'yearly' ? '👑 VIP Anual' : ticket.userPlan === 'courtesy' ? '🎁 VIP Cortesia' : ticket.userPlan === 'monthly' ? '💼 Mensal' : '🌱 Trial'}
              </span>
            )}
          </div>
          <div className="text-xs text-brand-text-muted leading-relaxed">
            <strong>Cliente:</strong> {ticket.userFullName || 'Profissional'} ({ticket.userPlan === 'yearly' ? 'Anual' : ticket.userPlan === 'courtesy' ? 'Cortesia' : ticket.userPlan === 'monthly' ? 'Mensal' : 'Avaliação'})
            <span className="mx-2">•</span><strong>Criado em:</strong> {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.createdAt))}
          </div>
          {isAdmin && ticket.autoClosedAt && ticket.autoCloseReason === 'inactivity_after_response' && (
            <div className="inline-flex items-center gap-1.5 text-[11px] text-brand-text-muted bg-gray-50 border border-gray-100 rounded-xl px-2.5 py-1.5">
              <CheckCircle2 size={12} className="text-emerald-600" />
              <span>Fechado automaticamente após 3 dias sem interação em {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.autoClosedAt))}.</span>
            </div>
          )}
          {!isAdmin && ticket.status !== 'closed' && ticket.slaStatus === 'answered' && (
            <div className="flex items-start gap-2.5 rounded-2xl border border-brand-primary/15 bg-brand-primary/[0.04] px-4 py-3 text-xs leading-relaxed text-brand-text">
              <Clock3 size={16} className="mt-0.5 shrink-0 text-brand-primary" />
              <div>
                <p className="font-semibold text-brand-primary">Chamado respondido</p>
                <p className="mt-0.5 text-brand-text-muted">
                  Este chamado será encerrado automaticamente após 72 horas sem novas interações. Se precisar complementar alguma informação, envie uma nova mensagem por aqui.
                </p>
              </div>
            </div>
          )}
          <div className="text-sm bg-gray-50 border border-gray-100 p-4 rounded-2xl text-brand-text/90 italic font-sans leading-relaxed">{ticket.description}</div>
          {ticket.attachmentUrl && (
            <a href={ticket.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex items-center space-x-2 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary text-xs font-semibold px-3 py-1.5 rounded-xl border border-brand-primary/15 transition-all">
              {isImage(ticket.attachmentUrl) ? <Paperclip size={12} /> : <FileText size={12} />}<span className="truncate max-w-[150px] sm:max-w-xs">{ticket.attachmentName || 'Ver anexo do chamado'}</span><Download size={12} />
            </a>
          )}
        </div>
      </div>

      {isAdmin && (
        <div className="shrink-0 bg-white border border-brand-primary/20 rounded-3xl p-4 shadow-sm space-y-3">
          <div className="flex items-start gap-2.5">
            <div className="p-2 rounded-xl bg-brand-primary/10 text-brand-primary"><Bot size={18} /></div>
            <div>
              <h3 className="text-sm font-bold text-brand-text">Sugestão de resposta</h3>
              <p className="text-xs text-brand-text-muted mt-1">A configuração geral do atendimento fica na página de Suporte / Tickets.</p>
            </div>
          </div>

          {aiError && <div className="text-xs text-rose-700 bg-rose-50 border border-rose-100 rounded-xl px-3 py-2">{aiError}</div>}

          {aiDraft ? (
            <div className="rounded-2xl border border-brand-primary/15 bg-brand-primary/[0.03] p-4 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-brand-primary"><Sparkles size={15} /><span className="text-xs font-bold">Resposta sugerida pela IA</span>{aiDraft.model && <span className="text-[10px] text-brand-text-muted">{aiDraft.model}</span>}</div>
                <button type="button" onClick={handleRegenerateDraft} disabled={aiLoading} className="inline-flex items-center gap-1 text-xs font-semibold text-brand-primary hover:underline"><RefreshCw size={12} className={aiLoading ? 'animate-spin' : ''} />Gerar novamente</button>
              </div>
              <div className="text-sm text-brand-text leading-relaxed whitespace-pre-wrap">{aiDraft.content}</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={handleUseDraft} className="px-3 py-2 rounded-xl bg-brand-primary text-white text-xs font-bold">Usar no editor</button>
              </div>
            </div>
          ) : (
            <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-brand-primary/15 bg-brand-primary/[0.03] text-brand-primary text-xs font-semibold">
              {aiLoading ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
              <span>{aiLoading ? 'Gerando sugestão de resposta...' : 'Preparando sugestão de resposta...'}</span>
              {!aiLoading && aiError && (
                <button type="button" onClick={handleRegenerateDraft} className="ml-2 font-bold hover:underline">Tentar novamente</button>
              )}
            </div>
          )}
        </div>
      )}

      <div className="h-[360px] shrink-0 overflow-y-auto bg-brand-bg/40 border border-brand-border rounded-3xl p-5 space-y-4 flex flex-col shadow-inner sm:h-[400px] lg:h-[440px]">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center text-brand-text-muted text-xs p-8">Nenhuma mensagem registrada. Inicie a conversa digitando no campo abaixo.</div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              const isSelf = isAdmin ? msg.senderRole === 'admin' : msg.senderId === user?.id;
              const isAiMessage = msg.origin === 'support_ai';
              const senderDisplayName = isAiMessage
                ? (msg.senderLabel || 'Assistente de suporte')
                : (!isAdmin && msg.senderRole === 'admin')
                  ? 'Suporte - Evolução Clínica'
                  : (msg.senderName || (msg.senderRole === 'admin' ? 'Suporte - Evolução Clínica' : 'Profissional'));
              return (
                <div key={msg.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-1.5 px-1.5 mb-1">
                    <span className="text-[10px] font-bold text-brand-text-muted">
                      {senderDisplayName}{' '}
                      {isAiMessage ? (
                        <span className="text-[9px] bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded border border-emerald-200 font-semibold">IA</span>
                      ) : msg.senderRole === 'admin' ? (
                        <span className="text-[9px] bg-brand-primary/10 text-brand-primary px-1 py-0.2 rounded border border-brand-primary/20 font-semibold">Equipe</span>
                      ) : null}
                    </span>
                    {isAdmin && msg.senderRole === 'admin' && editingMessageId !== msg.id && (
                      <div className="flex items-center gap-0.5">
                        <button type="button" onClick={() => handleStartEditMessage(msg)} disabled={messageMutationLoading} className="p-1 rounded-lg text-brand-text-muted hover:text-brand-primary hover:bg-brand-primary/5 transition-colors" title="Editar mensagem"><Pencil size={11} /></button>
                        <button type="button" onClick={() => handleDeleteMessage(msg)} disabled={messageMutationLoading} className="p-1 rounded-lg text-brand-text-muted hover:text-rose-600 hover:bg-rose-50 transition-colors" title="Excluir mensagem"><Trash2 size={11} /></button>
                      </div>
                    )}
                  </div>
                  {editingMessageId === msg.id ? (
                    <div className="w-full max-w-[90%] md:max-w-[78%] rounded-2xl border border-brand-primary/20 bg-white p-3 shadow-sm space-y-2">
                      <RichTextEditor value={editingMessageText} onChange={setEditingMessageText} disabled={messageMutationLoading} label="Editar mensagem" minHeight="8rem" resizable />
                      <div className="flex justify-end gap-2">
                        <button type="button" onClick={handleCancelEditMessage} disabled={messageMutationLoading} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-gray-200 text-gray-600 text-xs font-bold"><X size={12} />Cancelar</button>
                        <button type="button" onClick={() => handleSaveEditedMessage(msg.id)} disabled={messageMutationLoading || !editingMessageText.trim()} className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-brand-primary text-white text-xs font-bold disabled:opacity-50"><Check size={12} />Salvar</button>
                      </div>
                    </div>
                  ) : (
                    <div className={`p-3.5 rounded-2xl max-w-[80%] md:max-w-[70%] border shadow-sm ${isSelf ? 'bg-brand-primary text-white border-brand-primary rounded-br-none' : 'bg-white text-brand-text border-brand-border rounded-bl-none'}`}>
                      <RichTextPreview value={msg.message} className="text-sm leading-relaxed font-sans" />
                      {msg.attachmentUrl && (
                        <div className="mt-2.5">
                          {isImage(msg.attachmentUrl) ? <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-black/10"><img src={msg.attachmentUrl} alt={msg.attachmentName || 'Anexo'} className="max-h-48 w-full object-cover" /></a> : <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-3 py-2 rounded-xl border ${isSelf ? 'bg-white/10 text-white border-white/20' : 'bg-gray-50 text-brand-primary border-brand-border'}`}><FileText size={13} /><span className="truncate max-w-[120px] sm:max-w-[200px]">{msg.attachmentName || 'Anexo'}</span><Download size={12} /></a>}
                        </div>
                      )}
                    </div>
                  )}
                  <span className="text-[9px] text-brand-text-muted px-1.5 mt-1 block">{new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(msg.createdAt))}</span>
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      <div className="shrink-0 bg-white border border-brand-border rounded-3xl p-3 shadow-md">
        {ticket.status === 'closed' ? (
          <div className="bg-gray-50 p-4 text-center rounded-2xl border border-gray-100 text-xs text-brand-text-muted flex items-center justify-center space-x-2"><CheckCircle2 size={16} className="text-emerald-500" /><span>Este chamado está encerrado. Para mais dúvidas, por favor abra um novo ticket de suporte.</span></div>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="flex items-center space-x-2">
              <input type="file" ref={fileInputRef} onChange={handleFileChange} disabled={sending} className="hidden" />
              <button type="button" onClick={() => fileInputRef.current?.click()} disabled={sending} className="p-3 rounded-2xl hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-brand-primary transition-all shrink-0" title="Inserir imagem ou anexo"><Paperclip size={18} /></button>
              {isAdmin ? (
                <div className="min-w-0 flex-1"><RichTextEditor value={newMessage} onChange={setNewMessage} disabled={sending} label="Resposta" minHeight="11rem" resizable /></div>
              ) : (
                <textarea value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Digite sua mensagem..." disabled={sending} rows={1} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendMessage(e); } }} className="flex-1 px-4 py-3 rounded-2xl border border-brand-border focus:border-brand-primary outline-none text-sm resize-none max-h-20" />
              )}
              <button type="submit" disabled={sending || (!newMessage.trim() && !file)} className="bg-brand-primary hover:bg-brand-primary-hover disabled:bg-brand-primary/50 text-white p-3 rounded-2xl transition-all shadow-md flex items-center justify-center shrink-0">{sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}</button>
            </div>
            {file && (
              <div className="flex items-center space-x-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-2xl self-start max-w-xs"><span className="text-xs text-gray-700 truncate font-semibold">{file.name}</span><button type="button" onClick={() => setFile(null)} className="p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600"><X size={13} /></button></div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

function Loader2(props: any) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={props.size || '24'} height={props.size || '24'} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={props.className}><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
  );
}
