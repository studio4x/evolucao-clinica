import { signInWithPopup, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider, db } from '../firebase';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';
import { Stethoscope } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { setGoogleAccessToken, setUser } = useAuthStore();

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setGoogleAccessToken(credential.accessToken);
      }

      const user = result.user;
      
      // Update store immediately to prevent ProtectedRoute from redirecting back
      setUser(user);
      
      // Check if professional exists, if not create
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

      navigate('/');
    } catch (error: any) {
      console.error('Login error:', error);
      if (error.code === 'auth/popup-closed-by-user') {
        // User closed the popup, no need to show an alert
        return;
      }
      alert(`Erro ao fazer login: ${error.message || error.code || 'Erro desconhecido'}`);
    }
  };

  return (
    <div className="min-h-screen bg-brand-bg flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <img src="/logo.svg" alt="Conexão Seres" className="h-24 w-auto" />
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
            className="btn-primary w-full py-3 text-base"
          >
            Entrar com Google
          </button>
          <p className="mt-6 text-xs text-center text-brand-text-muted">
            O aplicativo solicitará acesso ao seu Google Drive para salvar os prontuários.
          </p>
        </div>
      </div>
    </div>
  );
}
