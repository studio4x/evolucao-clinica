import React, { useState } from 'react';
import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { usePWAStore } from '../store/pwaStore';
import { LayoutDashboard, Users, History as HistoryIcon, LogOut, Menu, X, Download } from 'lucide-react';
import { AppVersion } from './layout/AppVersion';

export default function Layout() {
  const { user } = useAuthStore();
  const { deferredPrompt, setDeferredPrompt, isStandalone } = usePWAStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [showInstallModal, setShowInstallModal] = useState(false);

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
    await signOut(auth);
    navigate('/login');
  };

  const navItems = [
    { name: 'Dashboard', path: '/', icon: LayoutDashboard },
    { name: 'Pacientes', path: '/patients', icon: Users },
    { name: 'Histórico', path: '/history', icon: HistoryIcon },
  ];

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col md:flex-row">
      {/* Mobile Header */}
      <div className="md:hidden bg-white border-b border-brand-border p-4 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <img src="/logo.svg" alt="HomeCare Match" className="h-8 w-auto" />
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-brand-primary">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`
        ${isMobileMenuOpen ? 'flex' : 'hidden'} 
        md:flex flex-col w-full md:w-64 bg-white border-r border-brand-border flex-shrink-0
        fixed md:sticky top-[73px] md:top-0 z-10 md:z-0 h-[calc(100vh-73px)] md:h-screen shadow-sm
      `}>
        <div className="flex-1 overflow-y-auto">
          <div className="p-6 hidden md:block border-b border-brand-border/50">
            <img src="/logo.svg" alt="HomeCare Match" className="h-12 w-auto mb-2" />
          </div>

          <div className="px-4 py-6">
            <div className="flex items-center space-x-3 px-4 py-3 mb-6 bg-brand-bg rounded-xl border border-brand-border/50">
              <img 
                src={user?.photoURL || 'https://ui-avatars.com/api/?name=' + user?.displayName + '&background=005C13&color=fff'} 
                alt="Profile" 
                className="w-10 h-10 rounded-full border border-brand-border"
                referrerPolicy="no-referrer"
              />
              <div className="overflow-hidden">
                <p className="text-sm font-medium text-brand-text truncate">{user?.displayName}</p>
                <p className="text-xs text-brand-text-muted truncate">{user?.email}</p>
              </div>
            </div>

            <nav className="space-y-2">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));
                return (
                  <Link
                    key={item.name}
                    to={item.path}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className={`flex items-center space-x-3 px-4 py-3 rounded-xl transition-all duration-200 ${
                      isActive 
                        ? 'bg-brand-primary text-white shadow-sm' 
                        : 'text-brand-text-muted hover:bg-brand-bg hover:text-brand-primary'
                    }`}
                  >
                    <Icon size={20} />
                    <span className="font-medium">{item.name}</span>
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
        <main className="p-4 md:p-8 max-w-5xl mx-auto flex-1 w-full">
          <Outlet />
        </main>
        <footer className="p-8 mt-auto opacity-50">
          <AppVersion />
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
    </div>
  );
}
