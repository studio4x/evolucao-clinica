import React, { useState, useEffect } from 'react';
import { Database, Search, FileText, Download, CheckCircle2, AlertCircle, Loader2, MessageSquare, HelpCircle, RefreshCw, PlusCircle, Calendar, ShieldAlert, Sparkles, Check, Play, ChevronDown, ChevronUp } from 'lucide-react';
import { fetchAdminMigrationRequests, updateMigrationRequestStatus, getMigrationAttachmentUrl, MigrationRequest } from '../../services/migration';
import { supabase } from '../../supabaseClient';

interface DetectedSession {
  date: string;
  time: string | null;
  content: string;
  launched?: boolean;
  launchError?: string;
}

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

  // Tab State in right column
  const [activeTab, setActiveTab] = useState<'manual' | 'ai'>('manual');

  // Evolution Import Tool State (Manual)
  const [patientId, setPatientId] = useState<string | null>(null);
  const [patientStatus, setPatientStatus] = useState<'not_found' | 'found' | 'loading'>('loading');
  const [existingEvolutionsCount, setExistingEvolutionsCount] = useState(0);
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [sessionTime, setSessionTime] = useState('');
  const [transcriptionText, setTranscriptionText] = useState('');
  const [isCreatingEvolution, setIsCreatingEvolution] = useState(false);
  const [evolutionSuccess, setEvolutionSuccess] = useState('');
  const [evolutionError, setEvolutionError] = useState('');

  // AI Concierge Tool State
  const [detectedSessions, setDetectedSessions] = useState<DetectedSession[]>([]);
  const [analyzingDoc, setAnalyzingDoc] = useState(false);
  const [importingAll, setImportingAll] = useState(false);
  const [expandedSessionIndex, setExpandedSessionIndex] = useState<number | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<{current: number, total: number} | null>(null);

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
    setDetectedSessions([]);
    setExpandedSessionIndex(null);
    setActiveTab(req.attachmentName ? 'ai' : 'manual');
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

  const chunkText = (text: string, maxChunkSize: number = 15000): string[] => {
    const chunks = [];
    let currentIndex = 0;
    while (currentIndex < text.length) {
      let end = currentIndex + maxChunkSize;
      if (end >= text.length) {
        chunks.push(text.slice(currentIndex));
        break;
      }
      let breakPoint = text.lastIndexOf('\n\n', end);
      if (breakPoint > currentIndex) {
        end = breakPoint + 2;
      } else {
        breakPoint = text.lastIndexOf('\n', end);
        if (breakPoint > currentIndex) {
          end = breakPoint + 1;
        }
      }
      chunks.push(text.slice(currentIndex, end));
      currentIndex = end;
    }
    return chunks;
  };

  const handleAnalyzeDocument = async () => {
    if (!selectedRequest) return;
    try {
      setAnalyzingDoc(true);
      setAnalysisProgress(null);
      setEvolutionError('');
      setEvolutionSuccess('');
      setDetectedSessions([]);

      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Usuário não autenticado.');

      // 1. Extrair o texto completo
      const extractResponse = await fetch('/api/migrations/extract-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ requestId: selectedRequest.id })
      });
      
      const extractResult = await extractResponse.json();
      if (!extractResponse.ok) {
        throw new Error(extractResult.error || 'Erro ao extrair o documento.');
      }

      const text = extractResult.text;
      const chunks = chunkText(text, 15000);
      
      let allSessions: DetectedSession[] = [];
      
      // 2. Analisar cada chunk em série
      for (let i = 0; i < chunks.length; i++) {
        setAnalysisProgress({ current: i + 1, total: chunks.length });
        const analyzeResponse = await fetch('/api/migrations/analyze-chunk', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ textChunk: chunks[i] })
        });
        
        const analyzeResult = await analyzeResponse.json();
        if (!analyzeResponse.ok) {
          throw new Error(analyzeResult.error || `Erro ao analisar parte ${i + 1} do documento.`);
        }
        
        if (analyzeResult.sessions && Array.isArray(analyzeResult.sessions)) {
          allSessions = allSessions.concat(analyzeResult.sessions);
        }
      }

      setDetectedSessions(allSessions);
      setEvolutionSuccess(`Documento analisado com sucesso! Identificadas ${allSessions.length} sessões.`);
    } catch (err: any) {
      console.error('Error analyzing document:', err);
      setEvolutionError(err.message || 'Erro ao analisar o documento.');
    } finally {
      setAnalyzingDoc(false);
      setAnalysisProgress(null);
    }
  };

  const handleLaunchDetectedSession = async (sessionItem: DetectedSession, index: number) => {
    if (!selectedRequest) return;
    try {
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
          session_date: sessionItem.date,
          session_time: sessionItem.time || null,
          transcription_text: sessionItem.content,
          transcription_status: 'completed',
          google_doc_append_status: 'pending',
          status: 'draft'
        });

      if (evolutionError) throw evolutionError;

      // Mark as launched in local state
      setDetectedSessions(prev => prev.map((s, idx) => idx === index ? { ...s, launched: true, launchError: undefined } : s));
      
      // Update count
      const { count } = await supabase
        .from('evolutions')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', currentPatientId);
      
      setExistingEvolutionsCount(count || 0);
      setEvolutionSuccess(`Sessão do dia ${formatLocalDate(sessionItem.date)} importada com sucesso!`);
    } catch (err: any) {
      console.error('Error launching session:', err);
      setDetectedSessions(prev => prev.map((s, idx) => idx === index ? { ...s, launchError: err.message || 'Erro ao lançar' } : s));
    }
  };

  const handleLaunchAllSessions = async () => {
    if (!selectedRequest || detectedSessions.length === 0) return;
    try {
      setImportingAll(true);
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

      let launchedCount = 0;
      const updatedSessions = [...detectedSessions];

      // Loop through all unlaunched sessions
      for (let i = 0; i < updatedSessions.length; i++) {
        const s = updatedSessions[i];
        if (s.launched) continue;

        try {
          const { error: evolutionError } = await supabase
            .from('evolutions')
            .insert({
              professional_id: selectedRequest.userId,
              patient_id: currentPatientId,
              session_date: s.date,
              session_time: s.time || null,
              transcription_text: s.content,
              transcription_status: 'completed',
              google_doc_append_status: 'pending',
              status: 'draft'
            });

          if (evolutionError) throw evolutionError;
          s.launched = true;
          s.launchError = undefined;
          launchedCount++;
        } catch (err: any) {
          s.launchError = err.message || 'Erro ao lançar';
        }
      }

      // Force state update
      setDetectedSessions(updatedSessions);

      // Update count
      const { count } = await supabase
        .from('evolutions')
        .select('*', { count: 'exact', head: true })
        .eq('patient_id', currentPatientId);
      
      setExistingEvolutionsCount(count || 0);

      if (launchedCount > 0) {
        setEvolutionSuccess(`Importadas com sucesso ${launchedCount} sessões de evolução!`);
      } else {
        setEvolutionError('Nenhuma nova sessão pôde ser importada.');
      }
    } catch (err: any) {
      console.error('Error importing all:', err);
      setEvolutionError(err.message || 'Erro ao importar todas as sessões.');
    } finally {
      setImportingAll(false);
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
      case 'paper': return 'Papel (Fichas)';
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

  const formatLocalDate = (dateStr: string) => {
    if (!dateStr) return '';
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
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
            className="p-2.5 bg-white hover:bg-brand-bg border border-brand-border text-brand-text-muted hover:text-brand-text rounded-xl transition-all self-start md:self-center cursor-pointer"
            title="Recarregar"
          >
            <RefreshCw size={16} />
          </button>
        </div>

        {/* Filters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6 bg-brand-bg/25 p-4 rounded-2xl border border-brand-border/30">
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
            className="w-full p-2.5 bg-white border border-brand-border rounded-xl text-xs focus:outline-none focus:border-brand-primary cursor-pointer"
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
          {/* Column 1: Clean vertical cards sidebar (width 4/12) */}
          <div className="xl:col-span-4 border border-brand-border rounded-2xl overflow-hidden h-[600px] overflow-y-auto bg-white shadow-inner divide-y divide-brand-border">
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
              filteredRequests.map((req) => (
                <div
                  key={req.id}
                  onClick={() => handleSelectRequest(req)}
                  className={`p-4 border-b border-brand-border/60 hover:bg-brand-bg/30 transition-colors cursor-pointer text-xs relative ${
                    selectedRequest?.id === req.id ? 'bg-brand-primary/5 border-l-4 border-brand-primary' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-2">
                    <div className="font-bold text-brand-text truncate max-w-[150px]" title={req.professionalName}>
                      {req.professionalName || 'Desconhecido'}
                    </div>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold shrink-0 ${getStatusBadgeClass(req.status)}`}>
                      {getStatusLabel(req.status)}
                    </span>
                  </div>
                  
                  <div className="text-[10px] text-brand-text-muted truncate max-w-[200px] mt-0.5">{req.professionalEmail}</div>
                  
                  <div className="mt-2.5 flex items-center justify-between text-[10px]">
                    <span className="font-semibold text-brand-text bg-brand-bg/50 px-1.5 py-0.5 rounded border border-brand-border/40">
                      {getPlatformLabel(req.previousPlatform, req.otherPlatformName)}
                    </span>
                    <span className="text-[10px] text-brand-text-muted">
                      Pac: <strong className="text-brand-primary">{req.patientName}</strong>
                    </span>
                  </div>

                  <div className="text-[9px] text-brand-text-muted/70 mt-1.5 text-right">
                    Aberto em {formatDateTime(req.createdAt)}
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Column 2: Edit & Details Pane (width 4/12) */}
          <div className="xl:col-span-4 border border-brand-border rounded-2xl p-4 bg-brand-bg/10 flex flex-col justify-between h-[600px] overflow-y-auto shadow-sm">
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
                          className="inline-flex items-center text-xs font-bold text-brand-primary hover:underline gap-1 mt-1 cursor-pointer text-left"
                        >
                          <Download size={12} className="shrink-0" />
                          <span className="max-w-[200px] truncate">Baixar {selectedRequest.attachmentName}</span>
                        </button>
                      ) : (
                        <span className="text-brand-text-muted">Sem anexo enviado</span>
                      )}
                    </div>

                    <div>
                      <span className="font-bold text-brand-text block">Instruções do Usuário:</span>
                      <p className="bg-white border border-brand-border/60 p-2.5 rounded-xl text-[10px] text-brand-text whitespace-pre-wrap max-h-[90px] overflow-y-auto mt-1 shadow-inner">
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

          {/* Column 3: Direct Evolution Import Tool with AI division (width 4/12) */}
          <div className="xl:col-span-4 border border-brand-border rounded-2xl p-4 bg-white flex flex-col justify-between h-[600px] overflow-y-auto shadow-sm">
            {selectedRequest ? (
              <div className="space-y-4 flex-grow flex flex-col justify-between">
                <div className="space-y-3 flex-grow flex flex-col">
                  {/* Tool Header */}
                  <div className="flex justify-between items-start border-b border-brand-border/60 pb-3">
                    <div>
                      <h3 className="font-bold text-brand-text text-sm flex items-center gap-1.5">
                        <PlusCircle className="text-brand-primary" size={16} />
                        <span>Lançador de Evoluções</span>
                      </h3>
                      <p className="text-[10px] text-brand-text-muted mt-0.5">Cadastre as sessões direto para o profissional.</p>
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

                  {/* Tab Selector */}
                  <div className="flex border-b border-brand-border/60">
                    <button
                      onClick={() => setActiveTab('ai')}
                      disabled={!selectedRequest.attachmentName}
                      className={`flex-1 py-1.5 text-center text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center justify-center gap-1.5 ${
                        activeTab === 'ai'
                          ? 'border-brand-primary text-brand-primary'
                          : 'border-transparent text-brand-text-muted hover:text-brand-text'
                      } disabled:opacity-40 disabled:cursor-not-allowed`}
                    >
                      <Sparkles size={13} />
                      Análise IA (Documento)
                    </button>
                    <button
                      onClick={() => setActiveTab('manual')}
                      className={`flex-1 py-1.5 text-center text-xs font-bold border-b-2 transition-colors cursor-pointer ${
                        activeTab === 'manual'
                          ? 'border-brand-primary text-brand-primary'
                          : 'border-transparent text-brand-text-muted hover:text-brand-text'
                      }`}
                    >
                      Lançamento Manual
                    </button>
                  </div>

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

                  {/* Tab Content */}
                  <div className="flex-grow overflow-y-auto">
                    {activeTab === 'ai' ? (
                      <div className="space-y-3.5 h-[280px]">
                        {detectedSessions.length === 0 ? (
                          <div className="bg-brand-bg/10 rounded-2xl p-6 text-center border border-brand-border/40 my-auto h-full flex flex-col justify-center items-center space-y-3">
                            <Sparkles className="text-brand-primary/60 animate-pulse" size={28} />
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-brand-text">Identificação de Sessões por IA</p>
                              <p className="text-[10px] text-brand-text-muted leading-relaxed max-w-[220px] mx-auto">
                                Clique no botão abaixo para ler o arquivo de backup anexado, separar as sessões cronologicamente e importar em lote.
                              </p>
                            </div>
                            <button
                              onClick={handleAnalyzeDocument}
                              disabled={analyzingDoc}
                              className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white text-xs font-bold rounded-xl shadow transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                            >
                              {analyzingDoc ? (
                                <>
                                  <Loader2 className="animate-spin" size={13} />
                                  <span>{analysisProgress ? `Analisando parte ${analysisProgress.current} de ${analysisProgress.total}...` : 'Lendo arquivo...'}</span>
                                </>
                              ) : (
                                <>
                                  <Sparkles size={13} />
                                  <span>Analisar Documento com IA</span>
                                </>
                              )}
                            </button>
                          </div>
                        ) : (
                          <div className="space-y-3 flex flex-col h-full">
                            {/* In-Lote launch button */}
                            <div className="flex justify-between items-center bg-brand-bg/30 p-2.5 rounded-xl border border-brand-border/40">
                              <span className="text-[10px] text-brand-text font-bold">
                                {detectedSessions.filter(s => s.launched).length} de {detectedSessions.length} importadas
                              </span>
                              
                              {detectedSessions.some(s => !s.launched) && (
                                <button
                                  onClick={handleLaunchAllSessions}
                                  disabled={importingAll}
                                  className="px-2.5 py-1 bg-brand-primary hover:bg-brand-primary-hover text-white font-bold rounded-lg text-[9px] cursor-pointer flex items-center gap-1 transition-colors shadow disabled:opacity-50"
                                >
                                  {importingAll ? (
                                    <>
                                      <Loader2 size={10} className="animate-spin" />
                                      <span>Importando...</span>
                                    </>
                                  ) : (
                                    <>
                                      <Play size={10} />
                                      <span>Importar Tudo</span>
                                    </>
                                  )}
                                </button>
                              )}
                            </div>

                            {/* Detected Sessions List */}
                            <div className="space-y-2 overflow-y-auto max-h-[220px] pr-1 flex-grow">
                              {detectedSessions.map((sessionItem, idx) => (
                                <div 
                                  key={idx}
                                  className={`p-2.5 border rounded-xl text-[10px] leading-relaxed transition-all ${
                                    sessionItem.launched 
                                      ? 'bg-emerald-50/40 border-emerald-200' 
                                      : 'bg-white border-brand-border/80 hover:border-brand-primary/40'
                                  }`}
                                >
                                  <div className="flex justify-between items-center mb-1">
                                    <span className="font-bold text-brand-text flex items-center gap-1">
                                      <Calendar size={10} className="text-brand-text-muted" />
                                      {formatLocalDate(sessionItem.date)}
                                      {sessionItem.time && <span className="text-brand-text-muted"> às {sessionItem.time}</span>}
                                    </span>

                                    {sessionItem.launched ? (
                                      <span className="text-emerald-600 font-bold text-[9px] flex items-center gap-0.5">
                                        <Check size={10} />
                                        Importada
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => handleLaunchDetectedSession(sessionItem, idx)}
                                        className="px-2 py-0.5 bg-brand-bg hover:bg-brand-primary/10 text-brand-primary border border-brand-border hover:border-brand-primary/30 font-semibold rounded text-[9px] cursor-pointer transition-colors"
                                      >
                                        Lançar
                                      </button>
                                    )}
                                  </div>

                                  <div className="relative">
                                    <p className={`text-[10px] text-brand-text-muted ${expandedSessionIndex === idx ? '' : 'line-clamp-2'}`}>
                                      {sessionItem.content}
                                    </p>
                                    
                                    <button 
                                      onClick={() => setExpandedSessionIndex(expandedSessionIndex === idx ? null : idx)}
                                      className="text-[9px] text-brand-primary font-semibold hover:underline mt-1 flex items-center gap-0.5 cursor-pointer ml-auto"
                                    >
                                      {expandedSessionIndex === idx ? (
                                        <>Recolher <ChevronUp size={10} /></>
                                      ) : (
                                        <>Ver tudo <ChevronDown size={10} /></>
                                      )}
                                    </button>
                                  </div>

                                  {sessionItem.launchError && (
                                    <div className="text-[9px] text-rose-600 font-semibold mt-1">
                                      ⚠️ {sessionItem.launchError}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* Manual Form */
                      <form onSubmit={handleCreateEvolution} className="space-y-3.5 pt-1">
                        {/* Session Date & Time */}
                        <div className="grid grid-cols-2 gap-2">
                          <div className="space-y-1">
                            <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Data da Sessão</label>
                            <input
                              type="date"
                              required
                              value={sessionDate}
                              onChange={(e) => setSessionDate(e.target.value)}
                              className="w-full p-2 bg-brand-bg/40 border border-brand-border rounded-xl text-[10px] focus:outline-none focus:border-brand-primary"
                            />
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
                            rows={6}
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
                    )}
                  </div>
                </div>

                {/* Info Footer */}
                <div className="text-[9px] text-brand-text-muted leading-relaxed border-t border-brand-border/60 pt-2 shrink-0">
                  ℹ️ As evoluções serão salvas como <strong>Rascunho (Draft)</strong> vinculadas ao profissional. Ele poderá revisar, editar e assinar digitalmente no painel dele.
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
