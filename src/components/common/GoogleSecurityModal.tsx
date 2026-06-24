import React from 'react';
import { X, ShieldCheck, Lock, EyeOff, FileText, Calendar, AlertTriangle } from 'lucide-react';

interface GoogleSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

export const GoogleSecurityModal: React.FC<GoogleSecurityModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-lg rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-brand-border animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-brand-border flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center space-x-2 text-brand-primary font-display font-bold text-lg">
            <ShieldCheck className="text-brand-primary stroke-[2]" size={24} />
            <span>Segurança & Privacidade</span>
          </div>
          <button 
            type="button" 
            onClick={onClose} 
            className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6 overflow-y-auto max-h-[70vh]">
          <div className="text-center space-y-2">
            <h3 className="font-display font-extrabold text-brand-primary text-xl">
              Como protegemos seus dados do Google?
            </h3>
            <p className="text-sm text-brand-text-muted leading-relaxed">
              Para automatizar seus prontuários e agenda, o Google exige certas permissões. Explicamos de forma clara e transparente o que cada uma faz:
            </p>
          </div>

          <div className="space-y-4">
            {/* Item 1: Drive */}
            <div className="flex items-start space-x-3.5 p-4 bg-brand-primary/5 rounded-2xl border border-brand-primary/10">
              <div className="p-2 bg-white rounded-xl text-brand-primary shadow-xs mt-0.5">
                <Lock size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-brand-primary">Acesso Restrito ao Google Drive</h4>
                <p className="text-xs text-brand-text-muted leading-relaxed">
                  O aplicativo utiliza a permissão restrita <code>drive.file</code>. Isso significa que somos <strong>completamente cegos</strong> para suas fotos, planilhas ou documentos que já estavam lá. Apenas acessamos os arquivos que a própria plataforma criar.
                </p>
              </div>
            </div>

            {/* Item 2: Docs */}
            <div className="flex items-start space-x-3.5 p-4 bg-brand-accent/5 rounded-2xl border border-brand-accent/10">
              <div className="p-2 bg-white rounded-xl text-brand-accent shadow-xs mt-0.5">
                <FileText size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-brand-primary">Prontuários sob seu controle</h4>
                <p className="text-xs text-brand-text-muted leading-relaxed">
                  Criamos e salvamos apenas o documento de prontuário dos pacientes que você cadastrar. A IA apenas escreve a evolução clínica quando você autoriza a gravação. Nenhum outro documento pessoal será modificado.
                </p>
              </div>
            </div>

            {/* Item 3: Calendar */}
            <div className="flex items-start space-x-3.5 p-4 bg-blue-50/50 rounded-2xl border border-blue-100">
              <div className="p-2 bg-white rounded-xl text-blue-600 shadow-xs mt-0.5">
                <Calendar size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-brand-primary">Sincronização de Agenda (Apenas Leitura)</h4>
                <p className="text-xs text-brand-text-muted leading-relaxed">
                  Buscamos os horários das consultas apenas para associar com os seus pacientes e preencher o prontuário de forma automática. Esta permissão é de <strong>apenas leitura</strong>; não alteramos e não excluímos nenhum evento da sua agenda.
                </p>
              </div>
            </div>

            {/* Item 4: Risco Zero */}
            <div className="flex items-start space-x-3.5 p-4 bg-amber-50/50 rounded-2xl border border-amber-100">
              <div className="p-2 bg-white rounded-xl text-amber-600 shadow-xs mt-0.5">
                <AlertTriangle size={18} />
              </div>
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-brand-primary">Risco Zero de Exclusão</h4>
                <p className="text-xs text-brand-text-muted leading-relaxed">
                  A nossa plataforma <strong>não possui instruções ou permissões</strong> para apagar ou mover qualquer arquivo da sua conta pessoal do Google Drive. Seus arquivos pessoais estão 100% seguros.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-stone-50 border-t border-brand-border flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="btn-outline flex-grow text-center py-2.5 text-sm"
          >
            Voltar
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="btn-primary flex-grow text-center py-2.5 text-sm"
          >
            Entendi, Prosseguir
          </button>
        </div>

      </div>
    </div>
  );
};
