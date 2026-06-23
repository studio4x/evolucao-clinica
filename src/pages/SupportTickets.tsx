import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { LifeBuoy, PlusCircle, MessageSquare, ArrowRight, Clock, HelpCircle } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { fetchMySupportTickets, SupportTicket } from '../services/support';
import TicketStatusBadge from '../components/support/TicketStatusBadge';
import TicketSlaBadge from '../components/support/TicketSlaBadge';
import SupportTicketModal from '../components/support/SupportTicketModal';

export default function SupportTickets() {
  const { subscriptionPlan } = useAuthStore();
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);

  const loadTickets = async () => {
    try {
      setLoading(true);
      setError('');
      const data = await fetchMySupportTickets();
      setTickets(data);
    } catch (err: any) {
      console.error('Error loading tickets:', err);
      setError('Não foi possível carregar o histórico de chamados.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadTickets();
  }, []);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return 'Não definido';
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(dateStr));
  };

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'payment': return 'Pagamento & Cobrança';
      case 'technical': return 'Problema Técnico';
      case 'account': return 'Conta & Acesso';
      default: return 'Dúvida Geral';
    }
  };

  // Dynamic SLA Box depending on the user's plan
  let slaInfoCard = (
    <div className="card p-6 bg-white border border-brand-border rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
      <div className="flex items-start space-x-3.5">
        <div className="p-3 bg-gray-50 text-gray-500 rounded-2xl border border-gray-100">
          <Clock size={22} />
        </div>
        <div>
          <h4 className="text-sm font-bold text-brand-text">Garantia de Atendimento (SLA)</h4>
          <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
            Tempo estimado para a primeira resposta humana da equipe.
          </p>
          <p className="text-xs font-semibold text-brand-text mt-2">
            Avaliação (Trial): até 48 horas úteis (Seg a Sex, 08h às 18h).
          </p>
        </div>
      </div>
      <div className="shrink-0 bg-gray-50 text-gray-600 px-3.5 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider text-center border border-gray-100">
        Suporte Padrão
      </div>
    </div>
  );

  if (subscriptionPlan === 'yearly') {
    slaInfoCard = (
      <div className="card p-6 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-white border border-amber-500/20 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4 relative overflow-hidden shadow-sm">
        <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-br from-amber-400/10 to-transparent rounded-full blur-2xl pointer-events-none" />
        <div className="flex items-start space-x-3.5 relative z-10">
          <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-2xl shadow-md shadow-orange-500/10">
            <Clock size={22} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-amber-900 flex items-center">
              <span>Garantia de Suporte VIP Ativa</span>
              <span className="ml-2 text-xs bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold border border-amber-200">Anual</span>
            </h4>
            <p className="text-xs text-amber-800/80 mt-1 leading-relaxed">
              Sua assinatura anual lhe concede prioridade máxima na fila de atendimento!
            </p>
            <p className="text-xs font-bold text-amber-900 mt-2">
              Prazo VIP: Primeira resposta em até 2 horas úteis (Seg a Sex, 08h às 18h).
            </p>
          </div>
        </div>
        <div className="shrink-0 bg-gradient-to-r from-amber-500 to-orange-500 text-white px-4 py-2 rounded-2xl text-xs font-bold uppercase tracking-wider text-center shadow-sm">
          🏆 Atendimento VIP 2h
        </div>
      </div>
    );
  } else if (subscriptionPlan === 'monthly') {
    slaInfoCard = (
      <div className="card p-6 bg-emerald-50/50 border border-emerald-500/10 rounded-3xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start space-x-3.5">
          <div className="p-3 bg-emerald-50 text-emerald-600 rounded-2xl border border-emerald-100">
            <Clock size={22} />
          </div>
          <div>
            <h4 className="text-sm font-bold text-brand-text flex items-center">
              <span>Garantia de Suporte Ativa</span>
              <span className="ml-2 text-xs bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">Mensal</span>
            </h4>
            <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
              Sua assinatura mensal garante respostas humanas ágeis da nossa equipe.
            </p>
            <p className="text-xs font-semibold text-brand-text mt-2">
              Prazos: até 12 horas úteis para Pagamentos · até 24 horas úteis para outros assuntos.
            </p>
          </div>
        </div>
        <div className="shrink-0 bg-emerald-100 text-emerald-800 px-4 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider text-center border border-emerald-200">
          Suporte Mensal
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-brand-text flex items-center">
            <LifeBuoy className="text-brand-primary mr-3 shrink-0" size={32} />
            <span>Suporte & Ajuda</span>
          </h2>
          <p className="text-brand-text-muted text-sm mt-1">
            Abra chamados para tirar dúvidas, reportar problemas e falar com nossa equipe.
          </p>
        </div>

        <button
          onClick={() => setIsModalOpen(true)}
          className="bg-brand-primary hover:bg-brand-primary-hover text-white py-3 px-6 rounded-2xl font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2 shrink-0 self-start sm:self-auto"
        >
          <PlusCircle size={18} />
          <span>Novo Chamado</span>
        </button>
      </div>

      {slaInfoCard}

      {/* Tickets List */}
      <div className="card shadow-md overflow-hidden bg-white border border-brand-border rounded-3xl">
        <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between">
          <h3 className="font-bold text-brand-text">Histórico de Chamados</h3>
          <span className="bg-gray-50 text-gray-500 px-3 py-1 rounded-full text-xs font-semibold border border-gray-100">
            {tickets.length} {tickets.length === 1 ? 'chamado' : 'chamados'}
          </span>
        </div>

        {loading ? (
          <div className="p-12 text-center text-brand-text-muted text-sm">
            <Loader2 className="animate-spin text-brand-primary mx-auto mb-3" size={24} />
            Carregando chamados...
          </div>
        ) : error ? (
          <div className="p-12 text-center text-rose-500 text-sm">{error}</div>
        ) : tickets.length === 0 ? (
          <div className="p-12 text-center max-w-sm mx-auto">
            <div className="p-4 bg-brand-primary/5 text-brand-primary w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
              <MessageSquare size={26} />
            </div>
            <h4 className="font-bold text-brand-text text-base">Nenhum chamado aberto</h4>
            <p className="text-xs text-brand-text-muted mt-2 leading-relaxed">
              Você ainda não criou nenhum ticket de suporte. Clique em "Novo Chamado" para iniciar um contato.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-brand-bg text-brand-text font-semibold text-xs border-b border-brand-border">
                  <th className="px-6 py-4">Assunto / Data</th>
                  <th className="px-6 py-4">Categoria</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4">SLA</th>
                  <th className="px-6 py-4">Prazo Limite</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-border">
                {tickets.map((ticket) => (
                  <tr 
                    key={ticket.id} 
                    className={`hover:bg-brand-bg/30 transition-colors ${
                      ticket.priority === 'high' || ticket.priority === 'urgent' ? 'bg-amber-500/[0.01]' : ''
                    }`}
                  >
                    <td className="px-6 py-5">
                      <div className="font-bold text-brand-text">{ticket.subject}</div>
                      <div className="text-xs text-brand-text-muted mt-1">
                        Aberto em {formatDateTime(ticket.createdAt)}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <span className="text-xs bg-gray-50 border border-gray-200 text-gray-700 px-3 py-1.5 rounded-full font-medium">
                        {getCategoryLabel(ticket.category)}
                      </span>
                    </td>
                    <td className="px-6 py-5">
                      <TicketStatusBadge status={ticket.status} />
                    </td>
                    <td className="px-6 py-5">
                      <TicketSlaBadge status={ticket.slaStatus} />
                    </td>
                    <td className="px-6 py-5 text-xs text-brand-text-muted">
                      {ticket.firstResponseAt ? (
                        <span className="text-emerald-600 font-medium">
                          Respondido em: {formatDateTime(ticket.firstResponseAt)}
                        </span>
                      ) : (
                        <span>
                          Limite: {formatDateTime(ticket.firstResponseDueAt)}
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <Link
                        to={`/painel/support/${ticket.id}`}
                        className="inline-flex items-center text-xs font-bold text-brand-primary hover:text-brand-primary-hover group"
                      >
                        <span>Acessar conversa</span>
                        <ArrowRight size={14} className="ml-1 group-hover:translate-x-0.5 transition-transform" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <SupportTicketModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSuccess={loadTickets}
      />
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
