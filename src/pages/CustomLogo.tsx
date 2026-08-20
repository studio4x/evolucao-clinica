import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Crop, FileText, Image, Loader2, Lock, Move, Shield, Trash2, Upload } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { showAlert } from '../store/modalStore';
import { hasActiveYearlyAccess } from '../utils/subscriptionAccess';
import { getDocumentLogoPreviewStyle, normalizeCustomLogoSettings } from '../utils/documentLogo';

export default function CustomLogo() {
  const navigate = useNavigate();
  const { user, profileRole, subscriptionPlan, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  const [customLogoUrl, setCustomLogoUrl] = useState('');
  const [logoScale, setLogoScale] = useState(100);
  const [showCropEditor, setShowCropEditor] = useState(false);
  const [cropAspect, setCropAspect] = useState(3);
  const [cropZoom, setCropZoom] = useState(1);
  const [cropPosition, setCropPosition] = useState({ x: 0, y: 0 });
  const cropDragStart = useRef<{ x: number; y: number; pointerX: number; pointerY: number } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<'prontuario' | 'report' | 'pdi'>('prontuario');
  const [dbSubscriptionPlan, setDbSubscriptionPlan] = useState<'trial' | 'monthly' | 'yearly' | 'courtesy' | 'none' | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const isYearly = hasActiveYearlyAccess({
    profileRole,
    subscriptionPlan: dbSubscriptionPlan ?? subscriptionPlan,
    subscriptionStatus,
    subscriptionEndsAt
  });
  const previewTitle = previewDocument === 'prontuario'
    ? 'Prontuário de Evoluções Clínicas (Plataforma)'
    : previewDocument === 'report'
      ? 'Relatório de Evolução Clínico'
      : 'Plano de Desenvolvimento Individual (PDI)';
  const previewPeriodLabel = previewDocument === 'pdi' ? 'Período de Análise: Julho/2026' : 'Data: 31/07/2026';
  const cropAspectLabel = cropAspect === 3 ? '3:1' : cropAspect === 2 ? '2:1' : cropAspect === 1 ? '1:1' : '16:9';

  useEffect(() => {
    const loadLogoSettings = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('professionals')
          .select('custom_logo_url, custom_logo_settings, subscription_plan')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setCustomLogoUrl(data?.custom_logo_url || '');
        setLogoScale(normalizeCustomLogoSettings(data?.custom_logo_settings).scale);
        setDbSubscriptionPlan(data?.subscription_plan || null);
      } catch (error) {
        console.error('[CustomLogo] Erro ao carregar configurações:', error);
      } finally {
        setLoading(false);
      }
    };

    void loadLogoSettings();
  }, [user]);

  const showSuccess = (message: string) => {
    setSuccessMessage(message);
    window.setTimeout(() => setSuccessMessage(''), 4000);
  };

  const handleLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !user) return;

    if (!isYearly) {
      await showAlert('A personalização do logotipo é uma funcionalidade exclusiva do Plano Anual.', {
        title: 'Funcionalidade Premium',
        variant: 'warning',
        icon: 'warning'
      });
      return;
    }

    const allowedTypes = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      await showAlert('Por favor, envie uma imagem nos formatos PNG, JPG ou WEBP.', {
        title: 'Formato Inválido',
        variant: 'warning',
        icon: 'warning'
      });
      return;
    }

    if (file.size > 2 * 1024 * 1024) {
      await showAlert('A imagem deve ter no máximo 2MB.', {
        title: 'Arquivo Muito Grande',
        variant: 'warning',
        icon: 'warning'
      });
      return;
    }

    try {
      setUploadingLogo(true);
      const fileExt = file.name.split('.').pop() || 'png';
      const filePath = `custom_logos/${user.id}/${Date.now()}.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from('brand')
        .upload(filePath, file, { cacheControl: '3600', upsert: true });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('brand').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;
      const { error: dbError } = await supabase
        .from('professionals')
        .update({ custom_logo_url: publicUrl, custom_logo_settings: { scale: 100 }, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (dbError) throw dbError;
      setCustomLogoUrl(publicUrl);
      setLogoScale(100);
      showSuccess('Logotipo personalizado atualizado com sucesso!');
    } catch (error: any) {
      console.error('[CustomLogo] Erro ao fazer upload:', error);
      await showAlert(`Erro ao fazer upload: ${error.message || error}`, {
        title: 'Erro de Upload',
        variant: 'danger',
        icon: 'warning'
      });
    } finally {
      setUploadingLogo(false);
      event.target.value = '';
    }
  };

  const handleRemoveLogo = async () => {
    if (!user) return;

    try {
      setUploadingLogo(true);
      const { error } = await supabase
        .from('professionals')
        .update({ custom_logo_url: null, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;
      setCustomLogoUrl('');
      showSuccess('Logotipo personalizado removido com sucesso!');
    } catch (error: any) {
      console.error('[CustomLogo] Erro ao remover logotipo:', error);
      await showAlert(`Erro ao remover logotipo: ${error.message || error}`, {
        title: 'Erro ao Remover',
        variant: 'danger',
        icon: 'warning'
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSaveLogoScale = async () => {
    if (!user || !customLogoUrl) return;

    try {
      setUploadingLogo(true);
      const settings = { scale: logoScale };
      const { error } = await supabase
        .from('professionals')
        .update({ custom_logo_settings: settings, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (error) throw error;
      showSuccess('Ajuste do logotipo salvo para os documentos!');
    } catch (error: any) {
      console.error('[CustomLogo] Erro ao salvar ajuste:', error);
      await showAlert(`Erro ao salvar ajuste: ${error.message || error}`, {
        title: 'Erro ao Salvar',
        variant: 'danger',
        icon: 'warning'
      });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleCropDragStart = (event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    cropDragStart.current = { x: cropPosition.x, y: cropPosition.y, pointerX: event.clientX, pointerY: event.clientY };
  };

  const handleCropDragMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const start = cropDragStart.current;
    if (!start) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    setCropPosition({
      x: Math.max(-1, Math.min(1, start.x + ((event.clientX - start.pointerX) / bounds.width) * 2)),
      y: Math.max(-1, Math.min(1, start.y + ((event.clientY - start.pointerY) / bounds.height) * 2))
    });
  };

  const handleCropDragEnd = () => {
    cropDragStart.current = null;
  };

  const createCroppedLogoBlob = async () => new Promise<Blob>((resolve, reject) => {
    const image = new window.Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      const imageAspect = image.naturalWidth / image.naturalHeight;
      const baseWidth = imageAspect > cropAspect ? image.naturalHeight * cropAspect : image.naturalWidth;
      const baseHeight = imageAspect > cropAspect ? image.naturalHeight : image.naturalWidth / cropAspect;
      const sourceWidth = baseWidth / cropZoom;
      const sourceHeight = baseHeight / cropZoom;
      const sourceX = (image.naturalWidth - sourceWidth) / 2 + cropPosition.x * ((image.naturalWidth - sourceWidth) / 2);
      const sourceY = (image.naturalHeight - sourceHeight) / 2 + cropPosition.y * ((image.naturalHeight - sourceHeight) / 2);
      const canvas = document.createElement('canvas');
      canvas.width = 1800;
      canvas.height = Math.round(canvas.width / cropAspect);
      const context = canvas.getContext('2d');
      if (!context) {
        reject(new Error('Não foi possível preparar o editor de imagem.'));
        return;
      }
      context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Não foi possível gerar o recorte do logotipo.')), 'image/png');
    };
    image.onerror = () => reject(new Error('Não foi possível carregar esta imagem para recorte.'));
    image.src = customLogoUrl;
  });

  const handleApplyCrop = async () => {
    if (!user || !customLogoUrl) return;
    try {
      setUploadingLogo(true);
      const croppedBlob = await createCroppedLogoBlob();
      const filePath = `custom_logos/${user.id}/${Date.now()}-cropped.png`;
      const { error: uploadError } = await supabase.storage.from('brand').upload(filePath, croppedBlob, { cacheControl: '3600', contentType: 'image/png', upsert: true });
      if (uploadError) throw uploadError;
      const { data: publicUrlData } = supabase.storage.from('brand').getPublicUrl(filePath);
      const publicUrl = publicUrlData.publicUrl;
      const { error: dbError } = await supabase
        .from('professionals')
        .update({ custom_logo_url: publicUrl, custom_logo_settings: { scale: logoScale }, updated_at: new Date().toISOString() })
        .eq('id', user.id);
      if (dbError) throw dbError;
      setCustomLogoUrl(publicUrl);
      setShowCropEditor(false);
      setCropZoom(1);
      setCropPosition({ x: 0, y: 0 });
      showSuccess('Recorte aplicado ao logotipo com sucesso!');
    } catch (error: any) {
      console.error('[CustomLogo] Erro ao aplicar recorte:', error);
      await showAlert(`Erro ao aplicar o recorte: ${error.message || error}`, { title: 'Erro no Recorte', variant: 'danger', icon: 'warning' });
    } finally {
      setUploadingLogo(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[300px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-brand-primary" />
        <span className="ml-2 text-sm text-brand-text-muted">Carregando logotipo personalizado...</span>
      </div>
    );
  }

  return (
    <div className="w-full space-y-6 pb-12">
      <div>
        <div>
          <h1 className="flex items-center text-3xl font-display font-bold text-brand-text">
            <Image className="mr-3 shrink-0 text-brand-primary" size={32} />
            <span>Logotipo Personalizado</span>
          </h1>
          <p className="mt-1 text-sm text-brand-text-muted">
            Personalize o timbre dos seus relatórios, PDIs e evoluções clínicas.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center space-x-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3.5 text-sm text-emerald-700 animate-fadeIn">
          <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {!isYearly ? (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
          <section className="card space-y-6 rounded-3xl border border-brand-border bg-white p-8 lg:col-span-3">
            <h2 className="flex items-center gap-2 text-xl font-bold text-brand-text">
              <Shield className="text-brand-primary" size={24} />
              <span>Como funciona o Logotipo Personalizado?</span>
            </h2>

            <div className="space-y-4">
              {[
                ['1', 'Você envia a sua marca', 'Escolha o logotipo profissional ou da clínica nos formatos PNG, JPG ou WEBP.'],
                ['2', 'A plataforma aplica o seu timbre', 'A sua identidade passa a aparecer no cabeçalho dos documentos clínicos.'],
                ['3', 'Documentos prontos para compartilhar', 'Relatórios, PDIs e evoluções em PDF ou impressos ficam com a sua marca.']
              ].map(([number, title, description]) => (
                <div key={number} className="flex items-start space-x-3">
                  <div className="mt-0.5 rounded-lg bg-brand-bg p-2 font-bold text-brand-primary">{number}</div>
                  <div>
                    <h3 className="text-sm font-semibold text-brand-text">{title}</h3>
                    <p className="mt-0.5 text-xs text-brand-text-muted">{description}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-brand-border/60 pt-4">
              <div className="flex items-start gap-3 rounded-2xl bg-sky-50 p-4 text-xs text-sky-800">
                <Shield className="mt-0.5 shrink-0 text-sky-600" size={16} />
                <div><span className="mb-0.5 block font-bold">Sua identidade profissional:</span>Use uma apresentação visual consistente em todos os documentos entregues aos pacientes e responsáveis.</div>
              </div>
            </div>
          </section>

          <aside className="card relative flex flex-col justify-between overflow-hidden rounded-3xl border border-amber-500/20 bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-white p-8 text-center shadow-sm lg:col-span-2">
            <div className="pointer-events-none absolute right-0 top-0 h-32 w-32 rounded-full bg-gradient-to-br from-amber-400/15 to-transparent blur-3xl" />
            <div className="relative z-10 space-y-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-500 to-orange-500 text-white shadow-lg shadow-amber-500/20"><Lock size={32} /></div>
              <div className="space-y-2"><h2 className="text-lg font-bold text-amber-950">Disponível no Plano Anual</h2><p className="text-xs leading-relaxed text-amber-800/80">Personalize os documentos clínicos com a identidade visual do seu consultório.</p></div>
              <div className="space-y-2.5 rounded-2xl border border-amber-200/50 bg-amber-50 p-4 text-left">
                {['Timbre exclusivo em documentos', 'Sua marca em PDFs e impressões', 'Identidade visual da sua clínica'].map((benefit) => <div key={benefit} className="flex items-center gap-2 text-xs font-semibold text-amber-900"><CheckCircle size={14} className="shrink-0 text-amber-600" />{benefit}</div>)}
              </div>
            </div>
            <div className="relative z-10 pt-8"><button type="button" onClick={() => navigate('/painel/subscription')} className="flex w-full cursor-pointer items-center justify-center space-x-2 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 px-6 py-3.5 font-bold text-white shadow-md shadow-orange-500/10 transition-all hover:from-amber-600 hover:to-orange-600"><span>Fazer Upgrade Agora</span><ArrowRight size={16} /></button><p className="mt-2 text-[10px] text-amber-800/60">Mude para o Plano Anual e economize 57% em relação a 12 mensalidades</p></div>
          </aside>
        </div>
      ) : (
        <>
          <div className="card space-y-5 border border-brand-border/60 bg-white p-6 shadow-sm md:p-8">
          <p className="text-xs leading-relaxed text-brand-text-muted">
            Envie uma imagem com o seu logotipo profissional ou da sua clínica. Formatos aceitos: PNG, JPG ou WEBP (máx. 2MB). Este logotipo substituirá a marca padrão da plataforma no cabeçalho das evoluções e relatórios clínicos impressos e em PDF.
          </p>

          <div className="flex flex-col items-center gap-5 sm:flex-row">
            {customLogoUrl ? (
              <div className="group relative flex h-32 w-32 items-center justify-center overflow-hidden rounded-2xl border border-brand-border bg-stone-50 p-2">
                <img src={customLogoUrl} alt="Logo Timbre" className="max-h-full max-w-full object-contain" />
                <div className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100">
                  <button type="button" onClick={handleRemoveLogo} disabled={uploadingLogo} className="cursor-pointer rounded-lg bg-red-600 p-1.5 text-white transition-colors hover:bg-red-700" title="Remover Logotipo">
                    <Trash2 size={16} />
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex h-32 w-32 flex-col items-center justify-center rounded-2xl border border-dashed border-stone-300 bg-stone-50 p-2 text-stone-400">
                <Image size={24} className="mb-1 text-stone-300" />
                <span className="text-center text-[10px] font-medium">Sem logotipo</span>
              </div>
            )}

            <div className="flex-1 space-y-3">
              <div className="flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl bg-brand-primary px-4 py-2.5 text-xs font-semibold text-white shadow-md shadow-brand-primary/10 transition-colors hover:bg-brand-primary/95 active:scale-95">
                  {uploadingLogo ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  <span>{uploadingLogo ? 'Carregando...' : 'Enviar Logotipo'}</span>
                  <input type="file" accept="image/png, image/jpeg, image/jpg, image/webp" onChange={handleLogoUpload} disabled={uploadingLogo} className="hidden" />
                </label>
                {customLogoUrl && (
                  <>
                    <button type="button" onClick={() => setShowCropEditor((visible) => !visible)} disabled={uploadingLogo} className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-brand-primary/20 bg-brand-primary/5 px-4 py-2.5 text-xs font-semibold text-brand-primary transition-colors hover:bg-brand-primary/10 disabled:opacity-60">
                      <Crop size={14} /> Ajustar corte
                    </button>
                    <button type="button" onClick={handleRemoveLogo} disabled={uploadingLogo} className="cursor-pointer rounded-xl border border-red-200 bg-red-50/50 px-4 py-2.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100/70 disabled:opacity-60">
                      Remover
                    </button>
                  </>
                )}
              </div>
              <p className="text-[10px] text-brand-text-muted">
                Para melhor visualização no cabeçalho dos documentos, recomendamos imagens horizontais com fundo transparente ou branco.
              </p>
            </div>
          </div>

          {customLogoUrl && (
            <>
            {showCropEditor && (
              <div className="rounded-2xl border border-brand-primary/20 bg-brand-primary/5 p-4 sm:p-5">
                <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                  <div><h3 className="flex items-center gap-2 text-sm font-semibold text-brand-primary"><Crop size={17} /> Enquadramento do logotipo</h3><p className="mt-1 text-[10px] text-brand-text-muted">Arraste a imagem para definir a posição do corte. O arquivo final será salvo em PNG, pronto para o cabeçalho.</p></div>
                  <span className="text-[10px] font-bold uppercase tracking-wide text-brand-primary">Proporção {cropAspectLabel}</span>
                </div>
                <div
                  className="relative mx-auto max-w-2xl touch-none overflow-hidden rounded-xl border-2 border-dashed border-brand-primary/40 bg-stone-100 shadow-inner cursor-grab active:cursor-grabbing"
                  style={{ aspectRatio: String(cropAspect) }}
                  onPointerDown={handleCropDragStart}
                  onPointerMove={handleCropDragMove}
                  onPointerUp={handleCropDragEnd}
                  onPointerCancel={handleCropDragEnd}
                >
                  <img src={customLogoUrl} alt="Editor de recorte do logotipo" draggable={false} className="h-full w-full select-none object-cover transition-transform duration-75" style={{ objectPosition: `${50 + cropPosition.x * 50}% ${50 + cropPosition.y * 50}%`, transform: `scale(${cropZoom})` }} />
                  <div className="pointer-events-none absolute inset-0 border-8 border-white/25" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center"><span className="rounded-full bg-black/55 px-3 py-1.5 text-[10px] font-semibold text-white"><Move size={13} className="mr-1 inline" /> Arraste para mover</span></div>
                </div>
                <div className="mt-5 grid gap-4 md:grid-cols-3">
                  <label className="block"><span className="text-[10px] font-bold uppercase tracking-wide text-brand-text-muted">Proporção</span><select value={cropAspect} onChange={(event) => setCropAspect(Number(event.target.value))} className="mt-1.5 w-full rounded-xl border border-brand-border bg-white px-3 py-2 text-xs text-brand-text outline-none focus:border-brand-primary"><option value={3}>Horizontal 3:1</option><option value={2}>Horizontal 2:1</option><option value={16 / 9}>Panorâmico 16:9</option><option value={1}>Quadrado 1:1</option></select></label>
                  <label className="block"><span className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-brand-text-muted"><span>Aproximação</span><span>{Math.round(cropZoom * 100)}%</span></span><input type="range" min="1" max="3" step="0.05" value={cropZoom} onChange={(event) => setCropZoom(Number(event.target.value))} className="mt-3 w-full accent-brand-primary" /></label>
                  <div className="flex items-end gap-2"><button type="button" onClick={() => { setCropZoom(1); setCropPosition({ x: 0, y: 0 }); }} className="rounded-xl border border-brand-border bg-white px-3 py-2 text-xs font-semibold text-brand-text-muted hover:bg-brand-bg">Redefinir</button><button type="button" onClick={handleApplyCrop} disabled={uploadingLogo} className="flex-1 rounded-xl bg-brand-primary px-3 py-2 text-xs font-semibold text-white hover:bg-brand-primary/90 disabled:opacity-60">{uploadingLogo ? 'Aplicando...' : 'Aplicar corte'}</button></div>
                </div>
              </div>
            )}
            <div className="rounded-2xl border border-brand-border/60 bg-brand-bg/40 p-4 sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div className="flex-1">
                  <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-brand-primary">Ajuste no cabeçalho do documento</h3><span className="text-xs font-bold text-brand-primary">{logoScale}%</span></div>
                  <input type="range" min="50" max="100" step="5" value={logoScale} onChange={(event) => setLogoScale(Number(event.target.value))} className="mt-3 w-full accent-brand-primary" aria-label="Tamanho do logotipo nos documentos" />
                  <p className="mt-2 text-[10px] text-brand-text-muted">A área do timbre foi ampliada. Use o recorte para remover margens vazias e este controle para reduzir o tamanho quando necessário. O ajuste é aplicado aos próximos PDFs gerados.</p>
                </div>
                <button type="button" onClick={handleSaveLogoScale} disabled={uploadingLogo} className="inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl border border-brand-primary/20 bg-white px-4 py-2.5 text-xs font-semibold text-brand-primary transition-colors hover:bg-brand-primary/5 disabled:cursor-not-allowed disabled:opacity-60">Salvar ajuste</button>
              </div>
            </div>
            </>
          )}
          </div>

          <section className="card overflow-hidden border border-brand-border/60 bg-white shadow-sm">
            <div className="flex flex-col gap-3 border-b border-brand-border/60 px-6 py-5 sm:flex-row sm:items-center sm:justify-between md:px-8">
              <div>
                <h2 className="flex items-center gap-2 text-lg font-semibold text-brand-primary">
                  <FileText size={20} />
                  Prévia dos seus documentos
                </h2>
                <p className="mt-1 text-xs text-brand-text-muted">Exemplo de como o seu logotipo aparecerá em relatórios, PDIs e evoluções clínicas.</p>
              </div>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {([
                  ['prontuario', 'Prontuário'],
                  ['report', 'Relatório'],
                  ['pdi', 'PDI']
                ] as const).map(([type, label]) => <button key={type} type="button" onClick={() => setPreviewDocument(type)} className={`cursor-pointer rounded-lg px-3 py-1.5 text-[10px] font-bold transition-colors ${previewDocument === type ? 'bg-brand-primary text-white' : 'bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/15'}`}>{label}</button>)}
              </div>
            </div>

            <div className="bg-brand-bg/60 p-5 md:p-8">
              <div className="mx-auto max-w-3xl overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg shadow-brand-primary/10">
                <div className="flex min-h-28 items-center gap-4 px-6 py-5">
                  <div className="flex h-20 w-48 shrink-0 items-center justify-center bg-white p-2">
                    {customLogoUrl ? (
                      <img src={customLogoUrl} alt="Prévia do logotipo nos documentos" className="object-contain" style={getDocumentLogoPreviewStyle({ scale: logoScale })} />
                    ) : (
                      <div className="text-center text-brand-text-muted"><Image size={18} className="mx-auto mb-1 text-brand-accent" /><span className="text-[9px] font-semibold">Seu logotipo</span></div>
                    )}
                  </div>
                  <div className="h-20 w-px shrink-0 bg-stone-300" />
                  <div className="min-w-0"><p className="text-xs font-bold text-brand-text">Plataforma Inteligente de Acompanhamento Terapêutico</p><p className="mt-1 text-[9px] text-brand-text-muted">Emitido por evolucaoclinica.app.br</p></div>
                </div>

                <div className="mx-6 border-t-2 border-brand-primary" />

                <div className="space-y-4 px-6 py-5">
                  <h3 className="text-base font-bold text-brand-primary">{previewTitle}</h3>
                  <div className="grid grid-cols-1 gap-2 border-b border-brand-border/70 pb-3 text-[10px] text-brand-text-muted sm:grid-cols-2"><span>Paciente: Nome do paciente</span><span>Profissional: Nome do profissional</span><span>Registro Profissional: CRP 00/00000</span><span>{previewPeriodLabel}</span></div>
                  <div className="space-y-2">
                    <div className="h-2 w-2/5 rounded-full bg-stone-200" />
                    <div className="h-2 w-full rounded-full bg-stone-100" />
                    <div className="h-2 w-11/12 rounded-full bg-stone-100" />
                    <div className="h-2 w-4/5 rounded-full bg-stone-100" />
                  </div>
                </div>

                <div className="flex items-center justify-between border-t border-brand-border bg-stone-50 px-6 py-3 text-[9px] text-brand-text-muted"><span>Documento gerado pela Evolução Clínica</span><span>Seu logotipo no cabeçalho</span></div>
              </div>
            </div>

            {!customLogoUrl && <p className="border-t border-amber-100 bg-amber-50 px-6 py-3 text-xs text-amber-800">Envie seu logotipo acima para vê-lo aplicado nesta prévia.</p>}
          </section>
        </>
      )}
    </div>
  );
}
