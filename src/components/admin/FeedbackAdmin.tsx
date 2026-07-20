import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { showAlert, showConfirm } from '../../store/modalStore';
import { 
  Search, Star, Trash2, Edit, MessageSquare, AlertTriangle, 
  CheckCircle2, HelpCircle, Loader2, X, RefreshCw, Filter, Calendar
} from 'lucide-react';

interface FeedbackItem {
  id: string;
  user_id: string | null;
  user_name: string | null;
  user_email: string | null;
  rating: number;
  category: 'suggestion' | 'bug' | 'new_feature' | 'other';
  message: string;
  status: 'new' | 'reviewed' | 'in_progress' | 'implemented' | 'rejected';
  admin_notes: string | null;
  created_at: string;
}

export default function FeedbackAdmin() {
  const [feedbacks, setFeedbacks] = useState<FeedbackItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  
  // Filtros
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');

  // Modal / Edição
  const [selectedFeedback, setSelectedFeedback] = useState<FeedbackItem | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<FeedbackItem['status']>('new');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchFeedbacks = async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const { data, error } = await supabase
        .from('app_feedback')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setFeedbacks(data || []);
    } catch (err) {
      console.error('Erro ao buscar feedbacks:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchFeedbacks();
  }, []);

  const handleOpenDetails = (feedback: FeedbackItem) => {
    setSelectedFeedback(feedback);
    setAdminNotes(feedback.admin_notes || '');
    setSelectedStatus(feedback.status);
  };

  const handleSaveChanges = async () => {
    if (!selectedFeedback) return;
    setSaving(true);

    try {
      const { error } = await supabase
        .from('app_feedback')
        .update({
          status: selectedStatus,
          admin_notes: adminNotes.trim() || null
        })
        .eq('id', selectedFeedback.id);

      if (error) throw error;

      // Atualiza localmente
      setFeedbacks((prev) =>
        prev.map((f) =>
          f.id === selectedFeedback.id
            ? { ...f, status: selectedStatus, admin_notes: adminNotes.trim() || null }
            : f
        )
      );

      setSelectedFeedback(null);
    } catch (err) {
      console.error('Erro ao atualizar feedback:', err);
      await showAlert('Ocorreu um erro ao salvar as alterações.', {
        title: "Erro ao Atualizar",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteFeedback = async (id: string) => {
    const confirmed = await showConfirm('Tem certeza que deseja excluir esta sugestão permanentemente?', {
      title: "Excluir Sugestão",
      confirmLabel: "Excluir",
      cancelLabel: "Cancelar",
      variant: "danger",
      icon: "trash"
    });
    if (!confirmed) return;
    setDeletingId(id);

    try {
      const { error } = await supabase
        .from('app_feedback')
        .delete()
        .eq('id', id);

      if (error) throw error;

      setFeedbacks((prev) => prev.filter((f) => f.id !== id));
      if (selectedFeedback?.id === id) {
        setSelectedFeedback(null);
      }
    } catch (err) {
      console.error('Erro ao deletar feedback:', err);
      await showAlert('Não foi possível excluir o feedback.', {
        title: "Erro ao Excluir",
        variant: "danger",
        icon: "warning"
      });
    } finally {
      setDeletingId(null);
    }
  };

  // Filtros aplicados em memória
  const filteredFeedbacks = feedbacks.filter((item) => {
    const matchesSearch = 
      (item.user_name?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (item.user_email?.toLowerCase().includes(searchTerm.toLowerCase()) || false) ||
      (item.message.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || item.status === statusFilter;
    const matchesCategory = categoryFilter === 'all' || item.category === categoryFilter;

    return matchesSearch && matchesStatus && matchesCategory;
  });

  const getCategoryBadge = (category: FeedbackItem['category']) => {
    const styles: Record<FeedbackItem['category'], string> = {
      suggestion: 'bg-blue-50 text-blue-700 border-blue-150',
      new_feature: 'bg-amber-50 text-amber-700 border-amber-150',
      bug: 'bg-red-50 text-red-700 border-red-150',
      other: 'bg-gray-50 text-gray-700 border-gray-150'
    };
    const labels: Record<FeedbackItem['category'], string> = {
      suggestion: 'Sugestão',
      new_feature: 'Nova Função',
      bug: 'Bug / Erro',
      other: 'Outro'
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${styles[category]}`}>
        {labels[category]}
      </span>
    );
  };

  const getStatusBadge = (status: FeedbackItem['status']) => {
    const styles: Record<FeedbackItem['status'], string> = {
      new: 'bg-blue-50 text-blue-700 border-blue-200',
      reviewed: 'bg-gray-50 text-gray-700 border-gray-200',
      in_progress: 'bg-purple-50 text-purple-700 border-purple-200',
      implemented: 'bg-green-50 text-green-700 border-green-200',
      rejected: 'bg-red-50 text-red-700 border-red-200'
    };
    const labels: Record<FeedbackItem['status'], string> = {
      new: 'Novo',
      reviewed: 'Revisado',
      in_progress: 'Em Análise',
      implemented: 'Implementado',
      rejected: 'Arquivado/Rejeitado'
    };
    return (
      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-xl font-bold font-display text-brand-primary">Sugestões & Avaliações</h2>
          <p className="text-sm text-gray-500">Gerencie os feedbacks enviados pelos usuários da plataforma.</p>
        </div>
        <button
          onClick={() => fetchFeedbacks(true)}
          disabled={loading || refreshing}
          className="flex items-center space-x-1.5 px-3 py-1.5 border border-gray-200 text-gray-600 rounded-xl hover:bg-gray-50 font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* Barra de Filtros */}
      <div className="bg-white border border-gray-150 rounded-2xl p-4 shadow-sm flex flex-col md:flex-row gap-3 items-center">
        {/* Busca */}
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 w-4 h-4" />
          <input
            type="text"
            placeholder="Buscar por usuário, e-mail ou conteúdo da mensagem..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full text-xs pl-9 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-primary"
          />
        </div>

        {/* Categoria */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <Filter className="text-gray-400 w-3.5 h-3.5 shrink-0" />
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-xl p-2 bg-white focus:outline-none focus:border-brand-primary w-full"
          >
            <option value="all">Todas Categorias</option>
            <option value="suggestion">Sugestão</option>
            <option value="new_feature">Nova Função</option>
            <option value="bug">Bug / Erro</option>
            <option value="other">Outro</option>
          </select>
        </div>

        {/* Status */}
        <div className="flex items-center space-x-2 w-full md:w-auto">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-200 rounded-xl p-2 bg-white focus:outline-none focus:border-brand-primary w-full"
          >
            <option value="all">Todos os Status</option>
            <option value="new">Novo</option>
            <option value="reviewed">Revisado</option>
            <option value="in_progress">Em Análise</option>
            <option value="implemented">Implementado</option>
            <option value="rejected">Arquivado</option>
          </select>
        </div>
      </div>

      {/* Listagem */}
      {loading ? (
        <div className="text-center py-20 bg-white border border-gray-150 rounded-2xl">
          <Loader2 className="w-10 h-10 animate-spin text-brand-primary mx-auto" />
          <p className="text-sm text-gray-500 mt-2">Carregando feedbacks...</p>
        </div>
      ) : filteredFeedbacks.length === 0 ? (
        <div className="text-center py-20 bg-white border border-gray-150 rounded-2xl space-y-2">
          <MessageSquare className="w-12 h-12 text-gray-300 mx-auto" />
          <h3 className="text-base font-bold text-gray-700">Nenhum feedback encontrado</h3>
          <p className="text-sm text-gray-500">Tente ajustar os filtros ou aguarde novos envios.</p>
        </div>
      ) : (
        <div className="bg-white border border-gray-150 rounded-2xl shadow-sm overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-4">Data / Usuário</th>
                <th className="px-6 py-4 text-center">Nota</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Mensagem</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-xs">
              {filteredFeedbacks.map((item) => (
                <tr key={item.id} className="hover:bg-gray-50/50 transition-colors">
                  {/* Data & Usuário */}
                  <td className="px-6 py-4 space-y-1">
                    <span className="flex items-center text-gray-400 text-[10px]">
                      <Calendar className="w-3 h-3 mr-1" />
                      {formatDate(item.created_at)}
                    </span>
                    <div className="font-semibold text-gray-800">{item.user_name || 'Anônimo'}</div>
                    {item.user_email && <div className="text-[10px] text-gray-500">{item.user_email}</div>}
                  </td>

                  {/* Nota / Estrelas */}
                  <td className="px-6 py-4">
                    <div className="flex justify-center items-center space-x-0.5">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`w-3.5 h-3.5 ${
                            star <= item.rating
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-gray-200'
                          }`}
                        />
                      ))}
                    </div>
                  </td>

                  {/* Categoria */}
                  <td className="px-6 py-4">{getCategoryBadge(item.category)}</td>

                  {/* Mensagem resumida */}
                  <td className="px-6 py-4 max-w-xs">
                    <p className="truncate text-gray-600 leading-relaxed" title={item.message}>
                      {item.message}
                    </p>
                    {item.admin_notes && (
                      <p className="text-[10px] text-brand-primary font-medium mt-1 truncate bg-brand-primary/5 px-2 py-0.5 rounded border border-brand-primary/10 max-w-[200px]">
                        Nota: {item.admin_notes}
                      </p>
                    )}
                  </td>

                  {/* Status */}
                  <td className="px-6 py-4">{getStatusBadge(item.status)}</td>

                  {/* Ações */}
                  <td className="px-6 py-4 text-right">
                    <div className="flex justify-end space-x-2">
                      <button
                        onClick={() => handleOpenDetails(item)}
                        className="p-1.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                        title="Ver Detalhes / Alterar Status"
                      >
                        <Edit className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteFeedback(item.id)}
                        disabled={deletingId === item.id}
                        className="p-1.5 border border-red-100 text-red-500 rounded-lg hover:bg-red-50 transition-colors cursor-pointer disabled:opacity-50"
                        title="Excluir"
                      >
                        {deletingId === item.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal de Detalhes / Edição */}
      {selectedFeedback && (
        <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-[90] animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl border border-gray-100 shadow-2xl max-w-lg w-full p-6 space-y-5 animate-in zoom-in-95 duration-200">
            {/* Cabeçalho */}
            <div className="flex justify-between items-center border-b border-gray-100 pb-3">
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-800 font-display">Detalhes da Sugestão</h3>
                <span className="text-[10px] text-gray-400 block">ID: {selectedFeedback.id}</span>
              </div>
              <button
                onClick={() => setSelectedFeedback(null)}
                className="text-gray-400 hover:text-gray-600 transition-colors p-1 rounded-full hover:bg-gray-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Informações do Remetente */}
            <div className="grid grid-cols-2 gap-4 bg-gray-50 p-3 rounded-2xl border border-gray-100 text-xs">
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Usuário</span>
                <div className="font-semibold text-gray-800">{selectedFeedback.user_name || 'Anônimo'}</div>
                {selectedFeedback.user_email && <div className="text-[10px] text-gray-500">{selectedFeedback.user_email}</div>}
              </div>
              <div className="space-y-1">
                <span className="text-[10px] font-bold text-gray-400 uppercase">Metadados</span>
                <div className="flex items-center space-x-2 mt-0.5">
                  {getCategoryBadge(selectedFeedback.category)}
                  <div className="flex items-center text-amber-400 font-bold text-[11px]">
                    <Star className="w-3.5 h-3.5 fill-amber-400 mr-0.5" />
                    {selectedFeedback.rating}/5
                  </div>
                </div>
                <div className="text-[10px] text-gray-400 mt-1">{formatDate(selectedFeedback.created_at)}</div>
              </div>
            </div>

            {/* Conteúdo da Mensagem */}
            <div className="space-y-1">
              <span className="text-[10px] font-bold text-gray-400 uppercase">Mensagem Enviada</span>
              <div className="p-3 bg-gray-50/50 border border-gray-150 rounded-2xl text-xs text-gray-700 leading-relaxed max-h-[150px] overflow-y-auto whitespace-pre-wrap">
                {selectedFeedback.message}
              </div>
            </div>

            {/* Edição de Status e Notas */}
            <div className="space-y-4 pt-2 border-t border-gray-100">
              {/* Status */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-600 uppercase">Alterar Status Administrativo</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'new', label: 'Novo' },
                    { id: 'in_progress', label: 'Em Análise' },
                    { id: 'implemented', label: 'Implementado' },
                    { id: 'reviewed', label: 'Revisado' },
                    { id: 'rejected', label: 'Arquivar' }
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedStatus(item.id as any)}
                      className={`py-1.5 px-2 text-[10px] font-bold rounded-xl border transition-all cursor-pointer text-center ${
                        selectedStatus === item.id
                          ? 'bg-brand-primary border-brand-primary text-white shadow-sm'
                          : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Notas do Admin */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold text-gray-600 uppercase">Notas Internas do Admin</label>
                <textarea
                  rows={3}
                  value={adminNotes}
                  onChange={(e) => setAdminNotes(e.target.value)}
                  placeholder="Escreva aqui anotações internas (ex: 'Bug corrigido na v1.11', 'Implementado na aba de planos')..."
                  className="w-full text-xs p-2.5 rounded-xl border border-gray-200 focus:outline-none focus:border-brand-primary resize-none bg-white"
                />
              </div>
            </div>

            {/* Rodapé do Modal */}
            <div className="flex justify-between items-center pt-3 border-t border-gray-100 gap-3">
              <button
                onClick={() => setSelectedFeedback(null)}
                className="px-5 py-2.5 border border-gray-200 text-gray-500 rounded-xl font-semibold text-xs hover:bg-gray-50 transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleSaveChanges}
                disabled={saving}
                className="bg-brand-primary text-white px-6 py-2.5 rounded-xl font-bold text-xs hover:opacity-90 active:scale-98 transition-all flex items-center justify-center space-x-1.5 shadow-md disabled:opacity-50 cursor-pointer"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <>
                    <span>Salvar Alterações</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
