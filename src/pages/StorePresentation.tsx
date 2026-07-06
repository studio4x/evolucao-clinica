import React, { useState, useRef } from 'react';
import { Heart, Cloud, Upload, Trash2, Printer, Image as ImageIcon, Sparkles, Check, RefreshCw } from 'lucide-react';

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
    {/* Central staff */}
    <line x1="12" y1="2" x2="12" y2="22" strokeWidth="2.2" />
    
    {/* Wings */}
    <path d="M12 5c-2.5-2.5-6.5-2-7.5.5.5 1.5 3.5 2.5 7.5.5M12 5c2.5-2.5 6.5-2 7.5.5-.5 1.5-3.5 2.5-7.5.5" fill="currentColor" fillOpacity="0.1" />
    
    {/* Left Snake winding */}
    <path d="M8.5 7.5c1-1 2.5.5 3.5 1.5s1 2.5 0 3.5-3.5 2-3.5 3.5c0 1.5 1.5 2.5 3.5 1.5.7-.4 1.4-1.2 2-1.7" />
    
    {/* Right Snake winding */}
    <path d="M15.5 7.5c-1-1-2.5.5-3.5 1.5s-1 2.5 0 3.5 3.5 2 3.5 3.5c0 1.5-1.5 2.5-3.5 1.5-.7-.4-1.4-1.2-2-1.7" />
    
    {/* Pinecone or bulb at the top of the staff */}
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

interface CardData {
  id: number;
  title: string;
  description: string;
  defaultPlaceholder: string;
  defaultScreenType: 'empty' | 'form' | 'calendar' | 'security';
  icons: Array<'heart' | 'caduceus' | 'checkmark' | 'cloud'>;
}

export default function StorePresentation() {
  const [cardImages, setCardImages] = useState<Record<number, string>>({});
  const [gradientType, setGradientType] = useState<'teal-white' | 'green-white' | 'teal-dark'>('teal-white');
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

  const getGradientClass = () => {
    switch (gradientType) {
      case 'green-white':
        return 'from-[#005C13] via-[#0b6b2d] to-white text-[#1c1917]';
      case 'teal-dark':
        return 'from-[#042f2b] via-[#09423b] to-[#111827] text-white';
      case 'teal-white':
      default:
        return 'from-[#0a3d36] via-[#104e45] to-white text-[#1c1917]';
    }
  };

  const getDotPatternColor = () => {
    return gradientType === 'teal-dark' ? 'rgba(255, 255, 255, 0.04)' : 'rgba(0, 92, 19, 0.03)';
  };

  const getCornerBorderColor = () => {
    return gradientType === 'teal-dark' ? 'border-teal-400/25' : 'border-teal-800/20';
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
            <div className="h-3.5 bg-emerald-700 text-white px-2 flex justify-between items-center text-[7px] font-medium shrink-0">
              <span>09:41</span>
              <div className="flex gap-0.5 items-center">
                <span>5G</span>
                <span className="w-3 h-1.5 border border-white rounded-[1px] bg-white flex-none"></span>
              </div>
            </div>
            
            {/* Top app header */}
            <div className="bg-white border-b border-slate-200 px-2 py-1.5 flex items-center justify-between shrink-0 shadow-xs">
              <div className="flex items-center gap-1">
                <div className="w-4.5 h-4.5 rounded-full bg-emerald-600 flex items-center justify-center text-white font-bold text-[7px] shrink-0">EC</div>
                <div className="min-w-0">
                  <h4 className="font-bold text-[8px] text-emerald-800 leading-none truncate">Nova Evolução</h4>
                  <span className="text-[5.5px] text-slate-400 block truncate">Paciente: Ana Maria</span>
                </div>
              </div>
              <span className="bg-emerald-100 text-emerald-700 text-[5px] px-1 py-0.5 rounded font-bold shrink-0">EM ANDAMENTO</span>
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
                <div className="bg-white p-1.5 rounded border border-slate-200 text-slate-600 font-normal leading-normal text-[6.5px] flex-1 overflow-hidden relative">
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
                    <span className="text-[7.5px] font-bold text-emerald-600">3/10</span>
                    <div className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="w-[30%] h-full bg-emerald-500 rounded-full"></div>
                    </div>
                  </div>
                </div>
                <div className="bg-white p-1 rounded border border-slate-100">
                  <span className="text-[5.5px] text-slate-400 block font-bold leading-none">MOBILIDADE</span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[7.5px] font-bold text-emerald-600">85%</span>
                    <div className="flex-1 h-0.5 bg-slate-100 rounded-full overflow-hidden">
                      <div className="w-[85%] h-full bg-emerald-500 rounded-full"></div>
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
              <button type="button" className="w-full bg-emerald-600 text-white rounded py-1 text-[7.5px] font-bold shadow-xs flex items-center justify-center">
                <span>Salvar no Google Docs</span>
              </button>
            </div>
          </div>
        );

      case 'calendar':
        return (
          <div className="w-full h-full bg-slate-50 flex flex-col text-left text-[9px] font-sans text-slate-800 select-none">
            {/* Status bar */}
            <div className="h-3.5 bg-teal-800 text-white px-2 flex justify-between items-center text-[7px] font-medium shrink-0">
              <span>09:41</span>
              <div className="flex gap-0.5 items-center">
                <span>5G</span>
                <span className="w-3 h-1.5 border border-white rounded-[1px] bg-white flex-none"></span>
              </div>
            </div>
            
            {/* Top app header */}
            <div className="bg-white border-b border-slate-200 px-2 py-1.5 flex items-center justify-between shrink-0 shadow-sm">
              <h4 className="font-bold text-[8.5px] text-teal-800">Minha Agenda</h4>
              <div className="w-3.5 h-3.5 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 text-[7px]">🔔</div>
            </div>

            {/* Calendar header dates */}
            <div className="bg-white px-1.5 py-1 border-b border-slate-150 flex justify-between shrink-0 text-center text-[6px]">
              {['S', 'T', 'Q', 'Q', 'S', 'S'].map((day, idx) => {
                const dayNum = 6 + idx;
                const isSelected = dayNum === 8; // Wed selected
                return (
                  <div key={idx} className={`w-5 py-0.5 rounded transition-colors ${isSelected ? 'bg-teal-600 text-white font-bold' : 'text-slate-500'}`}>
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
              <div className="bg-white p-1.5 rounded border-l-[2.5px] border-l-emerald-500 border-y border-r border-slate-100 shadow-2xs flex justify-between items-center shrink-0">
                <div className="space-y-0.2 min-w-0">
                  <div className="text-[5.5px] text-emerald-600 font-bold">09:00 - 10:00</div>
                  <div className="font-bold text-slate-700 text-[7.5px] leading-tight truncate">Ana Maria Silva</div>
                  <div className="text-[5.5px] text-slate-400 truncate">Fisioterapia Ortopédica</div>
                </div>
                <span className="bg-emerald-50 text-emerald-700 text-[4.5px] px-1 py-0.3 rounded font-bold border border-emerald-100 shrink-0">CONFIRMADO</span>
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
              <h4 className="font-bold text-[8.5px] text-teal-400">Segurança & LGPD</h4>
              <span className="text-[5px] bg-teal-500/10 text-teal-400 px-1 py-0.5 rounded border border-teal-500/20 font-mono shrink-0">SSL 256-BIT</span>
            </div>

            {/* Security stats content */}
            <div className="p-2 flex-1 overflow-hidden flex flex-col gap-2 min-h-0">
              {/* Circular shield check indicator */}
              <div className="py-1.5 flex flex-col items-center justify-center space-y-0.5 bg-slate-950/40 rounded-lg border border-slate-800 shrink-0">
                <div className="w-8 h-8 rounded-full bg-teal-500/10 border border-teal-500/35 flex items-center justify-center text-teal-400 animate-pulse">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                  </svg>
                </div>
                <div className="text-[8px] font-bold text-teal-400 leading-none">Proteção Ativa</div>
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
                  <div className="w-5.5 h-3 bg-teal-500 rounded-full p-0.5 flex justify-end items-center shrink-0">
                    <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                  </div>
                </div>

                {/* Toggle 2 */}
                <div className="bg-slate-950/20 p-1.5 rounded border border-slate-800/80 flex items-center justify-between shrink-0">
                  <div className="min-w-0">
                    <div className="font-bold text-[7.5px] text-slate-200 leading-none">Backup Nuvem</div>
                    <div className="text-[5.5px] text-slate-550 truncate mt-0.5">Sincronização imediata</div>
                  </div>
                  <div className="w-5.5 h-3 bg-teal-500 rounded-full p-0.5 flex justify-end items-center shrink-0">
                    <div className="w-2 h-2 bg-slate-900 rounded-full"></div>
                  </div>
                </div>

                {/* Toggle 3 */}
                <div className="bg-slate-950/20 p-1.5 rounded border border-slate-800/80 flex items-center justify-between shrink-0">
                  <div className="min-w-0">
                    <div className="font-bold text-[7.5px] text-slate-200 leading-none">Autenticação</div>
                    <div className="text-[5.5px] text-slate-550 truncate mt-0.5">Acesso via Face ID</div>
                  </div>
                  <div className="w-5.5 h-3 bg-teal-500 rounded-full p-0.5 flex justify-end items-center shrink-0">
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

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col font-sans">
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
                gradientType === 'green-white' ? 'bg-white text-[#005C13] shadow-xs' : 'text-slate-600 hover:text-slate-900'
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
        <div id="print-area" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-6 md:gap-8 justify-items-center">
          {cards.map((card) => {
            const hasUserImage = !!cardImages[card.id];
            
            return (
              <div
                key={card.id}
                onPaste={(e) => handlePaste(card.id, e)}
                className={`relative w-full aspect-[9/16] max-w-[345px] rounded-[24px] overflow-hidden flex flex-col justify-between pt-5 pb-4 px-4 border shadow-lg transition-all duration-300 group hover:shadow-xl select-none ${
                  gradientType === 'teal-dark' ? 'border-slate-800' : 'border-slate-200'
                } bg-gradient-to-b ${getGradientClass()}`}
                style={{ contentVisibility: 'auto' }}
              >
                {/* SVG Dot Pattern Background */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-45"
                  style={{
                    backgroundImage: `radial-gradient(circle, ${getDotPatternColor()} 1.2px, transparent 1.2px)`,
                    backgroundSize: '16px 16px'
                  }}
                ></div>

                {/* Decorative Technical Corner Frames */}
                <div className={`absolute top-4 left-4 w-4 h-4 border-t-2 border-l-2 ${getCornerBorderColor()} pointer-events-none rounded-tl-sm`}></div>
                <div className={`absolute top-4 right-4 w-4 h-4 border-t-2 border-r-2 ${getCornerBorderColor()} pointer-events-none rounded-tr-sm`}></div>
                <div className={`absolute bottom-4 left-4 w-4 h-4 border-b-2 border-l-2 ${getCornerBorderColor()} pointer-events-none rounded-bl-sm`}></div>
                <div className={`absolute bottom-4 right-4 w-4 h-4 border-b-2 border-r-2 ${getCornerBorderColor()} pointer-events-none rounded-br-sm`}></div>

                {/* Floating Aesthetic Medical/Security Icons */}
                {renderFloatingIcons(card.icons)}

                {/* Top Title/Brand Row */}
                <div className="flex justify-between items-center w-full z-20 px-1">
                  <span className={`text-[8.5px] font-bold tracking-widest font-display ${
                    gradientType === 'teal-dark' ? 'text-teal-400' : 'text-emerald-800'
                  }`}>
                    EVOLUÇÃO CLÍNICA
                  </span>
                  <div className="flex items-center gap-1 opacity-90">
                    <GooglePlayLogo className="w-3 h-3" />
                    <span className="text-[6.5px] font-bold text-slate-500 font-mono tracking-tighter">PLAY STORE</span>
                  </div>
                </div>

                {/* Main Prominent Feature Title */}
                <div className="mt-3 text-center px-1 z-20">
                  <h2 className={`font-display font-extrabold text-[11px] md:text-[12px] leading-tight tracking-wide text-center uppercase drop-shadow-xs ${
                    gradientType === 'teal-dark' ? 'text-white' : 'text-slate-900'
                  }`}>
                    {card.title}
                  </h2>
                </div>

                {/* Smartphone Mockup Frame */}
                <div className="relative w-[63%] aspect-[9/19.5] shrink-0 bg-neutral-900 rounded-[22px] p-[4px] mx-auto mt-2.5 shadow-xl border-[4px] border-neutral-900 z-20 transition-transform duration-300 group-hover:scale-[1.01] flex flex-col justify-between overflow-hidden">
                  
                  {/* Phone Notch/Dynamic Island */}
                  <div className="absolute top-1 left-1/2 -translate-x-1/2 w-14 h-2.5 bg-neutral-900 rounded-full z-30 flex items-center justify-between px-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-slate-800"></span>
                    <span className="w-3 h-1 bg-slate-800 rounded-full"></span>
                  </div>

                  {/* Reflection highlights overlay */}
                  <div className="absolute inset-0 pointer-events-none z-20 bg-gradient-to-tr from-transparent via-white/5 to-white/10 opacity-70"></div>
                  
                  {/* Inner Screen Container */}
                  <div
                    onClick={() => triggerFileSelect(card.id)}
                    className="relative w-full h-full bg-slate-100 rounded-[18px] overflow-hidden flex flex-col justify-between cursor-pointer group"
                    title="Clique para enviar ou cole uma imagem real"
                  >
                    {hasUserImage ? (
                      <div className="relative w-full h-full">
                        <img
                          src={cardImages[card.id]}
                          alt={`Captura ${card.id}`}
                          className="w-full h-full object-cover object-top"
                        />
                        {/* Overlay to remove / modify in dashboard */}
                        <div className="no-print absolute inset-0 bg-slate-950/45 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerFileSelect(card.id);
                            }}
                            className="p-1.5 bg-teal-600 text-white rounded-lg hover:bg-teal-700 transition-colors shadow-sm"
                            title="Trocar Imagem"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => removeImage(card.id, e)}
                            className="p-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-sm"
                            title="Remover e usar padrão"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ) : (
                      renderMockScreen(card.defaultScreenType)
                    )}
                  </div>
                  
                  {/* Hidden Input for Local File Loading */}
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

                {/* Bottom Portuguese Description Text */}
                <div className="mt-2.5 px-1 min-h-[32px] flex items-center justify-center text-center z-20">
                  <p className={`font-sans text-[9px] font-semibold leading-snug ${
                    gradientType === 'teal-dark' ? 'text-teal-200/90' : 'text-stone-600/90'
                  }`}>
                    {card.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
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
