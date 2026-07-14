import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { trackJourneyEvent } from '../services/analytics';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { 
  ArrowLeft, ArrowRight, Calendar, Clock, MessageSquare, 
  ExternalLink, Loader2, AlertTriangle, BookOpen, Globe, Award 
} from 'lucide-react';

interface Journey {
  id: string;
  title: string;
  slug: string;
  cover_image_url: string | null;
  total_days: number;
  status: 'draft' | 'active' | 'completed' | 'archived';
  whatsapp_main_group_url: string | null;
  whatsapp_support_group_url: string | null;
  show_whatsapp_main_group: boolean;
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
  published_at: string | null;
}

export default function PublicJourneyDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);

  const [journey, setJourney] = useState<Journey | null>(null);
  const [content, setContent] = useState<JourneyContent | null>(null);
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');
  
  // Navegação
  const [prevContent, setPrevContent] = useState<JourneyContent | null>(null);
  const [nextContent, setNextContent] = useState<JourneyContent | null>(null);

  // Parâmetros UTM salvos
  const [utmQueryString, setUtmQueryString] = useState('');

  // 1. UTM Preservation logic
  useEffect(() => {
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
  }, []);

  useEffect(() => {
    if (slug) {
      fetchDayData();
    }
  }, [slug]);

  const isPastPublishTime = (dateStr: string | null, timeStr: string | null) => {
    if (!dateStr) return false;
    const publishDateTime = new Date(`${dateStr}T${timeStr || '08:00:00'}-03:00`);
    return new Date() >= publishDateTime;
  };

  const fetchDayData = async () => {
    setLoading(true);
    setErrorMsg('');
    try {
      // 1. Busca a jornada ativa
      const { data: journeyData, error: jError } = await supabase
        .from('journeys')
        .select('*')
        .eq('slug', 'jornada-15-dias')
        .maybeSingle();

      if (jError) throw jError;
      if (!journeyData) {
        setErrorMsg('Jornada indisponível.');
        setLoading(false);
        return;
      }
      setJourney(journeyData);

      // 2. Busca o conteúdo correspondente ao slug
      const { data: contentData, error: cError } = await supabase
        .from('journey_contents')
        .select('*')
        .eq('journey_id', journeyData.id)
        .eq('slug', slug)
        .maybeSingle();

      if (cError) throw cError;
      if (!contentData) {
        setErrorMsg('Conteúdo não encontrado.');
        setLoading(false);
        return;
      }

      // 3. Valida se o conteúdo está publicado
      const isPublished = contentData.publication_status === 'published' || 
                          (contentData.publication_status === 'scheduled' && isPastPublishTime(contentData.publication_date, contentData.publication_time));

      if (!isPublished) {
        // Se for programado futuro, indica a data de publicação
        if (contentData.publication_status === 'scheduled' && contentData.publication_date) {
          const dateParts = contentData.publication_date.split('-');
          const formattedDate = `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
          setErrorMsg(`Este conteúdo estará disponível em breve! Programado para publicação em ${formattedDate} às ${contentData.publication_time?.slice(0, 5) || '08:00'}.`);
        } else {
          setErrorMsg('Conteúdo indisponível temporariamente.');
        }
        setLoading(false);
        return;
      }

      setContent(contentData);

      // Dispara evento analytics de visualização de conteúdo
      trackJourneyEvent('journey_content_view', {
        journey_id: journeyData.id,
        day_number: contentData.day_number,
        content_slug: contentData.slug,
        campaign: 'jornada_15_dias',
      });

      // 4. Busca vizinhos (Anterior / Próximo) publicados para navegação
      const { data: allContents, error: neighborsError } = await supabase
        .from('journey_contents')
        .select('id, day_number, title, slug, publication_status, publication_date, publication_time')
        .eq('journey_id', journeyData.id)
        .order('day_number', { ascending: true });

      if (!neighborsError && allContents) {
        // Filtra apenas os publicados
        const publishedOnly = allContents.filter(item => {
          return item.publication_status === 'published' || 
                 (item.publication_status === 'scheduled' && isPastPublishTime(item.publication_date, item.publication_time));
        });

        const currentIndex = publishedOnly.findIndex(item => item.id === contentData.id);
        if (currentIndex > 0) {
          setPrevContent(publishedOnly[currentIndex - 1]);
        } else {
          setPrevContent(null);
        }

        if (currentIndex !== -1 && currentIndex < publishedOnly.length - 1) {
          setNextContent(publishedOnly[currentIndex + 1]);
        } else {
          setNextContent(null);
        }
      }
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Falha ao carregar conteúdos.');
    } finally {
      setLoading(false);
    }
  };

  const getTrialUrl = () => {
    const baseUrl = content?.cta_url || journey?.trial_url || 'https://evolucaoclinica.app.br/login';
    if (!utmQueryString) return baseUrl;
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}${utmQueryString.slice(1)}`;
  };

  const getSupportGroupUrl = () => {
    const baseUrl = content?.secondary_cta_url || journey?.whatsapp_support_group_url || '#';
    if (!utmQueryString) return baseUrl;
    const connector = baseUrl.includes('?') ? '&' : '?';
    return `${baseUrl}${connector}${utmQueryString.slice(1)}`;
  };

  const renderContentHtml = () => {
    if (!content?.content) return '';
    const html = marked.parse(content.content, { breaks: true }) as string;
    return DOMPurify.sanitize(html);
  };

  // SEO Updates dynamically on load
  useEffect(() => {
    if (!content || !journey) return;
    
    // Altera título e meta-tags
    document.title = `Dia ${content.day_number}: ${content.title} | ${journey.title}`;
    
    const updateMeta = (selector: string, attr: 'name' | 'property', value: string, text: string) => {
      let meta = document.querySelector<HTMLMetaElement>(selector);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, value);
        document.head.appendChild(meta);
      }
      meta.content = text;
    };

    const desc = content.short_description || `Acompanhe o dia ${content.day_number} da jornada de conteúdos de Evolução Clínica.`;
    const title = `Dia ${content.day_number}: ${content.title} | ${journey.title}`;

    updateMeta("meta[name='description']", 'name', 'description', desc);
    updateMeta("meta[property='og:title']", 'property', 'og:title', title);
    updateMeta("meta[property='og:description']", 'property', 'og:description', desc);
    updateMeta("meta[property='og:type']", 'property', 'og:type', 'article');
    updateMeta("meta[name='twitter:card']", 'name', 'twitter:card', 'summary_large_image');
    updateMeta("meta[name='twitter:title']", 'name', 'twitter:title', title);
    updateMeta("meta[name='twitter:description']", 'name', 'twitter:description', desc);

    const imageToUse = content.image_url || journey.cover_image_url;
    if (imageToUse) {
      updateMeta("meta[property='og:image']", 'property', 'og:image', imageToUse);
      updateMeta("meta[name='twitter:image']", 'name', 'twitter:image', imageToUse);
    }

    // Canonical link
    let canonical = document.querySelector<HTMLLinkElement>("link[rel='canonical']");
    if (!canonical) {
      canonical = document.createElement('link');
      canonical.rel = 'canonical';
      document.head.appendChild(canonical);
    }
    canonical.href = window.location.origin + window.location.pathname;
  }, [content, journey]);

  // Analytics triggers
  const handlePrevClick = () => {
    trackJourneyEvent('journey_previous_click', {
      journey_id: journey?.id,
      day_number: content?.day_number,
      target_day: prevContent?.day_number,
    });
  };

  const handleNextClick = () => {
    trackJourneyEvent('journey_next_click', {
      journey_id: journey?.id,
      day_number: content?.day_number,
      target_day: nextContent?.day_number,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-4">
        <Loader2 className="w-10 h-10 animate-spin text-[#105576] mb-2" />
        <p className="text-sm font-semibold text-gray-600">Carregando conteúdo...</p>
      </div>
    );
  }

  if (errorMsg || !content) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex flex-col items-center justify-center p-6 text-center max-w-md mx-auto">
        <AlertTriangle className="w-12 h-12 text-[#719EB9] mb-3" />
        <h3 className="text-lg font-bold text-gray-800">Conteúdo Indisponível</h3>
        <p className="text-xs text-gray-500 mt-2 leading-relaxed">{errorMsg}</p>
        <Link 
          to={`/jornada${utmQueryString}`}
          className="mt-6 px-5 py-2.5 bg-[#105576] hover:bg-[#376F8D] text-white text-xs font-bold rounded-xl transition-colors shadow-sm"
        >
          Voltar ao Índice da Jornada
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8FAFC] flex flex-col antialiased">
      {/* Header */}
      <header className="bg-white border-b border-gray-150 py-5 px-6 sticky top-0 z-40 shadow-xs">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-4">
          <Link to={`/jornada${utmQueryString}`} className="flex items-center gap-2 text-xs font-bold text-[#105576] hover:text-[#376F8D] transition-colors cursor-pointer">
            <ArrowLeft size={16} />
            <span>Voltar ao Índice</span>
          </Link>
          <a href="/" className="flex items-center gap-2.5">
            {siteConfig.logo_light_url ? (
              <img
                src={appendBrandAssetVersion(siteConfig.logo_light_url, assetSignature)}
                alt="Logo Oficial"
                className="h-9 w-auto object-contain"
              />
            ) : (
              <span className="text-sm font-bold text-[#105576]">Evolução Clínica</span>
            )}
          </a>
        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-3xl mx-auto px-6 py-10 flex-1 w-full space-y-8">
        
        {/* Breadcrumb e Progresso */}
        <div className="flex justify-between items-center bg-[#719EB9]/5 border border-[#719EB9]/10 p-4 rounded-2xl">
          <span className="text-xs font-extrabold text-[#105576] uppercase tracking-wide">
            Dia {String(content.day_number).padStart(2, '0')} de {journey?.total_days}
          </span>
          <span className="text-[10px] text-gray-500 font-semibold bg-white border border-gray-150 px-2.5 py-1 rounded-full">
            Jornada de 15 dias
          </span>
        </div>

        {/* Content Body */}
        <article className="bg-white border border-gray-150 rounded-3xl p-6 sm:p-10 shadow-xs space-y-6">
          <div className="space-y-2.5">
            <h1 className="text-2xl sm:text-3xl font-extrabold text-[#105576] leading-tight tracking-tight">
              {content.title}
            </h1>
            {content.short_description && (
              <p className="text-sm text-gray-500 font-medium leading-relaxed">
                {content.short_description}
              </p>
            )}
          </div>

          {/* Mídia Principal (Imagem ou Vídeo) */}
          {content.content_type !== 'text' && (
            <div className="rounded-2xl overflow-hidden border border-gray-150 bg-gray-50 aspect-video w-full relative">
              {content.video_embed_url ? (
                <iframe
                  src={content.video_embed_url}
                  title={content.title}
                  className="w-full h-full border-none"
                  allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                  allowFullScreen
                />
              ) : content.image_url ? (
                <img
                  src={content.image_url}
                  alt={content.image_alt || content.title}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400">
                  Sem mídia vinculada
                </div>
              )}
            </div>
          )}

          {/* Texto Principal Rizado (Markdown) */}
          <div 
            className="prose prose-sm max-w-none text-gray-700 leading-relaxed space-y-4 text-xs sm:text-sm prose-headings:text-[#105576] prose-headings:font-bold prose-a:text-[#105576] prose-strong:text-gray-900 prose-strong:font-bold"
            dangerouslySetInnerHTML={{ __html: renderContentHtml() }}
          />

          {/* Chamada para Ação (CTA Principal e Secundário) */}
          <div className="border-t border-gray-100 pt-8 flex flex-col sm:flex-row gap-3">
            <a
              href={getTrialUrl()}
              className="flex-1 py-3 px-5 bg-[#105576] hover:bg-[#376F8D] text-white text-center font-bold text-xs rounded-xl shadow-md transition-colors cursor-pointer"
            >
              {content.cta_text || 'Iniciar Teste Gratuito de 7 Dias'}
            </a>
            {journey?.whatsapp_support_group_url && (
              <a
                href={getSupportGroupUrl()}
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-3 px-5 bg-[#158E12] hover:bg-[#69AF44] text-white text-center font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                {content.secondary_cta_text || 'Entrar no Grupo de Dúvidas'}
                <ExternalLink size={14} />
              </a>
            )}
          </div>
        </article>

        {/* Mensagem Rodapé - A IA apóia o profissional */}
        <div className="bg-amber-50/20 border border-amber-200/40 rounded-2xl p-4 text-center text-[10px] text-amber-800 leading-relaxed font-semibold">
          💡 A inteligência artificial serve como suporte para transcrição e padronização rápida de relatórios. Toda decisão clínica, diagnóstico e alteração terapêutica permanecem exclusivamente de responsabilidade do profissional de saúde assistente.
        </div>

        {/* Navegação Entre Dias */}
        <nav className="flex justify-between items-center gap-4 bg-white border border-gray-150 p-4 rounded-2xl shadow-xs">
          {prevContent ? (
            <Link
              to={`/jornada/${prevContent.slug}${utmQueryString}`}
              onClick={handlePrevClick}
              className="flex items-center gap-2 text-xs font-bold text-[#105576] hover:text-[#376F8D] transition-colors cursor-pointer"
            >
              <ArrowLeft size={16} />
              <span>Dia {prevContent.day_number}</span>
            </Link>
          ) : (
            <span className="text-gray-300 text-xs font-semibold cursor-not-allowed">Primeiro Dia</span>
          )}

          <Link 
            to={`/jornada${utmQueryString}`}
            className="text-[10px] text-gray-500 font-bold hover:text-[#105576] transition-colors uppercase tracking-wider text-center"
          >
            Índice
          </Link>

          {nextContent ? (
            <Link
              to={`/jornada/${nextContent.slug}${utmQueryString}`}
              onClick={handleNextClick}
              className="flex items-center gap-2 text-xs font-bold text-[#105576] hover:text-[#376F8D] transition-colors cursor-pointer"
            >
              <span>Dia {nextContent.day_number}</span>
              <ArrowRight size={16} />
            </Link>
          ) : (
            <span className="text-gray-300 text-xs font-semibold cursor-not-allowed">Último Dia</span>
          )}
        </nav>

        {/* Central timeline redirecionamento */}
        <div className="text-center py-2 text-xs text-gray-500 font-medium">
          Entrou agora ou perdeu algum conteúdo?{' '}
          <Link to={`/jornada${utmQueryString}`} className="text-[#105576] font-bold hover:underline">
            Volte ao índice da Jornada de 15 dias.
          </Link>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-gray-150 py-8 px-6 text-center text-xs text-gray-500">
        <div className="max-w-4xl mx-auto space-y-2">
          <p className="font-semibold text-gray-600">Evolução Clínica &copy; {new Date().getFullYear()}</p>
          <p className="max-w-md mx-auto text-[11px] leading-relaxed text-gray-400">
            A inteligência artificial apoia a organização e a redação documental. A revisão final e a responsabilidade de diagnóstico técnico e plano terapêutico continuam sendo integralmente do profissional.
          </p>
        </div>
      </footer>
    </div>
  );
}
