import React, { useEffect, useMemo, useRef, useState } from 'react';
import { X, ShieldCheck, Lock, FileText, Calendar, AlertTriangle, ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

type GoogleSecurityModalMode = 'login' | 'clinical' | 'calendar';

interface GoogleSecurityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  confirmLabel?: string;
  mode?: GoogleSecurityModalMode;
}

type ModalSlide = {
  eyebrow: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ size?: number; className?: string }>;
  accentClasses: string;
  iconClasses: string;
};

const slidesByMode: Record<GoogleSecurityModalMode, {
  headerTitle: string;
  headerSubtitle: string;
  confirmationLabel: string;
  slides: ModalSlide[];
}> = {
  login: {
    headerTitle: 'Segurança antes de conectar',
    headerSubtitle: 'Nesta primeira etapa, pedimos apenas o acesso mínimo para você autenticar sua conta com segurança.',
    confirmationLabel: 'Continuar para o Google',
    slides: [
      {
        eyebrow: 'Escopo mínimo',
        title: 'O primeiro acesso usa somente o Drive essencial',
        description: 'Nesta etapa, o app pede apenas o escopo necessário para criar e acessar arquivos vinculados à própria plataforma. Seus arquivos pessoais continuam fora do alcance.',
        icon: Lock,
        accentClasses: 'bg-brand-primary/10 text-brand-primary border-brand-primary/15',
        iconClasses: 'bg-white text-brand-primary',
      },
      {
        eyebrow: 'Autorização em camadas',
        title: 'Permissões adicionais aparecem só quando forem necessárias',
        description: 'O acesso ao prontuário, à organização de pastas e à agenda é solicitado em etapas separadas, para que você veja exatamente o motivo de cada pedido.',
        icon: Sparkles,
        accentClasses: 'bg-brand-accent/10 text-brand-primary border-brand-accent/15',
        iconClasses: 'bg-white text-brand-primary',
      },
      {
        eyebrow: 'Proteção',
        title: 'A plataforma não acessa seus arquivos pessoais',
        description: 'O app não navega pela sua conta inteira. A leitura e a escrita ficam limitadas ao fluxo clínico que você criar dentro da própria plataforma.',
        icon: FileText,
        accentClasses: 'bg-blue-50 text-blue-700 border-blue-100',
        iconClasses: 'bg-white text-blue-600',
      },
      {
        eyebrow: 'Controle',
        title: 'Você pode revogar tudo a qualquer momento',
        description: 'Se quiser, basta remover o acesso nas configurações da sua conta Google. O controle continua sendo seu o tempo todo.',
        icon: AlertTriangle,
        accentClasses: 'bg-amber-50 text-amber-700 border-amber-100',
        iconClasses: 'bg-white text-amber-600',
      },
    ],
  },
  clinical: {
    headerTitle: 'Conectar prontuário e arquivos clínicos',
    headerSubtitle: 'Nesta etapa, o app pede acesso ao Drive necessário para organizar pastas e editar os prontuários que fazem parte do fluxo clínico.',
    confirmationLabel: 'Conectar para prontuários',
    slides: [
      {
        eyebrow: 'Drive do fluxo clínico',
        title: 'Acesso apenas aos arquivos usados pela plataforma',
        description: 'Usamos o escopo do Drive para trabalhar com os arquivos vinculados ao app. Isso permite criar documentos, abrir prontuários e organizar a estrutura da clínica.',
        icon: Lock,
        accentClasses: 'bg-brand-primary/10 text-brand-primary border-brand-primary/15',
        iconClasses: 'bg-white text-brand-primary',
      },
      {
        eyebrow: 'Prontuários',
        title: 'Os documentos do paciente ficam dentro do seu controle',
        description: 'O app cria e atualiza o prontuário do paciente dentro do arquivo que pertence ao fluxo da plataforma. Nada é feito em arquivos aleatórios da sua conta.',
        icon: FileText,
        accentClasses: 'bg-brand-accent/10 text-brand-primary border-brand-accent/15',
        iconClasses: 'bg-white text-brand-primary',
      },
      {
        eyebrow: 'Organização',
        title: 'Listagem e busca servem para navegar nas pastas do app',
        description: 'Quando exibimos pastas e documentos, é somente para você localizar o material clínico que já está no fluxo. Não há varredura da sua conta inteira.',
        icon: Sparkles,
        accentClasses: 'bg-blue-50 text-blue-700 border-blue-100',
        iconClasses: 'bg-white text-blue-600',
      },
      {
        eyebrow: 'Segurança',
        title: 'O acesso pode ser revogado a qualquer momento',
        description: 'Se você desconectar o Google depois, o app para de operar sobre esses arquivos até uma nova autorização sua.',
        icon: AlertTriangle,
        accentClasses: 'bg-amber-50 text-amber-700 border-amber-100',
        iconClasses: 'bg-white text-amber-600',
      },
    ],
  },
  calendar: {
    headerTitle: 'Conectar Google Agenda',
    headerSubtitle: 'Aqui o acesso é somente de leitura para sincronizar compromissos e relacioná-los ao acompanhamento clínico.',
    confirmationLabel: 'Conectar com agenda',
    slides: [
      {
        eyebrow: 'Leitura apenas',
        title: 'O app lê eventos, mas não altera sua agenda',
        description: 'A permissão é usada para consultar os compromissos e cruzá-los com pacientes e evoluções. Não criamos, editamos nem excluímos eventos.',
        icon: Calendar,
        accentClasses: 'bg-brand-primary/10 text-brand-primary border-brand-primary/15',
        iconClasses: 'bg-white text-brand-primary',
      },
      {
        eyebrow: 'Sincronização',
        title: 'A agenda ajuda a localizar atendimentos rapidamente',
        description: 'Ao ler os eventos, a plataforma identifica atendimentos relacionados aos pacientes ativos e acelera a rotina de conferência.',
        icon: Sparkles,
        accentClasses: 'bg-brand-accent/10 text-brand-primary border-brand-accent/15',
        iconClasses: 'bg-white text-brand-primary',
      },
      {
        eyebrow: 'Sem escrita',
        title: 'Nenhuma alteração é enviada para o Google Calendar',
        description: 'Essa conexão serve só para leitura. Seu calendário continua exatamente como está no Google.',
        icon: Lock,
        accentClasses: 'bg-blue-50 text-blue-700 border-blue-100',
        iconClasses: 'bg-white text-blue-600',
      },
      {
        eyebrow: 'Controle',
        title: 'Você continua podendo revogar o acesso quando quiser',
        description: 'Caso não queira mais sincronizar a agenda, remova a permissão da conta Google e o app para de consultar os eventos.',
        icon: AlertTriangle,
        accentClasses: 'bg-amber-50 text-amber-700 border-amber-100',
        iconClasses: 'bg-white text-amber-600',
      },
    ],
  },
};

export const GoogleSecurityModal: React.FC<GoogleSecurityModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  confirmLabel,
  mode = 'login',
}) => {
  const [currentSlide, setCurrentSlide] = useState(0);
  const [dragOffset, setDragOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchCurrentX = useRef(0);

  const modalConfig = useMemo(() => slidesByMode[mode], [mode]);
  const { slides } = modalConfig;

  useEffect(() => {
    if (isOpen) {
      setCurrentSlide(0);
      setDragOffset(0);
      setIsDragging(false);
    }
  }, [isOpen]);

  useEffect(() => {
    setDragOffset(0);
    setIsDragging(false);
  }, [currentSlide]);

  if (!isOpen) return null;

  const isLastSlide = currentSlide === slides.length - 1;
  const swipeThreshold = 60;

  const handleTouchStart = (event: React.TouchEvent) => {
    touchStartX.current = event.touches[0].clientX;
    touchCurrentX.current = event.touches[0].clientX;
    touchStartY.current = event.touches[0].clientY;
    setIsDragging(true);
  };

  const handleTouchMove = (event: React.TouchEvent) => {
    if (!isDragging) return;

    const touch = event.touches[0];
    const deltaX = touch.clientX - touchStartX.current;
    const deltaY = touch.clientY - touchStartY.current;

    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      return;
    }

    touchCurrentX.current = touch.clientX;
    setDragOffset(deltaX);
  };

  const handleTouchEnd = () => {
    const deltaX = touchCurrentX.current - touchStartX.current;

    if (deltaX <= -swipeThreshold && currentSlide < slides.length - 1) {
      setCurrentSlide((prev) => Math.min(slides.length - 1, prev + 1));
    } else if (deltaX >= swipeThreshold && currentSlide > 0) {
      setCurrentSlide((prev) => Math.max(0, prev - 1));
    } else {
      setDragOffset(0);
      setIsDragging(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col border border-brand-border animate-in zoom-in-95 duration-200">
        <div className="p-6 border-b border-brand-border flex items-center justify-between bg-stone-50/50">
          <div className="flex items-center space-x-2 text-brand-primary font-display font-bold text-lg">
            <ShieldCheck className="text-brand-primary stroke-[2]" size={24} />
            <span>{modalConfig.headerTitle}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-red-50 hover:text-red-500 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-5 overflow-hidden">
          <div className="text-center space-y-2">
            <h3 className="font-display font-extrabold text-brand-primary text-xl">
              {modalConfig.headerTitle}
            </h3>
            <p className="text-sm text-brand-text-muted leading-relaxed max-w-xl mx-auto">
              {modalConfig.headerSubtitle}
            </p>
          </div>

          <div
            className="overflow-hidden select-none"
            style={{ touchAction: 'pan-y' }}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onTouchCancel={handleTouchEnd}
          >
            <div
              className="flex items-stretch"
              style={{
                transform: `translateX(calc(-${currentSlide * 100}% + ${dragOffset}px))`,
                transition: isDragging ? 'none' : 'transform 300ms ease-out',
              }}
            >
              {slides.map((slide) => {
                const SlideIcon = slide.icon;
                return (
                  <div key={slide.title} className="w-full flex-shrink-0 px-1 h-full">
                    <div className={`h-full min-h-[280px] sm:min-h-[300px] rounded-3xl border p-5 sm:p-6 flex flex-col justify-between gap-4 ${slide.accentClasses}`}>
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

        <div className="p-6 bg-stone-50 border-t border-brand-border flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs text-brand-text-muted">
            <span>Slide {currentSlide + 1} de {slides.length}</span>
            <span>{isLastSlide ? 'Você pode prosseguir' : 'Leia com calma antes de avançar'}</span>
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
                {confirmLabel || modalConfig.confirmationLabel}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
