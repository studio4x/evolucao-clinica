import React, { useState, useEffect } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuthStore } from '../store/authStore';
import { usePWAStore } from '../store/pwaStore';
import { useSiteConfig } from '../hooks/useSiteConfig';
import { LayoutDashboard, Users, History as HistoryIcon, LogOut, Menu, X, Download, BookOpen, Share2, ShieldCheck, CreditCard, User, Bell, LifeBuoy } from 'lucide-react';
import { AppVersion } from './layout/AppVersion';
import { appendBrandAssetVersion, getBrandAssetSignature } from '../utils/brandAssets';
import { OfflineQueueMonitor } from './layout/OfflineQueueMonitor';
import TrialBanner from './layout/TrialBanner';

export default function Layout() {
  const { user, profileRole } = useAuthStore();
  const { deferredPrompt, setDeferredPrompt, isStandalone } = usePWAStore();
  const siteConfig = useSiteConfig();
  const navigate = useNavigate();
  const location = useLocation();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

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

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === 'accepted') {
        console.log('User accepted the install prompt');
      }
      setDeferredPrompt(null);
    } else {
      setShowInstallModal(true);
    }
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
    { name: 'Suporte', path: '/painel/support', icon: LifeBuoy },
    { name: 'Meu Perfil', path: '/painel/profile', icon: User },
    { name: 'Assinatura', path: '/painel/subscription', icon: CreditCard },
  ];

  if (profileRole === 'admin') {
    navItems.push({ name: 'Painel Admin', path: '/admin', icon: ShieldCheck });
  }

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-brand-border p-4 flex justify-between items-center sticky top-0 z-50 shadow-sm">
        <Link to="/">
          <img
            src={appendBrandAssetVersion(siteConfig.logo_light_url || '/logotipo-transparente-1024.png', assetSignature)}
            alt="Conexão Ser"
            className="h-14 w-auto max-w-[150px] object-contain"
          />
        </Link>
        <div className="flex items-center space-x-2">
          <Link to="/painel/notifications" className="p-2 text-brand-primary relative">
            <Bell size={22} />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 bg-red-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border border-white">
                {unreadCount}
              </span>
            )}
          </Link>
          <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-brand-primary">
            {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>
      </div>

      {/* Sidebar */}
      <div className={`
        ${isMobileMenuOpen ? 'flex' : 'hidden'} 
        md:flex flex-col w-full md:w-64 bg-white border-r border-brand-border flex-shrink-0
        fixed md:sticky top-[73px] md:top-0 z-50 md:z-0 h-[calc(100vh-73px)] md:h-screen shadow-sm
      `}>
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 hidden md:block border-b border-brand-border/50">
            <Link to="/" className="flex justify-center">
              <img
                src={appendBrandAssetVersion(siteConfig.logo_light_url || '/logotipo-transparente-1024.png', assetSignature)}
                alt="Conexão Ser"
                className="h-28 w-auto max-w-full object-contain"
              />
            </Link>
          </div>

          <div className="px-4 py-6">
            <div className="flex items-center space-x-3 px-4 py-3 mb-6 bg-brand-bg rounded-xl border border-brand-border/50">
              <img 
                src={user?.user_metadata?.avatar_url || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user?.user_metadata?.full_name || user?.email || 'Profissional') + '&background=005C13&color=fff'} 
                alt="Profile" 
                className="w-10 h-10 rounded-full border border-brand-border object-cover"
                referrerPolicy="no-referrer"
              />
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-brand-text truncate">{user?.user_metadata?.full_name || user?.email || 'Profissional'}</p>
                <p className="text-xs text-brand-text-muted truncate">{user?.email}</p>
              </div>
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
                    className={`flex items-center justify-between px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive 
                        ? 'bg-brand-primary text-white shadow-sm' 
                        : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                    }`}
                  >
                    <div className="flex items-center space-x-3">
                      <Icon size={20} />
                      <span className="font-medium">{item.name}</span>
                    </div>
                    {item.name === 'Notificações' && unreadCount > 0 && (
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        isActive ? 'bg-white text-brand-primary' : 'bg-brand-primary text-white animate-pulse'
                      }`}>
                        {unreadCount}
                      </span>
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>
        </div>

        <div className="p-4 border-t border-brand-border bg-white space-y-2">
          {!isStandalone && (
            <button
              onClick={handleInstallClick}
              className="flex items-center space-x-3 px-4 py-3 w-full rounded-xl text-brand-primary bg-brand-primary/10 hover:bg-brand-primary/20 transition-colors"
            >
              <Download size={20} />
              <span className="font-medium">Instalar App</span>
            </button>
          )}
          <div className="w-full">
            <button
              onClick={() => {
                const text = "Olá! Estou usando o aplicativo Evolução Clínica para gerenciar meus prontuários com IA e achei fantástico. Facilita muito o dia a dia! Dá uma olhada: " + window.location.origin;
                window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank');
              }}
              className="flex items-center space-x-3 px-4 py-3 w-full rounded-xl text-brand-primary hover:bg-brand-primary/10 hover:text-brand-primary-hover transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
            >
              <Share2 size={20} />
              <span className="font-medium">Compartilhar App</span>
            </button>
            <span className="text-[10px] text-brand-text-muted pl-12 block -mt-1 mb-2">
              Compartilhamento via WhatsApp
            </span>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center space-x-3 px-4 py-3 w-full rounded-xl text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut size={20} />
            <span className="font-medium">Sair</span>
          </button>
          <AppVersion />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-x-hidden flex flex-col">
        <TrialBanner />
        <main className="p-4 md:p-8 max-w-5xl mx-auto flex-1 w-full">
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

      {/* Install Instructions Modal */}
      {showInstallModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6 space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-xl font-display font-semibold text-brand-primary">Como instalar o aplicativo</h3>
              <button onClick={() => setShowInstallModal(false)} className="text-gray-400 hover:text-gray-600">
                <X size={24} />
              </button>
            </div>
            
            <div className="space-y-4 text-sm text-brand-text">
              <p>O seu navegador bloqueou a instalação automática ou você está usando um iPhone. Siga os passos abaixo para instalar manualmente:</p>
              
              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h4 className="font-semibold mb-2 flex items-center"><span className="text-lg mr-2">🍎</span> No iPhone (Safari)</h4>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Abra este link no navegador <strong>Safari</strong>.</li>
                  <li>Toque no ícone de <strong>Compartilhar</strong> (um quadrado com uma seta para cima, na barra inferior).</li>
                  <li>Role a lista para baixo e toque em <strong>"Adicionar à Tela de Início"</strong>.</li>
                </ol>
              </div>

              <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
                <h4 className="font-semibold mb-2 flex items-center"><span className="text-lg mr-2">🤖</span> No Android (Chrome/Edge)</h4>
                <ol className="list-decimal pl-5 space-y-2">
                  <li>Toque no ícone de <strong>Menu</strong> (três pontinhos no canto superior direito).</li>
                  <li>Selecione <strong>"Instalar aplicativo"</strong> ou <strong>"Adicionar à tela inicial"</strong>.</li>
                </ol>
              </div>
            </div>
            <button 
              onClick={() => setShowInstallModal(false)}
              className="w-full btn-primary mt-4"
            >
              Entendi
            </button>
          </div>
        </div>
      )}

      {/* Fila de Sincronização Offline */}
      <OfflineQueueMonitor />
    </div>
  );
}
