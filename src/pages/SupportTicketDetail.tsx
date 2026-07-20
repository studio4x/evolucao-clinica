import React, { useState, useEffect, useRef } from 'react';
import { useParams, Link, useNavigate, useLocation } from 'react-router-dom';
import { ArrowLeft, Send, Paperclip, X, LifeBuoy, Download, AlertCircle, FileText, CheckCircle2, ShieldAlert } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { showAlert, showConfirm } from '../store/modalStore';
import {
  fetchSupportTicketDetail,
  sendSupportMessage,
  updateSupportTicketStatus,
  setSupportTicketLastSeen,
  subscribeToSupportTicketDetail,
  SupportTicket,
  SupportMessage
} from '../services/support';
import TicketStatusBadge from '../components/support/TicketStatusBadge';
import TicketSlaBadge from '../components/support/TicketSlaBadge';

export default function SupportTicketDetail() {
  const { ticketId: routeTicketId } = useParams<{ ticketId: string }>();
  const location = useLocation();
  const { user, profileRole } = useAuthStore();
  const navigate = useNavigate();

  const pathnameTicketId = location.pathname.match(/^\/(?:admin|painel)\/support\/([^/]+)$/)?.[1] ?? null;
  const ticketId = routeTicketId ?? pathnameTicketId;

  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [newMessage, setNewMessage] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [sending, setSending] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    const refreshTicketDetail = () => {
      loadTicketDetail(true);
    };
    const unsubscribe = subscribeToSupportTicketDetail(ticketId, refreshTicketDetail);
    const pollInterval = window.setInterval(refreshTicketDetail, 5000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        refreshTicketDetail();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      unsubscribe();
      window.clearInterval(pollInterval);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [ticketId]);

  useEffect(() => {
    // Scroll to bottom when messages load or change
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

      // Reload ticket status changes in background (if trigger changed ticket status to in_progress)
      loadTicketDetail(true);
    } catch (err: any) {
      console.error('Error sending message:', err);
      setError(err.message || 'Não foi possível enviar a mensagem.');
    } finally {
      setSending(false);
    }
  };

  const handleCloseTicket = async () => {
    if (!ticketId) return;
    const confirmed = await showConfirm('Tem certeza de que deseja encerrar este chamado de suporte?', {
      title: "Encerrar Chamado",
      confirmLabel: "Encerrar",
      cancelLabel: "Voltar",
      variant: "warning",
      icon: "question"
    });
    if (!confirmed) return;

    try {
      setActionLoading(true);
      await updateSupportTicketStatus(ticketId, 'closed');
      await loadTicketDetail(true);
    } catch (err: any) {
      console.error('Error closing ticket:', err);
      setError('Não foi possível encerrar o chamado.');
    } finally {
      setActionLoading(false);
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
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="animate-spin text-brand-primary" size={32} />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="card p-8 text-center max-w-md mx-auto mt-8 bg-white border border-brand-border rounded-3xl">
        <AlertCircle className="text-rose-500 mx-auto mb-3" size={36} />
        <h4 className="font-bold text-brand-text">Erro ao abrir chamado</h4>
        <p className="text-xs text-brand-text-muted mt-2">{error || 'Chamado não encontrado.'}</p>
        <Link 
          to={profileRole === 'admin' ? '/admin' : '/painel/support'} 
          className="mt-6 inline-flex items-center justify-center bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold px-4 py-2 rounded-2xl transition-all"
        >
          Voltar para Lista
        </Link>
      </div>
    );
  }

  const isAdmin = profileRole === 'admin';

  return (
    <div className="flex flex-col h-[calc(100vh-140px)] md:h-[calc(100vh-80px)] space-y-4 pb-4">
      {/* Back Header */}
      <div className="flex items-center justify-between shrink-0">
        <div className="flex items-center space-x-3">
          <Link
            to={isAdmin ? '/admin/support' : '/painel/support'}
            className="p-2 rounded-2xl hover:bg-white text-brand-text-muted hover:text-brand-text border border-transparent hover:border-brand-border bg-white/40 backdrop-blur-sm transition-all"
          >
            <ArrowLeft size={18} />
          </Link>
          <div>
            <span className="text-xs text-brand-text-muted block">Voltar para chamados</span>
            <h2 className="text-lg font-bold text-brand-text font-display truncate max-w-[200px] sm:max-w-xs md:max-w-md">
              {ticket.subject}
            </h2>
          </div>
        </div>

        {ticket.status !== 'closed' && (
          <button
            onClick={handleCloseTicket}
            disabled={actionLoading}
            className="border border-rose-200 hover:border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold px-4 py-2 rounded-2xl text-xs flex items-center space-x-1.5 transition-all"
          >
            <CheckCircle2 size={14} />
            <span>Encerrar Chamado</span>
          </button>
        )}
      </div>

      {/* Ticket Details Panel */}
      <div className="card p-5 bg-white border border-brand-border rounded-3xl shrink-0 flex flex-col md:flex-row justify-between md:items-center gap-4 shadow-sm">
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium bg-gray-50 border border-gray-200 text-gray-700 px-2.5 py-1 rounded-full">
              {getCategoryLabel(ticket.category)}
            </span>
            <TicketStatusBadge status={ticket.status} />
            <TicketSlaBadge status={ticket.slaStatus} />

            {/* Admin visual info for creator's plan */}
            {isAdmin && (
              <span className={`text-xs px-2.5 py-1 rounded-full border font-bold flex items-center ${
                ticket.userPlan === 'yearly'
                  ? 'bg-amber-50 text-amber-800 border-amber-200 shadow-sm'
                  : ticket.userPlan === 'monthly'
                    ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                    : 'bg-gray-50 text-gray-800 border-gray-200'
              }`}>
                {ticket.userPlan === 'yearly' ? '👑 VIP Anual' : ticket.userPlan === 'monthly' ? '💼 Mensal' : '🌱 Trial'}
              </span>
            )}
          </div>
          
          <div className="text-xs text-brand-text-muted leading-relaxed">
            <strong>Cliente:</strong> {ticket.userFullName || 'Profissional'} ({ticket.userPlan === 'yearly' ? 'Anual' : ticket.userPlan === 'monthly' ? 'Mensal' : 'Avaliação'})
            <span className="mx-2">•</span>
            <strong>Criado em:</strong> {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(ticket.createdAt))}
          </div>

          <div className="text-sm bg-gray-50 border border-gray-100 p-4 rounded-2xl text-brand-text/90 italic font-sans leading-relaxed">
            {ticket.description}
          </div>

          {/* Ticket original attachment */}
          {ticket.attachmentUrl && (
            <div className="mt-2.5 flex items-center">
              <a
                href={ticket.attachmentUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-2 bg-brand-primary/5 hover:bg-brand-primary/10 text-brand-primary text-xs font-semibold px-3 py-1.5 rounded-xl border border-brand-primary/15 transition-all"
              >
                {isImage(ticket.attachmentUrl) ? <Paperclip size={12} /> : <FileText size={12} />}
                <span className="truncate max-w-[150px] sm:max-w-xs">{ticket.attachmentName || 'Ver anexo do chamado'}</span>
                <Download size={12} className="ml-1" />
              </a>
            </div>
          )}
        </div>
      </div>

      {/* Messages Chat Area */}
      <div className="flex-1 overflow-y-auto bg-brand-bg/40 border border-brand-border rounded-3xl p-5 space-y-4 min-h-0 flex flex-col shadow-inner">
        {messages.length === 0 ? (
          <div className="flex-1 flex items-center justify-center text-center text-brand-text-muted text-xs p-8">
            Nenhuma mensagem registrada. Inicie a conversa digitando no campo abaixo.
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((msg) => {
              // Message ownership mapping:
              // For therapist: msg.senderId === user.id is self, msg.senderRole === 'admin' is support
              // For admin: msg.senderRole === 'admin' is self (or colleague), msg.senderId !== user.id (which is normal therapist) is customer
              let isSelf = false;
              if (isAdmin) {
                isSelf = msg.senderRole === 'admin';
              } else {
                isSelf = msg.senderId === user?.id;
              }

              return (
                <div key={msg.id} className={`flex flex-col ${isSelf ? 'items-end' : 'items-start'}`}>
                  {/* Sender Name label */}
                  <span className="text-[10px] font-bold text-brand-text-muted px-1.5 mb-1 block">
                    {msg.senderName || 'Suporte'} {msg.senderRole === 'admin' && <span className="text-[9px] bg-brand-primary/10 text-brand-primary px-1 py-0.2 rounded border border-brand-primary/20 font-semibold">Equipe</span>}
                  </span>

                  {/* Message Bubble */}
                  <div className={`p-3.5 rounded-2xl max-w-[80%] md:max-w-[70%] border shadow-sm ${
                    isSelf 
                      ? 'bg-brand-primary text-white border-brand-primary rounded-br-none'
                      : 'bg-white text-brand-text border-brand-border rounded-bl-none'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap font-sans">{msg.message}</p>

                    {/* Message attachment */}
                    {msg.attachmentUrl && (
                      <div className="mt-2.5">
                        {isImage(msg.attachmentUrl) ? (
                          <a href={msg.attachmentUrl} target="_blank" rel="noreferrer" className="block rounded-lg overflow-hidden border border-black/10">
                            <img 
                              src={msg.attachmentUrl} 
                              alt={msg.attachmentName || 'Anexo'} 
                              className="max-h-48 w-full object-cover hover:scale-102 transition-transform duration-200" 
                            />
                          </a>
                        ) : (
                          <a
                            href={msg.attachmentUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`inline-flex items-center space-x-1.5 text-xs font-semibold px-3 py-2 rounded-xl border ${
                              isSelf
                                ? 'bg-white/10 text-white border-white/20 hover:bg-white/15'
                                : 'bg-gray-50 text-brand-primary border-brand-border hover:bg-gray-100'
                            } transition-all`}
                          >
                            <FileText size={13} />
                            <span className="truncate max-w-[120px] sm:max-w-[200px]">{msg.attachmentName || 'Anexo'}</span>
                            <Download size={12} className="ml-1" />
                          </a>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Message Timestamp */}
                  <span className="text-[9px] text-brand-text-muted px-1.5 mt-1 block">
                    {new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(msg.createdAt))}
                  </span>
                </div>
              );
            })}
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Message Form */}
      <div className="shrink-0 bg-white border border-brand-border rounded-3xl p-3 shadow-md">
        {ticket.status === 'closed' ? (
          <div className="bg-gray-50 p-4 text-center rounded-2xl border border-gray-100 text-xs text-brand-text-muted flex items-center justify-center space-x-2">
            <CheckCircle2 size={16} className="text-emerald-500" />
            <span>Este chamado está encerrado. Para mais dúvidas, por favor abra um novo ticket de suporte.</span>
          </div>
        ) : (
          <form onSubmit={handleSendMessage} className="space-y-2">
            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                disabled={sending}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={sending}
                className="p-3 rounded-2xl hover:bg-gray-100 border border-gray-200 text-gray-500 hover:text-brand-primary transition-all shrink-0"
                title="Inserir imagem ou anexo"
              >
                <Paperclip size={18} />
              </button>

              <textarea
                value={newMessage}
                onChange={(e) => setNewMessage(e.target.value)}
                placeholder={isAdmin ? "Escreva uma resposta de suporte..." : "Digite sua mensagem..."}
                disabled={sending}
                rows={1}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    handleSendMessage(e);
                  }
                }}
                className="flex-1 px-4 py-3 rounded-2xl border border-brand-border focus:border-brand-primary outline-none text-sm resize-none max-h-20"
              />

              <button
                type="submit"
                disabled={sending || (!newMessage.trim() && !file)}
                className="bg-brand-primary hover:bg-brand-primary-hover disabled:bg-brand-primary/50 text-white p-3 rounded-2xl transition-all shadow-md flex items-center justify-center shrink-0"
              >
                {sending ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
              </button>
            </div>

            {/* Selected File indicator */}
            {file && (
              <div className="flex items-center space-x-1.5 bg-gray-50 border border-gray-200 px-3 py-1.5 rounded-2xl self-start max-w-xs">
                <span className="text-xs text-gray-700 truncate font-semibold">{file.name}</span>
                <button
                  type="button"
                  onClick={() => setFile(null)}
                  className="p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                >
                  <X size={13} />
                </button>
              </div>
            )}
          </form>
        )}
      </div>
    </div>
  );
}

// Simple loader helper
function Loader2(props: any) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={props.size || "24"}
      height={props.size || "24"}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={props.className}
    >
      <path d="M21 12a9 9 0 1 1-6.219-8.56" />
    </svg>
  );
}
