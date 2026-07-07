import React, { useState, useEffect } from 'react';
import { Database, Search, FileText, Download, CheckCircle2, AlertCircle, Loader2, MessageSquare, HelpCircle, RefreshCw } from 'lucide-react';
import { fetchAdminMigrationRequests, updateMigrationRequestStatus, getMigrationAttachmentUrl, MigrationRequest } from '../../services/migration';

export default function MigrationRequestsAdmin() {
  const [requests, setRequests] = useState<MigrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Filtering & Search
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Selected request for editing
  const [selectedRequest, setSelectedRequest] = useState<MigrationRequest | null>(null);
  const [adminNotes, setAdminNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const loadRequests = async (showLoading = true) => {
    try {
      if (showLoading) setLoading(true);
      setError('');
      const data = await fetchAdminMigrationRequests();
      setRequests(data);
    } catch (err: any) {
      console.error('Error fetching admin migrations:', err);
      setError('Não foi possível carregar as solicitações de migração.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    loadRequests(true);
  }, []);

  const handleSelectRequest = (req: MigrationRequest) => {
    setSelectedRequest(req);
    setAdminNotes(req.adminNotes || '');
    setSuccess('');
    setError('');
  };

  const handleUpdateStatus = async (status: 'pending' | 'in_progress' | 'completed' | 'cancelled') => {
    if (!selectedRequest) return;
    try {
      setSaving(true);
      setError('');
      setSuccess('');

      const updated = await updateMigrationRequestStatus(selectedRequest.id, status, adminNotes);
      
      setSuccess(`Solicitação atualizada com sucesso para "${getStatusLabel(status)}"!`);
      setSelectedRequest(updated);
      
      // Reload list
      await loadRequests(false);
    } catch (err: any) {
      console.error('Error updating migration request:', err);
      setError('Erro ao salvar as alterações.');
    } finally {
      setSaving(false);
    }
  };

  const handleDownloadAttachment = async (request: MigrationRequest) => {
    if (!request.attachmentUrl) return;
    try {
      const url = await getMigrationAttachmentUrl(request.attachmentUrl);
      if (url) {
        window.open(url, '_blank');
      } else {
        alert('Não foi possível gerar a URL do anexo.');
      }
    } catch (err) {
      console.error('Error getting attachment url:', err);
      alert('Erro ao tentar fazer o download.');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'pending':
        return 'bg-amber-50 border border-amber-200 text-amber-700';
      case 'in_progress':
        return 'bg-blue-50 border border-blue-200 text-blue-700';
      case 'completed':
        return 'bg-emerald-50 border border-emerald-200 text-emerald-700';
      case 'cancelled':
        return 'bg-rose-50 border border-rose-200 text-rose-700';
      default:
        return 'bg-gray-50 border border-gray-200 text-gray-700';
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'in_progress': return 'Em Andamento';
      case 'completed': return 'Concluído';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  const getPlatformLabel = (platform: string, otherName: string | null) => {
    switch (platform) {
      case 'excel_word': return 'Excel / Word';
      case 'paper': return 'Papel (Fichas Digitadas ou Fotos)';
      case 'psicomanager': return 'PsicoManager';
      case 'clinis': return 'Clinis';
      case 'other_software': return `Outro (${otherName || 'Não Informado'})`;
      default: return platform;
    }
  };

  const formatDateTime = (dateStr: string) => {
    return new Intl.DateTimeFormat('pt-BR', {
      dateStyle: 'short',
      timeStyle: 'short',
    }).format(new Date(dateStr));
  };

  // Filter requests
  const filteredRequests = requests.filter((req) => {
    const matchesStatus = statusFilter === 'all' || req.status === statusFilter;
    const matchesSearch = 
      searchTerm === '' ||
      (req.professionalName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.professionalEmail || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.previousPlatform || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      (req.otherPlatformName || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div className="flex items-center space-x-3">
            <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
              <Database className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                Migrações VIP Concierge
              </h2>
              <p className="text-xs text-brand-text-muted mt-0.5">
                Gerencie solicitações de migração e importação de prontuários para profissionais do plano Anual.
              </p>
            </div>
          </div>

          <button
            onClick={() => loadRequests(true)}
            className="p-2.5 bg-white hover:bg-brand-bg border border-brand-border text-brand-text-muted hover:text-brand-text rounded-xl transition-all self-start md:self-center"
            title="Recarregar"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 bg-brand-bg/20 p-4 rounded-2xl border border-brand-border/30">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-brand-text-muted" size={16} />
            <input
              type="text"
              placeholder="Buscar por profissional ou plataforma..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full p-2.5 pl-10 bg-white border border-brand-border rounded-xl text-xs focus:outline-none focus:border-brand-primary"
            />
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full p-2.5 bg-white border border-brand-border rounded-xl text-xs focus:outline-none focus:border-brand-primary"
          >
            <option value="all">Todos os Status</option>
            <option value="pending">Pendente</option>
            <option value="in_progress">Em Andamento</option>
            <option value="completed">Concluído</option>
            <option value="cancelled">Cancelado</option>
          </select>

          {/* Count summary */}
          <div className="flex items-center justify-end text-xs font-semibold text-brand-text-muted px-2">
            Mostrando {filteredRequests.length} de {requests.length} solicitações
          </div>
        </div>

        {/* Layout: Table list + Edit Pane */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Table List */}
          <div className="lg:col-span-2 border border-brand-border rounded-2xl overflow-hidden h-[500px] overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center text-brand-text-muted text-sm">
                <Loader2 className="animate-spin text-brand-primary mx-auto mb-3" size={24} />
                Carregando solicitações...
              </div>
            ) : filteredRequests.length === 0 ? (
              <div className="p-12 text-center max-w-sm mx-auto">
                <div className="p-3 bg-brand-primary/5 text-brand-primary w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Database size={20} />
                </div>
                <h4 className="font-bold text-brand-text text-sm">Nenhuma solicitação encontrada</h4>
              </div>
            ) : (
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-brand-bg text-brand-text font-semibold sticky top-0 z-10 border-b border-brand-border">
                  <tr>
                    <th className="px-4 py-3">Profissional</th>
                    <th className="px-4 py-3">Origem / Qtd</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {filteredRequests.map((req) => (
                    <tr 
                      key={req.id} 
                      onClick={() => handleSelectRequest(req)}
                      className={`hover:bg-brand-bg/30 transition-colors cursor-pointer ${
                        selectedRequest?.id === req.id ? 'bg-brand-primary/5' : ''
                      }`}
                    >
                      <td className="px-4 py-4">
                        <div className="font-bold text-brand-text">{req.professionalName || 'Desconhecido'}</div>
                        <div className="text-[10px] text-brand-text-muted mt-0.5">{req.professionalEmail}</div>
                        <div className="text-[9px] text-brand-text-muted/70 mt-1">Aberto em {formatDateTime(req.createdAt)}</div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="font-semibold text-brand-text">
                          {getPlatformLabel(req.previousPlatform, req.otherPlatformName)}
                        </div>
                        <div className="text-[10px] text-brand-text-muted mt-0.5">
                          ~{req.estimatedPatients} pacientes
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${getStatusBadgeClass(req.status)}`}>
                          {getStatusLabel(req.status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleSelectRequest(req);
                          }}
                          className="text-xs font-bold text-brand-primary hover:underline"
                        >
                          Gerenciar
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Edit Pane / Detail Panel */}
          <div className="border border-brand-border rounded-2xl p-4 bg-brand-bg/10 flex flex-col justify-between h-[500px] overflow-y-auto">
            {selectedRequest ? (
              <div className="space-y-4">
                <div className="flex justify-between items-start border-b border-brand-border/60 pb-3">
                  <div>
                    <h3 className="font-bold text-brand-text text-sm">Detalhes da Migração</h3>
                    <p className="text-[10px] text-brand-text-muted mt-0.5">ID: {selectedRequest.id}</p>
                  </div>
                  <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${getStatusBadgeClass(selectedRequest.status)}`}>
                    {getStatusLabel(selectedRequest.status)}
                  </span>
                </div>

                {success && (
                  <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-[10px] flex items-start gap-2">
                    <CheckCircle2 size={12} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>{success}</div>
                  </div>
                )}

                {error && (
                  <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-[10px] flex items-start gap-2">
                    <AlertCircle size={12} className="text-rose-600 shrink-0 mt-0.5" />
                    <div>{error}</div>
                  </div>
                )}

                <div className="space-y-3 text-xs leading-relaxed">
                  <div>
                    <span className="font-bold text-brand-text block">Profissional:</span>
                    <span>{selectedRequest.professionalName} ({selectedRequest.professionalEmail})</span>
                  </div>

                  <div>
                    <span className="font-bold text-brand-text block">Plataforma Origem:</span>
                    <span>{getPlatformLabel(selectedRequest.previousPlatform, selectedRequest.otherPlatformName)}</span>
                  </div>

                  <div>
                    <span className="font-bold text-brand-text block">Quantidade Pacientes:</span>
                    <span>~{selectedRequest.estimatedPatients} paciente(s)</span>
                  </div>

                  <div>
                    <span className="font-bold text-brand-text block">Arquivo de Backup:</span>
                    {selectedRequest.attachmentName ? (
                      <button
                        onClick={() => handleDownloadAttachment(selectedRequest)}
                        className="inline-flex items-center text-xs font-bold text-brand-primary hover:underline gap-1 mt-1 cursor-pointer"
                      >
                        <Download size={12} />
                        <span>Baixar {selectedRequest.attachmentName}</span>
                      </button>
                    ) : (
                      <span className="text-brand-text-muted">Sem anexo enviado</span>
                    )}
                  </div>

                  <div>
                    <span className="font-bold text-brand-text block">Instruções do Usuário:</span>
                    <p className="bg-white border border-brand-border/60 p-2.5 rounded-xl text-[10px] text-brand-text whitespace-pre-wrap max-h-[100px] overflow-y-auto mt-1">
                      {selectedRequest.notes || 'Sem observações adicionais.'}
                    </p>
                  </div>

                  {/* Edit Admin Notes */}
                  <div className="space-y-1">
                    <label className="font-bold text-brand-text block">Observações do Suporte (Visível ao Usuário):</label>
                    <textarea
                      placeholder="Ex: Arquivos recebidos e processamento concluído! Seus 42 pacientes já estão cadastrados no seu painel..."
                      value={adminNotes}
                      onChange={(e) => setAdminNotes(e.target.value)}
                      rows={4}
                      className="w-full p-2 bg-white border border-brand-border/80 rounded-xl text-[10px] focus:outline-none focus:border-brand-primary resize-none"
                    />
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-brand-border/60 space-y-2">
                  <span className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Alterar Status</span>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleUpdateStatus('in_progress')}
                      disabled={saving}
                      className="px-3 py-2 bg-blue-50 hover:bg-blue-100 border border-blue-200 text-blue-700 font-bold rounded-xl text-[10px] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Em Andamento
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('completed')}
                      disabled={saving}
                      className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 text-emerald-700 font-bold rounded-xl text-[10px] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Concluído
                    </button>
                  </div>
                  
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleUpdateStatus('cancelled')}
                      disabled={saving}
                      className="px-3 py-2 bg-rose-50 hover:bg-rose-100 border border-rose-200 text-rose-700 font-bold rounded-xl text-[10px] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={() => handleUpdateStatus('pending')}
                      disabled={saving}
                      className="px-3 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-700 font-bold rounded-xl text-[10px] transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      Voltar p/ Pendente
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-brand-text-muted text-xs my-auto p-6 space-y-2">
                <Database className="mx-auto text-brand-text-muted/60" size={32} />
                <p className="font-semibold text-brand-text">Nenhuma solicitação selecionada</p>
                <p className="text-[10px] leading-relaxed">Selecione um registro na lista ao lado para ver os detalhes da importação e gerenciar o status.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
