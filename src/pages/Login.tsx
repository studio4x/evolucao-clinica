import { signInWithPopup, signInWithRedirect, getRedirectResult, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { AppVersion } from '../components/layout/AppVersion';
import { useEffect, useState } from 'react';
import { ShieldCheck, Zap, Sparkles, Files } from 'lucide-react';

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
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 px-6 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Elementos decorativos de fundo */}
      <div className="absolute top-0 left-0 w-full h-64 bg-gradient-to-b from-brand-primary/10 to-transparent pointer-events-none" />
      <div className="absolute -top-24 -right-24 w-96 h-96 bg-brand-accent/5 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-24 -left-24 w-96 h-96 bg-brand-primary/5 rounded-full blur-3xl pointer-events-none" />

      <div className="sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-white rounded-3xl shadow-xl shadow-brand-primary/10 border border-brand-primary/5">
            <img src="/logotipo-transparente-1024.png" alt="Evolução Clínica" className="h-24 w-auto object-contain" />
          </div>
        </div>
        <h2 className="mt-4 text-center text-3xl font-display font-bold text-brand-primary tracking-tight">
          Evolução Clínica
        </h2>
        <p className="mt-3 text-center text-base text-brand-text-muted max-w-[280px] mx-auto leading-relaxed">
          Sua prática clínica automatizada com <span className="text-brand-primary font-semibold">Inteligência Artificial</span>
        </p>
      </div>

      <div className="mt-10 sm:mx-auto sm:w-full sm:max-w-md relative z-10">
        <div className="card shadow-2xl shadow-brand-primary/5 py-10 px-6 sm:px-12 bg-white/80 backdrop-blur-sm border-brand-primary/10">
          <div className="space-y-6 mb-8">
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0 w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                <Zap className="w-5 h-5 text-brand-primary" />
              </div>
              <p className="text-sm font-medium text-brand-text">Transcreve áudios instantaneamente</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0 w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                <Files className="w-5 h-5 text-brand-primary" />
              </div>
              <p className="text-sm font-medium text-brand-text">Organiza tudo no seu Google Docs</p>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex-shrink-0 w-10 h-10 bg-brand-accent/10 rounded-xl flex items-center justify-center">
                <ShieldCheck className="w-5 h-5 text-brand-primary" />
              </div>
              <p className="text-sm font-medium text-brand-text">Prontuários seguros e estruturados</p>
            </div>
          </div>

          <button
            onClick={handleLogin}
            disabled={loading}
            className="btn-primary w-full py-4 text-lg font-semibold tracking-wide shadow-lg shadow-brand-primary/20 hover:shadow-xl hover:shadow-brand-primary/30 transform transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center justify-center space-x-3"
          >
            {loading ? (
              <span className="flex items-center space-x-2">
                <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                <span>Processando...</span>
              </span>
            ) : (
              <>
                <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Acessar com Google</span>
              </>
            )}
          </button>
          
          <div className="mt-8 flex items-center justify-center space-x-2 text-brand-primary/60">
            <Sparkles className="w-4 h-4" />
            <p className="text-xs font-medium uppercase tracking-widest italic">Conexão Seres</p>
          </div>
        </div>
      </div>
      
      <div className="mt-auto pt-12 relative z-10 text-center">
        <div className="inline-block px-4 py-1.5 bg-white/50 backdrop-blur-md rounded-full border border-brand-primary/5 shadow-sm">
          <AppVersion />
        </div>
      </div>
    </div>
  );
}
