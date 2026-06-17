import React, { useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
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

import { InstallPrompt } from './components/common/InstallPrompt';
import { CookieConsent } from './components/CookieConsent';

import PendingApproval from './pages/PendingApproval';
import AdminPanel from './pages/AdminPanel';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady, profileStatus } = useAuthStore();
  
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
  
  return <>{children}</>;
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user, isAuthReady, profileRole } = useAuthStore();
  
  if (!isAuthReady) {
    return <div className="flex items-center justify-center min-h-screen">Carregando...</div>;
  }
  
  if (!user) {
    return <Navigate to="/login" replace />;
  }
  
  if (profileRole !== 'admin') {
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
          if (docSnap.exists()) {
            const data = docSnap.data();
            setProfileInfo(data.status, data.role || 'therapist');
          } else {
            if (user.email === 'contato@studio4x.com.br') {
              setProfileInfo('active', 'admin');
            } else {
              setProfileInfo('pending', 'therapist');
            }
          }
        } catch (error) {
          console.error("Erro ao buscar dados do perfil do profissional:", error);
          setProfileInfo('pending', 'therapist');
        }
      } else {
        setProfileInfo(null, null);
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
          <Route path="admin" element={<AdminRoute><AdminPanel /></AdminRoute>} />
        </Route>
      </Routes>
    </Router>
  );
}
