import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Database, UploadCloud, CheckCircle2, Lock, Shield, FileText, ArrowRight, Loader2, RefreshCw } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { createMigrationRequest, fetchMyMigrationRequests, getMigrationAttachmentUrl, MigrationRequest } from '../services/migration';

export default function Migration() {
  const navigate = useNavigate();
  const { subscriptionPlan, user } = useAuthStore();
  const isYearlyOrAdmin = subscriptionPlan === 'yearly' || subscriptionPlan === 'none';

  const [requests, setRequests] = useState<MigrationRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  // Form State
  const [previousPlatform, setPreviousPlatform] = useState('excel_word');
  const [otherPlatformName, setOtherPlatformName] = useState('');
  const [estimatedPatients, setEstimatedPatients] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);

  // Load user's migration requests
  const loadRequests = async (showLoading = true) => {
    if (!isYearlyOrAdmin) {
      setLoading(false);
      return;
    }
    try {
      if (showLoading) setLoading(true);
      setError('');
      const data = await fetchMyMigrationRequests();
      setRequests(data);
    } catch (err: any) {
      console.error('Error loading migrations:', err);
      setError('Não foi possível carregar o histórico de migrações.');
    } finally {
      if (showLoading) setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      loadRequests(true);
    }
  }, [user, subscriptionPlan]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      if (selectedFile.size > 50 * 1024 * 1024) {
        alert('O arquivo excede o limite máximo de 50MB.');
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!estimatedPatients || parseInt(estimatedPatients) <= 0) {
      alert('Por favor, informe a quantidade de pacientes.');
      return;
    }

    try {
      setSubmitLoading(true);
      setError('');
      setSuccess('');

      await createMigrationRequest(
        previousPlatform,
        previousPlatform === 'other_software' ? otherPlatformName : null,
        parseInt(estimatedPatients),
        notes,
        file
      );

      setSuccess('Sua solicitação de migração foi enviada com sucesso! Nossa equipe entrará em contato em breve.');
      
      // Reset form
      setPreviousPlatform('excel_word');
      setOtherPlatformName('');
      setEstimatedPatients('');
      setNotes('');
      setFile(null);
      
      // Reload requests list
      await loadRequests(false);
    } catch (err: any) {
      console.error('Error creating migration request:', err);
      setError('Erro ao enviar solicitação. Por favor, tente novamente.');
    } finally {
      setSubmitLoading(false);
    }
  };

  const handleDownloadAttachment = async (request: MigrationRequest) => {
    if (!request.attachmentUrl) return;
    try {
      const url = await getMigrationAttachmentUrl(request.attachmentUrl);
      if (url) {
        window.open(url, '_blank');
      } else {
        alert('Não foi possível gerar a URL de download.');
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
      case 'paper': return 'Papel (Fotos/Scans)';
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

  // ---------------- LOCKED STATE (PAYWALL) ----------------
  if (!isYearlyOrAdmin) {
    return (
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div>
          <h2 className="text-3xl font-display font-bold text-brand-text flex items-center">
            <Database className="text-brand-primary mr-3 shrink-0" size={32} />
            <span>Migração VIP (Concierge)</span>
          </h2>
          <p className="text-brand-text-muted text-sm mt-1">
            Migre todo o histórico do seu consultório de forma prática e 100% segura.
          </p>
        </div>

        {/* Promo and Upgrade Banner */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          <div className="lg:col-span-3 card p-8 bg-white border border-brand-border rounded-3xl space-y-6">
            <h3 className="text-xl font-bold text-brand-text flex items-center gap-2">
              <Shield className="text-brand-primary" size={24} />
              <span>Como funciona a Importação de Dados?</span>
            </h3>
            
            <div className="space-y-4">
              <div className="flex items-start space-x-3">
                <div className="p-2 bg-brand-bg rounded-lg mt-0.5 text-brand-primary font-bold">1</div>
                <div>
                  <h4 className="text-sm font-semibold text-brand-text">Você nos envia os arquivos</h4>
                  <p className="text-xs text-brand-text-muted mt-0.5">
                    Planilhas de pacientes, documentos do Word, prontuários exportados em PDF de outros sistemas ou até fotos de fichas em papel.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="p-2 bg-brand-bg rounded-lg mt-0.5 text-brand-primary font-bold">2</div>
                <div>
                  <h4 className="text-sm font-semibold text-brand-text">Nosso time técnico organiza</h4>
                  <p className="text-xs text-brand-text-muted mt-0.5">
                    Processamos, estruturamos os dados dos seus pacientes e criamos as linhas do tempo de evolução correspondentes na plataforma.
                  </p>
                </div>
              </div>

              <div className="flex items-start space-x-3">
                <div className="p-2 bg-brand-bg rounded-lg mt-0.5 text-brand-primary font-bold">3</div>
                <div>
                  <h4 className="text-sm font-semibold text-brand-text">Acesso Liberado instantaneamente</h4>
                  <p className="text-xs text-brand-text-muted mt-0.5">
                    Você entra na sua conta e já encontra todos os prontuários perfeitamente cadastrados no sistema, prontos para a inteligência artificial.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-brand-border/60">
              <div className="bg-sky-50 text-sky-800 rounded-2xl p-4 text-xs flex items-start gap-3">
                <Shield className="shrink-0 text-sky-600 mt-0.5" size={16} />
                <div>
                  <span className="font-bold block mb-0.5">Segurança & LGPD:</span>
                  Suas informações médicas são protegidas por criptografia ponta a ponta e o tratamento dos dados segue rígidos padrões legais de sigilo médico.
                </div>
              </div>
            </div>
          </div>

          {/* Locked Box Card */}
          <div className="lg:col-span-2 card p-8 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-white border border-amber-500/20 rounded-3xl flex flex-col justify-between text-center relative overflow-hidden shadow-sm">
            <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-br from-amber-400/15 to-transparent rounded-full blur-3xl pointer-events-none" />
            <div className="space-y-6 relative z-10">
              <div className="mx-auto w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-500 text-white rounded-2xl flex items-center justify-center shadow-lg shadow-amber-500/20">
                <Lock size={32} />
              </div>
              <div className="space-y-2">
                <h3 className="text-lg font-bold text-amber-950">Disponível no Plano Anual</h3>
                <p className="text-xs text-amber-800/80 leading-relaxed max-w-sm mx-auto">
                  O Serviço de Migração VIP (Concierge) é um benefício exclusivo para assinantes do plano anual da Evolução Clínica.
                </p>
              </div>

              <div className="bg-amber-50 border border-amber-200/50 rounded-2xl p-4 text-left space-y-2.5">
                <div className="flex items-center text-xs text-amber-900 font-semibold gap-2">
                  <CheckCircle2 size={14} className="text-amber-600 shrink-0" />
                  <span>Sem limites de prontuários</span>
                </div>
                <div className="flex items-center text-xs text-amber-900 font-semibold gap-2">
                  <CheckCircle2 size={14} className="text-amber-600 shrink-0" />
                  <span>Suporte direto dos programadores</span>
                </div>
                <div className="flex items-center text-xs text-amber-900 font-semibold gap-2">
                  <CheckCircle2 size={14} className="text-amber-600 shrink-0" />
                  <span>Economia de horas de digitação manual</span>
                </div>
              </div>
            </div>

            <div className="pt-8 relative z-10">
              <button
                onClick={() => navigate('/painel/subscription')}
                className="w-full bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white py-3.5 px-6 rounded-2xl font-bold transition-all shadow-md shadow-orange-500/10 flex items-center justify-center space-x-2 cursor-pointer"
              >
                <span>Fazer Upgrade Agora</span>
                <ArrowRight size={16} />
              </button>
              <p className="text-[10px] text-amber-800/60 mt-2">
                Mude para o Plano Anual e garanta mais 17% de desconto
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ---------------- ACTIVE STATE (YEARLY / ADMIN) ----------------
  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-3xl font-display font-bold text-brand-text flex items-center">
            <Database className="text-brand-primary mr-3 shrink-0" size={32} />
            <span>Migração VIP (Concierge)</span>
          </h2>
          <p className="text-brand-text-muted text-sm mt-1">
            Envie as informações do seu sistema anterior para importarmos seus prontuários sem custo adicional.
          </p>
        </div>

        <button
          onClick={() => loadRequests(true)}
          className="p-3 bg-white hover:bg-brand-bg border border-brand-border text-brand-text-muted hover:text-brand-text rounded-2xl transition-all self-start sm:self-auto"
          title="Atualizar Página"
        >
          <RefreshCw size={18} />
        </button>
      </div>

      {success && (
        <div className="bg-emerald-50 border border-emerald-200 text-emerald-800 p-4 rounded-2xl text-xs flex items-start gap-3">
          <CheckCircle2 size={16} className="text-emerald-600 shrink-0 mt-0.5" />
          <div>{success}</div>
        </div>
      )}

      {error && (
        <div className="bg-rose-50 border border-rose-200 text-rose-800 p-4 rounded-2xl text-xs flex items-start gap-3">
          <FileText size={16} className="text-rose-600 shrink-0 mt-0.5" />
          <div>{error}</div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* Form Column */}
        <div className="lg:col-span-2 card p-6 bg-white border border-brand-border rounded-3xl h-fit">
          <h3 className="text-lg font-bold text-brand-text mb-4">Nova Solicitação</h3>
          
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Plataforma Anterior */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                Plataforma Anterior
              </label>
              <select
                value={previousPlatform}
                onChange={(e) => setPreviousPlatform(e.target.value)}
                className="w-full p-3 bg-brand-bg/50 border border-brand-border rounded-2xl text-sm focus:outline-none focus:border-brand-primary"
              >
                <option value="excel_word">Excel / Arquivos Word</option>
                <option value="paper">Papel (Fichas Digitadas ou Fotos)</option>
                <option value="psicomanager">PsicoManager</option>
                <option value="clinis">Clinis</option>
                <option value="other_software">Outro Software de Gestão</option>
              </select>
            </div>

            {/* Outro nome */}
            {previousPlatform === 'other_software' && (
              <div className="space-y-1.5 animate-fadeIn">
                <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                  Nome do Software Anterior
                </label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Prontuário Verde, Clinispace"
                  value={otherPlatformName}
                  onChange={(e) => setOtherPlatformName(e.target.value)}
                  className="w-full p-3 bg-brand-bg/50 border border-brand-border rounded-2xl text-sm focus:outline-none focus:border-brand-primary"
                />
              </div>
            )}

            {/* Qtd Pacientes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                Qtd Estimada de Pacientes
              </label>
              <input
                type="number"
                required
                min="1"
                placeholder="Ex: 45"
                value={estimatedPatients}
                onChange={(e) => setEstimatedPatients(e.target.value)}
                className="w-full p-3 bg-brand-bg/50 border border-brand-border rounded-2xl text-sm focus:outline-none focus:border-brand-primary"
              />
            </div>

            {/* File Upload */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                Arquivo de Backup (Opcional)
              </label>
              <div className="border-2 border-dashed border-brand-border rounded-2xl p-4 text-center hover:bg-brand-bg/20 transition-all relative">
                <input
                  type="file"
                  onChange={handleFileChange}
                  accept=".zip,.rar,.xlsx,.xls,.csv,.pdf,.docx"
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                />
                <UploadCloud className="mx-auto text-brand-text-muted mb-2" size={24} />
                <span className="text-xs text-brand-text font-semibold block">
                  {file ? file.name : 'Selecionar arquivo...'}
                </span>
                <span className="text-[10px] text-brand-text-muted mt-1 block">
                  Formatos aceitos: .zip, .xlsx, .pdf, .docx (Máx. 50MB)
                </span>
              </div>
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                Instruções ou Observações
              </label>
              <textarea
                placeholder="Ex: Gostaria de importar as evoluções clínicas dos últimos 3 meses das minhas planilhas. A planilha possui as colunas Nome, Data e Evolução..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={4}
                className="w-full p-3 bg-brand-bg/50 border border-brand-border rounded-2xl text-sm focus:outline-none focus:border-brand-primary resize-none"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={submitLoading}
              className="w-full bg-brand-primary hover:bg-brand-primary-hover text-white py-3.5 px-6 rounded-2xl font-bold transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
            >
              {submitLoading ? (
                <>
                  <Loader2 className="animate-spin" size={16} />
                  <span>Enviando dados...</span>
                </>
              ) : (
                <>
                  <Database size={16} />
                  <span>Solicitar Importação VIP</span>
                </>
              )}
            </button>
          </form>
        </div>

        {/* Requests List Column */}
        <div className="lg:col-span-3 card bg-white border border-brand-border rounded-3xl flex flex-col">
          <div className="px-6 py-5 border-b border-brand-border flex items-center justify-between">
            <h3 className="font-bold text-brand-text">Suas Solicitações</h3>
            <span className="bg-brand-bg text-brand-text-muted px-3 py-1 rounded-full text-xs font-semibold border border-brand-border/40">
              {requests.length} {requests.length === 1 ? 'solicitação' : 'solicitações'}
            </span>
          </div>

          {loading ? (
            <div className="p-12 text-center text-brand-text-muted text-sm my-auto">
              <Loader2 className="animate-spin text-brand-primary mx-auto mb-3" size={24} />
              Carregando histórico...
            </div>
          ) : requests.length === 0 ? (
            <div className="p-12 text-center max-w-sm mx-auto my-auto">
              <div className="p-4 bg-brand-primary/5 text-brand-primary w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4">
                <Database size={26} />
              </div>
              <h4 className="font-bold text-brand-text text-base">Nenhuma solicitação enviada</h4>
              <p className="text-xs text-brand-text-muted mt-2 leading-relaxed">
                Preencha o formulário ao lado para enviar os seus dados e daremos início à migração.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-sm">
                <thead>
                  <tr className="bg-brand-bg text-brand-text font-semibold text-xs border-b border-brand-border">
                    <th className="px-6 py-4">Solicitação / Data</th>
                    <th className="px-6 py-4">Dados</th>
                    <th className="px-6 py-4">Arquivo</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {requests.map((request) => (
                    <tr key={request.id} className="hover:bg-brand-bg/20 transition-colors">
                      <td className="px-6 py-5">
                        <div className="font-bold text-brand-text text-xs">
                          {getPlatformLabel(request.previousPlatform, request.otherPlatformName)}
                        </div>
                        <div className="text-[10px] text-brand-text-muted mt-1">
                          Enviado em {formatDateTime(request.createdAt)}
                        </div>
                      </td>
                      <td className="px-6 py-5">
                        <div className="text-xs text-brand-text font-semibold">
                          ~{request.estimatedPatients} paciente{request.estimatedPatients > 1 ? 's' : ''}
                        </div>
                        {request.notes && (
                          <div className="text-[10px] text-brand-text-muted max-w-[200px] truncate mt-0.5" title={request.notes}>
                            Obs: {request.notes}
                          </div>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        {request.attachmentName ? (
                          <button
                            onClick={() => handleDownloadAttachment(request)}
                            className="inline-flex items-center text-xs font-semibold text-brand-primary hover:underline gap-1 text-left cursor-pointer"
                          >
                            <FileText size={12} className="shrink-0" />
                            <span className="max-w-[120px] truncate" title={request.attachmentName}>
                              {request.attachmentName}
                            </span>
                          </button>
                        ) : (
                          <span className="text-[10px] text-brand-text-muted">Sem anexo</span>
                        )}
                      </td>
                      <td className="px-6 py-5">
                        <div className="space-y-1">
                          <span className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-bold ${getStatusBadgeClass(request.status)}`}>
                            {getStatusLabel(request.status)}
                          </span>
                          {request.adminNotes && (
                            <div className="text-[10px] text-brand-text-muted max-w-[150px] leading-snug">
                              <span className="font-semibold text-brand-text">Admin:</span> {request.adminNotes}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
