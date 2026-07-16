import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { trackJourneyEvent } from '../services/analytics';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { 
  Clock, CheckCircle2, ChevronRight, MessageSquare,
  ExternalLink, ArrowUp, BookOpen, AlertCircle, Award, Loader2,
  Lock, PlayCircle, Eye, HelpCircle, ArrowRight
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
  content: string | null;
  image_url: string | null;
  image_alt: string | null;
  video_url: string | null;
  video_embed_url: string | null;
  content_type: 'text' | 'image' | 'video' | 'mixed';
  cta_text: string | null;
  cta_url: string | null;
  secondary_cta_text: string | null;
  secondary_cta_url: string | null;
  whatsapp_message: string | null;
  publication_status: 'draft' | 'scheduled' | 'published' | 'archived';
  publication_date: string | null;
  publication_time: string | null;
}

export default function PublicJourneyIndex() {
  const { journeySlug, contentSlug, slug } = useParams<{ journeySlug?: string; contentSlug?: string; slug?: string }>();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);

  const [journey, setJourney] = useState<Journey | null>(null);
  const [contents, setContents] = useState<JourneyContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Rastreamento de UTMs
  const [utmQueryString, setUtmQueryString] = useState('');
  const [showScrollTopBtn, setShowScrollTopBtn] = useState(false);

  // Capturar e reter parâmetros UTM em sessionStorage
  useEffect(() => {
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

  // Monitorar rolagem para exibir o botão Voltar ao Topo
  useEffect(() => {
    const handleScroll = () => {
      if (window.scrollY > 400) {
        setShowScrollTopBtn(true);
      } else {
        setShowScrollTopBtn(false);
      }
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Carregar dados
  useEffect(() => {
    fetchJourneyData();
  }, []);

  const fetchJourneyData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      let targetJourneySlug = 'jornada-15-dias';
      let resolvedContentSlug = contentSlug;

      if (journeySlug) {
        targetJourneySlug = journeySlug;
      } else if (slug && slug !== 'jornada-15-dias') {
        // Verifica se existe alguma jornada com este slug
        const { data: checkJourney } = await supabase
          .from('journeys')
          .select('id')
          .eq('slug', slug)
          .maybeSingle();

        if (checkJourney) {
          targetJourneySlug = slug;
        } else {
          // Se não for uma jornada, assume que é o slug de um conteúdo da jornada padrão
          targetJourneySlug = 'jornada-15-dias';
          resolvedContentSlug = slug;
        }
      }

      // Busca a jornada pelo slug resolvido
      let { data: journeyData, error: jError } = await supabase
        .from('journeys')
        .select('*')
        .eq('slug', targetJourneySlug)
        .maybeSingle();

      if (jError) throw jError;

      // Se journeySlug foi informado mas a jornada não foi encontrada,
      // verifica se na verdade é o slug de um conteúdo da jornada padrão (compatibilidade legado)
      if (!journeyData && journeySlug) {
        const { data: defaultJourney } = await supabase
          .from('journeys')
          .select('*')
          .eq('slug', 'jornada-15-dias')
          .maybeSingle();

        if (defaultJourney) {
          const { data: checkContent } = await supabase
            .from('journey_contents')
            .select('slug')
            .eq('journey_id', defaultJourney.id)
            .eq('slug', journeySlug)
            .maybeSingle();

          if (checkContent) {
            journeyData = defaultJourney;
            resolvedContentSlug = journeySlug;
          }
        }
      }

      if (!journeyData) {
        setErrorMsg('Jornada não encontrada ou indisponível.');
        setLoading(false);
        return;
      }

      setJourney(journeyData);

      // Dispara evento analytics de visualização da central
      trackJourneyEvent('journey_view', {
        journey_id: journeyData.id,
        campaign: journeyData.slug,
      });

      // Busca todos os conteúdos da jornada selecionada
      const { data: contentData, error: cError } = await supabase
        .from('journey_contents')
        .select('*')
        .eq('journey_id', journeyData.id)
        .order('day_number', { ascending: true });

      if (cError) throw cError;
      setContents(contentData || []);
    } catch (err: any) {
      console.error('Erro ao carregar dados da jornada:', err);
      setErrorMsg('Ocorreu um erro ao carregar a Central da Jornada.');
    } finally {
      setLoading(false);
    }
  };

  const isPastPublishTime = (dateStr: string | null, timeStr: string | null) => {
    if (!dateStr) return false;
    const publishDateTime = new Date(`${dateStr}T${timeStr || '08:00:00'}-03:00`);
    return new Date() >= publishDateTime;
  };

  // Processamento e classificação de cada dia (Publicado, Recente, Em breve)
  const getProcessedDays = () => {
    if (!journey) return [];

    const processedList: {
      dayNumber: number;
      title: string;
      slug: string;
      description: string;
      imageUrl?: string;
      videoEmbedUrl?: string;
      contentMarkdown?: string;
      ctaText?: string;
      ctaUrl?: string;
      secondaryCtaText?: string;
      secondaryCtaUrl?: string;
      status: 'published' | 'current' | 'coming_soon';
      publicationDate?: string;
      publicationTime?: string;
      rawContent?: JourneyContent;
    }[] = [];

    const contentsMap = new Map<number, JourneyContent>();
    contents.forEach(c => contentsMap.set(c.day_number, c));

    // Determina o dia publicado mais recente para destacar como "Recente/Atual"
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
            description: contentItem.short_description || '',
            imageUrl: contentItem.image_url || undefined,
            videoEmbedUrl: contentItem.video_embed_url || undefined,
            contentMarkdown: contentItem.content || '',
            ctaText: contentItem.cta_text || undefined,
            ctaUrl: contentItem.cta_url || undefined,
            secondaryCtaText: contentItem.secondary_cta_text || undefined,
            secondaryCtaUrl: contentItem.secondary_cta_url || undefined,
            status: d === maxPublishedDay ? 'current' : 'published',
            rawContent: contentItem
          });
        } else if (contentItem.publication_status === 'scheduled' && journey.show_scheduled_as_coming_soon) {
          processedList.push({
            dayNumber: d,
            title: contentItem.title,
            slug: contentItem.slug,
            description: 'Este conteúdo será liberado de acordo com o cronograma da jornada.',
            status: 'coming_soon',
            publicationDate: contentItem.publication_date || undefined,
            publicationTime: contentItem.publication_time || undefined,
            rawContent: contentItem
          });
        }
      } else {
        // Sem registro cadastrado para este slot de dia
        if (journey.show_scheduled_as_coming_soon) {
          processedList.push({
            dayNumber: d,
            title: `Dia ${String(d).padStart(2, '0')}`,
            slug: `dia-${d}`,
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

  // Rolar suavemente até o elemento pelo ID
  const scrollToElement = (elementId: string) => {
    const el = document.getElementById(elementId);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  // Efeito de rolagem automática se houver slug paramétrico na URL ou hash
  useEffect(() => {
    if (loading || days.length === 0) return;

    // Determina o slug do conteúdo a ser focado
    let activeContentSlug = contentSlug;
    if (!activeContentSlug && slug && slug !== journey?.slug) {
      activeContentSlug = slug;
    } else if (!activeContentSlug && journeySlug && journeySlug !== journey?.slug) {
      activeContentSlug = journeySlug;
    }

    // 1. Tentar rolar pelo slug do conteúdo
    if (activeContentSlug) {
      const match = days.find(d => d.slug === activeContentSlug && d.status !== 'coming_soon');
      if (match) {
        setTimeout(() => {
          scrollToElement(`dia-${match.dayNumber}`);
          // Dispara analytics de abertura direta pelo link
          trackJourneyEvent('journey_direct_link_view', {
            journey_id: journey?.id,
            day_number: match.dayNumber,
            day_slug: match.slug,
          });
        }, 300);
        return;
      }
    }

    // 2. Tentar rolar pelo hash da URL legada
    const hash = window.location.hash;
    if (hash) {
      const targetId = hash.replace('#', '');
      const match = days.find(d => d.slug === targetId && d.status !== 'coming_soon');
      if (match) {
        setTimeout(() => {
          scrollToElement(`dia-${match.dayNumber}`);
        }, 300);
      }
    }
  }, [loading, slug, journeySlug, contentSlug, journey, days]);

  // Atualizar SEO dinâmico
  useEffect(() => {
    if (!journey) return;

    document.title = journey.seo_title || `${journey.title} | Evolução Clínica`;

    const updateMeta = (selector: string, attr: 'name' | 'property', value: string, text: string) => {
      let meta = document.querySelector<HTMLMetaElement>(selector);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, value);
        document.head.appendChild(meta);
      }
      meta.content = text;
    };

    const desc = journey.seo_description || journey.description || '';
    updateMeta("meta[name='description']", 'name', 'description', desc);
    updateMeta("meta[property='og:title']", 'property', 'og:title', journey.seo_title || `${journey.title} | Evolução Clínica`);
    updateMeta("meta[property='og:description']", 'property', 'og:description', desc);
    updateMeta("meta[property='og:type']", 'property', 'og:type', 'website');
    updateMeta("meta[name='twitter:card']", 'name', 'twitter:card', 'summary_large_image');
    updateMeta("meta[name='twitter:title']", 'name', 'twitter:title', journey.seo_title || `${journey.title} | Evolução Clínica`);
    updateMeta("meta[name='twitter:description']", 'name', 'twitter:description', desc);

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
    canonical.href = `${window.location.origin}/jornada/${journey.slug}`;
  }, [journey]);

  // Auxiliares para URLs e UTMs
  const getTrialUrlForDay = (dayNum: number, customCtaUrl?: string) => {
    const baseUrl = customCtaUrl || journey?.trial_url || 'https://evolucaoclinica.app.br/login';
    const params = new URLSearchParams(utmQueryString);
    params.set('utm_content', `dia_${String(dayNum).padStart(2, '0')}`);
    return `${baseUrl.split('?')[0]}?${params.toString()}`;
  };

  const getSupportGroupUrlForDay = (dayNum: number, customCtaUrl?: string) => {
    const baseUrl = customCtaUrl || journey?.whatsapp_support_group_url || '#';
    if (baseUrl === '#') return '#';
    const params = new URLSearchParams(utmQueryString);
    params.set('utm_content', `dia_${String(dayNum).padStart(2, '0')}`);
    return `${baseUrl.split('?')[0]}?${params.toString()}`;
  };

  const getGlobalTrialUrl = () => {
    const baseUrl = journey?.trial_url || 'https://evolucaoclinica.app.br/login';
    if (!utmQueryString) return baseUrl;
    return `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}${utmQueryString.slice(1)}`;
  };

  const renderMarkdown = (text?: string) => {
    if (!text) return '';
    const html = marked.parse(text, { breaks: true }) as string;
    return DOMPurify.sanitize(html);
  };

  const formatPublishDateTime = (dateStr?: string, timeStr?: string) => {
    if (!dateStr) return '';
    const dateParts = dateStr.split('-');
    const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
    return `${formattedDate} às ${timeStr?.slice(0, 5) || '08:00'}`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#105576] mb-2" />
        <p className="text-sm font-semibold text-gray-600">Carregando Central da Jornada...</p>
      </div>
    );
  }

  if (errorMsg || !journey) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <AlertCircle className="w-12 h-12 text-[#719EB9] mb-3" />
        <h3 className="text-lg font-bold text-gray-800">Jornada Indisponível</h3>
        <p className="text-xs text-gray-500 mt-2">{errorMsg || 'A central de conteúdos está sendo preparada.'}</p>
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
      {/* HEADER FIXO */}
      <header className="bg-white border-b border-gray-150 py-4 px-6 sticky top-0 z-40 shadow-xs">
        <div className="max-w-5xl mx-auto flex justify-between items-center">
          <a href="/" className="flex items-center gap-2.5">
            {siteConfig.logo_light_url ? (
              <img
                src={appendBrandAssetVersion(siteConfig.logo_light_url, assetSignature)}
                alt="Logo Oficial"
                className="h-9 w-auto object-contain"
              />
            ) : (
              <span className="text-sm font-bold text-[#105576] tracking-tight">Evolução Clínica</span>
            )}
          </a>
          <a
            href={getGlobalTrialUrl()}
            onClick={() => trackJourneyEvent('journey_header_trial_click')}
            className="px-4 py-2 bg-[#105576] hover:bg-[#376F8D] text-white text-xs font-bold rounded-xl transition-colors shadow-xs"
          >
            Experimentar Grátis
          </a>
        </div>
      </header>

      {/* HERO SECTION */}
      <section className="bg-white py-12 px-6 border-b border-gray-150">
        <div className={`max-w-5xl mx-auto ${journey.cover_image_url ? 'grid grid-cols-1 md:grid-cols-12 gap-8 items-center text-left' : 'text-center'}`}>
          
          {/* Coluna de Texto & Conteúdo */}
          <div className={`${journey.cover_image_url ? 'md:col-span-7 space-y-6 order-2 md:order-1' : 'max-w-4xl mx-auto space-y-6'}`}>
            <div className={`inline-flex items-center gap-1.5 px-3 py-1 bg-[#719EB9]/10 text-[#105576] rounded-full text-[10px] font-bold uppercase tracking-wider ${journey.cover_image_url ? '' : 'mx-auto'}`}>
              <Award size={12} />
              Central da Jornada de Conteúdos
            </div>
            
            <h1 className="text-3xl sm:text-4xl font-extrabold text-[#105576] leading-tight tracking-tight">
              {journey.title}
            </h1>
            <p className="text-sm text-gray-600 leading-relaxed">
              {journey.description || 'Acompanhe as demonstrações diárias, dicas práticas de registros clínicos e guias de uso de IA compartilhados em nosso grupo oficial.'}
            </p>

            {/* Aviso Responsabilidade IA */}
            <div className={`bg-[#719EB9]/5 border border-[#719EB9]/15 rounded-2xl p-4 ${journey.cover_image_url ? 'w-full' : 'max-w-xl mx-auto'}`}>
              <p className="text-[11px] text-[#376F8D] leading-relaxed font-semibold">
                💡 <strong>Nota sobre IA:</strong> O Evolução Clínica atua como apoio à transcrição, padronização e redação de relatórios. Toda e qualquer decisão de diagnóstico, conduta clínica e revisão final permanecem exclusivamente de responsabilidade do profissional de saúde assistente.
              </p>
            </div>

            {/* Barra de Progresso Geral */}
            <div className={`bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-2 ${journey.cover_image_url ? 'w-full' : 'max-w-md mx-auto'}`}>
              <div className="flex justify-between items-center text-xs text-gray-500 font-semibold">
                <span>Conteúdos Liberados</span>
                <span className="text-[#105576] font-bold">{publishedDays.length} de {journey.total_days} dias</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2.5 overflow-hidden">
                <div 
                  className="bg-[#158E12] h-2.5 rounded-full transition-all duration-500" 
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
            </div>

            {/* Botoes de Acao do Topo */}
            <div className={`flex flex-col sm:flex-row gap-3 pt-2 ${journey.cover_image_url ? 'justify-start' : 'justify-center items-center'}`}>
              {firstDay && (
                <button
                  onClick={() => {
                    scrollToElement(`dia-${firstDay.dayNumber}`);
                    trackJourneyEvent('journey_start_click');
                  }}
                  className="w-full sm:w-auto px-6 py-3 bg-[#105576] hover:bg-[#376F8D] text-white text-xs font-bold rounded-xl shadow-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer border-none"
                >
                  Começar pelo Dia 1
                  <ChevronRight size={14} />
                </button>
              )}
              <a
                href={getGlobalTrialUrl()}
                onClick={() => trackJourneyEvent('journey_hero_trial_click')}
                className="w-full sm:w-auto px-6 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer text-center"
              >
                Iniciar Teste Gratuito de 7 Dias
              </a>
            </div>
          </div>

          {/* Coluna da Imagem de Capa */}
          {journey.cover_image_url && (
            <div className="md:col-span-5 w-full flex justify-center animate-fadeIn order-1 md:order-2">
              <div className="w-full max-w-sm md:max-w-none rounded-3xl overflow-hidden shadow-[0_20px_50px_rgba(16,85,118,0.16)] aspect-square relative">
                <img 
                  src={journey.cover_image_url} 
                  alt={journey.title} 
                  className="w-full h-full object-cover hover:scale-[1.02] transition-transform duration-500"
                  loading="eager"
                />
              </div>
            </div>
          )}

        </div>
      </section>

      {/* SEÇÃO "COMECE POR AQUI" */}
      <section className="max-w-5xl mx-auto px-6 py-8 w-full">
        <div className="bg-gradient-to-r from-[#105576] to-[#376F8D] text-white rounded-3xl p-6 sm:p-8 shadow-sm space-y-4">
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <BookOpen size={22} className="text-[#719EB9]" />
            Comece por aqui
          </h2>
          <p className="text-xs sm:text-sm text-gray-100 leading-relaxed max-w-3xl">
            Entrou no meio da Jornada ou quer rever as mensagens anteriores enviadas no WhatsApp? 
            Esta página serve como nosso arquivo oficial permanente. Leia os posts anteriores no seu próprio ritmo a partir do primeiro dia.
          </p>
          {firstDay && (
            <button
              onClick={() => {
                scrollToElement(`dia-${firstDay.dayNumber}`);
                trackJourneyEvent('journey_start_box_click');
              }}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-white text-[#105576] font-bold text-xs rounded-xl shadow-sm hover:bg-gray-50 transition-all cursor-pointer border-none"
            >
              Acessar Conteúdo do Dia 1
              <ChevronRight size={14} />
            </button>
          )}
        </div>
      </section>

      {/* FEED VERTICAL DE POSTAGENS COMPLETAS */}
      <section className="max-w-3xl mx-auto px-6 py-8 w-full flex-1 space-y-12">
        <h3 className="text-lg font-bold text-[#105576] border-b border-gray-150 pb-2">
          Publicações da Jornada
        </h3>

        <div className="space-y-12">
          {days.map((d) => {
            const isComingSoon = d.status === 'coming_soon';
            const isCurrent = d.status === 'current';

            if (isComingSoon) {
              return (
                <div 
                  key={d.dayNumber}
                  id={`dia-${d.dayNumber}`}
                  className="bg-gray-50/50 border border-dashed border-gray-200 rounded-3xl p-6 sm:p-8 flex flex-col items-center justify-center text-center space-y-3 opacity-80"
                >
                  <div className="p-3 bg-gray-100 rounded-full text-gray-400">
                    <Lock size={20} />
                  </div>
                  <div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Dia {d.dayNumber} de {journey.total_days}</span>
                    <h4 className="text-sm font-bold text-gray-600 mt-0.5">{d.title}</h4>
                    <p className="text-xs text-gray-400 mt-1 max-w-sm mx-auto">
                      {d.publicationDate 
                        ? `Disponível em ${formatPublishDateTime(d.publicationDate, d.publicationTime)}`
                        : 'Este conteúdo será liberado em breve!'
                      }
                    </p>
                  </div>
                </div>
              );
            }

            return (
              <article
                key={d.dayNumber}
                id={`dia-${d.dayNumber}`}
                className={`bg-white border rounded-3xl overflow-hidden transition-all shadow-xs ${
                  isCurrent 
                    ? 'border-[#105576] ring-3 ring-[#105576]/5' 
                    : 'border-gray-150 hover:border-gray-200'
                }`}
              >
                {/* Cabeçalho do Card */}
                <div className="p-6 sm:p-8 border-b border-gray-100 bg-[#719EB9]/3 flex flex-col sm:flex-row sm:justify-between sm:items-center gap-2">
                  <div className="space-y-0.5">
                    <span className="text-[10px] font-extrabold text-[#376F8D] uppercase tracking-wider">
                      Dia {String(d.dayNumber).padStart(2, '0')} de {journey.total_days}
                    </span>
                    <h2 className="text-lg sm:text-xl font-extrabold text-[#105576] leading-snug">
                      {d.title}
                    </h2>
                  </div>
                  {isCurrent && (
                    <span className="self-start sm:self-center px-3 py-1 bg-[#105576] text-white rounded-full text-[9px] font-bold uppercase tracking-wider animate-pulse">
                      Última Postagem
                    </span>
                  )}
                </div>

                {/* Midia Principal (Video Embed ou Imagem) */}
                {d.videoEmbedUrl ? (
                  <div className="aspect-video w-full border-b border-gray-100 bg-black">
                    <iframe
                      src={d.videoEmbedUrl}
                      title={d.title}
                      className="w-full h-full border-none"
                      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                      allowFullScreen
                    />
                  </div>
                ) : d.imageUrl ? (
                  <div className="aspect-square w-full border-b border-gray-100 bg-gray-50 overflow-hidden relative">
                    <img
                      src={d.imageUrl}
                      alt={d.title}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                ) : null}

                {/* Corpo do Conteudo */}
                <div className="p-6 sm:p-8 space-y-6">
                  {d.description && (
                    <p className="text-xs sm:text-sm font-semibold text-gray-500 leading-relaxed italic border-l-3 border-[#719EB9] pl-3">
                      {d.description}
                    </p>
                  )}

                  {/* Renderizacao Markdown */}
                  <div 
                    className="prose prose-sm max-w-none text-gray-700 leading-relaxed text-xs sm:text-sm space-y-4 prose-headings:text-[#105576] prose-headings:font-bold prose-a:text-[#105576] prose-a:font-semibold prose-strong:text-gray-900 prose-strong:font-bold"
                    dangerouslySetInnerHTML={{ __html: renderMarkdown(d.contentMarkdown) }}
                  />

                  {/* Chamadas de Ação do Dia */}
                  <div className="border-t border-gray-100 pt-6 flex flex-col sm:flex-row gap-3">
                    <a
                      href={getTrialUrlForDay(d.dayNumber, d.ctaUrl)}
                      onClick={() => trackJourneyEvent('journey_day_trial_click', { day: d.dayNumber })}
                      className="flex-1 py-3 px-5 bg-[#105576] hover:bg-[#376F8D] text-white text-center font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                    >
                      {d.ctaText || 'Iniciar Teste Gratuito de 7 Dias'}
                    </a>
                    {journey.whatsapp_support_group_url && (
                      <a
                        href={getSupportGroupUrlForDay(d.dayNumber, d.secondaryCtaUrl)}
                        onClick={() => trackJourneyEvent('journey_day_support_click', { day: d.dayNumber })}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 py-3 px-5 bg-[#158E12] hover:bg-[#69AF44] text-white text-center font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        {d.secondaryCtaText || 'Entrar no Grupo de Dúvidas'}
                        <ExternalLink size={13} />
                      </a>
                    )}
                  </div>

                  {/* Botao de Rolar ao Topo */}
                  <div className="flex justify-end pt-2">
                    <button
                      onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
                      className="text-[10px] font-bold text-[#376F8D] hover:text-[#105576] flex items-center gap-1 bg-none border-none cursor-pointer"
                    >
                      <ArrowUp size={12} />
                      Voltar ao índice
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {/* RODAPÉ GERAL DE CONTATOS / SUPORTE */}
      <section className="bg-white border-t border-gray-150 py-12 px-6 mt-12">
        <div className="max-w-3xl mx-auto text-center space-y-5">
          <MessageSquare className="w-10 h-10 text-[#719EB9] mx-auto" />
          <h3 className="text-lg font-bold text-[#105576]">Ficou com alguma dúvida sobre o aplicativo?</h3>
          <p className="text-xs text-gray-600 max-w-lg mx-auto leading-relaxed">
            Estamos prontos para te apoiar durante toda a sua experiência. Entre em nosso grupo de dúvidas opcional no WhatsApp para falar diretamente conosco e receber dicas rápidas de gravação.
          </p>
          <div className="flex flex-col sm:flex-row justify-center items-center gap-3 pt-2">
            <a
              href={getSupportGroupUrlForDay(0)}
              onClick={() => trackJourneyEvent('journey_footer_support_click')}
              target="_blank"
              rel="noreferrer"
              className="w-full sm:w-auto px-6 py-3 bg-[#158E12] hover:bg-[#69AF44] text-white text-xs font-bold rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
            >
              Entrar no grupo de suporte
              <ExternalLink size={14} />
            </a>
            {journey.show_whatsapp_main_group && journey.whatsapp_main_group_url && (
              <a
                href={journey.whatsapp_main_group_url}
                target="_blank"
                rel="noreferrer"
                className="w-full sm:w-auto px-6 py-3 border border-gray-200 hover:bg-gray-50 text-gray-700 text-xs font-bold rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                Grupo Principal da Jornada
              </a>
            )}
          </div>
        </div>
      </section>

      {/* FOOTER GERAL */}
      <footer className="bg-gray-50 border-t border-gray-150 py-8 px-6 text-center text-xs text-gray-500">
        <div className="max-w-4xl mx-auto space-y-2">
          <p className="font-semibold text-gray-600">Evolução Clínica &copy; {new Date().getFullYear()}</p>
          <p className="max-w-lg mx-auto text-[10px] leading-relaxed text-gray-400 font-medium">
            O Evolução Clínica é uma ferramenta tecnológica de apoio administrativo para organização e redação clínica. O diagnóstico final, conduta e responsabilidade clínica permanecem integralmente do profissional assistente.
          </p>
        </div>
      </footer>

      {/* BOTÃO FLUTUANTE VOLTAR AO TOPO GERAL */}
      {showScrollTopBtn && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          className="fixed bottom-6 right-6 p-3 bg-[#105576] hover:bg-[#376F8D] text-white rounded-full shadow-lg transition-all animate-fadeIn z-50 cursor-pointer border-none"
          title="Voltar ao topo"
        >
          <ArrowUp size={16} />
        </button>
      )}
    </div>
  );
}
