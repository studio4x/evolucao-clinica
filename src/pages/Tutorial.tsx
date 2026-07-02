import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Mic, 
  Share2, 
  FileText, 
  CheckCircle2, 
  ShieldCheck, 
  Search as SearchIcon, 
  ArrowRight, 
  HelpCircle, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  BookOpen,
  Loader2
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';

export default function Tutorial() {
  const navigate = useNavigate();
  
  // Estados para FAQ
  const [categories, setCategories] = useState<any[]>([]);
  const [questions, setQuestions] = useState<any[]>([]);
  const [loadingFaq, setLoadingFaq] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [expandedQuestionId, setExpandedQuestionId] = useState<string | null>(null);

  const steps = [
    {
      icon: Users,
      title: 'Cadastrar Paciente',
      description: 'Cadastre seus pacientes e crie ou vincule um prontuário no Google Docs com apenas um clique para centralizar os registros.',
      color: 'bg-blue-500'
    },
    {
      icon: Mic,
      title: 'Gravar ou Enviar Relato',
      description: 'Grave sua narração clínica diretamente no app após a sessão ou envie arquivos de áudio gravados previamente no celular.',
      color: 'bg-green-500'
    },
    {
      icon: Share2,
      title: 'Compartilhar do WhatsApp',
      description: 'Envie áudios e mensagens de voz recebidos ou gravados no WhatsApp diretamente para o app Evolução Clínica para processar.',
      color: 'bg-emerald-600'
    },
    {
      icon: FileText,
      title: 'Transcrição por IA',
      description: 'Nossa inteligência artificial avançada transcreve a fala com rigor técnico, corrigindo vícios de linguagem e formatando o texto no padrão clínico.',
      color: 'bg-purple-500'
    },
    {
      icon: CheckCircle2,
      title: 'Sincronização com o Drive',
      description: 'O texto formatado pela IA é inserido automaticamente no início do documento do paciente no seu próprio Google Docs em tempo real.',
      color: 'bg-orange-500'
    },
    {
      icon: ShieldCheck,
      title: 'Assinatura com Proteção Legal',
      description: 'Assine digitalmente suas evoluções e relatórios para gerar um código digital de segurança imutável, garantindo conformidade jurídica.',
      color: 'bg-indigo-600'
    },
    {
      icon: Sparkles,
      title: 'Pesquisa Inteligente por IA',
      description: 'Faça perguntas ao histórico do prontuário (ex: "Quando o paciente apresentou melhora na fala?") e receba um resumo preciso em segundos.',
      color: 'bg-pink-500'
    }
  ];

  // Carregar dados de FAQ do Supabase
  useEffect(() => {
    const fetchFaqData = async () => {
      try {
        const { data: catData, error: catError } = await supabase
          .from('faq_categories')
          .select('*')
          .order('display_order', { ascending: true });
        
        if (catError) throw catError;
        setCategories(catData || []);

        const { data: questData, error: questError } = await supabase
          .from('faq_questions')
          .select('*')
          .order('display_order', { ascending: true });

        if (questError) throw questError;
        setQuestions(questData || []);
      } catch (err) {
        console.error('Erro ao carregar dados de FAQ:', err);
      } finally {
        setLoadingFaq(false);
      }
    };

    fetchFaqData();
  }, []);

  // Filtrar perguntas baseado na busca e categoria
  const filteredQuestions = questions.filter(q => {
    const matchesCategory = selectedCategoryId === 'all' || q.category_id === selectedCategoryId;
    const matchesSearch = searchQuery.trim() === '' || 
      q.question.toLowerCase().includes(searchQuery.toLowerCase()) || 
      q.answer.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const toggleQuestion = (id: string) => {
    setExpandedQuestionId(expandedQuestionId === id ? null : id);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-12 pb-16">
      {/* Cabeçalho */}
      <div className="text-center space-y-4">
        <div className="inline-flex items-center justify-center p-3 bg-brand-primary/10 rounded-2xl text-brand-primary mb-2">
          <BookOpen size={36} />
        </div>
        <h1 className="text-4xl font-display font-bold text-brand-primary">Guia de Uso & Dúvidas</h1>
        <p className="text-brand-text-muted text-lg max-w-2xl mx-auto">
          Aprenda o fluxo atual do aplicativo e tire suas dúvidas sobre a operação, segurança e integração.
        </p>
      </div>

      {/* Seção 1: Guia de Uso Passo a Passo */}
      <div className="space-y-6">
        <h2 className="text-2xl font-display font-bold text-brand-text flex items-center gap-2 border-b border-brand-border pb-3">
          <span className="text-brand-primary font-extrabold">1.</span>
          Fluxo de Trabalho Clínico
        </h2>
        <div className="grid grid-cols-1 gap-5">
          {steps.map((step, index) => {
            const Icon = step.icon;
            return (
              <div key={index} className="card p-5 flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-5 hover:shadow-md hover:border-brand-primary/20 transition-all border-l-4 border-l-brand-primary">
                <div className={`${step.color} p-3.5 rounded-xl text-white shadow-md flex-shrink-0`}>
                  <Icon size={24} />
                </div>
                <div className="flex-1 text-center md:text-left min-w-0">
                  <h3 className="text-base sm:text-lg font-display font-semibold text-brand-text flex items-center justify-center md:justify-start">
                    <span className="opacity-30 mr-2 text-xs font-mono">PASSO {index + 1}</span>
                    {step.title}
                  </h3>
                  <p className="mt-1 text-sm text-brand-text-muted leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Seção 2: FAQ interativo */}
      <div className="space-y-6 pt-6">
        <h2 className="text-2xl font-display font-bold text-brand-text flex items-center gap-2 border-b border-brand-border pb-3">
          <span className="text-brand-primary font-extrabold">2.</span>
          Perguntas Frequentes (FAQ)
        </h2>

        {/* Busca */}
        <div className="relative">
          <SearchIcon className="absolute left-4 top-3.5 text-brand-text-muted w-5 h-5 pointer-events-none" />
          <input
            type="text"
            placeholder="Pesquise por termos, palavras-chave ou dúvidas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="input-field pl-12 pr-4 py-3.5 text-sm w-full bg-white border border-brand-border rounded-xl focus:border-brand-primary focus:ring-1 focus:ring-brand-primary transition-all"
          />
        </div>

        {/* Categorias (Abas) */}
        {!loadingFaq && categories.length > 0 && (
          <div className="flex flex-wrap gap-2 pb-2">
            <button
              onClick={() => setSelectedCategoryId('all')}
              className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                selectedCategoryId === 'all'
                  ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                  : 'bg-white text-brand-text-muted border-brand-border hover:bg-brand-bg'
              }`}
            >
              Ver Todas
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setSelectedCategoryId(cat.id)}
                className={`px-4 py-2 rounded-lg text-xs font-semibold border transition-all cursor-pointer ${
                  selectedCategoryId === cat.id
                    ? 'bg-brand-primary text-white border-brand-primary shadow-sm'
                    : 'bg-white text-brand-text-muted border-brand-border hover:bg-brand-bg'
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        )}

        {/* Lista de Perguntas (Acordeão) */}
        {loadingFaq ? (
          <div className="flex justify-center items-center py-12">
            <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
            <span className="ml-2 text-sm text-brand-text-muted">Carregando perguntas...</span>
          </div>
        ) : filteredQuestions.length > 0 ? (
          <div className="space-y-3">
            {filteredQuestions.map((q) => {
              const isExpanded = expandedQuestionId === q.id;
              const categoryName = categories.find(c => c.id === q.category_id)?.name || '';
              return (
                <div 
                  key={q.id} 
                  className={`card border transition-all duration-200 overflow-hidden ${
                    isExpanded 
                      ? 'border-brand-primary/30 ring-1 ring-brand-primary/10 shadow-sm' 
                      : 'border-brand-border hover:border-brand-primary/20'
                  }`}
                >
                  <button
                    onClick={() => toggleQuestion(q.id)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-4 font-semibold text-brand-text bg-transparent border-0 cursor-pointer"
                  >
                    <div className="space-y-1 min-w-0">
                      {categoryName && selectedCategoryId === 'all' && (
                        <span className="inline-block text-[9px] bg-brand-bg text-brand-text-muted px-2 py-0.5 rounded font-mono uppercase tracking-wider">
                          {categoryName}
                        </span>
                      )}
                      <p className="text-sm sm:text-base font-semibold leading-snug">{q.question}</p>
                    </div>
                    {isExpanded ? (
                      <ChevronUp size={18} className="text-brand-primary flex-shrink-0" />
                    ) : (
                      <ChevronDown size={18} className="text-brand-text-muted flex-shrink-0" />
                    )}
                  </button>
                  
                  {/* Conteúdo Expansível */}
                  <div 
                    className={`transition-all duration-300 ease-in-out ${
                      isExpanded ? 'max-h-[500px] border-t border-brand-border' : 'max-h-0'
                    }`}
                  >
                    <div className="p-5 text-sm text-brand-text-muted leading-relaxed bg-brand-bg/10 whitespace-pre-line">
                      {q.answer}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="card p-12 text-center border-dashed border-2 border-brand-border bg-white rounded-2xl flex flex-col items-center justify-center">
            <HelpCircle size={48} className="text-brand-text-muted/60 mb-3 animate-bounce" />
            <p className="font-semibold text-brand-text text-base">Nenhuma dúvida encontrada</p>
            <p className="text-xs text-brand-text-muted max-w-sm mt-1">
              Experimente buscar por outros termos ou limpe o filtro de categorias para ver todas as perguntas.
            </p>
          </div>
        )}
      </div>

      {/* CTA Final */}
      <div className="card p-8 bg-brand-primary text-white text-center space-y-6 overflow-hidden relative rounded-2xl">
        <div className="absolute top-0 right-0 opacity-10 -mr-12 -mt-12 pointer-events-none">
          <CheckCircle2 size={240} />
        </div>
        <h2 className="text-2xl font-display font-bold relative z-10 text-white">Pronto para automatizar seus registros?</h2>
        <p className="opacity-90 relative z-10 max-w-lg mx-auto text-sm">
          Crie seu primeiro paciente, vincule o prontuário no Drive e experimente a velocidade da inteligência artificial.
        </p>
        <button 
          onClick={() => navigate('/painel/patients/new')}
          className="bg-white text-brand-primary px-8 py-3 rounded-xl font-bold hover:bg-brand-bg transition-colors flex items-center space-x-2 mx-auto relative z-10 border-0 cursor-pointer shadow-md"
        >
          <span>Cadastrar Novo Paciente</span>
          <ArrowRight size={20} />
        </button>
      </div>
    </div>
  );
}
