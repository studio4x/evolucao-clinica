import React, { useEffect, useState } from 'react';
import { collection, query, orderBy, onSnapshot, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { db, auth } from '../firebase';
import { ShieldCheck, UserCheck, UserX, Search, Users, Clock, ShieldAlert, Check, Ban, Lock, Mail, Sparkles, LogOut, Loader2, Key, Settings, Eye, EyeOff, BarChart3, Coins, DollarSign, Activity, CreditCard, Calendar } from 'lucide-react';
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

  // Abas do Admin
  const [activeTab, setActiveTab] = useState<'professionals' | 'gemini_config' | 'token_usage'>('professionals');

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

  // Estados do Formulário de Login
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

  // Efeito para buscar profissionais caso seja admin logado
  useEffect(() => {
    if (!user || profileRole !== 'admin') {
      setLoading(false);
      return;
    }

    setLoading(true);
    const q = query(collection(db, 'professionals'), orderBy('created_at', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: Professional[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as Professional);
      });
      setProfessionals(list);
      setLoading(false);
    }, (error) => {
      console.error("Erro ao escutar profissionais:", error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [user, profileRole]);

  // Efeito para carregar chave Gemini
  useEffect(() => {
    const fetchGeminiKey = async () => {
      try {
        const settingsRef = doc(db, 'settings', 'gemini');
        const settingsSnap = await getDoc(settingsRef);
        if (settingsSnap.exists()) {
          setCurrentGeminiKey(settingsSnap.data().api_key || '');
        }
      } catch (error) {
        console.error("Erro ao buscar chave do Gemini:", error);
      }
    };
    
    if (user && profileRole === 'admin' && activeTab === 'gemini_config') {
      fetchGeminiKey();
    }
  }, [user, profileRole, activeTab]);

  // Efeito para carregar os logs de consumo do Firestore
  useEffect(() => {
    if (!user || profileRole !== 'admin' || activeTab !== 'token_usage') {
      return;
    }

    setLoadingUsage(true);
    // Busca os logs ordenados por data decrescente
    const q = query(collection(db, 'usage_logs'), orderBy('created_at', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const list: UsageLog[] = [];
      snapshot.forEach((doc) => {
        list.push({ id: doc.id, ...doc.data() } as UsageLog);
      });
      setUsageLogs(list);
      setLoadingUsage(false);
    }, (error) => {
      console.error("Erro ao escutar logs de consumo:", error);
      setLoadingUsage(false);
    });

    return () => unsubscribe();
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
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const loggedUser = userCredential.user;

      const docRef = doc(db, 'professionals', loggedUser.uid);
      const docSnap = await getDoc(docRef);

      if (docSnap.exists() && docSnap.data().role === 'admin') {
        const data = docSnap.data();
        setProfileInfo(data.status, data.role);
        setUser(loggedUser);
      } else {
        await signOut(auth);
        setUser(null);
        setProfileInfo(null, null);
        setLoginError('Acesso recusado. Esta conta nao possui privilegios de administrador.');
      }
    } catch (error: any) {
      console.error("Erro no login do administrador:", error);
      if (error.code === 'auth/invalid-credential' || error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password') {
        setLoginError('E-mail ou senha incorretos.');
      } else if (error.code === 'auth/operation-not-allowed') {
        setLoginError('O provedor de E-mail/Senha nao esta ativo no seu console do Firebase. Ative-o em Authentication > Sign-in method.');
      } else {
        setLoginError(`Falha na autenticacao: ${error.message}`);
      }
    } finally {
      setLoginLoading(false);
    }
  };

  const handleUpdateStatus = async (profId: string, newStatus: 'active' | 'inactive') => {
    if (updatingId) return;
    setUpdatingId(profId);
    try {
      const docRef = doc(db, 'professionals', profId);
      await updateDoc(docRef, {
        status: newStatus,
        updated_at: new Date().toISOString()
      });
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
      const docRef = doc(db, 'professionals', editingProf.id);
      const updateData: any = {
        subscription_plan: editPlan,
        subscription_status: editStatus,
        subscription_ends_at: editEndsAt ? new Date(editEndsAt).toISOString() : null,
        status: editUserStatus,
        updated_at: new Date().toISOString()
      };

      await updateDoc(docRef, updateData);
      setEditingProf(null);
      alert("Assinatura do profissional atualizada com sucesso!");
    } catch (error: any) {
      console.error("Erro ao atualizar assinatura:", error);
      alert(`Erro ao atualizar assinatura: ${error.message}`);
    } finally {
      setUpdatingId(null);
    }
  };

  // Salvar Chave Gemini no Firestore
  const handleSaveGeminiKey = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newGeminiKey) return;

    setSaveLoading(true);
    setSaveSuccess(false);

    try {
      const settingsRef = doc(db, 'settings', 'gemini');
      await setDoc(settingsRef, {
        api_key: newGeminiKey,
        updated_at: new Date().toISOString(),
        updated_by: user?.email || 'admin'
      });
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

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
    setProfileInfo(null, null);
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
            ) : (
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
