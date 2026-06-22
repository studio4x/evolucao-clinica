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
import Profile from './pages/Profile';
import Notifications from './pages/Notifications';

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
  if (location.pathname === '/painel/subscription') {
    return <>{children}</>;
  }

  // Se não for admin, verifica se a assinatura expirou
  if (profileRole !== 'admin') {
    const now = new Date();
    const endsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
    const isExpired = endsAt ? endsAt < now : false;

    if (isExpired) {
      return <Navigate to="/painel/subscription" replace />;
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
      const currentState = useAuthStore.getState();

      if (session) {
        const isSameUser = currentState.user?.id === session.user.id;
        const hasProfile = currentState.profileStatus !== null;

        if (isSameUser && hasProfile) {
          // Se o provider_token do Google mudou ou foi fornecido, atualiza
          if (session.provider_token && currentState.googleAccessToken !== session.provider_token) {
            setGoogleAccessToken(session.provider_token);
          }
          setAuthReady(true);
          return;
        }

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
            // Se for PGRST116 (registro não encontrado/novo cadastro), aguarda liberação
            if (error.code === 'PGRST116') {
              setProfileInfo('pending', 'therapist', 'trial', 'trialing', null, null);
            } else {
              // Outros erros (ex: offline). Assume 'active' por tolerância de rede
              setProfileInfo('active', 'therapist', 'trial', 'trialing', null, null);
            }
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
          // Em caso de exceção (ex: offline), assume 'active' por tolerância de rede
          setProfileInfo('active', 'therapist', 'trial', 'trialing', null, null);
        }
      } else {
        if (currentState.user !== null || currentState.profileStatus !== null) {
          setUser(null);
          setGoogleAccessToken(null);
          setProfileInfo(null, null, null, null, null, null);
        }
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
      
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pending" element={<PendingApproval />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />
        <Route path="/terms" element={<TermsOfService />} />
        
        {/* Admin Panel Routes */}
        <Route path="/admin/*" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        
        {/* Client/Therapist Panel Routes */}
        <Route path="/painel" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
          <Route index element={<Navigate to="dashboard" replace />} />
          <Route path="dashboard" element={<Dashboard />} />
          <Route path="patients" element={<Patients />} />
          <Route path="patients/new" element={<PatientForm />} />
          <Route path="patients/:id/edit" element={<PatientForm />} />
          <Route path="patients/:id" element={<PatientDetail />} />
          <Route path="patients/:id/evolutions/new" element={<NewEvolution />} />
          <Route path="history" element={<History />} />
          <Route path="tutorial" element={<Tutorial />} />
          <Route path="share-target" element={<ShareTarget />} />
          <Route path="subscription" element={<Subscription />} />
          <Route path="profile" element={<Profile />} />
          <Route path="notifications" element={<Notifications />} />
        </Route>

        {/* Redirects */}
        <Route path="/" element={<Navigate to="/painel/dashboard" replace />} />
        <Route path="/patients" element={<Navigate to="/painel/patients" replace />} />
        <Route path="/share-target" element={<Navigate to="/painel/share-target" replace />} />
        <Route path="/api/share-target" element={<Navigate to="/painel/share-target" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
