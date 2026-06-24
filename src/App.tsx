import React, { useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { supabase } from './supabaseClient';
import { useAuthStore } from './store/authStore';
import { usePWAStore } from './store/pwaStore';
import { useSiteConfig } from './hooks/useSiteConfig';
import { SplashScreen } from './components/layout/SplashScreen';
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
import Onboarding from './pages/Onboarding';
import AdminPanel from './pages/AdminPanel';
import PrivacyPolicy from './pages/PrivacyPolicy';
import TermsOfService from './pages/TermsOfService';
import LandingPage from './pages/LandingPage';
import { appendBrandAssetVersion, getBrandAssetSignature, getBrandIconUrl } from './utils/brandAssets';
import { getOnboardingDestination, isOnboardingComplete } from './utils/onboarding';
import { InstallPrompt } from './components/common/InstallPrompt';
import { clearPendingGoogleScopes, readPendingGoogleScopes } from './services/googleAuth';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady, profileStatus, profileRole, subscriptionStatus, subscriptionEndsAt } = useAuthStore();
  const location = useLocation();
  const isOnboardingRoute = location.pathname.startsWith('/onboarding');
  
  if (!isAuthReady) {
    return <SplashScreen message="Preparando seu ambiente clínico..." />;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (profileStatus === null || profileRole === null) {
    return <SplashScreen message="Carregando seus dados..." />;
  }
  
  if (profileStatus === 'pending') {
    return <Navigate to="/pending" replace />;
  }
  
  if (profileStatus === 'inactive') {
    return <Navigate to="/pending?status=inactive" replace />;
  }

  if (isOnboardingRoute) {
    return <>{children}</>;
  }

  if (profileRole !== 'admin' && user && !isOnboardingComplete(user.id)) {
    const destination = getOnboardingDestination(user.id);
    const cleanDestPath = destination.split('?')[0];
    const isEditingPatientOnboarding = location.pathname.match(/^\/painel\/patients\/[^/]+\/edit$/) && location.search.includes('onboarding=1');

    if (location.pathname !== cleanDestPath && !isEditingPatientOnboarding) {
      return <Navigate to={destination} replace />;
    }
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
    return <SplashScreen message="Carregando área administrativa..." />;
  }

  if (user && profileRole === null) {
    return <SplashScreen message="Carregando permissões administrativas..." />;
  }
  
  if (user && profileRole !== 'admin') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
}

function RootRoute() {
  const { isAuthReady, user, profileRole } = useAuthStore();

  if (!isAuthReady) {
    return <SplashScreen message="Iniciando Evolução Clínica..." />;
  }

  if (user) {
    if (profileRole !== 'admin' && !isOnboardingComplete(user.id)) {
      return <Navigate to={getOnboardingDestination(user.id)} replace />;
    }

    return <Navigate to="/painel/dashboard" replace />;
  }

  return <LandingPage />;
}


export default function App() {
  const { setUser, setAuthReady, setProfileInfo, setGoogleAccessToken, setGoogleGrantedScopes } = useAuthStore();
  const professionalChannelRef = useRef<any>(null);
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);

  useEffect(() => {
    const updateLink = (selector: string, rel: string, href: string, type?: string, sizes?: string) => {
      let link = document.querySelector<HTMLLinkElement>(selector);
      if (!link) {
        link = document.createElement('link');
        link.setAttribute('rel', rel);
        document.head.appendChild(link);
      }
      link.rel = rel;
      if (type) link.type = type;
      if (sizes) link.setAttribute('sizes', sizes);
      link.href = href;
    };

    const updateMeta = (selector: string, attr: 'name' | 'property', value: string, content: string) => {
      let meta = document.querySelector<HTMLMetaElement>(selector);
      if (!meta) {
        meta = document.createElement('meta');
        meta.setAttribute(attr, value);
        document.head.appendChild(meta);
      }
      meta.setAttribute(attr, value);
      meta.content = content;
    };

    const iconUrl = appendBrandAssetVersion(getBrandIconUrl(siteConfig), assetSignature);
    const splashIconUrl = appendBrandAssetVersion(siteConfig.logo_dark_url || getBrandIconUrl(siteConfig), assetSignature);

    updateLink("link[rel='icon']", 'icon', iconUrl, 'image/png', '32x32');
    updateLink("link[rel='shortcut icon']", 'shortcut icon', iconUrl, 'image/png');
    updateLink("link[rel='apple-touch-icon']", 'apple-touch-icon', iconUrl, 'image/png');
    updateLink("link[rel='manifest']", 'manifest', appendBrandAssetVersion('/manifest.webmanifest', assetSignature), 'application/manifest+json');
    updateMeta("meta[name='theme-color']", 'name', 'theme-color', siteConfig.pwa_theme_color);
    updateMeta("meta[property='og:image']", 'property', 'og:image', appendBrandAssetVersion(siteConfig.pwa_icon_512_url || splashIconUrl, assetSignature));
    updateMeta("meta[name='twitter:image']", 'name', 'twitter:image', appendBrandAssetVersion(siteConfig.pwa_icon_512_url || splashIconUrl, assetSignature));
  }, [siteConfig, assetSignature]);
  const pendingOnboardingNoticeRef = useRef<string | null>(null);
  const authSessionHandlingRef = useRef(false);

  const clearProfessionalChannel = async () => {
    if (professionalChannelRef.current) {
      const channel = professionalChannelRef.current;
      professionalChannelRef.current = null;
      await supabase.removeChannel(channel);
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
      if (authSessionHandlingRef.current) {
        return;
      }

      authSessionHandlingRef.current = true;

      const currentState = useAuthStore.getState();

      try {
        if (session) {
          const isSameUser = currentState.user?.id === session.user.id;
          const hasProfile = currentState.profileStatus !== null;

          if (isSameUser && hasProfile) {
            // Se o provider_token do Google mudou ou foi fornecido, atualiza
            if (session.provider_token && currentState.googleAccessToken !== session.provider_token) {
              setGoogleAccessToken(session.provider_token);
              const pendingScopes = readPendingGoogleScopes();
              if (pendingScopes.length > 0) {
                setGoogleGrantedScopes(pendingScopes);
                clearPendingGoogleScopes();
              }
            }
            setAuthReady(true);
            return;
          }

          await clearProfessionalChannel();

          setUser(session.user);
          if (session.provider_token) {
            setGoogleAccessToken(session.provider_token);
            const pendingScopes = readPendingGoogleScopes();
            if (pendingScopes.length > 0) {
              setGoogleGrantedScopes(pendingScopes);
              clearPendingGoogleScopes();
            }
          } else {
            // Opcional: em alguns fluxos do Supabase o token do provedor pode ser guardado no localStorage
            // se o redirecionamento limpar o provider_token após a primeira captura.
          }

          let profileData: any = null;

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
                const bootstrapData = await bootstrapProfessionalAccess(session);
                profileData = bootstrapData.profile || null;

                if (!profileData) {
                  throw new Error('Não foi possível carregar o perfil do profissional.');
                }
              } else {
                throw error;
              }
            } else {
              profileData = data;
            }

            if (!profileData) {
              throw new Error('Perfil do profissional indisponível.');
            }

            if (profileData.status === 'pending') {
              try {
                const bootstrapData = await bootstrapProfessionalAccess(session);
                profileData = bootstrapData.profile || profileData;
              } catch (bootstrapError) {
                console.error('Erro ao sincronizar onboarding pendente:', bootstrapError);
              }
            }

            setProfileInfo(
              profileData.status,
              profileData.role || 'therapist',
              profileData.subscription_plan,
              profileData.subscription_status,
              profileData.subscription_ends_at,
              profileData.trial_ends_at
            );

            pendingOnboardingNoticeRef.current = profileData.status === 'pending' ? session.user.id : null;
          } catch (profileError) {
            console.error('Erro ao processar perfil do profissional:', profileError);
            if (currentState.profileStatus === null && currentState.profileRole === null) {
              setProfileInfo('active', 'therapist', 'trial', 'trialing', null, null);
            }
          }

          try {
            const channel = supabase
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
                      if (updatedProf.force_google_disconnect) {
                        setGoogleAccessToken(null);
                        localStorage.setItem('force_google_prompt', 'true');
                        await supabase
                          .from('professionals')
                          .update({ force_google_disconnect: false })
                          .eq('id', session.user.id);
                        await supabase.auth.signOut();
                        return;
                      }

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

            professionalChannelRef.current = channel;
          } catch (channelError) {
            console.error('Erro ao configurar canal realtime do profissional:', channelError);
          }
        } else {
          await clearProfessionalChannel();
          pendingOnboardingNoticeRef.current = null;
          setGoogleAccessToken(null);
          setGoogleGrantedScopes([]);
          if (currentState.user !== null || currentState.profileStatus !== null) {
            setUser(null);
            setProfileInfo(null, null, null, null, null, null);
          }
          clearPendingGoogleScopes();
        }
      } finally {
        authSessionHandlingRef.current = false;
        setAuthReady(true);
      }
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
      <InstallPrompt />
      
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/onboarding" element={<ProtectedRoute><Onboarding /></ProtectedRoute>} />
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
