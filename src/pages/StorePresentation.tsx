import React, { useState, useRef } from 'react';
import { Heart, Cloud, Upload, Trash2, Printer, Image as ImageIcon, Sparkles, Check, RefreshCw, LayoutGrid, Smartphone } from 'lucide-react';
import { useSiteConfig } from '../hooks/useSiteConfig';

// Custom SVG Caduceus Icon
const CaduceusIcon = ({ className = "w-6 h-6" }: { className?: string }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
  >
    <line x1="12" y1="2" x2="12" y2="22" strokeWidth="2.2" />
    <path d="M12 5c-2.5-2.5-6.5-2-7.5.5.5 1.5 3.5 2.5 7.5.5M12 5c2.5-2.5 6.5-2 7.5.5-.5 1.5-3.5 2.5-7.5.5" fill="currentColor" fillOpacity="0.1" />
    <path d="M8.5 7.5c1-1 2.5.5 3.5 1.5s1 2.5 0 3.5-3.5 2-3.5 3.5c0 1.5 1.5 2.5 3.5 1.5.7-.4 1.4-1.2 2-1.7" />
    <path d="M15.5 7.5c-1-1-2.5.5-3.5 1.5s-1 2.5 0 3.5 3.5 2 3.5 3.5c0 1.5-1.5 2.5-3.5 1.5-.7-.4-1.4-1.2-2-1.7" />
    <circle cx="12" cy="2" r="1.2" fill="currentColor" />
  </svg>
);

// Google Play Colored Logo
const GooglePlayLogo = ({ className = "w-4 h-4" }: { className?: string }) => (
  <svg viewBox="0 0 24 24" className={className}>
    <g>
      <path d="M3 2.5a2 2 0 0 0-2 2v15a2 2 0 0 0 2 2l11-9.5z" fill="#00E676" />
      <path d="M14 12L3 22a2 2 0 0 0 .5-.1l14.8-8.5c.7-.4.7-1.4 0-1.8L3.5 3.1A2 2 0 0 0 3 3z" fill="#FFC107" />
      <path d="M3 2.5a2 2 0 0 0-.5.5l11.5 9 5.8-3.4c.7-.4.7-1.4 0-1.8z" fill="#FF3D00" />
      <path d="M3 21.5l11.5-9-11.5-9c-.5.5-.5 1.5 0 2z" fill="#1565C0" />
    </g>
  </svg>
);

// Curved wave SVG boundary component
const WaveDecoration = ({ fillColor }: { fillColor: string }) => (
  <svg
    viewBox="0 0 100 100"
    fill={fillColor}
    className="absolute bottom-0 left-0 w-full h-[25%] translate-y-[98%] z-0 pointer-events-none transition-colors duration-300"
    preserveAspectRatio="none"
  >
    <path d="M0 0 L 100 0 L 100 35 C 75 75, 25 15, 0 50 Z" />
  </svg>
);

interface CardData {
  id: number;
  title: string;
  description: string;
  defaultPlaceholder: string;
  defaultScreenType: 'empty' | 'form' | 'calendar' | 'security';
  icons: Array<'heart' | 'caduceus' | 'checkmark' | 'cloud'>;
}

export default function StorePresentation() {
  const siteConfig = useSiteConfig();
  const [cardImages, setCardImages] = useState<Record<number, string>>({});
  const [gradientType, setGradientType] = useState<'teal-white' | 'green-white' | 'teal-dark'>('green-white');
  const [viewMode, setViewMode] = useState<'board' | 'individual'>('board');
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Five App Store Panels data as requested
  const cards: CardData[] = [
    {
      id: 1,
      title: "PRONTUÁRIO ELETRÔNICO NA PALMA DA MÃO",
      description: "Evoluções clínicas rápidas, seguras e em qualquer lugar.",
      defaultPlaceholder: "[CAPTURAS DO SEU APP AQUI]",
      defaultScreenType: 'empty',
      icons: ['heart', 'caduceus']
    },
    {
      id: 2,
      title: "EVOLUÇÕES EM POUCOS CLIQUES",
      description: "Preenchimento rápido e modelos personalizados.",
      defaultPlaceholder: "Formulário de Evolução",
      defaultScreenType: 'form',
      icons: ['caduceus', 'checkmark']
    },
    {
      id: 3,
      title: "AGENDA INTEGRADA E INTELIGENTE",
      description: "Controle seus horários e atendimentos sem complicações.",
      defaultPlaceholder: "[CAPTURAS DO SEU APP AQUI]",
      defaultScreenType: 'empty',
      icons: ['heart', 'checkmark']
    },
    {
      id: 4,
      title: "HISTÓRICO COMPLETO DO PACIENTE",
      description: "Acesse o passado clínico com um toque, de forma 100% segura.",
      defaultPlaceholder: "Agenda de Pacientes",
      defaultScreenType: 'calendar',
      icons: ['checkmark']
    },
    {
      id: 5,
      title: "DADOS SEGUROS E EM NUVEM",
      description: "Criptografia de ponta e acesso em qualquer dispositivo.",
      defaultPlaceholder: "Segurança de Acesso",
      defaultScreenType: 'security',
      icons: ['cloud', 'checkmark']
    }
  ];

  const handleImageUpload = (cardId: number, file: File) => {
    if (file && file.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          setCardImages(prev => ({
            ...prev,
            [cardId]: e.target!.result as string
          }));
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const triggerFileSelect = (cardId: number) => {
    fileInputRefs.current[cardId]?.click();
  };

  const removeImage = (cardId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setCardImages(prev => {
      const updated = { ...prev };
      delete updated[cardId];
      return updated;
    });
  };

  const handlePaste = (cardId: number, e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          const blob = items[i].getAsFile();
          if (blob) {
            handleImageUpload(cardId, blob);
            e.preventDefault();
            break;
          }
        }
      }
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Get primary brand colors
  const primaryColor = siteConfig.colors.primary;
  const primaryHoverColor = siteConfig.colors.primary_hover;
  const accentColor = siteConfig.colors.accent;

  const getGradientColors = () => {
    switch (gradientType) {
      case 'green-white':
        return { start: primaryColor, end: primaryHoverColor || '#00470e' };
      case 'teal-dark':
        return { start: '#042f2b', end: '#09423b' };
      case 'teal-white':
      default:
        return { start: '#0a3d36', end: '#104e45' };
    }
  };

  const getCardBgStyle = () => {
    const { start, end } = getGradientColors();
    return {
      backgroundImage: `linear-gradient(to bottom, ${start}, ${end})`
    };
  };

  const getDotPatternColor = () => {
    return gradientType === 'teal-dark' ? 'rgba(255, 255, 255, 0.04)' : `${primaryColor}0c`;
  };

  const getCornerBorderColorStyle = () => {
    if (gradientType === 'teal-dark') return { borderColor: 'rgba(45, 212, 191, 0.25)' };
    return { borderColor: `${primaryColor}29` }; // ~16% opacity
  };

  const renderFloatingIcons = (icons: CardData['icons']) => {
    return (
      <div className="absolute inset-0 pointer-events-none overflow-hidden z-10">
        {icons.includes('heart') && (
          <div className="absolute top-[32%] left-[6%] animate-pulse opacity-20 duration-[3s]">
            <Heart className="w-8 h-8 text-rose-500 fill-rose-500/20 filter drop-shadow-md" />
          </div>
        )}
        {icons.includes('caduceus') && (
          <div className="absolute top-[26%] right-[6%] opacity-20 rotate-12">
            <CaduceusIcon className="w-10 h-10 text-emerald-500 filter drop-shadow-md" />
          </div>
        )}
        {icons.includes('checkmark') && (
          <div className="absolute bottom-[35%] right-[7%] opacity-20 scale-110">
            <div className="p-2 bg-emerald-500/20 rounded-full border border-emerald-500/30">
              <Check className="w-6 h-6 text-emerald-600" strokeWidth={3} />
            </div>
          </div>
        )}
        {icons.includes('cloud') && (
          <div className="absolute bottom-[40%] left-[8%] opacity-20 -rotate-6">
            <Cloud className="w-9 h-9 text-teal-500 fill-teal-500/10 filter drop-shadow-md" />
          </div>
        )}
        {icons.includes('heart') && icons.includes('checkmark') && (
          <div className="absolute bottom-[28%] left-[7%] opacity-15">
            <Heart className="w-6 h-6 text-rose-400 fill-rose-400/15" />
          </div>
        )}
      </div>
    );
  };

  // Render high fidelity mock screens for cards when no user image is loaded
  const renderMockScreen = (type: CardData['defaultScreenType']) => {
    switch (type) {
      case 'form':
        return (
          <div className="w-full h-full bg-slate-50 flex flex-col text-left text-[9px] font-sans text-slate-800 select-none">
            {/* Status bar */}
            <div 
              className="h-3.5 text-white px-2 flex justify-between items-center text-[7px] font-medium shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              <span>09:41</span>
              <div className="flex gap-0.5 items-center">
                <span>5G</span>
                <span className="w-3 h-1.5 border border-white rounded-[1px] bg-white flex-none"></span>
              </div>
            </div>
            
            {/* Top app header */}
            <div className="bg-white border-b border-slate-200 px-2 py-1.5 flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center gap-1">
                <div 
                  className="w-4.5 h-4.5 rounded-full flex items-center justify-center text-white font-bold text-[7px] shrink-0"
                  style={{ backgroundColor: primaryColor }}
                >
                  EC
                </div>
                <div className="min-w-0">
                  <h4 
                    className="font-bold text-[8px] leading-none truncate"
                    style={{ color: primaryColor }}
                  >
                    Nova Evolução
                  </h4>
                  <span className="text-[5.5px] text-slate-400 block truncate">Paciente: Ana Maria</span>
                </div>
              </div>
              <span 
                className="text-[5px] px-1 py-0.5 rounded font-bold shrink-0"
                style={{ 
                  backgroundColor: `${primaryColor}1f`, 
                  color: primaryColor 
                }}
              >
                EM ANDAMENTO
              </span>
            </div>

            {/* Form body */}
            <div className="p-2 flex-1 overflow-hidden flex flex-col gap-1.5 min-h-0">
              {/* Patient info box */}
              <div className="bg-white p-1.5 rounded border border-slate-100 shadow-2xs space-y-0.5 shrink-0">
                <div className="flex justify-between items-center text-[6px] text-slate-400">
                  <span>Plano Clínico</span>
                  <span>Sessão 4 de 10</span>
                </div>
                <div className="font-bold text-slate-700 text-[8px] leading-tight">Fisioterapia Ortopédica</div>
              </div>

              {/* Text evolution */}
              <div className="flex-1 flex flex-col min-h-0 min-w-0">
                <label className="text-[6px] text-slate-400 font-bold uppercase tracking-wider block mb-0.5">Evolução Clínica</label>
                <div className="bg-white p-1.5 rounded border border-slate-200 text-slate-650 font-normal leading-normal text-[6.5px] flex-1 overflow-hidden relative">
                  <p>Paciente relata melhora significativa na dor lombar (EVA de 7 para 3) após última sessão de mobilizações articulares.</p>
                  <p className="mt-1">Realizado hoje fortalecimento do complexo pélvico-lombar através de pranchas isométricas e pontes...</p>
                  <div className="absolute bottom-0 left-0 right-0 h-4 bg-gradient-to-t from-white to-transparent pointer-events-none"></div>
                </div>
              </div>

              {/* Sliders and fields */}
              <div className="grid grid-cols-2 gap-1.5 shrink-0">
                <div className="bg-white p-1 rounded border border-slate-100">
                  <span className="text-[5.5px] text-slate-400 block font-bold leading-none">DOR (EVA)</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[7.5px] font-bold" style={{ color: primaryColor }}>3/10</span>
                    <div className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="w-[30%] h-full rounded-full" style={{ backgroundColor: primaryColor }}></div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-1 rounded border border-slate-100">
                  <span className="text-[5.5px] text-slate-400 block font-bold leading-none">MOBILIDADE</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[7.5px] font-bold" style={{ color: primaryColor }}>85%</span>
                    <div className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="w-[85%] h-full rounded-full" style={{ backgroundColor: primaryColor }}></div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div className="flex gap-0.5 flex-wrap shrink-0">
                <span className="bg-teal-50 text-teal-700 text-[5.5px] px-1 py-0.5 rounded border border-teal-100 leading-none">Miofascial</span>
                <span className="bg-teal-50 text-teal-700 text-[5.5px] px-1 py-0.5 rounded border border-teal-100 leading-none">Lombar</span>
                <span className="bg-slate-100 text-slate-650 text-[5.5px] px-1 py-0.5 rounded border border-slate-200 leading-none">+3</span>
              </div>
            </div>

            {/* Footer with action button */}
            <div className="p-1.5 bg-white border-t border-slate-100 shrink-0">
              <button 
                type="button" 
                className="w-full text-white rounded py-1 text-[7.5px] font-bold shadow-xs flex items-center justify-center cursor-pointer"
                style={{ backgroundColor: primaryColor }}
              >
                <span>Salvar no Google Docs</span>
              </button>
            </div>
          </div>
        );

      case 'calendar':
        return (
          <div className="w-full h-full bg-slate-50 flex flex-col text-left text-[9px] font-sans text-slate-800 select-none">
            {/* Status bar */}
            <div 
              className="h-3.5 text-white px-2 flex justify-between items-center text-[7px] font-medium shrink-0"
              style={{ backgroundColor: primaryColor }}
            >
              <span>09:41</span>
              <div className="flex gap-0.5 items-center">
                <span>5G</span>
                <span className="w-3 h-1.5 border border-white rounded-[1px] bg-white flex-none"></span>
              </div>
            </div>
            
            {/* Top app header */}
            <div className="bg-white border-b border-slate-200 px-2 py-1.5 flex items-center justify-between shrink-0 shadow-sm">
              <h4 className="font-bold text-[8.5px]" style={{ color: primaryColor }}>Minha Agenda</h4>
              <div className="w-3.5 h-3.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-[7px]">🔔</div>
            </div>

            {/* Calendar header dates */}
            <div className="bg-white px-1.5 py-1 border-b border-slate-150 flex justify-between shrink-0 text-center text-[6px]">
              {['S', 'T', 'Q', 'Q', 'S', 'S'].map((day, idx) => {
                const dayNum = 6 + idx;
                const isSelected = dayNum === 8; // Wed selected
                return (
                  <div 
                    key={idx} 
                    className="w-5 py-0.5 rounded transition-colors"
                    style={isSelected ? { backgroundColor: primaryColor, color: '#fff', fontWeight: 'bold' } : { color: '#64748b' }}
                  >
                    <div className="text-[5px] uppercase">{day}</div>
                    <div className="text-[7.5px] mt-0.2">{dayNum}</div>
                  </div>
                );
              })}
            </div>

            {/* Schedule list */}
            <div className="p-1.5 flex-1 overflow-hidden flex flex-col gap-1 min-h-0">
              <div className="text-[5.5px] text-slate-400 font-bold uppercase tracking-wider pl-0.5 shrink-0">Próximos Clientes</div>
              
              {/* Item 1 */}
              <div 
                className="bg-white p-1.5 rounded border-y border-r border-slate-100 border-l-[2.5px] shadow-2xs flex justify-between items-center shrink-0"
                style={{ borderLeftColor: primaryColor }}
              >
                <div className="space-y-0.2 min-w-0">
                  <div className="text-[5.5px] font-bold" style={{ color: primaryColor }}>09:00 - 10:00</div>
                  <div className="font-bold text-slate-700 text-[7.5px] leading-tight truncate">Ana Maria Silva</div>
                  <div className="text-[5.5px] text-slate-400 truncate">Fisioterapia Ortopédica</div>
                </div>
                <span 
                  className="text-[4.5px] px-1 py-0.3 rounded font-bold border shrink-0"
                  style={{ 
                    backgroundColor: `${primaryColor}12`, 
                    color: primaryColor, 
                    borderColor: `${primaryColor}1f` 
                  }}
                >
                  CONFIRMADO
                </span>
              </div>

              {/* Item 2 */}
              <div className="bg-white p-1.5 rounded border-l-[2.5px] border-l-sky-500 border-y border-r border-slate-100 shadow-2xs flex justify-between items-center shrink-0">
                <div className="space-y-0.2 min-w-0">
                  <div className="text-[5.5px] text-sky-600 font-bold">10:30 - 11:30</div>
                  <div className="font-bold text-slate-700 text-[7.5px] leading-tight truncate">João Carlos Medeiros</div>
                  <div className="text-[5.5px] text-slate-400 truncate">Quiropraxia Clínica</div>
                </div>
                <span className="bg-sky-50 text-sky-700 text-[4.5px] px-1 py-0.3 rounded font-bold border border-sky-100 shrink-0">EM CURSO</span>
              </div>

              {/* Item 3 */}
              <div className="bg-white p-1.5 rounded border-l-[2.5px] border-l-amber-500 border-y border-r border-slate-100 shadow-2xs flex justify-between items-center opacity-85 shrink-0">
                <div className="space-y-0.2 min-w-0">
                  <div className="text-[5.5px] text-amber-600 font-bold">14:00 - 15:00</div>
                  <div className="font-bold text-slate-700 text-[7.5px] leading-tight truncate">Roberta Costa</div>
                  <div className="text-[5.5px] text-slate-400 truncate">Avaliação Postural</div>
                </div>
                <span className="bg-amber-50 text-amber-700 text-[4.5px] px-1 py-0.3 rounded font-bold border border-amber-100 shrink-0">AGUARDANDO</span>
              </div>
            </div>
          </div>
        );

      case 'security':
        return (
          <div className="w-full h-full bg-slate-900 flex flex-col text-left text-[9px] font-sans text-slate-300 select-none">
            {/* Status bar */}
            <div className="h-3.5 bg-slate-950 text-slate-500 px-2 flex justify-between items-center text-[7px] font-medium shrink-0">
              <span>09:41</span>
              <div className="flex gap-0.5 items-center">
                <span>5G</span>
                <span className="w-3 h-1.5 border border-slate-700 rounded-[1px] bg-slate-500 flex-none"></span>
              </div>
            </div>
            
            {/* Top app header */}
            <div className="bg-slate-950 border-b border-slate-800 px-2 py-1.5 flex items-center justify-between shrink-0 shadow-sm">
              <h4 className="font-bold text-[8.5px]" style={{ color: accentColor }}>Segurança & LGPD</h4>
              <span 
                className="text-[5px] px-1 py-0.5 rounded font-mono shrink-0 border"
                style={{ 
                  backgroundColor: `${accentColor}12`, 
                  color: accentColor, 
                  borderColor: `${accentColor}2b` 
                }}
              >
                SSL 256-BIT
              </span>
            </div>

            {/* Security stats content */}
            <div className="p-2 flex-1 overflow-hidden flex flex-col gap-2 min-h-0">
              {/* Circular shield check indicator */}
              <div className="py-1.5 flex flex-col items-center justify-center space-y-0.5 bg-slate-950/40 rounded-lg border border-slate-800 shrink-0">
                <div 
                  className="w-8 h-8 rounded-full flex items-center justify-center animate-pulse border"
                  style={{ 
                    backgroundColor: `${accentColor}12`, 
                    color: accentColor, 
                    borderColor: `${accentColor}4d` 
                  }}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="text-[8px] font-bold leading-none" style={{ color: accentColor }}>Proteção Ativa</div>
                <div className="text-[5.5px] text-slate-500">Dados 100% criptografados</div>
              </div>

              {/* Toggles list */}
              <div className="flex-1 flex flex-col gap-1 overflow-hidden">
                {/* Toggle 1 */}
                <div className="bg-slate-950/20 p-1.5 rounded border border-slate-800/80 flex items-center justify-between shrink-0">
                  <div className="min-w-0">
                    <div className="font-bold text-[7.5px] text-slate-200 leading-none">Criptografia</div>
                    <div className="text-[5.5px] text-slate-550 truncate mt-0.5">Banco de dados AES-256</div>
                  </div>
                  <div 
                    className="w-5.5 h-3 rounded-full p-0.5 flex justify-end items-center shrink-0"
                    style={{ backgroundColor: accentColor }}
                  >
                    <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                  </div>
                </div>

                {/* Toggle 2 */}
                <div className="bg-slate-950/20 p-1.5 rounded border border-slate-800/80 flex items-center justify-between shrink-0">
                  <div className="min-w-0">
                    <div className="font-bold text-[7.5px] text-slate-200 leading-none">Backup Nuvem</div>
                    <div className="text-[5.5px] text-slate-550 truncate mt-0.5">Sincronização imediata</div>
                  </div>
                  <div 
                    className="w-5.5 h-3 rounded-full p-0.5 flex justify-end items-center shrink-0"
                    style={{ backgroundColor: accentColor }}
                  >
                    <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                  </div>
                </div>

                {/* Toggle 3 */}
                <div className="bg-slate-950/20 p-1.5 rounded border border-slate-800/80 flex items-center justify-between shrink-0">
                  <div className="min-w-0">
                    <div className="font-bold text-[7.5px] text-slate-200 leading-none">Autenticação</div>
                    <div className="text-[5.5px] text-slate-550 truncate mt-0.5">Acesso via Face ID</div>
                  </div>
                  <div 
                    className="w-5.5 h-3 rounded-full p-0.5 flex justify-end items-center shrink-0"
                    style={{ backgroundColor: accentColor }}
                  >
                    <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );

      case 'empty':
      default:
        return (
          <div className="w-full h-full bg-stone-550/5 flex flex-col items-center justify-center p-3 text-center select-none group-hover:bg-teal-50/10 transition-colors">
            <div className="p-2.5 rounded-full bg-slate-100 border border-dashed border-slate-300 text-slate-400 group-hover:text-teal-650 group-hover:bg-teal-50 group-hover:border-teal-300 transition-all duration-300">
              <ImageIcon className="w-6 h-6 opacity-75" />
            </div>
            <div className="mt-2 font-semibold text-slate-500 text-[8px] uppercase tracking-wider group-hover:text-teal-700 transition-colors px-1 leading-tight">
              {type === 'empty' ? '[CAPTURAS DO SEU APP AQUI]' : 'Adicionar Imagem'}
            </div>
            <p className="text-[6px] text-slate-400 mt-0.5 px-2 leading-normal">
              Clique para upload ou cole com <kbd className="bg-slate-200 px-1 py-0.2 rounded text-slate-650 text-[5px]">Ctrl+V</kbd>
            </p>
          </div>
        );
    }
  };

  // Render a tall vertical card (used for Column 1/Left cards, and all cards in individual mode)
  const renderVerticalCard = (card: CardData, isIndividual = false) => {
    const hasUserImage = !!cardImages[card.id];
    const { end } = getGradientColors();

    return (
      <div
        key={card.id}
        onPaste={(e) => handlePaste(card.id, e)}
        className={`relative w-full aspect-[9/16] rounded-[24px] overflow-hidden flex flex-col justify-between pt-5 pb-5 px-5 border shadow-md transition-all duration-300 group hover:shadow-lg select-none bg-white ${
          gradientType === 'teal-dark' ? 'border-slate-800 text-white' : 'border-slate-200 text-[#1c1917]'
        } ${isIndividual ? 'max-w-[345px]' : ''}`}
      >
        {/* Top Wave Background Container */}
        <div 
          className="absolute top-0 left-0 w-full h-[70%] z-0 overflow-hidden"
          style={getCardBgStyle()}
        >
          {/* Curved Wave Mask at the bottom of the top gradient section */}
          <WaveDecoration fillColor={gradientType === 'teal-dark' ? '#111827' : '#ffffff'} />
        </div>

        {/* SVG Dot Pattern Background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40 z-10"
          style={{
            backgroundImage: `radial-gradient(circle, ${getDotPatternColor()} 1.1px, transparent 1.1px)`,
            backgroundSize: '15px 15px'
          }}
        ></div>

        {/* Decorative Technical Corner Brackets */}
        <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 rounded-tl-sm pointer-events-none z-10" style={getCornerBorderColorStyle()}></div>
        <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 rounded-tr-sm pointer-events-none z-10" style={getCornerBorderColorStyle()}></div>
        <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 rounded-bl-sm pointer-events-none z-10" style={getCornerBorderColorStyle()}></div>
        <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 rounded-br-sm pointer-events-none z-10" style={getCornerBorderColorStyle()}></div>

        {/* Floating Medical/Security Background Icons */}
        {renderFloatingIcons(card.icons)}

        {/* Top Title/Brand Row */}
        <div className="flex justify-between items-center w-full z-20 px-1">
          <span 
            className="text-[8px] font-bold tracking-widest font-display"
            style={{
              color: gradientType === 'teal-dark' 
                ? '#2dd4bf' 
                : gradientType === 'green-white' 
                ? primaryColor 
                : '#065f46'
            }}
          >
            EVOLUÇÃO CLÍNICA
          </span>
          <div className="flex items-center gap-1 opacity-80">
            <GooglePlayLogo className="w-2.5 h-2.5" />
            <span className="text-[6px] font-bold text-slate-500 font-mono tracking-tighter">PLAY STORE</span>
          </div>
        </div>

        {/* Prominent Title */}
        <div className="mt-3.5 text-center px-1 z-20">
          <h2 className="font-display font-extrabold text-[12px] md:text-[13px] leading-tight tracking-normal text-center uppercase drop-shadow-xs text-white">
            {card.title}
          </h2>
        </div>

        {/* Smartphone Mockup */}
        <div className="relative w-[63%] aspect-[9/19.5] shrink-0 bg-neutral-900 rounded-[22px] p-[4px] mx-auto mt-2.5 shadow-xl border-[4px] border-neutral-900 z-20 transition-transform duration-300 group-hover:scale-[1.01] flex flex-col justify-between overflow-hidden">
          {/* Notch */}
          <div className="absolute top-1 left-1/2 -translate-x-1/2 w-14 h-2.5 bg-neutral-900 rounded-full z-30 flex items-center justify-between px-2">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
            <span className="w-3 h-1 bg-slate-800 rounded-full"></span>
          </div>

          {/* Reflection */}
          <div className="absolute inset-0 pointer-events-none z-20 bg-gradient-to-tr from-transparent via-white/5 to-white/10 opacity-70"></div>
          
          {/* Inner Screen */}
          <div
            onClick={() => triggerFileSelect(card.id)}
            className="relative w-full h-full bg-slate-100 rounded-[18px] overflow-hidden flex flex-col justify-between cursor-pointer"
            title="Clique para carregar ou colar uma imagem"
          >
            {hasUserImage ? (
              <div className="relative w-full h-full">
                <img
                  src={cardImages[card.id]}
                  alt={`Captura ${card.id}`}
                  className="w-full h-full object-cover object-top"
                />
                <div className="no-print absolute inset-0 bg-slate-950/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      triggerFileSelect(card.id);
                    }}
                    className="p-1 bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                  >
                    <RefreshCw className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={(e) => removeImage(card.id, e)}
                    className="p-1 bg-red-650 text-white rounded hover:bg-red-750 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ) : (
              renderMockScreen(card.defaultScreenType)
            )}
          </div>
          
          <input
            type="file"
            ref={(el) => { fileInputRefs.current[card.id] = el; }}
            accept="image/*"
            onChange={(e) => {
              if (e.target.files?.[0]) {
                handleImageUpload(card.id, e.target.files[0]);
              }
            }}
            className="hidden"
          />
        </div>

        {/* Bottom Description */}
        <div className="mt-3 px-2 min-h-[38px] flex items-center justify-center text-center z-20">
          <p className={`font-sans text-[9px] font-semibold leading-normal ${
            gradientType === 'teal-dark' ? 'text-teal-200/90' : 'text-slate-600/90'
          }`}>
            {card.description}
          </p>
        </div>
      </div>
    );
  };

  // Render a shorter split-layout card (used in Right Column / Column 2 of Board View)
  const renderHorizontalCard = (card: CardData) => {
    const hasUserImage = !!cardImages[card.id];

    return (
      <div
        key={card.id}
        onPaste={(e) => handlePaste(card.id, e)}
        className={`relative w-full rounded-[24px] overflow-hidden flex flex-col justify-between pt-5 pb-5 px-5 border shadow-md transition-all duration-300 group hover:shadow-lg select-none bg-white min-h-[220px] ${
          gradientType === 'teal-dark' ? 'border-slate-800 text-white' : 'border-slate-200 text-[#1c1917]'
        }`}
      >
        {/* Top Wave Background Container */}
        <div 
          className="absolute top-0 left-0 w-full h-[62%] z-0 overflow-hidden"
          style={getCardBgStyle()}
        >
          <WaveDecoration fillColor={gradientType === 'teal-dark' ? '#111827' : '#ffffff'} />
        </div>

        {/* SVG Dot Pattern Background */}
        <div
          className="absolute inset-0 pointer-events-none opacity-40 z-10"
          style={{
            backgroundImage: `radial-gradient(circle, ${getDotPatternColor()} 1.1px, transparent 1.1px)`,
            backgroundSize: '15px 15px'
          }}
        ></div>

        {/* Decorative Technical Corner Brackets */}
        <div className="absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 rounded-tl-sm pointer-events-none z-10" style={getCornerBorderColorStyle()}></div>
        <div className="absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 rounded-tr-sm pointer-events-none z-10" style={getCornerBorderColorStyle()}></div>
        <div className="absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 rounded-bl-sm pointer-events-none z-10" style={getCornerBorderColorStyle()}></div>
        <div className="absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 rounded-br-sm pointer-events-none z-10" style={getCornerBorderColorStyle()}></div>

        {/* Floating Background Icons */}
        {renderFloatingIcons(card.icons)}

        {/* Top Title/Brand Row */}
        <div className="flex justify-between items-center w-full z-20 px-1">
          <span 
            className="text-[8px] font-bold tracking-widest font-display"
            style={{
              color: gradientType === 'teal-dark' 
                ? '#2dd4bf' 
                : gradientType === 'green-white' 
                ? primaryColor 
                : '#065f46'
            }}
          >
            EVOLUÇÃO CLÍNICA
          </span>
          <div className="flex items-center gap-1 opacity-80">
            <GooglePlayLogo className="w-2.5 h-2.5" />
            <span className="text-[6px] font-bold text-slate-500 font-mono tracking-tighter">PLAY STORE</span>
          </div>
        </div>

        {/* Prominent Title */}
        <div className="mt-3.5 text-left px-1 z-20">
          <h2 className="font-display font-extrabold text-[12px] md:text-[13px] leading-tight tracking-normal text-left uppercase drop-shadow-xs text-white">
            {card.title}
          </h2>
        </div>

        {/* Split Bottom Content (Description on Left, Phone mockup on Right) */}
        <div className="flex-1 flex items-center justify-between mt-3 z-20 gap-3 min-h-0">
          {/* Left Description Side */}
          <div className="w-[52%] pr-1 flex flex-col justify-center gap-2">
            <p className={`font-sans text-[9.5px] font-semibold leading-normal ${
              gradientType === 'teal-dark' ? 'text-teal-200/90' : 'text-slate-650'
            }`}>
              {card.description}
            </p>
            {card.icons.includes('checkmark') && (
              <div className="flex items-center gap-1 opacity-25">
                <div className="p-1 bg-emerald-500/25 rounded-full border border-emerald-500/40">
                  <Check className="w-3.5 h-3.5 text-emerald-650" strokeWidth={2.5} />
                </div>
                <span className="text-[7px] font-bold text-slate-400 font-sans uppercase">Acesso Seguro</span>
              </div>
            )}
          </div>

          {/* Right Phone Mockup Side (Tilted Slightly to the right) */}
          <div className="w-[45%] flex items-center justify-center relative py-1">
            <div className="relative w-[85%] aspect-[9/19.5] shrink-0 bg-neutral-900 rounded-[20px] p-[3px] shadow-lg border-[3px] border-neutral-900 transition-transform duration-300 rotate-[5deg] hover:rotate-0 hover:scale-[1.03] flex flex-col justify-between overflow-hidden">
              {/* Notch */}
              <div className="absolute top-1 left-1/2 -translate-x-1/2 w-10 h-1.5 bg-neutral-900 rounded-full z-30 flex items-center justify-between px-1.5">
                <span className="w-1 h-1 rounded-full bg-slate-800"></span>
              </div>

              {/* Reflection */}
              <div className="absolute inset-0 pointer-events-none z-20 bg-gradient-to-tr from-transparent via-white/5 to-white/10 opacity-70"></div>
              
              {/* Inner Screen */}
              <div
                onClick={() => triggerFileSelect(card.id)}
                className="relative w-full h-full bg-slate-100 rounded-[16px] overflow-hidden flex flex-col justify-between cursor-pointer"
                title="Clique para carregar ou colar uma imagem"
              >
                {hasUserImage ? (
                  <div className="relative w-full h-full">
                    <img
                      src={cardImages[card.id]}
                      alt={`Captura ${card.id}`}
                      className="w-full h-full object-cover object-top"
                    />
                    <div className="no-print absolute inset-0 bg-slate-950/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-1.5">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          triggerFileSelect(card.id);
                        }}
                        className="p-1 bg-teal-600 text-white rounded hover:bg-teal-700 transition-colors"
                      >
                        <RefreshCw className="w-2.5 h-2.5" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => removeImage(card.id, e)}
                        className="p-1 bg-red-650 text-white rounded hover:bg-red-750 transition-colors"
                      >
                        <Trash2 className="w-2.5 h-2.5" />
                      </button>
                    </div>
                  </div>
                ) : (
                  renderMockScreen(card.defaultScreenType)
                )}
              </div>
              
              <input
                type="file"
                ref={(el) => { fileInputRefs.current[card.id] = el; }}
                accept="image/*"
                onChange={(e) => {
                  if (e.target.files?.[0]) {
                    handleImageUpload(card.id, e.target.files[0]);
                  }
                }}
                className="hidden"
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#f1f5f9] flex flex-col font-sans">
      {/* Tool Header (hidden in print) */}
      <header className="no-print bg-white border-b border-slate-200 px-6 py-4 flex flex-col sm:flex-row gap-4 items-center justify-between shadow-xs sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-[#005C13]/10 rounded-xl">
            <Sparkles className="w-6 h-6 text-[#005C13]" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-slate-800 leading-tight">Painel de Visualização e Exportação</h1>
            <p className="text-xs text-slate-500">Crie, visualize e exporte os seus 5 cartões de captura da Google Play Store (9:16)</p>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button
              onClick={() => setViewMode('board')}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'board' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Modo Quadro (Quadro Geral)</span>
            </button>
            <button
              onClick={() => setViewMode('individual')}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-all flex items-center gap-1.5 cursor-pointer ${
                viewMode === 'individual' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Smartphone className="w-3.5 h-3.5" />
              <span>Capturas Individuais (9:16)</span>
            </button>
          </div>

          {/* Preset Colors */}
          <div className="flex bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button
              onClick={() => setGradientType('teal-white')}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-all ${
                gradientType === 'teal-white' ? 'bg-white text-teal-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Teal Médio
            </button>
            <button
              onClick={() => setGradientType('green-white')}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-all ${
                gradientType === 'green-white' ? 'bg-white text-emerald-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Verde Marca
            </button>
            <button
              onClick={() => setGradientType('teal-dark')}
              className={`text-xs px-2.5 py-1.5 rounded-md font-medium transition-all ${
                gradientType === 'teal-dark' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Teal Escuro (Dark)
            </button>
          </div>

          <button
            onClick={handlePrint}
            className="flex items-center gap-2 bg-[#005C13] hover:bg-[#00470e] active:scale-98 text-white px-4 py-2 rounded-xl text-sm font-semibold transition-all shadow-sm cursor-pointer"
          >
            <Printer className="w-4 h-4" />
            <span>Exportar PDF / Imprimir</span>
          </button>
        </div>
      </header>

      {/* Helpful Instructions banner (hidden in print) */}
      <div className="no-print max-w-7xl mx-auto w-full px-6 pt-6">
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-4 flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
          <div className="space-y-1">
            <h3 className="font-bold text-teal-900 text-sm flex items-center gap-1.5">
              💡 Dica de Utilização Interativa
            </h3>
            <p className="text-xs text-teal-700 leading-relaxed">
              Você pode carregar as capturas reais da sua tela diretamente nos telefones. Clicando nas telas vazias (Cartões 1 e 3) ou arrastando uma imagem sobre eles, eles se atualizarão instantaneamente. Você também pode clicar em "Limpar" para restaurar os mockups originais.
            </p>
          </div>
          <div className="text-xs text-teal-600 font-medium">
            Atalho rápido: Selecione uma imagem, clique na área vazia e pressione <kbd className="bg-white border border-teal-300 px-1.5 py-0.5 rounded shadow-2xs font-semibold text-teal-800">Ctrl+V</kbd> para colar.
          </div>
        </div>
      </div>

      {/* Main Grid Area */}
      <main className="flex-1 p-6 md:p-10 max-w-7xl mx-auto w-full">
        {/* Printable Area Wrapper */}
        {viewMode === 'board' ? (
          /* BOARD VIEW MODE (Matches user's reference image structure exactly) */
          <div 
            id="print-area" 
            className="bg-gradient-to-tr from-teal-50/60 via-[#e0f2fe]/40 to-[#e2f1f0] p-8 md:p-10 rounded-[32px] border border-slate-200/50 shadow-md grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch"
          >
            {/* Board Header Section inside printable area */}
            <div className="col-span-12 flex justify-between items-center pb-2 border-b border-slate-200/40">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-[#005C13]/10 rounded-lg">
                  <Sparkles className="w-5 h-5 text-[#005C13]" />
                </div>
                <span className="font-display font-extrabold text-base tracking-normal text-slate-800 uppercase">
                  Evolução Clínica
                </span>
              </div>
              <div className="flex items-center gap-1.5 opacity-90">
                <GooglePlayLogo className="w-4 h-4" />
                <span className="text-[9px] font-bold text-slate-500 font-mono tracking-tighter">DISPONÍVEL NO GOOGLE PLAY</span>
              </div>
            </div>

            {/* Left Column - Card 1 & Card 3 (Vertical Cards) */}
            <div className="lg:col-span-5 flex flex-col gap-8 h-full">
              {renderVerticalCard(cards[0])}
              {renderVerticalCard(cards[2])}
            </div>

            {/* Right Column - Card 2, Card 4 & Card 5 (Shorter split cards) */}
            <div className="lg:col-span-7 flex flex-col gap-8 h-full justify-between">
              {renderHorizontalCard(cards[1])}
              {renderHorizontalCard(cards[3])}
              {renderHorizontalCard(cards[4])}
            </div>
          </div>
        ) : (
          /* INDIVIDUAL screenshot export grid (strictly 9:16 vertical cards for all five items) */
          <div 
            id="print-area" 
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 md:gap-8 justify-items-center"
          >
            {cards.map((card) => renderVerticalCard(card, true))}
          </div>
        )}
      </main>

      {/* Printing layout styling overrides */}
      <style>{`
        @media print {
          body, html {
            background: white !important;
            padding: 0 !important;
            margin: 0 !important;
          }
          .no-print {
            display: none !important;
          }
          #print-area {
            display: flex !important;
            flex-direction: column !important;
            gap: 0 !important;
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            width: 100% !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          #print-area > div {
            page-break-after: always !important;
            width: 1080px !important;
            height: 1920px !important;
            max-width: none !important;
            aspect-ratio: 9/16 !important;
            flex-shrink: 0 !important;
            margin: 0 auto !important;
            border: none !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          /* Keep background colors and gradients visible when exporting to PDF */
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
        }
      `}</style>
    </div>
  );
}
