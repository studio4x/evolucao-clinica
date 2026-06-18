import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { ShieldCheck, UserCheck, UserX, Search, Users, Clock, ShieldAlert, Check, Ban, Lock, Mail, Sparkles, LogOut, Loader2, Key, Settings, Eye, EyeOff, BarChart3, Coins, DollarSign, Activity, CreditCard, Calendar, User, Save, Globe } from 'lucide-react';
import { useAuthStore } from '../store/authStore';
import { useNavigate } from 'react-router-dom';
import { AppVersion } from '../components/layout/AppVersion';

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

export default function AdminPanel() {
  const { user, profileRole, setUser, setProfileInfo } = useAuthStore();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<'professionals' | 'gemini_config' | 'google_pay_config' | 'token_usage' | 'plans' | 'profile'>('professionals');

  // Estados de Configuração de Pagamento (Google Pay & Stripe)
  const [paymentEnvironment, setPaymentEnvironment] = useState<'TEST' | 'PRODUCTION'>('TEST');
  const [googleMerchantId, setGoogleMerchantId] = useState('');
  const [stripeProdPublishableKey, setStripeProdPublishableKey] = useState('');
  const [stripeProdSecretKey, setStripeProdSecretKey] = useState('');
  const [stripeSandboxPublishableKey, setStripeSandboxPublishableKey] = useState('');
  const [stripeSandboxSecretKey, setStripeSandboxSecretKey] = useState('');
  const [paymentSettingsLoading, setPaymentSettingsLoading] = useState(false);
  const [paymentSaveSuccess, setPaymentSaveSuccess] = useState(false);
  const [paymentSaveLoading, setPaymentSaveLoading] = useState(false);

  // Controle de exibição de chaves secretas
  const [showStripeProdSecret, setShowStripeProdSecret] = useState(false);
  const [showStripeSandboxSecret, setShowStripeSandboxSecret] = useState(false);

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

  // Estados da Chave Gemini
  const [currentGeminiKey, setCurrentGeminiKey] = useState('');
  const [newGeminiKey, setNewGeminiKey] = useState('');
  const [showKeyInput, setShowKeyInput] = useState(false);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Estados de Consumo de Tokens (usage_logs)
  const [usageLogs, setUsageLogs] = useState<UsageLog[]>([]);
  const [loadingUsage, setLoadingUsage] = useState(true);
  const [usageSearchTerm, setUsageSearchTerm] = useState('');
  const [usageViewMode, setUsageViewMode] = useState<'by_user' | 'history'>('by_user');

  // Estados para Edição de Planos (SaaS)
  const [plans, setPlans] = useState<any[]>([]);
  const [editingPlans, setEditingPlans] = useState<Record<string, any>>({});
  const [loadingPlans, setLoadingPlans] = useState(false);
  const [savingPlanId, setSavingPlanId] = useState<string | null>(null);
  const [plansError, setPlansError] = useState('');
  const [plansSuccess, setPlansSuccess] = useState('');

  // Estados do Formulário de Login (Administrativo)
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState('');

  // Estados do modal de edição de assinatura SaaS
  const [editingProf, setEditingProf] = useState<Professional | null>(null);
  const [editPlan, setEditPlan] = useState<'trial' | 'monthly' | 'yearly' | 'none'>('trial');
  const [editStatus, setEditStatus] = useState<'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid'>('trialing');
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

    const fetchProfessionals = async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from('professionals')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) {
        console.error("Erro ao carregar profissionais:", error);
      } else {
        setProfessionals(data || []);
      }
      setLoading(false);
    };

    fetchProfessionals();

    const channel = supabase
      .channel('professionals-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'professionals' }, () => {
        fetchProfessionals();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, profileRole]);

  // Efeito para carregar chave Gemini
  useEffect(() => {
    const fetchGeminiKey = async () => {
      try {
        const { data, error } = await supabase
          .from('settings')
          .select('api_key')
          .eq('id', 'gemini')
          .single();
        if (!error && data) {
          setCurrentGeminiKey(data.api_key || '');
        }
      } catch (error) {
        console.error("Erro ao buscar chave do Gemini:", error);
      }
    };
    
    if (user && profileRole === 'admin' && activeTab === 'gemini_config') {
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
        } else {
          // Preencher com as credenciais padrão se não houver dados salvos
          setPaymentEnvironment('TEST');
          setGoogleMerchantId('BCR2DN7TTCHMTFAJ');
          setStripeProdPublishableKey('pk_live_wDyGJo2Rl2ikV2HaBXzZey1o');
          setStripeProdSecretKey('');
          setStripeSandboxPublishableKey('pk_test_0b7fQSiyaxD7OjUH6lKL6Slh');
          setStripeSandboxSecretKey('');
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

      // No Supabase, consultamos a tabela professionals para ver se o usuário é admin
      const { data: profData, error: profError } = await supabase
        .from('professionals')
        .select('*')
        .eq('id', loggedUser.id)
        .single();

      if (!profError && profData && profData.role === 'admin') {
        setProfileInfo(
          profData.status,
          profData.role,
          profData.subscription_plan,
          profData.subscription_status,
          profData.subscription_ends_at,
          profData.trial_ends_at
        );
        setUser(loggedUser);
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

  const handleUpdateStatus = async (profId: string, newStatus: 'active' | 'inactive') => {
    if (updatingId) return;
    setUpdatingId(profId);
    try {
      const { error } = await supabase
        .from('professionals')
        .update({
          status: newStatus,
          updated_at: new Date().toISOString()
        })
        .eq('id', profId);
      if (error) throw error;
    } catch (error: any) {
      console.error("Erro ao atualizar status:", error);
      alert(`Falha ao atualizar status: ${error.message}`);
    } finally {
      setUpdatingId(null);
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
    if (!newGeminiKey) return;

    setSaveLoading(true);
    setSaveSuccess(false);

    try {
      const { error } = await supabase
        .from('settings')
        .upsert({
          id: 'gemini',
          api_key: newGeminiKey,
          updated_at: new Date().toISOString(),
          updated_by: user?.email || 'admin'
        });
      if (error) throw error;
      setCurrentGeminiKey(newGeminiKey);
      setNewGeminiKey('');
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 5000);
    } catch (error: any) {
      console.error("Erro ao salvar chave do Gemini:", error);
      alert(`Erro ao salvar chave do Gemini: ${error.message}`);
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
        stripeSandboxSecretKey
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
              Insira as credenciais de administrador para acessar os controles de aprovacao.
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
                  E-mail do Administrador
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                  <input
                    type="email"
                    required
                    placeholder="admin@exemplo.com"
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
      <main className="p-4 md:p-8 max-w-6xl mx-auto flex-1 w-full space-y-8 animate-fadeIn">
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
              onClick={() => navigate('/')}
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
            <nav className="flex lg:flex-col gap-2 p-2 bg-white rounded-2xl border border-brand-border shadow-sm">
              <button
                onClick={() => setActiveTab('professionals')}
                className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium text-sm ${
                  activeTab === 'professionals'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                }`}
              >
                <Users size={18} />
                <span>Profissionais</span>
              </button>
              <button
                onClick={() => setActiveTab('gemini_config')}
                className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium text-sm ${
                  activeTab === 'gemini_config'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                }`}
              >
                <Key size={18} />
                <span>Chave Gemini</span>
              </button>
              <button
                onClick={() => setActiveTab('token_usage')}
                className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium text-sm ${
                  activeTab === 'token_usage'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                }`}
              >
                <BarChart3 size={18} />
                <span>Consumo API</span>
              </button>
              <button
                onClick={() => setActiveTab('plans')}
                className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium text-sm ${
                  activeTab === 'plans'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                }`}
              >
                <Coins size={18} />
                <span>Planos SaaS</span>
              </button>
              <button
                onClick={() => setActiveTab('google_pay_config')}
                className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium text-sm ${
                  activeTab === 'google_pay_config'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                }`}
              >
                <CreditCard size={18} />
                <span>Google Pay & Stripe</span>
              </button>
              <button
                onClick={() => setActiveTab('profile')}
                className={`flex-1 lg:flex-none flex items-center justify-center lg:justify-start space-x-3 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer font-medium text-sm ${
                  activeTab === 'profile'
                    ? 'bg-brand-primary text-white shadow-sm'
                    : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                }`}
              >
                <User size={18} />
                <span>Meu Perfil</span>
              </button>
            </nav>
          </div>

          {/* Conteudo Principal das Abas */}
          <div className="flex-1 min-w-0">
            {activeTab === 'professionals' ? (
              <div className="space-y-6">
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
                            const isAdminSelf = prof.google_email === 'contato@studio4x.com.br';
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
                                    <span className="text-xs text-brand-text-muted italic">Administrador Geral</span>
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
                                          onClick={() => handleUpdateStatus(prof.id, 'active')}
                                          disabled={updatingId !== null}
                                          className="inline-flex items-center justify-center p-2 rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100 border border-emerald-100 transition-colors disabled:opacity-50 cursor-pointer"
                                          title="Ativar Acesso"
                                        >
                                          <Check className="w-3.5 h-3.5" />
                                        </button>
                                      )}
                                      
                                      {prof.status !== 'inactive' && (
                                        <button
                                          onClick={() => handleUpdateStatus(prof.id, 'inactive')}
                                          disabled={updatingId !== null}
                                          className="inline-flex items-center justify-center p-2 rounded-lg bg-red-50 text-red-600 hover:bg-red-100 border border-red-100 transition-colors disabled:opacity-50 cursor-pointer"
                                          title="Suspender Acesso"
                                        >
                                          <Ban className="w-3.5 h-3.5" />
                                        </button>
                                      )}
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
            ) : activeTab === 'gemini_config' ? (
              /* Aba de Configuração da API do Gemini */
              <div className="space-y-6">
                <div className="card bg-white p-6 md:p-8 border-brand-border">
                  <div className="flex items-center space-x-3 mb-6">
                    <div className="p-3 bg-brand-primary/10 rounded-xl text-brand-primary">
                      <Key className="w-6 h-6" />
                    </div>
                    <div>
                      <h2 className="text-xl font-display font-bold text-brand-primary">
                        Configuracao da API do Gemini
                      </h2>
                      <p className="text-xs text-brand-text-muted mt-0.5">
                        Defina a chave global da inteligência artificial do Google para transcricao de audio.
                      </p>
                    </div>
                  </div>

                  <div className="bg-brand-bg/60 border border-brand-border rounded-2xl p-5 mb-8 space-y-3">
                    <h3 className="text-sm font-semibold text-brand-primary flex items-center">
                      <Sparkles className="w-4 h-4 text-brand-accent mr-2" />
                      Chave Ativa na Plataforma
                    </h3>
                    <div className="flex items-center justify-between bg-white border border-brand-border/60 rounded-xl px-4 py-3 shadow-inner">
                      <span className="font-mono text-sm tracking-wide text-brand-text break-all">
                        {maskKey(currentGeminiKey)}
                      </span>
                    </div>
                    <p className="text-xs text-brand-text-muted leading-relaxed">
                      * A chave salva nesta secao e sincronizada em tempo real e possui **prioridade absoluta** sobre as chaves estaticas inseridas em arquivos de variaveis de ambiente (.env).
                    </p>
                  </div>

                  <form onSubmit={handleSaveGeminiKey} className="space-y-6">
                    <div className="space-y-2">
                      <label className="text-xs font-bold text-brand-text uppercase tracking-wider block">
                        Conectar Nova Chave Gemini
                      </label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-brand-text-muted" />
                        <input
                          type={showKeyInput ? "text" : "password"}
                          required
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
                    </div>

                    {saveSuccess && (
                      <div className="p-3 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center space-x-2 text-xs text-emerald-700 animate-fadeIn">
                        <Check className="w-4 h-4 flex-shrink-0" />
                        <span>Chave da API Gemini salva e atualizada com sucesso no banco de dados!</span>
                      </div>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={saveLoading || !newGeminiKey}
                        className="btn-primary py-3 px-6 text-sm font-semibold flex items-center justify-center space-x-2 shadow-lg shadow-brand-primary/10 transition-all hover:shadow-xl active:scale-95 disabled:opacity-50 cursor-pointer"
                      >
                        {saveLoading ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>Salvando...</span>
                          </>
                        ) : (
                          <>
                            <span>Salvar Alteracoes</span>
                          </>
                        )}
                      </button>
                    </div>
                  </form>
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
                            {window.location.origin.includes('localhost') 
                              ? 'https://kvxboovgrrhhttaqinld.supabase.co/functions/v1/stripe-webhook' 
                              : `${window.location.origin}/api/webhook/stripe`}
                          </span>
                        </div>
                        <p className="text-[11px] text-brand-text-muted mt-2 leading-relaxed">
                          * Insira a URL acima na seção **Webhooks** no painel da sua conta Stripe. Se o seu servidor for local (development), utilize uma ferramenta como o **ngrok** ou a CLI do Stripe (`stripe listen --forward-to`) para repassar as requisições para a porta local.
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
      </main>
      <footer className="p-8 mt-auto opacity-50 text-center">
        <AppVersion />
      </footer>
    </div>
  );
}
