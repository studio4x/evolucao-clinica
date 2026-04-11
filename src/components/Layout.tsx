import { Outlet, Link, useNavigate, useLocation } from 'react-router-dom';
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';
import { useAuthStore } from '../store/authStore';
import { LayoutDashboard, Users, History as HistoryIcon, LogOut, Menu, X, Download } from 'lucide-react';
import { useState, useEffect } from 'react';

export default function Layout() {
  const { user } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);

  useEffect(() => {
    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent the mini-infobar from appearing on mobile
      e.preventDefault();
      // Stash the event so it can be triggered later.
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    // Show the install prompt
    deferredPrompt.prompt();
    // Wait for the user to respond to the prompt
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      console.log('User accepted the install prompt');
    } else {
      console.log('User dismissed the install prompt');
    }
    // We've used the prompt, and can't use it again, throw it away
    setDeferredPrompt(null);
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
        <img src="/logo.svg" alt="Conexão Seres" className="h-8 w-auto" />
        <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2 text-brand-primary">
          {isMobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {/* Sidebar */}
      <div className={`
        ${isMobileMenuOpen ? 'block' : 'hidden'} 
        md:block w-full md:w-64 bg-white border-r border-brand-border min-h-screen flex-shrink-0
        fixed md:sticky top-[73px] md:top-0 z-10 md:z-0 h-[calc(100vh-73px)] md:h-screen overflow-y-auto shadow-sm
      `}>
        <div className="p-6 hidden md:block border-b border-brand-border/50">
          <img src="/logo.svg" alt="Conexão Seres" className="h-12 w-auto mb-2" />
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

        <div className="absolute bottom-0 w-full p-4 border-t border-brand-border bg-white space-y-2">
          {deferredPrompt && (
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
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-x-hidden">
        <main className="p-4 md:p-8 max-w-5xl mx-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
