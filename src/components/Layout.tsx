import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { LayoutDashboard, Users, History as HistoryIcon, LogOut, Menu, X, Download, BookOpen, Share2, ShieldCheck, CreditCard, User, Bell, LifeBuoy, HelpCircle, ChevronLeft, ChevronRight, Database, Crown } from 'lucide-react';
import { AppVersion } from './layout/AppVersion';
import { appendBrandAssetVersion, getBrandAssetSignature, getBrandIconUrl } from '../utils/brandAssets';
import { OfflineQueueMonitor } from './layout/OfflineQueueMonitor';
import TrialBanner from './layout/TrialBanner';
import { runAutoBackupIfNeeded } from '../services/backupService';

export default function Layout() {
  const { user, profileRole, googleAccessToken, subscriptionPlan } = useAuthStore();
  const siteConfig = useSiteConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isCollapsed, setIsCollapsed] = useState(() => {
    return window.innerWidth >= 768 && window.innerWidth < 1024;
  });

  useEffect(() => {
    const checkStandalone = () => {
      const standalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true;
      setIsStandalone(standalone);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      setDeferredPrompt(event);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsStandalone(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  useEffect(() => {
    if (!user) return;

    const fetchUnreadCount = async () => {
      try {
        const { count, error } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .is('read_at', null);

        if (!error && count !== null) {
          setUnreadCount(count);
        }
      } catch (err) {
        console.error('Erro ao buscar contagem de nao lidas:', err);
      }
    };

    fetchUnreadCount();

    // Realtime subscription para atualizar contagem instantaneamente
    const channel = supabase
      .channel('layout-notifications-count')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        () => {
          fetchUnreadCount();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user]);

  useEffect(() => {
    if (!user || !googleAccessToken || subscriptionPlan !== 'yearly') return;

    const triggerBackup = async () => {
      try {
        await runAutoBackupIfNeeded(user.id, googleAccessToken, user.user_metadata?.full_name || 'Terapeuta');
      } catch (err) {
        console.error('[Layout] Falha ao executar backup em background:', err);
      }
    };

    const timer = setTimeout(triggerBackup, 5000);
    return () => clearTimeout(timer);
  }, [user, googleAccessToken, subscriptionPlan]);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    }
    setDeferredPrompt(null);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/painel/dashboard', icon: LayoutDashboard },
    { name: 'Pacientes', path: '/painel/patients', icon: Users },
    { name: 'Histórico', path: '/painel/history', icon: HistoryIcon },
    { name: 'Como Usar', path: '/painel/tutorial', icon: BookOpen },
    { name: 'Notificações', path: '/painel/notifications', icon: Bell },
    { name: 'Migração de Prontuários', path: '/painel/migration', icon: Database, isPremium: true },
    { name: 'Suporte', path: '/painel/support', icon: LifeBuoy },
    { name: 'Meu Perfil', path: '/painel/profile', icon: User },
    { name: 'Assinatura', path: '/painel/subscription', icon: CreditCard },
  ];

  if (profileRole === 'admin') {
    navItems.push({ name: 'Painel Admin', path: '/admin', icon: ShieldCheck });
  }

  const bottomNavItems = [
    { name: 'Início', path: '/painel/dashboard', icon: LayoutDashboard },
    { name: 'Pacientes', path: '/painel/patients', icon: Users },
    { name: 'Histórico', path: '/painel/history', icon: HistoryIcon },
    { name: 'Notif.', path: '/painel/notifications', icon: Bell },
    { name: 'Perfil', path: '/painel/profile', icon: User },
  ];

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-brand-border p-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <Link to="/">
          {(siteConfig.logo_light_url || siteConfig.logo_dark_url) ? (
            <img
              src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
              alt={siteConfig.pwa_app_name || "Evolução Clínica"}
              className="h-14 w-auto max-w-[150px] object-contain"
            />
          ) : (
            <span className="text-lg font-display font-bold text-brand-primary">
              {siteConfig.pwa_app_name || "Evolução Clínica"}
            </span>
          )}
        </Link>
        <div className="flex items-center space-x-2">
          <Link to="/painel/tutorial" className="p-2 text-brand-primary" title="Ajuda">
            <HelpCircle size={22} />
          </Link>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-brand-primary">
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`
        ${isMobileMenuOpen ? 'flex' : 'hidden'} 
        md:flex flex-col bg-white border-r border-brand-border flex-shrink-0
        fixed md:sticky top-[73px] md:top-0 z-50 md:z-0 h-[calc(100vh-73px)] md:h-screen shadow-sm
        transition-all duration-300 relative
        ${isCollapsed ? 'w-full md:w-20' : 'w-full md:w-64'}
      `}>
        {/* Toggle Collapse Button - Only visible on desktop/tablet (md) */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="hidden md:flex absolute -right-3 top-6 z-50 bg-white border border-brand-border rounded-full p-1 shadow-md hover:bg-brand-bg transition-all cursor-pointer items-center justify-center text-brand-primary"
          title={isCollapsed ? "Expandir menu" : "Recolher menu"}
        >
          {isCollapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
        </button>

        <div className="flex-1 overflow-y-auto overflow-x-hidden no-scrollbar-x">
          <div className="p-4 hidden md:block border-b border-brand-border/50">
            <Link to="/" className="flex justify-center">
              {isCollapsed ? (
                <img
                  src={appendBrandAssetVersion(getBrandIconUrl(siteConfig), assetSignature)}
                  alt={siteConfig.pwa_app_name || "Evolução Clínica"}
                  className="h-10 w-10 object-contain"
                />
              ) : (
                (siteConfig.logo_light_url || siteConfig.logo_dark_url) ? (
                  <img
                    src={appendBrandAssetVersion(siteConfig.logo_light_url || siteConfig.logo_dark_url, assetSignature)}
                    alt={siteConfig.pwa_app_name || "Evolução Clínica"}
                    className="h-28 w-auto max-w-full object-contain"
                  />
                ) : (
                  <span className="text-xl font-display font-bold text-brand-primary py-4 block text-center">
                    {siteConfig.pwa_app_name || "Evolução Clínica"}
                  </span>
                )
              )}
            </Link>
          </div>

          <div className={`${isCollapsed ? 'px-2' : 'px-4'} py-6`}>
            <div className={`flex items-center mb-6 bg-brand-bg rounded-xl border border-brand-border/50 ${isCollapsed ? 'justify-center p-2' : 'space-x-3 px-4 py-3'}`}>
              <img 
                src={user?.user_metadata?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user?.user_metadata?.full_name || user?.email || 'Profissional') + '&background=005C13&color=fff'} 
                alt="Profile" 
                className="w-10 h-10 rounded-full border border-brand-border object-cover flex-shrink-0"
                referrerPolicy="no-referrer"
                title={isCollapsed ? (user?.user_metadata?.full_name || user?.email || 'Profissional') : undefined}
              />
              {!isCollapsed && (
                <div className="overflow-hidden">
                  <p className="text-sm font-medium text-brand-text truncate">{user?.user_metadata?.full_name || user?.email || 'Profissional'}</p>
                  <p className="text-xs text-brand-text-muted truncate">{user?.email}</p>
                </div>
              )}
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path !== '/painel/dashboard' && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    title={isCollapsed ? item.name : undefined}
                    className={`flex items-center rounded-xl transition-all duration-200 relative group ${
                      isCollapsed 
                        ? 'justify-center p-3' 
                        : 'justify-between px-4 py-3'
                    } ${
                      isActive 
                        ? 'bg-brand-primary text-white shadow-sm' 
                        : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                    }`}
                  >
                    <div className={`flex items-center ${isCollapsed ? 'justify-center' : 'space-x-3'}`}>
                      <div className="relative">
                        <Icon size={20} className="flex-shrink-0" />
                        {item.name === 'Notificações' && unreadCount > 0 && isCollapsed && (
                          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white animate-pulse">
                            {unreadCount}
                          </span>
                        )}
                        {item.isPremium && isCollapsed && (
                          <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white w-3.5 h-3.5 rounded-full flex items-center justify-center border border-white shadow-sm" title="Premium (Plano Anual)">
                            <Crown size={8} className="fill-white" />
                          </span>
                        )}
                      </div>
                      {!isCollapsed && <span className="font-medium">{item.name}</span>}
                    </div>
                    {item.name === 'Notificações' && unreadCount > 0 && !isCollapsed && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive ? 'bg-white text-brand-primary' : 'bg-brand-primary text-white animate-pulse'
                      }`}>
                        {unreadCount}
                      </span>
                    )}
                    {item.isPremium && !isCollapsed && (
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-md flex items-center shrink-0 ${
                        isActive 
                          ? 'bg-white/20 text-white' 
                          : 'bg-amber-50 text-amber-600 border border-amber-200'
                      }`} title="Recurso Premium do Plano Anual">
                        <Crown size={10} className="fill-current shrink-0" />
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className={`${isCollapsed ? 'p-2' : 'p-4'} border-t border-brand-border bg-white space-y-2`}>
          {!isStandalone && deferredPrompt && (
            <button
              onClick={handleInstallClick}
              title={isCollapsed ? "Instalar App" : undefined}
              className={`flex items-center rounded-xl text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 transition-all duration-200 relative group ${
                isCollapsed ? 'justify-center p-3 w-full' : 'space-x-3 px-4 py-3 w-full'
              }`}
            >
              <Download size={20} className="flex-shrink-0" />
              {!isCollapsed && <span className="font-medium">Instalar App</span>}
            </button>
          )}
          <div className="w-full">
            <button
              onClick={() => {
                const text = "Olá! Estou usando o aplicativo Evolução Clínica para gerenciar meus prontuários com IA e achei fantástico. Facilita muito o dia a dia! Dá uma olhada: " + window.location.origin;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
              }}
              title={isCollapsed ? "Compartilhar App" : undefined}
              className={`flex items-center rounded-xl text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary-hover transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer relative group ${
                isCollapsed ? 'justify-center p-3 w-full' : 'space-x-3 px-4 py-3 w-full'
              }`}
            >
              <Share2 size={20} className="flex-shrink-0" />
              {!isCollapsed && <span className="font-medium">Compartilhar App</span>}
            </button>
            {!isCollapsed && (
              <span className="text-[10px] text-brand-text-muted pl-12 block -mt-1 mb-2">
                Compartilhamento via WhatsApp
              </span>
            )}
          </div>
          <button
            onClick={handleLogout}
            title={isCollapsed ? "Sair" : undefined}
            className={`flex items-center rounded-xl text-red-600 hover:bg-red-50 transition-colors relative group ${
              isCollapsed ? 'justify-center p-3 w-full' : 'space-x-3 px-4 py-3 w-full'
            }`}
          >
            <LogOut size={20} className="flex-shrink-0" />
            {!isCollapsed && <span className="font-medium">Sair</span>}
          </button>
          <AppVersion collapsed={isCollapsed} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-x-hidden flex flex-col pb-16 md:pb-0">
        <TrialBanner />
        <main className="p-4 md:p-8 w-full md:w-[90%] max-w-none mx-auto flex-1">
          <Outlet />
        </main>
        <footer className="p-8 mt-auto flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-brand-border/30 text-brand-text-muted">
          <AppVersion />
          <div className="flex gap-4 text-xs font-medium">
            <Link to="/privacy" className="hover:text-brand-primary transition-colors">Política de Privacidade</Link>
            <span className="text-brand-border">|</span>
            <Link to="/terms" className="hover:text-brand-primary transition-colors">Termos de Serviço</Link>
          </div>
        </footer>
      </div>

      {/* Fila de Sincronização Offline */}
      <OfflineQueueMonitor />

      {/* Menu Inferior Mobile */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white/95 backdrop-blur-md border-t border-brand-border/60 shadow-lg flex justify-around items-center py-2 pb-safe">
        {bottomNavItems.map((item) => {
          const Icon = item.icon;
          const isActive = location.pathname === item.path || (item.path !== '/painel/dashboard' && location.pathname.startsWith(item.path));
          return (
            <Link
              key={item.name}
              to={item.path}
              className={`flex flex-col items-center justify-center flex-1 py-1 transition-all duration-200 ${
                isActive 
                  ? 'text-brand-primary font-semibold scale-105' 
                  : 'text-brand-text-muted hover:text-brand-primary'
              }`}
            >
              <div className="relative">
                <Icon size={20} className={isActive ? 'stroke-[2.5px]' : 'stroke-[1.8px]'} />
                {item.name === 'Notif.' && unreadCount > 0 && (
                  <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                    {unreadCount}
                  </span>
                )}
              </div>
              <span className="text-[10px] mt-1 font-sans">{item.name}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
