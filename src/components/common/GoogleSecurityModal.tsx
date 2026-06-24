import React, { useEffect, useMemo, useState } from 'react';
import { X, ShieldCheck, Lock, FileText, Calendar, AlertTriangle, ChevronLeft, ChevronRight } from 'lucide-react';

interface GoogleSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
}

export const GoogleSecurityModal: React.FC<GoogleSecurityModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  confirmLabel = 'Autenticar com Google',
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);

  const slides = useMemo(() => ([
    {
      eyebrow: 'Escopo mínimo',
      title: 'O app não enxerga seus arquivos pessoais',
      description: 'Usamos a permissão restrita do Google Drive para acessar apenas arquivos que a própria plataforma cria. Fotos, PDFs, planilhas e documentos antigos continuam fora do alcance do app.',
      icon: Lock,
      accentClasses: 'bg-brand-primary/10 text-brand-primary border-brand-primary/15',
      iconClasses: 'bg-white text-brand-primary'
    },
    {
      eyebrow: 'Prontuários',
      title: 'Somente os documentos do paciente são alterados',
      description: 'Quando você cria ou atualiza um prontuário, a plataforma escreve apenas no documento daquele paciente. A IA não navega pela sua conta e não mexe em arquivos que não pertencem ao fluxo clínico.',
      icon: FileText,
      accentClasses: 'bg-brand-accent/10 text-brand-primary border-brand-accent/15',
      iconClasses: 'bg-white text-brand-primary'
    },
    {
      eyebrow: 'Agenda',
      title: 'A sincronização é apenas leitura',
      description: 'A leitura do Google Agenda serve só para associar compromissos aos pacientes e acelerar o trabalho. Não criamos, editamos nem excluímos eventos da sua agenda.',
      icon: Calendar,
      accentClasses: 'bg-blue-50 text-blue-700 border-blue-100',
      iconClasses: 'bg-white text-blue-600'
    },
    {
      eyebrow: 'Proteção total',
      title: 'Nenhum arquivo será apagado pela plataforma',
      description: 'A automação foi desenhada para registrar e organizar, nunca para destruir. Você mantém o controle e pode revogar o acesso ao Google a qualquer momento.',
      icon: AlertTriangle,
      accentClasses: 'bg-amber-50 text-amber-700 border-amber-100',
      iconClasses: 'bg-white text-amber-600'
    }
  ]), []);

  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const isLastSlide = currentSlide === slides.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-brand-border animate-in zoom-in-95 duration-200">
        
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
        <div className="p-6 space-y-5 overflow-hidden">
          <div className="text-center space-y-2">
            <h3 className="font-display font-extrabold text-brand-primary text-xl">
              Antes de conectar sua conta Google
            </h3>
            <p className="text-sm text-brand-text-muted leading-relaxed max-w-xl mx-auto">
              Veja por que o app pede acesso e o que ele realmente faz com seus dados. Você só avança quando estiver confortável.
            </p>
          </div>

          <div className="overflow-hidden">
            <div
              className="flex transition-transform duration-300 ease-out"
              style={{ transform: `translateX(-${currentSlide * 100}%)` }}
            >
              {slides.map((slide) => {
                const SlideIcon = slide.icon;
                return (
                  <div key={slide.title} className="w-full flex-shrink-0 px-1">
                    <div className={`rounded-3xl border p-5 sm:p-6 ${slide.accentClasses}`}>
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-2xl shadow-sm ${slide.iconClasses}`}>
                          <SlideIcon size={22} />
                        </div>
                        <div className="space-y-2">
                          <span className="text-[11px] font-bold uppercase tracking-[0.18em] opacity-75">
                            {slide.eyebrow}
                          </span>
                          <h4 className="text-lg sm:text-xl font-display font-bold text-brand-primary">
                            {slide.title}
                          </h4>
                          <p className="text-sm text-brand-text-muted leading-relaxed">
                            {slide.description}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-center gap-2">
            {slides.map((slide, index) => (
              <button
                key={slide.title}
                type="button"
                onClick={() => setCurrentSlide(index)}
                className={`h-2.5 rounded-full transition-all ${
                  index === currentSlide ? 'w-8 bg-brand-primary' : 'w-2.5 bg-brand-border hover:bg-brand-primary/40'
                }`}
                aria-label={`Ir para o slide ${index + 1}`}
              />
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="p-6 bg-stone-50 border-t border-brand-border flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-brand-text-muted">
            <span>Slide {currentSlide + 1} de {slides.length}</span>
            <span>{isLastSlide ? 'Você pode seguir para o Google' : 'Leia com calma antes de avançar'}</span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                if (currentSlide === 0) {
                  onClose();
                  return;
                }
                setCurrentSlide((prev) => Math.max(0, prev - 1));
              }}
              className="btn-outline flex items-center justify-center gap-2 flex-1 py-2.5 text-sm"
            >
              <ChevronLeft size={16} />
              {currentSlide === 0 ? 'Fechar' : 'Voltar'}
            </button>

            {!isLastSlide ? (
              <button
                type="button"
                onClick={() => setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1))}
                className="btn-primary flex items-center justify-center gap-2 flex-1 py-2.5 text-sm"
              >
                Próximo
                <ChevronRight size={16} />
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className="btn-primary flex items-center justify-center gap-2 flex-1 py-2.5 text-sm"
              >
                {confirmLabel}
              </button>
            )}
          </div>
        </div>

      </div>
    </div>
  );
};
