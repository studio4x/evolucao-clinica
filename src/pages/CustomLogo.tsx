import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle, Image, Loader2, Lock, Sparkles, Trash2, Upload } from 'lucide-react';
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
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-start justify-between gap-4 border-b border-brand-border/60 pb-5">
        <div>
          <h1 className="text-3xl font-display font-bold text-brand-primary">Logotipo Personalizado</h1>
          <p className="mt-1 text-sm text-brand-text-muted">
            Personalize o timbre dos seus relatórios, PDIs e evoluções clínicas.
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-gradient-to-r from-amber-500 to-amber-600 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-white shadow-sm">
          <Lock size={10} /> Plano Anual
        </span>
      </div>

      {successMessage && (
        <div className="flex items-center space-x-2 rounded-xl border border-emerald-100 bg-emerald-50 p-3.5 text-sm text-emerald-700 animate-fadeIn">
          <CheckCircle className="h-5 w-5 flex-shrink-0 text-emerald-600" />
          <span className="font-medium">{successMessage}</span>
        </div>
      )}

      {!isYearly ? (
        <div className="rounded-2xl border border-amber-200/60 bg-gradient-to-br from-amber-50/40 to-orange-50/20 p-5">
          <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
            <div className="max-w-lg space-y-1.5">
              <h2 className="flex items-center gap-2 text-sm font-semibold text-amber-800">
                <Sparkles size={16} className="text-amber-600" />
                Timbre Exclusivo com Sua Marca
              </h2>
              <p className="text-xs leading-relaxed text-amber-700/80">
                Personalize os seus relatórios, planos de desenvolvimento (PDI) e evoluções clínicas impressas ou em PDF com o seu próprio logotipo ou o logotipo da sua clínica.
              </p>
            </div>
            <button
              type="button"
              onClick={() => navigate('/painel/subscription')}
              className="btn-primary shrink-0 cursor-pointer bg-gradient-to-r from-amber-500 to-amber-600 px-4 py-2 text-xs font-semibold text-white shadow-md shadow-amber-500/10 transition-all hover:from-amber-600 hover:to-amber-700 active:scale-95 animate-none"
            >
              Assinar Plano Anual
            </button>
          </div>
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
