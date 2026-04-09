import { create } from 'zustand';
import { User } from 'firebase/auth';

interface AuthState {
  user: User | null;
  googleAccessToken: string | null;
  isAuthReady: boolean;
  setUser: (user: User | null) => void;
  setGoogleAccessToken: (token: string | null) => void;
  setAuthReady: (ready: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  googleAccessToken: null,
  isAuthReady: false,
  setUser: (user) => set({ user }),
  setGoogleAccessToken: (token) => set({ googleAccessToken: token }),
  setAuthReady: (ready) => set({ isAuthReady: ready }),
}));
