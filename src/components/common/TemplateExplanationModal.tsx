import React, { useState } from 'react';
import { X, HelpCircle, FileText, CheckCircle, Info, Heart } from 'lucide-react';

interface TemplateExplanationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

interface TemplateInfo {
  id: string;
  name: string;
  shortName: string;
  description: string;
  indications: string[];
  topics: { title: string; text: string }[];
  example: string;
}

const TEMPLATE_DETAILS: TemplateInfo[] = [
  {
    id: 'general',
    name: 'Formatação Geral (Sem Template)',
    shortName: 'Geral',
    description: 'Transcrição contínua, fluida e direta, focada em registrar os principais acontecimentos e condutas de forma corrida, sem subdivisão em tópicos rígidos.',
    indications: ['Consultas Rápidas', 'Primeiro Acolhimento', 'Casos de baixa complexidade'],
    topics: [
      { title: 'Narrativa livre', text: 'Descrição contínua do estado do paciente e das atividades realizadas.' },
      { title: 'Conduta', text: 'Indicação dos próximos passos e orientações gerais.' }
    ],
    example: 'Paciente compareceu à sessão cooperativo e com boa disposição. Durante o atendimento, trabalhamos atividades voltadas para a atenção concentrada e regulação emocional através de jogos lúdicos. O paciente apresentou boa interação com o terapeuta e conseguiu manter o foco na maioria das tarefas propostas, necessitando de poucas intervenções para redirecionamento. O plano terapêutico segue conforme planejado para a próxima sessão.'
  },
  {
    id: 'soap',
    name: 'Modelo SOAP',
    shortName: 'SOAP',
    description: 'Subjetivo, Objetivo, Avaliação e Plano. O modelo padrão ouro internacional da evolução clínica e da comunicação interprofissional.',
    indications: ['Fisioterapia', 'Fonoaudiologia', 'Medicina', 'Multidisciplinar'],
    topics: [
      { title: 'S - Subjetivo', text: 'Relatos, queixas, humor e estado geral trazidos pelo paciente ou pelo acompanhante.' },
      { title: 'O - Objetivo', text: 'Dados observáveis pelo terapeuta, testes, exercícios aplicados, desempenho físico e suporte físico/verbal fornecido.' },
      { title: 'A - Avaliação', text: 'Análise clínica do progresso do dia, nível de engajamento, regulação e resposta à intervenção.' },
      { title: 'P - Plano', text: 'Próximos passos do tratamento, tarefas para casa ou recomendações para as próximas sessões.' }
    ],
    example: '**S - Subjetivo:** A mãe relata que o paciente dormiu mal na noite anterior devido a cólicas, mas acordou disposto e animado para vir à terapia. O paciente verbalizou que estava com saudades dos brinquedos da sala.\n\n**O - Objetivo:** Realizados exercícios de fortalecimento de membros inferiores (3 séries de 10 repetições de agachamento com apoio) e treino de marcha em esteira por 15 minutos com velocidade constante de 2.0 km/h. Apresentou leve fadiga muscular e aumento de frequência respiratória aos 10 minutos, necessitando de um intervalo de 2 minutos para hidratação.\n\n**A - Avaliação:** O paciente apresentou boa evolução no ganho de força e estabilidade articular em comparação à semana passada. Manteve-se engajado durante 80% do tempo dos exercícios físicos propostos, demonstrando bom controle e resposta à intervenção mesmo com o cansaço acumulado da noite mal dormida.\n\n**P - Plano:** Manter a conduta de fortalecimento muscular nas próximas duas sessões. Introduzir exercícios com foco em propriocepção e equilíbrio estático na próxima semana. Solicitar à mãe que envie fotos do paciente realizando as atividades sugeridas para casa.'
  },
  {
    id: 'aba',
    name: 'Modelo ABA (Análise do Comportamento Aplicada)',
    shortName: 'ABA',
    description: 'Desenvolvido especificamente para terapia comportamental, autismo e intervenções focadas no desenvolvimento de habilidades e manejo de comportamentos.',
    indications: ['Autismo', 'Terapia Comportamental', 'Psicopedagogia'],
    topics: [
      { title: 'Antecedentes (Estímulo)', text: 'As demandas, instruções, materiais ou estímulos apresentados ao paciente.' },
      { title: 'Comportamentos Observados', text: 'Respostas físicas e comportamentais do paciente, incluindo nível de engajamento.' },
      { title: 'Consequências Aplicadas', text: 'Reações do terapeuta, reforçadores e manejos aplicados logo após a resposta.' },
      { title: 'Nível de Suporte (Prompts)', text: 'Nível de ajuda necessário (Independente, Verbal, Gestual, Físico Parcial ou Físico Total).' },
      { title: 'Barreiras / Estereotipias', text: 'Comportamentos de fuga, esquiva, agressividade, autoestimulações ou outras dificuldades identificadas.' }
    ],
    example: '**Antecedentes (Estímulo):** Apresentada a demanda de pareamento de cores com fichas lúdicas de animais e instrução verbal clara "coloque junto".\n\n**Comportamentos Observados:** O paciente realizou o pareamento correto de 8 das 10 fichas apresentadas. Durante a atividade, manteve o contato visual sob demanda por cerca de 3 segundos e verbalizou o nome de 3 cores (azul, vermelho e verde).\n\n**Consequências Aplicadas:** Reforço social imediato com tom de voz animado ("Muito bem, você achou!") e entrega do item de preferência (carrinho de brinquedo) por 30 segundos após a conclusão do pareamento.\n\n**Nível de Suporte (Prompts):** Independente para a maioria das tentativas (8 tentativas). Necessitou de prompt gestual (apontar para a ficha correspondente) nas 2 tentativas restantes em que demonstrou distração.\n\n**Comportamentos de Barreira / Estereotipias:** Apresentou flap de mãos leve (estereotipia motora) quando o carrinho foi entregue (euforia). Houve uma tentativa de esquiva da mesa após 15 minutos de atividade, manejada com sucesso através de redirecionamento imediato e promessa do brinquedo predileto ao terminar a tarefa.'
  },
  {
    id: 'tcc',
    name: 'Modelo TCC (Terapia Cognitivo-Comportamental)',
    shortName: 'TCC',
    description: 'Focado na identificação, teste e reestruturação de pensamentos disfuncionais e crenças limitantes em sessões de psicoterapia.',
    indications: ['Psicologia Clínica', 'TCC', 'Terapia de Casal / Família'],
    topics: [
      { title: 'Humor e Estado Atual', text: 'Relato do paciente sobre suas emoções e estado de humor durante e no início da sessão.' },
      { title: 'Pensamentos Automáticos', text: 'Pensamentos rápidos e disfuncionais identificados, além de distorções cognitivas associadas.' },
      { title: 'Crenças Nucleares / Esquemas', text: 'Crenças mais profundas e estruturadas do paciente que foram ativadas no relato.' },
      { title: 'Intervenções Realizadas', text: 'Técnicas psicoterápicas aplicadas na sessão (ex: questionamento socrático, reestruturação).' },
      { title: 'Tarefa de Casa (Plano)', text: 'Combinados práticos para serem testados e aplicados pelo paciente durante a semana.' }
    ],
    example: '**Humor e Estado Atual:** O paciente iniciou a sessão relatando forte sentimento de frustração e ansiedade autoavaliada em nível 7/10. Apresentava inquietação física (bater de pés constante), congruente com o estado relatado.\n\n**Pensamentos Automáticos e Distorções Cognitivas:** "Eu nunca vou conseguir entregar o projeto a tempo e todo mundo vai descobrir que eu sou uma farsa" (Distorção: Catastrofização e Leitura de Mente).\n\n**Crenças Nucleares / Esquemas:** Ativação de crença nuclear de incompetência e desvalor ("Não sou capaz" e "Sou um fracasso").\n\n**Intervenções Terapêuticas Realizadas:** Aplicado questionamento socrático para examinar as evidências reais a favor e contra o pensamento automático. Utilizada a técnica de reestruturação cognitiva com formulação de pensamento alternativo realista. Exercício de respiração diafragmática para manejo físico da ansiedade.\n\n**Tarefa de Casa (Plano de Ação):** Preenchimento do Registro de Pensamentos Disfuncionais (RPD) sempre que sentir ansiedade acima de nível 5 nas reuniões de trabalho.'
  },
  {
    id: 'to',
    name: 'Modelo Terapia Ocupacional (TO)',
    shortName: 'TO',
    description: 'Focado em avaliar e evoluir o desempenho nas Atividades de Vida Diária (AVDs), integração sensorial, regulação e autonomia funcional.',
    indications: ['Terapia Ocupacional', 'Integração Sensorial', 'Reabilitação Física'],
    topics: [
      { title: 'Desempenho Ocupacional (AVD/AIVD)', text: 'Desempenho e autonomia em alimentação, higiene, vestuário, brincar e outras rotinas.' },
      { title: 'Integração e Regulação Sensorial', text: 'Respostas a estímulos (táteis, auditivos, proprioceptivos) e nível de regulação do paciente.' },
      { title: 'Coordenação Motora e Praxia', text: 'Movimentos finos, grossos, planejamento motor, lateralidade e tônus muscular.' },
      { title: 'Aspectos Socioemocionais', text: 'Postura, nível de engajamento, persistência na atividade e autorregulação na sessão.' },
      { title: 'Orientações e Conduta', text: 'Adaptações propostas, exercícios para casa ou orientações ambientais (escola/casa).' }
    ],
    example: '**Áreas de Desempenho Ocupacional (AVD / AIVD):** Foco no treino de abotoamento de camisas e manejo de talheres durante simulação de refeição. O paciente demonstrou melhora na preensão do garfo com preensão trípode adaptada, porém necessita de ajuda física para estabilizar o prato.\n\n**Integração e Regulação Sensorial:** Apresentou forte aversão sensorial tátil (hipersensibilidade) ao manusear massa de modelar úmida, tentando limpar as mãos imediatamente. A autorregulação foi estabelecida promovendo pressão profunda nos braços e uso de almofada ponderada antes das tarefas de mesa.\n\n**Coordenação Motora e Praxia:** Trabalhado o recorte de papel utilizando tesoura adaptada de mola e encaixe de blocos pequenos. Demonstra boa coordenação motora bilateral e força de pinça adequada para a faixa etária.\n\n**Comportamento e Aspectos Socioemocionais:** Manteve-se focado por cerca de 15 minutos contínuos. Apresentou comportamento de frustração ao derrubar as peças do jogo, mas respondeu positivamente ao incentivo verbal para tentar novamente.\n\n**Orientações e Conduta:** Orientada a família a manter o uso de talheres adaptados em todas as refeições em casa e a realizar atividades lúdicas de abotoar botões grandes em almofadas para treino de motricidade fina.'
  },
  {
    id: 'fono',
    name: 'Modelo Fonoaudiologia',
    shortName: 'Fono',
    description: 'Focado nas funções de linguagem oral/escrita, fala, voz, processamento auditivo e motricidade orofacial.',
    indications: ['Fonoaudiologia', 'Treino de Fala', 'Linguagem', 'Motricidade Orofacial'],
    topics: [
      { title: 'Aspectos Fonoaudiológicos Trabalhados', text: 'Qual o foco específico (ex: Linguagem, Fala, Voz, Deglutição, Motricidade Orofacial).' },
      { title: 'Desempenho e Resposta', text: 'Desempenho do paciente nas tarefas, acertos, correções e dificuldades apresentadas.' },
      { title: 'Estratégias e Recursos Utilizados', text: 'Quais pistas (visuais, táteis, auditivas) ou materiais foram usados pelo terapeuta.' },
      { title: 'Orientação para Família e Conduta', text: 'Próximos passos e orientações para repetição dos treinos em ambiente familiar.' }
    ],
    example: '**Aspectos Fonoaudiológicos Avaliados/Trabalhados:** Foco em motricidade orofacial (tônus e mobilidade da musculatura de língua e lábios) e fonologia (treino de instalação e produção do fonema vibrante /r/ tepe).\n\n**Desempenho e Resposta do Paciente:** O paciente realizou os exercícios miofuncionais (estalo de língua e sustentação contra resistência) com boa amplitude e força. No treino articulatório, obteve taxa de 75% de acerto na produção do fonema /r/ em sílabas isoladas, caindo para 40% quando inserido em palavras simples (ex: "prato", "trator").\n\n**Estratégias, Pistas e Recursos Utilizados:** Utilização de espelho para biofeedback visual, espátula para pista tátil de posicionamento do ápice lingual no alvéolo e apoio lúdico com jogo de tabuleiro fonológico.\n\n**Orientação para Família e Conduta:** Orientado o pai a realizar o treino de vibração lingual em casa diariamente (3 vezes ao dia por 1 minuto) e fazer a leitura assistida do livro enviado, pedindo para o paciente repetir as palavras-alvo previamente marcadas.'
  },
  {
    id: 'narrativo',
    name: 'Modelo Narrativo / Psicanálise (Livre)',
    shortName: 'Narrativo',
    description: 'Adequado para abordagens analíticas e de escuta clínica livre, focando na associação de ideias, conteúdos inconscientes e na dinâmica de transferência.',
    indications: ['Psicanálise', 'Psicologia Analítica', 'Escuta Qualificada'],
    topics: [
      { title: 'Conteúdo Manifesto (Associação)', text: 'Os relatos trazidos pelo paciente, temas recorrentes e o discurso verbal exposto na sessão.' },
      { title: 'Análise e Conteúdo Latente', text: 'Percepções e interpretações do profissional sobre defesas, atos falhos, silêncios e sonhos.' },
      { title: 'Dinâmica Transferencial', text: 'A relação estabelecida entre paciente e analista durante o processo terapêutico.' }
    ],
    example: '**Conteúdo Manifesto (Associação Livre):** O analisando iniciou a sessão trazendo lembranças de sua infância relacionadas à figura paterna severa, após narrar uma discussão recente que teve com seu diretor no trabalho. Falou longamente sobre o sentimento de que "nunca faz o suficiente para ser visto".\n\n**Análise e Conteúdo Latente:** Observa-se uma repetição inconsciente da dinâmica com a figura paterna projetada no gestor atual. Ocorreram lapsos de fala significativos, onde o analisando chamou o diretor pelo próprio nome do pai. O sujeito demonstra um mecanismo de defesa de intelectualização para evitar o contato com a angústia da rejeição.\n\n**Dinâmica Transferencial / Contratransferencial:** O analisando buscou ativamente a aprovação do analista durante os relatos, repetindo perguntas como "Eu estou no caminho certo?" ou "Você concorda?". O analista manteve a escuta flutuante e devolveu os questionamentos de modo a propiciar a autoanálise do analisando, sustentando o silêncio nos momentos de elaboração.'
  }
];

export default function TemplateExplanationModal({ isOpen, onClose }: TemplateExplanationModalProps) {
  const [activeTab, setActiveTab] = useState<string>('soap');

  if (!isOpen) return null;

  const currentTemplate = TEMPLATE_DETAILS.find(t => t.id === activeTab) || TEMPLATE_DETAILS[1];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center p-4 z-50 animate-fade-in backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl h-[85vh] md:h-auto max-h-[85vh] flex flex-col overflow-hidden border border-brand-border animate-scale-up">
        
        {/* Header */}
        <div className="p-5 border-b border-brand-border flex justify-between items-center bg-stone-50 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="bg-brand-primary/10 p-2 rounded-lg text-brand-primary">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-brand-text text-base leading-tight">Guias de Templates Clínicos</h3>
              <p className="text-xs text-brand-text-muted mt-0.5">Entenda as diferenças estruturais e veja exemplos para cada modelo</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full hover:bg-stone-200 text-brand-text-muted hover:text-brand-text transition-colors"
            title="Fechar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden min-h-0">
          
          {/* Sidebar / Tabs (Desktop) & Top Tabs (Mobile Scroll) */}
          <div className="w-full md:w-56 border-b md:border-b-0 md:border-r border-brand-border bg-stone-50/50 overflow-x-auto md:overflow-x-visible md:overflow-y-auto p-2.5 flex flex-row md:flex-col gap-1 shrink-0 md:scrollbar-thin">
            {TEMPLATE_DETAILS.map((t) => {
              const isActive = t.id === activeTab;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className={`px-3 py-2 text-xs md:text-sm font-medium rounded-lg text-left transition-all flex items-center gap-2 whitespace-nowrap md:whitespace-normal shrink-0 ${
                    isActive 
                      ? 'bg-brand-primary text-white shadow-xs' 
                      : 'text-brand-text hover:bg-stone-200/70 hover:text-brand-text-dark'
                  }`}
                >
                  <FileText className={`w-4 h-4 shrink-0 ${isActive ? 'text-white' : 'text-brand-text-muted'}`} />
                  <span>{t.shortName}</span>
                </button>
              );
            })}
          </div>

          {/* Details Content (Right Panel) */}
          <div className="flex-1 overflow-y-auto p-6 md:scrollbar-thin">
            
            {/* Header info */}
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-lg font-bold text-brand-text">{currentTemplate.name}</h4>
                <div className="flex flex-wrap gap-1">
                  {currentTemplate.indications.map(ind => (
                    <span key={ind} className="bg-brand-primary/10 text-brand-primary text-[10px] font-semibold px-2 py-0.5 rounded-full">
                      {ind}
                    </span>
                  ))}
                </div>
              </div>
              <p className="text-sm text-brand-text-muted leading-relaxed">
                {currentTemplate.description}
              </p>
            </div>

            {/* Structure Topics */}
            <div className="mt-6">
              <h5 className="text-xs font-bold uppercase tracking-wider text-brand-text-muted mb-3 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-brand-primary" />
                Estrutura do Modelo
              </h5>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {currentTemplate.topics.map((topic, i) => (
                  <div key={i} className="border border-brand-border bg-stone-50/30 rounded-xl p-3.5 hover:border-brand-primary/20 transition-colors">
                    <span className="text-xs font-bold text-brand-primary block mb-0.5">{topic.title}</span>
                    <span className="text-xs text-brand-text-muted leading-snug">{topic.text}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Example Box */}
            <div className="mt-6">
              <h5 className="text-xs font-bold uppercase tracking-wider text-brand-text-muted mb-2.5 flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-brand-primary" />
                Exemplo Prático de Evolução
              </h5>
              <div className="border border-brand-border bg-amber-50/10 rounded-xl p-5 relative overflow-hidden">
                {/* Visual stamp decoration */}
                <div className="absolute top-0 right-0 bg-brand-primary/10 text-brand-primary text-[9px] font-bold uppercase px-3 py-1 rounded-bl-lg tracking-wider">
                  Modelo Simulado
                </div>
                
                {/* Styled sheet of patient record */}
                <div className="text-sm text-stone-700 leading-relaxed font-sans whitespace-pre-line">
                  {currentTemplate.example}
                </div>
              </div>
            </div>

          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-brand-border bg-stone-50 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-5 py-2 text-sm font-medium bg-white border border-brand-border rounded-xl text-brand-text hover:bg-stone-100 hover:text-brand-text-dark transition-colors shadow-xs"
          >
            Fechar
          </button>
        </div>

      </div>
    </div>
  );
}
