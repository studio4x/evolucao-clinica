import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, CheckCircle, Image, Loader2, Lock, Shield, Trash2, Upload } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { showAlert } from '../store/modalStore';
import { hasActiveYearlyAccess } from '../utils/subscriptionAccess';

export default function CustomLogo() {
  const navigate = useNavigate();
  const { user, profileRole, subscriptionPlan, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  const [customLogoUrl, setCustomLogoUrl] = useState('');
  const [dbSubscriptionPlan, setDbSubscriptionPlan] = useState<'trial' | 'monthly' | 'yearly' | 'none' | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const isYearly = hasActiveYearlyAccess({
    profileRole,
    subscriptionPlan: dbSubscriptionPlan ?? subscriptionPlan,
    subscriptionStatus,
    subscriptionEndsAt
  });

  useEffect(() => {
    const loadLogoSettings = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('professionals')
          .select('custom_logo_url, subscription_plan')
          .eq('id', user.id)
          .single();

        if (error) throw error;
        setCustomLogoUrl(data?.custom_logo_url || '');
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
        .update({ custom_logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', user.id);

      if (dbError) throw dbError;
      setCustomLogoUrl(publicUrl);
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
                  <button type="button" onClick={handleRemoveLogo} disabled={uploadingLogo} className="cursor-pointer rounded-xl border border-red-200 bg-red-50/50 px-4 py-2.5 text-xs font-semibold text-red-600 transition-colors hover:bg-red-100/70 disabled:opacity-60">
                    Remover
                  </button>
                )}
              </div>
              <p className="text-[10px] text-brand-text-muted">
                Para melhor visualização no cabeçalho dos documentos, recomendamos imagens horizontais com fundo transparente ou branco.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
