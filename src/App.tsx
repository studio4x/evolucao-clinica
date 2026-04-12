import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from './firebase';
import { useAuthStore } from './store/authStore';
import { usePWAStore } from './store/pwaStore';
import { Download, X } from 'lucide-react';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Patients from './pages/Patients';
import PatientForm from './pages/PatientForm';
import PatientDetail from './pages/PatientDetail';
import NewEvolution from './pages/NewEvolution';
import History from './pages/History';
import ShareTarget from './pages/ShareTarget';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady } = useAuthStore();
  
  if (!isAuthReady) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  return <>{children}</>;
}

function InstallBanner() {
  const { deferredPrompt, setDeferredPrompt, isStandalone } = usePWAStore();
  const [isVisible, setIsVisible] = useState(true);

  if (!deferredPrompt || isStandalone || !isVisible) return null;

  const handleInstall = async () => {
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  return (
    <div className="fixed bottom-0 left-0 right-0 bg-brand-primary text-white p-4 shadow-lg z-50 flex items-center justify-between animate-in slide-in-from-bottom-full">
      <div className="flex items-center space-x-3">
        <div className="bg-white/20 p-2 rounded-lg">
          <Download size={24} />
        </div>
        <div>
          <p className="font-medium">Instalar Conexão Seres</p>
          <p className="text-sm text-white/80">Adicione à tela inicial para acesso rápido e offline</p>
        </div>
      </div>
      <div className="flex items-center space-x-2">
        <button 
          onClick={handleInstall}
          className="bg-white text-brand-primary px-4 py-2 rounded-lg font-medium text-sm hover:bg-gray-100 transition-colors"
        >
          Instalar
        </button>
        <button 
          onClick={() => setIsVisible(false)}
          className="p-2 hover:bg-white/20 rounded-lg transition-colors"
        >
          <X size={20} />
        </button>
      </div>
    </div>
  );
}

export default function App() {
  const { setUser, setAuthReady } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, [setUser, setAuthReady]);

  return (
    <Router>
      <InstallBanner />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/new" element={<PatientForm />} />
          <Route path="patients/:id/edit" element={<PatientForm />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="patients/:id/evolutions/new" element={<NewEvolution />} />
          <Route path="history" element={<History />} />
          <Route path="share-target" element={<ShareTarget />} />
        </Route>
      </Routes>
    </Router>
  );
}
