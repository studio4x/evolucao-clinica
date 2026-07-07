import React, { useState, useEffect } from 'react';
import { Database, Search, FileText, Download, CheckCircle2, AlertCircle, Loader2, MessageSquare, HelpCircle, RefreshCw, PlusCircle, Calendar, ShieldAlert } from 'lucide-react';
import { fetchAdminMigrationRequests, updateMigrationRequestStatus, getMigrationAttachmentUrl, MigrationRequest } from '../../services/migration';
import { supabase } from '../../supabaseClient';

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

  // Evolution Import Tool State
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientStatus, setPatientStatus] = useState<'not_found' | 'found' | 'loading'>('loading');
  const [existingEvolutionsCount, setExistingEvolutionsCount] = useState(0);
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [sessionTime, setSessionTime] = useState('');
  const [transcriptionText, setTranscriptionText] = useState('');
  const [isCreatingEvolution, setIsCreatingEvolution] = useState(false);
  const [evolutionSuccess, setEvolutionSuccess] = useState('');
  const [evolutionError, setEvolutionError] = useState('');

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

  const checkPatientStatus = async (userId: string, name: string) => {
    try {
      setPatientStatus('loading');
      setPatientId(null);
      setExistingEvolutionsCount(0);

      const { data, error } = await supabase
        .from('patients')
        .select('id')
        .eq('professional_id', userId)
        .eq('full_name', name)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        setPatientId(data.id);
        setPatientStatus('found');
        
        // Fetch evolutions count
        const { count, error: countError } = await supabase
          .from('evolutions')
          .select('*', { count: 'exact', head: true })
          .eq('patient_id', data.id);
        
        if (!countError) {
          setExistingEvolutionsCount(count || 0);
        }
      } else {
        setPatientStatus('not_found');
      }
    } catch (err) {
      console.error('Error checking patient status:', err);
      setPatientStatus('not_found');
    }
  };

  const handleSelectRequest = (req: MigrationRequest) => {
    setSelectedRequest(req);
    setAdminNotes(req.adminNotes || '');
    setSuccess('');
    setError('');
    setEvolutionSuccess('');
    setEvolutionError('');
    setTranscriptionText('');
    setSessionDate(new Date().toISOString().split('T')[0]);
    setSessionTime('');
    checkPatientStatus(req.userId, req.patientName);
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

  const handleCreateEvolution = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedRequest) return;
    if (!transcriptionText.trim()) {
      alert('Por favor, digite o texto da evolução.');
      return;
    }

    try {
      setIsCreatingEvolution(true);
      setEvolutionError('');
      setEvolutionSuccess('');

      let currentPatientId = patientId;

      // 1. Create patient if not found
      if (patientStatus === 'not_found' || !currentPatientId) {
        const { data: newPatient, error: patientError } = await supabase
          .from('patients')
          .insert({
            professional_id: selectedRequest.userId,
            full_name: selectedRequest.patientName,
            status: 'active'
          })
          .select('id')
          .single();

        if (patientError) throw patientError;
        currentPatientId = newPatient.id;
        setPatientId(currentPatientId);
        setPatientStatus('found');
      }

      // 2. Insert evolution
      const { error: evolutionError } = await supabase
        .from('evolutions')
        .insert({
          professional_id: selectedRequest.userId,
          patient_id: currentPatientId,
          session_date: sessionDate,
          session_time: sessionTime || null,
          transcription_text: transcriptionText,
          transcription_status: 'completed',
          google_doc_append_status: 'pending',
          status: 'draft'
        });

      if (evolutionError) throw evolutionError;

      setEvolutionSuccess(`Evolução cadastrada com sucesso para o paciente ${selectedRequest.patientName}! (Rascunho criado)`);
      setTranscriptionText('');
      
      // Update evolutions count
      const { count } = await supabase
        .from('evolutions')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', currentPatientId);
      
      setExistingEvolutionsCount(count || 0);
    } catch (err: any) {
      console.error('Error creating evolution:', err);
      setEvolutionError(`Falha ao criar evolução: ${err.message || err}`);
    } finally {
      setIsCreatingEvolution(false);
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

        {/* Layout: Three-column Grid (List, Details, Evolution Tool) */}
        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
          {/* Column 1: Table List (width 4/12) */}
          <div className="xl:col-span-4 border border-brand-border rounded-2xl overflow-hidden h-[580px] overflow-y-auto bg-white shadow-inner">
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
                    <th className="px-4 py-3">Origem</th>
                    <th className="px-4 py-3 text-right">Ação</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {filteredRequests.map((req) => (
                    <tr 
                      key={req.id} 
                      onClick={() => handleSelectRequest(req)}
                      className={`hover:bg-brand-bg/30 transition-colors cursor-pointer ${
                        selectedRequest?.id === req.id ? 'bg-brand-primary/5 border-l-4 border-brand-primary' : ''
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
                          Pac: {req.patientName}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-right">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold ${getStatusBadgeClass(req.status)}`}>
                          {getStatusLabel(req.status)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* Column 2: Edit & Details Pane (width 4/12) */}
          <div className="xl:col-span-4 border border-brand-border rounded-2xl p-4 bg-brand-bg/10 flex flex-col justify-between h-[580px] overflow-y-auto shadow-sm">
            {selectedRequest ? (
              <div className="space-y-4 flex-grow flex flex-col justify-between">
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
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-[10px] flex items-start gap-2 animate-fadeIn">
                      <CheckCircle2 size={12} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>{success}</div>
                    </div>
                  )}

                  {error && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-[10px] flex items-start gap-2 animate-fadeIn">
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
                      <span className="font-bold text-brand-text block">Paciente:</span>
                      <span className="font-semibold text-brand-primary">{selectedRequest.patientName}</span>
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
                      <p className="bg-white border border-brand-border/60 p-2.5 rounded-xl text-[10px] text-brand-text whitespace-pre-wrap max-h-[90px] overflow-y-auto mt-1">
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
                        rows={3}
                        className="w-full p-2 bg-white border border-brand-border/80 rounded-xl text-[10px] focus:outline-none focus:border-brand-primary resize-none"
                      />
                    </div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-3 border-t border-brand-border/60 space-y-2">
                  <span className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Alterar Status da Solicitação</span>
                  
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

          {/* Column 3: Direct Evolution Import Tool (width 4/12) */}
          <div className="xl:col-span-4 border border-brand-border rounded-2xl p-4 bg-white flex flex-col justify-between h-[580px] overflow-y-auto shadow-sm">
            {selectedRequest ? (
              <div className="space-y-4 flex-grow flex flex-col justify-between">
                <div className="space-y-3">
                  <div className="flex justify-between items-start border-b border-brand-border/60 pb-3">
                    <div>
                      <h3 className="font-bold text-brand-text text-sm flex items-center gap-1.5">
                        <PlusCircle className="text-brand-primary" size={16} />
                        <span>Lançador de Evoluções</span>
                      </h3>
                      <p className="text-[10px] text-brand-text-muted mt-0.5">Cadastre a evolução direto para o profissional.</p>
                    </div>
                  </div>

                  {/* Patient Status Alert */}
                  {patientStatus === 'loading' ? (
                    <div className="bg-gray-50 border border-gray-200 p-2.5 rounded-xl text-[10px] text-gray-500 flex items-center gap-2">
                      <Loader2 className="animate-spin text-brand-primary" size={12} />
                      <span>Verificando cadastro do paciente no Supabase...</span>
                    </div>
                  ) : patientStatus === 'found' ? (
                    <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-xl text-[10px] text-emerald-800 space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <CheckCircle2 size={12} className="text-emerald-600 shrink-0" />
                        <span>Paciente já cadastrado pelo profissional</span>
                      </div>
                      <p className="text-[9px] text-emerald-700">
                        Evoluções registradas para ele: <strong className="text-emerald-900">{existingEvolutionsCount} sessões</strong>.
                      </p>
                    </div>
                  ) : (
                    <div className="bg-amber-50 border border-amber-200 p-2.5 rounded-xl text-[10px] text-amber-800 space-y-1">
                      <div className="font-bold flex items-center gap-1">
                        <ShieldAlert size={12} className="text-amber-600 shrink-0" />
                        <span>Paciente novo (não cadastrado)</span>
                      </div>
                      <p className="text-[9px] text-amber-700">
                        Ao salvar a primeira evolução, <strong className="underline">o paciente será criado automaticamente</strong> na conta do profissional.
                      </p>
                    </div>
                  )}

                  {evolutionSuccess && (
                    <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-3 rounded-xl text-[10px] flex items-start gap-2 animate-fadeIn">
                      <CheckCircle2 size={12} className="text-emerald-600 shrink-0 mt-0.5" />
                      <div>{evolutionSuccess}</div>
                    </div>
                  )}

                  {evolutionError && (
                    <div className="bg-rose-50 border border-rose-200 text-rose-800 p-3 rounded-xl text-[10px] flex items-start gap-2 animate-fadeIn">
                      <AlertCircle size={12} className="text-rose-600 shrink-0 mt-0.5" />
                      <div>{evolutionError}</div>
                    </div>
                  )}

                  {/* Form */}
                  <form onSubmit={handleCreateEvolution} className="space-y-3.5 pt-1">
                    {/* Session Date & Time */}
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Data da Sessão</label>
                        <div className="relative">
                          <input
                            type="date"
                            required
                            value={sessionDate}
                            onChange={(e) => setSessionDate(e.target.value)}
                            className="w-full p-2 bg-brand-bg/40 border border-brand-border rounded-xl text-[10px] focus:outline-none focus:border-brand-primary"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Horário (Opcional)</label>
                        <input
                          type="time"
                          value={sessionTime}
                          onChange={(e) => setSessionTime(e.target.value)}
                          className="w-full p-2 bg-brand-bg/40 border border-brand-border rounded-xl text-[10px] focus:outline-none focus:border-brand-primary"
                        />
                      </div>
                    </div>

                    {/* Session content */}
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Texto da Evolução Clínica</label>
                      <textarea
                        required
                        placeholder="Cole aqui o prontuário/conteúdo da sessão do paciente que está migrando..."
                        value={transcriptionText}
                        onChange={(e) => setTranscriptionText(e.target.value)}
                        rows={7}
                        className="w-full p-2.5 bg-brand-bg/40 border border-brand-border rounded-xl text-[10px] focus:outline-none focus:border-brand-primary font-sans resize-none"
                      />
                    </div>

                    {/* Submit Button */}
                    <button
                      type="submit"
                      disabled={isCreatingEvolution || patientStatus === 'loading'}
                      className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white py-2.5 px-4 rounded-xl font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-1.5 disabled:opacity-50 cursor-pointer text-xs"
                    >
                      {isCreatingEvolution ? (
                        <>
                          <Loader2 className="animate-spin" size={14} />
                          <span>Lançando evolução...</span>
                        </>
                      ) : (
                        <>
                          <PlusCircle size={14} />
                          <span>
                            {patientStatus === 'not_found' ? 'Criar Paciente e Lançar' : 'Lançar Evolução (Rascunho)'}
                          </span>
                        </>
                      )}
                    </button>
                  </form>
                </div>

                <div className="text-[9px] text-brand-text-muted leading-relaxed border-t border-brand-border/60 pt-2">
                  ℹ️ A evolução será lançada como <strong>Rascunho (Draft)</strong> e com a transcrição concluída. O profissional poderá revisar, editar e realizar a Assinatura Digital Jurídica no painel dele.
                </div>
              </div>
            ) : (
              <div className="text-center text-brand-text-muted text-xs my-auto p-6 space-y-2">
                <PlusCircle className="mx-auto text-brand-text-muted/60" size={32} />
                <p className="font-semibold text-brand-text">Aguardando seleção</p>
                <p className="text-[10px] leading-relaxed">Selecione uma solicitação de migração para habilitar o lançador automático de evoluções.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
