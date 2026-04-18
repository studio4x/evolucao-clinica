import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { AppVersion } from '../components/layout/AppVersion';
import { useEffect, useState } from 'react';

export default function Login() {
  const navigate = useNavigate();
  const { setGoogleAccessToken, setUser } = useAuthStore();
  const [loading, setLoading] = useState(false);

  // No longer using redirect flows

  const handleUserProfile = async (user: any) => {
    setUser(user);
    const docRef = doc(db, 'professionals', user.uid);
    const docSnap = await getDoc(docRef);

    if (!docSnap.exists()) {
      const professionalData: any = {
        id: user.uid,
        google_email: user.email || '',
        full_name: user.displayName || 'Usuário',
        role: 'therapist',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };
      if (user.photoURL) {
        professionalData.photo_url = user.photoURL;
      }
      await setDoc(docRef, professionalData);
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
      }

      // Evita travamento infinito caso o Firestore do Firebase falhe de responder
      const profilePromise = handleUserProfile(result.user);
      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error("O banco de dados demorou muito para responder (Timeout/Offline).")), 10000)
      );
      
      await Promise.race([profilePromise, timeoutPromise]);
      navigate('/');
      
    } catch (error: any) {
      console.error('Login error:', error);
      setLoading(false);
      if (error.code !== 'auth/popup-closed-by-user' && error.code !== 'auth/cancelled-popup-request') {
        alert(`Erro de autenticação: ${error.message}`);
      }
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/logotipo-transparente-1024.png" alt="Evolução Clínica" className="h-28 w-auto object-contain max-w-xs" />
        </div>
        <h2 className="mt-8 text-center text-3xl font-display font-semibold text-brand-primary">
          Evolução Clínica
        </h2>
        <p className="mt-2 text-center text-sm text-brand-text-muted">
          Automatize suas evoluções com IA e Google Docs
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="card py-8 px-4 sm:px-10">
          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-primary w-full py-3 text-base disabled:opacity-50"
          >
            {loading ? 'Entrando...' : 'Entrar com Google'}
          </button>
          <p className="mt-6 text-xs text-center text-brand-text-muted">
            O aplicativo solicitará acesso ao seu Google Drive para salvar os prontuários.
          </p>
        </div>
      </div>
      
      <div className="mt-auto py-8">
        <AppVersion />
      </div>
    </div>
  );
}
