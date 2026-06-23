import React, { useEffect, useRef } from 'react';
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
import SupportTickets from './pages/SupportTickets';
import SupportTicketDetail from './pages/SupportTicketDetail';

import { CookieConsent } from './components/CookieConsent';

import PendingApproval from './pages/PendingApproval';
import AdminPanel from './pages/AdminPanel';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import LandingPage from './pages/LandingPage';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady, profileStatus, profileRole, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
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

  // Se não for admin, verifica se o usuário possui plano ativo e não expirado
  if (profileRole !== 'admin') {
    const now = new Date();
    const endsAt = subscriptionEndsAt ? new Date(subscriptionEndsAt) : null;
    const isExpired = endsAt ? endsAt < now : false;
    const isActive = subscriptionStatus === 'active' || subscriptionStatus === 'trialing';

    if (!isActive || isExpired) {
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

function RootRoute() {
  const { user, isAuthReady, profileStatus } = useAuthStore();

  if (!isAuthReady) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }

  if (user) {
    if (profileStatus === 'pending') {
      return <Navigate to="/pending" replace />;
    }
    if (profileStatus === 'inactive') {
      return <Navigate to="/pending?status=inactive" replace />;
    }
    return <Navigate to="/painel/dashboard" replace />;
  }

  return <LandingPage />;
}


export default function App() {
  const { setUser, setAuthReady, setProfileInfo, setGoogleAccessToken } = useAuthStore();
  const professionalChannelRef = useRef<any>(null);
  const pendingOnboardingNoticeRef = useRef<string | null>(null);

  const clearProfessionalChannel = () => {
    if (professionalChannelRef.current) {
      void supabase.removeChannel(professionalChannelRef.current);
      professionalChannelRef.current = null;
    }
  };

  useEffect(() => {
    const bootstrapProfessionalAccess = async (session: any) => {
      const response = await fetch('/api/onboarding/bootstrap', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`
        }
      });

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Falha ao sincronizar acesso do profissional.');
      }

      return data;
    };

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

        clearProfessionalChannel();

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
              try {
                const bootstrapData = await bootstrapProfessionalAccess(session);
                const bootstrapProfile = bootstrapData.profile || {};
                const nextStatus = bootstrapProfile.status || bootstrapData.status || 'pending';

                setProfileInfo(
                  nextStatus,
                  bootstrapProfile.role || 'therapist',
                  bootstrapProfile.subscription_plan || 'trial',
                  bootstrapProfile.subscription_status || 'trialing',
                  bootstrapProfile.subscription_ends_at || null,
                  bootstrapProfile.trial_ends_at || null
                );

                pendingOnboardingNoticeRef.current = nextStatus === 'pending' ? session.user.id : null;
              } catch (bootstrapError) {
                console.error('Erro ao sincronizar onboarding do profissional:', bootstrapError);
                setProfileInfo('pending', 'therapist', 'trial', 'trialing', null, null);
                pendingOnboardingNoticeRef.current = session.user.id;
              }
            } else {
              // Outros erros (ex: offline). Assume 'active' por tolerância de rede
              setProfileInfo('active', 'therapist', 'trial', 'trialing', null, null);
              pendingOnboardingNoticeRef.current = null;
            }
          } else if (data) {
            if (data.status === 'pending') {
              try {
                const bootstrapData = await bootstrapProfessionalAccess(session);
                const bootstrapProfile = bootstrapData.profile || {};
                const nextStatus = bootstrapProfile.status || bootstrapData.status || 'pending';

                setProfileInfo(
                  nextStatus,
                  bootstrapProfile.role || data.role || 'therapist',
                  bootstrapProfile.subscription_plan || data.subscription_plan,
                  bootstrapProfile.subscription_status || data.subscription_status,
                  bootstrapProfile.subscription_ends_at || data.subscription_ends_at,
                  bootstrapProfile.trial_ends_at || data.trial_ends_at
                );

                if (nextStatus === 'pending') {
                  pendingOnboardingNoticeRef.current = session.user.id;
                } else {
                  pendingOnboardingNoticeRef.current = null;
                }
              } catch (bootstrapError) {
                console.error('Erro ao sincronizar onboarding pendente:', bootstrapError);
                setProfileInfo(
                  data.status,
                  data.role || 'therapist',
                  data.subscription_plan,
                  data.subscription_status,
                  data.subscription_ends_at,
                  data.trial_ends_at
                );
                pendingOnboardingNoticeRef.current = session.user.id;
              }
            } else {
              setProfileInfo(
                data.status,
                data.role || 'therapist',
                data.subscription_plan,
                data.subscription_status,
                data.subscription_ends_at,
                data.trial_ends_at
              );
              pendingOnboardingNoticeRef.current = null;
            }
          }

          professionalChannelRef.current = supabase
            .channel(`professional-status-${session.user.id}`)
            .on(
              'postgres_changes',
              {
                event: '*',
                schema: 'public',
                table: 'professionals',
                filter: `id=eq.${session.user.id}`
              },
              async () => {
                try {
                  const { data: updatedProf } = await supabase
                    .from('professionals')
                    .select('*')
                    .eq('id', session.user.id)
                    .single();

                  if (updatedProf) {
                    setProfileInfo(
                      updatedProf.status,
                      updatedProf.role || 'therapist',
                      updatedProf.subscription_plan,
                      updatedProf.subscription_status,
                      updatedProf.subscription_ends_at,
                      updatedProf.trial_ends_at
                    );

                    if (updatedProf.status !== 'pending') {
                      pendingOnboardingNoticeRef.current = null;
                    }
                  }
                } catch (profileError) {
                  console.error('Erro ao sincronizar status do profissional:', profileError);
                }
              }
            )
            .subscribe();
        } catch (error) {
          console.error("Erro ao processar perfil do profissional:", error);
          // Em caso de exceção (ex: offline), assume 'active' por tolerância de rede
          setProfileInfo('active', 'therapist', 'trial', 'trialing', null, null);
          pendingOnboardingNoticeRef.current = null;
        }
      } else {
        clearProfessionalChannel();
        pendingOnboardingNoticeRef.current = null;
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
      clearProfessionalChannel();
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
          <Route path="support" element={<SupportTickets />} />
          <Route path="support/:ticketId" element={<SupportTicketDetail />} />
        </Route>

        {/* Redirects */}
        <Route path="/" element={<RootRoute />} />
        <Route path="/patients" element={<Navigate to="/painel/patients" replace />} />
        <Route path="/share-target" element={<Navigate to="/painel/share-target" replace />} />
        <Route path="/api/share-target" element={<Navigate to="/painel/share-target" replace />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Router>
  );
}
