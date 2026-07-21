import React, { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { Info } from 'lucide-react';

interface FeatureTooltipProps {
  feature: string;
}

const FEATURE_DESCRIPTIONS: Record<string, string> = {
  'pacientes ilimitados': 'Cadastre quantos pacientes precisar, sem limites ou cobranças adicionais por registro.',
  'evoluções clínicas com ia ilimitadas': 'Gere evoluções e prontuários estruturados a partir de anotações ou áudios com apoio da nossa IA, observados os limites técnicos e operacionais do serviço.',
  'evoluções clínicas e prontuários com apoio de ia': 'Estruture evoluções e prontuários a partir de anotações ou áudios, sempre com revisão e responsabilidade do profissional.',
  'transcrições de áudio com uso justo de até 20 horas por mês': 'Transcreva áudios clínicos com limite mensal de uso justo de até 1.200 minutos por profissional, preservando previsibilidade e estabilidade do serviço.',
  'gravação e transcrição de áudio com uso justo de até 20 horas por mês': 'Grave ou envie áudios clínicos e transcreva até 1.200 minutos por mês. Cada evolução aceita áudios de até 20 minutos e 20 MB por arquivo.',
  'integração com google docs em tempo real': 'Sincronize automaticamente seus prontuários e relatórios com documentos no seu Google Drive pessoal.',
  'integração com google docs': 'Sincronize evoluções e prontuários com documentos armazenados no seu Google Drive pessoal.',
  'gravação e transcrição de áudio nativa': 'Grave suas sessões ou observações direto pelo app. Cada evolução aceita áudios de até 20 minutos e até 20 MB por arquivo.',
  'geração de relatórios & pdi por ia': 'Crie Plano de Desenvolvimento Individual (PDI) e relatórios clínicos de evolução com apoio da inteligência artificial.',
  'relatórios clínicos e pdi com ia': 'Crie relatórios clínicos e Planos de Desenvolvimento Individual com apoio da inteligência artificial.',
  'pesquisa inteligente por ia (pergunte ao prontuário)': 'Faça perguntas em linguagem natural sobre o histórico clínico do paciente e encontre informações na hora.',
  'pesquisa inteligente no histórico do paciente': 'Faça perguntas em linguagem natural e encontre informações relevantes nas sessões do paciente.',
  'assinatura digital de documentos com proteção legal': 'Registre autoria, data, hora e hash de integridade, fechando evoluções e relatórios contra alterações ou exclusões posteriores.',
  'assinatura e fechamento imutável de evoluções e relatórios': 'Registre autoria, data, hora e hash de integridade, impedindo alterações ou exclusões posteriores no documento fechado.',
  'compartilhamento seguro de relatórios (whatsapp/e-mail)': 'Envie documentos diretamente para pais, responsáveis ou outros profissionais de forma segura e rápida.',
  'compartilhamento de relatórios por whatsapp e e-mail': 'Compartilhe relatórios com pacientes, responsáveis ou outros profissionais por WhatsApp e e-mail.',
  'filtro de período na impressão do prontuário': 'Escolha intervalos de datas específicos para exportar ou imprimir o histórico de atendimento.',
  'impressão de prontuários em pdf com filtro por período': 'Escolha um intervalo de datas e gere o prontuário formatado em PDF para download ou impressão.',
  'lembrete e envio de whatsapp para aniversariantes': 'Envie felicitações automáticas e personalizadas aos seus pacientes pelo WhatsApp na data de aniversário.',
  'lembretes de aniversário via whatsapp': 'Identifique aniversariantes e abra uma mensagem personalizada para envio pelo WhatsApp.',
  'impressão de prontuários do google docs': 'Gere versões em PDF prontas para impressão mantendo a formatação original do seu Google Docs.',
  'suporte via ticket em até 24 horas úteis (12 horas para pagamentos)': 'Abra chamados pelo painel. O prazo de primeira resposta é de até 24 horas úteis, reduzido para 12 horas em assuntos de pagamento.',
  
  // Yearly features
  'tudo do plano mensal': 'Tenha acesso a todas as ferramentas, integrações e limites operacionais previstos no plano mensal.',
  'economia de 57% em relação a 12 mensalidades': 'O valor anual de R$ 199 representa aproximadamente 57% de economia em relação a 12 mensalidades de R$ 39.',
  'desconto de ~17% sobre o valor': 'Ao contratar o plano anual, você economiza comparado ao pagamento mensal acumulado.',
  'desconto de ~17% sobre o valor mensal': 'Ao contratar o plano anual, você economiza comparado ao pagamento mensal acumulado.',
  'suporte prioritário via e-mail e whatsapp': 'Atendimento VIP com tempo de resposta reduzido para esclarecer suas dúvidas.',
  'suporte prioritário via ticket': 'Atendimento prioritário via chamado/ticket de suporte com tempo de resposta reduzido.',
  'suporte vip via ticket com primeira resposta em até 2 horas úteis': 'Chamados do Plano Anual recebem prioridade máxima, com primeira resposta em até 2 horas úteis no horário comercial.',
  'garantia de novos recursos em primeira mão': 'Acesso antecipado a novas ferramentas de inteligência artificial e atualizações da plataforma.',
  'garantia de novos recursos exclusivos em primeira mão': 'Acesso antecipado a novas ferramentas de inteligência artificial e atualizações da plataforma.',
  'migração assistida de prontuários por ia (pdf/word/excel)': 'Importamos todos os seus prontuários antigos de outros sistemas de forma automática usando inteligência artificial.',
  'migração assistida de prontuários (pdf, word e excel)': 'Envie arquivos de prontuários antigos para organização e importação assistida pela equipe com apoio de inteligência artificial.',
  'logotipo personalizado nos relatórios e evoluções (pdf/impresso)': 'Faça o upload do seu logotipo profissional e exiba-o no cabeçalho das evoluções assinadas e dos relatórios clínicos gerados em PDF.',
  'logotipo personalizado em relatórios e impressões': 'Use o logotipo do consultório ou da clínica nos relatórios, evoluções e prontuários impressos ou exportados.',
  'backup e restauração completa de dados no google drive (diário/semanal/mensal)': 'Sincronize todo o acervo clínico e configurações no Google Drive com histórico de até 3 snapshots anteriores para restauração inteligente em 1 clique.',
  'backup e restauração no google drive (diário/semanal/mensal)': 'Sincronize todo o acervo clínico e configurações no Google Drive com histórico de até 3 snapshots anteriores para restauração inteligente em 1 clique.',
  'backup completo e restauração pelo google drive (manual ou automático)': 'Gere backups completos manualmente ou em frequência diária, semanal ou mensal, com restauração pelo Google Drive.'
};

export const FeatureTooltip: React.FC<FeatureTooltipProps> = ({ feature }) => {
  const [show, setShow] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const [styleOffset, setStyleOffset] = useState<React.CSSProperties>({});
  const [arrowStyle, setArrowStyle] = useState<React.CSSProperties>({});

  const cleanFeature = feature.trim().toLowerCase();
  const description = FEATURE_DESCRIPTIONS[cleanFeature];

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShow(false);
      }
    };

    if (show) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [show]);

  useLayoutEffect(() => {
    if (show && tooltipRef.current) {
      const rect = tooltipRef.current.getBoundingClientRect();
      const viewportWidth = window.innerWidth;
      
      let leftOffset = 0;
      const padding = 16; // Mínimo de distância da borda da tela
      
      if (rect.right > viewportWidth - padding) {
        leftOffset = (viewportWidth - padding) - rect.right;
      } else if (rect.left < padding) {
        leftOffset = padding - rect.left;
      }
      
      if (leftOffset !== 0) {
        setStyleOffset({
          transform: `translateX(calc(-50% + ${leftOffset}px)) scale(1)`,
        });
        setArrowStyle({
          left: `calc(50% - ${leftOffset}px)`,
        });
      } else {
        setStyleOffset({
          transform: `translateX(-50%) scale(1)`,
        });
        setArrowStyle({});
      }
    } else {
      setStyleOffset({});
      setArrowStyle({});
    }
  }, [show]);

  // If we don't have a specific description, do not render the info icon to keep the list clean
  if (!description) return null;

  return (
    <div 
      ref={containerRef}
      className="relative inline-block ml-1.5 align-middle select-none"
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setShow(!show);
        }}
        className="text-brand-text-muted hover:text-brand-primary p-0.5 rounded transition-all duration-200 focus:outline-none flex items-center justify-center cursor-pointer hover:scale-110 active:scale-95"
        aria-label={`Informações sobre: ${feature}`}
      >
        <Info size={13} className="opacity-45 hover:opacity-100 transition-opacity duration-200" />
      </button>

      <div 
        ref={tooltipRef}
        className={`absolute bottom-full left-1/2 mb-2.5 w-60 bg-slate-950/95 backdrop-blur-md text-white text-xs rounded-xl p-3 shadow-2xl border border-white/10 leading-relaxed font-normal transition-all duration-200 origin-bottom ${
          show 
            ? 'opacity-100 pointer-events-auto translate-y-0' 
            : 'opacity-0 pointer-events-none translate-y-1'
        }`}
        style={{ 
          zIndex: 100,
          transform: styleOffset.transform || `translateX(-50%) scale(${show ? 1 : 0.95})`,
          ...styleOffset
        }}
      >
        <div className="relative text-left">
          {description}
          <div 
            className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 w-2 h-2 bg-slate-950 border-r border-b border-white/10 rotate-45" 
            style={arrowStyle}
          />
        </div>
      </div>
    </div>
  );
};
