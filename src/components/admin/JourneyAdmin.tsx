import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../../supabaseClient';
import { marked } from 'marked';
import DOMPurify from 'dompurify';
import { 
  Plus, Edit, Eye, Trash2, Copy, Check, Upload, Calendar, Clock, 
  BarChart3, List, MoveUp, MoveDown, ArrowLeft, ExternalLink, 
  RefreshCw, FileText, Info, AlertTriangle, AlertCircle, Sparkles, 
  CheckCircle2, X, MessageSquare, ChevronRight, Settings, Image as ImageIcon,
  Layout as LayoutIcon
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
  start_date: string | null;
  end_date: string | null;
  timezone: string;
  public_url: string | null;
  whatsapp_main_group_url: string | null;
  whatsapp_support_group_url: string | null;
  show_whatsapp_main_group: boolean;
  show_scheduled_as_coming_soon: boolean;
  trial_url: string | null;
  website_url: string | null;
  seo_title: string | null;
  seo_description: string | null;
  created_at: string;
  updated_at: string;
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
  image_prompt: string | null;
  publication_status: 'draft' | 'scheduled' | 'published' | 'archived';
  publication_date: string | null;
  publication_time: string | null;
  published_at: string | null;
  sort_order: number;
  is_featured: boolean;
  allow_indexing: boolean;
  created_at: string;
  updated_at: string;
}

type ViewMode = 'list_journeys' | 'edit_journey' | 'list_contents' | 'edit_content' | 'whatsapp_fixed';

export default function JourneyAdmin() {
  const [viewMode, setViewMode] = useState<ViewMode>('list_journeys');
  
  // Lista de jornadas
  const [journeys, setJourneys] = useState<Journey[]>([]);
  const [loadingJourneys, setLoadingJourneys] = useState(true);
  const [journeyCounts, setJourneyCounts] = useState<Record<string, { published: number; scheduled: number }>>({});
  
  // Seleções
  const [selectedJourney, setSelectedJourney] = useState<Journey | null>(null);
  const [selectedContent, setSelectedContent] = useState<JourneyContent | null>(null);
  
  // Lista de conteúdos
  const [contents, setContents] = useState<JourneyContent[]>([]);
  const [loadingContents, setLoadingContents] = useState(false);
  
  // Feedbacks visuais
  const [saving, setSaving] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  
  // Estado formulário Journey
  const [journeyForm, setJourneyForm] = useState<Partial<Journey>>({
    title: '',
    subtitle: '',
    description: '',
    slug: '',
    cover_image_url: '',
    total_days: 15,
    status: 'draft',
    start_date: '',
    end_date: '',
    timezone: 'America/Sao_Paulo',
    whatsapp_main_group_url: '',
    whatsapp_support_group_url: '',
    show_whatsapp_main_group: false,
    show_scheduled_as_coming_soon: true,
    trial_url: '',
    website_url: '',
    seo_title: '',
    seo_description: '',
  });

  // Estado formulário Content
  const [contentForm, setContentForm] = useState<Partial<JourneyContent>>({
    day_number: 1,
    title: '',
    slug: '',
    short_description: '',
    content: '',
    image_url: '',
    image_alt: '',
    video_url: '',
    video_embed_url: '',
    content_type: 'text',
    cta_text: '',
    cta_url: '',
    secondary_cta_text: '',
    secondary_cta_url: '',
    whatsapp_message: '',
    image_prompt: '',
    publication_status: 'draft',
    publication_date: '',
    publication_time: '08:00',
    is_featured: false,
    allow_indexing: true,
  });

  // Preview de Markdown
  const [markdownPreview, setMarkdownPreview] = useState('');
  
  // Uploads
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Inicialização
  useEffect(() => {
    fetchJourneys();
  }, []);

  useEffect(() => {
    if (contentForm.content) {
      const html = marked.parse(contentForm.content, { breaks: true }) as string;
      setMarkdownPreview(DOMPurify.sanitize(html));
    } else {
      setMarkdownPreview('');
    }
  }, [contentForm.content]);

  // Carrega lista de jornadas
  const fetchJourneys = async () => {
    setLoadingJourneys(true);
    try {
      const { data, error } = await supabase
        .from('journeys')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      const loadedJourneys = data || [];
      setJourneys(loadedJourneys);

      // Busca contagens de conteúdos para cada jornada
      const counts: Record<string, { published: number; scheduled: number }> = {};
      for (const j of loadedJourneys) {
        const { data: contentData, error: cntError } = await supabase
          .from('journey_contents')
          .select('publication_status')
          .eq('journey_id', j.id);

        if (!cntError && contentData) {
          counts[j.id] = {
            published: contentData.filter(c => c.publication_status === 'published').length,
            scheduled: contentData.filter(c => c.publication_status === 'scheduled').length,
          };
        }
      }
      setJourneyCounts(counts);
    } catch (err) {
      console.error('Erro ao buscar jornadas:', err);
    } finally {
      setLoadingJourneys(false);
    }
  };

  // Carrega conteúdos da jornada selecionada
  const fetchContents = async (journeyId: string) => {
    setLoadingContents(true);
    try {
      const { data, error } = await supabase
        .from('journey_contents')
        .select('*')
        .eq('journey_id', journeyId)
        .order('day_number', { ascending: true });

      if (error) throw error;
      setContents(data || []);
    } catch (err) {
      console.error('Erro ao buscar conteúdos da jornada:', err);
    } finally {
      setLoadingContents(false);
    }
  };

  // Gerar Slug Automaticamente
  const generateSlug = (text: string): string => {
    return text
      .toString()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // Remove acentos
      .replace(/[^\w\s-]/g, '') // Remove caracteres especiais
      .replace(/\s+/g, '-') // Substitui espaços por hífens
      .replace(/--+/g, '-') // Remove hífens duplicados
      .trim();
  };

  // Handler de alteração do título da jornada (gera slug)
  const handleJourneyTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setJourneyForm(prev => ({
      ...prev,
      title,
      slug: prev.slug === generateSlug(prev.title || '') ? generateSlug(title) : prev.slug
    }));
  };

  // Handler de alteração do título do conteúdo (gera slug)
  const handleContentTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const title = e.target.value;
    setContentForm(prev => ({
      ...prev,
      title,
      slug: prev.slug === generateSlug(prev.title || '') ? generateSlug(title) : prev.slug
    }));
  };

  // Duplicar Jornada
  const handleDuplicateJourney = async (journey: Journey) => {
    if (!window.confirm(`Deseja duplicar a jornada "${journey.title}"?`)) return;
    try {
      // 1. Duplica registro da jornada
      const newSlug = `${journey.slug}-copia-${Date.now().toString().slice(-4)}`;
      const { data: newJourney, error: jError } = await supabase
        .from('journeys')
        .insert({
          title: `${journey.title} (Cópia)`,
          slug: newSlug,
          subtitle: journey.subtitle,
          description: journey.description,
          cover_image_url: journey.cover_image_url,
          total_days: journey.total_days,
          status: 'draft',
          start_date: journey.start_date,
          end_date: journey.end_date,
          timezone: journey.timezone,
          whatsapp_main_group_url: journey.whatsapp_main_group_url,
          whatsapp_support_group_url: journey.whatsapp_support_group_url,
          show_whatsapp_main_group: journey.show_whatsapp_main_group,
          show_scheduled_as_coming_soon: journey.show_scheduled_as_coming_soon,
          trial_url: journey.trial_url,
          website_url: journey.website_url,
          seo_title: journey.seo_title,
          seo_description: journey.seo_description,
        })
        .select()
        .single();

      if (jError) throw jError;

      // 2. Duplica conteúdos
      const { data: oldContents, error: cError } = await supabase
        .from('journey_contents')
        .select('*')
        .eq('journey_id', journey.id);

      if (!cError && oldContents && oldContents.length > 0) {
        const contentsToInsert = oldContents.map(c => ({
          journey_id: newJourney.id,
          day_number: c.day_number,
          title: c.title,
          slug: c.slug,
          short_description: c.short_description,
          content: c.content,
          image_url: c.image_url,
          image_alt: c.image_alt,
          video_url: c.video_url,
          video_embed_url: c.video_embed_url,
          content_type: c.content_type,
          cta_text: c.cta_text,
          cta_url: c.cta_url,
          secondary_cta_text: c.secondary_cta_text,
          secondary_cta_url: c.secondary_cta_url,
          whatsapp_message: c.whatsapp_message,
          image_prompt: c.image_prompt,
          publication_status: 'draft',
          published_at: null,
          publication_date: null,
          sort_order: c.sort_order,
          is_featured: c.is_featured,
          allow_indexing: c.allow_indexing,
        }));

        const { error: batchInsertError } = await supabase
          .from('journey_contents')
          .insert(contentsToInsert);

        if (batchInsertError) console.error("Erro ao duplicar conteúdos:", batchInsertError);
      }

      alert('Jornada duplicada com sucesso!');
      fetchJourneys();
    } catch (err: any) {
      alert(`Erro ao duplicar jornada: ${err.message || 'Erro desconhecido'}`);
    }
  };

  // Arquivar Jornada
  const handleArchiveJourney = async (journey: Journey) => {
    if (!window.confirm(`Deseja arquivar a jornada "${journey.title}"?`)) return;
    try {
      const { error } = await supabase
        .from('journeys')
        .update({ status: 'archived' })
        .eq('id', journey.id);

      if (error) throw error;
      alert('Jornada arquivada com sucesso!');
      fetchJourneys();
    } catch (err: any) {
      alert(`Erro ao arquivar: ${err.message}`);
    }
  };

  // Duplicar Conteúdo
  const handleDuplicateContent = async (content: JourneyContent) => {
    // Encontrar um dia livre
    const daysUsed = contents.map(c => c.day_number);
    let freeDay = 1;
    while (daysUsed.includes(freeDay)) {
      freeDay++;
    }

    if (freeDay > selectedJourney!.total_days) {
      alert(`Não é possível duplicar. A jornada atingiu o limite de ${selectedJourney!.total_days} dias.`);
      return;
    }

    try {
      const { error } = await supabase
        .from('journey_contents')
        .insert({
          journey_id: content.journey_id,
          day_number: freeDay,
          title: `${content.title} (Cópia)`,
          slug: `${content.slug}-copia-${Date.now().toString().slice(-3)}`,
          short_description: content.short_description,
          content: content.content,
          image_url: content.image_url,
          image_alt: content.image_alt,
          video_url: content.video_url,
          video_embed_url: content.video_embed_url,
          content_type: content.content_type,
          cta_text: content.cta_text,
          cta_url: content.cta_url,
          secondary_cta_text: content.secondary_cta_text,
          secondary_cta_url: content.secondary_cta_url,
          whatsapp_message: content.whatsapp_message,
          image_prompt: content.image_prompt,
          publication_status: 'draft',
          published_at: null,
          publication_date: null,
          sort_order: content.sort_order,
          is_featured: content.is_featured,
          allow_indexing: content.allow_indexing,
        });

      if (error) throw error;
      alert(`Conteúdo copiado para o Dia ${freeDay}!`);
      fetchContents(selectedJourney!.id);
    } catch (err: any) {
      alert(`Erro ao duplicar conteúdo: ${err.message}`);
    }
  };

  // Arquivar Conteúdo
  const handleArchiveContent = async (content: JourneyContent) => {
    try {
      const { error } = await supabase
        .from('journey_contents')
        .update({ publication_status: 'archived' })
        .eq('id', content.id);

      if (error) throw error;
      alert('Conteúdo arquivado!');
      fetchContents(selectedJourney!.id);
    } catch (err: any) {
      alert(`Erro ao arquivar: ${err.message}`);
    }
  };

  // Publicar Imediatamente
  const handlePublishImmediately = async (content: JourneyContent) => {
    try {
      const { error } = await supabase
        .from('journey_contents')
        .update({ 
          publication_status: 'published',
          published_at: new Date().toISOString()
        })
        .eq('id', content.id);

      if (error) throw error;
      alert('Conteúdo publicado imediatamente com sucesso!');
      fetchContents(selectedJourney!.id);
    } catch (err: any) {
      alert(`Erro ao publicar: ${err.message}`);
    }
  };

  // Despublicar
  const handleDepublish = async (content: JourneyContent) => {
    try {
      const { error } = await supabase
        .from('journey_contents')
        .update({ 
          publication_status: 'draft',
          published_at: null
        })
        .eq('id', content.id);

      if (error) throw error;
      alert('Conteúdo definido como rascunho!');
      fetchContents(selectedJourney!.id);
    } catch (err: any) {
      alert(`Erro ao salvar: ${err.message}`);
    }
  };

  // Reordenação por swap de dias
  const handleSwapDays = async (content: JourneyContent, direction: 'up' | 'down') => {
    const currentIndex = contents.findIndex(c => c.id === content.id);
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;

    if (targetIndex < 0 || targetIndex >= contents.length) return;

    const targetContent = contents[targetIndex];
    const currentDay = content.day_number;
    const targetDay = targetContent.day_number;

    try {
      // 1. Define dia temporário alto no item atual
      const tempDay = 9999;
      const { error: err1 } = await supabase
        .from('journey_contents')
        .update({ day_number: tempDay })
        .eq('id', content.id);
      if (err1) throw err1;

      // 2. Define o dia final no item destino
      const { error: err2 } = await supabase
        .from('journey_contents')
        .update({ day_number: currentDay })
        .eq('id', targetContent.id);
      if (err2) {
        await supabase.from('journey_contents').update({ day_number: currentDay }).eq('id', content.id);
        throw err2;
      }

      // 3. Define o dia final no item atual
      const { error: err3 } = await supabase
        .from('journey_contents')
        .update({ day_number: targetDay })
        .eq('id', content.id);
      if (err3) throw err3;

      fetchContents(selectedJourney!.id);
    } catch (err: any) {
      console.error('Erro ao reordenar:', err);
      alert(`Erro ao reordenar: ${err.message}`);
    }
  };

  // Upload de Imagens no painel
  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: 'cover' | 'content') => {
    const file = e.target.files?.[0];
    if (!file) return;

    // 1. Validação de Extensão e MIME
    const allowedExtensions = ['png', 'jpg', 'jpeg', 'webp'];
    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!fileExt || !allowedExtensions.includes(fileExt)) {
      alert('Extensão inválida! Permite apenas PNG, JPG, JPEG e WEBP.');
      return;
    }

    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedMimeTypes.includes(file.type)) {
      alert('MIME type inválido! Permite apenas PNG, JPG, JPEG e WEBP.');
      return;
    }

    // 2. Validação de Tamanho Máximo (5MB)
    const maxSize = 5 * 1024 * 1024;
    if (file.size > maxSize) {
      alert('O arquivo excede o limite máximo de 5MB.');
      return;
    }

    setUploadingImage(true);

    try {
      // 3. Validação de Dimensões Mínimas (300x300 px)
      await new Promise<void>((resolve, reject) => {
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
          if (img.width < 300 || img.height < 300) {
            reject(new Error(`A imagem deve ter no mínimo 300x300 pixels (Atual: ${img.width}x${img.height}px).`));
          } else {
            resolve();
          }
        };
        img.onerror = () => reject(new Error('Falha ao ler dimensões da imagem.'));
      });

      // 4. Nome seguro do arquivo
      const secureName = file.name
        .replace(/[^a-zA-Z0-9]/g, '_')
        .toLowerCase();
      const fileName = `journey/${field}_${Date.now()}_${secureName}.${fileExt}`;

      // 5. Upload para Supabase Storage (bucket brand)
      const { error: uploadError } = await supabase.storage
        .from('brand')
        .upload(fileName, file, {
          cacheControl: '31536000',
          upsert: true
        });

      if (uploadError) throw uploadError;

      // 6. Resgata URL pública
      const { data: publicUrlData } = supabase.storage
        .from('brand')
        .getPublicUrl(fileName);

      if (publicUrlData?.publicUrl) {
        if (field === 'cover') {
          setJourneyForm(prev => ({ ...prev, cover_image_url: publicUrlData.publicUrl }));
        } else {
          setContentForm(prev => ({ ...prev, image_url: publicUrlData.publicUrl }));
        }
        alert('Imagem enviada com sucesso!');
      }
    } catch (err: any) {
      console.error(err);
      alert(err.message || 'Erro ao realizar upload da imagem.');
    } finally {
      setUploadingImage(false);
    }
  };

  // Salvar Jornada (Novo / Edição)
  const handleSaveJourney = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!journeyForm.title?.trim() || !journeyForm.slug?.trim()) {
      alert('Título e Slug são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        title: journeyForm.title,
        subtitle: journeyForm.subtitle || null,
        description: journeyForm.description || null,
        slug: journeyForm.slug,
        cover_image_url: journeyForm.cover_image_url || null,
        total_days: journeyForm.total_days || 15,
        status: journeyForm.status || 'draft',
        start_date: journeyForm.start_date || null,
        end_date: journeyForm.end_date || null,
        timezone: journeyForm.timezone || 'America/Sao_Paulo',
        public_url: `/jornada`,
        whatsapp_main_group_url: journeyForm.whatsapp_main_group_url || null,
        whatsapp_support_group_url: journeyForm.whatsapp_support_group_url || null,
        show_whatsapp_main_group: journeyForm.show_whatsapp_main_group || false,
        show_scheduled_as_coming_soon: journeyForm.show_scheduled_as_coming_soon || false,
        trial_url: journeyForm.trial_url || null,
        website_url: journeyForm.website_url || null,
        seo_title: journeyForm.seo_title || null,
        seo_description: journeyForm.seo_description || null,
      };

      let error;
      if (selectedJourney) {
        // UPDATE
        const { error: uErr } = await supabase
          .from('journeys')
          .update(payload)
          .eq('id', selectedJourney.id);
        error = uErr;
      } else {
        // INSERT
        const { error: iErr } = await supabase
          .from('journeys')
          .insert(payload);
        error = iErr;
      }

      if (error) throw error;
      alert('Jornada salva com sucesso!');
      setViewMode('list_journeys');
      fetchJourneys();
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao salvar jornada: ${err.message || 'Erro desconhecido'}`);
    } finally {
      setSaving(false);
    }
  };

  // Salvar Conteúdo (Novo / Edição)
  const handleSaveContent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contentForm.title?.trim() || !contentForm.slug?.trim()) {
      alert('Título e Slug são obrigatórios.');
      return;
    }

    setSaving(true);
    try {
      const isScheduled = contentForm.publication_status === 'scheduled';
      const payload = {
        journey_id: selectedJourney!.id,
        day_number: contentForm.day_number || 1,
        title: contentForm.title,
        slug: contentForm.slug,
        short_description: contentForm.short_description || null,
        content: contentForm.content || null,
        image_url: contentForm.image_url || null,
        image_alt: contentForm.image_alt || null,
        video_url: contentForm.video_url || null,
        video_embed_url: contentForm.video_embed_url || null,
        content_type: contentForm.content_type || 'text',
        cta_text: contentForm.cta_text || null,
        cta_url: contentForm.cta_url || null,
        secondary_cta_text: contentForm.secondary_cta_text || null,
        secondary_cta_url: contentForm.secondary_cta_url || null,
        whatsapp_message: contentForm.whatsapp_message || null,
        image_prompt: contentForm.image_prompt || null,
        publication_status: contentForm.publication_status || 'draft',
        publication_date: isScheduled ? (contentForm.publication_date || null) : null,
        publication_time: isScheduled ? (contentForm.publication_time || null) : null,
        published_at: contentForm.publication_status === 'published' ? (contentForm.published_at || new Date().toISOString()) : null,
        is_featured: contentForm.is_featured || false,
        allow_indexing: contentForm.allow_indexing !== false
      };

      let error;
      if (selectedContent) {
        // UPDATE
        const { error: uErr } = await supabase
          .from('journey_contents')
          .update(payload)
          .eq('id', selectedContent.id);
        error = uErr;
      } else {
        // INSERT
        const { error: iErr } = await supabase
          .from('journey_contents')
          .insert(payload);
        error = iErr;
      }

      if (error) throw error;
      alert('Conteúdo salvo com sucesso!');
      setViewMode('list_contents');
      fetchContents(selectedJourney!.id);
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao salvar conteúdo: ${err.message || 'Erro desconhecido. Verifique duplicidade de Slug ou Dia.'}`);
    } finally {
      setSaving(false);
    }
  };

  // Copiar para clipboard
  const handleCopyToClipboard = (text: string | null, id: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  // Abre form de nova jornada
  const handleNewJourney = () => {
    setSelectedJourney(null);
    setJourneyForm({
      title: '',
      subtitle: '',
      description: '',
      slug: '',
      cover_image_url: '',
      total_days: 15,
      status: 'draft',
      start_date: '',
      end_date: '',
      timezone: 'America/Sao_Paulo',
      whatsapp_main_group_url: '',
      whatsapp_support_group_url: '',
      show_whatsapp_main_group: false,
      show_scheduled_as_coming_soon: true,
      trial_url: '',
      website_url: '',
      seo_title: '',
      seo_description: '',
    });
    setViewMode('edit_journey');
  };

  // Abre form de editar jornada
  const handleEditJourney = (journey: Journey) => {
    setSelectedJourney(journey);
    setJourneyForm({ ...journey });
    setViewMode('edit_journey');
  };

  // Abre listagem de conteúdos da jornada
  const handleManageContents = (journey: Journey) => {
    setSelectedJourney(journey);
    setViewMode('list_contents');
    fetchContents(journey.id);
  };

  // Abre form de novo conteúdo
  const handleNewContent = () => {
    setSelectedContent(null);
    const nextDay = contents.length > 0 ? Math.max(...contents.map(c => c.day_number)) + 1 : 1;
    
    setContentForm({
      day_number: nextDay <= selectedJourney!.total_days ? nextDay : 1,
      title: '',
      slug: '',
      short_description: '',
      content: '',
      image_url: '',
      image_alt: '',
      video_url: '',
      video_embed_url: '',
      content_type: 'text',
      cta_text: '',
      cta_url: '',
      secondary_cta_text: '',
      secondary_cta_url: '',
      whatsapp_message: '',
      image_prompt: '',
      publication_status: 'draft',
      publication_date: new Date().toISOString().split('T')[0],
      publication_time: '08:00',
      is_featured: false,
      allow_indexing: true,
    });
    setViewMode('edit_content');
  };

  // Abre form de editar conteúdo
  const handleEditContent = (content: JourneyContent) => {
    setSelectedContent(content);
    setContentForm({ ...content });
    setViewMode('edit_content');
  };

  // WhatsApp Message "Comece por Aqui" preenchida automaticamente
  const getWhatsappFixedMessage = () => {
    const origin = window.location.origin;
    const urlJornada = `${origin}/jornada`;
    
    return `👋 Entrou agora na Jornada Evolução Clínica?

Durante 15 dias, publicaremos conteúdos mostrando como transformar resumos falados em registros clínicos organizados.

Para acessar as mensagens anteriores e acompanhar desde o primeiro dia, utilize o link abaixo:

🔗 Acessar todos os conteúdos da jornada:
${urlJornada}

Você pode acompanhar no seu próprio ritmo. Uma nova mensagem será publicada diariamente.`;
  };

  return (
    <div className="space-y-6">
      {/* Header do Módulo */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-white border border-brand-border p-6 rounded-2xl shadow-sm">
        <div>
          <h2 className="text-xl font-bold text-brand-primary flex items-center gap-2">
            <LayoutIcon size={24} className="text-brand-secondary" />
            Jornada de 15 dias
          </h2>
          <p className="text-xs text-brand-text-muted mt-1">
            Gerencie jornadas de conteúdos digitais e organize o cronograma de mensagens da campanha.
          </p>
        </div>
        
        {viewMode === 'list_journeys' && (
          <button
            onClick={handleNewJourney}
            className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl hover:bg-brand-primary-hover transition-colors text-sm font-semibold cursor-pointer"
          >
            <Plus size={16} />
            <span>Nova Jornada</span>
          </button>
        )}

        {viewMode === 'list_contents' && (
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('list_journeys')}
              className="px-4 py-2.5 border border-brand-border text-brand-text hover:bg-brand-bg rounded-xl transition-colors text-sm font-semibold cursor-pointer"
            >
              Voltar para Jornadas
            </button>
            <button
              onClick={() => setViewMode('whatsapp_fixed')}
              className="flex items-center gap-2 px-4 py-2.5 border border-brand-border text-green-700 hover:bg-green-50 rounded-xl transition-colors text-sm font-semibold cursor-pointer"
            >
              <MessageSquare size={16} />
              <span>Fixado WhatsApp</span>
            </button>
            <button
              onClick={handleNewContent}
              className="flex items-center gap-2 px-4 py-2.5 bg-brand-primary text-white rounded-xl hover:bg-brand-primary-hover transition-colors text-sm font-semibold cursor-pointer"
            >
              <Plus size={16} />
              <span>Novo Dia</span>
            </button>
          </div>
        )}

        {(viewMode === 'edit_journey' || viewMode === 'edit_content' || viewMode === 'whatsapp_fixed') && (
          <button
            onClick={() => setViewMode(viewMode === 'edit_journey' ? 'list_journeys' : 'list_contents')}
            className="flex items-center gap-2 px-4 py-2.5 border border-brand-border text-brand-text hover:bg-brand-bg rounded-xl transition-colors text-sm font-semibold cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Voltar</span>
          </button>
        )}
      </div>

      {/* --- LISTAGEM DE JORNADAS --- */}
      {viewMode === 'list_journeys' && (
        <div className="bg-white border border-brand-border rounded-2xl shadow-sm overflow-hidden">
          {loadingJourneys ? (
            <div className="flex flex-col items-center justify-center py-20">
              <RefreshCw className="w-10 h-10 animate-spin text-brand-primary" />
              <p className="text-sm text-brand-text-muted mt-2">Carregando campanhas...</p>
            </div>
          ) : journeys.length === 0 ? (
            <div className="text-center py-20">
              <LayoutIcon className="w-12 h-12 text-brand-border mx-auto mb-2" />
              <h3 className="font-semibold text-brand-text">Nenhuma jornada cadastrada</h3>
              <p className="text-xs text-brand-text-muted mt-1">Crie sua primeira jornada de conteúdos para o WhatsApp.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-brand-border bg-brand-bg text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                    <th className="px-6 py-4">Título</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4 text-center">Dias</th>
                    <th className="px-6 py-4">Início / Término</th>
                    <th className="px-6 py-4 text-center">Publicados</th>
                    <th className="px-6 py-4 text-center">Agendados</th>
                    <th className="px-6 py-4 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-brand-border">
                  {journeys.map((j) => {
                    const count = journeyCounts[j.id] || { published: 0, scheduled: 0 };
                    return (
                      <tr key={j.id} className="hover:bg-brand-bg/40 transition-colors">
                        <td className="px-6 py-4 font-semibold text-brand-text">
                          <span className="block text-sm font-bold text-brand-primary">{j.title}</span>
                          <span className="text-[10px] text-brand-text-muted font-normal block">{j.slug}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${
                            j.status === 'active' ? 'bg-green-50 text-green-700' :
                            j.status === 'draft' ? 'bg-amber-50 text-amber-700' :
                            j.status === 'completed' ? 'bg-blue-50 text-blue-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>
                            {j.status === 'active' ? 'Ativo' :
                             j.status === 'draft' ? 'Rascunho' :
                             j.status === 'completed' ? 'Finalizado' : 'Arquivado'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-center font-bold text-brand-text">{j.total_days}</td>
                        <td className="px-6 py-4 text-brand-text-muted">
                          <div className="flex flex-col gap-0.5">
                            <span>Início: {j.start_date || 'N/A'}</span>
                            <span>Fim: {j.end_date || 'N/A'}</span>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2 py-0.5 bg-green-50 text-green-800 rounded font-bold">{count.published}</span>
                        </td>
                        <td className="px-6 py-4 text-center">
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-800 rounded font-bold">{count.scheduled}</span>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1.5">
                            <button
                              onClick={() => handleManageContents(j)}
                              title="Gerenciar dias / conteúdos"
                              className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-brand-text transition-colors cursor-pointer"
                            >
                              <List size={14} />
                            </button>
                            <button
                              onClick={() => handleEditJourney(j)}
                              title="Editar configurações"
                              className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-brand-text transition-colors cursor-pointer"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              onClick={() => handleDuplicateJourney(j)}
                              title="Duplicar Jornada"
                              className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-blue-600 transition-colors cursor-pointer"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={() => handleArchiveJourney(j)}
                              title="Arquivar Jornada"
                              className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-amber-600 transition-colors cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                            {j.status === 'active' && (
                              <a
                                href="/jornada"
                                target="_blank"
                                rel="noreferrer"
                                className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-brand-primary transition-colors flex items-center justify-center"
                              >
                                <ExternalLink size={14} />
                              </a>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* --- FORMULÁRIO JORNADA --- */}
      {viewMode === 'edit_journey' && (
        <form onSubmit={handleSaveJourney} className="bg-white border border-brand-border rounded-2xl shadow-sm p-6 space-y-6">
          <h3 className="text-base font-bold text-brand-primary border-b border-brand-border pb-3">
            {selectedJourney ? 'Editar Configurações da Jornada' : 'Cadastrar Nova Jornada de Conteúdos'}
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Bloco Geral */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Título da Jornada *</label>
                <input
                  type="text"
                  required
                  value={journeyForm.title || ''}
                  onChange={handleJourneyTitleChange}
                  placeholder="Ex: Jornada de 15 dias"
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Subtítulo</label>
                <input
                  type="text"
                  value={journeyForm.subtitle || ''}
                  onChange={(e) => setJourneyForm(prev => ({ ...prev, subtitle: e.target.value }))}
                  placeholder="Ex: Conteúdos e demonstrações do Evolução Clínica"
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Slug da URL *</label>
                <input
                  type="text"
                  required
                  value={journeyForm.slug || ''}
                  onChange={(e) => setJourneyForm(prev => ({ ...prev, slug: generateSlug(e.target.value) }))}
                  placeholder="Ex: jornada-15-dias"
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary bg-brand-bg font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Descrição</label>
                <textarea
                  value={journeyForm.description || ''}
                  onChange={(e) => setJourneyForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Descrição da campanha..."
                  rows={3}
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Total de Dias</label>
                  <input
                    type="number"
                    value={journeyForm.total_days || 15}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, total_days: Number(e.target.value) }))}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Status</label>
                  <select
                    value={journeyForm.status || 'draft'}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, status: e.target.value as any }))}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 bg-white focus:outline-none focus:border-brand-primary"
                  >
                    <option value="draft">Rascunho</option>
                    <option value="active">Ativo (Público)</option>
                    <option value="completed">Concluído</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Data Início</label>
                  <input
                    type="date"
                    value={journeyForm.start_date || ''}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, start_date: e.target.value }))}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Data Término</label>
                  <input
                    type="date"
                    value={journeyForm.end_date || ''}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, end_date: e.target.value }))}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>

            {/* Bloco Configurações & Upload */}
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Imagem de Capa</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={journeyForm.cover_image_url || ''}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, cover_image_url: e.target.value }))}
                    placeholder="URL da Imagem..."
                    className="flex-1 text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                  />
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={(e) => handleImageUpload(e, 'cover')}
                    className="hidden"
                    accept="image/png, image/jpeg, image/jpg, image/webp"
                  />
                  <button
                    type="button"
                    disabled={uploadingImage}
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 border border-brand-border hover:bg-brand-bg rounded-xl transition-colors flex items-center gap-1.5 text-xs font-bold text-brand-text cursor-pointer"
                  >
                    <Upload size={14} />
                    {uploadingImage ? 'Enviando...' : 'Upload'}
                  </button>
                </div>
                {journeyForm.cover_image_url && (
                  <img
                    src={journeyForm.cover_image_url}
                    alt="Preview capa"
                    className="mt-2 h-20 w-auto rounded-xl object-contain border border-brand-border"
                  />
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Link do Grupo Principal WhatsApp</label>
                <input
                  type="url"
                  value={journeyForm.whatsapp_main_group_url || ''}
                  onChange={(e) => setJourneyForm(prev => ({ ...prev, whatsapp_main_group_url: e.target.value }))}
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                />
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show_whatsapp_main_group"
                    checked={journeyForm.show_whatsapp_main_group || false}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, show_whatsapp_main_group: e.target.checked }))}
                    className="rounded text-brand-primary"
                  />
                  <label htmlFor="show_whatsapp_main_group" className="text-[10px] text-brand-text-muted">
                    Exibir link do grupo principal publicamente na página.
                  </label>
                </div>
                <div className="mt-1.5 flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="show_scheduled_as_coming_soon"
                    checked={journeyForm.show_scheduled_as_coming_soon || false}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, show_scheduled_as_coming_soon: e.target.checked }))}
                    className="rounded text-brand-primary"
                  />
                  <label htmlFor="show_scheduled_as_coming_soon" className="text-[10px] text-brand-text-muted">
                    Exibir conteúdos futuros agendados como "Em breve" na página pública.
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Link do Grupo de Dúvidas / Suporte</label>
                <input
                  type="url"
                  value={journeyForm.whatsapp_support_group_url || ''}
                  onChange={(e) => setJourneyForm(prev => ({ ...prev, whatsapp_support_group_url: e.target.value }))}
                  placeholder="https://chat.whatsapp.com/..."
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Link de Teste Gratuito (CTA Principal)</label>
                <input
                  type="url"
                  value={journeyForm.trial_url || ''}
                  onChange={(e) => setJourneyForm(prev => ({ ...prev, trial_url: e.target.value }))}
                  placeholder="https://evolucaoclinica.app.br/login?trial=true"
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div className="border-t border-brand-border pt-4 mt-4 space-y-4">
                <h4 className="text-xs font-bold text-brand-secondary flex items-center gap-1.5">
                  <Settings size={14} />
                  Configurações SEO (Opcional)
                </h4>
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Título SEO</label>
                  <input
                    type="text"
                    value={journeyForm.seo_title || ''}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, seo_title: e.target.value }))}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Descrição SEO</label>
                  <textarea
                    value={journeyForm.seo_description || ''}
                    onChange={(e) => setJourneyForm(prev => ({ ...prev, seo_description: e.target.value }))}
                    rows={2}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Ações do Form */}
          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button
              type="button"
              onClick={() => setViewMode('list_journeys')}
              className="px-5 py-2.5 border border-brand-border text-brand-text hover:bg-brand-bg rounded-xl transition-colors text-sm font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-brand-primary text-white hover:bg-brand-primary-hover rounded-xl transition-colors text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Salvar Configurações'}
            </button>
          </div>
        </form>
      )}

      {/* --- LISTAGEM DE CONTEÚDOS (DIAS DA CAMPANHA) --- */}
      {viewMode === 'list_contents' && (
        <div className="space-y-4">
          {/* Resumo da Jornada */}
          <div className="bg-brand-primary/5 border border-brand-primary/10 p-5 rounded-2xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
            <div>
              <span className="text-[10px] font-bold text-brand-secondary uppercase tracking-wider block">Jornada Mapeada</span>
              <h3 className="text-lg font-bold text-brand-primary">{selectedJourney?.title}</h3>
              <p className="text-xs text-brand-text-muted mt-0.5">{selectedJourney?.subtitle}</p>
            </div>
            <div className="flex gap-4 text-xs font-semibold text-brand-text">
              <div className="bg-white border border-brand-border px-3 py-1.5 rounded-lg text-center">
                <span className="block text-[10px] text-brand-text-muted">Total de Dias</span>
                <span className="text-sm font-bold text-brand-primary">{contents.length} / {selectedJourney?.total_days}</span>
              </div>
              <div className="bg-white border border-brand-border px-3 py-1.5 rounded-lg text-center">
                <span className="block text-[10px] text-brand-text-muted">Publicados</span>
                <span className="text-sm font-bold text-green-700">{contents.filter(c => c.publication_status === 'published').length}</span>
              </div>
              <div className="bg-white border border-brand-border px-3 py-1.5 rounded-lg text-center">
                <span className="block text-[10px] text-brand-text-muted">Agendados</span>
                <span className="text-sm font-bold text-amber-700">{contents.filter(c => c.publication_status === 'scheduled').length}</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-brand-border rounded-2xl shadow-sm overflow-hidden">
            {loadingContents ? (
              <div className="flex flex-col items-center justify-center py-20">
                <RefreshCw className="w-10 h-10 animate-spin text-brand-primary" />
                <p className="text-sm text-brand-text-muted mt-2">Carregando cronograma...</p>
              </div>
            ) : contents.length === 0 ? (
              <div className="text-center py-20">
                <FileText className="w-12 h-12 text-brand-border mx-auto mb-2" />
                <h3 className="font-semibold text-brand-text">Sem conteúdos criados</h3>
                <p className="text-xs text-brand-text-muted mt-1">Crie as publicações para cada dia da jornada de 15 dias.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-brand-border bg-brand-bg text-[10px] font-bold text-brand-text-muted uppercase tracking-wider">
                      <th className="px-6 py-4 text-center">Dia</th>
                      <th className="px-6 py-4">Título / Slug</th>
                      <th className="px-6 py-4">Status</th>
                      <th className="px-6 py-4">Agendamento</th>
                      <th className="px-6 py-4">Formato</th>
                      <th className="px-6 py-4">CTA</th>
                      <th className="px-6 py-4 text-right">Reordenar</th>
                      <th className="px-6 py-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-brand-border">
                    {contents.map((item, index) => (
                      <tr key={item.id} className="hover:bg-brand-bg/40 transition-colors">
                        <td className="px-6 py-4 text-center font-bold text-brand-primary text-sm">
                          Dia {String(item.day_number).padStart(2, '0')}
                        </td>
                        <td className="px-6 py-4 space-y-0.5">
                          <span className="font-bold text-brand-text text-sm block">{item.title}</span>
                          <span className="text-[10px] text-brand-text-muted font-mono block">/{item.slug}</span>
                        </td>
                        <td className="px-6 py-4">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                            item.publication_status === 'published' ? 'bg-green-50 text-green-700' :
                            item.publication_status === 'scheduled' ? 'bg-amber-50 text-amber-700' :
                            item.publication_status === 'draft' ? 'bg-gray-50 text-gray-500' :
                            'bg-red-50 text-red-700'
                          }`}>
                            {item.publication_status === 'published' ? 'Publicado' :
                             item.publication_status === 'scheduled' ? 'Agendado' :
                             item.publication_status === 'draft' ? 'Rascunho' : 'Arquivado'}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-brand-text-muted">
                          {item.publication_status === 'scheduled' ? (
                            <div className="flex flex-col gap-0.5">
                              <span className="flex items-center gap-1 font-semibold text-amber-700">
                                <Calendar size={12} /> {item.publication_date}
                              </span>
                              <span className="flex items-center gap-1">
                                <Clock size={12} /> {item.publication_time?.slice(0, 5)} (SP)
                              </span>
                            </div>
                          ) : item.published_at ? (
                            <span className="text-[10px] block">Publicado em: {new Date(item.published_at).toLocaleDateString()} às {new Date(item.published_at).toLocaleTimeString().slice(0,5)}</span>
                          ) : (
                            <span className="text-gray-400 font-normal">Sem agendamento</span>
                          )}
                        </td>
                        <td className="px-6 py-4 uppercase font-semibold text-[10px] text-brand-text-muted">
                          {item.content_type}
                        </td>
                        <td className="px-6 py-4">
                          {item.cta_text ? (
                            <span className="px-2 py-0.5 bg-brand-primary/10 text-brand-primary rounded font-bold block w-fit">
                              {item.cta_text}
                            </span>
                          ) : (
                            <span className="text-gray-400">Nenhum</span>
                          )}
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              disabled={index === 0}
                              onClick={() => handleSwapDays(item, 'up')}
                              className="p-1 border border-brand-border rounded hover:bg-brand-bg text-brand-text disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                            >
                              <MoveUp size={12} />
                            </button>
                            <button
                              disabled={index === contents.length - 1}
                              onClick={() => handleSwapDays(item, 'down')}
                              className="p-1 border border-brand-border rounded hover:bg-brand-bg text-brand-text disabled:opacity-40 disabled:hover:bg-transparent cursor-pointer"
                            >
                              <MoveDown size={12} />
                            </button>
                          </div>
                        </td>
                        <td className="px-6 py-4 text-right">
                          <div className="flex justify-end gap-1">
                            <button
                              onClick={() => handleEditContent(item)}
                              title="Editar conteúdo"
                              className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-brand-text transition-colors cursor-pointer"
                            >
                              <Edit size={14} />
                            </button>
                            {item.publication_status === 'published' ? (
                              <button
                                onClick={() => handleDepublish(item)}
                                title="Voltar para Rascunho"
                                className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-amber-600 transition-colors cursor-pointer"
                              >
                                <X size={14} />
                              </button>
                            ) : (
                              <button
                                onClick={() => handlePublishImmediately(item)}
                                title="Publicar Imediatamente"
                                className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-green-700 transition-colors cursor-pointer"
                              >
                                <CheckCircle2 size={14} />
                              </button>
                            )}
                            <button
                              onClick={() => handleDuplicateContent(item)}
                              title="Duplicar"
                              className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-blue-600 transition-colors cursor-pointer"
                            >
                              <Copy size={14} />
                            </button>
                            <button
                              onClick={() => handleArchiveContent(item)}
                              title="Arquivar"
                              className="p-2 border border-brand-border hover:bg-brand-bg rounded-xl text-red-600 transition-colors cursor-pointer"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- FORMULÁRIO DE CONTEÚDO DO DIA --- */}
      {viewMode === 'edit_content' && (
        <form onSubmit={handleSaveContent} className="bg-white border border-brand-border rounded-2xl shadow-sm p-6 space-y-6">
          <div className="flex justify-between items-center border-b border-brand-border pb-3">
            <h3 className="text-base font-bold text-brand-primary">
              {selectedContent ? `Editar Conteúdo - Dia ${contentForm.day_number}` : `Adicionar Conteúdo - Dia ${contentForm.day_number}`}
            </h3>
            <span className="text-xs bg-brand-bg px-3 py-1 rounded-xl text-brand-text font-mono">
              Jornada: {selectedJourney?.title}
            </span>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Esquerda: Identificação e Markdown */}
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Dia Número *</label>
                  <input
                    type="number"
                    required
                    min={1}
                    max={selectedJourney?.total_days || 15}
                    value={contentForm.day_number || 1}
                    onChange={(e) => setContentForm(prev => ({ ...prev, day_number: Number(e.target.value) }))}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-bold text-brand-text mb-1">Título do Dia *</label>
                  <input
                    type="text"
                    required
                    value={contentForm.title || ''}
                    onChange={handleContentTitleChange}
                    placeholder="Ex: Boas-vindas à Jornada"
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Slug do Dia *</label>
                  <input
                    type="text"
                    required
                    value={contentForm.slug || ''}
                    onChange={(e) => setContentForm(prev => ({ ...prev, slug: generateSlug(e.target.value) }))}
                    placeholder="Ex: boas-vindas"
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Formato do Conteúdo</label>
                  <select
                    value={contentForm.content_type || 'text'}
                    onChange={(e) => setContentForm(prev => ({ ...prev, content_type: e.target.value as any }))}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 bg-white focus:outline-none focus:border-brand-primary"
                  >
                    <option value="text">Texto Apenas</option>
                    <option value="image">Imagem</option>
                    <option value="video">Vídeo</option>
                    <option value="mixed">Misto (Texto + Mídia)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Descrição Curta (Timeline)</label>
                <input
                  type="text"
                  value={contentForm.short_description || ''}
                  onChange={(e) => setContentForm(prev => ({ ...prev, short_description: e.target.value }))}
                  placeholder="Breve resumo sobre o conteúdo do dia..."
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-text mb-1">Conteúdo Principal (Markdown)</label>
                <textarea
                  value={contentForm.content || ''}
                  onChange={(e) => setContentForm(prev => ({ ...prev, content: e.target.value }))}
                  placeholder="Escreva o texto completo do dia usando Markdown para títulos, negrito, listas..."
                  rows={12}
                  className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary font-mono"
                />
              </div>

              {/* Preview de Markdown */}
              <div>
                <label className="block text-xs font-bold text-brand-secondary mb-1 flex items-center gap-1">
                  <Eye size={12} />
                  Pré-visualização do Conteúdo Formatado
                </label>
                <div 
                  className="p-4 border border-dashed border-brand-border rounded-xl bg-brand-bg text-xs prose max-w-none max-h-60 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: markdownPreview || '<span class="text-gray-400">Nenhum conteúdo escrito para visualizar...</span>' }}
                />
              </div>
            </div>

            {/* Direita: WhatsApp, CTAs, Mídia e Publicação */}
            <div className="space-y-6">
              {/* WhatsApp Message */}
              <div className="bg-brand-primary/5 p-4 rounded-xl border border-brand-primary/10 space-y-3">
                <h4 className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
                  <MessageSquare size={14} className="text-brand-secondary" />
                  Envio para o WhatsApp do Grupo
                </h4>
                <div>
                  <textarea
                    value={contentForm.whatsapp_message || ''}
                    onChange={(e) => setContentForm(prev => ({ ...prev, whatsapp_message: e.target.value }))}
                    placeholder="Mensagem completa formatada para colar no WhatsApp..."
                    rows={6}
                    className="w-full text-xs border border-brand-border bg-white rounded-xl p-3 focus:outline-none focus:border-brand-primary font-mono"
                  />
                  {contentForm.whatsapp_message && (
                    <button
                      type="button"
                      onClick={() => handleCopyToClipboard(contentForm.whatsapp_message || '', 'whatsapp')}
                      className="mt-1 flex items-center gap-1 px-3 py-1 border border-brand-border hover:bg-brand-bg rounded-lg text-[10px] font-bold text-brand-text cursor-pointer"
                    >
                      {copiedId === 'whatsapp' ? <Check size={10} className="text-green-600" /> : <Copy size={10} />}
                      {copiedId === 'whatsapp' ? 'Copiado!' : 'Copiar Mensagem'}
                    </button>
                  )}
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-brand-text-muted mb-1">Prompt de Imagem (usado para gerar imagens em IA)</label>
                  <textarea
                    value={contentForm.image_prompt || ''}
                    onChange={(e) => setContentForm(prev => ({ ...prev, image_prompt: e.target.value }))}
                    placeholder="Prompt detalhado (Midjourney, DALL-E, etc.)..."
                    rows={2}
                    className="w-full text-xs border border-brand-border bg-white rounded-xl p-3 focus:outline-none focus:border-brand-primary font-mono"
                  />
                  {contentForm.image_prompt && (
                    <button
                      type="button"
                      onClick={() => handleCopyToClipboard(contentForm.image_prompt || '', 'prompt')}
                      className="mt-1 flex items-center gap-1 px-3 py-1 border border-brand-border hover:bg-brand-bg rounded-lg text-[10px] font-bold text-brand-text cursor-pointer"
                    >
                      {copiedId === 'prompt' ? <Check size={10} className="text-green-600" /> : <Copy size={10} />}
                      {copiedId === 'prompt' ? 'Copiado!' : 'Copiar Prompt'}
                    </button>
                  )}
                </div>
              </div>

              {/* Mídia e CTAs */}
              <div className="space-y-4 border border-brand-border p-4 rounded-xl">
                <h4 className="text-xs font-bold text-brand-secondary flex items-center gap-1.5">
                  <ImageIcon size={14} /> Mídia Opcional
                </h4>
                
                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Imagem Principal</label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={contentForm.image_url || ''}
                      onChange={(e) => setContentForm(prev => ({ ...prev, image_url: e.target.value }))}
                      placeholder="URL da Imagem..."
                      className="flex-1 text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                    />
                    <input
                      type="file"
                      ref={fileInputRef}
                      onChange={(e) => handleImageUpload(e, 'content')}
                      className="hidden"
                      accept="image/png, image/jpeg, image/jpg, image/webp"
                    />
                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => fileInputRef.current?.click()}
                      className="px-4 py-2 border border-brand-border hover:bg-brand-bg rounded-xl transition-colors flex items-center gap-1.5 text-xs font-bold text-brand-text cursor-pointer"
                    >
                      <Upload size={14} />
                      {uploadingImage ? 'Enviando...' : 'Upload'}
                    </button>
                  </div>
                  {contentForm.image_url && (
                    <img
                      src={contentForm.image_url}
                      alt="Preview"
                      className="mt-2 h-20 w-auto rounded-xl object-contain border border-brand-border"
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Texto Alternativo (Acessibilidade e SEO)</label>
                  <input
                    type="text"
                    value={contentForm.image_alt || ''}
                    onChange={(e) => setContentForm(prev => ({ ...prev, image_alt: e.target.value }))}
                    placeholder="Descrição da imagem para leitores de tela..."
                    className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text mb-1">Vídeo URL (YouTube/Vimeo)</label>
                    <input
                      type="url"
                      value={contentForm.video_url || ''}
                      onChange={(e) => setContentForm(prev => ({ ...prev, video_url: e.target.value }))}
                      placeholder="https://..."
                      className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text mb-1">URL Incorporar Vídeo (Embed)</label>
                    <input
                      type="url"
                      value={contentForm.video_embed_url || ''}
                      onChange={(e) => setContentForm(prev => ({ ...prev, video_embed_url: e.target.value }))}
                      placeholder="https://youtube.com/embed/..."
                      className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Botões de Ação (CTA) */}
              <div className="space-y-4 border border-brand-border p-4 rounded-xl">
                <h4 className="text-xs font-bold text-brand-secondary flex items-center gap-1.5">
                  <ExternalLink size={14} /> Links e Chamadas para Ação (CTA)
                </h4>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text mb-1">Texto CTA Principal</label>
                    <input
                      type="text"
                      value={contentForm.cta_text || ''}
                      onChange={(e) => setContentForm(prev => ({ ...prev, cta_text: e.target.value }))}
                      placeholder="Ex: Começar Teste Grátis"
                      className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text mb-1">URL CTA Principal</label>
                    <input
                      type="text"
                      value={contentForm.cta_url || ''}
                      onChange={(e) => setContentForm(prev => ({ ...prev, cta_url: e.target.value }))}
                      placeholder="Se vazio, usa URL da jornada"
                      className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-bold text-brand-text mb-1">Texto CTA Secundário</label>
                    <input
                      type="text"
                      value={contentForm.secondary_cta_text || ''}
                      onChange={(e) => setContentForm(prev => ({ ...prev, secondary_cta_text: e.target.value }))}
                      placeholder="Ex: Tirar Dúvidas no WhatsApp"
                      className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-brand-text mb-1">URL CTA Secundário</label>
                    <input
                      type="text"
                      value={contentForm.secondary_cta_url || ''}
                      onChange={(e) => setContentForm(prev => ({ ...prev, secondary_cta_url: e.target.value }))}
                      placeholder="Se vazio, usa URL de suporte da jornada"
                      className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                    />
                  </div>
                </div>
              </div>

              {/* Publicação e Configuração de Agenda */}
              <div className="space-y-4 border border-brand-border p-4 rounded-xl bg-amber-50/20">
                <h4 className="text-xs font-bold text-brand-primary flex items-center gap-1.5">
                  <Calendar size={14} className="text-brand-secondary" /> Status & Agendamento
                </h4>

                <div>
                  <label className="block text-xs font-bold text-brand-text mb-1">Status de Publicação</label>
                  <select
                    value={contentForm.publication_status || 'draft'}
                    onChange={(e) => setContentForm(prev => ({ ...prev, publication_status: e.target.value as any }))}
                    className="w-full text-xs border border-brand-border rounded-xl p-3 bg-white focus:outline-none focus:border-brand-primary"
                  >
                    <option value="draft">Rascunho (Privado)</option>
                    <option value="scheduled">Agendado (Programar Data/Hora)</option>
                    <option value="published">Publicado (Público Imediato)</option>
                    <option value="archived">Arquivado</option>
                  </select>
                </div>

                {contentForm.publication_status === 'scheduled' && (
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text mb-1">Data Agendada (Brasília)</label>
                      <input
                        type="date"
                        required
                        value={contentForm.publication_date || ''}
                        onChange={(e) => setContentForm(prev => ({ ...prev, publication_date: e.target.value }))}
                        className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-brand-text mb-1">Hora Agendada (Brasília)</label>
                      <input
                        type="time"
                        required
                        value={contentForm.publication_time || '08:00'}
                        onChange={(e) => setContentForm(prev => ({ ...prev, publication_time: e.target.value }))}
                        className="w-full text-xs border border-brand-border rounded-xl p-3 focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  </div>
                )}

                <div className="flex flex-col gap-2 pt-2 border-t border-brand-border">
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_featured"
                      checked={contentForm.is_featured || false}
                      onChange={(e) => setContentForm(prev => ({ ...prev, is_featured: e.target.checked }))}
                      className="rounded text-brand-primary"
                    />
                    <label htmlFor="is_featured" className="text-xs font-semibold text-brand-text">
                      Destacar este conteúdo
                    </label>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="allow_indexing"
                      checked={contentForm.allow_indexing !== false}
                      onChange={(e) => setContentForm(prev => ({ ...prev, allow_indexing: e.target.checked }))}
                      className="rounded text-brand-primary"
                    />
                    <label htmlFor="allow_indexing" className="text-xs font-semibold text-brand-text">
                      Permitir indexação em mecanismos de busca (SEO)
                    </label>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Ações do Form de Conteúdo */}
          <div className="flex justify-end gap-3 border-t border-brand-border pt-4">
            <button
              type="button"
              onClick={() => setViewMode('list_contents')}
              className="px-5 py-2.5 border border-brand-border text-brand-text hover:bg-brand-bg rounded-xl transition-colors text-sm font-semibold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 bg-brand-primary text-white hover:bg-brand-primary-hover rounded-xl transition-colors text-sm font-semibold flex items-center gap-2 cursor-pointer"
            >
              {saving ? 'Salvando...' : 'Salvar Conteúdo'}
            </button>
          </div>
        </form>
      )}

      {/* --- MENSAGEM FIXADA WHATSAPP --- */}
      {viewMode === 'whatsapp_fixed' && (
        <div className="bg-white border border-brand-border rounded-2xl shadow-sm p-6 space-y-6 max-w-xl mx-auto">
          <div className="border-b border-brand-border pb-3 flex justify-between items-center">
            <h3 className="text-base font-bold text-brand-primary flex items-center gap-1.5">
              <MessageSquare size={16} className="text-green-600" />
              Mensagem Fixada do WhatsApp
            </h3>
            <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded font-bold">WhatsApp Copie</span>
          </div>

          <p className="text-xs text-brand-text-muted">
            Essa mensagem de boas-vindas deve ser fixada no topo do grupo do WhatsApp para direcionar novos membros à central de conteúdos.
          </p>

          <div className="bg-brand-bg border border-brand-border p-4 rounded-xl font-mono text-xs whitespace-pre-wrap text-brand-text select-all">
            {getWhatsappFixedMessage()}
          </div>

          <div className="flex justify-end gap-3">
            <button
              onClick={() => setViewMode('list_contents')}
              className="px-4 py-2 border border-brand-border text-brand-text hover:bg-brand-bg rounded-xl transition-colors text-xs font-semibold cursor-pointer"
            >
              Voltar ao Cronograma
            </button>
            <button
              onClick={() => handleCopyToClipboard(getWhatsappFixedMessage(), 'fixed_whatsapp')}
              className="px-4 py-2 bg-green-700 hover:bg-green-800 text-white rounded-xl transition-colors text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
            >
              {copiedId === 'fixed_whatsapp' ? <Check size={14} /> : <Copy size={14} />}
              {copiedId === 'fixed_whatsapp' ? 'Copiado!' : 'Copiar Mensagem para WhatsApp'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
