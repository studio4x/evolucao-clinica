import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { 
  Sparkles, 
  Mic, 
  Files, 
  ShieldCheck, 
  Check, 
  ChevronDown, 
  ArrowRight, 
  Lock, 
  Play, 
  Users, 
  Calendar, 
  FileText, 
  Send,
  HelpCircle,
  Menu,
  X,
  Plus,
  Brain,
  Volume2,
  GraduationCap,
  Activity,
  Stethoscope,
  TrendingUp,
  Clock,
  Coins,
  Database,
  AlertCircle
} from 'lucide-react';
import { APP_VERSION } from '../components/layout/AppVersion';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { LEGAL_SUPPORT_EMAIL } from '../utils/legal';
import { supabase } from '../supabaseClient';
import { FeatureTooltip } from '../components/common/FeatureTooltip';

const GooglePayLogo = ({ className = "h-4 w-auto" }: { className?: string }) => (
  <svg 
    viewBox="0 0 80 38.1" 
    className={className} 
    xmlns="http://www.w3.org/2000/svg"
  >
    <path fill="#5F6368" d="M37.8,19.7V29h-3V6h7.8c1.9,0,3.7,0.7,5.1,2c1.4,1.2,2.1,3,2.1,4.9c0,1.9-0.7,3.6-2.1,4.9c-1.4,1.3-3.1,2-5.1,2L37.8,19.7L37.8,19.7z M37.8,8.8v8h5c1.1,0,2.2-0.4,2.9-1.2c1.6-1.5,1.6-4,0.1-5.5c0,0-0.1-0.1-0.1-0.1c-0.8-0.8-1.8-1.3-2.9-1.2L37.8,8.8L37.8,8.8z"/>
    <path fill="#5F6368" d="M56.7,12.8c2.2,0,3.9,0.6,5.2,1.8s1.9,2.8,1.9,4.8V29H61v-2.2h-0.1c-1.2,1.8-2.9,2.7-4.9,2.7c-1.7,0-3.2-0.5-4.4-1.5c-1.1-1-1.8-2.4-1.8-3.9c0-1.6,0.6-2.9,1.8-3.9c1.2-1,2.9-1.4,4.9-1.4c1.8,0,3.2,0.3,4.3,1v-0.7c0-1-0.4-2-1.2-2.6c-0.8-0.7-1.8-1.1-2.9-1.1c-1.7,0-3,0.7-3.9,2.1l-2.6-1.6C51.8,13.8,53.9,12.8,56.7,12.8z M52.9,24.2c0,0.8,0.4,1.5,1,1.9c0.7,0.5,1.5,0.8,2.3,0.8c1.2,0,2.4-0.5,3.3-1.4c1-0.9,1.5-2,1.5-3.2c-0.9-0.7-2.2-1.1-3.9-1.1c-1.2,0-2.2,0.3-3,0.9C53.3,22.6,52.9,23.3,52.9,24.2z"/>
    <path fill="#5F6368" d="M80,13.3l-9.9,22.7h-3l3.7-7.9l-6.5-14.7h3.2l4.7,11.3h0.1l4.6-11.3H80z"/>
    <path fill="#4285F4" d="M25.9,17.7c0-0.9-0.1-1.8-0.2-2.7H13.2v5.1h7.1c-0.3,1.6-1.2,3.1-2.6,4v3.3H22C24.5,25.1,25.9,21.7,25.9,17.7z"/>
    <path fill="#34A853" d="M13.2,30.6c3.6,0,6.6-1.2,8.8-3.2l-4.3-3.3c-1.2,0.8-2.7,1.3-4.5,1.3c-3.4,0-6.4-2.3-7.4-5.5H1.4v3.4C3.7,27.8,8.2,30.6,13.2,30.6z"/>
    <path fill="#FBBC04" d="M5.8,19.9c-0.6-1.6-0.6-3.4,0-5.1v-3.4H1.4c-1.9,3.7-1.9,8.1,0,11.9L5.8,19.9z"/>
    <path fill="#EA4335" d="M13.2,9.4c1.9,0,3.7,0.7,5.1,2l0,0l3.8-3.8c-2.4-2.2-5.6-3.5-8.8-3.4c-5,0-9.6,2.8-11.8,7.3l4.4,3.4C6.8,11.7,9.8,9.4,13.2,9.4z"/>
  </svg>
);

const DEFAULT_PLANS = [
  {
    id: 'monthly',
    name: 'Plano Mensal',
    price: 39.00,
    equivalent_monthly_price: null,
    discount_text: null,
    tag_text: 'Mês a Mês',
    description: 'Flexibilidade para experimentar sem amarras contratuais.',
    features: [
      'Pacientes ilimitados',
      'Evoluções clínicas com IA ilimitadas',
      'Integração com Google Docs em tempo real',
      'Gravação e transcrição de áudio nativa',
      'Geração de Relatórios & PDI por IA',
      'Pesquisa Inteligente por IA (Pergunte ao Prontuário)',
      'Assinatura Digital de Documentos com Proteção Legal',
      'Compartilhamento Seguro de Relatórios (WhatsApp/E-mail)',
      'Filtro de Período na Impressão do Prontuário',
      'Lembrete e envio de WhatsApp para aniversariantes',
      'Impressão de prontuários do Google Docs'
    ]
  },
  {
    id: 'yearly',
    name: 'Plano Anual',
    price: 199.00,
    equivalent_monthly_price: 16.58,
    discount_text: '57% OFF',
    tag_text: 'Popular',
    description: 'A alternativa perfeita para consolidar sua economia anual.',
    features: [
      'Tudo do plano mensal',
      'Economia de 57% em relação ao plano mensal',
      'Suporte prioritário via e-mail e WhatsApp',
      'Garantia de novos recursos em primeira mão',
      'Migração assistida de prontuários por IA (PDF/Word/Excel)',
      'Logotipo personalizado nos relatórios e evoluções (PDF/Impresso)',
      'Backup e Restauração no Google Drive (Diário/Semanal/Mensal)'
    ]
  }
];

export default function LandingPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [faqOpen, setFaqOpen] = useState<number | null>(null);

  const [plans, setPlans] = useState<any[]>([]);
  const [activeSpecialty, setActiveSpecialty] = useState('psicologia');
  const [pacientesPorSemana, setPacientesPorSemana] = useState(20);
  const [tempoPorEvolucao, setTempoPorEvolucao] = useState(15);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const { data, error } = await supabase
          .from('plans')
          .select('*')
          .order('price', { ascending: true });
        if (error) throw error;
        if (data && data.length > 0) {
          setPlans(data);
        }
      } catch (e) {
        console.error("Error fetching plans in landing page:", e);
      }
    };
    fetchPlans();
  }, []);
  
  // States for the interactive simulation
  const [simStep, setSimStep] = useState<'idle' | 'recording' | 'transcribing' | 'completed'>('idle');
  const [typedText, setTypedText] = useState('');
  const fullTranscript = "Paciente relata crises de ansiedade recorrentes na última semana, engatilhadas por prazos no trabalho. Apresenta insônia inicial de 2 horas e cefaleia tensional. Humor deprimido e afeto ansioso. Relatou melhora parcial após técnicas de respiração recomendadas na última consulta.";

  const toggleFaq = (index: number) => {
    setFaqOpen(faqOpen === index ? null : index);
  };

  const startSimulation = () => {
    if (simStep !== 'idle') return;
    setSimStep('recording');
    
    // Simulate recording for 2 seconds
    setTimeout(() => {
      setSimStep('transcribing');
      // Simulate typing/transcribing
      let i = 0;
      const interval = setInterval(() => {
        setTypedText(prev => prev + fullTranscript.charAt(i));
        i++;
        if (i >= fullTranscript.length) {
          clearInterval(interval);
          setSimStep('completed');
        }
      }, 15);
    }, 1500);
  };

  const resetSimulation = () => {
    setSimStep('idle');
    setTypedText('');
  };

  const scrollToSection = (id: string) => {
    const element = document.getElementById(id);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
    setMobileMenuOpen(false);
  };

  const faqs = [
    {
      q: "Como o aplicativo grava e transcreve os áudios?",
      a: "Você pode gravar diretamente pelo microfone do celular ou computador dentro do aplicativo ou até mesmo compartilhar um arquivo de áudio gravado no WhatsApp ou gravador do celular. Nossa IA avançada transcreve a fala com altíssima precisão técnica, compreendendo termos médicos e termos da área de saúde e psicologia."
    },
    {
      q: "Como funciona a integração com o Google Drive?",
      a: "Tudo é salvo de forma totalmente transparente na sua própria conta do Google. Na primeira vez que você entra, concede permissão ao app para criar documentos e pastas no seu Google Drive. Nós criamos uma pasta organizada chamada 'Evolução Clínica' e salvamos cada prontuário lá, em formato Google Docs. Os dados são inteiramente seus."
    },
    {
      q: "Como funciona o teste gratuito de 7 dias?",
      a: "Ao criar sua conta, você recebe acesso completo por 7 dias, como se já fosse assinante. Depois desse prazo, o acesso às funcionalidades principais é bloqueado até você escolher um plano."
    },
    {
      q: "O sistema atende aos requisitos da LGPD?",
      a: "Sim, com rigor máximo. Toda a comunicação de dados é criptografada e o armazenamento dos prontuários é feito diretamente no seu próprio Google Drive pessoal ou corporativo, garantindo que terceiros não tenham acesso aos dados confidenciais dos seus pacientes."
    },
    {
      q: "Como funciona o reembolso garantido de 7 dias?",
      a: "Respeitamos integralmente o Código de Defesa do Consumidor (CDC). Se você assinar qualquer plano e decidir que a ferramenta não é adequada à sua prática nas primeiras 24 horas ou nos primeiros 7 dias, basta acessar a aba de Assinaturas e solicitar o cancelamento e estorno imediato com apenas um clique."
    },
    {
      q: "Quais são as formas de pagamento aceitas? É seguro?",
      a: "Os pagamentos são processados de forma 100% segura por meio da integração nativa com o Google Pay. Você pode pagar em poucos cliques utilizando seus cartões de crédito já salvos com segurança em sua Conta do Google. Todos os dados financeiros são trafegados de forma totalmente criptografada e em conformidade com as regras rígidas do PCI-DSS, garantindo sigilo absoluto."
    },
    {
      q: "Posso cancelar ou alterar meu plano a qualquer momento?",
      a: "Sim! Não há cláusulas de fidelidade ou burocracia. Você pode cancelar sua assinatura recorrente ou migrar de plano diretamente pelo painel administrativo do aplicativo com apenas um clique."
    },
    {
      q: "Como funciona a Migração de Prontuários antigos por IA?",
      a: "Disponibilizada sem custo adicional para assinantes do Plano Anual, nossa equipe técnica utiliza robôs de IA dedicados para extrair, estruturar e importar todo o seu histórico antigo de prontuários (sejam arquivos em PDF, documentos do Word ou planilhas do Excel) diretamente para o aplicativo de forma 100% segura e rápida."
    },
    {
      q: "Como funciona o Backup e Restauração automática no Google Drive?",
      a: "Exclusivo do Plano Anual, o aplicativo compila suas configurações de conta, ficha de pacientes e evoluções em um arquivo de segurança no seu Google Drive pessoal. Você define a frequência (diário, semanal ou mensal) e pode restaurar de forma inteligente qualquer uma das últimas 3 versões históricas em apenas 1 clique (mesclando os registros sem apagar novos dados)."
    },
    {
      q: "Posso colocar o logotipo do meu consultório nos relatórios em PDF?",
      a: "Sim! Assinantes do Plano Anual podem fazer o upload do seu logotipo na tela de Perfil. Uma vez configurado, ele será aplicado de forma elegante no topo de todas as evoluções clínicas assinadas e relatórios gerados por IA prontos para impressão ou exportação em PDF."
    }
  ];

  return (
    <div className="min-h-screen bg-brand-bg text-brand-text font-sans antialiased">
      {/* HEADER / NAVIGATION */}
      <header className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-brand-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-20">
            {/* Logo */}
            <div className="flex-shrink-0">
              <Link to="/" className="flex items-center">
                {(siteConfig.logo_light_url || siteConfig.logo_dark_url) ? (
                  <img 
                    src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
                    alt={siteConfig.pwa_app_name || "Evolução Clínica"} 
                    className="h-16 w-auto object-contain cursor-pointer transition-transform hover:scale-102"
                  />
                ) : (
                  <span className="text-xl font-display font-bold text-brand-primary">
                    {siteConfig.pwa_app_name || "Evolução Clínica"}
                  </span>
                )}
              </Link>
            </div>

            {/* Desktop Navigation */}
            <nav className="hidden lg:flex space-x-8 text-sm font-semibold text-brand-text-muted">
              <button onClick={() => scrollToSection('recursos')} className="hover:text-brand-primary transition-colors cursor-pointer whitespace-nowrap">Recursos</button>
              <button onClick={() => scrollToSection('como-funciona')} className="hover:text-brand-primary transition-colors cursor-pointer whitespace-nowrap">Como Funciona</button>
              <button onClick={() => scrollToSection('demonstracao')} className="hover:text-brand-primary transition-colors cursor-pointer whitespace-nowrap">Demonstração</button>
              <button onClick={() => scrollToSection('planos')} className="hover:text-brand-primary transition-colors cursor-pointer whitespace-nowrap">Planos</button>
              <button onClick={() => scrollToSection('faq')} className="hover:text-brand-primary transition-colors cursor-pointer whitespace-nowrap">FAQ</button>
            </nav>

            {/* Auth CTA Buttons */}
            <div className="hidden lg:flex items-center space-x-4">
              {user ? (
                <Link to="/painel" className="btn-primary flex items-center gap-2 px-6 py-2.5 font-semibold text-sm shadow-md hover:shadow-lg whitespace-nowrap">
                  Acessar Painel <ArrowRight size={16} />
                </Link>
              ) : (
                <>
                  <Link to="/login" className="text-sm font-semibold text-brand-text-muted hover:text-brand-primary transition-colors whitespace-nowrap">
                    Entrar
                  </Link>
                  <Link to="/login" className="btn-primary flex items-center gap-2 px-6 py-2.5 font-semibold text-sm shadow-md hover:shadow-lg whitespace-nowrap">
                    Teste gratuito de 7 dias
                  </Link>
                </>
              )}
            </div>

            {/* Mobile Menu Button */}
            <div className="lg:hidden flex items-center">
              <button 
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)} 
                className="text-brand-primary p-2 focus:outline-none"
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
              </button>
            </div>
          </div>
        </div>

        {/* Mobile Navigation Dropdown */}
        {mobileMenuOpen && (
          <div className="lg:hidden bg-white border-t border-brand-border py-4 px-6 space-y-4 shadow-xl">
            <button onClick={() => scrollToSection('recursos')} className="block w-full text-left text-base font-medium text-brand-text-muted hover:text-brand-primary">Recursos</button>
            <button onClick={() => scrollToSection('como-funciona')} className="block w-full text-left text-base font-medium text-brand-text-muted hover:text-brand-primary">Como Funciona</button>
            <button onClick={() => scrollToSection('demonstracao')} className="block w-full text-left text-base font-medium text-brand-text-muted hover:text-brand-primary">Demonstração</button>
            <button onClick={() => scrollToSection('planos')} className="block w-full text-left text-base font-medium text-brand-text-muted hover:text-brand-primary">Planos</button>
            <button onClick={() => scrollToSection('faq')} className="block w-full text-left text-base font-medium text-brand-text-muted hover:text-brand-primary">FAQ</button>
            <div className="pt-4 border-t border-brand-border flex flex-col gap-3">
              {user ? (
                <Link to="/painel" className="btn-primary w-full text-center py-3 font-semibold shadow-md">
                  Acessar Painel
                </Link>
              ) : (
                <>
                  <Link to="/login" className="btn-outline w-full text-center py-3 font-semibold">
                    Entrar
                  </Link>
                  <Link to="/login" className="btn-primary w-full text-center py-3 font-semibold shadow-md">
                    Teste gratuito de 7 dias
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 md:py-32">
        {/* Background Gradients */}
        <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-b from-brand-primary/5 to-transparent pointer-events-none" />
        <div className="absolute -top-40 -right-40 w-[600px] h-[600px] bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-1/2 -left-40 w-[500px] h-[500px] bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-8 items-center">
            {/* Text Side */}
            <div className="lg:col-span-7 space-y-6 text-center lg:text-left">
              {/* Badge */}
              <div className="inline-flex items-center gap-2 px-4 py-1.5 bg-brand-accent/15 rounded-full border border-brand-accent/30 text-brand-primary font-semibold text-xs tracking-wider uppercase mx-auto lg:mx-0">
                <Sparkles size={14} className="animate-pulse" /> Inteligência Artificial para Terapeutas & Clínicas
              </div>

              {/* Title */}
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-display font-extrabold tracking-tight leading-tight">
                Sua prática clínica <br />
                <span className="bg-gradient-to-r from-brand-primary to-brand-accent bg-clip-text text-transparent">
                  automatizada com IA
                </span>
              </h1>

              {/* Subheading */}
              <p className="text-lg text-brand-text-muted max-w-2xl mx-auto lg:mx-0 leading-relaxed font-normal">
                Grave suas consultas ou resumos falados por áudio. Nossa IA transcreve com precisão, estrutura a evolução clínica no padrão profissional e salva automaticamente no seu próprio Google Drive.
              </p>
              <p className="text-sm font-semibold text-brand-primary max-w-2xl mx-auto lg:mx-0">
                Ao criar sua conta, você recebe 7 dias de uso completo como assinante para testar a plataforma sem fricção.
              </p>

              {/* CTAs */}
              <div className="flex flex-col sm:flex-row items-center justify-center lg:justify-start gap-4 pt-2">
                <Link to="/login" className="btn-primary w-full sm:w-auto px-8 py-4 text-base font-bold tracking-wide shadow-lg shadow-brand-primary/20 hover:shadow-xl hover:shadow-brand-primary/30 transform transition-all hover:-translate-y-0.5 flex items-center justify-center gap-3">
                  Teste gratuito de 7 dias <ArrowRight size={18} />
                </Link>
                <button 
                  onClick={() => scrollToSection('planos')}
                  className="btn-outline w-full sm:w-auto px-8 py-4 text-base font-semibold transition-all hover:border-brand-primary/50"
                >
                  Ver Planos de Assinatura
                </button>
              </div>

              {/* Badges / Social Proof */}
              <div className="grid grid-cols-3 gap-4 pt-6 max-w-md mx-auto lg:mx-0 border-t border-brand-border/60">
                <div>
                  <p className="text-2xl font-bold font-display text-brand-primary">100%</p>
                  <p className="text-xs text-brand-text-muted font-medium">Sob seu controle no Google Docs</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-display text-brand-primary">Livre</p>
                  <p className="text-xs text-brand-text-muted font-medium">De digitação manual demorada</p>
                </div>
                <div>
                  <p className="text-2xl font-bold font-display text-brand-primary">Conforme</p>
                  <p className="text-xs text-brand-text-muted font-medium">Com a LGPD e regras do CDC</p>
                </div>
              </div>
            </div>

            {/* Visual Side (Mockups/Graphics) */}
            <div className="lg:col-span-5 relative">
              <div className="absolute inset-0 bg-gradient-to-tr from-brand-accent/20 to-brand-primary/20 rounded-3xl blur-2xl opacity-60 scale-95 pointer-events-none" />
              
              <div className="relative card border-brand-primary/10 shadow-2xl p-4 bg-white/95 backdrop-blur-sm transform transition-all hover:scale-[1.01] hover:-rotate-1">
                {/* Simulated Header */}
                <div className="flex items-center justify-between pb-3 border-b border-brand-border mb-4">
                  <div className="flex items-center space-x-2">
                    <div className="w-3 h-3 rounded-full bg-red-400" />
                    <div className="w-3 h-3 rounded-full bg-yellow-400" />
                    <div className="w-3 h-3 rounded-full bg-green-400" />
                  </div>
                  <div className="bg-brand-bg rounded-lg py-1 px-3 border border-brand-border text-[10px] font-semibold text-brand-text-muted">
                    prontuario-paciente-ia.docx
                  </div>
                  <Lock size={12} className="text-brand-primary/60" />
                </div>
                
                {/* Visual content of screenshot */}
                <div className="space-y-4">
                  {/* Paciente tag */}
                  <div className="bg-brand-bg p-3 rounded-xl border border-brand-border flex justify-between items-center">
                    <div>
                      <p className="text-[10px] text-brand-text-muted uppercase font-bold">Paciente em Consulta</p>
                      <p className="text-xs font-bold text-brand-primary">Eduardo Mendes da Silva</p>
                    </div>
                    <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-[9px] font-bold">Ativo</span>
                  </div>

                  {/* Audio Recording preview */}
                  <div className="border border-brand-border bg-gradient-to-r from-brand-primary/5 to-brand-accent/5 rounded-xl p-3.5 flex items-center justify-between">
                    <div className="flex items-center space-x-3">
                      <div className="w-8 h-8 rounded-full bg-brand-primary flex items-center justify-center text-white animate-pulse">
                        <Mic size={14} />
                      </div>
                      <div>
                        <p className="text-xs font-bold text-brand-text">Gravação de Consulta</p>
                        <p className="text-[10px] text-brand-text-muted">05:42 • Transcrevendo em tempo real...</p>
                      </div>
                    </div>
                    {/* Simulated Waveform */}
                    <div className="flex items-end space-x-0.5 h-6">
                      <div className="w-0.5 h-2 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0.1s' }} />
                      <div className="w-0.5 h-4 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0.3s' }} />
                      <div className="w-0.5 h-5 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0.5s' }} />
                      <div className="w-0.5 h-3 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                      <div className="w-0.5 h-4 bg-brand-primary rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                  </div>

                  {/* AI Structured Output */}
                  <div className="border border-brand-border rounded-xl p-3 space-y-2 bg-brand-surface">
                    <div className="flex items-center space-x-1.5 text-brand-primary">
                      <Sparkles size={12} />
                      <span className="text-[10px] font-bold uppercase tracking-wider">Evolução Clínica Gerada por IA</span>
                    </div>
                    <div className="space-y-1.5 text-[11px] leading-relaxed text-brand-text-muted">
                      <p><strong className="text-brand-text">1. Condições Gerais:</strong> Paciente calmo, cooperativo, relatando episódios recorrentes de ansiedade...</p>
                      <p><strong className="text-brand-text">2. Conduta Clínica:</strong> Aplicação de técnica cognitiva para reestruturação de pensamentos automáticos...</p>
                    </div>
                  </div>

                  {/* Google Drive sync confirmation */}
                  <div className="flex items-center space-x-2 text-[10px] font-bold text-brand-primary bg-brand-accent/15 py-2 px-3 rounded-lg border border-brand-accent/25">
                    <ShieldCheck size={14} />
                    <span>Salvo automaticamente no Google Drive do profissional</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* RECURSOS / DIFERENCIAIS */}
      <section id="recursos" className="py-20 bg-white border-y border-brand-border relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold">Tudo o que você precisa para otimizar seus prontuários</h2>
            <p className="text-brand-text-muted max-w-2xl mx-auto text-base">
              Desenvolvemos a ferramenta ideal para profissionais de saúde e terapeutas eliminarem a burocracia do registro clínico diário.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Card 1 */}
            <div className="card p-8 space-y-4 hover:shadow-xl hover:border-brand-primary/20 transform transition-all hover:-translate-y-1 bg-brand-bg/20">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <Mic size={24} />
              </div>
              <h3 className="text-xl font-bold font-display text-brand-primary">Transcrição Inteligente</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Grave áudios diretamente do app no celular ou envie mensagens de voz. Nossa IA transcreve tudo de forma inteligente, captando jargões clínicos de forma impecável.
              </p>
            </div>

            {/* Card 2 */}
            <div className="card p-8 space-y-4 hover:shadow-xl hover:border-brand-primary/20 transform transition-all hover:-translate-y-1 bg-brand-bg/20">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <Sparkles size={24} />
              </div>
              <h3 className="text-xl font-bold font-display text-brand-primary">Evoluções & Relatórios com IA</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Crie evoluções clínicas estruturadas e relatórios de acompanhamento ou PDIs em segundos, economizando horas de escrita repetitiva pós-atendimento.
              </p>
            </div>

            {/* Card 3 */}
            <div className="card p-8 space-y-4 hover:shadow-xl hover:border-brand-primary/20 transform transition-all hover:-translate-y-1 bg-brand-bg/20">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <Files size={24} />
              </div>
              <h3 className="text-xl font-bold font-display text-brand-primary">Sincronização com Google Drive</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Esqueça bancos de dados trancados. Os prontuários são criados na sua própria pasta do Google Docs, de onde você pode imprimir, formatar e compartilhar livremente.
              </p>
            </div>

            {/* Card 4 */}
            <div className="card p-8 space-y-4 hover:shadow-xl hover:border-brand-primary/20 transform transition-all hover:-translate-y-1 bg-brand-bg/20">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-xl font-bold font-display text-brand-primary">Privacidade e LGPD</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                A segurança vem primeiro. As informações dos seus pacientes são mantidas sob a sua tutela direta na infraestrutura segura do ecossistema do Google.
              </p>
            </div>

            {/* Card 5 */}
            <div className="card p-8 space-y-4 hover:shadow-xl hover:border-brand-primary/20 transform transition-all hover:-translate-y-1 bg-brand-bg/20">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <Calendar size={24} />
              </div>
              <h3 className="text-xl font-bold font-display text-brand-primary">WhatsApp Integrado</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Envie alertas automáticos, lembretes de evolução, mensagens de parabéns para aniversariantes e compartilhe relatórios diretamente via WhatsApp com facilidade.
              </p>
            </div>

            {/* Card 6 */}
            <div className="card p-8 space-y-4 hover:shadow-xl hover:border-brand-primary/20 transform transition-all hover:-translate-y-1 bg-brand-bg/20">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <Users size={24} />
              </div>
              <h3 className="text-xl font-bold font-display text-brand-primary">Gestão de Pacientes Clara</h3>
              <p className="text-brand-text-muted text-sm leading-relaxed">
                Painel administrativo completo e responsivo para monitorar aniversários, evoluções pendentes, status de prontuário e histórico de atendimento de cada indivíduo.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ESPECIALIDADES SECTION */}
      <section className="py-20 bg-brand-bg relative overflow-hidden border-b border-brand-border">
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/10 rounded-full text-brand-primary text-xs font-bold uppercase tracking-wider">
              <Users size={14} /> Feito para a sua área
            </div>
            <h2 className="text-3xl sm:text-4xl font-display font-bold">Adaptável para diversas especialidades de saúde</h2>
            <p className="text-brand-text-muted max-w-2xl mx-auto text-base">
              A inteligência artificial do app reconhece os termos técnicos, jargões e abreviações da sua profissão de forma inteligente.
            </p>
          </div>

          {/* Tabs header */}
          <div className="flex flex-wrap md:flex-nowrap justify-center md:justify-center gap-2 mb-10 max-w-5xl mx-auto overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            {[
              { id: 'psicologia', label: 'Psicologia', icon: Brain },
              { id: 'fonoaudiologia', label: 'Fonoaudiologia', icon: Volume2 },
              { id: 'psicopedagogia', label: 'Psicopedagogia', icon: GraduationCap },
              { id: 'terapia-ocupacional', label: 'Terapia Ocupacional', icon: Activity },
              { id: 'medicina', label: 'Medicina & Psiquiatria', icon: Stethoscope }
            ].map((tab) => {
              const Icon = tab.icon;
              const active = activeSpecialty === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveSpecialty(tab.id)}
                  className={`flex items-center gap-2 px-4 py-3 rounded-full text-sm font-bold transition-all cursor-pointer whitespace-nowrap ${
                    active 
                      ? 'bg-brand-primary text-white shadow-md' 
                      : 'bg-white text-brand-text-muted hover:text-brand-primary border border-brand-border hover:border-brand-primary/30'
                  }`}
                >
                  <Icon size={16} />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab content card */}
          <div className="max-w-4xl mx-auto bg-white rounded-3xl border border-brand-border p-8 shadow-xl relative overflow-hidden transition-all duration-300">
            <div className="absolute top-0 left-0 w-2 h-full bg-brand-primary" />
            {activeSpecialty === 'psicologia' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                    <Brain size={20} />
                  </div>
                  <h3 className="text-xl font-bold font-display text-brand-primary">Evoluções Clínicas para Psicólogos</h3>
                </div>
                <p className="text-brand-text-muted text-sm leading-relaxed">
                  Perfeito para registrar sessões de Terapia Cognitivo-Comportamental (TCC), Psicanálise, Fenomenologia, entre outras abordagens. A IA do aplicativo organiza com maestria as queixas trazidas pelo paciente, suas respostas emocionais, hipóteses diagnósticas em evolução e as estratégias/intervenções planejadas para as próximas sessões.
                </p>
                <div className="bg-brand-bg/40 p-4 rounded-2xl border border-brand-border space-y-2">
                  <p className="text-xs font-bold text-brand-primary uppercase tracking-wider">Como fica o prontuário estruturado:</p>
                  <div className="text-xs text-brand-text space-y-1 bg-white p-3 rounded-xl border border-brand-border/60">
                    <p><strong>• Queixa e Estado Geral:</strong> Paciente traz relato de ansiedade difusa, humor disfórico e crises de pânico engatilhadas no ambiente acadêmico.</p>
                    <p><strong>• Intervenções do Psicólogo:</strong> Realizada psicoeducação sobre ansiedade e treino de técnicas de respiração diafragmática para regulação.</p>
                    <p><strong>• Encaminhamentos/Conduta:</strong> Orientado o registro de pensamentos disfuncionais e leitura de material de apoio.</p>
                  </div>
                </div>
              </div>
            )}
            {activeSpecialty === 'fonoaudiologia' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                    <Volume2 size={20} />
                  </div>
                  <h3 className="text-xl font-bold font-display text-brand-primary">Evoluções para Fonoaudiologia</h3>
                </div>
                <p className="text-brand-text-muted text-sm leading-relaxed">
                  Desenvolvido para fonoaudiólogos que atuam em linguagem (TEA, atrasos de fala), motricidade orofacial, processamento auditivo ou voz. A IA estrutura a evolução clínica separando o desempenho nas atividades de fonoterapia, as evoluções nos marcos de desenvolvimento e as orientações fornecidas aos familiares.
                </p>
                <div className="bg-brand-bg/40 p-4 rounded-2xl border border-brand-border space-y-2">
                  <p className="text-xs font-bold text-brand-primary uppercase tracking-wider">Como fica o prontuário estruturado:</p>
                  <div className="text-xs text-brand-text space-y-1 bg-white p-3 rounded-xl border border-brand-border/60">
                    <p><strong>• Aspectos Linguísticos/Auditivos:</strong> Apresentou melhora no contato visual e intenção comunicativa. Demonstrou avanço na articulação dos fonemas /l/ e /lh/.</p>
                    <p><strong>• Atividades Realizadas:</strong> Uso de jogos simbólicos e pareamento de estímulos visuais para treino de vocabulário.</p>
                    <p><strong>• Orientações à Família:</strong> Instruído aos pais incentivar a nomeação em contexto domiciliar, evitando antecipar as demandas do paciente.</p>
                  </div>
                </div>
              </div>
            )}
            {activeSpecialty === 'psicopedagogia' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                    <GraduationCap size={20} />
                  </div>
                  <h3 className="text-xl font-bold font-display text-brand-primary">Relatórios e PDIs para Psicopedagogos</h3>
                </div>
                <p className="text-brand-text-muted text-sm leading-relaxed">
                  Perfeito para acompanhar processos de aprendizagem escolar, diagnóstico e intervenção psicopedagógica (TDAH, dislexia, autismo). Permite que você crie relatórios de sessões lúdicas, registre o progresso em leitura/escrita e organize dados para a elaboração de Planos de Desenvolvimento Individual (PDI) com poucos cliques.
                </p>
                <div className="bg-brand-bg/40 p-4 rounded-2xl border border-brand-border space-y-2">
                  <p className="text-xs font-bold text-brand-primary uppercase tracking-wider">Como fica o prontuário estruturado:</p>
                  <div className="text-xs text-brand-text space-y-1 bg-white p-3 rounded-xl border border-brand-border/60">
                    <p><strong>• Foco Cognitivo/Aprendizagem:</strong> Excelente desempenho em tarefas de atenção concentrada com suporte visual. Dificuldade moderada no raciocínio lógico-matemático com frações.</p>
                    <p><strong>• Recursos Utilizados:</strong> Jogos de tabuleiro temáticos e atividades sensoriais estruturadas.</p>
                    <p><strong>• Plano de Intervenção:</strong> Próxima sessão focará na mediação de estratégias de cálculo mental com blocos lógicos.</p>
                  </div>
                </div>
              </div>
            )}
            {activeSpecialty === 'terapia-ocupacional' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                    <Activity size={20} />
                  </div>
                  <h3 className="text-xl font-bold font-display text-brand-primary">Prontuários para Terapeutas Ocupacionais (TO)</h3>
                </div>
                <p className="text-brand-text-muted text-sm leading-relaxed">
                  Adequado para TOs que trabalham com Integração Sensorial de Ayres, reabilitação física, estimulação precoce e desenvolvimento de Atividades de Vida Diária (AVDs). A IA organiza os dados detalhando a autorregulação do paciente, tolerância aos estímulos sensoriais, coordenação motora fina/grossa e nível de independência demonstrado.
                </p>
                <div className="bg-brand-bg/40 p-4 rounded-2xl border border-brand-border space-y-2">
                  <p className="text-xs font-bold text-brand-primary uppercase tracking-wider">Como fica o prontuário estruturado:</p>
                  <div className="text-xs text-brand-text space-y-1 bg-white p-3 rounded-xl border border-brand-border/60">
                    <p><strong>• Perfil Sensório-Motor:</strong> Manteve bom tônus postural durante atividades suspensas. Apresentou defensividade tátil leve ao manusear argila, necessitando de facilitação gradual.</p>
                    <p><strong>• Prática Ocupacional:</strong> Treino de abotoamento e uso de utensílios de alimentação com feedbacks táteis.</p>
                    <p><strong>• Planejamento Clínico:</strong> Dar continuidade à dessensibilização tátil e fortalecimento escapular no balanço.</p>
                  </div>
                </div>
              </div>
            )}
            {activeSpecialty === 'medicina' && (
              <div className="space-y-6 animate-fadeIn">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                    <Stethoscope size={20} />
                  </div>
                  <h3 className="text-xl font-bold font-display text-brand-primary">Anamneses e Condutas Médicas</h3>
                </div>
                <p className="text-brand-text-muted text-sm leading-relaxed">
                  Ideal para médicos especialistas e psiquiatras otimizarem a escrita clínica. A IA converte o resumo ditado em uma evolução estruturada contendo: queixa principal (QP), história da doença atual (HDA), exame do estado mental (em psiquiatria), hipótese diagnóstica (conforme CID) e a conduta/prescrição terapêutica adotada.
                </p>
                <div className="bg-brand-bg/40 p-4 rounded-2xl border border-brand-border space-y-2">
                  <p className="text-xs font-bold text-brand-primary uppercase tracking-wider">Como fica o prontuário estruturado:</p>
                  <div className="text-xs text-brand-text space-y-1 bg-white p-3 rounded-xl border border-brand-border/60">
                    <p><strong>• Quadro Clínico & Exame Mental:</strong> Paciente vigil, orientado no tempo e espaço, pensamento de curso regular e conteúdo sem delírios. Afeto modulado com leve embotamento sob estresse.</p>
                    <p><strong>• Hipótese Diagnóstica:</strong> Transtorno misto ansioso e depressivo (CID-10: F41.2 / CID-11: 6B44).</p>
                    <p><strong>• Conduta e Farmacologia:</strong> Mantida medicação atual. Ajustada posologia noturna para controle da insônia secundária. Solicitado retorno em 30 dias.</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA (TIMELINE) */}
      <section id="como-funciona" className="py-20 bg-brand-bg relative">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold">O caminho mais curto entre a consulta e o prontuário</h2>
            <p className="text-brand-text-muted max-w-2xl mx-auto text-base">
              Apenas 3 etapas separam você de uma rotina clínica livre de papelada e digitação repetitiva.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-12 relative">
            {/* Line connector in desktop */}
            <div className="hidden md:block absolute top-12 left-[15%] right-[15%] h-0.5 bg-gradient-to-r from-brand-primary/20 to-brand-accent/20 z-0" />

            {/* Step 1 */}
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-brand-primary border-4 border-white shadow-lg flex items-center justify-center text-white text-xl font-bold font-display">
                1
              </div>
              <h3 className="text-lg font-bold text-brand-primary font-display pt-2">Grave o Áudio</h3>
              <p className="text-brand-text-muted text-sm max-w-xs leading-relaxed">
                Ao término do atendimento, grave um áudio-resumo detalhando os pontos importantes observados na sessão.
              </p>
            </div>

            {/* Step 2 */}
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-brand-accent border-4 border-white shadow-lg flex items-center justify-center text-white text-xl font-bold font-display">
                2
              </div>
              <h3 className="text-lg font-bold text-brand-primary font-display pt-2">A IA Organiza Tudo</h3>
              <p className="text-brand-text-muted text-sm max-w-xs leading-relaxed">
                Nossa IA processa o som, elimina vícios de fala, transcreve com rigor técnico e gera a evolução estruturada em segundos.
              </p>
            </div>

            {/* Step 3 */}
            <div className="relative z-10 flex flex-col items-center text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-brand-primary border-4 border-white shadow-lg flex items-center justify-center text-white text-xl font-bold font-display">
                3
              </div>
              <h3 className="text-lg font-bold text-brand-primary font-display pt-2">Pronto no Google Drive</h3>
              <p className="text-brand-text-muted text-sm max-w-xs leading-relaxed">
                O arquivo final é sincronizado instantaneamente no seu Google Docs profissional. Pronto para ser arquivado ou impresso!
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* DEMONSTRACAO INTERATIVA */}
      <section id="demonstracao" className="py-20 bg-white border-t border-brand-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <h2 className="text-3xl font-display font-bold">Veja o fluxo funcionando na prática</h2>
            <p className="text-brand-text-muted text-sm sm:text-base max-w-lg mx-auto">
              Clique no botão abaixo para ver um exemplo guiado do processo, com áudio fictício, transcrição e estruturação automática dos dados pela Inteligência Artificial.
            </p>
          </div>

          <div className="card p-6 md:p-8 bg-brand-bg/30 border-brand-primary/10 shadow-xl space-y-6">
            <div className="flex justify-between items-center flex-wrap gap-2">
              <span className="text-xs font-bold text-brand-primary uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles size={14} className="animate-spin" /> Exemplo Guiado de Inteligência Clínica
              </span>
              {simStep !== 'idle' && (
                <button 
                  onClick={resetSimulation} 
                  className="text-xs font-semibold text-brand-secondary hover:underline cursor-pointer"
                >
                  Reiniciar Exemplo
                </button>
              )}
            </div>

            {/* Screen State Container */}
            <div className="bg-white rounded-2xl border border-brand-border p-5 min-h-[220px] flex flex-col justify-between shadow-inner">
              {simStep === 'idle' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <div className="w-14 h-14 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary">
                    <Mic size={28} />
                  </div>
                  <button 
                    onClick={startSimulation}
                    className="btn-primary px-6 py-3 font-semibold text-sm shadow-md hover:shadow-lg flex items-center gap-2 cursor-pointer"
                  >
                    <Play size={14} fill="currentColor" /> Ver Exemplo do Fluxo
                  </button>
                  <p className="text-xs text-brand-text-muted text-center max-w-xs">
                    Abre um exemplo guiado com áudio fictício para mostrar como a plataforma organiza a transcrição e a evolução.
                  </p>
                </div>
              )}

              {simStep === 'recording' && (
                <div className="flex flex-col items-center justify-center py-10 space-y-4">
                  <div className="relative">
                    <div className="w-14 h-14 rounded-full bg-red-500/20 animate-ping absolute inset-0" />
                    <div className="w-14 h-14 rounded-full bg-red-500 flex items-center justify-center text-white relative z-10">
                      <Mic size={24} />
                    </div>
                  </div>
                  <p className="text-sm font-bold text-red-500 animate-pulse uppercase tracking-widest text-center">
                    Exemplo de áudio em andamento...
                  </p>
                  <p className="text-xs text-brand-text-muted text-center max-w-xs italic">
                    "Paciente relata crises de ansiedade recorrentes na última semana..."
                  </p>
                </div>
              )}

              {simStep === 'transcribing' && (
                <div className="space-y-4">
                  <div className="flex items-center space-x-2 border-b border-brand-border pb-2">
                    <div className="w-2.5 h-2.5 rounded-full bg-brand-accent animate-pulse" />
                    <p className="text-xs font-bold text-brand-primary">Transcrevendo áudio...</p>
                  </div>
                  <p className="text-xs sm:text-sm text-brand-text leading-relaxed font-mono whitespace-pre-wrap">
                    {typedText}
                  </p>
                </div>
              )}

              {simStep === 'completed' && (
                <div className="space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between border-b border-brand-border pb-2 flex-wrap gap-2">
                    <span className="text-xs font-bold text-brand-primary bg-brand-primary/10 py-1 px-2.5 rounded flex items-center gap-1">
                      ✓ Transcrição Concluída
                    </span>
                    <span className="text-xs font-bold text-brand-accent bg-brand-accent/10 py-1 px-2.5 rounded flex items-center gap-1">
                      ★ Estruturado por IA
                    </span>
                  </div>

                  <div className="space-y-3 bg-brand-bg/40 p-4 rounded-xl border border-brand-border">
                    <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider border-b border-brand-primary/10 pb-1">
                      PRONTUÁRIO GERADO (GOOGLE DOCS):
                    </h4>
                    <div className="space-y-2 text-xs leading-relaxed text-brand-text">
                      <p><strong className="text-brand-primary font-bold">Queixa Principal:</strong> Crises recorrentes de ansiedade e cefaleia tensional causadas por pressões corporativas.</p>
                      <p><strong className="text-brand-primary font-bold">Estado Geral:</strong> Apresenta humor deprimido, afeto visivelmente ansioso e insônia inicial (2 horas).</p>
                      <p><strong className="text-brand-primary font-bold">Evolução & Conduta:</strong> Paciente demonstrou engajamento nas técnicas recomendadas anteriormente. Prescrito reforço nos exercícios respiratórios.</p>
                    </div>
                  </div>

                  <div className="flex items-center justify-center gap-2 text-xs font-bold text-brand-primary/80 bg-brand-accent/10 py-2.5 px-3 rounded-lg border border-brand-accent/25">
                    <ShieldCheck size={16} />
                    <span>Exemplo concluído: veja como o prontuário seria salvo no Google Drive.</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* CALCULADORA DE ROI (ECONOMIA DE TEMPO) */}
      <section className="py-20 bg-white border-t border-brand-border relative overflow-hidden">
        <div className="absolute top-1/2 left-0 w-72 h-72 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-12">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-accent/15 rounded-full text-brand-primary text-xs font-bold uppercase tracking-wider">
              <TrendingUp size={14} /> Simule Seus Ganhos
            </div>
            <h2 className="text-3xl font-display font-bold">Quanto tempo você vai economizar?</h2>
            <p className="text-brand-text-muted text-sm sm:text-base max-w-lg mx-auto">
              Ajuste os valores abaixo com base na sua rotina de atendimentos e descubra quantas horas você recupera ao usar o Evolução Clínica.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center bg-brand-bg/30 p-6 md:p-8 rounded-3xl border border-brand-border shadow-xl">
            {/* Controles Sliders */}
            <div className="space-y-6">
              <div className="space-y-2">
                <div className="flex justify-between text-sm font-bold text-brand-text">
                  <span>Pacientes atendidos por semana:</span>
                  <span className="text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">{pacientesPorSemana} pacientes</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="60" 
                  step="1"
                  value={pacientesPorSemana}
                  onChange={(e) => setPacientesPorSemana(Number(e.target.value))}
                  className="w-full h-2 bg-brand-border rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
                <div className="flex justify-between text-[10px] text-brand-text-muted">
                  <span>5 pacientes</span>
                  <span>60 pacientes</span>
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm font-bold text-brand-text">
                  <span>Tempo gasto por evolução (Manual):</span>
                  <span className="text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded">{tempoPorEvolucao} minutos</span>
                </div>
                <input 
                  type="range" 
                  min="5" 
                  max="45" 
                  step="5"
                  value={tempoPorEvolucao}
                  onChange={(e) => setTempoPorEvolucao(Number(e.target.value))}
                  className="w-full h-2 bg-brand-border rounded-lg appearance-none cursor-pointer accent-brand-primary"
                />
                <div className="flex justify-between text-[10px] text-brand-text-muted">
                  <span>5 min</span>
                  <span>45 min</span>
                </div>
              </div>
            </div>

            {/* Resultados */}
            <div className="bg-white rounded-2xl border border-brand-border p-6 shadow-md space-y-6">
              <h4 className="text-xs font-bold text-brand-primary uppercase tracking-wider border-b border-brand-primary/10 pb-2 flex items-center gap-1.5">
                <Clock size={14} /> ESTIMATIVA DE ECONOMIA MENSAL
              </h4>

              <div className="grid grid-cols-1 gap-4">
                <div className="bg-brand-bg/50 p-4 rounded-xl border border-brand-border/60">
                  <p className="text-xs text-brand-text-muted font-semibold uppercase">Tempo Poupado por Mês</p>
                  <p className="text-3xl font-extrabold text-brand-primary font-display mt-1">
                    {Math.max(0, Math.round(((pacientesPorSemana * tempoPorEvolucao * 4) / 60) - ((pacientesPorSemana * 3 * 4) / 60)))} horas
                  </p>
                  <p className="text-[10px] text-brand-text-muted mt-1 leading-relaxed">
                    Estimando apenas 3 minutos por evolução com gravação de áudio e inteligência artificial.
                  </p>
                </div>

                <div className="bg-brand-primary/[0.03] p-4 rounded-xl border border-brand-primary/10">
                  <p className="text-xs text-brand-text-muted font-semibold uppercase">O que você ganha com isso</p>
                  <p className="text-base font-bold text-brand-primary mt-1">
                    + {Math.round((Math.max(0, ((pacientesPorSemana * tempoPorEvolucao * 4) / 60) - ((pacientesPorSemana * 3 * 4) / 60))) * 1.2)} consultas extras mensais
                  </p>
                  <p className="text-[10px] text-brand-text-muted leading-relaxed">
                    Ou até <strong>{Math.round((Math.max(0, ((pacientesPorSemana * tempoPorEvolucao * 4) / 60) - ((pacientesPorSemana * 3 * 4) / 60))) * 48 / 8)} dias inteiros</strong> de descanso recuperados por ano!
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SEÇÃO COMPARATIVA (ANTES VS DEPOIS) */}
      <section className="py-20 bg-brand-bg border-t border-brand-border">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl font-display font-bold text-center">Compare e sinta a diferença no seu dia a dia</h2>
            <p className="text-brand-text-muted max-w-xl mx-auto text-sm sm:text-base">
              A diferença entre ter um consultório livre de papelada ou continuar gastando suas horas vagas digitando prontuários.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* Antes */}
            <div className="bg-white rounded-3xl border border-red-100 p-8 shadow-sm space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-red-400" />
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-red-100 text-red-500 flex items-center justify-center font-bold text-sm">✕</span>
                <h3 className="text-xl font-bold font-display text-red-900">Rotina Tradicional</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex gap-3 text-sm text-brand-text-muted leading-relaxed">
                  <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Digitação exaustiva</strong> após cada atendimento ou no final do dia.</span>
                </li>
                <li className="flex gap-3 text-sm text-brand-text-muted leading-relaxed">
                  <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Prontuários atrasados</strong> que se acumulam e invadem seus fins de semana.</span>
                </li>
                <li className="flex gap-3 text-sm text-brand-text-muted leading-relaxed">
                  <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Perda de detalhes importantes</strong> e observações ricas pelo cansaço do dia a dia.</span>
                </li>
                <li className="flex gap-3 text-sm text-brand-text-muted leading-relaxed">
                  <AlertCircle size={18} className="text-red-400 flex-shrink-0 mt-0.5" />
                  <span><strong>Dados presos</strong> em sistemas engessados com taxas ocultas de exportação.</span>
                </li>
              </ul>
            </div>

            {/* Depois */}
            <div className="bg-white rounded-3xl border border-brand-primary/20 p-8 shadow-md space-y-6 relative overflow-hidden">
              <div className="absolute top-0 left-0 w-full h-1.5 bg-brand-primary" />
              <div className="flex items-center gap-3">
                <span className="w-8 h-8 rounded-full bg-brand-primary/10 text-brand-primary flex items-center justify-center font-bold text-sm">✓</span>
                <h3 className="text-xl font-bold font-display text-brand-primary">Com o Evolução Clínica</h3>
              </div>
              <ul className="space-y-4">
                <li className="flex gap-3 text-sm text-brand-text leading-relaxed">
                  <Check size={18} className="text-brand-primary flex-shrink-0 mt-0.5" />
                  <span><strong>Grave em áudio</strong> por 2 minutos e deixe nossa IA transcrever e organizar a evolução.</span>
                </li>
                <li className="flex gap-3 text-sm text-brand-text leading-relaxed">
                  <Check size={18} className="text-brand-primary flex-shrink-0 mt-0.5" />
                  <span><strong>Zero pendências</strong>. Evolução pronta e assinada em segundos após a consulta.</span>
                </li>
                <li className="flex gap-3 text-sm text-brand-text leading-relaxed">
                  <Check size={18} className="text-brand-primary flex-shrink-0 mt-0.5" />
                  <span><strong>Máxima riqueza técnica</strong> contendo todos os detalhes falados no resumo da sessão.</span>
                </li>
                <li className="flex gap-3 text-sm text-brand-text leading-relaxed">
                  <Check size={18} className="text-brand-primary flex-shrink-0 mt-0.5" />
                  <span><strong>Soberania absoluta</strong>. Todos os documentos salvos na sua própria conta do Google Docs.</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* PLANOS E PRECOS */}
      <section id="planos" className="py-20 bg-brand-bg border-t border-brand-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl sm:text-4xl font-display font-bold">Planos simples e transparentes</h2>
            <p className="text-brand-text-muted max-w-2xl mx-auto text-base">
              Acesso total e ilimitado para transformar sua rotina de prontuários médicos. Sem taxa de ativação ou fidelidade.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
            {(plans.length > 0 ? plans : DEFAULT_PLANS).map((plan) => {
              const isYearly = plan.id === 'yearly';
              const formattedPrice = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(plan.price);
              const periodLabel = plan.id === 'yearly' ? '/ano' : '/mês';
              
              return (
                <div key={plan.id} className="flex flex-col items-center gap-3.5 w-full h-full">
                  <div 
                    className={`card bg-white p-8 relative flex flex-col justify-between transition-all duration-300 overflow-visible w-full flex-1 ${
                      isYearly 
                        ? 'border-brand-primary shadow-lg shadow-brand-primary/5 hover:shadow-xl' 
                        : 'border-brand-border hover:border-brand-primary/20 hover:shadow-xl'
                    }`}
                  >
                    {isYearly && plan.discount_text && (
                      <div className="absolute -top-3.5 left-1/2 transform -translate-x-1/2 px-4 py-1 bg-brand-primary text-white text-[10px] font-bold tracking-widest uppercase rounded-full shadow">
                        {plan.discount_text}
                      </div>
                    )}

                    <div>
                      <div className={`flex justify-between items-center mb-4 ${isYearly ? 'mt-1' : ''}`}>
                        <h3 className="text-2xl font-bold font-display text-brand-primary">{plan.name}</h3>
                        <span className={`px-3 py-1 text-xs font-bold rounded-full ${
                          isYearly 
                            ? 'bg-brand-primary/10 text-brand-primary' 
                            : 'bg-brand-bg text-brand-text-muted border border-brand-border'
                        }`}>
                          {plan.tag_text || (isYearly ? 'Popular' : 'Mês a Mês')}
                        </span>
                      </div>
                      <p className="text-brand-text-muted text-sm mb-6">
                        {plan.description || (isYearly ? 'A alternativa perfeita para consolidar sua economia anual.' : 'Flexibilidade para experimentar sem amarras contratuais.')}
                      </p>
                      
                      <div className={`flex items-baseline ${isYearly && plan.equivalent_monthly_price ? 'mb-1' : 'mb-6'}`}>
                        <span className="text-sm font-bold text-brand-text-muted mr-1">R$</span>
                        <span className="text-4xl font-extrabold font-display text-brand-primary">{formattedPrice}</span>
                        <span className="text-sm text-brand-text-muted ml-1">{periodLabel}</span>
                      </div>
                      
                      {isYearly && plan.equivalent_monthly_price && (
                        <p className="text-xs text-brand-accent-hover font-bold mb-6">
                          Equivalente a R$ {new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2 }).format(plan.equivalent_monthly_price)} por mês pago anualmente
                        </p>
                      )}

                      <ul className="space-y-3 mb-8 text-sm text-brand-text">
                        {plan.features?.map((feature: string, idx: number) => (
                          <li key={idx} className={`flex items-center gap-2 ${isYearly && idx === 0 ? 'font-semibold text-brand-primary' : ''}`}>
                            <Check size={16} className="text-brand-primary flex-shrink-0" />
                            <span>
                              {feature}
                              <FeatureTooltip feature={feature} />
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>

                    <Link 
                      to={`/login?from_plan=${plan.id}`} 
                      className={`w-full py-4 text-center font-bold text-sm transition-all ${
                        isYearly 
                          ? 'btn-primary shadow-md hover:shadow-lg' 
                          : 'btn-outline shadow-sm hover:border-brand-primary/50'
                      }`}
                    >
                      {isYearly ? 'Assinar Plano Anual' : 'Experimentar Plano Mensal'}
                    </Link>
                  </div>
                  
                  {/* Google Pay Promotional Label */}
                  <div className="flex items-center justify-center gap-2 text-xs text-brand-text-muted select-none mt-1">
                    <ShieldCheck size={14} className="text-brand-primary flex-shrink-0" />
                    <span>Pague com segurança usando</span>
                    <GooglePayLogo className="h-4 w-auto" />
                  </div>
                </div>
              );
            })}
          </div>

          {/* CDC Guarantee Mention */}
          <div className="max-w-md mx-auto text-center mt-12 bg-white p-5 rounded-2xl border border-brand-border flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary flex-shrink-0">
              <ShieldCheck size={20} />
            </div>
            <p className="text-left text-xs text-brand-text-muted leading-relaxed">
              <strong className="text-brand-text font-bold">Garantia CDC de 7 Dias:</strong> Queremos que você esteja plenamente satisfeito. Se desistir em até 7 dias da compra, cancelamos e estornamos sua transação na hora.
            </p>
          </div>
        </div>
      </section>

      {/* SEGURANÇA E SOBERANIA DOS DADOS */}
      <section className="py-20 bg-brand-bg border-t border-brand-border relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <div className="inline-flex items-center gap-2 px-3 py-1 bg-brand-primary/10 rounded-full text-brand-primary text-xs font-bold uppercase tracking-wider">
              <Lock size={14} /> Privacidade em Primeiro Lugar
            </div>
            <h2 className="text-3xl font-display font-bold">Segurança e soberania real sobre seus prontuários</h2>
            <p className="text-brand-text-muted text-sm sm:text-base max-w-xl mx-auto">
              Seus dados clínicos não pertencem a nós. Entenda como garantimos sigilo absoluto e conformidade legal total.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Bloco 1 */}
            <div className="bg-white rounded-3xl border border-brand-border p-8 shadow-sm space-y-4 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <Database size={24} />
              </div>
              <h3 className="text-lg font-bold font-display text-brand-primary">Sua Conta, Seu Google Drive</h3>
              <p className="text-brand-text-muted text-xs sm:text-sm leading-relaxed">
                Cada evolução é salva como um documento Google Docs na sua própria conta pessoal ou corporativa do Google Workspace. Se você decidir parar de usar a nossa plataforma, **todos os seus prontuários continuam integralmente salvos com você** de forma organizada.
              </p>
            </div>

            {/* Bloco 2 */}
            <div className="bg-white rounded-3xl border border-brand-border p-8 shadow-sm space-y-4 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <ShieldCheck size={24} />
              </div>
              <h3 className="text-lg font-bold font-display text-brand-primary">Conformidade com a LGPD</h3>
              <p className="text-brand-text-muted text-xs sm:text-sm leading-relaxed">
                Estruturado em total conformidade com a Lei Geral de Proteção de Dados (LGPD). Todos os canais de transmissão são criptografados por segurança e os prontuários contam com a infraestrutura e proteção do ecossistema Google.
              </p>
            </div>

            {/* Bloco 3 */}
            <div className="bg-white rounded-3xl border border-brand-border p-8 shadow-sm space-y-4 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center text-brand-primary mb-4">
                <Lock size={24} />
              </div>
              <h3 className="text-lg font-bold font-display text-brand-primary">Sigilo Médico & Terapêutico</h3>
              <p className="text-brand-text-muted text-xs sm:text-sm leading-relaxed">
                Respeito absoluto às diretrizes éticas dos conselhos profissionais de saúde (CFP, CFFa, CFM, COFFITO). A plataforma foi projetada para garantir a confidencialidade do paciente sob as normas vigentes.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ SECTION */}
      <section id="faq" className="py-20 bg-white border-t border-brand-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center space-y-4 mb-16">
            <h2 className="text-3xl font-display font-bold">Perguntas Frequentes</h2>
            <p className="text-brand-text-muted text-base max-w-lg mx-auto">
              Esclareça suas principais dúvidas sobre o funcionamento, privacidade e contratação do nosso ecossistema clínico.
            </p>
          </div>

          <div className="space-y-4">
            {faqs.map((faq, i) => (
              <div 
                key={i}
                className="border border-brand-border rounded-2xl overflow-hidden transition-all duration-200"
              >
                <button
                  onClick={() => toggleFaq(i)}
                  className="w-full flex justify-between items-center p-5 text-left bg-brand-bg/10 hover:bg-brand-bg/30 text-brand-primary font-bold font-display text-sm sm:text-base cursor-pointer"
                >
                  <span>{faq.q}</span>
                  <ChevronDown 
                    size={18} 
                    className={`transform transition-transform duration-200 ${faqOpen === i ? 'rotate-180' : ''}`} 
                  />
                </button>
                {faqOpen === i && (
                  <div className="p-5 border-t border-brand-border bg-white text-xs sm:text-sm text-brand-text-muted leading-relaxed animate-slideDown">
                    {faq.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA INTERMEDIÁRIO DE CONVERSÃO */}
      <section className="bg-gradient-to-r from-brand-primary to-brand-primary-hover py-16 text-white text-center relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(140,198,63,0.15),transparent)] pointer-events-none" />
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 relative z-10 space-y-6">
          <h2 className="text-3xl sm:text-4xl font-display font-bold text-white">Pronto para digitalizar seu consultório?</h2>
          <p className="text-white/80 max-w-xl mx-auto text-sm sm:text-base">
            Junte-se a dezenas de profissionais que economizam de 5 a 10 horas semanais simplificando registros burocráticos.
          </p>
          <div className="flex justify-center pt-2">
            <Link to="/login" className="inline-flex items-center gap-2 px-8 py-4 bg-[#076c9a] hover:bg-[#055b82] text-white font-extrabold text-base tracking-wide rounded-xl shadow-xl transition-all duration-200 active:scale-95">
              Começar meu teste gratuito de 7 dias <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-brand-bg border-t border-brand-border py-12 text-center text-xs text-brand-text-muted">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6">
          {(siteConfig.logo_light_url || siteConfig.logo_dark_url) && (
            <div className="flex justify-center">
              <img 
                src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
                alt={siteConfig.pwa_app_name || "Evolução Clínica"} 
                className="h-16 w-auto object-contain opacity-80"
              />
            </div>
          )}
          <p>© {new Date().getFullYear()} Evolução Clínica. Todos os direitos reservados.</p>
          <p>CNPJ: 10.682.236/0001-09</p>
          <p>
            Contato oficial:{' '}
            <a href={`mailto:${LEGAL_SUPPORT_EMAIL}`} className="hover:text-brand-primary transition-colors">
              {LEGAL_SUPPORT_EMAIL}
            </a>
          </p>
          
          <div className="flex justify-center gap-6 text-xs font-semibold">
            <Link to="/privacy" className="hover:text-brand-primary transition-colors">Política de Privacidade</Link>
            <span className="text-brand-border">|</span>
            <Link to="/terms" className="hover:text-brand-primary transition-colors">Termos de Serviço</Link>
          </div>
          
          <div className="inline-block px-3 py-1 bg-white rounded-full border border-brand-border shadow-sm">
            <span className="text-[10px]">Build {APP_VERSION}</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
