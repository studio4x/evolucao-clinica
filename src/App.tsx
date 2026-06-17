import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { onAuthStateChanged } from 'firebase/auth';
import { auth, db } from './firebase';
import { doc, getDoc } from 'firebase/firestore';
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
  const { setUser, setAuthReady, setProfileInfo } = useAuthStore();

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const docRef = doc(db, 'professionals', user.uid);
          const docSnap = await getDoc(docRef);
          const now = new Date();
          const trialDurationMs = 7 * 24 * 60 * 60 * 1000;

          if (docSnap.exists()) {
            const data = docSnap.data();
            
            // Compatibilidade retroativa para usuários legados
            let currentSubPlan = data.subscription_plan;
            let currentSubStatus = data.subscription_status;
            let currentSubEndsAt = data.subscription_ends_at || null;
            let currentTrialEndsAt = data.trial_ends_at || null;

            if (data.status === 'active' && !currentSubPlan) {
              currentSubPlan = 'none';
              currentSubStatus = 'active';
              currentSubEndsAt = null;
            } else if (!currentSubPlan) {
              currentSubPlan = 'trial';
              currentSubStatus = 'trialing';
              const createdTime = data.created_at ? new Date(data.created_at).getTime() : now.getTime();
              const calculatedEnds = new Date(createdTime + trialDurationMs).toISOString();
              currentSubEndsAt = calculatedEnds;
              currentTrialEndsAt = calculatedEnds;
            }

            setProfileInfo(
              data.status,
              data.role || 'therapist',
              currentSubPlan,
              currentSubStatus,
              currentSubEndsAt,
              currentTrialEndsAt
            );
          } else {
            if (user.email === 'contato@studio4x.com.br') {
              setProfileInfo('active', 'admin', 'none', 'active', null, null);
            } else {
              // Caso o usuário exista no Auth mas não no Firestore, configuramos o trial na store
              const trialEnds = new Date(now.getTime() + trialDurationMs).toISOString();
              setProfileInfo('active', 'therapist', 'trial', 'trialing', trialEnds, trialEnds);
            }
          }
        } catch (error) {
          console.error("Erro ao buscar dados do perfil do profissional:", error);
          setProfileInfo('pending', 'therapist');
        }
      } else {
        setProfileInfo(null, null, null, null, null, null);
      }
      setUser(user);
      setAuthReady(true);
    });
    return () => unsubscribe();
  }, [setUser, setAuthReady, setProfileInfo]);

  return (
    <Router>
      <CookieConsent />
      <InstallPrompt />
      
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route path="/pending" element={<PendingApproval />} />
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
