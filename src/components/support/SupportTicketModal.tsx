import React, { useState, useRef } from 'react';
import { X, Paperclip, AlertCircle, Loader2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { createSupportTicket, SupportTicketCategory } from '../../services/support';

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function SupportTicketModal({ isOpen, onClose, onSuccess }: SupportTicketModalProps) {
  const { subscriptionPlan } = useAuthStore();
  const [subject, setSubject] = useState('');
  const [category, setCategory] = useState<SupportTicketCategory>('general');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

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

  const handleRemoveFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) {
      setError('Por favor, informe o assunto.');
      return;
    }
    if (!description.trim()) {
      setError('Por favor, descreva detalhadamente a sua solicitação.');
      return;
    }

    try {
      setLoading(true);
      setError('');
      await createSupportTicket(subject, category, description, file);
      
      // Reset form
      setSubject('');
      setCategory('general');
      setDescription('');
      setFile(null);
      
      onSuccess();
      onClose();
    } catch (err: any) {
      console.error('Error creating ticket:', err);
      setError(err.message || 'Ocorreu um erro ao abrir o chamado. Tente novamente.');
    } finally {
      setLoading(false);
    }
  };

  // Dynamic SLA Message based on the user's subscription plan
  let slaMessage = (
    <div className="bg-gray-50 text-gray-700 p-4 rounded-2xl border border-gray-200 text-xs leading-relaxed">
      <strong>Prazo padrão de resposta:</strong> até 48 horas úteis (Segunda a Sexta, das 08:00 às 18:00).
    </div>
  );

  if (subscriptionPlan === 'yearly') {
    slaMessage = (
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 text-amber-900 p-4 rounded-2xl border border-amber-200 text-xs leading-relaxed flex items-start space-x-2">
        <span className="text-base">✨</span>
        <div>
          <strong className="text-amber-800">Suporte VIP Anual Ativo:</strong> Seu plano tem prioridade máxima!
          O tempo estimado de primeira resposta é de <strong>até 2 horas úteis</strong> (dentro do horário comercial das 08h às 18h).
        </div>
      </div>
    );
  } else if (subscriptionPlan === 'monthly') {
    slaMessage = (
      <div className="bg-emerald-50 text-emerald-900 p-4 rounded-2xl border border-emerald-200 text-xs leading-relaxed">
        <strong className="text-emerald-800">Suporte Plano Mensal:</strong> O prazo estimado de primeira resposta é de 
        {category === 'payment' ? (
          <span> <strong>até 12 horas úteis</strong> para questões de pagamentos.</span>
        ) : (
          <span> <strong>até 24 horas úteis</strong> para dúvidas técnicas ou gerais.</span>
        )}
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm transition-opacity">
      <div className="bg-white rounded-3xl max-w-lg w-full overflow-hidden shadow-2xl flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-center justify-between bg-brand-primary text-white">
          <div>
            <h3 className="text-lg font-bold font-display">Novo Chamado</h3>
            <p className="text-white/80 text-xs mt-0.5">Fale com a equipe do Evolução Clínica</p>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-full hover:bg-white/10 text-white/95 hover:text-white transition-colors"
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="bg-rose-50 text-rose-700 p-3.5 rounded-2xl border border-rose-100 text-xs flex items-center space-x-2">
              <AlertCircle size={16} className="shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {slaMessage}

          {/* Subject */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-brand-text uppercase tracking-wide">Assunto</label>
            <input
              type="text"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Ex: Erro ao gerar PDI do paciente"
              required
              disabled={loading}
              className="w-full px-4 py-3 rounded-2xl border border-brand-border focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all text-sm"
            />
          </div>

          {/* Category */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-brand-text uppercase tracking-wide">Categoria</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as SupportTicketCategory)}
              disabled={loading}
              className="w-full px-4 py-3 rounded-2xl border border-brand-border focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all text-sm bg-white"
            >
              <option value="general">Dúvida Geral</option>
              <option value="technical">Problema Técnico</option>
              <option value="payment">Pagamento & Cobrança</option>
              <option value="account">Minha Conta & Acesso</option>
            </select>
          </div>

          {/* Message/Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-brand-text uppercase tracking-wide">Como podemos ajudar?</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Descreva detalhadamente o problema ou dúvida..."
              rows={4}
              required
              disabled={loading}
              className="w-full px-4 py-3 rounded-2xl border border-brand-border focus:border-brand-primary focus:ring-2 focus:ring-brand-primary/20 outline-none transition-all text-sm resize-none"
            />
          </div>

          {/* File Attachment */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-brand-text uppercase tracking-wide block">Anexo (opcional)</label>
            <div className="flex items-center space-x-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                disabled={loading}
                className="hidden"
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="px-4 py-2.5 rounded-2xl border border-dashed border-gray-300 hover:border-brand-primary text-gray-600 hover:text-brand-primary font-medium text-xs flex items-center space-x-2 transition-all"
              >
                <Paperclip size={14} />
                <span>{file ? 'Trocar arquivo' : 'Selecionar arquivo (Máx 10MB)'}</span>
              </button>

              {file && (
                <div className="flex items-center space-x-1.5 bg-gray-50 border border-gray-200 px-3 py-2 rounded-2xl max-w-[200px] md:max-w-[250px]">
                  <span className="text-xs text-gray-700 truncate font-medium flex-1">{file.name}</span>
                  <button
                    type="button"
                    onClick={handleRemoveFile}
                    className="p-0.5 rounded-full hover:bg-gray-200 text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end space-x-3">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="px-5 py-2.5 rounded-2xl text-gray-500 hover:text-gray-700 font-bold text-sm transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="px-6 py-2.5 bg-brand-primary hover:bg-brand-primary-hover disabled:bg-brand-primary/50 text-white font-bold rounded-2xl text-sm transition-all shadow-md hover:shadow-lg flex items-center justify-center space-x-2"
          >
            {loading ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                <span>Enviando...</span>
              </>
            ) : (
              <span>Abrir Chamado</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
