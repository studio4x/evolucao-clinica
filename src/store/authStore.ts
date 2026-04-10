import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  googleAccessToken: string | null;
  isAuthReady: boolean;
  setUser: (user: User | null) => void;
  setGoogleAccessToken: (token: string | null) => void;
  setAuthReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      googleAccessToken: null,
      isAuthReady: false,
      setUser: (user) => set({ user }),
      setGoogleAccessToken: (token) => set({ googleAccessToken: token }),
      setAuthReady: (ready) => set({ isAuthReady: ready }),
    }),
    {
      name: 'auth-storage',
      // Only persist the googleAccessToken, as Firebase handles the user session
      partialize: (state) => ({ googleAccessToken: state.googleAccessToken }),
    }
  )
);
