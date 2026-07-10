import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldCheck, UserCheck, UserX, UserPlus, Search, Users, Clock, ShieldAlert, Check, Ban, Lock, Mail, Sparkles, LogOut, Loader2, Key, Settings, Eye, EyeOff, BarChart3, Coins, DollarSign, Activity, CreditCard, Calendar, User, Save, Globe, Bell, BellOff, CheckCheck, Send, Shield, Trash2, Upload, XCircle, Copy, RefreshCw, LifeBuoy, MessageSquare, AlertTriangle, Info, CheckCircle2, Link2Off, HelpCircle, Code, Database } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useNavigate, useLocation, Link, Navigate } from 'react-router-dom';
import { AppVersion } from '../components/layout/AppVersion';
import { reloadSiteConfig } from '../hooks/useSiteConfig';
import { defaultColors, type BrandColors } from '../utils/brandConfig';
import EmailHistory from './EmailHistory';
import SupportTicketDetail from './SupportTicketDetail';
import { fetchAdminSupportTickets, updateSupportTicketStatus, subscribeToAllSupportTickets, subscribeToAllSupportMessages, isSupportTicketUnread } from '../services/support';
import TicketStatusBadge from '../components/support/TicketStatusBadge';
import TicketSlaBadge from '../components/support/TicketSlaBadge';
import { completeOnboarding } from '../utils/onboarding';
import AdminFaqCrud from '../components/support/AdminFaqCrud';
import MigrationRequestsAdmin from '../components/admin/MigrationRequestsAdmin';
import FeedbackAdmin from '../components/admin/FeedbackAdmin';

interface Professional {
  id: string;
  google_email: string;
  full_name: string;
  photo_url?: string;
  role: 'admin' | 'therapist';
  status: 'active' | 'pending' | 'inactive';
  created_at?: string;
  subscription_plan?: 'trial' | 'monthly' | 'yearly' | 'none';
  subscription_status?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid';
  subscription_ends_at?: string;
  trial_ends_at?: string;
}

interface UsageLog {
  id: string;
  professional_id: string;
  professional_name: string;
  professional_email: string;
  model: string;
  prompt_tokens: number;
  candidates_tokens: number;
  total_tokens: number;
  cost_usd: number;
  audio_duration_seconds?: number;
  created_at: string;
}

interface UserUsageSummary {
  id: string;
  name: string;
  email: string;
  callsCount: number;
  promptTokens: number;
  candidatesTokens: number;
  totalTokens: number;
  totalCostUsd: number;
  totalDurationSeconds: number;
}

interface AdminInboxNotification {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  read_at: string | null;
  link: string | null;
  image_url: string | null;
  created_at: string;
}

const BRAND_COLOR_FIELDS: { key: keyof BrandColors; label: string; desc: string }[] = [
  { key: 'primary', label: 'Cor Primária', desc: 'Botões principais, cabeçalhos, destaques e links.' },
  { key: 'primary_hover', label: 'Cor Primária (Hover)', desc: 'Cor do botão primário ao passar o mouse.' },
  { key: 'secondary', label: 'Cor Secundária', desc: 'Botões secundários, detalhes e destaques menores.' },
  { key: 'secondary_hover', label: 'Cor Secundária (Hover)', desc: 'Cor do botão secundário ao passar o mouse.' },
  { key: 'accent', label: 'Cor de Destaque (Accent)', desc: 'Badges, status e marcações de ênfase.' },
  { key: 'accent_hover', label: 'Cor de Destaque (Hover)', desc: 'Estado ativo de elementos de destaque.' },
  { key: 'bg', label: 'Cor de Fundo (Background)', desc: 'Fundo geral das páginas do aplicativo.' },
  { key: 'surface', label: 'Superfície (Surface)', desc: 'Fundo de cards, modais, painéis e inputs.' },
  { key: 'text', label: 'Texto Principal', desc: 'Cor principal para parágrafos, labels e títulos escuros.' },
  { key: 'text_muted', label: 'Texto Secundário (Muted)', desc: 'Textos de apoio, legendas e informações.' },
  { key: 'border', label: 'Bordas e Divisores', desc: 'Divisões de tabelas, contornos de cards e inputs.' }
];

const MANUAL_PUSH_NOTIFICATION_IDS_KEY = 'admin_manual_push_notification_ids';

const readStoredManualPushNotificationIds = () => {
  if (typeof window === 'undefined') return [];

  try {
    const raw = window.localStorage.getItem(MANUAL_PUSH_NOTIFICATION_IDS_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0);
  } catch {
    return [];
  }
};

const storeManualPushNotificationIds = (ids: string[]) => {
  if (typeof window === 'undefined') return;

  const normalized = Array.from(new Set(ids.filter((id) => typeof id === 'string' && id.trim().length > 0)));
  window.localStorage.setItem(MANUAL_PUSH_NOTIFICATION_IDS_KEY, JSON.stringify(normalized));
};

const addStoredManualPushNotificationId = (notificationId?: string | null) => {
  if (!notificationId) return;

  const currentIds = readStoredManualPushNotificationIds();
  if (currentIds.includes(notificationId)) return;

  storeManualPushNotificationIds([...currentIds, notificationId]);
};

export default function AdminPanel() {
  const { user, profileRole, setUser, setProfileInfo } = useAuthStore();
  const navigate = useNavigate();

  const location = useLocation();

  useEffect(() => {
    if (location.pathname === '/admin' || location.pathname === '/admin/') {
      navigate('/admin/professionals', { replace: true });
    } else if (location.pathname.endsWith('/notifications-config') || location.pathname.endsWith('/notifications-config/')) {
      navigate('/admin/push-notifications', { replace: true });
    } else if (location.pathname.endsWith('/gemini-config') || location.pathname.endsWith('/gemini-config/')) {
      navigate('/admin/token-usage', { replace: true });
    }
  }, [location.pathname, navigate]);

  const getActiveTab = () => {
    const path = location.pathname;
    if (path.endsWith('/gemini-config')) return 'token_usage';
    if (path.endsWith('/google-pay-config')) return 'google_pay_config';
    if (path.endsWith('/token-usage')) return 'token_usage';
    if (path.endsWith('/plans')) return 'plans';
    if (path.endsWith('/transactions')) return 'transactions';
    if (path.endsWith('/migrations')) return 'migrations';
    if (path.endsWith('/push-notifications')) return 'push_notifications';
    if (path.endsWith('/email-notifications')) return 'email_notifications';
    if (path.endsWith('/email-history')) return 'email_history';
    if (path.endsWith('/vapid-keys')) return 'vapid_keys';
    if (path.includes('/support/')) return 'support';
    if (path.endsWith('/support')) return 'support';
    if (path.endsWith('/profile')) return 'profile';
    if (path.endsWith('/brand')) return 'brand';
    if (path.endsWith('/tracking')) return 'tracking';
    if (path.endsWith('/faq')) return 'faq';
    if (path.endsWith('/feedback')) return 'feedback';
    return 'professionals'; // default
  };

  const activeTab = getActiveTab();
  const isAdminSupportDetail = /^\/admin\/support\/[^/]+$/.test(location.pathname);
  const adminNavItems = [
    { key: 'professionals', label: 'Profissionais', icon: Users },
    { key: 'token_usage', label: 'Consumo & Chaves IA', icon: BarChart3 },
    { key: 'plans', label: 'Planos SaaS', icon: Coins },
    { key: 'google_pay_config', label: 'Google Pay & Stripe', icon: CreditCard },
    { key: 'transactions', label: 'Transações', icon: Clock },
    { key: 'migrations', label: 'Migrações VIP', icon: Database },
    { key: 'support', label: 'Suporte / Tickets', icon: LifeBuoy },
    { key: 'push_notifications', label: 'Notificações Push', icon: Bell },
    { key: 'email_notifications', label: 'E-mails do Sistema', icon: Mail },
    { key: 'email_history', label: 'Histórico de E-mails', icon: Clock },
    { key: 'vapid_keys', label: 'Chaves Web Push', icon: Key },
    { key: 'brand', label: 'Identidade Visual', icon: Globe },
    { key: 'tracking', label: 'Rastreamento', icon: Code },
    { key: 'faq', label: 'Gerenciar FAQ', icon: HelpCircle },
    { key: 'feedback', label: 'Sugestões & Avaliações', icon: MessageSquare },
    { key: 'profile', label: 'Meu Perfil', icon: User }
  ] as const;

  const setActiveTab = (tab: 'professionals' | 'gemini_config' | 'google_pay_config' | 'token_usage' | 'plans' | 'profile' | 'transactions' | 'migrations' | 'push_notifications' | 'email_notifications' | 'email_history' | 'vapid_keys' | 'support' | 'brand' | 'tracking' | 'faq' | 'feedback') => {
    if (tab === 'professionals') navigate('/admin/professionals');
    else if (tab === 'gemini_config') navigate('/admin/token-usage');
    else if (tab === 'google_pay_config') navigate('/admin/google-pay-config');
    else if (tab === 'token_usage') navigate('/admin/token-usage');
    else if (tab === 'plans') navigate('/admin/plans');
    else if (tab === 'profile') navigate('/admin/profile');
    else if (tab === 'transactions') navigate('/admin/transactions');
    else if (tab === 'migrations') navigate('/admin/migrations');
    else if (tab === 'push_notifications') navigate('/admin/push-notifications');
    else if (tab === 'email_notifications') navigate('/admin/email-notifications');
    else if (tab === 'email_history') navigate('/admin/email-history');
    else if (tab === 'vapid_keys') navigate('/admin/vapid-keys');
    else if (tab === 'support') navigate('/admin/support');
    else if (tab === 'brand') navigate('/admin/brand');
    else if (tab === 'tracking') navigate('/admin/tracking');
    else if (tab === 'faq') navigate('/admin/faq');
    else if (tab === 'feedback') navigate('/admin/feedback');
  };

  // Estados de Configuração de Pagamento (Google Pay & Stripe)
  const [paymentEnvironment, setPaymentEnvironment] = useState<'TEST' | 'PRODUCTION'>('TEST');
  const [googleMerchantId, setGoogleMerchantId] = useState('');
  const [stripeProdPublishableKey, setStripeProdPublishableKey] = useState('');
  const [stripeProdSecretKey, setStripeProdSecretKey] = useState('');
  const [stripeSandboxPublishableKey, setStripeSandboxPublishableKey] = useState('');
  const [stripeSandboxSecretKey, setStripeSandboxSecretKey] = useState('');
  const [stripeWebhookSecretProd, setStripeWebhookSecretProd] = useState('');
  const [stripeWebhookSecretSandbox, setStripeWebhookSecretSandbox] = useState('');
  const [paymentSettingsLoading, setPaymentSettingsLoading] = useState(false);
  const [paymentSaveSuccess, setPaymentSaveSuccess] = useState(false);
  const [paymentSaveLoading, setPaymentSaveLoading] = useState(false);

  // Controle de exibição de chaves secretas
  const [showStripeProdSecret, setShowStripeProdSecret] = useState(false);
  const [showStripeSandboxSecret, setShowStripeSandboxSecret] = useState(false);
  const [showStripeWebhookSecretProd, setShowStripeWebhookSecretProd] = useState(false);
  const [showStripeWebhookSecretSandbox, setShowStripeWebhookSecretSandbox] = useState(false);

  // Estados do Perfil do Admin
  const [adminFirstName, setAdminFirstName] = useState('');
  const [adminLastName, setAdminLastName] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [adminConfirmPassword, setAdminConfirmPassword] = useState('');
  const [adminProfileLoading, setAdminProfileLoading] = useState(false);
  const [adminProfileSaving, setAdminProfileSaving] = useState(false);
  const [adminSuccessMsg, setAdminSuccessMsg] = useState('');
  const [adminErrorMsg, setAdminErrorMsg] = useState('');
  const [showAdminPassInput, setShowAdminPassInput] = useState(false);
  const [showAdminConfirmPassInput, setShowAdminConfirmPassInput] = useState(false);

  // Estados para as Configurações de Logotipo, Favicon e Cores (Marca/PWA)
  const [brandLogoLight, setBrandLogoLight] = useState('');
  const [brandLogoDark, setBrandLogoDark] = useState('');
  const [brandFavicon, setBrandFavicon] = useState('');
  const [brandPwa192, setBrandPwa192] = useState('');
  const [brandPwa512, setBrandPwa512] = useState('');
  const [brandPwaMaskable, setBrandPwaMaskable] = useState('');
  const [brandPushNotificationIcon, setBrandPushNotificationIcon] = useState('');
  const [brandInstallLogo, setBrandInstallLogo] = useState('');
  const [brandLoadingLogo, setBrandLoadingLogo] = useState('');
  const [brandSocialShare, setBrandSocialShare] = useState('');
  const [brandVersion, setBrandVersion] = useState('1.0');
  const [brandColors, setBrandColors] = useState<BrandColors>(defaultColors);
  const [brandSettingsLoading, setBrandSettingsLoading] = useState(false);
  const [savingBrand, setSavingBrand] = useState(false);
  const [brandSaveSuccess, setBrandSaveSuccess] = useState(false);
  // Estados de Rastreamento (Google Tag Manager, Facebook Pixel, Head, Body, Footer)
  const [gtmId, setGtmId] = useState('');
  const [fbPixelId, setFbPixelId] = useState('');
  const [headScripts, setHeadScripts] = useState('');
  const [bodyScripts, setBodyScripts] = useState('');
  const [footerScripts, setFooterScripts] = useState('');
  const [trackingSettingsLoading, setTrackingSettingsLoading] = useState(false);
  const [savingTracking, setSavingTracking] = useState(false);
  const [trackingSaveSuccess, setTrackingSaveSuccess] = useState(false);
  const [trackingSaveError, setTrackingSaveError] = useState<string | null>(null);

  // Efeito para carregar as configurações de rastreamento
  useEffect(() => {
    if (user && profileRole === 'admin' && activeTab === 'tracking') {
      const fetchTrackingSettings = async () => {
        setTrackingSettingsLoading(true);
        setTrackingSaveError(null);
        try {
          const { data, error } = await supabase
            .from('settings')
            .select('api_key')
            .eq('id', 'tracking_settings')
            .single();
          
          if (!error && data && data.api_key) {
            const parsed = JSON.parse(data.api_key);
            setGtmId(parsed.gtm_id || '');
            setFbPixelId(parsed.fb_pixel_id || '');
            setHeadScripts(parsed.head_scripts || '');
            setBodyScripts(parsed.body_scripts || '');
            setFooterScripts(parsed.footer_scripts || '');
          }
        } catch (err: any) {
          console.error('Error fetching tracking settings:', err);
          setTrackingSaveError('Falha ao carregar as configurações de rastreamento.');
        } finally {
          setTrackingSettingsLoading(false);
        }
      };
      
      void fetchTrackingSettings();
    }
  }, [user, profileRole, activeTab]);

  const handleSaveTrackingSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || profileRole !== 'admin') return;

    setSavingTracking(true);
    setTrackingSaveSuccess(false);
    setTrackingSaveError(null);

    try {
      const payload = {
        gtm_id: gtmId,
        fb_pixel_id: fbPixelId,
        head_scripts: headScripts,
        body_scripts: bodyScripts,
        footer_scripts: footerScripts
      };

      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 'tracking_settings',
          api_key: JSON.stringify(payload),
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'admin'
        });

      if (error) throw error;
      
      setTrackingSaveSuccess(true);
      
      // Update local storage so scripts can be loaded immediately or updated
      if (typeof window !== 'undefined') {
        localStorage.setItem('evolucao-clinica:tracking-config', JSON.stringify(payload));
      }

      setTimeout(() => setTrackingSaveSuccess(false), 3000);
    } catch (err: any) {
      console.error('Error saving tracking settings:', err);
      setTrackingSaveError(err.message || 'Erro desconhecido ao salvar as configurações.');
    } finally {
      setSavingTracking(false);
    }
  };

  const [uploadingLight, setUploadingLight] = useState(false);
  const [uploadingDark, setUploadingDark] = useState(false);
  const [uploadingFavicon, setUploadingFavicon] = useState(false);
  const [uploadingPwa192, setUploadingPwa192] = useState(false);
  const [uploadingPwa512, setUploadingPwa512] = useState(false);
  const [uploadingPwaMaskable, setUploadingPwaMaskable] = useState(false);
  const [uploadingPushNotificationIcon, setUploadingPushNotificationIcon] = useState(false);
  const [uploadingInstallLogo, setUploadingInstallLogo] = useState(false);
  const [uploadingLoadingLogo, setUploadingLoadingLogo] = useState(false);
  const [uploadingSocialShare, setUploadingSocialShare] = useState(false);

  // Efeito para carregar as configurações da marca
  useEffect(() => {
    if (user && profileRole === 'admin' && activeTab === 'brand') {
      const fetchBrandSettings = async () => {
        setBrandSettingsLoading(true);
        try {
          const { data, error } = await supabase
            .from('settings')
            .select('api_key')
            .eq('id', 'brand_settings')
            .single();
          
          if (!error && data && data.api_key) {
            const parsed = JSON.parse(data.api_key);
            setBrandLogoLight(parsed.logo_light_url || '');
            setBrandLogoDark(parsed.logo_dark_url || '');
            setBrandFavicon(parsed.favicon_url || '');
            setBrandPwa192(parsed.pwa_icon_192_url || '');
            setBrandPwa512(parsed.pwa_icon_512_url || '');
            setBrandPwaMaskable(parsed.pwa_maskable_icon_url || '');
            setBrandPushNotificationIcon(parsed.pwa_push_notification_icon_url || '');
            setBrandInstallLogo(parsed.pwa_install_logo_url || '');
            setBrandLoadingLogo(parsed.pwa_loading_logo_url || '');
            setBrandSocialShare(parsed.social_share_url || '');
            setBrandVersion(parsed.version || '1.0');
            if (parsed.colors) {
              setBrandColors({
                primary: parsed.colors.primary || defaultColors.primary,
                primary_hover: parsed.colors.primary_hover || defaultColors.primary_hover,
                secondary: parsed.colors.secondary || defaultColors.secondary,
                secondary_hover: parsed.colors.secondary_hover || defaultColors.secondary_hover,
                accent: parsed.colors.accent || defaultColors.accent,
                accent_hover: parsed.colors.accent_hover || defaultColors.accent_hover,
                bg: parsed.colors.bg || defaultColors.bg,
                surface: parsed.colors.surface || defaultColors.surface,
                text: parsed.colors.text || defaultColors.text,
                text_muted: parsed.colors.text_muted || defaultColors.text_muted,
                border: parsed.colors.border || defaultColors.border
              });
            } else {
              setBrandColors(defaultColors);
            }
          }
        } catch (err) {
          console.error("Erro ao buscar configurações de marca:", err);
        } finally {
          setBrandSettingsLoading(false);
        }
      };
      fetchBrandSettings();
    }
  }, [user, profileRole, activeTab]);

  const handleBrandUpload = async (e: React.ChangeEvent<HTMLInputElement>, type: 'light' | 'dark' | 'favicon' | 'pwa192' | 'pwa512' | 'pwamaskable' | 'pushnotification' | 'install' | 'loading' | 'socialshare') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (type === 'light') setUploadingLight(true);
    else if (type === 'dark') setUploadingDark(true);
    else if (type === 'favicon') setUploadingFavicon(true);
    else if (type === 'pwa192') setUploadingPwa192(true);
    else if (type === 'pwa512') setUploadingPwa512(true);
    else if (type === 'pwamaskable') setUploadingPwaMaskable(true);
    else if (type === 'pushnotification') setUploadingPushNotificationIcon(true);
    else if (type === 'install') setUploadingInstallLogo(true);
    else if (type === 'loading') setUploadingLoadingLogo(true);
    else if (type === 'socialshare') setUploadingSocialShare(true);

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${type}_logo_${Date.now()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error } = await supabase.storage
        .from('brand')
        .upload(filePath, file, {
          cacheControl: '31536000',
          upsert: true
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from('brand')
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        if (type === 'light') setBrandLogoLight(publicUrlData.publicUrl);
        else if (type === 'dark') setBrandLogoDark(publicUrlData.publicUrl);
        else if (type === 'favicon') setBrandFavicon(publicUrlData.publicUrl);
        else if (type === 'pwa192') setBrandPwa192(publicUrlData.publicUrl);
        else if (type === 'pwa512') setBrandPwa512(publicUrlData.publicUrl);
        else if (type === 'pwamaskable') setBrandPwaMaskable(publicUrlData.publicUrl);
        else if (type === 'pushnotification') setBrandPushNotificationIcon(publicUrlData.publicUrl);
        else if (type === 'install') setBrandInstallLogo(publicUrlData.publicUrl);
        else if (type === 'loading') setBrandLoadingLogo(publicUrlData.publicUrl);
        else if (type === 'socialshare') setBrandSocialShare(publicUrlData.publicUrl);
      }
    } catch (err: any) {
      console.error(`Erro ao fazer upload do ${type}:`, err);
      alert(`Erro ao fazer upload: ${err.message || 'Erro desconhecido'}`);
    } finally {
      if (type === 'light') setUploadingLight(false);
      else if (type === 'dark') setUploadingDark(false);
      else if (type === 'favicon') setUploadingFavicon(false);
      else if (type === 'pwa192') setUploadingPwa192(false);
      else if (type === 'pwa512') setUploadingPwa512(false);
      else if (type === 'pwamaskable') setUploadingPwaMaskable(false);
      else if (type === 'pushnotification') setUploadingPushNotificationIcon(false);
      else if (type === 'install') setUploadingInstallLogo(false);
      else if (type === 'loading') setUploadingLoadingLogo(false);
      else if (type === 'socialshare') setUploadingSocialShare(false);
      e.target.value = '';
    }
  };

  const handleSaveBrandSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingBrand(true);
    setBrandSaveSuccess(false);

    try {
      const newVersion = Date.now().toString();
      const payload = {
        logo_light_url: brandLogoLight,
        logo_dark_url: brandLogoDark,
        favicon_url: brandFavicon,
        pwa_icon_192_url: brandPwa192,
        pwa_icon_512_url: brandPwa512,
        pwa_maskable_icon_url: brandPwaMaskable,
        pwa_push_notification_icon_url: brandPushNotificationIcon,
        pwa_install_logo_url: brandInstallLogo,
        pwa_loading_logo_url: brandLoadingLogo,
        social_share_url: brandSocialShare,
        version: newVersion,
        colors: brandColors
      };

      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 'brand_settings',
          api_key: JSON.stringify(payload),
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'admin'
        });

      if (error) throw error;
      setBrandVersion(newVersion);
      setBrandSaveSuccess(true);
      
      // Limpar cache de runtime
      if (window.caches) {
        const cacheKeys = await caches.keys();
        for (const name of cacheKeys) {
          if (name.includes('runtime')) {
            await caches.delete(name);
          }
        }
      }

      await reloadSiteConfig();

      // Notificar outras abas do site para recarregarem e reprocessarem a nova identidade visual
      if (typeof window !== 'undefined') {
        const syncChannel = new BroadcastChannel('brand_settings_channel');
        syncChannel.postMessage('reload');
        syncChannel.close();
      }

      setTimeout(() => setBrandSaveSuccess(false), 5000);
    } catch (error: any) {
      console.error("Erro ao salvar configurações de marca:", error);
      alert("Erro ao salvar: " + (error.message || 'Erro desconhecido'));
    } finally {
      setSavingBrand(false);
    }
  };

  // Efeito para carregar dados do Perfil do Admin
  useEffect(() => {
    if (user && activeTab === 'profile') {
      const loadAdminProfile = async () => {
        setAdminProfileLoading(true);
        setAdminErrorMsg('');
        try {
          const { data, error } = await supabase
            .from('professionals')
            .select('full_name')
            .eq('id', user.id)
            .single();

          if (error) throw error;

          if (data && data.full_name) {
            const parts = data.full_name.trim().split(' ');
            setAdminFirstName(parts[0] || '');
            setAdminLastName(parts.slice(1).join(' ') || '');
          }
        } catch (err: any) {
          console.error("Erro ao carregar dados do admin:", err);
          const name = user.user_metadata?.full_name || '';
          const parts = name.trim().split(' ');
          setAdminFirstName(parts[0] || '');
          setAdminLastName(parts.slice(1).join(' ') || '');
        } finally {
          setAdminProfileLoading(false);
        }
      };

      loadAdminProfile();
    }
  }, [user, activeTab]);

  // Manipulador para salvar o perfil do Admin
  const handleSaveAdminProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setAdminProfileSaving(true);
    setAdminSuccessMsg('');
    setAdminErrorMsg('');

    if (adminPassword && adminPassword !== adminConfirmPassword) {
      setAdminErrorMsg('As senhas não coincidem.');
      setAdminProfileSaving(false);
      return;
    }

    if (adminPassword && adminPassword.length < 6) {
      setAdminErrorMsg('A senha deve ter pelo menos 6 caracteres.');
      setAdminProfileSaving(false);
      return;
    }

    const fullName = `${adminFirstName.trim()} ${adminLastName.trim()}`.trim();

    try {
      // 1. Atualiza profissionais no DB
      const { error: dbError } = await supabase
        .from('professionals')
        .update({
          full_name: fullName,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (dbError) throw dbError;

      // 2. Prepara atualização do auth
      const updateData: any = {
        data: {
          full_name: fullName,
          name: adminFirstName.trim(),
          family_name: adminLastName.trim()
        }
      };

      if (adminPassword) {
        updateData.password = adminPassword;
      }

      // 3. Atualiza dados de Auth do Supabase
      const { data: authData, error: authError } = await supabase.auth.updateUser(updateData);

      if (authError) throw authError;

      if (authData?.user) {
        setUser(authData.user);
      }

      setAdminPassword('');
      setAdminConfirmPassword('');
      setAdminSuccessMsg('Perfil e credenciais do administrador atualizados com sucesso!');
      setTimeout(() => setAdminSuccessMsg(''), 5000);
    } catch (err: any) {
      console.error("Erro ao salvar perfil do admin:", err);
      setAdminErrorMsg(err.message || 'Ocorreu um erro ao salvar o perfil.');
    } finally {
      setAdminProfileSaving(false);
    }
  };

  // Estados do Painel Administrativo
  const [professionals, setProfessionals] = useState<Professional[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'pending' | 'inactive'>('all');
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [creatingProfessional, setCreatingProfessional] = useState(false);
  const [newProfessionalFirstName, setNewProfessionalFirstName] = useState('');
  const [newProfessionalLastName, setNewProfessionalLastName] = useState('');
  const [newProfessionalEmail, setNewProfessionalEmail] = useState('');
  const [newProfessionalPassword, setNewProfessionalPassword] = useState('');
  const [showNewProfessionalPassword, setShowNewProfessionalPassword] = useState(false);
  const [createProfessionalSuccess, setCreateProfessionalSuccess] = useState('');
  const [createProfessionalError, setCreateProfessionalError] = useState('');
  const [accessControlRequireApproval, setAccessControlRequireApproval] = useState(true);
  const [accessControlLoading, setAccessControlLoading] = useState(false);
  const [accessControlSaving, setAccessControlSaving] = useState(false);
  const [accessControlSuccess, setAccessControlSuccess] = useState('');
  const [accessControlError, setAccessControlError] = useState('');

  // Estados da Chave Gemini
  const [currentGeminiKey, setCurrentGeminiKey] = useState('');
  const [newGeminiKey, setNewGeminiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [selectedGeminiModel, setSelectedGeminiModel] = useState('gemini-3.5-flash');
  const [availableModels, setAvailableModels] = useState<{ name: string; displayName: string; description: string }[]>([]);
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState('');
  const [modelsFetched, setModelsFetched] = useState(false);
  const [dbCurrentModel, setDbCurrentModel] = useState(''); // modelo que está salvo no banco
  const [testingModel, setTestingModel] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  // Lista de fallback (modelos confirmados para Tier 1 do Google AI Studio)
  const GEMINI_MODELS_FALLBACK = [
    { value: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', badge: 'Stable' },
    { value: 'gemini-3.1-flash-lite', label: 'Gemini 3.1 Flash-Lite', badge: 'Lite' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash', badge: 'Preview' },
  ];

  const normalizeSavedGeminiModel = (model: string) => {
    const deprecatedMap: Record<string, string> = {
      'gemini-2.0-flash': 'gemini-3.5-flash',
      'gemini-2.0-flash-001': 'gemini-3.5-flash',
      'gemini-2.0-flash-lite': 'gemini-3.1-flash-lite',
      'gemini-2.0-flash-lite-001': 'gemini-3.1-flash-lite',
    };

    return deprecatedMap[model] || model;
  };

  const handleFetchAvailableModels = async () => {
    setLoadingModels(true);
    setModelsError('');
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');
      const res = await fetch('/api/ai/list-models', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao listar modelos.');
      setAvailableModels(data.models || []);
      setModelsFetched(true);
      // Sincroniza o modelo atual do banco
      if (data.currentModel) {
        setDbCurrentModel(data.currentModel);
        setSelectedGeminiModel(data.currentModel);
      }
      setTestResults({}); // limpa resultados antigos
    } catch (err: any) {
      setModelsError(err.message || 'Erro desconhecido ao buscar modelos.');
    } finally {
      setLoadingModels(false);
    }
  };

  const handleTestModel = async (modelName: string) => {
    setTestingModel(modelName);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');
      const res = await fetch('/api/ai/test-model', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: modelName })
      });
      const data = await res.json();
      setTestResults(prev => ({ ...prev, [modelName]: { success: data.success, error: data.error } }));
    } catch (err: any) {
      setTestResults(prev => ({ ...prev, [modelName]: { success: false, error: err.message } }));
    } finally {
      setTestingModel(null);
    }
  };

  // Estados de Consumo de Tokens (usage_logs)
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [usageSearchTerm, setUsageSearchTerm] = useState('');
  const [usageViewMode, setUsageViewMode] = useState<'by_user' | 'history'>('by_user');
  const [tokenUsageSubTab, setTokenUsageSubTab] = useState<'general' | 'metrics'>('general');

  // Estados para Edição de Planos (SaaS)
  const [plans, setPlans] = useState<any[]>([]);
  const [editingPlans, setEditingPlans] = useState<Record<string, any>>({});
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [plansError, setPlansError] = useState('');
  const [plansSuccess, setPlansSuccess] = useState('');

  // Estados de Transações (Admin)
  const [adminTransactions, setAdminTransactions] = useState<any[]>([]);
  const [loadingAdminTransactions, setLoadingAdminTransactions] = useState(true);
  const [selectedTxForReason, setSelectedTxForReason] = useState<any | null>(null);

  // Estados do Formulário de Login (Administrativo)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Estados do modal de edição de assinatura SaaS
  const [editingProf, setEditingProf] = useState<Professional | null>(null);
  const [editPlan, setEditPlan] = useState<'trial' | 'monthly' | 'yearly' | 'none'>('trial');
  const [editStatus, setEditStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'>('trialing');

  // Estados para aba de Notificações & SMTP no Painel Admin
  const [adminSmtpHost, setAdminSmtpHost] = useState('');
  const [emailSendQueue, setEmailSendQueue] = useState<{
    id: string;
    name: string;
    email: string;
    status: 'pending' | 'sending' | 'success' | 'error';
    error?: string;
  }[]>([]);
  const [adminSmtpPort, setAdminSmtpPort] = useState('587');
  const [adminSmtpSecure, setAdminSmtpSecure] = useState(false);
  const [adminSmtpUser, setAdminSmtpUser] = useState('');
  const [adminSmtpPass, setAdminSmtpPass] = useState('');
  const [adminSmtpFrom, setAdminSmtpFrom] = useState('');
  const [adminEmailProvider, setAdminEmailProvider] = useState<'smtp' | 'brevo'>('smtp');
  const [adminBrevoApiKey, setAdminBrevoApiKey] = useState('');
  const [adminBrevoSenderName, setAdminBrevoSenderName] = useState('');
  const [adminBrevoSenderEmail, setAdminBrevoSenderEmail] = useState('');
  const [adminVapidPublic, setAdminVapidPublic] = useState('');
  const [adminVapidPrivate, setAdminVapidPrivate] = useState('');
  const [adminSmtpSaving, setAdminSmtpSaving] = useState(false);
  const [adminSmtpSuccess, setAdminSmtpSuccess] = useState(false);

  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'specific'>('all');
  const [selectedProfessionalId, setSelectedProfessionalId] = useState('');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifContent, setNotifContent] = useState('');
  const [notifType, setNotifType] = useState<'info' | 'success' | 'warning' | 'error'>('info');
  const [notifLink, setNotifLink] = useState('');
  const [notifImageUrl, setNotifImageUrl] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);
  const [pushNotificationsTab, setPushNotificationsTab] = useState<'manual' | 'platform'>('manual');

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Math.random().toString(36).substring(2, 15)}_${Date.now()}.${fileExt}`;
      const filePath = `notif-covers/${fileName}`;

      const { error } = await supabase.storage
        .from('notifications')
        .upload(filePath, file, {
          cacheControl: '3600',
          upsert: false
        });

      if (error) throw error;

      const { data: publicUrlData } = supabase.storage
        .from('notifications')
        .getPublicUrl(filePath);

      if (publicUrlData?.publicUrl) {
        setNotifImageUrl(publicUrlData.publicUrl);
      }
    } catch (err: any) {
      console.error('Erro ao fazer upload da imagem:', err);
      alert('Erro ao fazer upload da imagem: ' + (err.message || 'Erro desconhecido'));
    } finally {
      setUploadingImage(false);
      e.target.value = '';
    }
  };
 
  const [resendingNotifId, setResendingNotifId] = useState<string | null>(null);
 
  const handleCopyNotification = (notification: any) => {
    setNotifTitle(notification.title || '');
    setNotifContent(notification.message || '');
    setNotifType(notification.type || 'info');
    setNotifLink(notification.link || '');
    setNotifImageUrl(notification.image_url || '');
    if (notification.user_id) {
      setBroadcastTarget('specific');
      setSelectedProfessionalId(notification.user_id);
    } else {
      setBroadcastTarget('all');
      setSelectedProfessionalId('');
    }
    const formElement = document.getElementById('notif-image-upload')?.closest('form');
    if (formElement) {
      formElement.scrollIntoView({ behavior: 'smooth' });
    }
  };
 
  const handleResendNotification = async (notification: any) => {
    if (!confirm('Deseja realmente reenviar esta notificação agora?')) return;
    setResendingNotifId(notification.id);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');
 
      const res = await fetch('/api/notifications/send', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          userId: notification.user_id,
          title: notification.title,
          content: notification.message,
          type: notification.type,
          link: notification.link || undefined,
          imageUrl: notification.image_url || undefined,
          source: 'manual'
        })
      });

      if (res.ok) {
        const resData = await res.json().catch(() => ({}));
        addStoredManualPushNotificationId(resData?.notification?.id);
        alert('Notificação reenviada com sucesso!');
        await refreshPushNotificationLogs();
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Erro ao reenviar notificação.');
      }
    } catch (err: any) {
      console.error('Erro ao reenviar notificação:', err);
      alert('Erro ao reenviar: ' + err.message);
    } finally {
      setResendingNotifId(null);
    }
  };

  const [notifSending, setNotifSending] = useState(false);
  const [notifSendSuccess, setNotifSendSuccess] = useState(false);
  const [notifSendError, setNotifSendError] = useState('');

  const [manualPushNotifications, setManualPushNotifications] = useState<any[]>([]);
  const [platformPushNotifications, setPlatformPushNotifications] = useState<any[]>([]);
  const [loadingPushNotifications, setLoadingPushNotifications] = useState(false);
  const [deletingNotifId, setDeletingNotifId] = useState<string | null>(null);
  const [adminInboxNotifications, setAdminInboxNotifications] = useState<AdminInboxNotification[]>([]);
  const [adminInboxLoading, setAdminInboxLoading] = useState(false);
  const [adminInboxOpen, setAdminInboxOpen] = useState(false);
  const [adminInboxActionId, setAdminInboxActionId] = useState<string | null>(null);

  // Test email states
  const [testEmailTarget, setTestEmailTarget] = useState('');
  const [testEmailSending, setTestEmailSending] = useState(false);
  const [testEmailStatus, setTestEmailStatus] = useState<'success' | 'error' | null>(null);
  const [testEmailMessage, setTestEmailMessage] = useState('');

  const refreshPushNotificationLogs = async () => {
    if (!user || profileRole !== 'admin') return;

    setLoadingPushNotifications(true);
    try {
      const [{ data: settingsData }, { data, error }] = await Promise.all([
        supabase
          .from('settings')
          .select('api_key')
          .eq('id', 'notification_settings')
          .maybeSingle(),
        supabase
          .from('notifications')
          .select('*, professionals:user_id(full_name, google_email)')
          .order('created_at', { ascending: false })
      ]);

      if (error) throw error;

      let manualIds: string[] = [];
      if (settingsData?.api_key) {
        try {
          const parsed = JSON.parse(settingsData.api_key);
          manualIds = Array.isArray(parsed.manual_push_notification_ids)
            ? parsed.manual_push_notification_ids.filter((id: unknown): id is string => typeof id === 'string' && id.trim().length > 0)
            : [];
        } catch (parseErr) {
          console.error('Erro ao ler ids manuais de notificacoes:', parseErr);
        }
      }

      const manualIdSet = new Set([...manualIds, ...readStoredManualPushNotificationIds()]);
      const records = data || [];
      setManualPushNotifications(records.filter((notification: any) => manualIdSet.has(notification.id)));
      setPlatformPushNotifications(records.filter((notification: any) => !manualIdSet.has(notification.id)));
    } catch (err) {
      console.error('Erro ao buscar logs de notificacoes:', err);
    } finally {
      setLoadingPushNotifications(false);
    }
  };

  // Efeito para carregar as configurações SMTP e Logs de notificações
  useEffect(() => {
    const fetchSmtpAndLogs = async () => {
      if (!user || profileRole !== 'admin') return;
      
      // 1. Carregar configurações SMTP
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('api_key')
          .eq('id', 'notification_settings')
          .single();
          
        if (!error && data && data.api_key) {
          const parsed = JSON.parse(data.api_key);
          setAdminSmtpHost(parsed.smtp_host || '');
          setAdminSmtpPort(parsed.smtp_port || '587');
          setAdminSmtpSecure(parsed.smtp_secure !== undefined ? parsed.smtp_secure : parsed.smtp_port === '465');
          setAdminSmtpUser(parsed.smtp_user || '');
          setAdminSmtpPass(parsed.smtp_pass || '');
          setAdminSmtpFrom(parsed.smtp_from || '');
          setAdminEmailProvider(parsed.email_provider === 'brevo' ? 'brevo' : 'smtp');
          setAdminBrevoApiKey(parsed.brevo_api_key || '');
          setAdminBrevoSenderName(parsed.brevo_sender_name || '');
          setAdminBrevoSenderEmail(parsed.brevo_sender_email || '');
          setAdminVapidPublic(parsed.vapid_public_key || '');
          setAdminVapidPrivate(parsed.vapid_private_key || '');
        }
      } catch (err) {
        console.error('Erro ao buscar configuracoes SMTP:', err);
      }

      await refreshPushNotificationLogs();
    };

    if (user && profileRole === 'admin' && (activeTab === 'push_notifications' || activeTab === 'email_notifications' || activeTab === 'vapid_keys')) {
      fetchSmtpAndLogs();
    }
  }, [user, profileRole, activeTab]);

  useEffect(() => {
    if (!user || profileRole !== 'admin') return;

    const fetchAdminInboxNotifications = async () => {
      setAdminInboxLoading(true);
      try {
        const { data, error } = await supabase
          .from('notifications')
          .select('*')
          .eq('user_id', user.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setAdminInboxNotifications((data || []) as AdminInboxNotification[]);
      } catch (err) {
        console.error('Erro ao carregar notificacoes do admin:', err);
      } finally {
        setAdminInboxLoading(false);
      }
    };

    fetchAdminInboxNotifications();

    const channel = supabase
      .channel(`admin-inbox-notifications-${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          fetchAdminInboxNotifications();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, profileRole]);

  // Salvar configurações SMTP
  const handleSaveAdminSmtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAdminSmtpSaving(true);
    setAdminSmtpSuccess(false);

    try {
      const settings = {
        email_provider: adminEmailProvider,
        smtp_host: adminSmtpHost,
        smtp_port: adminSmtpPort,
        smtp_secure: adminSmtpSecure,
        smtp_user: adminSmtpUser,
        smtp_pass: adminSmtpPass,
        smtp_from: adminSmtpFrom,
        brevo_api_key: adminBrevoApiKey,
        brevo_sender_name: adminBrevoSenderName,
        brevo_sender_email: adminBrevoSenderEmail,
        vapid_public_key: adminVapidPublic,
        vapid_private_key: adminVapidPrivate,
        vapid_subject: `mailto:${adminSmtpUser || 'contato@evolucaoclinica.app.br'}`
      };

      const { data: currentSettings } = await supabase
        .from('settings')
        .select('api_key')
        .eq('id', 'notification_settings')
        .maybeSingle();

      let currentSettingsJson: Record<string, any> = {};
      if (currentSettings?.api_key) {
        try {
          currentSettingsJson = JSON.parse(currentSettings.api_key);
        } catch (parseErr) {
          console.error('Erro ao ler configurações atuais de notificações:', parseErr);
        }
      }

      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 'notification_settings',
          api_key: JSON.stringify({
            ...currentSettingsJson,
            ...settings,
            manual_push_notification_ids: Array.isArray(currentSettingsJson.manual_push_notification_ids)
              ? currentSettingsJson.manual_push_notification_ids
              : []
          }),
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'admin'
        });

      if (error) throw error;
      setAdminSmtpSuccess(true);
      setTimeout(() => setAdminSmtpSuccess(false), 3000);
    } catch (err: any) {
      console.error('Erro ao salvar SMTP:', err);
      alert('Erro ao salvar configurações: ' + err.message);
    } finally {
      setAdminSmtpSaving(false);
    }
  };

  // Excluir notificação específica do histórico geral
  const handleDeleteNotification = async (id: string) => {
    if (!confirm('Tem certeza que deseja excluir esta notificação?')) return;
    setDeletingNotifId(id);
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);

      if (error) throw error;
      await refreshPushNotificationLogs();
    } catch (err: any) {
      console.error('Erro ao deletar notificação:', err);
      alert('Erro ao deletar: ' + err.message);
    } finally {
      setDeletingNotifId(null);
    }
  };

  const handleClearNotificationHistory = async (notifications: any[], label: string, scope: 'manual' | 'platform') => {
    if (notifications.length === 0) return;
    if (!window.confirm(`Deseja realmente excluir todas as notificações ${label}?`)) return;

    setLoadingPushNotifications(true);
    try {
      const ids = notifications
        .map((notification) => notification.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0);

      if (ids.length === 0) return;

      const { error } = await supabase
        .from('notifications')
        .delete()
        .in('id', ids);

      if (error) throw error;

      if (scope === 'manual') {
        storeManualPushNotificationIds(
          readStoredManualPushNotificationIds().filter((id) => !ids.includes(id))
        );
      }

      await refreshPushNotificationLogs();
    } catch (err: any) {
      console.error('Erro ao limpar histórico de notificações:', err);
      alert('Erro ao limpar histórico: ' + err.message);
    } finally {
      setLoadingPushNotifications(false);
    }
  };

  const handleOpenAdminNotification = async (notification: AdminInboxNotification) => {
    try {
      setAdminInboxActionId(notification.id);

      if (!notification.read_at) {
        await markAdminNotificationAsRead(notification.id);
      }

      if (notification.link) {
        setAdminInboxOpen(false);

        if (/^https?:\/\//i.test(notification.link)) {
          window.open(notification.link, '_blank', 'noopener,noreferrer');
        } else {
          navigate(notification.link);
        }
      }
    } finally {
      setAdminInboxActionId(null);
    }
  };

  const markAdminNotificationAsRead = async (id: string) => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('id', id);

      if (error) throw error;
      setAdminInboxNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read_at: now } : n)));
    } catch (err) {
      console.error('Erro ao marcar notificacao do admin como lida:', err);
    }
  };

  const markAllAdminNotificationsAsRead = async () => {
    try {
      const now = new Date().toISOString();
      const { error } = await supabase
        .from('notifications')
        .update({ read_at: now })
        .eq('user_id', user?.id)
        .is('read_at', null);

      if (error) throw error;
      setAdminInboxNotifications((prev) => prev.map((n) => (n.read_at ? n : { ...n, read_at: now })));
    } catch (err) {
      console.error('Erro ao marcar todas as notificacoes do admin como lidas:', err);
    }
  };

  const clearAdminInboxNotifications = async () => {
    if (!window.confirm('Deseja realmente excluir todas as notificações do painel?')) return;

    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('user_id', user?.id);

      if (error) throw error;
      setAdminInboxNotifications([]);
    } catch (err) {
      console.error('Erro ao limpar notificacoes do admin:', err);
    }
  };

  // Disparar notificação (para todos ou um profissional)
  const handleSendNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (broadcastTarget === 'specific' && !selectedProfessionalId) {
      alert('Selecione um profissional para enviar a notificação.');
      return;
    }

    setNotifSending(true);
    setNotifSendSuccess(false);
    setNotifSendError('');

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');

      let targets: string[] = [];
      if (broadcastTarget === 'all') {
        targets = professionals.map(p => p.id);
      } else {
        targets = [selectedProfessionalId];
      }

      if (targets.length === 0) {
        throw new Error('Nenhum profissional destinatário encontrado.');
      }

      let successCount = 0;
      let errorMsg = '';

      for (const targetId of targets) {
        try {
          const res = await fetch('/api/notifications/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              userId: targetId,
              title: notifTitle,
              content: notifContent,
              type: notifType,
              link: notifLink || undefined,
              imageUrl: notifImageUrl || undefined,
              source: 'manual'
          })
        });

          if (res.ok) {
            const resData = await res.json().catch(() => ({}));
            addStoredManualPushNotificationId(resData?.notification?.id);
            successCount++;
          } else {
            const errData = await res.json().catch(() => ({}));
            errorMsg = errData.error || 'Erro no envio';
          }
        } catch (err: any) {
          errorMsg = err.message;
        }
      }

      if (successCount > 0) {
        setNotifSendSuccess(true);
        setNotifTitle('');
        setNotifContent('');
        setNotifLink('');
        setNotifImageUrl('');
        await refreshPushNotificationLogs();
      } else {
        setNotifSendError(errorMsg || 'Falha ao enviar notificações.');
      }
    } catch (err: any) {
      console.error('Erro ao disparar notificações:', err);
      setNotifSendError(err.message || 'Erro inesperado.');
    } finally {
      setNotifSending(false);
    }
  };

  const handleSendTestEmail = async () => {
    if (!testEmailTarget) return;
    setTestEmailSending(true);
    setTestEmailStatus(null);
    setTestEmailMessage('');

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;

      const res = await fetch('/api/notifications/test-email', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          toEmail: testEmailTarget,
          provider: adminEmailProvider,
          smtpHost: adminSmtpHost,
          smtpPort: adminSmtpPort,
          smtpSecure: adminSmtpSecure,
          smtpUser: adminSmtpUser,
          smtpPass: adminSmtpPass,
          smtpFrom: adminSmtpFrom,
          brevoApiKey: adminBrevoApiKey,
          brevoSenderName: adminBrevoSenderName,
          brevoSenderEmail: adminBrevoSenderEmail
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) {
        setTestEmailStatus('success');
        setTestEmailMessage('E-mail de teste enviado com sucesso!');
      } else {
        setTestEmailStatus('error');
        setTestEmailMessage(data.error || 'Erro ao enviar e-mail de teste.');
      }
    } catch (err: any) {
      setTestEmailStatus('error');
      setTestEmailMessage(err.message || 'Falha na conexão.');
    } finally {
      setTestEmailSending(false);
    }
  };

  const handleSendEmailNotification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (broadcastTarget === 'specific' && !selectedProfessionalId) {
      alert('Selecione um profissional para enviar o e-mail.');
      return;
    }

    setNotifSending(true);
    setNotifSendSuccess(false);
    setNotifSendError('');

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');

      let targets: string[] = [];
      if (broadcastTarget === 'all') {
        targets = professionals.map(p => p.id);
      } else {
        targets = [selectedProfessionalId];
      }

      if (targets.length === 0) {
        throw new Error('Nenhum profissional destinatário encontrado.');
      }

      let successCount = 0;
      let errorMsg = '';

      // Inicializa a fila de envio
      const initialQueue = targets.map(targetId => {
        const prof = professionals.find(p => p.id === targetId);
        return {
          id: targetId,
          name: prof?.full_name || 'Profissional',
          email: prof?.google_email || 'Sem e-mail',
          status: 'pending' as const
        };
      });
      setEmailSendQueue(initialQueue);

      for (const targetId of targets) {
        setEmailSendQueue(prev => prev.map(item => item.id === targetId ? { ...item, status: 'sending' } : item));
        try {
          const res = await fetch('/api/notifications/send', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              userId: targetId,
              title: notifTitle,
              content: notifContent,
              type: 'info',
              source: 'manual'
            })
          });

          const resData = await res.json().catch(() => ({}));

          if (res.ok) {
            addStoredManualPushNotificationId(resData?.notification?.id);
            // Verifica se o e-mail foi realmente enviado
            const emailInfo = resData.email;
            if (emailInfo && !emailInfo.sent && emailInfo.error) {
              // Notificação in-app criada, mas e-mail NÃO foi enviado
              errorMsg = emailInfo.error;
              setEmailSendQueue(prev => prev.map(item =>
                item.id === targetId
                  ? { ...item, status: 'error', error: `Notificação criada, mas e-mail não enviado: ${emailInfo.error}` }
                  : item
              ));
            } else {
              successCount++;
              setEmailSendQueue(prev => prev.map(item =>
                item.id === targetId
                  ? { ...item, status: 'success', email: emailInfo?.to || undefined }
                  : item
              ));
            }
          } else {
            const msg = resData.error || 'Erro no envio';
            errorMsg = msg;
            setEmailSendQueue(prev => prev.map(item => item.id === targetId ? { ...item, status: 'error', error: msg } : item));
          }
        } catch (err: any) {
          errorMsg = err.message;
          setEmailSendQueue(prev => prev.map(item => item.id === targetId ? { ...item, status: 'error', error: err.message } : item));
        }
      }

      if (successCount > 0) {
        setNotifSendSuccess(true);
        setNotifTitle('');
        setNotifContent('');
        await refreshPushNotificationLogs();
      } else {
        setNotifSendError(errorMsg || 'Falha ao enviar e-mails.');
      }
    } catch (err: any) {
      console.error('Erro ao disparar e-mails:', err);
      setNotifSendError(err.message || 'Erro inesperado.');
    } finally {
      setNotifSending(false);
    }
  };

  const [editEndsAt, setEditEndsAt] = useState('');
  const [editUserStatus, setEditUserStatus] = useState<'active' | 'pending' | 'inactive'>('active');

  const fetchPlans = async () => {
    setLoadingPlans(true);
    setPlansError('');
    try {
      const { data, error } = await supabase
        .from('plans')
        .select('*')
        .order('price', { ascending: true });
      if (error) throw error;
      setPlans(data || []);
      
      const editData: Record<string, any> = {};
      if (data) {
        data.forEach(plan => {
          editData[plan.id] = {
            name: plan.name,
            description: plan.description || '',
            price: plan.price.toString(),
            equivalent_monthly_price: plan.equivalent_monthly_price ? plan.equivalent_monthly_price.toString() : '',
            tag_text: plan.tag_text || '',
            discount_text: plan.discount_text || '',
            button_text_simulate: plan.button_text_simulate || '',
            stripe_sandbox_price_id: plan.stripe_sandbox_price_id || '',
            stripe_prod_price_id: plan.stripe_prod_price_id || '',
            featuresText: plan.features ? plan.features.join('\n') : ''
          };
        });
      }
      setEditingPlans(editData);
    } catch (err: any) {
      console.error("Erro ao buscar planos:", err);
      setPlansError('Falha ao carregar planos: ' + err.message);
    } finally {
      setLoadingPlans(false);
    }
  };

  const handlePlanFieldChange = (planId: string, field: string, value: string) => {
    setEditingPlans(prev => ({
      ...prev,
      [planId]: {
        ...prev[planId],
        [field]: value
      }
    }));
  };

  const handleSavePlan = async (planId: string, updatedPlanData: any) => {
    setSavingPlanId(planId);
    setPlansError('');
    setPlansSuccess('');
    try {
      const priceVal = parseFloat(updatedPlanData.price);
      if (isNaN(priceVal)) throw new Error("Preço inválido.");
      
      const equivPriceVal = updatedPlanData.equivalent_monthly_price ? parseFloat(updatedPlanData.equivalent_monthly_price) : null;
      if (updatedPlanData.equivalent_monthly_price && isNaN(equivPriceVal as number)) {
        throw new Error("Preço mensal equivalente inválido.");
      }

      const featuresArray = updatedPlanData.featuresText
        .split('\n')
        .map((f: string) => f.trim())
        .filter((f: string) => f.length > 0);

      const { error } = await supabase
        .from('plans')
        .update({
          name: updatedPlanData.name,
          description: updatedPlanData.description || null,
          price: priceVal,
          equivalent_monthly_price: equivPriceVal,
          tag_text: updatedPlanData.tag_text || null,
          discount_text: updatedPlanData.discount_text || null,
          button_text_simulate: updatedPlanData.button_text_simulate,
          stripe_sandbox_price_id: updatedPlanData.stripe_sandbox_price_id || null,
          stripe_prod_price_id: updatedPlanData.stripe_prod_price_id || null,
          features: featuresArray,
          updated_at: new Date().toISOString()
        })
        .eq('id', planId);

      if (error) throw error;
      setPlansSuccess(`Plano "${updatedPlanData.name}" atualizado com sucesso!`);
      await fetchPlans();
      setTimeout(() => setPlansSuccess(''), 5000);
    } catch (err: any) {
      console.error("Erro ao salvar plano:", err);
      setPlansError('Erro ao salvar plano: ' + err.message);
    } finally {
      setSavingPlanId(null);
    }
  };

  useEffect(() => {
    if (user && activeTab === 'plans') {
      fetchPlans();
    }
  }, [user, activeTab]);

  // Efeito para buscar profissionais caso seja admin logado
  useEffect(() => {
    if (!user || profileRole !== 'admin') {
      setLoading(false);
      return;
    }

    void refreshProfessionals();

    const channel = supabase
      .channel('professionals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professionals' }, () => {
        void refreshProfessionals(false);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profileRole]);

  useEffect(() => {
    const fetchAccessControlSettings = async () => {
      if (!user || profileRole !== 'admin' || activeTab !== 'professionals') {
        return;
      }

      setAccessControlLoading(true);
      setAccessControlError('');

      try {
        const { data, error } = await supabase
          .from('settings')
          .select('api_key')
          .eq('id', 'access_control_settings')
          .maybeSingle();

        if (error) throw error;

        if (data?.api_key) {
          try {
            const parsed = JSON.parse(data.api_key);
            setAccessControlRequireApproval(parsed.require_approval !== false);
          } catch (parseError) {
            console.error('Erro ao interpretar configuracao de acesso:', parseError);
            setAccessControlRequireApproval(true);
          }
        } else {
          setAccessControlRequireApproval(true);
        }
      } catch (err: any) {
        console.error('Erro ao carregar configuracao de acesso:', err);
        setAccessControlError(err.message || 'Erro ao carregar configuracao de acesso.');
      } finally {
        setAccessControlLoading(false);
      }
    };

    fetchAccessControlSettings();
  }, [user, profileRole, activeTab]);

  // Efeito para carregar chave Gemini
  useEffect(() => {
    const fetchGeminiKey = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('api_key')
          .eq('id', 'gemini')
          .single();
        if (!error && data?.api_key) {
          const raw = data.api_key as string;
          // Suporta tanto formato JSON quanto string simples (legado)
          try {
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
              setCurrentGeminiKey(parsed.key || parsed.api_key || '');
              if (parsed.model) setSelectedGeminiModel(normalizeSavedGeminiModel(parsed.model));
            } else {
              setCurrentGeminiKey(raw);
            }
          } catch {
            setCurrentGeminiKey(raw);
          }
        }
      } catch (error) {
        console.error("Erro ao buscar chave do Gemini:", error);
      }
    };
    
    if (user && profileRole === 'admin' && activeTab === 'token_usage') {
      fetchGeminiKey();
    }
  }, [user, profileRole, activeTab]);

  // Efeito para carregar as chaves de Pagamento do Google Pay/Stripe
  useEffect(() => {
    const fetchPaymentSettings = async () => {
      setPaymentSettingsLoading(true);
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('api_key')
          .eq('id', 'payment_settings')
          .single();
        
        if (!error && data && data.api_key) {
          const parsed = JSON.parse(data.api_key);
          setPaymentEnvironment(parsed.environment || 'TEST');
          setGoogleMerchantId(parsed.googleMerchantId || '');
          setStripeProdPublishableKey(parsed.stripeProdPublishableKey || '');
          setStripeProdSecretKey(parsed.stripeProdSecretKey || '');
          setStripeSandboxPublishableKey(parsed.stripeSandboxPublishableKey || '');
          setStripeSandboxSecretKey(parsed.stripeSandboxSecretKey || '');
          setStripeWebhookSecretProd(parsed.stripeWebhookSecretProd || '');
          setStripeWebhookSecretSandbox(parsed.stripeWebhookSecretSandbox || '');
        } else {
          // Preencher com as credenciais padrão se não houver dados salvos
          setPaymentEnvironment('TEST');
          setGoogleMerchantId('BCR2DN7TTCHMTFAJ');
          setStripeProdPublishableKey('pk_live_wDyGJo2Rl2ikV2HaBXzZey1o');
          setStripeProdSecretKey('');
          setStripeSandboxPublishableKey('pk_test_0b7fQSiyaxD7OjUH6lKL6Slh');
          setStripeSandboxSecretKey('');
          setStripeWebhookSecretProd('');
          setStripeWebhookSecretSandbox('');
        }
      } catch (err) {
        console.error("Erro ao buscar configurações de pagamento:", err);
      } finally {
        setPaymentSettingsLoading(false);
      }
    };

    if (user && profileRole === 'admin' && activeTab === 'google_pay_config') {
      fetchPaymentSettings();
    }
  }, [user, profileRole, activeTab]);

  // Efeito para carregar os logs de consumo do Supabase
  useEffect(() => {
    if (!user || profileRole !== 'admin' || activeTab !== 'token_usage') {
      return;
    }

    const fetchUsageLogs = async () => {
      setLoadingUsage(true);
      const { data, error } = await supabase
        .from('usage_logs')
        .select(`
          id,
          professional_id,
          model,
          prompt_tokens,
          candidates_tokens,
          total_tokens,
          cost_usd,
          audio_duration_seconds,
          created_at,
          professionals (
            full_name,
            google_email
          )
        `)
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error("Erro ao carregar logs de consumo:", error);
      } else {
        const formattedLogs = (data || []).map((log: any) => ({
          id: log.id,
          professional_id: log.professional_id,
          professional_name: log.professionals?.full_name || 'Profissional',
          professional_email: log.professionals?.google_email || '',
          model: log.model,
          prompt_tokens: log.prompt_tokens,
          candidates_tokens: log.candidates_tokens,
          total_tokens: log.total_tokens,
          cost_usd: Number(log.cost_usd || 0),
          audio_duration_seconds: Number(log.audio_duration_seconds || 0),
          created_at: log.created_at
        }));
        setUsageLogs(formattedLogs);
      }
      setLoadingUsage(false);
    };

    fetchUsageLogs();
  }, [user, profileRole, activeTab]);

  // Efeito para carregar as transações
  useEffect(() => {
    const fetchTransactions = async () => {
      setLoadingAdminTransactions(true);
      try {
        const { data, error } = await supabase
          .from('transactions')
          .select(`
            *,
            professionals (
              full_name,
              google_email
            )
          `)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setAdminTransactions(data || []);
      } catch (err) {
        console.error("Erro ao buscar transações no admin:", err);
      } finally {
        setLoadingAdminTransactions(false);
      }
    };

    if (user && profileRole === 'admin' && activeTab === 'transactions') {
      fetchTransactions();
    }
  }, [user, profileRole, activeTab]);

  // Estados para Suporte de Tickets (Admin)
  const [adminTickets, setAdminTickets] = useState<any[]>([]);
  const [loadingAdminTickets, setLoadingAdminTickets] = useState(false);
  const [adminTicketsError, setAdminTicketsError] = useState('');
  const [supportStatusFilter, setSupportStatusFilter] = useState('open_in_progress');
  const [supportCategoryFilter, setSupportCategoryFilter] = useState('all');
  const [supportPlanFilter, setSupportPlanFilter] = useState('all');
  const [supportSearchQuery, setSupportSearchQuery] = useState('');

  const fetchAdminTickets = async (showLoading = true) => {
    if (showLoading) setLoadingAdminTickets(true);
    setAdminTicketsError('');
    try {
      const data = await fetchAdminSupportTickets();
      setAdminTickets(data);
    } catch (err: any) {
      console.error('Erro ao buscar chamados no admin:', err);
      setAdminTicketsError('Não foi possível carregar os chamados.');
    } finally {
      if (showLoading) setLoadingAdminTickets(false);
    }
  };

  const unreadSupportMessagesCount = adminTickets.filter(
    (ticket) => ticket.latestMessageSenderRole === 'user' && isSupportTicketUnread(ticket, 'admin')
  ).length;

  useEffect(() => {
    if (user && profileRole === 'admin' && activeTab === 'support') {
      fetchAdminTickets(true);

      const unsubscribeTickets = subscribeToAllSupportTickets(() => {
        fetchAdminTickets(false);
      });
      const unsubscribeMessages = subscribeToAllSupportMessages(() => {
        fetchAdminTickets(false);
      });

      return () => {
        unsubscribeTickets();
        unsubscribeMessages();
      };
    }
  }, [user, profileRole, activeTab]);

  // Manipulador de login do admin
  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setLoginError('Preencha todos os campos.');
      return;
    }

    setLoginLoading(true);
    setLoginError('');

    try {
      const { data: signInData, error: signInError } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (signInError) throw signInError;
      const loggedUser = signInData?.user;

      if (!loggedUser) {
        throw new Error("Erro ao carregar usuário.");
      }

      // No Supabase, consultamos a tabela professionals para ver o perfil e redirecionar corretamente
      const { data: profData, error: profError } = await supabase
        .from('professionals')
        .select('*')
        .eq('id', loggedUser.id)
        .single();

      if (!profError && profData && (profData.role === 'admin' || profData.role === 'therapist')) {
        setProfileInfo(
          profData.status,
          profData.role,
          profData.subscription_plan,
          profData.subscription_status,
          profData.subscription_ends_at,
          profData.trial_ends_at
        );
        setUser(loggedUser);
        if (profData.role === 'therapist') {
          completeOnboarding(loggedUser.id);
          navigate('/painel/dashboard', { replace: true });
        } else {
          navigate('/admin/professionals', { replace: true });
        }
      } else {
        await supabase.auth.signOut();
        setUser(null);
        setProfileInfo(null, null, null, null, null, null);
        setLoginError('Acesso recusado. Esta conta nao possui privilegios de administrador.');
      }
    } catch (error: any) {
      console.error("Erro no login do administrador:", error);
      setLoginError(`Falha na autenticacao: ${error.message || error}`);
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUpdateStatus = async (prof: Professional, newStatus: 'active' | 'inactive') => {
    if (updatingId) return;
    setUpdatingId(prof.id);
    try {
      const { error } = await supabase
        .from('professionals')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', prof.id);
      if (error) throw error;

      setProfessionals(prev =>
        prev.map(item =>
          item.id === prof.id
            ? { ...item, status: newStatus }
            : item
        )
      );

      void refreshProfessionals(false);

      if (newStatus === 'active' && prof.status !== 'active') {
        try {
          await notifyProfessionalApproval(prof.id);
        } catch (notifyError: any) {
          console.error('Erro ao notificar aprovação do profissional:', notifyError);
          alert(`Acesso liberado, mas houve falha ao enviar a notificação de aprovação: ${notifyError.message || notifyError}`);
        }
      }
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error);
      alert(`Falha ao atualizar status: ${error.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleForceGoogleDisconnect = async (prof: Professional) => {
    if (updatingId) return;
    const confirmed = window.confirm(
      `Deseja forçar a desconexão do Google para ${prof.full_name} (${prof.google_email})?\n\n` +
      'O usuário será desconectado e obrigado a selecionar a conta e conceder permissões novamente no próximo login.'
    );
    if (!confirmed) return;

    setUpdatingId(prof.id);
    try {
      const { error } = await supabase
        .from('professionals')
        .update({
          force_google_disconnect: true,
          updated_at: new Date().toISOString()
        })
        .eq('id', prof.id);
      if (error) throw error;

      alert(`Desconexão do Google solicitada com sucesso para ${prof.full_name}.`);
    } catch (error: any) {
      console.error("Erro ao solicitar desconexão do Google:", error);
      alert(`Falha ao solicitar desconexão: ${error.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  const handleDeleteProfessional = async (prof: Professional) => {
    if (!user) return;

    if (prof.id === user.id) {
      alert('Não é possível excluir a própria conta administrativa.');
      return;
    }

    const confirmed = window.confirm(
      `Tem certeza que deseja excluir permanentemente ${prof.full_name} (${prof.google_email})?\n\n` +
      'Esta ação remove o acesso, o perfil e os dados vinculados. Não poderá ser desfeita.'
    );

    if (!confirmed) return;

    setDeletingUserId(prof.id);

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');

      const res = await fetch(`/api/admin/professionals/${prof.id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`
        }
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao excluir usuário.');
      }

      setProfessionals(prev => prev.filter(item => item.id !== prof.id));
      setAdminTransactions(prev => prev.filter(tx => tx.professional_id !== prof.id));
      setUsageLogs(prev => prev.filter(log => log.professional_id !== prof.id));
      setAdminTickets(prev => prev.filter(ticket => ticket.userId !== prof.id));
      await refreshPushNotificationLogs();

      if (editingProf?.id === prof.id) {
        setEditingProf(null);
      }

      if (selectedProfessionalId === prof.id) {
        setSelectedProfessionalId('');
      }

      alert(data.message || 'Usuário excluído permanentemente.');
    } catch (error: any) {
      console.error('Erro ao excluir usuário:', error);
      alert(`Falha ao excluir usuário: ${error.message || error}`);
    } finally {
      setDeletingUserId(null);
    }
  };

  const handleOpenEditSubscription = (prof: Professional) => {
    setEditingProf(prof);
    setEditPlan(prof.subscription_plan || 'trial');
    setEditStatus(prof.subscription_status || 'trialing');
    setEditEndsAt(prof.subscription_ends_at ? prof.subscription_ends_at.substring(0, 16) : '');
    setEditUserStatus(prof.status);
  };

  const handleSaveSubscription = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProf) return;
    setUpdatingId(editingProf.id);

    try {
      const updateData: any = {
        subscription_plan: editPlan,
        subscription_status: editStatus,
        subscription_ends_at: editEndsAt ? new Date(editEndsAt).toISOString() : null,
        status: editUserStatus,
        updated_at: new Date().toISOString()
      };

      const { error } = await supabase
        .from('professionals')
        .update(updateData)
        .eq('id', editingProf.id);
      if (error) throw error;

      setProfessionals(prev =>
        prev.map(item =>
          item.id === editingProf.id
            ? {
                ...item,
                subscription_plan: editPlan,
                subscription_status: editStatus,
                subscription_ends_at: editEndsAt ? new Date(editEndsAt).toISOString() : null,
                status: editUserStatus
              }
            : item
        )
      );

      void refreshProfessionals(false);

      if (editingProf.status !== 'active' && editUserStatus === 'active') {
        try {
          await notifyProfessionalApproval(editingProf.id);
        } catch (notifyError: any) {
          console.error('Erro ao notificar aprovação do profissional:', notifyError);
          alert(`Assinatura salva, mas houve falha ao enviar a notificação de aprovação: ${notifyError.message || notifyError}`);
        }
      }
      setEditingProf(null);
      alert("Assinatura do profissional atualizada com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar assinatura:", error);
      alert(`Erro ao atualizar assinatura: ${error.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Salvar Chave Gemini no Supabase
  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    // Permite salvar apenas o modelo sem trocar a chave
    if (!newGeminiKey && !currentGeminiKey) {
      alert('Por favor, insira uma chave API do Gemini antes de salvar.');
      return;
    }

    setSaveLoading(true);
    setSaveSuccess(false);

    try {
      // Usa a nova chave se fornecida, caso contrário mantém a atual
      const keyToSave = newGeminiKey || currentGeminiKey;

      // Salva como JSON com chave + modelo selecionado
      const payload = JSON.stringify({
        key: keyToSave,
        model: selectedGeminiModel,
      });

      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 'gemini',
          api_key: payload,
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'admin'
        });
      if (error) throw error;
      if (newGeminiKey) setCurrentGeminiKey(newGeminiKey);
      setNewGeminiKey('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (error: any) {
      console.error("Erro ao salvar configurações do Gemini:", error);
      alert(`Erro ao salvar configurações do Gemini: ${error.message}`);
    } finally {
      setSaveLoading(false);
    }
  };

  // Salvar Configurações de Pagamento (Google Pay & Stripe)
  const handleSavePaymentSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setPaymentSaveLoading(true);
    setPaymentSaveSuccess(false);

    try {
      const payload = {
        environment: paymentEnvironment,
        googleMerchantId,
        stripeProdPublishableKey,
        stripeProdSecretKey,
        stripeSandboxPublishableKey,
        stripeSandboxSecretKey,
        stripeWebhookSecretProd,
        stripeWebhookSecretSandbox
      };

      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 'payment_settings',
          api_key: JSON.stringify(payload),
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'admin'
        });

      if (error) throw error;
      setPaymentSaveSuccess(true);
      setTimeout(() => setPaymentSaveSuccess(false), 5000);
    } catch (error: any) {
      console.error("Erro ao salvar configurações de pagamento:", error);
      alert(`Erro ao salvar configurações de pagamento: ${error.message}`);
    } finally {
      setPaymentSaveLoading(false);
    }
  };

  const refreshProfessionals = async (showLoading = true) => {
    if (!user || profileRole !== 'admin') return;

    if (showLoading) {
      setLoading(true);
    }

    try {
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) {
        console.error("Erro ao carregar profissionais:", error);
        return;
      }

      setProfessionals(data || []);
    } finally {
      if (showLoading) {
        setLoading(false);
      }
    }
  };

  const notifyProfessionalApproval = async (targetUserId: string) => {
    const session = await supabase.auth.getSession();
    const token = session.data.session?.access_token;
    if (!token) {
      throw new Error('Não autenticado.');
    }

    const res = await fetch('/api/onboarding/approved', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ targetUserId })
    });

    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao enviar notificação de aprovação.');
    }

    return data;
  };

  const handleToggleAccessControl = async () => {
    if (!user || accessControlSaving) return;

    const nextRequireApproval = !accessControlRequireApproval;
    setAccessControlSaving(true);
    setAccessControlError('');
    setAccessControlSuccess('');
    setAccessControlRequireApproval(nextRequireApproval);

    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 'access_control_settings',
          api_key: JSON.stringify({
            require_approval: nextRequireApproval
          }),
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'admin'
        });

      if (error) throw error;

      setAccessControlSuccess(
        nextRequireApproval
          ? 'Bloqueio de novos cadastros ativado. Novos profissionais ficarão pendentes.'
          : 'Bloqueio de novos cadastros desativado. Novos profissionais serão ativados automaticamente.'
      );
      setTimeout(() => setAccessControlSuccess(''), 5000);

      void refreshProfessionals(false);
    } catch (err: any) {
      console.error('Erro ao salvar configuracao de acesso:', err);
      setAccessControlRequireApproval(!nextRequireApproval);
      setAccessControlError(err.message || 'Erro ao salvar configuracao de acesso.');
    } finally {
      setAccessControlSaving(false);
    }
  };

  const handleCreateProfessional = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newProfessionalFirstName.trim() || !newProfessionalLastName.trim() || !newProfessionalEmail.trim() || !newProfessionalPassword) {
      setCreateProfessionalError('Preencha nome, sobrenome, e-mail e senha.');
      return;
    }

    if (newProfessionalPassword.length < 6) {
      setCreateProfessionalError('A senha deve ter pelo menos 6 caracteres.');
      return;
    }

    setCreatingProfessional(true);
    setCreateProfessionalError('');
    setCreateProfessionalSuccess('');

    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) throw new Error('Não autenticado.');

      const res = await fetch('/api/admin/professionals', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({
          firstName: newProfessionalFirstName.trim(),
          lastName: newProfessionalLastName.trim(),
          email: newProfessionalEmail.trim(),
          password: newProfessionalPassword
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || 'Falha ao criar profissional.');
      }

      await refreshProfessionals(false);

      setNewProfessionalFirstName('');
      setNewProfessionalLastName('');
      setNewProfessionalEmail('');
      setNewProfessionalPassword('');
      setShowNewProfessionalPassword(false);

      const createdLabel = data.user?.full_name || 'Profissional';
      if (data.status === 'pending') {
        setCreateProfessionalSuccess(`${createdLabel} criado com sucesso e ficou pendente de aprovação.`);
      } else {
        setCreateProfessionalSuccess(`${createdLabel} criado com sucesso e foi liberado automaticamente.`);
      }

      setTimeout(() => setCreateProfessionalSuccess(''), 5000);
    } catch (error: any) {
      console.error('Erro ao criar profissional manualmente:', error);
      setCreateProfessionalError(error.message || 'Erro ao criar profissional.');
    } finally {
      setCreatingProfessional(false);
    }
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    setUser(null);
    setProfileInfo(null, null, null, null, null, null);
    navigate('/login');
  };

  // Mascarar Chave API
  const maskKey = (key: string) => {
    if (!key) return 'Nenhuma chave cadastrada';
    if (key.length <= 12) return '••••••••••••';
    return `${key.substring(0, 6)}••••••••••••${key.substring(key.length - 6)}`;
  };

  // Se nao estiver logado ou nao for admin, renderiza o formulario de login
  if (user && profileRole === 'therapist') {
    return <Navigate to="/painel/dashboard" replace />;
  }

  if (!user || profileRole !== 'admin') {
    return (
      <div className="min-h-screen bg-brand-bg flex flex-col justify-center items-center px-4 sm:px-6 lg:px-8 animate-fadeIn">
        <div className="max-w-md w-full space-y-8">
          <div className="text-center">
            <div className="mx-auto h-16 w-16 bg-brand-primary/10 rounded-2xl flex items-center justify-center border border-brand-primary/10">
              <ShieldCheck className="h-10 w-10 text-brand-primary" />
            </div>
            <h2 className="mt-6 text-center text-3xl font-display font-bold text-brand-primary tracking-tight">
              Acesso ao Painel Admin
            </h2>
            <p className="mt-2 text-center text-sm text-brand-text-muted">
              Insira suas credenciais de acesso para entrar no fluxo administrativo ou no painel do terapeuta.
            </p>
          </div>

          <div className="card p-8 bg-white/95 shadow-xl border-brand-primary/10 relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-primary to-brand-accent" />
            
            <form className="space-y-6" onSubmit={handleAdminLogin}>
              {loginError && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start space-x-2 text-xs text-red-600 animate-shake">
                  <ShieldAlert className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <span className="leading-relaxed">{loginError}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="text-xs font-semibold text-brand-text uppercase tracking-wider block">
                  E-mail de acesso
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                  <input
                    type="email"
                    required
                    placeholder="seuemail@exemplo.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors bg-brand-bg/10"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-semibold text-brand-text uppercase tracking-wider block">
                  Senha
                </label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                  <input
                    type="password"
                    required
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors bg-brand-bg/10"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loginLoading}
                className="w-full btn-primary py-3.5 text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-brand-primary/10 transition-all hover:shadow-xl active:scale-95 disabled:opacity-60 cursor-pointer"
              >
                {loginLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Autenticando...</span>
                  </>
                ) : (
                  <>
                    <span>Entrar no Painel</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="text-center">
            <button
              onClick={() => navigate('/login')}
              className="text-xs font-medium text-brand-primary hover:text-brand-primary-hover transition-colors underline cursor-pointer"
            >
              Voltar para login de profissionais
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Contadores de Profissionais
  const totalCount = professionals.length;
  const activeCount = professionals.filter(p => p.status === 'active').length;
  const pendingCount = professionals.filter(p => p.status === 'pending').length;
  const inactiveCount = professionals.filter(p => p.status === 'inactive').length;

  // Filtragem de Profissionais
  const filteredProfessionals = professionals.filter((p) => {
    const matchesSearch = 
      p.full_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.google_email.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // Métricas de Consumo
  const totalUsageCostUsd = usageLogs.reduce((acc, log) => acc + (log.cost_usd || 0), 0);
  const totalUsageTokens = usageLogs.reduce((acc, log) => acc + (log.total_tokens || 0), 0);
  const totalUsageDurationSeconds = usageLogs.reduce((acc, log) => acc + (log.audio_duration_seconds || 0), 0);
  const totalCallsCount = usageLogs.length;

  // Agrupamento por Usuário
  const userSummaries: { [key: string]: UserUsageSummary } = {};
  usageLogs.forEach(log => {
    const pid = log.professional_id;
    if (!userSummaries[pid]) {
      userSummaries[pid] = {
        id: pid,
        name: log.professional_name,
        email: log.professional_email,
        callsCount: 0,
        promptTokens: 0,
        candidatesTokens: 0,
        totalTokens: 0,
        totalCostUsd: 0,
        totalDurationSeconds: 0
      };
    }
    userSummaries[pid].callsCount += 1;
    userSummaries[pid].promptTokens += log.prompt_tokens;
    userSummaries[pid].candidatesTokens += log.candidates_tokens;
    userSummaries[pid].totalTokens += log.total_tokens;
    userSummaries[pid].totalCostUsd += log.cost_usd;
    userSummaries[pid].totalDurationSeconds += (log.audio_duration_seconds || 0);
  });
  
  // Filtragem e busca na aba de consumo
  const userSummariesList = Object.values(userSummaries)
    .filter(u => 
      u.name.toLowerCase().includes(usageSearchTerm.toLowerCase()) ||
      u.email.toLowerCase().includes(usageSearchTerm.toLowerCase())
    )
    .sort((a, b) => b.totalCostUsd - a.totalCostUsd);

  const filteredHistoryLogs = usageLogs.filter(log =>
    log.professional_name.toLowerCase().includes(usageSearchTerm.toLowerCase()) ||
    log.professional_email.toLowerCase().includes(usageSearchTerm.toLowerCase())
  );

  const formatDate = (isoString?: string) => {
    if (!isoString) return '-';
    try {
      const date = new Date(isoString);
      return date.toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '-';
    }
  };

  const formatInboxDate = (isoString: string) => {
    try {
      return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short'
      }).format(new Date(isoString));
    } catch {
      return '-';
    }
  };

  const adminInboxUnreadCount = adminInboxNotifications.filter((notification) => !notification.read_at).length;

  const formatCost = (usd: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 4,
      maximumFractionDigits: 4
    }).format(usd);
  };

  const formatBRL = (usd: number) => {
    // Conversão fixa informativa de R$ 5,50 por dólar
    return new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(usd * 5.50);
  };

  const formatDuration = (seconds?: number) => {
    if (!seconds) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col">
      <main className="p-4 md:p-8 max-w-[1360px] mx-auto flex-1 w-full space-y-8 animate-fadeIn">
        {/* Cabecalho */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-brand-border/60 pb-6">
          <div>
            <h1 className="text-3xl font-display font-bold text-brand-primary">
              Painel do Administrador
            </h1>
            <p className="text-sm text-brand-text-muted mt-1">
              Controle geral da plataforma, aprovacao de usuarios e chaves de IA.
            </p>
          </div>
          <div className="flex gap-3 self-start md:self-auto">
            <button
              onClick={() => setAdminInboxOpen((prev) => !prev)}
              className="inline-flex items-center space-x-2 px-4 py-2 border border-brand-border text-brand-text bg-white rounded-xl hover:bg-brand-bg transition-colors text-sm font-semibold shadow-sm cursor-pointer relative"
            >
              <Bell className="w-4 h-4" />
              <span>Notificações</span>
              {adminInboxUnreadCount > 0 && (
                <span className="absolute -top-2 -right-2 min-w-5 h-5 px-1 bg-red-500 text-white text-[10px] font-bold rounded-full flex items-center justify-center border border-white shadow">
                  {adminInboxUnreadCount}
                </span>
              )}
            </button>
            <button
              onClick={() => navigate('/painel/dashboard')}
              className="inline-flex items-center space-x-2 px-4 py-2 border border-brand-border text-brand-text bg-white rounded-xl hover:bg-brand-bg transition-colors text-sm font-semibold shadow-sm cursor-pointer"
            >
              <span>Ir para o Aplicativo</span>
            </button>
            <button
              onClick={handleLogout}
              className="inline-flex items-center space-x-2 px-4 py-2 border border-red-200 text-red-600 rounded-xl hover:bg-red-50 transition-colors text-sm font-semibold shadow-sm cursor-pointer"
            >
              <LogOut className="w-4 h-4" />
              <span>Sair Administrativo</span>
            </button>
          </div>
        </div>

        {/* Layout com Menu Lateral */}
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Menu Lateral do Admin */}
          <div className="w-full lg:w-64 flex-shrink-0">
            <nav className="grid grid-cols-1 gap-2 p-2 bg-white rounded-2xl border border-brand-border shadow-sm sm:grid-cols-2 lg:flex lg:flex-col">
              {adminNavItems.map((item) => {
                const Icon = item.icon;
                const isActive = activeTab === item.key;

                return (
                  <button
                    key={item.key}
                    onClick={() => setActiveTab(item.key)}
                    className={`flex w-full min-w-0 items-center justify-start gap-3 rounded-xl px-4 py-3 text-left text-sm font-medium transition-all duration-200 cursor-pointer ${
                      isActive
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                    }`}
                  >
                    <Icon size={18} className="shrink-0" />
                    <span className="min-w-0 leading-tight">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          {/* Conteudo Principal das Abas */}
          <div className="flex-1 min-w-0">
            {activeTab === 'professionals' ? (
              <div className="space-y-6">
                <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="flex items-start space-x-3">
                      <div className={`p-3 rounded-xl ${accessControlRequireApproval ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>
                        <Shield className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                          Bloqueio de novos cadastros
                        </h2>
                        <p className="text-xs text-brand-text-muted mt-0.5 max-w-2xl">
                          Quando ativado, toda conta criada na plataforma entra como pendente e precisa de liberação. Quando desativado, o acesso é liberado automaticamente após o cadastro.
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-checked={accessControlRequireApproval}
                      onClick={handleToggleAccessControl}
                      disabled={accessControlSaving || accessControlLoading}
                      className={`relative inline-flex h-12 w-24 items-center rounded-full border transition-all duration-200 cursor-pointer shadow-sm disabled:opacity-50 ${
                        accessControlRequireApproval
                          ? 'bg-amber-100 border-amber-200'
                          : 'bg-emerald-100 border-emerald-200'
                      }`}
                    >
                      <span
                        className={`inline-flex h-10 w-10 transform items-center justify-center rounded-full bg-white shadow-md transition-transform duration-200 ${
                          accessControlRequireApproval ? 'translate-x-1' : 'translate-x-[2.75rem]'
                        }`}
                      >
                        {accessControlSaving || accessControlLoading ? (
                          <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                        ) : accessControlRequireApproval ? (
                          <ShieldAlert className="w-4 h-4 text-amber-600" />
                        ) : (
                          <Check className="w-4 h-4 text-emerald-600" />
                        )}
                      </span>
                    </button>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
                      accessControlRequireApproval
                        ? 'bg-amber-50 text-amber-700 border-amber-100'
                        : 'bg-emerald-50 text-emerald-700 border-emerald-100'
                    }`}>
                      {accessControlRequireApproval ? 'Aprovação obrigatória' : 'Cadastro liberado automaticamente'}
                    </span>
                    <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-brand-bg text-brand-text-muted border-brand-border">
                      {accessControlLoading ? 'Carregando regra...' : accessControlSaving ? 'Salvando alteração...' : 'Atualizado via settings'}
                    </span>
                  </div>

                  {accessControlError && (
                    <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-xl text-red-800 text-xs flex gap-2">
                      <ShieldAlert className="flex-shrink-0 text-red-600" size={16} />
                      <span>{accessControlError}</span>
                    </div>
                  )}

                  {accessControlSuccess && (
                    <div className="mt-4 p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-xs flex gap-2">
                      <Check className="flex-shrink-0 text-emerald-600" size={16} />
                      <span>{accessControlSuccess}</span>
                    </div>
                  )}
                </div>

                <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                  <div className="flex items-center space-x-3 mb-5">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <UserPlus className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                        Adicionar Profissional
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Crie uma conta manualmente. A regra de aprovação definida acima será aplicada automaticamente.
                      </p>
                    </div>
                  </div>

                  <form onSubmit={handleCreateProfessional} className="space-y-4">
                    {createProfessionalSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-xs flex gap-2">
                        <Check className="flex-shrink-0 text-emerald-600" size={16} />
                        <span>{createProfessionalSuccess}</span>
                      </div>
                    )}

                    {createProfessionalError && (
                      <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-800 text-xs flex gap-2">
                        <ShieldAlert className="flex-shrink-0 text-red-600" size={16} />
                        <span>{createProfessionalError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Nome</label>
                        <input
                          type="text"
                          value={newProfessionalFirstName}
                          onChange={(e) => setNewProfessionalFirstName(e.target.value)}
                          placeholder="Ex: Ana"
                          required
                          className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Sobrenome</label>
                        <input
                          type="text"
                          value={newProfessionalLastName}
                          onChange={(e) => setNewProfessionalLastName(e.target.value)}
                          placeholder="Ex: Souza"
                          required
                          className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">E-mail</label>
                        <input
                          type="email"
                          value={newProfessionalEmail}
                          onChange={(e) => setNewProfessionalEmail(e.target.value)}
                          placeholder="profissional@exemplo.com"
                          required
                          className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Senha</label>
                        <div className="relative">
                          <input
                            type={showNewProfessionalPassword ? 'text' : 'password'}
                            value={newProfessionalPassword}
                            onChange={(e) => setNewProfessionalPassword(e.target.value)}
                            placeholder="Mínimo 6 caracteres"
                            required
                            className="w-full px-3.5 pr-10 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                          />
                          <button
                            type="button"
                            onClick={() => setShowNewProfessionalPassword(prev => !prev)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition-colors cursor-pointer"
                          >
                            {showNewProfessionalPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={creatingProfessional}
                        className="inline-flex items-center space-x-2 px-4 py-2.5 bg-brand-primary text-white font-semibold rounded-xl hover:bg-brand-primary-hover transition-colors disabled:opacity-50 cursor-pointer shadow-sm"
                      >
                        {creatingProfessional ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                        <span>{creatingProfessional ? 'Criando...' : 'Criar Profissional'}</span>
                      </button>
                    </div>
                  </form>
                </div>

                {/* Cards de Metricas SaaS */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="card p-5 bg-white flex items-center space-x-4 shadow-sm border border-brand-border/60">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <Users className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="text-xs text-brand-text-muted font-medium uppercase tracking-wider font-semibold">Total Usuários</p>
                      <h3 className="text-2xl font-bold font-display text-brand-primary">{totalCount}</h3>
                    </div>
                  </div>

                  <div className="card p-5 bg-white flex items-center space-x-4 shadow-sm border border-brand-border/60">
                    <div className="p-3 bg-emerald-50 rounded-xl text-emerald-600 border border-emerald-100">
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="text-xs text-brand-text-muted font-medium uppercase tracking-wider font-semibold">Assinantes Pagos</p>
                      <h3 className="text-2xl font-bold font-display text-brand-primary">
                        {professionals.filter(p => (p.subscription_plan === 'monthly' || p.subscription_plan === 'yearly') && p.subscription_status === 'active' && p.status === 'active').length}
                      </h3>
                    </div>
                  </div>

                  <div className="card p-5 bg-white flex items-center space-x-4 shadow-sm border border-brand-border/60">
                    <div className="p-3 bg-amber-50 rounded-xl text-amber-600 border border-amber-100">
                      <Clock className="w-6 h-6 animate-pulse" />
                    </div>
                    <div>
                       <p className="text-xs text-brand-text-muted font-medium uppercase tracking-wider font-semibold">Trials Ativos</p>
                      <h3 className="text-2xl font-bold font-display text-brand-primary">
                        {professionals.filter(p => p.subscription_plan === 'trial' && p.subscription_status === 'trialing' && p.status === 'active').length}
                      </h3>
                    </div>
                  </div>

                  <div className="card p-5 bg-white flex items-center space-x-4 shadow-sm border border-brand-border/60">
                    <div className="p-3 bg-brand-accent/10 rounded-xl text-brand-primary">
                      <Coins className="w-6 h-6" />
                    </div>
                    <div>
                       <p className="text-xs text-brand-text-muted font-medium uppercase tracking-wider font-semibold">MRR Estimado</p>
                      <h3 className="text-xl font-bold font-display text-brand-primary">
                        {new Intl.NumberFormat('pt-BR', {
                          style: 'currency',
                          currency: 'BRL'
                        }).format(
                          (professionals.filter(p => p.subscription_plan === 'monthly' && p.subscription_status === 'active' && p.status === 'active').length * 49.90) +
                          (professionals.filter(p => p.subscription_plan === 'yearly' && p.subscription_status === 'active' && p.status === 'active').length * (499.00 / 12))
                        )}
                      </h3>
                    </div>
                  </div>
                </div>

                {/* Controles de Filtro e Busca */}
                <div className="card p-6 bg-white space-y-4 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                    <input
                      type="text"
                      placeholder="Buscar por nome ou e-mail..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors"
                    />
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'all', label: 'Todos' },
                      { id: 'pending', label: 'Pendentes' },
                      { id: 'active', label: 'Ativos' },
                      { id: 'inactive', label: 'Inativos' }
                    ].map((tab) => (
                      <button
                        key={tab.id}
                        onClick={() => setStatusFilter(tab.id as any)}
                        className={`px-4 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer ${
                          statusFilter === tab.id
                            ? 'bg-brand-primary border-brand-primary text-white shadow-sm'
                            : 'bg-white border-brand-border text-brand-text hover:bg-brand-bg'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Tabela de Profissionais */}
                <div className="card bg-white overflow-hidden border border-brand-border">
                  {loading ? (
                    <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
                      <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                      <span className="text-sm">Carregando profissionais...</span>
                    </div>
                  ) : filteredProfessionals.length === 0 ? (
                    <div className="p-12 text-center text-brand-text-muted">
                      <Users className="w-12 h-12 mx-auto text-brand-border mb-3" />
                      <p className="font-medium text-brand-text">Nenhum profissional encontrado</p>
                      <p className="text-xs text-brand-text-muted mt-1">
                        Tente alterar os filtros de busca ou status.
                      </p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-brand-bg border-b border-brand-border/60 text-xs font-semibold text-brand-text uppercase tracking-wider">
                            <th className="p-4 pl-6">Profissional</th>
                            <th className="p-4">Contato</th>
                            <th className="p-4">Assinatura / Plano</th>
                            <th className="p-4">Vencimento</th>
                            <th className="p-4">Status</th>
                            <th className="p-4 pr-6 text-right">Acoes</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/40 text-sm text-brand-text">
                          {filteredProfessionals.map((prof) => {
                            const isAdminSelf = prof.id === user?.id;
                            return (
                              <tr key={prof.id} className="hover:bg-brand-bg/30 transition-colors">
                                <td className="p-4 pl-6">
                                  <div className="flex items-center space-x-3">
                                    <img
                                      src={prof.photo_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(prof.full_name)}&background=005C13&color=fff`}
                                      alt={prof.full_name}
                                      className="w-10 h-10 rounded-full object-cover border border-brand-border"
                                      referrerPolicy="no-referrer"
                                    />
                                    <div>
                                      <p className="font-semibold text-brand-text">{prof.full_name}</p>
                                      {isAdminSelf && (
                                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-brand-primary/10 text-brand-primary">
                                          Voce
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </td>

                                <td className="p-4 text-brand-text-muted font-medium break-all">
                                  {prof.google_email}
                                </td>

                                <td className="p-4">
                                  <div className="flex flex-col space-y-0.5">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold w-max ${
                                      prof.subscription_plan === 'monthly' || prof.subscription_plan === 'yearly'
                                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                        : prof.subscription_plan === 'trial'
                                        ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                        : 'bg-purple-50 text-purple-700 border border-purple-100'
                                    }`}>
                                      {prof.subscription_plan === 'monthly' && 'Plano Mensal'}
                                      {prof.subscription_plan === 'yearly' && 'Plano Anual'}
                                      {prof.subscription_plan === 'trial' && 'Teste (Trial)'}
                                      {prof.subscription_plan === 'none' && 'Vitalício'}
                                      {!prof.subscription_plan && 'Sem Plano'}
                                    </span>
                                    {prof.subscription_status && prof.subscription_plan !== 'none' && (
                                      <span className="text-[10px] text-brand-text-muted capitalize">
                                        Status: {prof.subscription_status === 'trialing' ? 'Testando' : prof.subscription_status}
                                      </span>
                                    )}
                                  </div>
                                </td>

                                <td className="p-4 text-brand-text-muted whitespace-nowrap text-xs">
                                  {prof.subscription_plan === 'none' ? (
                                    <span className="text-purple-600 font-medium">Nunca Expira</span>
                                  ) : prof.subscription_ends_at ? (
                                    <span className={new Date(prof.subscription_ends_at) < new Date() ? 'text-red-600 font-bold' : ''}>
                                      {formatDate(prof.subscription_ends_at)}
                                    </span>
                                  ) : (
                                    '-'
                                  )}
                                </td>

                                <td className="p-4">
                                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${
                                    prof.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-100'
                                      : prof.status === 'pending'
                                      ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                      : 'bg-red-50 text-red-700 border border-red-100'
                                  }`}>
                                    <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${
                                      prof.status === 'active'
                                        ? 'bg-emerald-500'
                                        : prof.status === 'pending'
                                        ? 'bg-amber-500 animate-pulse'
                                        : 'bg-red-500'
                                    }`} />
                                    {prof.status === 'active' ? 'Ativo' : prof.status === 'pending' ? 'Pendente' : 'Inativo'}
                                  </span>
                                </td>

                                <td className="p-4 pr-6 text-right whitespace-nowrap">
                                  {isAdminSelf ? (
                                    <div className="inline-flex gap-1.5 items-center">
                                      <span className="text-xs text-brand-text-muted italic mr-2">Administrador Geral</span>
                                      <button
                                        onClick={() => handleForceGoogleDisconnect(prof)}
                                        disabled={updatingId !== null}
                                        className="inline-flex items-center justify-center p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100 transition-colors disabled:opacity-50 cursor-pointer"
                                        title="Forçar Desconexão do Google (Testes)"
                                      >
                                        <Link2Off className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  ) : (
                                    <div className="inline-flex gap-1.5">
                                      <button
                                        onClick={() => handleOpenEditSubscription(prof)}
                                        className="inline-flex items-center justify-center p-2 rounded-lg bg-brand-bg hover:bg-brand-border/40 text-brand-primary border border-brand-border transition-colors cursor-pointer"
                                        title="Gerenciar Assinatura"
                                      >
                                        <Settings className="w-3.5 h-3.5" />
                                      </button>

                                      {prof.status !== 'active' && (
                                        <button
                                          onClick={() => handleUpdateStatus(prof, 'active')}
                                          disabled={updatingId !== null}
                                          className="inline-flex items-center justify-center p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100 transition-colors disabled:opacity-50 cursor-pointer"
                                          title="Ativar Acesso"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      
                                      {prof.status !== 'inactive' && (
                                        <button
                                          onClick={() => handleUpdateStatus(prof, 'inactive')}
                                          disabled={updatingId !== null}
                                          className="inline-flex items-center justify-center p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition-colors disabled:opacity-50 cursor-pointer"
                                          title="Suspender Acesso"
                                        >
                                          <Ban className="w-3.5 h-3.5" />
                                        </button>
                                      )}

                                      <button
                                        onClick={() => handleForceGoogleDisconnect(prof)}
                                        disabled={updatingId !== null}
                                        className="inline-flex items-center justify-center p-2 rounded-lg bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-100 transition-colors disabled:opacity-50 cursor-pointer"
                                        title="Forçar Desconexão do Google (Testes)"
                                      >
                                        <Link2Off className="w-3.5 h-3.5" />
                                      </button>

                                      <button
                                        onClick={() => handleDeleteProfessional(prof)}
                                        disabled={deletingUserId !== null || updatingId !== null}
                                        className="inline-flex items-center justify-center p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition-colors disabled:opacity-50 cursor-pointer"
                                        title="Excluir definitivamente"
                                      >
                                        {deletingUserId === prof.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                        ) : (
                                          <Trash2 className="w-3.5 h-3.5" />
                                        )}
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'google_pay_config' ? (
              /* Aba de Configuração do Google Pay & Stripe */
              <div className="space-y-6">
                <div className="card bg-white p-6 md:p-8 border-brand-border">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <CreditCard className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary">
                        Configuração do Google Pay & Stripe
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Gerencie as credenciais e defina se a plataforma opera em modo sandbox ou produção.
                      </p>
                    </div>
                  </div>

                  {/* Painel de Status de Integração */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                    <div className="p-5 bg-brand-bg/50 border border-brand-border/60 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-brand-text-muted uppercase tracking-wider font-semibold">Ambiente Ativo</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          paymentEnvironment === 'PRODUCTION' 
                            ? 'bg-emerald-100 text-emerald-800' 
                            : 'bg-amber-100 text-amber-800'
                        }`}>
                          {paymentEnvironment === 'PRODUCTION' ? 'Produção' : 'Sandbox (Testes)'}
                        </span>
                      </div>
                      <div className="text-sm font-bold text-brand-primary flex items-center space-x-1.5 pt-1">
                        <Activity className="w-4 h-4 text-brand-primary" />
                        <span>
                          {paymentEnvironment === 'PRODUCTION' ? 'Processando Vendas' : 'Pagamentos Simulados'}
                        </span>
                      </div>
                    </div>

                    <div className="p-5 bg-brand-bg/50 border border-brand-border/60 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-brand-text-muted uppercase tracking-wider font-semibold">Google Pay API</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          googleMerchantId ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {googleMerchantId ? 'Configurado' : 'Pendente'}
                        </span>
                      </div>
                      <div className="text-xs font-mono font-semibold text-brand-text truncate pt-1">
                        ID: {googleMerchantId || 'Não definido'}
                      </div>
                    </div>

                    <div className="p-5 bg-brand-bg/50 border border-brand-border/60 rounded-2xl space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] text-brand-text-muted uppercase tracking-wider font-semibold">Gateway Stripe</span>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${
                          stripeSandboxPublishableKey && stripeProdPublishableKey ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'
                        }`}>
                          {stripeSandboxPublishableKey && stripeProdPublishableKey ? 'Chaves OK' : 'Incompleto'}
                        </span>
                      </div>
                      <div className="text-xs font-semibold text-brand-text flex items-center space-x-1 pt-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                        <span>Sandbox: {stripeSandboxPublishableKey ? 'Ativa' : 'Ausente'}</span>
                      </div>
                    </div>
                  </div>

                  {paymentSettingsLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3">
                      <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                      <p className="text-sm text-brand-text-muted">Carregando credenciais...</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSavePaymentSettings} className="space-y-8">
                      {/* Seletor de Ambiente (Toggle Switch) */}
                      <div className="bg-brand-bg/60 border border-brand-border rounded-2xl p-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <h3 className="text-sm font-semibold text-brand-primary flex items-center">
                            <Globe className="w-4 h-4 mr-2 text-brand-primary" />
                            Modo de Operação
                          </h3>
                          <p className="text-xs text-brand-text-muted">
                            Alternar o ambiente afeta todos os usuários da plataforma em tempo real.
                          </p>
                        </div>
                        <div className="flex items-center space-x-3 bg-white p-2 rounded-xl border border-brand-border/60 shadow-sm">
                          <button
                            type="button"
                            onClick={() => setPaymentEnvironment('TEST')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              paymentEnvironment === 'TEST'
                                ? 'bg-amber-100 text-amber-800 shadow-sm'
                                : 'text-brand-text-muted hover:text-brand-primary'
                            }`}
                          >
                            Sandbox (Testes)
                          </button>
                          <button
                            type="button"
                            onClick={() => setPaymentEnvironment('PRODUCTION')}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                              paymentEnvironment === 'PRODUCTION'
                                ? 'bg-emerald-100 text-emerald-800 shadow-sm'
                                : 'text-brand-text-muted hover:text-brand-primary'
                            }`}
                          >
                            Produção
                          </button>
                        </div>
                      </div>

                      {/* Google Pay Merchant ID */}
                      <div className="space-y-4">
                        <h3 className="text-xs font-bold text-brand-text uppercase tracking-wider border-b border-brand-border/60 pb-1.5">
                          Google Pay API (Geral)
                        </h3>
                        <div className="space-y-2">
                          <label className="text-xs font-semibold text-brand-text-muted block">
                            Google Pay Merchant ID (Produção)
                          </label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                            <input
                              type="text"
                              required
                              placeholder="Digite seu Google Merchant ID (ex: BCR2DN...)"
                              value={googleMerchantId}
                              onChange={(e) => setGoogleMerchantId(e.target.value)}
                              className="w-full pl-10 pr-4 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Credenciais de Testes (Sandbox) */}
                      <div className="space-y-4 pt-2">
                        <h3 className="text-xs font-bold text-amber-700 uppercase tracking-wider border-b border-amber-200/60 pb-1.5 flex items-center">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-500 mr-2"></span>
                          Credenciais do Stripe - Sandbox (Testes)
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-brand-text-muted block">
                              Publishable Key (Chave Pública)
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="pk_test_..."
                              value={stripeSandboxPublishableKey}
                              onChange={(e) => setStripeSandboxPublishableKey(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors font-mono"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-brand-text-muted block">
                              Secret Key (Chave Privada)
                            </label>
                            <div className="relative">
                              <input
                                type={showStripeSandboxSecret ? "text" : "password"}
                                required
                                placeholder="sk_test_..."
                                value={stripeSandboxSecretKey}
                                onChange={(e) => setStripeSandboxSecretKey(e.target.value)}
                                className="w-full pl-4 pr-10 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setShowStripeSandboxSecret(!showStripeSandboxSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition-colors cursor-pointer"
                              >
                                {showStripeSandboxSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 mt-3">
                          <label className="text-xs font-semibold text-brand-text-muted block">
                            Webhook Signing Secret (Segredo de Assinatura do Webhook - Sandbox)
                          </label>
                          <div className="relative">
                            <input
                              type={showStripeWebhookSecretSandbox ? "text" : "password"}
                              placeholder="whsec_..."
                              value={stripeWebhookSecretSandbox}
                              onChange={(e) => setStripeWebhookSecretSandbox(e.target.value)}
                              className="w-full pl-4 pr-10 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowStripeWebhookSecretSandbox(!showStripeWebhookSecretSandbox)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition-colors cursor-pointer"
                            >
                              {showStripeWebhookSecretSandbox ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Credenciais de Vendas (Produção) */}
                      <div className="space-y-4 pt-2">
                        <h3 className="text-xs font-bold text-emerald-700 uppercase tracking-wider border-b border-emerald-200/60 pb-1.5 flex items-center">
                          <span className="inline-block w-2.5 h-2.5 rounded-full bg-emerald-500 mr-2"></span>
                          Credenciais do Stripe - Produção (Real)
                        </h3>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-brand-text-muted block">
                              Publishable Key (Chave Pública)
                            </label>
                            <input
                              type="text"
                              required
                              placeholder="pk_live_..."
                              value={stripeProdPublishableKey}
                              onChange={(e) => setStripeProdPublishableKey(e.target.value)}
                              className="w-full px-4 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors font-mono"
                            />
                          </div>
                          
                          <div className="space-y-2">
                            <label className="text-xs font-semibold text-brand-text-muted block">
                              Secret Key (Chave Privada)
                            </label>
                            <div className="relative">
                              <input
                                type={showStripeProdSecret ? "text" : "password"}
                                required
                                placeholder="sk_live_..."
                                value={stripeProdSecretKey}
                                onChange={(e) => setStripeProdSecretKey(e.target.value)}
                                className="w-full pl-4 pr-10 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors font-mono"
                              />
                              <button
                                type="button"
                                onClick={() => setShowStripeProdSecret(!showStripeProdSecret)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition-colors cursor-pointer"
                              >
                                {showStripeProdSecret ? <EyeOff size={16} /> : <Eye size={16} />}
                              </button>
                            </div>
                          </div>
                        </div>

                        <div className="space-y-2 mt-3">
                          <label className="text-xs font-semibold text-brand-text-muted block">
                            Webhook Signing Secret (Segredo de Assinatura do Webhook - Produção)
                          </label>
                          <div className="relative">
                            <input
                              type={showStripeWebhookSecretProd ? "text" : "password"}
                              placeholder="whsec_..."
                              value={stripeWebhookSecretProd}
                              onChange={(e) => setStripeWebhookSecretProd(e.target.value)}
                              className="w-full pl-4 pr-10 py-3 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors font-mono"
                            />
                            <button
                              type="button"
                              onClick={() => setShowStripeWebhookSecretProd(!showStripeWebhookSecretProd)}
                              className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition-colors cursor-pointer"
                            >
                              {showStripeWebhookSecretProd ? <EyeOff size={16} /> : <Eye size={16} />}
                            </button>
                          </div>
                        </div>
                      </div>

                      {paymentSaveSuccess && (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center space-x-2 text-xs text-emerald-700 animate-fadeIn">
                          <Check className="w-4 h-4 flex-shrink-0" />
                          <span>Configurações de pagamento salvas e sincronizadas com sucesso!</span>
                        </div>
                      )}

                      <div className="flex justify-end pt-4">
                        <button
                          type="submit"
                          disabled={paymentSaveLoading}
                          className="btn-primary py-3 px-6 text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-brand-primary/10 transition-all hover:shadow-xl active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {paymentSaveLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Salvando...</span>
                            </>
                          ) : (
                            <>
                              <Save className="w-4 h-4" />
                              <span>Salvar Configurações</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>

                {/* Guia de Configuração do Webhook do Stripe */}
                <div className="card bg-white p-6 md:p-8 border-brand-border mt-6">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <Globe className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary">
                        Configuração de Webhooks do Stripe
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Instruções para receber notificações de pagamentos assíncronos e renovações automáticas de assinaturas.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-6 text-sm text-brand-text">
                    <div className="bg-brand-bg/50 border border-brand-border/60 rounded-2xl p-5 space-y-4">
                      <div>
                        <span className="text-[10px] text-brand-text-muted uppercase tracking-wider font-bold block mb-1">
                          URL do Endpoint do Webhook
                        </span>
                        <div className="bg-white border border-brand-border/60 rounded-xl px-4 py-3 font-mono text-xs text-brand-primary font-bold break-all shadow-inner flex justify-between items-center select-all">
                          <span>
                            {`${import.meta.env.VITE_SUPABASE_URL || 'https://kvxboovgrrhhttaqinld.supabase.co'}/functions/v1/stripe-webhook`}
                          </span>
                        </div>
                        <p className="text-[11px] text-brand-text-muted mt-2 leading-relaxed">
                          * Insira a URL acima na seção <strong>Webhooks</strong> no painel da sua conta Stripe. Se o seu servidor for local (development), utilize uma ferramenta como o <strong>ngrok</strong> ou a CLI do Stripe (`stripe listen --forward-to`) para repassar as requisições para a porta local.
                        </p>
                      </div>

                      <div className="pt-2">
                        <span className="text-[10px] text-brand-text-muted uppercase tracking-wider font-bold block mb-2">
                          Eventos Obrigatórios para Escutar (Stripe Events)
                        </span>
                        
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="bg-white border border-brand-border/40 p-4 rounded-xl space-y-2">
                            <span className="text-xs font-bold text-brand-primary flex items-center">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 mr-1.5"></span>
                              Assinaturas e Checkout
                            </span>
                            <ul className="list-disc pl-4 text-xs space-y-1.5 text-brand-text-muted">
                              <li><code className="font-mono text-[10px] text-brand-primary bg-brand-bg px-1 py-0.5 rounded">checkout.session.completed</code><br />Disparado ao concluir a primeira assinatura de plano.</li>
                              <li><code className="font-mono text-[10px] text-brand-primary bg-brand-bg px-1 py-0.5 rounded">customer.subscription.updated</code><br />Ocorre em upgrades, downgrades ou renovação.</li>
                              <li><code className="font-mono text-[10px] text-brand-primary bg-brand-bg px-1 py-0.5 rounded">customer.subscription.deleted</code><br />Disparado ao cancelar definitivamente o plano.</li>
                            </ul>
                          </div>

                          <div className="bg-white border border-brand-border/40 p-4 rounded-xl space-y-2">
                            <span className="text-xs font-bold text-brand-primary flex items-center">
                              <span className="h-2 w-2 rounded-full bg-emerald-500 mr-1.5"></span>
                              Faturamento e Cobranças
                            </span>
                            <ul className="list-disc pl-4 text-xs space-y-1.5 text-brand-text-muted">
                              <li><code className="font-mono text-[10px] text-brand-primary bg-brand-bg px-1 py-0.5 rounded">invoice.paid</code><br />Ocorre a cada renovação mensal/anual paga com sucesso.</li>
                              <li><code className="font-mono text-[10px] text-brand-primary bg-brand-bg px-1 py-0.5 rounded">invoice.payment_failed</code><br />Notifica quando uma tentativa de renovação automática falha.</li>
                              <li><code className="font-mono text-[10px] text-brand-primary bg-brand-bg px-1 py-0.5 rounded">charge.succeeded</code><br />Confirmação genérica de cobrança bem-sucedida.</li>
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'token_usage' ? (
              /* Aba de Consumo de Tokens (Consumo API) [NEW] */
              <div className="space-y-6">
                {/* Sub-navegação interna da página Consumo API */}
                <div className="flex border-b border-brand-border/60 pb-px gap-6 mb-6">
                  <button
                    onClick={() => setTokenUsageSubTab('general')}
                    className={`pb-3 text-sm font-semibold transition-all border-b-2 cursor-pointer flex items-center space-x-2 ${
                      tokenUsageSubTab === 'general'
                        ? 'border-brand-primary text-brand-primary font-bold'
                        : 'border-transparent text-brand-text-muted hover:text-brand-primary'
                    }`}
                  >
                    <Key className="w-4 h-4" />
                    <span>Geral</span>
                  </button>
                  <button
                    onClick={() => setTokenUsageSubTab('metrics')}
                    className={`pb-3 text-sm font-semibold transition-all border-b-2 cursor-pointer flex items-center space-x-2 ${
                      tokenUsageSubTab === 'metrics'
                        ? 'border-brand-primary text-brand-primary font-bold'
                        : 'border-transparent text-brand-text-muted hover:text-brand-primary'
                    }`}
                  >
                    <BarChart3 className="w-4 h-4" />
                    <span>Consumo de API</span>
                  </button>
                </div>

                {tokenUsageSubTab === 'general' ? (
                  /* Aba Geral para inserir a chave API do Gemini */
                  <div className="card bg-white p-6 md:p-8 border-brand-border shadow-sm">
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                        <Key className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-display font-bold text-brand-primary">
                          Configuração da API do Gemini
                        </h2>
                        <p className="text-xs text-brand-text-muted mt-0.5">
                          Defina a chave global e o modelo de IA do Google. Estas configurações serão utilizadas para transcrições de áudio, relatórios e PDI.
                        </p>
                      </div>
                    </div>

                    <div className="bg-brand-bg/60 border border-brand-border rounded-2xl p-5 mb-8 space-y-3">
                      <h3 className="text-sm font-semibold text-brand-primary flex items-center">
                        <Sparkles className="w-4 h-4 text-brand-accent mr-2" />
                        Configuração Ativa na Plataforma
                      </h3>
                      <div className="flex items-center justify-between bg-white border border-brand-border/60 rounded-xl px-4 py-3 shadow-inner">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] text-brand-text-muted uppercase tracking-wider font-semibold">Chave API</span>
                          <span className="font-mono text-sm tracking-wide text-brand-text break-all">
                            {currentGeminiKey ? maskKey(currentGeminiKey) : "Nenhuma chave cadastrada"}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center justify-between bg-white border border-brand-border/60 rounded-xl px-4 py-3 shadow-inner">
                        <div className="flex flex-col gap-0.5 min-w-0">
                          <span className="text-[10px] text-brand-text-muted uppercase tracking-wider font-semibold">Modelo em uso</span>
                          <span className="font-mono text-sm text-brand-primary font-semibold">
                            {selectedGeminiModel || "Não configurado"}
                          </span>
                        </div>
                        <span className="ml-3 shrink-0 text-[10px] px-2 py-0.5 rounded-full bg-brand-primary/10 text-brand-primary font-bold">
                          {GEMINI_MODELS_FALLBACK.find(m => m.value === selectedGeminiModel)?.badge || 'IA'}
                        </span>
                      </div>
                      <p className="text-xs text-brand-text-muted leading-relaxed">
                        * A configuração salva aqui possui <strong>prioridade absoluta</strong> sobre as variáveis de ambiente (.env). Alterações entram em vigor imediatamente na próxima requisição.
                      </p>
                    </div>

                    <form onSubmit={handleSaveGeminiKey} className="space-y-6">
                      {/* Seletor de Modelo */}
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                          <div className="min-w-0">
                            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                              Modelo Gemini a Utilizar
                            </label>
                            <p className="text-xs text-brand-text-muted mt-0.5">
                              {modelsFetched
                                ? `${availableModels.length} modelos encontrados. Clique em "Testar" para confirmar qual funciona.`
                                : 'Clique em "Verificar" para carregar os modelos reais da sua conta.'}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={handleFetchAvailableModels}
                            disabled={loadingModels || !currentGeminiKey}
                            className="shrink-0 flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-brand-primary/40 text-brand-primary hover:bg-brand-primary/5 transition-all disabled:opacity-40 cursor-pointer"
                            title={!currentGeminiKey ? 'Salve uma chave API primeiro' : 'Consultar modelos disponíveis na sua conta'}
                          >
                            {loadingModels
                              ? <><Loader2 className="w-3 h-3 animate-spin" /><span>Verificando...</span></>
                              : <><RefreshCw className="w-3 h-3" /><span>Verificar modelos</span></>
                            }
                          </button>
                        </div>

                        {/* Aviso sobre o modelo ativo no banco */}
                        {dbCurrentModel && (
                          <div className="p-3 bg-blue-50 border border-blue-100 rounded-xl text-xs text-blue-700 flex items-center gap-2">
                            <Info className="w-4 h-4 shrink-0" />
                            <span>Modelo atualmente <strong>salvo no banco</strong>: <code className="font-mono bg-blue-100 px-1 rounded">{dbCurrentModel}</code></span>
                          </div>
                        )}

                        {modelsError && (
                          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-700 flex items-start gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                            <span>{modelsError}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 gap-2 max-h-96 overflow-y-auto pr-1">
                          {(modelsFetched
                            ? availableModels.map(m => ({ value: m.name, label: m.displayName || m.name, badge: '' }))
                            : GEMINI_MODELS_FALLBACK
                          ).map((model) => {
                            const testResult = testResults[model.value];
                            const isTesting = testingModel === model.value;
                            const isSelected = selectedGeminiModel === model.value;
                            const isActiveInDb = dbCurrentModel === model.value;
                            return (
                              <div
                                key={model.value}
                                className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-all ${
                                  isSelected
                                    ? 'border-brand-primary bg-brand-primary/5 shadow-sm'
                                    : testResult?.success === false
                                    ? 'border-red-200 bg-red-50/30'
                                    : testResult?.success === true
                                    ? 'border-emerald-200 bg-emerald-50/30'
                                    : 'border-brand-border hover:border-brand-primary/40 hover:bg-brand-bg/60'
                                }`}
                              >
                                <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                                  <input
                                    type="radio"
                                    name="gemini_model"
                                    value={model.value}
                                    checked={isSelected}
                                    onChange={(e) => setSelectedGeminiModel(e.target.value)}
                                    className="accent-brand-primary shrink-0"
                                  />
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className={`text-sm font-medium ${isSelected ? 'text-brand-primary' : 'text-brand-text'}`}>
                                        {model.label}
                                      </span>
                                      {isActiveInDb && (
                                        <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-brand-primary/10 text-brand-primary">
                                          ● No banco
                                        </span>
                                      )}
                                      {model.badge && (
                                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${
                                          model.badge.includes('Tier 1') ? 'bg-emerald-100 text-emerald-700' :
                                          model.badge === 'Preview' ? 'bg-amber-100 text-amber-700' :
                                          model.badge === 'Pro' ? 'bg-purple-100 text-purple-700' :
                                          'bg-stone-100 text-stone-600'
                                        }`}>
                                          {model.badge}
                                        </span>
                                      )}
                                    </div>
                                    <div className="font-mono text-[10px] text-brand-text-muted mt-0.5">{model.value}</div>
                                    {testResult?.success === false && (
                                      <div className="text-[10px] text-red-600 mt-0.5 leading-tight">✗ {testResult.error}</div>
                                    )}
                                    {testResult?.success === true && (
                                      <div className="text-[10px] text-emerald-600 mt-0.5 font-semibold">✓ Funcionando — pode usar este modelo</div>
                                    )}
                                  </div>
                                </label>
                                <button
                                  type="button"
                                  onClick={() => handleTestModel(model.value)}
                                  disabled={isTesting || !!testingModel}
                                  className={`shrink-0 text-[10px] px-2.5 py-1.5 rounded-lg font-semibold transition-all cursor-pointer disabled:opacity-40 ${
                                    testResult?.success === true
                                      ? 'bg-emerald-100 text-emerald-700 hover:bg-emerald-200'
                                      : testResult?.success === false
                                      ? 'bg-red-100 text-red-700 hover:bg-red-200'
                                      : 'bg-brand-bg border border-brand-border text-brand-text-muted hover:border-brand-primary hover:text-brand-primary'
                                  }`}
                                  title="Testar se este modelo funciona de verdade com sua chave"
                                >
                                  {isTesting
                                    ? <Loader2 className="w-3 h-3 animate-spin" />
                                    : testResult?.success === true ? '✓ OK'
                                    : testResult?.success === false ? '✗ Erro'
                                    : 'Testar'}
                                </button>
                              </div>
                            );
                          })}
                        </div>

                        {!modelsFetched && (
                          <p className="text-[10px] text-amber-600 font-medium">
                            ⚠️ Lista de sugestão exibida. Clique em "Verificar modelos" para ver os modelos reais da sua conta e depois use "Testar" para confirmar qual funciona.
                          </p>
                        )}
                      </div>

                      {/* Input da Chave */}
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                          Conectar Nova Chave Gemini
                        </label>
                        <div className="relative">
                          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                          <input
                            type={showKeyInput ? "text" : "password"}
                            placeholder="Insira a chave API do Gemini (ex: AIzaSy...)"
                            value={newGeminiKey}
                            onChange={(e) => setNewGeminiKey(e.target.value)}
                            className="w-full pl-10 pr-10 py-3.5 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors"
                          />
                          <button
                            type="button"
                            onClick={() => setShowKeyInput(!showKeyInput)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition-colors cursor-pointer"
                          >
                            {showKeyInput ? <EyeOff size={16} /> : <Eye size={16} />}
                          </button>
                        </div>
                        <p className="text-xs text-brand-text-muted">
                          Deixe o campo em branco e clique em "Salvar" apenas para atualizar o modelo sem trocar a chave — <em>neste caso, a chave atual será mantida</em>.
                        </p>
                      </div>

                      {saveSuccess && (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center space-x-2 text-xs text-emerald-700 animate-fadeIn">
                          <Check className="w-4 h-4 flex-shrink-0" />
                          <span>Configurações do Gemini (chave + modelo) salvas com sucesso!</span>
                        </div>
                      )}

                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={saveLoading || (!newGeminiKey && !currentGeminiKey)}
                          className="btn-primary py-3 px-6 text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-brand-primary/10 transition-all hover:shadow-xl active:scale-95 disabled:opacity-50 cursor-pointer"
                        >
                          {saveLoading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Salvando...</span>
                            </>
                          ) : (
                            <>
                              <span>Salvar Configurações</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  </div>
                ) : (
                  <>
                    {/* Cards de Metricas de Consumo */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                      <div className="card p-5 bg-white flex items-center space-x-4">
                        <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                          <Coins className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs text-brand-text-muted font-medium uppercase tracking-wider">Custo Total (USD)</p>
                          <h3 className="text-xl font-bold font-display text-brand-primary">{formatCost(totalUsageCostUsd)}</h3>
                          <p className="text-[10px] text-brand-text-muted mt-0.5">Est. {formatBRL(totalUsageCostUsd)} BRL</p>
                        </div>
                      </div>

                      <div className="card p-5 bg-white flex items-center space-x-4">
                        <div className="p-3 bg-brand-accent/10 rounded-xl text-brand-primary">
                          <Activity className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs text-brand-text-muted font-medium uppercase tracking-wider">Total Transcricoes</p>
                          <h3 className="text-2xl font-bold font-display text-brand-primary">{totalCallsCount}</h3>
                          <p className="text-[10px] text-brand-text-muted mt-0.5">Chamadas Gemini Flash</p>
                        </div>
                      </div>

                      <div className="card p-5 bg-white flex items-center space-x-4">
                        <div className="p-3 bg-stone-100 rounded-xl text-brand-text-muted">
                          <BarChart3 className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs text-brand-text-muted font-medium uppercase tracking-wider">Total de Tokens</p>
                          <h3 className="text-2xl font-bold font-display text-brand-primary">
                            {new Intl.NumberFormat('pt-BR').format(totalUsageTokens)}
                          </h3>
                          <p className="text-[10px] text-brand-text-muted mt-0.5">Input & Output acumulados</p>
                        </div>
                      </div>

                      <div className="card p-5 bg-white flex items-center space-x-4">
                        <div className="p-3 bg-purple-50 rounded-xl text-purple-600">
                          <Clock className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs text-brand-text-muted font-medium uppercase tracking-wider">Tempo Transcrito</p>
                          <h3 className="text-2xl font-bold font-display text-brand-primary">
                            {(totalUsageDurationSeconds / 60).toFixed(1)} min
                          </h3>
                          <p className="text-[10px] text-brand-text-muted mt-0.5">
                            {new Intl.NumberFormat('pt-BR').format(totalUsageDurationSeconds)} s totais
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Sub-Navegacao e Busca do Consumo */}
                    <div className="card p-6 bg-white space-y-4 md:space-y-0 md:flex md:items-center md:justify-between md:gap-4">
                      <div className="relative flex-1 max-w-md">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                        <input
                          type="text"
                          placeholder="Buscar por profissional ou e-mail..."
                          value={usageSearchTerm}
                          onChange={(e) => setUsageSearchTerm(e.target.value)}
                          className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-border focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none text-sm transition-colors"
                        />
                      </div>

                      <div className="flex bg-brand-bg border border-brand-border p-1 rounded-xl gap-1">
                        <button
                          onClick={() => setUsageViewMode('by_user')}
                          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            usageViewMode === 'by_user'
                              ? 'bg-white text-brand-primary shadow-sm border border-brand-border/60'
                              : 'text-brand-text-muted hover:text-brand-primary'
                          }`}
                        >
                          Acumulado por Usuario
                        </button>
                        <button
                          onClick={() => setUsageViewMode('history')}
                          className={`px-4 py-1.5 text-xs font-semibold rounded-lg transition-all cursor-pointer ${
                            usageViewMode === 'history'
                              ? 'bg-white text-brand-primary shadow-sm border border-brand-border/60'
                              : 'text-brand-text-muted hover:text-brand-primary'
                          }`}
                        >
                          Historico de Chamadas
                        </button>
                      </div>
                    </div>

                    {/* Visualizacao do Consumo */}
                    <div className="card bg-white overflow-hidden border border-brand-border">
                      {loadingUsage ? (
                        <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
                          <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                          <span className="text-sm">Carregando logs de consumo...</span>
                        </div>
                      ) : usageViewMode === 'by_user' ? (
                        /* Acumulado por Usuario */
                        userSummariesList.length === 0 ? (
                          <div className="p-12 text-center text-brand-text-muted">
                            <Users className="w-12 h-12 mx-auto text-brand-border mb-3" />
                            <p className="font-medium text-brand-text">Nenhum registro de consumo encontrado</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-brand-bg border-b border-brand-border/60 text-xs font-semibold text-brand-text uppercase tracking-wider">
                                  <th className="p-4 pl-6">Profissional</th>
                                  <th className="p-4">Chamadas</th>
                                  <th className="p-4">Tempo Transcrito</th>
                                  <th className="p-4">Tokens Entrada</th>
                                  <th className="p-4">Tokens Saida</th>
                                  <th className="p-4">Tokens Totais</th>
                                  <th className="p-4">Custo USD</th>
                                  <th className="p-4 pr-6 text-right">Custo Est. BRL</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-brand-border/40 text-sm text-brand-text">
                                {userSummariesList.map((summary) => (
                                  <tr key={summary.id} className="hover:bg-brand-bg/30 transition-colors">
                                    <td className="p-4 pl-6">
                                      <div>
                                        <p className="font-semibold text-brand-text">{summary.name}</p>
                                        <p className="text-xs text-brand-text-muted">{summary.email}</p>
                                      </div>
                                    </td>
                                    <td className="p-4 font-semibold text-brand-text">{summary.callsCount}</td>
                                    <td className="p-4 font-medium text-brand-text">
                                      {(summary.totalDurationSeconds / 60).toFixed(1)} min
                                    </td>
                                    <td className="p-4 text-brand-text-muted">
                                      {new Intl.NumberFormat('pt-BR').format(summary.promptTokens)}
                                    </td>
                                    <td className="p-4 text-brand-text-muted">
                                      {new Intl.NumberFormat('pt-BR').format(summary.candidatesTokens)}
                                    </td>
                                    <td className="p-4 text-brand-text-muted font-medium">
                                      {new Intl.NumberFormat('pt-BR').format(summary.totalTokens)}
                                    </td>
                                    <td className="p-4 font-medium text-brand-primary">{formatCost(summary.totalCostUsd)}</td>
                                    <td className="p-4 pr-6 text-right font-bold text-brand-primary">{formatBRL(summary.totalCostUsd)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      ) : (
                        /* Historico de Chamadas */
                        filteredHistoryLogs.length === 0 ? (
                          <div className="p-12 text-center text-brand-text-muted">
                            <Activity className="w-12 h-12 mx-auto text-brand-border mb-3" />
                            <p className="font-medium text-brand-text">Nenhum registro de historico encontrado</p>
                          </div>
                        ) : (
                          <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                              <thead>
                                <tr className="bg-brand-bg border-b border-brand-border/60 text-xs font-semibold text-brand-text uppercase tracking-wider">
                                  <th className="p-4 pl-6">Data/Hora</th>
                                  <th className="p-4">Profissional</th>
                                  <th className="p-4">Modelo</th>
                                  <th className="p-4">Duração</th>
                                  <th className="p-4">Tokens Entrada</th>
                                  <th className="p-4">Tokens Saida</th>
                                  <th className="p-4">Tokens Totais</th>
                                  <th className="p-4 pr-6 text-right">Custo USD</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-brand-border/40 text-sm text-brand-text">
                                {filteredHistoryLogs.map((log) => (
                                  <tr key={log.id} className="hover:bg-brand-bg/30 transition-colors">
                                    <td className="p-4 pl-6 text-brand-text-muted whitespace-nowrap">
                                      {formatDate(log.created_at)}
                                    </td>
                                    <td className="p-4">
                                      <div>
                                        <p className="font-semibold text-brand-text">{log.professional_name}</p>
                                        <p className="text-xs text-brand-text-muted">{log.professional_email}</p>
                                      </div>
                                    </td>
                                    <td className="p-4">
                                      <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-stone-100 text-brand-text-muted">
                                        {log.model}
                                      </span>
                                    </td>
                                    <td className="p-4 text-brand-text font-medium whitespace-nowrap">
                                      {formatDuration(log.audio_duration_seconds)}
                                    </td>
                                    <td className="p-4 text-brand-text-muted">
                                      {new Intl.NumberFormat('pt-BR').format(log.prompt_tokens)}
                                    </td>
                                    <td className="p-4 text-brand-text-muted">
                                      {new Intl.NumberFormat('pt-BR').format(log.candidates_tokens)}
                                    </td>
                                    <td className="p-4 text-brand-text-muted font-medium">
                                      {new Intl.NumberFormat('pt-BR').format(log.total_tokens)}
                                    </td>
                                    <td className="p-4 pr-6 text-right font-bold text-brand-primary">
                                      {formatCost(log.cost_usd)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )
                      )}
                    </div>
                  </>
                )}
              </div>
            ) : activeTab === 'plans' ? (
              <div className="space-y-6">
                <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <Coins className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                        Configuração de Planos (SaaS)
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Gerencie os valores, recursos e descrições dos planos de assinatura exibidos para os terapeutas.
                      </p>
                    </div>
                  </div>

                  {plansSuccess && (
                    <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center space-x-2 text-sm text-emerald-700 animate-fadeIn mb-4">
                      <Check className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                      <span className="font-medium">{plansSuccess}</span>
                    </div>
                  )}

                  {plansError && (
                    <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center space-x-2 text-sm text-red-700 animate-fadeIn mb-4">
                      <ShieldAlert className="w-5 h-5 flex-shrink-0 text-red-600" />
                      <span className="font-medium">{plansError}</span>
                    </div>
                  )}

                  {loadingPlans ? (
                    <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
                      <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                      <span className="text-sm">Carregando planos da base de dados...</span>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {plans.map((plan) => {
                        const editData = editingPlans[plan.id] || {};
                        return (
                          <div key={plan.id} className="p-6 bg-brand-bg/30 rounded-2xl border border-brand-border/60 space-y-4 shadow-inner">
                            <div className="flex justify-between items-center pb-2 border-b border-brand-border/50">
                              <h3 className="font-bold text-brand-primary text-base uppercase tracking-wider">{plan.name} ({plan.id})</h3>
                              <span className="text-xs text-brand-text-muted">Última atualização: {plan.updated_at ? new Date(plan.updated_at).toLocaleDateString('pt-BR') : 'N/A'}</span>
                            </div>

                            <div className="space-y-3">
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-brand-text uppercase block">Nome Exibido</label>
                                  <input
                                    type="text"
                                    value={editData.name || ''}
                                    onChange={(e) => handlePlanFieldChange(plan.id, 'name', e.target.value)}
                                    className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-brand-text uppercase block">Tag Exibida</label>
                                  <input
                                    type="text"
                                    value={editData.tag_text || ''}
                                    placeholder="Ex: Popular, Recorrente"
                                    onChange={(e) => handlePlanFieldChange(plan.id, 'tag_text', e.target.value)}
                                    className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-brand-text uppercase block">Descrição Curta</label>
                                <input
                                  type="text"
                                  value={editData.description || ''}
                                  onChange={(e) => handlePlanFieldChange(plan.id, 'description', e.target.value)}
                                  className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium"
                                />
                              </div>

                              <div className="grid grid-cols-3 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-brand-text uppercase block">Preço (R$)</label>
                                  <input
                                    type="text"
                                    value={editData.price || ''}
                                    placeholder="Ex: 49.90"
                                    onChange={(e) => handlePlanFieldChange(plan.id, 'price', e.target.value)}
                                    className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium font-mono"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-brand-text uppercase block">Mensal Equiv. (R$)</label>
                                  <input
                                    type="text"
                                    value={editData.equivalent_monthly_price || ''}
                                    placeholder="Ex: 41.58"
                                    onChange={(e) => handlePlanFieldChange(plan.id, 'equivalent_monthly_price', e.target.value)}
                                    className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium font-mono"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-brand-text uppercase block">Tag Desconto</label>
                                  <input
                                    type="text"
                                    value={editData.discount_text || ''}
                                    placeholder="Ex: 17% OFF"
                                    onChange={(e) => handlePlanFieldChange(plan.id, 'discount_text', e.target.value)}
                                    className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium"
                                  />
                                </div>
                              </div>

                              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-brand-text uppercase block">Stripe Price ID (Sandbox)</label>
                                  <input
                                    type="text"
                                    value={editData.stripe_sandbox_price_id || ''}
                                    placeholder="Ex: price_1P..."
                                    onChange={(e) => handlePlanFieldChange(plan.id, 'stripe_sandbox_price_id', e.target.value)}
                                    className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium font-mono"
                                  />
                                </div>
                                <div className="space-y-1">
                                  <label className="text-[10px] font-bold text-brand-text uppercase block">Stripe Price ID (Produção)</label>
                                  <input
                                    type="text"
                                    value={editData.stripe_prod_price_id || ''}
                                    placeholder="Ex: price_1P..."
                                    onChange={(e) => handlePlanFieldChange(plan.id, 'stripe_prod_price_id', e.target.value)}
                                    className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium font-mono"
                                  />
                                </div>
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-brand-text uppercase block">Texto Botão Simulação</label>
                                <input
                                  type="text"
                                  value={editData.button_text_simulate || ''}
                                  onChange={(e) => handlePlanFieldChange(plan.id, 'button_text_simulate', e.target.value)}
                                  className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium"
                                />
                              </div>

                              <div className="space-y-1">
                                <label className="text-[10px] font-bold text-brand-text uppercase block">Recursos / Benefícios (Um por linha)</label>
                                <textarea
                                  value={editData.featuresText || ''}
                                  rows={5}
                                  onChange={(e) => handlePlanFieldChange(plan.id, 'featuresText', e.target.value)}
                                  className="w-full px-3 py-2 border border-brand-border rounded-xl text-xs outline-none focus:border-brand-primary bg-white font-medium resize-y font-sans leading-relaxed"
                                  placeholder="Recurso 1&#10;Recurso 2&#10;Recurso 3"
                                />
                              </div>
                            </div>

                            <div className="flex justify-end pt-3">
                              <button
                                type="button"
                                onClick={() => handleSavePlan(plan.id, editData)}
                                disabled={savingPlanId !== null || !editData.name || !editData.price}
                                className="btn-primary py-2 px-4 text-xs font-semibold flex items-center justify-center space-x-1.5 shadow active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                              >
                                {savingPlanId === plan.id ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    <span>Salvando...</span>
                                  </>
                                ) : (
                                  <>
                                    <Save size={14} />
                                    <span>Salvar Plano</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'transactions' ? (
              <div className="space-y-6">
                <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <Clock className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                        Transações Efetuadas
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Acompanhe o histórico de assinaturas reais e simuladas integradas com a Stripe.
                      </p>
                    </div>
                  </div>

                  {loadingAdminTransactions ? (
                    <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
                      <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                      <span className="text-sm">Carregando transações...</span>
                    </div>
                  ) : adminTransactions.length === 0 ? (
                    <div className="p-12 text-center text-brand-text-muted text-sm leading-relaxed">
                      Nenhuma transação registrada na plataforma.
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-sm border-collapse">
                        <thead>
                          <tr className="border-b border-brand-border/60 text-brand-text font-bold text-xs uppercase tracking-wider">
                            <th className="py-3 px-4">Profissional</th>
                            <th className="py-3 px-4">Plano</th>
                            <th className="py-3 px-4">Data</th>
                            <th className="py-3 px-4">Valor</th>
                            <th className="py-3 px-4">Status</th>
                            <th className="py-3 px-4">Stripe ID</th>
                            <th className="py-3 px-4 text-right">Ação</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-brand-border/30 text-xs">
                          {adminTransactions.map((tx) => (
                            <tr key={tx.id} className="hover:bg-brand-bg/10 transition-colors">
                              <td className="py-3.5 px-4">
                                <p className="font-semibold text-brand-text">
                                  {tx.professionals?.full_name || 'Profissional'}
                                </p>
                                <p className="text-[10px] text-brand-text-muted">
                                  {tx.professionals?.google_email || ''}
                                </p>
                              </td>
                              <td className="py-3.5 px-4 font-medium text-brand-text">
                                {tx.plan_id === 'monthly' ? 'Mensal' : tx.plan_id === 'yearly' ? 'Anual' : tx.plan_id}
                              </td>
                              <td className="py-3.5 px-4 text-brand-text-muted">
                                {tx.created_at ? new Date(tx.created_at).toLocaleDateString('pt-BR', {
                                  day: '2-digit',
                                  month: '2-digit',
                                  year: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                }) : 'N/A'}
                              </td>
                              <td className="py-3.5 px-4 font-bold text-brand-text">
                                {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: tx.currency?.toUpperCase() || 'BRL' }).format(tx.amount)}
                              </td>
                              <td className="py-3.5 px-4">
                                <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-bold border ${
                                  tx.status === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                                  tx.status === 'refunded' ? 'bg-orange-50 text-orange-700 border-orange-200' :
                                  tx.status === 'refund_requested' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                                  tx.status === 'failed' ? 'bg-red-50 text-red-700 border-red-200' :
                                  'bg-amber-50 text-amber-700 border-amber-200'
                                }`}>
                                  {tx.status === 'paid' ? 'Pago' :
                                   tx.status === 'refunded' ? 'Reembolsado' :
                                   tx.status === 'refund_requested' ? 'Reembolso Solicitado' :
                                   tx.status === 'failed' ? 'Falhou' : tx.status}
                                </span>
                              </td>
                              <td className="py-3.5 px-4 font-mono text-[10px] text-brand-text-muted">
                                {tx.stripe_invoice_id || 'Simulado'}
                              </td>
                              <td className="py-3.5 px-4 text-right space-y-1 sm:space-y-0 sm:space-x-2">
                                {tx.stripe_invoice_url ? (
                                  <a
                                    href={tx.stripe_invoice_url}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center px-3 py-1.5 bg-brand-primary text-white hover:bg-brand-primary-hover rounded-xl transition-colors font-semibold text-[10px] shadow-sm hover:shadow"
                                  >
                                    Ver Fatura Stripe
                                  </a>
                                ) : (
                                  <span className="text-[10px] text-brand-text-muted italic mr-2">
                                    Simulado
                                  </span>
                                )}

                                {tx.refund_reason && (
                                  <button
                                    onClick={() => setSelectedTxForReason(tx)}
                                    className="inline-flex items-center px-2.5 py-1.5 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-lg border border-amber-200 transition-colors font-semibold text-[10px] cursor-pointer"
                                  >
                                    Ver Motivo
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </div>
            ) : activeTab === 'push_notifications' ? (
              <div className="space-y-6">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => setPushNotificationsTab('manual')}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                      pushNotificationsTab === 'manual'
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-white text-brand-text border-brand-border hover:border-brand-primary/40'
                    }`}
                  >
                    Enviadas Manualmente
                  </button>
                  <button
                    type="button"
                    onClick={() => setPushNotificationsTab('platform')}
                    className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                      pushNotificationsTab === 'platform'
                        ? 'bg-brand-primary text-white border-brand-primary'
                        : 'bg-white text-brand-text border-brand-border hover:border-brand-primary/40'
                    }`}
                  >
                    Automáticas da Plataforma
                  </button>
                </div>

                {pushNotificationsTab === 'manual' ? (
                  <div className="space-y-6">
                    <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                      <div className="flex items-center space-x-3 mb-6">
                        <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                          <Bell className="w-6 h-6" />
                        </div>
                        <div>
                          <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                            Disparar Nova Notificação Push
                          </h2>
                          <p className="text-xs text-brand-text-muted mt-0.5">
                            Envie um alerta push/in-app para um profissional específico ou faça um broadcast para toda a plataforma.
                          </p>
                        </div>
                      </div>

                      <form onSubmit={handleSendNotification} className="space-y-4">
                        {notifSendSuccess && (
                          <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-xs flex gap-2">
                            <Check className="flex-shrink-0 text-emerald-600" size={16} />
                            <span>Notificação disparada com sucesso para o(s) destinatário(s)!</span>
                          </div>
                        )}

                        {notifSendError && (
                          <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-800 text-xs flex gap-2">
                            <ShieldAlert className="flex-shrink-0 text-red-600" size={16} />
                            <span>{notifSendError}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-1">
                            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Destinatário</label>
                            <select
                              value={broadcastTarget}
                              onChange={(e) => setBroadcastTarget(e.target.value as any)}
                              className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                            >
                              <option value="all">Todos os Profissionais (Broadcast)</option>
                              <option value="specific">Profissional Específico</option>
                            </select>
                          </div>

                          {broadcastTarget === 'specific' && (
                            <div className="space-y-1">
                              <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Selecionar Profissional</label>
                              <select
                                value={selectedProfessionalId}
                                onChange={(e) => setSelectedProfessionalId(e.target.value)}
                                required
                                className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                              >
                                <option value="">-- Escolha o Profissional --</option>
                                {professionals.map(p => (
                                  <option key={p.id} value={p.id}>
                                    {p.full_name} ({p.google_email || 'Sem e-mail'})
                                  </option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="md:col-span-2 space-y-1">
                            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Título do Alerta</label>
                            <input
                              type="text"
                              value={notifTitle}
                              onChange={(e) => setNotifTitle(e.target.value)}
                              placeholder="ex: Atualização do Sistema"
                              required
                              className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Tipo de Alerta</label>
                            <select
                              value={notifType}
                              onChange={(e) => setNotifType(e.target.value as any)}
                              className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                            >
                              <option value="info">Info (Azul)</option>
                              <option value="success">Sucesso (Verde)</option>
                              <option value="warning">Alerta (Amarelo)</option>
                              <option value="error">Erro (Vermelho)</option>
                            </select>
                          </div>
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Conteúdo / Mensagem</label>
                          <textarea
                            value={notifContent}
                            onChange={(e) => setNotifContent(e.target.value)}
                            placeholder="Digite o texto detalhado da notificação..."
                            required
                            rows={3}
                            className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium resize-none"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Link de Redirecionamento (Opcional)</label>
                          <input
                            type="text"
                            value={notifLink}
                            onChange={(e) => setNotifLink(e.target.value)}
                            placeholder="ex: /painel/subscription"
                            className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-text uppercase tracking-wider block font-semibold text-brand-text">Imagem de Capa (URL ou Upload)</label>
                          <p className="text-[11px] leading-relaxed text-brand-text-muted">
                            Use uma imagem horizontal em boa resolução, de preferência 1200x630 px ou proporção 16:9.
                            Os formatos recomendados são JPG, PNG ou WebP, com tamanho leve para carregamento rápido.
                          </p>
                          <div className="flex gap-2">
                            <input
                              type="text"
                              value={notifImageUrl}
                              onChange={(e) => setNotifImageUrl(e.target.value)}
                              placeholder="Insira a URL da imagem ou faça upload ao lado..."
                              className="flex-1 px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                            />
                            <div className="relative">
                              <input
                                type="file"
                                accept="image/*"
                                id="notif-image-upload"
                                className="hidden"
                                onChange={handleImageUpload}
                                disabled={uploadingImage}
                              />
                              <label
                                htmlFor="notif-image-upload"
                                className={`px-4 py-2.5 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 font-semibold text-sm rounded-xl border border-brand-primary/20 flex items-center justify-center gap-1.5 cursor-pointer h-full transition-all ${uploadingImage ? 'opacity-50 cursor-not-allowed' : ''}`}
                              >
                                {uploadingImage ? <Loader2 className="animate-spin" size={16} /> : <Upload size={16} />}
                                <span>{uploadingImage ? 'Enviando...' : 'Upload'}</span>
                              </label>
                            </div>
                          </div>
                          {notifImageUrl && (
                            <div className="mt-2.5 relative inline-block rounded-xl overflow-hidden border border-brand-border max-w-xs shadow-sm bg-brand-bg/30">
                              <img src={notifImageUrl} alt="Preview da capa" className="max-h-32 object-cover" />
                              <button
                                type="button"
                                onClick={() => setNotifImageUrl('')}
                                className="absolute top-1.5 right-1.5 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 transition-colors shadow-md"
                                title="Remover Imagem"
                              >
                                <XCircle size={14} />
                              </button>
                            </div>
                          )}
                        </div>

                        <div className="pt-2">
                          <button
                            type="submit"
                            disabled={notifSending}
                            className="w-full py-3 bg-brand-primary text-white font-bold rounded-xl text-sm hover:bg-brand-primary-hover transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                          >
                            {notifSending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                            <span>Disparar Notificação Push</span>
                          </button>
                        </div>
                      </form>
                    </div>

                    <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                        <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
                          <Clock size={18} className="text-brand-primary" />
                          <span>Notificações push enviadas manualmente</span>
                        </h3>
                        <button
                          type="button"
                          onClick={() => handleClearNotificationHistory(manualPushNotifications, 'manuais', 'manual')}
                          disabled={manualPushNotifications.length === 0 || loadingPushNotifications}
                          className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          <Trash2 size={14} />
                          <span>Limpar histórico</span>
                        </button>
                      </div>

                      {loadingPushNotifications ? (
                        <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
                          <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                          <span className="text-sm">Carregando logs...</span>
                        </div>
                      ) : manualPushNotifications.length === 0 ? (
                        <div className="p-12 text-center text-brand-text-muted text-sm italic">
                          Nenhuma notificação manual cadastrada no sistema.
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-left text-sm border-collapse">
                            <thead>
                              <tr className="border-b border-brand-border/60 text-brand-text font-bold text-xs uppercase tracking-wider">
                                <th className="py-2.5 px-3">Profissional</th>
                                <th className="py-2.5 px-3">Título / Mensagem</th>
                                <th className="py-2.5 px-3">Tipo</th>
                                <th className="py-2.5 px-3">Lido em</th>
                                <th className="py-2.5 px-3">Enviado em</th>
                                <th className="py-2.5 px-3 text-right">Ação</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-border/30 text-xs">
                              {manualPushNotifications.map((n) => (
                                <tr key={n.id} className="hover:bg-brand-bg/10 transition-colors">
                                  <td className="py-2.5 px-3">
                                    <p className="font-semibold text-brand-text">
                                      {n.professionals?.full_name || 'Profissional'}
                                    </p>
                                    <p className="text-[10px] text-brand-text-muted">
                                      {n.professionals?.google_email || ''}
                                    </p>
                                  </td>
                                  <td className="py-2.5 px-3 max-w-xs">
                                    <div className="flex items-center gap-2">
                                      {n.image_url && (
                                        <img
                                          src={n.image_url}
                                          alt="Capa"
                                          className="w-8 h-8 rounded object-cover flex-shrink-0 border border-brand-border/40"
                                        />
                                      )}
                                      <div className="overflow-hidden">
                                        <p className="font-medium text-brand-text truncate">{n.title}</p>
                                        <p className="text-brand-text-muted truncate text-[10px]">{n.message}</p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-2.5 px-3">
                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                      n.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' :
                                      n.type === 'error' ? 'bg-red-50 text-red-700 border border-red-150' :
                                      n.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-150' :
                                      'bg-blue-50 text-blue-700 border border-blue-150'
                                    }`}>
                                      {n.type}
                                    </span>
                                  </td>
                                  <td className="py-2.5 px-3 text-brand-text-muted">
                                    {n.read_at ? new Date(n.read_at).toLocaleDateString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    }) : (
                                      <span className="text-[10px] text-red-500 font-semibold uppercase">Não lido</span>
                                    )}
                                  </td>
                                  <td className="py-2.5 px-3 text-brand-text-muted">
                                    {n.created_at ? new Date(n.created_at).toLocaleDateString('pt-BR', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      hour: '2-digit',
                                      minute: '2-digit'
                                    }) : 'N/A'}
                                  </td>
                                  <td className="py-2.5 px-3 text-right">
                                    <button
                                      onClick={() => handleCopyNotification(n)}
                                      className="p-1 text-brand-primary hover:bg-brand-bg rounded transition-colors mr-1 cursor-pointer"
                                      title="Reaproveitar Conteúdo (Copiar)"
                                    >
                                      <Copy size={15} />
                                    </button>
                                    <button
                                      onClick={() => handleResendNotification(n)}
                                      disabled={resendingNotifId === n.id}
                                      className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors mr-1 disabled:opacity-50 cursor-pointer"
                                      title="Reenviar Notificação Imediatamente"
                                    >
                                      {resendingNotifId === n.id ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                                    </button>
                                    <button
                                      onClick={() => handleDeleteNotification(n.id)}
                                      disabled={deletingNotifId === n.id}
                                      className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 cursor-pointer"
                                    >
                                      <Trash2 size={15} />
                                    </button>
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between mb-4">
                      <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
                        <Clock size={18} className="text-brand-primary" />
                        <span>Notificações automáticas da plataforma</span>
                      </h3>
                      <button
                        type="button"
                        onClick={() => handleClearNotificationHistory(platformPushNotifications, 'automáticas da plataforma', 'platform')}
                        disabled={platformPushNotifications.length === 0 || loadingPushNotifications}
                        className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <Trash2 size={14} />
                        <span>Limpar histórico</span>
                      </button>
                    </div>

                    {loadingPushNotifications ? (
                      <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
                        <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                        <span className="text-sm">Carregando logs...</span>
                      </div>
                    ) : platformPushNotifications.length === 0 ? (
                      <div className="p-12 text-center text-brand-text-muted text-sm italic">
                        Nenhuma notificação automática cadastrada no sistema.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-brand-border/60 text-brand-text font-bold text-xs uppercase tracking-wider">
                              <th className="py-2.5 px-3">Profissional</th>
                              <th className="py-2.5 px-3">Título / Mensagem</th>
                              <th className="py-2.5 px-3">Tipo</th>
                              <th className="py-2.5 px-3">Lido em</th>
                              <th className="py-2.5 px-3">Enviado em</th>
                              <th className="py-2.5 px-3 text-right">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border/30 text-xs">
                            {platformPushNotifications.map((n) => (
                              <tr key={n.id} className="hover:bg-brand-bg/10 transition-colors">
                                <td className="py-2.5 px-3">
                                  <p className="font-semibold text-brand-text">
                                    {n.professionals?.full_name || 'Profissional'}
                                  </p>
                                  <p className="text-[10px] text-brand-text-muted">
                                    {n.professionals?.google_email || ''}
                                  </p>
                                </td>
                                <td className="py-2.5 px-3 max-w-xs">
                                  <div className="flex items-center gap-2">
                                    {n.image_url && (
                                      <img
                                        src={n.image_url}
                                        alt="Capa"
                                        className="w-8 h-8 rounded object-cover flex-shrink-0 border border-brand-border/40"
                                      />
                                    )}
                                    <div className="overflow-hidden">
                                      <p className="font-medium text-brand-text truncate">{n.title}</p>
                                      <p className="text-brand-text-muted truncate text-[10px]">{n.message}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${
                                    n.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-150' :
                                    n.type === 'error' ? 'bg-red-50 text-red-700 border border-red-150' :
                                    n.type === 'warning' ? 'bg-amber-50 text-amber-700 border border-amber-150' :
                                    'bg-blue-50 text-blue-700 border border-blue-150'
                                  }`}>
                                    {n.type}
                                  </span>
                                </td>
                                <td className="py-2.5 px-3 text-brand-text-muted">
                                  {n.read_at ? new Date(n.read_at).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  }) : (
                                    <span className="text-[10px] text-red-500 font-semibold uppercase">Não lido</span>
                                  )}
                                </td>
                                <td className="py-2.5 px-3 text-brand-text-muted">
                                  {n.created_at ? new Date(n.created_at).toLocaleDateString('pt-BR', {
                                    day: '2-digit',
                                    month: '2-digit',
                                    hour: '2-digit',
                                    minute: '2-digit'
                                  }) : 'N/A'}
                                </td>
                                <td className="py-2.5 px-3 text-right">
                                  <button
                                    onClick={() => handleCopyNotification(n)}
                                    className="p-1 text-brand-primary hover:bg-brand-bg rounded transition-colors mr-1 cursor-pointer"
                                    title="Reaproveitar Conteúdo (Copiar)"
                                  >
                                    <Copy size={15} />
                                  </button>
                                  <button
                                    onClick={() => handleResendNotification(n)}
                                    disabled={resendingNotifId === n.id}
                                    className="p-1 text-emerald-600 hover:bg-emerald-50 rounded transition-colors mr-1 disabled:opacity-50 cursor-pointer"
                                    title="Reenviar Notificação Imediatamente"
                                  >
                                    {resendingNotifId === n.id ? <Loader2 className="animate-spin" size={15} /> : <RefreshCw size={15} />}
                                  </button>
                                  <button
                                    onClick={() => handleDeleteNotification(n.id)}
                                    disabled={deletingNotifId === n.id}
                                    className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50 cursor-pointer"
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : activeTab === 'email_notifications' ? (
              <div className="space-y-6">
                  {/* Formulário de Envio de E-mail */}
                  <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                    <div className="flex items-center space-x-3 mb-6">
                      <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                        <Mail className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                          Disparar E-mail Informativo
                        </h2>
                        <p className="text-xs text-brand-text-muted mt-0.5">
                          Envie uma notificação por e-mail (via SMTP) para um profissional específico ou broadcast para todos.
                        </p>
                      </div>
                    </div>

                    <form onSubmit={handleSendEmailNotification} className="space-y-4">
                      {notifSendSuccess && (
                        <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl text-emerald-800 text-xs flex gap-2">
                          <Check className="flex-shrink-0 text-emerald-600" size={16} />
                          <span>E-mail(s) disparado(s) com sucesso para o(s) destinatário(s)!</span>
                        </div>
                      )}

                      {notifSendError && (
                        <div className="p-3 bg-red-50 border border-red-100 rounded-xl text-red-800 text-xs flex gap-2">
                          <ShieldAlert className="flex-shrink-0 text-red-600" size={16} />
                          <span>{notifSendError}</span>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Destinatário</label>
                        <select
                          value={broadcastTarget}
                          onChange={(e) => setBroadcastTarget(e.target.value as any)}
                          className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                        >
                          <option value="all">Todos os Profissionais (Broadcast)</option>
                          <option value="specific">Profissional Específico</option>
                        </select>
                      </div>

                      {broadcastTarget === 'specific' && (
                        <div className="space-y-1">
                          <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Selecionar Profissional</label>
                          <select
                            value={selectedProfessionalId}
                            onChange={(e) => setSelectedProfessionalId(e.target.value)}
                            required
                            className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                          >
                            <option value="">-- Escolha o Profissional --</option>
                            {professionals.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.full_name} ({p.google_email || 'Sem e-mail'})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Assunto do E-mail</label>
                        <input
                          type="text"
                          value={notifTitle}
                          onChange={(e) => setNotifTitle(e.target.value)}
                          placeholder="ex: Atualização de Termos de Uso"
                          required
                          className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                        />
                      </div>

                      <div className="space-y-1">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">Conteúdo / Mensagem</label>
                        <textarea
                          value={notifContent}
                          onChange={(e) => setNotifContent(e.target.value)}
                          placeholder="Digite o corpo do e-mail que será enviado..."
                          required
                          rows={6}
                          className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium resize-none"
                        />
                      </div>

                      <div className="pt-2">
                        <button
                          type="submit"
                          disabled={notifSending}
                          className="w-full py-3 bg-brand-primary text-white font-bold rounded-xl text-sm hover:bg-brand-primary-hover transition-colors flex items-center justify-center space-x-2 disabled:opacity-50 cursor-pointer"
                        >
                          {notifSending ? <Loader2 className="animate-spin" size={18} /> : <Send size={18} />}
                          <span>Disparar E-mail Informativo</span>
                        </button>
                      </div>
                    </form>
                  </div>

                  {/* Fila de Envio em Tempo Real */}
                  {emailSendQueue.length > 0 && (
                    <div className="card p-6 bg-white shadow-sm border border-brand-border/60 space-y-4">
                      <div className="flex items-center justify-between border-b border-brand-border/40 pb-2">
                        <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
                          <Activity size={18} className="text-brand-primary animate-pulse" />
                          <span>Fila de Envio de E-mails</span>
                        </h3>
                        <button
                          onClick={() => setEmailSendQueue([])}
                          className="text-xs text-brand-text-muted hover:text-brand-primary font-medium cursor-pointer"
                        >
                          Limpar Fila
                        </button>
                      </div>

                      <div className="max-h-60 overflow-y-auto divide-y divide-brand-border/30 text-xs">
                        {emailSendQueue.map((item) => (
                          <div key={item.id} className="py-2.5 flex items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <p className="font-semibold text-brand-text truncate">{item.name}</p>
                              <p className="text-brand-text-muted truncate text-[10px]">{item.email}</p>
                              {item.status === 'error' && item.error && (
                                <p className="text-[10px] text-red-500 font-medium mt-0.5 bg-red-50 px-2 py-0.5 rounded-lg border border-red-100 inline-block">
                                  {item.error}
                                </p>
                              )}
                            </div>
                            <div className="flex items-center gap-1.5 flex-shrink-0">
                              {item.status === 'pending' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-100">
                                  <Clock size={12} className="animate-pulse" />
                                  Pendente
                                </span>
                              )}
                              {item.status === 'sending' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-100">
                                  <Loader2 size={12} className="animate-spin" />
                                  Enviando
                                </span>
                              )}
                              {item.status === 'success' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-100">
                                  <Check size={12} />
                                  Sucesso
                                </span>
                              )}
                              {item.status === 'error' && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-100">
                                  <XCircle size={12} />
                                  Erro
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Acesso ao Histórico de E-mails */}
                  <button
                    onClick={() => setActiveTab('email_history')}
                    className="w-full card p-5 bg-white shadow-sm border border-brand-border/60 flex items-center justify-between hover:border-brand-primary/40 hover:shadow-md transition-all duration-200 cursor-pointer group text-left"
                  >
                    <div className="flex items-center gap-4">
                      <div className="p-3 rounded-xl bg-brand-primary/10 group-hover:bg-brand-primary/20 transition-colors">
                        <Clock size={22} className="text-brand-primary" />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-brand-text">Histórico de E-mails Enviados</h3>
                        <p className="text-xs text-brand-text-muted mt-0.5">
                          Visualize, pesquise e gerencie todos os registros de notificações enviadas pela plataforma.
                        </p>
                      </div>
                    </div>
                    <div className="flex-shrink-0 ml-4 flex items-center gap-1.5 text-xs font-semibold text-brand-primary group-hover:gap-2.5 transition-all">
                      <span>Ver histórico</span>
                      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className="transition-transform group-hover:translate-x-0.5">
                        <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>

                  {/* SMTP Config */}
                  <form onSubmit={handleSaveAdminSmtp} className="card p-6 bg-white shadow-sm border border-brand-border/60 space-y-4">
                    <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
                      <Settings className="text-brand-primary w-5 h-5" />
                      <span>Servidor SMTP Global</span>
                    </h3>
                    <p className="text-xs text-brand-text-muted leading-relaxed">
                      Configure os dados SMTP globais da plataforma para que todas as notificações disparadas enviem e-mails reais de sistema aos terapeutas. O envio pode ser roteado pela Brevo ou pelo SMTP, conforme o provedor ativo.
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-brand-text block mb-1">HOST SMTP</label>
                        <input
                          type="text"
                          value={adminSmtpHost}
                          onChange={e => setAdminSmtpHost(e.target.value)}
                          placeholder="smtp.gmail.com"
                          required
                          className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                        />
                      </div>

                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-2">
                          <label className="text-[10px] font-bold text-brand-text block mb-1">USUÁRIO SMTP</label>
                          <input
                            type="text"
                            value={adminSmtpUser}
                            onChange={e => setAdminSmtpUser(e.target.value)}
                            placeholder="contato@evolucaoclinica.app.br"
                            required
                            className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-brand-text block mb-1">PORTA</label>
                          <input
                            type="text"
                            value={adminSmtpPort}
                            onChange={e => setAdminSmtpPort(e.target.value)}
                            placeholder="587"
                            required
                            className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-brand-text block mb-1">CONEXÃO SEGURA (SSL)</label>
                        <select
                          value={adminSmtpSecure ? 'ssl' : 'no_ssl'}
                          onChange={e => setAdminSmtpSecure(e.target.value === 'ssl')}
                          className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                        >
                          <option value="no_ssl">Sem SSL (TLS / STARTTLS - Portas 587, 25)</option>
                          <option value="ssl">Com SSL (Porta 465)</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-brand-text block mb-1">SENHA SMTP</label>
                        <input
                          type="password"
                          value={adminSmtpPass}
                          onChange={e => setAdminSmtpPass(e.target.value)}
                          placeholder="Senha de app ou do servidor"
                          required
                          className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-brand-text block mb-1">REMETENTE (FROM)</label>
                        <input
                          type="text"
                          value={adminSmtpFrom}
                          onChange={e => setAdminSmtpFrom(e.target.value)}
                          placeholder='"Evolução Clínica" <suporte@...>'
                          className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                        />
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={adminSmtpSaving}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover font-semibold transition-colors text-sm disabled:opacity-50 cursor-pointer"
                    >
                      {adminSmtpSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      <span>Salvar Configuração de E-mail</span>
                    </button>

                    {adminSmtpSuccess && (
                      <div className="bg-emerald-50 border border-emerald-100 p-3 rounded-xl text-xs flex gap-2 text-emerald-800 animate-fade-in">
                        <Check className="text-emerald-600 flex-shrink-0" />
                        <span>Configurações de e-mail atualizadas com sucesso!</span>
                      </div>
                    )}

                    {/* Seção de Teste de E-mail */}
                    <div className="border-t border-brand-border/40 pt-4 mt-4 space-y-3">
                      <label className="text-[10px] font-bold text-brand-text block uppercase tracking-wider animate-fade-in">Testar Configuração de E-mail</label>
                      <div className="flex gap-2">
                        <input
                          type="email"
                          value={testEmailTarget}
                          onChange={e => setTestEmailTarget(e.target.value)}
                          placeholder="Digite o e-mail de destino..."
                          className="flex-1 text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                        />
                        <button
                          type="button"
                          onClick={handleSendTestEmail}
                          disabled={testEmailSending || !testEmailTarget}
                          className="px-4 py-2.5 bg-brand-primary/10 text-brand-primary hover:bg-brand-primary/20 font-semibold text-sm rounded-xl border border-brand-primary/20 flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer"
                        >
                          {testEmailSending ? <Loader2 className="animate-spin" size={16} /> : <Mail size={16} />}
                          <span>Testar</span>
                        </button>
                      </div>
                      {testEmailStatus && (
                        <div className={`p-2.5 rounded-xl border text-[11px] flex gap-2 ${testEmailStatus === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-800' : 'bg-red-50 border-red-100 text-red-800'}`}>
                          <Check size={14} className="text-emerald-600 flex-shrink-0 mt-0.5" />
                          <span>{testEmailMessage}</span>
                        </div>
                      )}
                    </div>
                  </form>

                  {/* Brevo API Config */}
                  <form onSubmit={handleSaveAdminSmtp} className="card p-6 bg-white shadow-sm border border-brand-border/60 space-y-4">
                    <h3 className="text-lg font-semibold text-brand-text flex items-center space-x-2">
                      <Mail className="text-brand-primary w-5 h-5" />
                      <span>Integração Brevo API</span>
                    </h3>
                    <p className="text-xs text-brand-text-muted leading-relaxed">
                      Use a API da Brevo para disparar os e-mails de sistema. Quando este provedor estiver ativo, a plataforma prioriza a Brevo e mantém o SMTP como fallback.
                    </p>

                    <div className="space-y-3">
                      <div>
                        <label className="text-[10px] font-bold text-brand-text block mb-1">PROVEDOR ATIVO</label>
                        <select
                          value={adminEmailProvider}
                          onChange={e => setAdminEmailProvider(e.target.value as 'smtp' | 'brevo')}
                          className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                        >
                          <option value="brevo">Brevo API</option>
                          <option value="smtp">SMTP</option>
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] font-bold text-brand-text block mb-1">API KEY BREVO</label>
                        <input
                          type="password"
                          value={adminBrevoApiKey}
                          onChange={e => setAdminBrevoApiKey(e.target.value)}
                          placeholder="chave da Brevo"
                          className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] font-bold text-brand-text block mb-1">NOME DO REMETENTE</label>
                          <input
                            type="text"
                            value={adminBrevoSenderName}
                            onChange={e => setAdminBrevoSenderName(e.target.value)}
                            placeholder="Evolução Clínica"
                            className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] font-bold text-brand-text block mb-1">E-MAIL DO REMETENTE</label>
                          <input
                            type="email"
                            value={adminBrevoSenderEmail}
                            onChange={e => setAdminBrevoSenderEmail(e.target.value)}
                            placeholder="no-reply@seudominio.com"
                            className="w-full text-sm border border-brand-border/80 rounded-xl px-3 py-2 bg-brand-bg/30 focus:outline-none focus:border-brand-primary focus:bg-white transition-all font-medium"
                          />
                        </div>
                      </div>
                    </div>

                    <button
                      type="submit"
                      disabled={adminSmtpSaving}
                      className="w-full flex items-center justify-center space-x-2 px-4 py-2.5 rounded-xl bg-brand-primary text-white hover:bg-brand-primary-hover font-semibold transition-colors text-sm disabled:opacity-50 cursor-pointer"
                    >
                      {adminSmtpSaving ? <Loader2 className="animate-spin" size={18} /> : <Save size={18} />}
                      <span>Salvar Brevo API</span>
                    </button>

                    <div className="rounded-xl border border-sky-100 bg-sky-50/70 p-3 text-[11px] text-sky-800 leading-relaxed">
                      O remetente precisa estar validado na Brevo para que a API envie as mensagens com sucesso.
                    </div>
                  </form>
              </div>
            ) : activeTab === 'migrations' ? (
              <MigrationRequestsAdmin />
            ) : activeTab === 'email_history' ? (
              <EmailHistory />
            ) : activeTab === 'support' ? (
              <div className="space-y-6">
                <div className="card p-6 bg-white shadow-sm border border-brand-border/60">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                    <div className="flex items-center space-x-3">
                      <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                        <LifeBuoy className="w-6 h-6" />
                      </div>
                      <div>
                        <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                          Atendimento ao Cliente (Tickets)
                        </h2>
                        <p className="text-xs text-brand-text-muted mt-0.5">
                          Monitore e responda às solicitações. Priorize os clientes VIP (Anual) com SLA de 2 horas úteis.
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 self-start md:self-center">
                      {unreadSupportMessagesCount > 0 && (
                        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-700 px-3 py-1.5 rounded-full text-[10px] font-bold border border-amber-200">
                          <MessageSquare size={12} />
                          {unreadSupportMessagesCount} nova{unreadSupportMessagesCount > 1 ? 's' : ''} mensagem{unreadSupportMessagesCount > 1 ? 's' : ''}
                        </span>
                      )}
                      <span className="bg-gray-50 text-gray-500 px-3 py-1.5 rounded-full text-xs font-semibold border border-gray-100">
                        {adminTickets.length} {adminTickets.length === 1 ? 'chamado' : 'chamados'}
                      </span>
                    </div>
                  </div>

                  {isAdminSupportDetail ? (
                    <div className="pt-2">
                      <SupportTicketDetail />
                    </div>
                  ) : (
                    <>
                  {/* Filtros */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 mb-6 bg-brand-bg/20 p-4 rounded-2xl border border-brand-border/30">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Pesquisa</label>
                      <input
                        type="text"
                        value={supportSearchQuery}
                        onChange={(e) => setSupportSearchQuery(e.target.value)}
                        placeholder="Buscar por assunto ou nome..."
                        className="w-full px-3 py-2 rounded-xl border border-brand-border/80 text-xs outline-none focus:border-brand-primary bg-white"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Status</label>
                      <select
                        value={supportStatusFilter}
                        onChange={(e) => setSupportStatusFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-brand-border/80 text-xs outline-none focus:border-brand-primary bg-white"
                      >
                         <option value="open_in_progress">Aberto / Em Atendimento</option>
                         <option value="all">Todos os Status</option>
                         <option value="open">Aberto</option>
                         <option value="in_progress">Em Atendimento</option>
                         <option value="closed">Fechados</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Categoria</label>
                      <select
                        value={supportCategoryFilter}
                        onChange={(e) => setSupportCategoryFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-brand-border/80 text-xs outline-none focus:border-brand-primary bg-white"
                      >
                         <option value="all">Todas as Categorias</option>
                         <option value="payment">Pagamento & Cobrança</option>
                         <option value="technical">Problema Técnico</option>
                         <option value="account">Conta & Acesso</option>
                         <option value="general">Dúvida Geral</option>
                      </select>
                    </div>
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold text-brand-text uppercase tracking-wider block">Plano</label>
                      <select
                        value={supportPlanFilter}
                        onChange={(e) => setSupportPlanFilter(e.target.value)}
                        className="w-full px-3 py-2 rounded-xl border border-brand-border/80 text-xs outline-none focus:border-brand-primary bg-white"
                      >
                         <option value="all">Todos os Planos</option>
                         <option value="yearly">Anual (VIP)</option>
                         <option value="monthly">Mensal</option>
                         <option value="trial">Trial / Gratuito</option>
                      </select>
                    </div>
                  </div>

                  {loadingAdminTickets ? (
                    <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
                      <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                      <span className="text-sm">Carregando chamados...</span>
                    </div>
                  ) : adminTicketsError ? (
                    <div className="p-12 text-center text-rose-500 text-sm">{adminTicketsError}</div>
                  ) : (() => {
                    const filtered = adminTickets.filter((ticket) => {
                      if (!ticket) return false;
                      const matchesQuery = 
                        (ticket.subject || '').toLowerCase().includes(supportSearchQuery.toLowerCase()) ||
                        (ticket.userFullName || '').toLowerCase().includes(supportSearchQuery.toLowerCase()) ||
                        (ticket.userEmail || '').toLowerCase().includes(supportSearchQuery.toLowerCase());

                      let matchesStatus = true;
                      if (supportStatusFilter === 'open_in_progress') {
                        matchesStatus = ticket.status === 'open' || ticket.status === 'in_progress';
                      } else if (supportStatusFilter !== 'all') {
                        matchesStatus = ticket.status === supportStatusFilter;
                      }

                      const matchesCategory = supportCategoryFilter === 'all' || ticket.category === supportCategoryFilter;
                      const matchesPlan = supportPlanFilter === 'all' || ticket.userPlan === supportPlanFilter;

                      return matchesQuery && matchesStatus && matchesCategory && matchesPlan;
                    });


                    if (filtered.length === 0) {
                      return (
                        <div className="p-12 text-center text-brand-text-muted text-sm leading-relaxed">
                          Nenhum chamado de suporte atende a estes critérios de filtro.
                        </div>
                      );
                    }

                    const getCategoryLabel = (category: string) => {
                      switch (category) {
                        case 'payment': return 'Pagamento';
                        case 'technical': return 'Técnico';
                        case 'account': return 'Acesso';
                        default: return 'Geral';
                      }
                    };

                    const handleAdminCloseTicket = async (ticketId: string) => {
                      if (!window.confirm('Marcar este chamado como resolvido/fechado?')) return;
                      try {
                        await updateSupportTicketStatus(ticketId, 'closed');
                        fetchAdminTickets();
                      } catch (err: any) {
                        alert('Erro ao fechar chamado: ' + err.message);
                      }
                    };

                    return (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-sm border-collapse">
                          <thead>
                            <tr className="border-b border-brand-border/60 text-brand-text font-bold text-xs uppercase tracking-wider bg-brand-bg/10">
                              <th className="py-3 px-4">Profissional</th>
                              <th className="py-3 px-4">Assunto</th>
                              <th className="py-3 px-4">Categoria</th>
                              <th className="py-3 px-4">Status</th>
                              <th className="py-3 px-4">SLA</th>
                              <th className="py-3 px-4">Limite Resposta</th>
                              <th className="py-3 px-4 text-right">Ações</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-border/30 text-xs">
                            {filtered.map((ticket) => {
                              const isVIP = ticket.userPlan === 'yearly';
                              return (
                                <tr 
                                  key={ticket.id} 
                                  className={`hover:bg-brand-bg/15 transition-colors ${
                                    isVIP ? 'bg-amber-500/[0.015] border-l-2 border-l-amber-500' : ''
                                  }`}
                                >
                                  <td className="py-3 px-4">
                                    <div className="flex items-center space-x-2">
                                      {isVIP && <span className="text-amber-500 font-bold" title="Cliente VIP Anual">👑</span>}
                                      <div>
                                        <p className="font-semibold text-brand-text">
                                          {ticket.userFullName || 'Profissional'}
                                        </p>
                                        <p className="text-[10px] text-brand-text-muted">
                                          {ticket.userPlan === 'yearly' ? 'Plano Anual' : ticket.userPlan === 'monthly' ? 'Plano Mensal' : 'Período Trial'}
                                        </p>
                                      </div>
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 font-medium text-brand-text">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span>{ticket.subject}</span>
                                      {isSupportTicketUnread(ticket, 'admin') && ticket.latestMessageSenderRole === 'user' && (
                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200 text-[10px] font-bold">
                                          <MessageSquare size={12} />
                                          Nova mensagem
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="py-3 px-4 text-brand-text-muted">
                                    <span className="bg-gray-50 border border-gray-200 text-gray-700 px-2 py-0.5 rounded text-[10px] font-medium">
                                      {getCategoryLabel(ticket.category)}
                                    </span>
                                  </td>
                                  <td className="py-3 px-4">
                                    <TicketStatusBadge status={ticket.status} />
                                  </td>
                                  <td className="py-3 px-4">
                                    <TicketSlaBadge status={ticket.slaStatus} />
                                  </td>
                                  <td className="py-3 px-4 text-brand-text-muted">
                                    {ticket.firstResponseAt ? (
                                      <span className="text-emerald-600 font-medium">
                                        Respondido
                                      </span>
                                    ) : (
                                      <span className={ticket.slaStatus === 'overdue' ? 'text-red-600 font-bold' : ''}>
                                        {ticket.firstResponseDueAt && !isNaN(new Date(ticket.firstResponseDueAt).getTime()) ? new Date(ticket.firstResponseDueAt).toLocaleString('pt-BR', {
                                          day: '2-digit',
                                          month: '2-digit',
                                          hour: '2-digit',
                                          minute: '2-digit'
                                        }) : 'N/A'}
                                      </span>
                                    )}
                                  </td>
                                  <td className="py-3 px-4 text-right space-x-2">
                                    <Link
                                      to={`/admin/support/${ticket.id}`}
                                      className="inline-flex items-center px-3 py-1.5 bg-brand-primary text-white hover:bg-brand-primary-hover rounded-xl transition-colors font-semibold text-[10px] shadow-sm hover:shadow"
                                    >
                                      Acessar Conversa
                                    </Link>
                                    {ticket.status !== 'closed' && (
                                      <button
                                        onClick={() => handleAdminCloseTicket(ticket.id)}
                                        className="inline-flex items-center px-3 py-1.5 border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl transition-colors font-semibold text-[10px] cursor-pointer"
                                      >
                                        Fechar
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                         </table>
                       </div>
                     );
                    })()}
                    </>
                  )}
                </div>
              </div>
            ) : activeTab === 'vapid_keys' ? (
              <div className="space-y-6 max-w-4xl">
                {/* VAPID Details */}
                <div className="card p-6 bg-white shadow-sm border border-brand-border/60 space-y-4">
                  <div className="flex items-center space-x-3 mb-2">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <Key className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                        Chaves Web Push VAPID
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Essas chaves são usadas para assinar e criptografar as mensagens enviadas aos navegadores através da Push API.
                      </p>
                    </div>
                  </div>

                  <div className="space-y-4 pt-2">
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">CHAVE PÚBLICA (VAPID PUBLIC KEY)</label>
                      <input
                        type="text"
                        readOnly
                        value={adminVapidPublic}
                        className="w-full border border-brand-border/85 bg-brand-bg/40 px-3 py-2.5 rounded-xl font-mono text-xs select-all cursor-text outline-none focus:border-brand-primary transition-all font-medium"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">CHAVE PRIVADA (VAPID PRIVATE KEY)</label>
                      <input
                        type="password"
                        readOnly
                        value={adminVapidPrivate}
                        className="w-full border border-brand-border/85 bg-brand-bg/40 px-3 py-2.5 rounded-xl font-mono text-xs select-all cursor-text outline-none focus:border-brand-primary transition-all font-medium"
                      />
                    </div>
                  </div>
                </div>
              </div>
            ) : activeTab === 'faq' ? (
              /* Aba de Gerenciamento do FAQ do Sistema [NEW] */
              <div className="space-y-6">
                <div className="card bg-white p-6 md:p-8 border-brand-border animate-fadeIn">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <HelpCircle className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                        Gerenciar FAQ
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Gerencie as dúvidas e respostas frequentes exibidas no Guia de Uso dos profissionais.
                      </p>
                    </div>
                  </div>
                  <AdminFaqCrud />
                </div>
              </div>
            ) : activeTab === 'feedback' ? (
              <div className="space-y-6">
                <div className="card bg-white p-6 md:p-8 border-brand-border animate-fadeIn">
                  <FeedbackAdmin />
                </div>
              </div>
            ) : activeTab === 'tracking' ? (
              <div className="space-y-6 max-w-4xl">
                <div className="card bg-white p-6 md:p-8 border-brand-border animate-fadeIn">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <Code className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                        Códigos de Rastreamento & Scripts
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Configure o Google Tag Manager, Facebook Pixel e injete códigos customizados no cabeçalho, corpo e rodapé.
                      </p>
                    </div>
                  </div>

                  {trackingSettingsLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                      <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
                      <p className="text-sm text-brand-text-muted">Carregando configurações...</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveTrackingSettings} className="space-y-6">
                      {trackingSaveError && (
                        <div className="p-3 bg-red-50 border border-red-200 text-red-600 rounded-lg text-sm flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 shrink-0" />
                          <span>{trackingSaveError}</span>
                        </div>
                      )}

                      {trackingSaveSuccess && (
                        <div className="p-3 bg-green-50 border border-green-200 text-green-600 rounded-lg text-sm flex items-center gap-2 animate-fadeIn">
                          <CheckCircle2 className="h-4 w-4 shrink-0" />
                          <span>Configurações salvas com sucesso!</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-brand-text uppercase tracking-wider">
                            Google Tag Manager ID
                          </label>
                          <input
                            type="text"
                            placeholder="GTM-XXXXXXX"
                            value={gtmId}
                            onChange={(e) => setGtmId(e.target.value)}
                            className="w-full px-3 py-2 border border-brand-border rounded-lg bg-transparent text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm font-mono"
                          />
                          <p className="text-[11px] text-brand-text-muted">ID do container do seu GTM. Ex: GTM-ABC1234.</p>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-brand-text uppercase tracking-wider">
                            Facebook Pixel ID
                          </label>
                          <input
                            type="text"
                            placeholder="Ex: 123456789012345"
                            value={fbPixelId}
                            onChange={(e) => setFbPixelId(e.target.value)}
                            className="w-full px-3 py-2 border border-brand-border rounded-lg bg-transparent text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm font-mono"
                          />
                          <p className="text-[11px] text-brand-text-muted">Apenas o ID numérico do seu Pixel do Facebook.</p>
                        </div>
                      </div>

                      <div className="space-y-5 pt-5 border-t border-brand-border">
                        <div>
                          <h3 className="text-sm font-semibold text-brand-primary flex items-center gap-2">
                            <Sparkles className="w-4 h-4" />
                            Scripts Customizados Avançados
                          </h3>
                          <p className="text-xs text-brand-text-muted mt-1">Use estes campos para injetar scripts gerais, tags de verificação ou qualquer outro script necessário.</p>
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-brand-text uppercase tracking-wider">
                            Código no Head (fim do &lt;head&gt;)
                          </label>
                          <textarea
                            rows={4}
                            placeholder="<!-- Ex: Meta tags de verificação, scripts de terceiros, CSS customizado -->"
                            value={headScripts}
                            onChange={(e) => setHeadScripts(e.target.value)}
                            className="w-full px-3 py-2 border border-brand-border rounded-lg bg-transparent text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm font-mono leading-relaxed"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-brand-text uppercase tracking-wider">
                            Código no Body (início do &lt;body&gt;)
                          </label>
                          <textarea
                            rows={4}
                            placeholder="<!-- Ex: Scripts noscript, contêineres de rastreamento alternativos -->"
                            value={bodyScripts}
                            onChange={(e) => setBodyScripts(e.target.value)}
                            className="w-full px-3 py-2 border border-brand-border rounded-lg bg-transparent text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm font-mono leading-relaxed"
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="block text-xs font-semibold text-brand-text uppercase tracking-wider">
                            Código no Footer (fim do &lt;body&gt;)
                          </label>
                          <textarea
                            rows={4}
                            placeholder="<!-- Ex: Widgets de chat, botões de contato, scripts de fechamento -->"
                            value={footerScripts}
                            onChange={(e) => setFooterScripts(e.target.value)}
                            className="w-full px-3 py-2 border border-brand-border rounded-lg bg-transparent text-brand-text focus:outline-none focus:ring-2 focus:ring-brand-primary/20 focus:border-brand-primary text-sm font-mono leading-relaxed"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end pt-4 border-t border-brand-border">
                        <button
                          type="submit"
                          disabled={savingTracking}
                          className="px-4 py-2 bg-brand-primary hover:bg-brand-primary-hover text-white rounded-lg text-sm font-semibold flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer transition-colors duration-200"
                        >
                          {savingTracking ? (
                            <>
                              <Loader2 className="h-4 w-4 animate-spin" />
                              <span>Salvando...</span>
                            </>
                          ) : (
                            <>
                              <Save className="h-4 w-4" />
                              <span>Salvar Configurações</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            ) : activeTab === 'brand' ? (
              /* Aba de Configuração de Identidade Visual e PWA [NEW] */
              <div className="space-y-6 max-w-4xl">
                <div className="card bg-white p-6 md:p-8 border-brand-border">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <Globe className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                        Identidade Visual
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Gerencie os logotipos da plataforma e o favicon do navegador. Essas alterações são propagadas ao PWA em tempo real.
                      </p>
                    </div>
                  </div>

                  {brandSettingsLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-4">
                      <Loader2 className="w-8 h-8 animate-spin text-brand-primary" />
                      <p className="text-sm text-brand-text-muted">Carregando configurações...</p>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveBrandSettings} className="space-y-8">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* Logotipo Light */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Logotipo Light (Fundo Claro)</h3>
                            <p className="text-xs text-brand-text-muted mt-1">Exibido na barra lateral principal, login e áreas com fundo claro.</p>
                          </div>
                          
                          <div className="flex items-center justify-center p-6 bg-white border border-dashed border-brand-border rounded-xl h-40">
                            {brandLogoLight ? (
                              <img src={brandLogoLight} alt="Logo Light Preview" className="max-h-full max-w-full object-contain" />
                            ) : (
                              <span className="text-xs text-brand-text-muted">Nenhum logotipo enviado</span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3">
                            <label className="btn-outline flex-1 text-center py-2.5 text-xs font-semibold cursor-pointer">
                              {uploadingLight ? (
                                <span className="flex items-center justify-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                              ) : (
                                <span className="flex items-center justify-center"><Upload className="w-3.5 h-3.5 mr-2" /> Escolher Imagem</span>
                              )}
                              <input 
                                type="file" 
                                accept="image/png,image/jpeg,image/svg+xml,image/gif" 
                                className="hidden" 
                                disabled={uploadingLight}
                                onChange={(e) => handleBrandUpload(e, 'light')} 
                              />
                            </label>
                          </div>
                        </div>

                        {/* Logotipo Dark */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Logotipo Dark (Fundo Escuro)</h3>
                            <p className="text-xs text-brand-text-muted mt-1">Versão reservada para visualizações ou temas com fundo escuro.</p>
                          </div>
                          
                          <div className="flex items-center justify-center p-6 bg-stone-900 border border-dashed border-stone-700 rounded-xl h-40">
                            {brandLogoDark ? (
                              <img src={brandLogoDark} alt="Logo Dark Preview" className="max-h-full max-w-full object-contain" />
                            ) : (
                              <span className="text-xs text-stone-400">Nenhum logotipo enviado</span>
                            )}
                          </div>

                          <div className="flex items-center space-x-3">
                            <label className="btn-outline flex-1 text-center py-2.5 text-xs font-semibold cursor-pointer">
                              {uploadingDark ? (
                                <span className="flex items-center justify-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                              ) : (
                                <span className="flex items-center justify-center"><Upload className="w-3.5 h-3.5 mr-2" /> Escolher Imagem</span>
                              )}
                              <input 
                                type="file" 
                                accept="image/png,image/jpeg,image/svg+xml,image/gif" 
                                className="hidden" 
                                disabled={uploadingDark}
                                onChange={(e) => handleBrandUpload(e, 'dark')} 
                              />
                            </label>
                          </div>
                        </div>

                        {/* Favicon */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4 md:col-span-2">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Favicon (Ícone do Navegador e PWA)</h3>
                            <p className="text-xs text-brand-text-muted mt-1">Exibido na aba do navegador e no ícone do PWA.</p>
                          </div>
                          
                          <div className="flex items-center space-x-6">
                            <div className="flex items-center justify-center p-4 bg-white border border-brand-border rounded-xl w-20 h-20 shadow-inner">
                              {brandFavicon ? (
                                <img src={brandFavicon} alt="Favicon Preview" className="w-12 h-12 object-contain" />
                              ) : (
                                <span className="text-[10px] text-brand-text-muted text-center">Favicon</span>
                              )}
                            </div>

                            <div className="flex-1 space-y-2">
                              <label className="btn-outline inline-flex text-center py-2.5 px-4 text-xs font-semibold cursor-pointer">
                                {uploadingFavicon ? (
                                  <span className="flex items-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                                ) : (
                                  <span className="flex items-center"><Upload className="w-3.5 h-3.5 mr-2" /> Upload do Favicon</span>
                                )}
                                <input 
                                  type="file" 
                                  accept="image/png,image/x-icon,image/svg+xml" 
                                  className="hidden" 
                                  disabled={uploadingFavicon}
                                  onChange={(e) => handleBrandUpload(e, 'favicon')} 
                                />
                              </label>
                              <p className="text-[10px] text-brand-text-muted">Recomendado: formato quadrado PNG ou SVG.</p>
                            </div>
                          </div>
                        </div>

                        {/* Ícone das Notificações Push */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4 md:col-span-2">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Ícone padrão das notificações</h3>
                            <p className="text-xs text-brand-text-muted mt-1">
                              Envie a imagem que será usada nos alertas do navegador. O arquivo é publicado no bucket público da marca e recebe uma URL pública automaticamente.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-[auto,1fr] gap-4 items-center">
                            <div className="flex items-center justify-center p-4 bg-white border border-brand-border rounded-xl w-20 h-20 shadow-inner flex-shrink-0">
                              {brandPushNotificationIcon ? (
                                <img src={brandPushNotificationIcon} alt="Ícone de notificações push" className="w-12 h-12 object-contain" />
                              ) : (
                                <span className="text-[10px] text-brand-text-muted text-center leading-tight">Sem imagem</span>
                              )}
                            </div>

                            <div className="space-y-2">
                              <label className="btn-outline inline-flex text-center py-2.5 px-4 text-xs font-semibold cursor-pointer">
                                {uploadingPushNotificationIcon ? (
                                  <span className="flex items-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                                ) : (
                                  <span className="flex items-center"><Upload className="w-3.5 h-3.5 mr-2" /> Upload do ícone</span>
                                )}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/svg+xml,image/webp,image/gif"
                                  className="hidden"
                                  disabled={uploadingPushNotificationIcon}
                                  onChange={(e) => handleBrandUpload(e, 'pushnotification')}
                                />
                              </label>
                              <p className="text-[10px] text-brand-text-muted">
                                Recomendado: PNG quadrado, SVG ou WebP. O arquivo é enviado para o bucket público <span className="font-semibold">brand</span>.
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Ícone PWA 192 */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Ícone do App PWA (192x192)</h3>
                            <p className="text-xs text-brand-text-muted mt-1">Exibido na tela inicial de celulares e tablets instalados.</p>
                          </div>
                          
                          <div className="flex items-center space-x-6">
                            <div className="flex items-center justify-center p-4 bg-white border border-brand-border rounded-xl w-20 h-20 shadow-inner flex-shrink-0">
                              {brandPwa192 ? (
                                <img src={brandPwa192} alt="PWA 192 Preview" className="w-12 h-12 object-contain" />
                              ) : (
                                <span className="text-[10px] text-brand-text-muted text-center">192x192</span>
                              )}
                            </div>

                            <div className="flex-1 space-y-2">
                              <label className="btn-outline inline-flex text-center py-2.5 px-4 text-xs font-semibold cursor-pointer">
                                {uploadingPwa192 ? (
                                  <span className="flex items-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                                ) : (
                                  <span className="flex items-center"><Upload className="w-3.5 h-3.5 mr-2" /> Upload Ícone 192</span>
                                )}
                                <input 
                                  type="file" 
                                  accept="image/png" 
                                  className="hidden" 
                                  disabled={uploadingPwa192}
                                  onChange={(e) => handleBrandUpload(e, 'pwa192')} 
                                />
                              </label>
                              <p className="text-[10px] text-brand-text-muted">Recomendado: 192x192px PNG quadrado.</p>
                            </div>
                          </div>
                        </div>

                        {/* Ícone PWA 512 */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Ícone do App PWA (512x512)</h3>
                            <p className="text-xs text-brand-text-muted mt-1">Exibido na Splash Screen de inicialização do app no celular.</p>
                          </div>
                          
                          <div className="flex items-center space-x-6">
                            <div className="flex items-center justify-center p-4 bg-white border border-brand-border rounded-xl w-20 h-20 shadow-inner flex-shrink-0">
                              {brandPwa512 ? (
                                <img src={brandPwa512} alt="PWA 512 Preview" className="w-12 h-12 object-contain" />
                              ) : (
                                <span className="text-[10px] text-brand-text-muted text-center">512x512</span>
                              )}
                            </div>

                            <div className="flex-1 space-y-2">
                              <label className="btn-outline inline-flex text-center py-2.5 px-4 text-xs font-semibold cursor-pointer">
                                {uploadingPwa512 ? (
                                  <span className="flex items-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                                ) : (
                                  <span className="flex items-center"><Upload className="w-3.5 h-3.5 mr-2" /> Upload Ícone 512</span>
                                )}
                                <input 
                                  type="file" 
                                  accept="image/png" 
                                  className="hidden" 
                                  disabled={uploadingPwa512}
                                  onChange={(e) => handleBrandUpload(e, 'pwa512')} 
                                />
                              </label>
                              <p className="text-[10px] text-brand-text-muted">Recomendado: 512x512px PNG quadrado.</p>
                            </div>
                          </div>
                        </div>

                        {/* Ícone PWA Mascarável */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4 md:col-span-2">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Ícone Mascarável PWA (Maskable Icon)</h3>
                            <p className="text-xs text-brand-text-muted mt-1">Garante que o ícone do aplicativo se adapte a formatos redondos, quadrados ou de gota no Android, sem cortes indesejados.</p>
                          </div>
                          
                          <div className="flex items-center space-x-6">
                            <div className="flex items-center justify-center p-4 bg-white border border-brand-border rounded-xl w-20 h-20 shadow-inner flex-shrink-0">
                              {brandPwaMaskable ? (
                                <img src={brandPwaMaskable} alt="PWA Maskable Preview" className="w-12 h-12 object-contain" />
                              ) : (
                                <span className="text-[10px] text-brand-text-muted text-center">Mascarável</span>
                              )}
                            </div>

                            <div className="flex-1 space-y-2">
                              <label className="btn-outline inline-flex text-center py-2.5 px-4 text-xs font-semibold cursor-pointer">
                                {uploadingPwaMaskable ? (
                                  <span className="flex items-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                                ) : (
                                  <span className="flex items-center"><Upload className="w-3.5 h-3.5 mr-2" /> Upload Mascarável</span>
                                )}
                                <input 
                                  type="file" 
                                  accept="image/png" 
                                  className="hidden" 
                                  disabled={uploadingPwaMaskable}
                                  onChange={(e) => handleBrandUpload(e, 'pwamaskable')} 
                                />
                              </label>
                            <p className="text-[10px] text-brand-text-muted">Recomendado: 512x512px PNG com margem segura de 10% a 15% ao redor do elemento central.</p>
                            </div>
                          </div>
                        </div>

                        {/* Imagens Específicas de Exibição */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-5 md:col-span-2">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Imagens Específicas de Exibição</h3>
                            <p className="text-xs text-brand-text-muted mt-1">
                              Defina imagens exclusivas para a mensagem de instalação do app e para a tela de carregamento inicial.
                            </p>
                          </div>

                          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                            <div className="rounded-2xl border border-brand-border/60 bg-white p-4 space-y-4">
                              <div>
                                <h4 className="text-xs font-semibold text-brand-text uppercase tracking-wider">Mensagem de instalação</h4>
                                <p className="text-[10px] text-brand-text-muted mt-1">
                                  Exibida na caixa "Instale o app Evolução Clínica".
                                </p>
                                <p className="text-[10px] text-brand-text-muted mt-1">
                                  Recomendado: imagem quadrada 1:1, com logo centralizado, fundo transparente e resolução mínima de 512x512px.
                                </p>
                              </div>

                              <div className="flex items-center justify-center p-5 bg-brand-bg/30 border border-dashed border-brand-border rounded-xl h-36">
                                {brandInstallLogo ? (
                                  <img src={brandInstallLogo} alt="Preview do ícone de instalação" className="max-h-full max-w-full object-contain" />
                                ) : (
                                  <span className="text-[10px] text-brand-text-muted text-center">Nenhuma imagem enviada</span>
                                )}
                              </div>

                              <label className="btn-outline w-full text-center py-2.5 text-xs font-semibold cursor-pointer">
                                {uploadingInstallLogo ? (
                                  <span className="flex items-center justify-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                                ) : (
                                  <span className="flex items-center justify-center"><Upload className="w-3.5 h-3.5 mr-2" /> Upload da imagem</span>
                                )}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/svg+xml,image/gif"
                                  className="hidden"
                                  disabled={uploadingInstallLogo}
                                  onChange={(e) => handleBrandUpload(e, 'install')}
                                />
                              </label>
                            </div>

                            <div className="rounded-2xl border border-brand-border/60 bg-white p-4 space-y-4">
                              <div>
                                <h4 className="text-xs font-semibold text-brand-text uppercase tracking-wider">Tela de carregamento</h4>
                                <p className="text-[10px] text-brand-text-muted mt-1">
                                  Exibida no carregamento com a mensagem "Preparando seu ambiente clínico...".
                                </p>
                                <p className="text-[10px] text-brand-text-muted mt-1">
                                  Recomendado: versão escura ou colorida do logo, com fundo transparente, alto contraste e leitura fácil sobre fundo claro.
                                </p>
                              </div>

                              <div className="flex items-center justify-center p-5 bg-brand-bg/30 border border-dashed border-brand-border rounded-xl h-36">
                                {brandLoadingLogo ? (
                                  <img src={brandLoadingLogo} alt="Preview do logo de carregamento" className="max-h-full max-w-full object-contain" />
                                ) : (
                                  <span className="text-[10px] text-brand-text-muted text-center">Nenhuma imagem enviada</span>
                                )}
                              </div>

                              <label className="btn-outline w-full text-center py-2.5 text-xs font-semibold cursor-pointer">
                                {uploadingLoadingLogo ? (
                                  <span className="flex items-center justify-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                                ) : (
                                  <span className="flex items-center justify-center"><Upload className="w-3.5 h-3.5 mr-2" /> Upload da imagem</span>
                                )}
                                <input
                                  type="file"
                                  accept="image/png,image/jpeg,image/svg+xml,image/gif"
                                  className="hidden"
                                  disabled={uploadingLoadingLogo}
                                  onChange={(e) => handleBrandUpload(e, 'loading')}
                                />
                              </label>
                            </div>
                          </div>
                        </div>

                        {/* Imagem de Compartilhamento Social (og:image) */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4 md:col-span-2">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Imagem de Compartilhamento Social (Open Graph - og:image)</h3>
                            <p className="text-xs text-brand-text-muted mt-1">
                              Esta imagem é exibida como capa quando o link da plataforma ou do site é compartilhado em redes sociais como WhatsApp, Facebook, Telegram, etc.
                            </p>
                          </div>
                          
                          <div className="flex flex-col sm:flex-row items-center sm:space-x-6 space-y-4 sm:space-y-0">
                            <div className="flex items-center justify-center p-2 bg-white border border-brand-border rounded-xl w-full sm:w-48 h-28 shadow-inner flex-shrink-0 overflow-hidden">
                              {brandSocialShare ? (
                                <img src={brandSocialShare} alt="Preview do compartilhamento social" className="max-h-full max-w-full object-contain" />
                              ) : (
                                <span className="text-[10px] text-brand-text-muted text-center">Recomendado: 1200x630px</span>
                              )}
                            </div>

                            <div className="flex-1 space-y-2 w-full">
                              <label className="btn-outline inline-flex text-center py-2.5 px-4 text-xs font-semibold cursor-pointer w-full sm:w-auto justify-center">
                                {uploadingSocialShare ? (
                                  <span className="flex items-center"><Loader2 className="w-3.5 h-3.5 animate-spin mr-2" /> Enviando...</span>
                                ) : (
                                  <span className="flex items-center"><Upload className="w-3.5 h-3.5 mr-2" /> Upload da Imagem (og:image)</span>
                                )}
                                <input 
                                  type="file" 
                                  accept="image/png,image/jpeg,image/webp" 
                                  className="hidden" 
                                  disabled={uploadingSocialShare}
                                  onChange={(e) => handleBrandUpload(e, 'socialshare')} 
                                />
                              </label>
                              <p className="text-[10px] text-brand-text-muted">Recomendado: PNG ou JPG na proporção 1.91:1 (Ex: 1200x630px).</p>
                            </div>
                          </div>
                        </div>

                        {/* Cores Personalizadas do Tema */}
                        <div className="card p-5 border border-brand-border/60 bg-brand-bg/10 flex flex-col space-y-4 md:col-span-2">
                          <div>
                            <h3 className="text-sm font-semibold text-brand-primary">Cores Personalizadas do Tema</h3>
                            <p className="text-xs text-brand-text-muted mt-1">Configure a paleta de cores do sistema. Cada cor possui um seletor visual e um campo de digitação HEX.</p>
                          </div>
                          
                          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6 pt-2">
                            {BRAND_COLOR_FIELDS.map((field) => (
                              <div key={String(field.key)} className="space-y-2">
                                <label className="text-xs font-semibold text-brand-text block">
                                  {field.label}
                                </label>
                                <div className="flex items-center space-x-2">
                                  <input 
                                    type="color" 
                                    value={brandColors[field.key as keyof BrandColors]} 
                                    onChange={(e) => setBrandColors(prev => ({
                                      ...prev,
                                      [field.key]: e.target.value
                                    }))}
                                    className="w-10 h-10 rounded-lg border border-brand-border cursor-pointer flex-shrink-0"
                                  />
                                  <input 
                                    type="text" 
                                    value={brandColors[field.key as keyof BrandColors]}
                                    onChange={(e) => setBrandColors(prev => ({
                                      ...prev,
                                      [field.key]: e.target.value
                                    }))}
                                    placeholder="#000000"
                                    className="w-full px-3 py-2 border border-brand-border rounded-xl text-sm font-mono focus:border-brand-primary focus:ring-1 focus:ring-brand-primary outline-none"
                                  />
                                </div>
                                <p className="text-[10px] text-brand-text-muted leading-tight">
                                  {field.desc}
                                </p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>

                      {/* Botão de Ação */}
                      <div className="flex flex-col sm:flex-row items-center justify-between pt-4 border-t border-brand-border gap-4">
                        <div className="text-xs text-brand-text-muted leading-relaxed">
                          <span className="font-semibold text-brand-primary block">Versão Atual das Imagens: v{brandVersion}</span>
                          Ao salvar, o cache do PWA e do navegador será atualizado.
                        </div>

                        <div className="flex space-x-3 w-full sm:w-auto">
                          <button
                            type="submit"
                            disabled={savingBrand || uploadingLight || uploadingDark || uploadingFavicon || uploadingPwa192 || uploadingPwa512 || uploadingPwaMaskable || uploadingPushNotificationIcon || uploadingInstallLogo || uploadingLoadingLogo || uploadingSocialShare}
                            className="btn-primary w-full sm:w-auto px-6 py-3 flex items-center justify-center space-x-2 shadow-lg shadow-brand-primary/10 hover:shadow-xl hover:shadow-brand-primary/20 transform transition-all hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
                          >
                            {savingBrand ? (
                              <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                <span>Salvando Alterações...</span>
                              </>
                            ) : (
                              <>
                                <Save className="w-4 h-4" />
                                <span>Salvar Identidade Visual</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>

                      {brandSaveSuccess && (
                        <div className="bg-green-50 border border-green-200 text-green-800 px-4 py-3 rounded-xl flex items-center space-x-3 text-sm animate-pulse">
                          <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                          <span>Configurações visuais salvas com sucesso! O cache do PWA e do navegador foi atualizado.</span>
                        </div>
                      )}
                    </form>
                  )}
                </div>
              </div>
            ) : (
              /* Aba de Perfil Admin [NEW] */
              <div className="space-y-6">
                <div className="card bg-white p-6 md:p-8 border-brand-border">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <User className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary border-none p-0 pb-0">
                        Meu Perfil Administrador
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Gerencie suas informações de exibição e credenciais de acesso ao Painel Admin.
                      </p>
                    </div>
                  </div>

                  {adminProfileLoading ? (
                    <div className="p-12 flex flex-col items-center justify-center text-brand-text-muted">
                      <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                      <span className="text-sm">Carregando dados do perfil...</span>
                    </div>
                  ) : (
                    <form onSubmit={handleSaveAdminProfile} className="space-y-6">
                      {adminSuccessMsg && (
                        <div className="p-3.5 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center space-x-2 text-sm text-emerald-700 animate-fadeIn">
                          <Check className="w-5 h-5 flex-shrink-0 text-emerald-600" />
                          <span className="font-medium">{adminSuccessMsg}</span>
                        </div>
                      )}

                      {adminErrorMsg && (
                        <div className="p-3.5 bg-red-50 border border-red-100 rounded-xl flex items-center space-x-2 text-sm text-red-700 animate-fadeIn">
                          <ShieldAlert className="w-5 h-5 flex-shrink-0 text-red-600" />
                          <span className="font-medium">{adminErrorMsg}</span>
                        </div>
                      )}

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                            Nome
                          </label>
                          <input
                            type="text"
                            required
                            value={adminFirstName}
                            onChange={(e) => setAdminFirstName(e.target.value)}
                            className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary"
                            placeholder="Seu primeiro nome"
                            disabled={adminProfileSaving}
                          />
                        </div>

                        <div className="space-y-2">
                          <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                            Sobrenome
                          </label>
                          <input
                            type="text"
                            required
                            value={adminLastName}
                            onChange={(e) => setAdminLastName(e.target.value)}
                            className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary"
                            placeholder="Seu sobrenome"
                            disabled={adminProfileSaving}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                          E-mail Administrativo
                        </label>
                        <div className="relative">
                          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                          <input
                            type="email"
                            value={user?.email || ''}
                            disabled
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-brand-border text-sm bg-brand-bg/40 text-brand-text-muted cursor-not-allowed outline-none"
                          />
                        </div>
                        <p className="text-[10px] text-brand-text-muted">
                          O e-mail administrativo é fixo e vinculado à conta principal do proprietário.
                        </p>
                      </div>

                      <div className="space-y-4 pt-2">
                        <h3 className="text-sm font-semibold text-brand-primary flex items-center border-b border-brand-border/40 pb-2">
                          <Lock className="w-4 h-4 mr-2" />
                          Alterar Senha do Administrador
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="space-y-2">
                            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                              Nova Senha
                            </label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                              <input
                                type={showAdminPassInput ? "text" : "password"}
                                value={adminPassword}
                                onChange={(e) => setAdminPassword(e.target.value)}
                                className="w-full pl-10 pr-10 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary"
                                placeholder="Mínimo 6 caracteres"
                                disabled={adminProfileSaving}
                              />
                              <button
                                type="button"
                                onClick={() => setShowAdminPassInput(!showAdminPassInput)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition-colors cursor-pointer"
                              >
                                {showAdminPassInput ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>

                          <div className="space-y-2">
                            <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                              Confirmar Nova Senha
                            </label>
                            <div className="relative">
                              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                              <input
                                type={showAdminConfirmPassInput ? "text" : "password"}
                                value={adminConfirmPassword}
                                onChange={(e) => setAdminConfirmPassword(e.target.value)}
                                className="w-full pl-10 pr-10 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary"
                                placeholder="Confirme a nova senha"
                                disabled={adminProfileSaving}
                              />
                              <button
                                type="button"
                                onClick={() => setShowAdminConfirmPassInput(!showAdminConfirmPassInput)}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-brand-text-muted hover:text-brand-primary transition-colors cursor-pointer"
                              >
                                {showAdminConfirmPassInput ? <EyeOff size={14} /> : <Eye size={14} />}
                              </button>
                            </div>
                          </div>
                        </div>
                        <p className="text-[10px] text-brand-text-muted">
                          * Deixe os campos de senha em branco se desejar manter a senha atual.
                        </p>
                      </div>

                      <div className="flex justify-end pt-4 border-t border-brand-border/40">
                        <button
                          type="submit"
                          disabled={adminProfileSaving || !adminFirstName.trim() || !adminLastName.trim()}
                          className="btn-primary py-3 px-6 text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-brand-primary/10 transition-all hover:shadow-xl active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                        >
                          {adminProfileSaving ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              <span>Salvando...</span>
                            </>
                          ) : (
                            <>
                              <span>Salvar Alterações</span>
                            </>
                          )}
                        </button>
                      </div>
                    </form>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Modal de Gerenciamento de Assinatura SaaS */}
        {editingProf && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 space-y-6 shadow-2xl border border-brand-primary/10 relative">
              <div>
                <h3 className="text-xl font-display font-bold text-brand-primary flex items-center space-x-2">
                  <CreditCard className="w-5 h-5 text-brand-primary" />
                  <span>Gerenciar Assinatura SaaS</span>
                </h3>
                <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                  Gerenciando o plano do profissional: <strong className="text-brand-text font-semibold">{editingProf.full_name}</strong> ({editingProf.google_email})
                </p>
              </div>

              <form onSubmit={handleSaveSubscription} className="space-y-4">
                {/* Campo Plano */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text uppercase tracking-wider block">Plano SaaS</label>
                  <select
                    value={editPlan}
                    onChange={(e) => setEditPlan(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                  >
                    <option value="trial">Período de Teste (Trial)</option>
                    <option value="monthly">Plano Mensal (Pago)</option>
                    <option value="yearly">Plano Anual (Pago)</option>
                    <option value="none">Vitalício / Admin (Sem Limite)</option>
                  </select>
                </div>

                {/* Status da Assinatura */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text uppercase tracking-wider block">Status do Pagamento</label>
                  <select
                    value={editStatus}
                    onChange={(e) => setEditStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                  >
                    <option value="trialing">Em Período de Testes (Trialing)</option>
                    <option value="active">Regular / Ativo (Active)</option>
                    <option value="past_due">Pagamento Atrasado (Past Due)</option>
                    <option value="canceled">Assinatura Cancelada (Canceled)</option>
                    <option value="unpaid">Inadimplente (Unpaid)</option>
                  </select>
                </div>

                {/* Data de Vencimento */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text uppercase tracking-wider block">Data de Vencimento</label>
                  <input
                    type="datetime-local"
                    value={editEndsAt}
                    onChange={(e) => setEditEndsAt(e.target.value)}
                    disabled={editPlan === 'none'}
                    className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 disabled:opacity-50 font-medium"
                  />
                </div>

                {/* Status Geral da Conta */}
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-brand-text uppercase tracking-wider block">Status da Conta</label>
                  <select
                    value={editUserStatus}
                    onChange={(e) => setEditUserStatus(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 border border-brand-border rounded-xl text-sm outline-none focus:border-brand-primary bg-brand-bg/40 font-medium"
                  >
                    <option value="active">Ativo (Acesso Liberado)</option>
                    <option value="pending">Aguardando Liberação</option>
                    <option value="inactive">Bloqueado / Desativado (Inactive)</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-6 border-t border-brand-border/60">
                  <button
                    type="button"
                    onClick={() => setEditingProf(null)}
                    className="flex-1 py-3 border border-brand-border text-brand-text font-bold rounded-xl text-sm hover:bg-brand-bg transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={updatingId !== null}
                    className="flex-1 py-3 bg-brand-primary text-white font-bold rounded-xl text-sm hover:bg-brand-primary-hover transition-colors flex items-center justify-center space-x-1.5 shadow"
                  >
                    {updatingId !== null ? 'Salvando...' : 'Salvar Alterações'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal de Notificacoes do Admin */}
        {adminInboxOpen && (
          <div className="fixed inset-0 z-[60] bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl shadow-2xl border border-brand-primary/10 w-full max-w-3xl max-h-[85vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200">
              <div className="px-5 md:px-6 py-4 border-b border-brand-border/60 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-2xl bg-brand-primary/10 text-brand-primary">
                    <Bell className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-lg font-display font-bold text-brand-primary">Notificações do Painel</h3>
                    <p className="text-xs text-brand-text-muted">
                      {adminInboxUnreadCount > 0
                        ? `${adminInboxUnreadCount} notificaç${adminInboxUnreadCount > 1 ? 'ões' : 'ão'} pendente${adminInboxUnreadCount > 1 ? 's' : ''}`
                        : 'Nenhuma notificação pendente'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAdminInboxOpen(false)}
                  className="p-2 rounded-xl border border-brand-border text-brand-text-muted hover:text-brand-text hover:bg-brand-bg transition-colors"
                >
                  <XCircle className="w-5 h-5" />
                </button>
              </div>

              <div className="px-5 md:px-6 py-4 border-b border-brand-border/50 flex flex-wrap gap-3 justify-between items-center bg-brand-bg/20">
                <div className="flex items-center gap-2 text-xs text-brand-text-muted">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-white border border-brand-border/60 font-semibold text-brand-text">
                    {adminInboxNotifications.length} total
                  </span>
                  {adminInboxUnreadCount > 0 && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-brand-primary/10 border border-brand-primary/15 font-semibold text-brand-primary">
                      {adminInboxUnreadCount} não lida{adminInboxUnreadCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={markAllAdminNotificationsAsRead}
                    disabled={adminInboxUnreadCount === 0}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-brand-border bg-white text-xs font-semibold text-brand-text hover:bg-brand-bg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <CheckCheck className="w-4 h-4" />
                    <span>Ler todas</span>
                  </button>
                  <button
                    type="button"
                    onClick={clearAdminInboxNotifications}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-red-200 bg-red-50 text-xs font-semibold text-red-700 hover:bg-red-100 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Limpar</span>
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4 md:p-6 bg-gradient-to-b from-white to-brand-bg/30">
                {adminInboxLoading ? (
                  <div className="py-16 flex flex-col items-center justify-center text-brand-text-muted">
                    <Loader2 className="w-8 h-8 text-brand-primary animate-spin mb-3" />
                    <span className="text-sm">Carregando notificações...</span>
                  </div>
                ) : adminInboxNotifications.length === 0 ? (
                  <div className="py-16 text-center text-brand-text-muted">
                    <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
                      <BellOff className="w-6 h-6" />
                    </div>
                    <h4 className="font-bold text-brand-text">Nenhuma notificação no momento</h4>
                    <p className="text-xs mt-2">As notificações do painel aparecerão aqui em tempo real.</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {adminInboxNotifications.map((notification) => {
                      const Icon = notification.type === 'success'
                        ? CheckCircle2
                        : notification.type === 'error'
                          ? XCircle
                          : notification.type === 'warning'
                            ? AlertTriangle
                            : Info;

                      const palette = notification.type === 'success'
                        ? 'text-emerald-600 bg-emerald-50 border-emerald-100'
                        : notification.type === 'error'
                          ? 'text-red-600 bg-red-50 border-red-100'
                          : notification.type === 'warning'
                            ? 'text-amber-600 bg-amber-50 border-amber-100'
                            : 'text-brand-primary bg-brand-bg border-brand-border';

                      return (
                        <button
                          key={notification.id}
                          type="button"
                          disabled={adminInboxActionId === notification.id}
                          onClick={() => handleOpenAdminNotification(notification)}
                          className={`w-full text-left rounded-2xl border p-4 md:p-4 transition-all hover:shadow-sm hover:-translate-y-px disabled:opacity-70 disabled:cursor-wait ${notification.read_at ? 'bg-white border-brand-border/60' : 'bg-brand-primary/5 border-brand-primary/20 ring-1 ring-brand-primary/5'}`}
                        >
                          <div className="flex items-start gap-3">
                            <div className={`p-2 rounded-xl border flex-shrink-0 ${palette}`}>
                              <Icon className="w-4 h-4" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    <p className={`font-semibold text-sm truncate ${notification.read_at ? 'text-brand-text' : 'text-brand-primary'}`}>
                                      {notification.title}
                                    </p>
                                    {!notification.read_at && (
                                      <span className="inline-flex items-center rounded-full bg-brand-primary text-white text-[9px] font-bold px-2 py-0.5 uppercase tracking-wider">
                                        nova
                                      </span>
                                    )}
                                  </div>
                                  <p className="mt-1 text-xs text-brand-text-muted whitespace-pre-wrap leading-relaxed line-clamp-3">
                                    {notification.message}
                                  </p>
                                </div>
                                <span className="text-[10px] text-brand-text-muted flex-shrink-0">
                                  {formatInboxDate(notification.created_at)}
                                </span>
                              </div>

                              {notification.image_url && (
                                <div className="mt-3 overflow-hidden rounded-xl border border-brand-border/50 max-w-md">
                                  <img
                                    src={notification.image_url}
                                    alt={notification.title}
                                    className="max-h-40 w-full object-cover"
                                  />
                                </div>
                              )}

                              {notification.link && (
                                <div className="mt-3">
                                  <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand-primary">
                                    <Send className="w-3.5 h-3.5" />
                                    Abrir destino
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Modal de Motivo do Reembolso */}
        {selectedTxForReason && (
          <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 md:p-8 space-y-6 shadow-2xl border border-brand-primary/10 relative animate-in zoom-in-95 duration-200">
              <div>
                <h3 className="text-xl font-display font-bold text-brand-primary flex items-center space-x-2">
                  <ShieldAlert className="w-5 h-5 text-amber-500" />
                  <span>Motivo do Reembolso</span>
                </h3>
                <p className="text-xs text-brand-text-muted mt-1 leading-relaxed">
                  Transação referente ao profissional <strong className="text-brand-text font-semibold">{selectedTxForReason.professionals?.full_name || 'Profissional'}</strong> ({selectedTxForReason.professionals?.google_email})
                </p>
              </div>

              <div className="space-y-4">
                <div className="p-4 bg-brand-bg rounded-2xl border border-brand-border/60 text-sm text-brand-text leading-relaxed">
                  <p className="font-semibold text-xs text-brand-text-muted uppercase tracking-wider mb-1.5">Motivo Informado pelo Cliente:</p>
                  <p className="whitespace-pre-wrap italic">
                    "{selectedTxForReason.refund_reason || 'Nenhum motivo específico fornecido.'}"
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="bg-brand-bg/50 p-3 rounded-xl border border-brand-border/30">
                    <span className="text-brand-text-muted block uppercase tracking-wider text-[10px] font-semibold">Valor da Transação</span>
                    <span className="font-bold text-brand-text">
                      {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: selectedTxForReason.currency?.toUpperCase() || 'BRL' }).format(selectedTxForReason.amount)}
                    </span>
                  </div>
                  <div className="bg-brand-bg/50 p-3 rounded-xl border border-brand-border/30">
                    <span className="text-brand-text-muted block uppercase tracking-wider text-[10px] font-semibold">Data da Transação</span>
                    <span className="font-bold text-brand-text">
                      {selectedTxForReason.created_at ? new Date(selectedTxForReason.created_at).toLocaleDateString('pt-BR', {
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      }) : 'N/A'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-brand-border/60">
                <button
                  type="button"
                  onClick={() => setSelectedTxForReason(null)}
                  className="w-full py-3 bg-brand-primary text-white font-bold rounded-xl text-sm hover:bg-brand-primary-hover transition-colors shadow shadow-brand-primary/20 cursor-pointer text-center block"
                >
                  Fechar Janela
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="p-8 mt-auto opacity-50 text-center">
        <AppVersion />
      </footer>
    </div>
  );
}
