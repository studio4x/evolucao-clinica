import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';
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
import Tutorial from './pages/Tutorial';
import Subscription from './pages/Subscription';

import { InstallPrompt } from './components/common/InstallPrompt';
import { CookieConsent } from './components/CookieConsent';

import PendingApproval from './pages/PendingApproval';
import AdminPanel from './pages/AdminPanel';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady, profileStatus, profileRole, subscriptionEndsAt } = useAuthStore();
  const location = useLocation();
  
  if (!isAuthReady) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (profileStatus === 'pending') {
    return <Navigate to="/pending" replace />;
  }
  
  if (profileStatus === 'inactive') {
    return <Navigate to="/pending?status=inactive" replace />;
  }

  // Pula a validação de expiração se o usuário já estiver na página de assinatura
  if (location.pathname === '/subscription') {
    return <>{children}</>;
  }

  // Se não for admin, verifica se a assinatura expirou
  if (profileRole !== 'admin') {
    const now = new Date();
    const endsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
    const isExpired = endsAt ? endsAt < now : false;

    if (isExpired) {
      return <Navigate to="/subscription" replace />;
    }
  }
  
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady, profileRole } = useAuthStore();
  
  if (!isAuthReady) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }
  
  if (user && profileRole !== 'admin') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

export default function App() {
  const { setUser, setAuthReady, setProfileInfo, setGoogleAccessToken } = useAuthStore();

  useEffect(() => {
    const handleAuthSession = async (session: any) => {
      if (session) {
        setUser(session.user);
        if (session.provider_token) {
          setGoogleAccessToken(session.provider_token);
        } else {
          // Opcional: em alguns fluxos do Supabase o token do provedor pode ser guardado no localStorage
          // se o redirecionamento limpar o provider_token após a primeira captura.
        }

        try {
          const { data, error } = await supabase
            .from('professionals')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (error) {
            console.error("Erro ao buscar profissional no Supabase:", error);
            // Tolerância para atraso no trigger: define valores padrão
            setProfileInfo('active', 'therapist', 'trial', 'trialing', null, null);
          } else if (data) {
            setProfileInfo(
              data.status,
              data.role || 'therapist',
              data.subscription_plan,
              data.subscription_status,
              data.subscription_ends_at,
              data.trial_ends_at
            );
          }
        } catch (error) {
          console.error("Erro ao processar perfil do profissional:", error);
          setProfileInfo('pending', 'therapist');
        }
      } else {
        setUser(null);
        setGoogleAccessToken(null);
        setProfileInfo(null, null, null, null, null, null);
      }
      setAuthReady(true);
    };

    // Pega a sessão inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthSession(session);
    });

    // Escuta mudanças no Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
      handleAuthSession(session);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [setUser, setAuthReady, setProfileInfo, setGoogleAccessToken]);

  return (
    <Router>
      <CookieConsent />
      <InstallPrompt />
      
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        <Route path="/admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        
        <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/new" element={<PatientForm />} />
          <Route path="patients/:id/edit" element={<PatientForm />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="patients/:id/evolutions/new" element={<NewEvolution />} />
          <Route path="history" element={<History />} />
          <Route path="tutorial" element={<Tutorial />} />
          <Route path="share-target" element={<ShareTarget />} />
          <Route path="subscription" element={<Subscription />} />
        </Route>
      </Routes>
    </Router>
  );
}
