import React, { useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { trackJourneyEvent } from '../services/analytics';
import { 
  Calendar, Clock, CheckCircle2, ChevronRight, MessageSquare, 
  ExternalLink, ArrowRight, BookOpen, AlertCircle, Award, Loader2 
} from 'lucide-react';

interface Journey {
  id: string;
  title: string;
  slug: string;
  subtitle: string | null;
  description: string | null;
  cover_image_url: string | null;
  total_days: number;
  status: 'draft' | 'active' | 'completed' | 'archived';
  timezone: string;
  whatsapp_main_group_url: string | null;
  whatsapp_support_group_url: string | null;
  show_whatsapp_main_group: boolean;
  show_scheduled_as_coming_soon: boolean;
  trial_url: string | null;
  website_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
}

interface JourneyContent {
  id: string;
  journey_id: string;
  day_number: number;
  title: string;
  slug: string;
  short_description: string | null;
  image_url: string | null;
  content_type: 'text' | 'image' | 'video' | 'mixed';
  publication_status: 'draft' | 'scheduled' | 'published' | 'archived';
  publication_date: string | null;
  publication_time: string | null;
}

export default function PublicJourneyIndex() {
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);

  const [journey, setJourney] = useState<Journey | null>(null);
  const [contents, setContents] = useState<JourneyContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Rastreamento de UTMs
  const [utmQueryString, setUtmQueryString] = useState('');

  useEffect(() => {
    // 1. Capturar e persistir parâmetros UTM
    const params = new URLSearchParams(window.location.search);
    const utmSource = params.get('utm_source');
    const utmMedium = params.get('utm_medium');
    const utmCampaign = params.get('utm_campaign');
    const utmContent = params.get('utm_content');
    const utmTerm = params.get('utm_term');

    const utmParams: Record<string, string> = {};
    if (utmSource) utmParams.utm_source = utmSource;
    if (utmMedium) utmParams.utm_medium = utmMedium;
    if (utmCampaign) utmParams.utm_campaign = utmCampaign;
    if (utmContent) utmParams.utm_content = utmContent;
    if (utmTerm) utmParams.utm_term = utmTerm;

    if (Object.keys(utmParams).length > 0) {
      sessionStorage.setItem('evolucao-clinica:utm', JSON.stringify(utmParams));
      const queryString = new URLSearchParams(utmParams).toString();
      setUtmQueryString(queryString ? `?${queryString}` : '');
    } else {
      const stored = sessionStorage.getItem('evolucao-clinica:utm');
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          const queryString = new URLSearchParams(parsed).toString();
          setUtmQueryString(queryString ? `?${queryString}` : '');
        } catch (e) {
          console.error('Erro ao ler UTMs salvos:', e);
        }
      }
    }
  }, []);

  useEffect(() => {
    if (!journey) return;

    // Atualiza title e meta-tags
    document.title = journey.seo_title || `${journey.title} | Evolução Clínica`;

    const updateMeta = (selector: string, attr: 'name' | 'property', value: string, content: string) => {
      let meta = document.querySelector<HTMLMetaElement>(selector);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, value);
        document.head.appendChild(meta);
      }
      meta.content = content;
    };

    updateMeta("meta[name='description']", 'name', 'description', journey.seo_description || journey.description || '');
    updateMeta("meta[property='og:title']", 'property', 'og:title', journey.seo_title || `${journey.title} | Evolução Clínica`);
    updateMeta("meta[property='og:description']", 'property', 'og:description', journey.seo_description || journey.description || '');
    updateMeta("meta[property='og:type']", 'property', 'og:type', 'website');
    updateMeta("meta[name='twitter:card']", 'name', 'twitter:card', 'summary_large_image');
    updateMeta("meta[name='twitter:title']", 'name', 'twitter:title', journey.seo_title || `${journey.title} | Evolução Clínica`);
    updateMeta("meta[name='twitter:description']", 'name', 'twitter:description', journey.seo_description || journey.description || '');
    
    if (journey.cover_image_url) {
      updateMeta("meta[property='og:image']", 'property', 'og:image', journey.cover_image_url);
      updateMeta("meta[name='twitter:image']", 'name', 'twitter:image', journey.cover_image_url);
    }

    // Canonical link
    let canonical = document.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.origin + window.location.pathname;
  }, [journey]);

  useEffect(() => {
    fetchJourneyData();
  }, []);

  const fetchJourneyData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // 1. Busca a jornada ativa de 15 dias
      const { data: journeyData, error: jError } = await supabase
        .from('journeys')
        .select('*')
        .eq('slug', 'jornada-15-dias')
        .maybeSingle();

      if (jError) throw jError;
      if (!journeyData) {
        setErrorMsg('Nenhuma jornada ativa encontrada no momento. Por favor, volte mais tarde.');
        setLoading(false);
        return;
      }

      setJourney(journeyData);

      // Dispara evento analytics de visualização da jornada
      trackJourneyEvent('journey_view', {
        journey_id: journeyData.id,
        campaign: 'jornada_15_dias',
      });

      // 2. Busca os conteúdos associados
      const { data: contentData, error: cError } = await supabase
        .from('journey_contents')
        .select('id, journey_id, day_number, title, slug, short_description, image_url, content_type, publication_status, publication_date, publication_time')
        .eq('journey_id', journeyData.id)
        .order('day_number', { ascending: true });

      if (cError) throw cError;
      setContents(contentData || []);
    } catch (err: any) {
      console.error('Erro ao carregar dados da jornada pública:', err);
      setErrorMsg('Ocorreu um erro ao carregar os conteúdos da jornada.');
    } finally {
      setLoading(false);
    }
  };

  const isPastPublishTime = (dateStr: string | null, timeStr: string | null) => {
    if (!dateStr) return false;
    const publishDateTime = new Date(`${dateStr}T${timeStr || '08:00:00'}-03:00`);
    return new Date() >= publishDateTime;
  };

  // Filtra e resolve status de cada dia
  const getProcessedDays = () => {
    if (!journey) return [];

    const processedList: {
      dayNumber: number;
      title: string;
      slug?: string;
      description?: string;
      imageUrl?: string;
      status: 'published' | 'current' | 'coming_soon';
      rawContent?: JourneyContent;
    }[] = [];

    // Mapear os conteúdos carregados por número do dia
    const contentsMap = new Map<number, JourneyContent>();
    contents.forEach(c => contentsMap.set(c.day_number, c));

    // Determinar o último dia publicado para marcar o "Conteúdo atual"
    let maxPublishedDay = 0;
    contents.forEach(c => {
      const isPub = c.publication_status === 'published' || 
                    (c.publication_status === 'scheduled' && isPastPublishTime(c.publication_date, c.publication_time));
      if (isPub && c.day_number > maxPublishedDay) {
        maxPublishedDay = c.day_number;
      }
    });

    for (let d = 1; d <= journey.total_days; d++) {
      const contentItem = contentsMap.get(d);

      if (contentItem) {
        const isPublished = contentItem.publication_status === 'published' || 
                            (contentItem.publication_status === 'scheduled' && isPastPublishTime(contentItem.publication_date, contentItem.publication_time));

        if (isPublished) {
          processedList.push({
            dayNumber: d,
            title: contentItem.title,
            slug: contentItem.slug,
            description: contentItem.short_description || 'Clique para conferir os detalhes desse dia.',
            imageUrl: contentItem.image_url || undefined,
            status: d === maxPublishedDay ? 'current' : 'published',
            rawContent: contentItem
          });
        } else if (contentItem.publication_status === 'scheduled' && journey.show_scheduled_as_coming_soon) {
          processedList.push({
            dayNumber: d,
            title: contentItem.title,
            description: 'Este conteúdo estará disponível em breve no grupo de WhatsApp!',
            imageUrl: undefined,
            status: 'coming_soon',
            rawContent: contentItem
          });
        }
        // Draft ou Archived são completamente ignorados
      } else {
        // Se não houver registro para o dia mas desejarmos mostrar como vago
        if (journey.show_scheduled_as_coming_soon) {
          processedList.push({
            dayNumber: d,
            title: `Dia ${String(d).padStart(2, '0')}`,
            description: 'Próxima etapa da nossa jornada de conteúdos.',
            status: 'coming_soon'
          });
        }
      }
    }

    return processedList;
  };

  const days = getProcessedDays();
  const publishedDays = days.filter(d => d.status === 'published' || d.status === 'current');
  const progressPercent = journey ? Math.round((publishedDays.length / journey.total_days) * 100) : 0;
  const firstDay = days.find(d => d.status === 'published' || d.status === 'current');

  // Rastreamento cliques CTA
  const handleStartJourneyClick = () => {
    trackJourneyEvent('journey_start', {
      journey_id: journey?.id,
      campaign: 'jornada_15_dias',
    });
  };

  const handleTrialClick = () => {
    trackJourneyEvent('journey_trial_click', {
      journey_id: journey?.id,
      campaign: 'jornada_15_dias',
    });
  };

  const handleSupportGroupClick = () => {
    trackJourneyEvent('journey_support_group_click', {
      journey_id: journey?.id,
      campaign: 'jornada_15_dias',
    });
  };

  // Se a url do trial tiver UTMs, concatena
  const getTrialUrl = () => {
    const baseUrl = journey?.trial_url || 'https://evolucaoclinica.app.br/login';
    if (!utmQueryString) return baseUrl;
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}${utmQueryString.slice(1)}`;
  };

  // Se a url do grupo tiver UTMs, concatena
  const getSupportGroupUrl = () => {
    const baseUrl = journey?.whatsapp_support_group_url || '#';
    if (!utmQueryString) return baseUrl;
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}${utmQueryString.slice(1)}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#105576] mb-2" />
        <p className="text-sm font-semibold text-gray-600">Preparando a jornada...</p>
      </div>
    );
  }

  if (errorMsg || !journey) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 text-[#719EB9] mb-3" />
        <h3 className="text-lg font-bold text-gray-800">Ops! Algo deu errado</h3>
        <p className="text-xs text-gray-500 mt-1.5">{errorMsg || 'Jornada indisponível.'}</p>
        <a 
          href="/" 
          className="mt-6 px-5 py-2.5 bg-[#105576] text-white rounded-xl text-xs font-semibold shadow-sm hover:bg-[#376F8D] transition-colors"
        >
          Voltar para Home
        </a>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col antialiased">
      {/* Cabeçalho da Página */}
      <header className="bg-white border-b border-gray-150 py-5 px-6 sticky top-0 z-40 shadow-xs">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <a href="/" className="flex items-center gap-2.5">
            {siteConfig.logo_light_url ? (
              <img
                src={appendBrandAssetVersion(siteConfig.logo_light_url, assetSignature)}
                alt="Logo Oficial"
                className="h-10 w-auto object-contain"
              />
            ) : (
              <span className="text-base font-bold text-[#105576] tracking-tight">Evolução Clínica</span>
            )}
          </a>
          <div className="flex items-center gap-3">
            <a
              href={getTrialUrl()}
              onClick={handleTrialClick}
              className="px-4 py-2 bg-[#105576] hover:bg-[#376F8D] text-white text-xs font-bold rounded-xl transition-colors shadow-xs cursor-pointer"
            >
              Iniciar Teste Gratuito
            </a>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="bg-white py-12 px-6 border-b border-gray-150 text-center">
        <div className="max-w-3xl mx-auto space-y-6">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#719EB9]/10 text-[#105576] rounded-full text-[10px] font-bold uppercase tracking-wider">
            <Award size={12} />
            Campanha Especial de Lançamento
          </div>
          
          <h1 className="text-3xl sm:text-4xl font-extrabold text-[#105576] leading-tight tracking-tight">
            {journey.title}
          </h1>
          <p className="text-sm text-gray-600 max-w-xl mx-auto font-medium">
            {journey.description || 'Conheça, em 15 dias, uma forma mais prática de transformar sua fala em registros clínicos organizados.'}
          </p>

          {/* Aviso Responsabilidade IA */}
          <div className="bg-[#719EB9]/5 border border-[#719EB9]/15 rounded-2xl p-4 max-w-xl mx-auto">
            <p className="text-[11px] text-[#376F8D] leading-relaxed font-semibold">
              💡 <strong>Atenção profissional:</strong> A inteligência artificial apoia a organização e a redação. A revisão final e a responsabilidade clínica continuam sendo do profissional responsável.
            </p>
          </div>

          {/* Progresso Geral */}
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 max-w-lg mx-auto space-y-2">
            <div className="flex justify-between items-center text-xs text-gray-500 font-semibold">
              <span>Mensagens Publicadas</span>
              <span className="text-[#105576] font-bold">{publishedDays.length} de {journey.total_days} dias</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
              <div 
                className="bg-[#158E12] h-2.5 rounded-full transition-all duration-500" 
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>

          {/* CTAs Iniciais */}
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-2">
            {firstDay && (
              <a
                href={`/jornada/${firstDay.slug}${utmQueryString}`}
                onClick={handleStartJourneyClick}
                className="w-full sm:w-auto px-6 py-3 bg-[#105576] hover:bg-[#376F8D] text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Começar pelo Dia 1
                <ArrowRight size={14} />
              </a>
            )}
            <a
              href={getTrialUrl()}
              onClick={handleTrialClick}
              className="w-full sm:w-auto px-6 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Testar Plataforma Grátis
            </a>
          </div>
        </div>
      </section>

      {/* Seção "Comece por aqui" */}
      <section className="max-w-4xl mx-auto px-6 py-8 w-full">
        <div className="bg-gradient-to-r from-[#105576] to-[#376F8D] text-white rounded-3xl p-6 sm:p-8 shadow-md space-y-4">
          <h2 className="text-xl sm:text-2xl font-bold flex items-center gap-2">
            <BookOpen size={24} className="text-[#719EB9]" />
            Comece por aqui
          </h2>
          <p className="text-xs sm:text-sm text-gray-100 leading-relaxed font-medium">
            Entrou agora na Jornada Evolução Clínica? Você pode começar pelo primeiro conteúdo e acompanhar todas as publicações anteriores no seu próprio ritmo. Todos os dias anteriores ficam arquivados permanentemente nesta central.
          </p>
          {firstDay && (
            <a
              href={`/jornada/${firstDay.slug}${utmQueryString}`}
              onClick={handleStartJourneyClick}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-white text-[#105576] font-bold text-xs rounded-xl shadow-sm hover:bg-gray-50 transition-all cursor-pointer"
            >
              Acessar Conteúdo do Dia 1
              <ChevronRight size={14} />
            </a>
          )}
        </div>
      </section>

      {/* Linha do Tempo dos Dias (Índice) */}
      <section className="max-w-4xl mx-auto px-6 py-6 w-full flex-1 space-y-6">
        <h3 className="text-lg font-bold text-[#105576] border-b border-gray-150 pb-2">
          Índice das Mensagens e Aulas
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {days.map((d) => {
            const isComingSoon = d.status === 'coming_soon';
            const isCurrent = d.status === 'current';
            const slugPath = d.slug ? `/jornada/${d.slug}${utmQueryString}` : '#';

            return (
              <div 
                key={d.dayNumber}
                className={`flex flex-col bg-white border rounded-2xl shadow-xs overflow-hidden transition-all duration-200 ${
                  isComingSoon 
                    ? 'border-gray-150 opacity-70' 
                    : isCurrent 
                      ? 'border-[#105576] ring-2 ring-[#105576]/10 scale-102' 
                      : 'border-gray-150 hover:border-gray-300 hover:shadow-sm'
                }`}
              >
                {/* Imagem / Card Cover */}
                <div className="aspect-video w-full bg-gray-100 relative overflow-hidden flex items-center justify-center shrink-0">
                  {d.imageUrl && !isComingSoon ? (
                    <img 
                      src={d.imageUrl} 
                      alt={d.title} 
                      className="w-full h-full object-cover" 
                      loading="lazy"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center p-4 text-center">
                      <span className="text-xs font-bold text-[#105576] uppercase">Dia</span>
                      <span className="text-3xl font-extrabold text-[#105576]">{String(d.dayNumber).padStart(2, '0')}</span>
                    </div>
                  )}
                  {/* Badge de status */}
                  <div className="absolute top-3 right-3">
                    <span className={`px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                      isComingSoon 
                        ? 'bg-gray-100 text-gray-500' 
                        : isCurrent 
                          ? 'bg-[#105576] text-white' 
                          : 'bg-green-50 text-green-700'
                    }`}>
                      {isComingSoon ? 'Em breve' : isCurrent ? 'Recente' : 'Publicado'}
                    </span>
                  </div>
                </div>

                {/* Conteúdo do Card */}
                <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-[#376F8D]">Dia {d.dayNumber} de {journey.total_days}</span>
                    <h4 className="text-sm font-bold text-gray-800 line-clamp-1 leading-tight">{d.title}</h4>
                    <p className="text-[11px] text-gray-500 line-clamp-2 leading-relaxed">
                      {d.description}
                    </p>
                  </div>

                  <div>
                    {isComingSoon ? (
                      <button
                        disabled
                        className="w-full py-2.5 bg-gray-100 text-gray-400 font-bold text-xs rounded-xl text-center cursor-not-allowed"
                      >
                        Ainda Indisponível
                      </button>
                    ) : (
                      <a
                        href={slugPath}
                        className={`w-full py-2.5 text-center font-bold text-xs rounded-xl block transition-all ${
                          isCurrent 
                            ? 'bg-[#105576] hover:bg-[#376F8D] text-white shadow-xs' 
                            : 'bg-gray-50 border border-gray-200 hover:bg-gray-100 text-gray-700'
                        }`}
                      >
                        Acessar Conteúdo
                      </a>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Suporte & Grupo de Dúvidas */}
      <section className="bg-white border-t border-gray-150 py-10 px-6 mt-10">
        <div className="max-w-3xl mx-auto text-center space-y-5">
          <MessageSquare className="w-10 h-10 text-[#719EB9] mx-auto" />
          <h3 className="text-lg font-bold text-[#105576]">Está com dúvidas ou precisa de ajuda?</h3>
          <p className="text-xs text-gray-600 max-w-lg mx-auto leading-relaxed">
            Está com dúvidas sobre o funcionamento do aplicativo, gravação de áudios clínicos, segurança de dados ou sobre como funciona o período de teste de 7 dias? Participe do nosso grupo especial para suporte e esclarecimentos.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-2">
            <a
              href={getSupportGroupUrl()}
              onClick={handleSupportGroupClick}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-6 py-3 bg-[#158E12] hover:bg-[#69AF44] text-white text-xs font-bold rounded-xl shadow-sm transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Entrar no grupo de dúvidas
              <ExternalLink size={14} />
            </a>
            {journey.show_whatsapp_main_group && journey.whatsapp_main_group_url && (
              <a
                href={journey.whatsapp_main_group_url}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-6 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Entrar no grupo oficial da jornada
              </a>
            )}
          </div>
        </div>
      </section>

      {/* Rodapé da Página */}
      <footer className="bg-gray-50 border-t border-gray-150 py-8 px-6 text-center text-xs text-gray-500">
        <div className="max-w-4xl mx-auto space-y-2">
          <p className="font-semibold text-gray-600">Evolução Clínica &copy; {new Date().getFullYear()}</p>
          <p className="max-w-md mx-auto text-[11px] leading-relaxed text-gray-400">
            A responsabilidade técnica, diagnóstico e conduta clínica permanecem exclusivamente do terapeuta ou profissional assistente. O uso de IA serve unicamente como apoio administrativo para estruturação e transcrição documental.
          </p>
        </div>
      </footer>
    </div>
  );
}
