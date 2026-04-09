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
    <div className="min-h-screen bg-gray-50 flex flex-col justify-center py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="bg-blue-600 p-3 rounded-full">
            <Stethoscope className="w-10 h-10 text-white" />
          </div>
        </div>
        <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
          Evolução Clínica Gemini
        </h2>
        <p className="mt-2 text-center text-sm text-gray-600">
          Automatize suas evoluções com IA e Google Docs
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="bg-white py-8 px-4 shadow sm:rounded-lg sm:px-10">
          <button
            onClick={handleLogin}
            className="w-full flex justify-center py-3 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Entrar com Google
          </button>
          <p className="mt-4 text-xs text-center text-gray-500">
            O aplicativo solicitará acesso ao seu Google Drive para salvar os prontuários.
          </p>
        </div>
      </div>
    </div>
  );
}
