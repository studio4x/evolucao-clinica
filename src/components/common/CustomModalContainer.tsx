import React, { useEffect } from 'react';
import { useModalStore } from '../../store/modalStore';
import { 
  Shield, 
  Download, 
  Copy, 
  AlertTriangle, 
  X, 
  Check, 
  Info, 
  HelpCircle, 
  Trash2 
} from 'lucide-react';

export const CustomModalContainer: React.FC = () => {
  const { 
    isOpen, 
    type, 
    title, 
    message, 
    confirmLabel, 
    cancelLabel, 
    variant, 
    icon, 
    inputValue, 
    setInputValue, 
    placeholder, 
    close 
  } = useModalStore();

  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (type === 'confirm' || type === 'prompt') {
          close(false);
        } else {
          close(true);
        }
      } else if (event.key === 'Enter' && type === 'alert') {
        close(true);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, type, close]);

  if (!isOpen) return null;

  // Icon mapping
  const renderIcon = () => {
    const size = 22;
    switch (icon) {
      case 'shield': return <Shield size={size} />;
      case 'download': return <Download size={size} />;
      case 'copy': return <Copy size={size} />;
      case 'trash': return <Trash2 size={size} />;
      case 'warning': return <AlertTriangle size={size} />;
      case 'success': return <Check size={size} />;
      case 'check': return <Check size={size} />;
      case 'question': return <HelpCircle size={size} />;
      case 'info':
      default: return <Info size={size} />;
    }
  };

  // Color classes for variants
  const getVariantClasses = () => {
    switch (variant) {
      case 'danger':
        return {
          iconBg: 'bg-red-50 text-red-600',
          btnConfirm: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
          titleColor: 'text-red-950',
          badgeText: 'Ação Crítica'
        };
      case 'warning':
        return {
          iconBg: 'bg-amber-50 text-amber-600',
          btnConfirm: 'bg-amber-500 hover:bg-amber-600 text-white focus:ring-amber-500',
          titleColor: 'text-amber-950',
          badgeText: 'Atenção'
        };
      case 'success':
        return {
          iconBg: 'bg-emerald-50 text-emerald-600',
          btnConfirm: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500',
          titleColor: 'text-emerald-950',
          badgeText: 'Sucesso'
        };
      case 'info':
      default:
        return {
          iconBg: 'bg-brand-primary/10 text-brand-primary',
          btnConfirm: 'bg-brand-primary hover:bg-brand-primary-hover text-white focus:ring-brand-primary',
          titleColor: 'text-brand-text',
          badgeText: 'Informação'
        };
    }
  };

  const colors = getVariantClasses();

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 sm:p-6 animate-fadeIn"
      onClick={() => close(type === 'confirm' || type === 'prompt' ? false : true)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="global-custom-modal-title"
        className="w-full max-w-lg overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200"
        onClick={(event) => event.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start gap-4 border-b border-brand-border bg-brand-bg/50 px-5 py-5 sm:px-6">
          <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${colors.iconBg}`}>
            {renderIcon()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">
              {colors.badgeText}
            </p>
            <h3 id="global-custom-modal-title" className={`text-lg font-display font-bold leading-tight sm:text-xl ${colors.titleColor}`}>
              {title}
            </h3>
          </div>
          <button
            type="button"
            aria-label="Fechar"
            onClick={() => close(type === 'confirm' || type === 'prompt' ? false : true)}
            className="shrink-0 rounded-xl p-2 text-stone-400 transition-colors hover:bg-white hover:text-stone-700 cursor-pointer"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-4 px-5 py-6 sm:px-6">
          <p className="text-sm leading-relaxed text-brand-text-muted sm:text-[15px] whitespace-pre-line">
            {message}
          </p>

          {type === 'prompt' && (
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={placeholder}
              className="w-full mt-2 min-h-11 rounded-xl border border-brand-border bg-white px-4 py-2.5 text-sm text-brand-text focus:outline-none focus:border-brand-primary"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  close(true);
                }
              }}
            />
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-col-reverse gap-2 border-t border-brand-border bg-brand-bg/30 px-5 py-4 sm:flex-row sm:justify-end sm:gap-3 sm:px-6">
          {(type === 'confirm' || type === 'prompt') && (
            <button
              type="button"
              onClick={() => close(false)}
              className="min-h-11 rounded-xl border border-brand-border bg-white px-5 py-2.5 text-sm font-semibold text-brand-text-muted transition-colors hover:bg-brand-bg cursor-pointer"
            >
              {cancelLabel}
            </button>
          )}
          <button
            type="button"
            autoFocus={type !== 'prompt'}
            onClick={() => close(true)}
            className={`min-h-11 rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-offset-2 ${colors.btnConfirm}`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
