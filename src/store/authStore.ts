import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { User } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  googleAccessToken: string | null;
  googleGrantedScopes: string[];
  isAuthReady: boolean;
  profileStatus: 'active' | 'pending' | 'inactive' | null;
  profileRole: 'admin' | 'therapist' | null;
  subscriptionPlan: 'trial' | 'monthly' | 'yearly' | 'none' | null;
  subscriptionStatus: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | null;
  subscriptionEndsAt: string | null;
  trialEndsAt: string | null;
  setUser: (user: User | null) => void;
  setGoogleAccessToken: (token: string | null) => void;
  setGoogleGrantedScopes: (scopes: string[]) => void;
  setAuthReady: (ready: boolean) => void;
  setProfileInfo: (
    status: 'active' | 'pending' | 'inactive' | null,
    role: 'admin' | 'therapist' | null,
    subscriptionPlan?: 'trial' | 'monthly' | 'yearly' | 'none' | null,
    subscriptionStatus?: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | null,
    subscriptionEndsAt?: string | null,
    trialEndsAt?: string | null
  ) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      googleAccessToken: null,
      googleGrantedScopes: [],
      isAuthReady: false,
      profileStatus: null,
      profileRole: null,
      subscriptionPlan: null,
      subscriptionStatus: null,
      subscriptionEndsAt: null,
      trialEndsAt: null,
      setUser: (user) => set({ user }),
      setGoogleAccessToken: (token) => set({ googleAccessToken: token }),
      setGoogleGrantedScopes: (googleGrantedScopes) => set({ googleGrantedScopes }),
      setAuthReady: (ready) => set({ isAuthReady: ready }),
      setProfileInfo: (status, role, subscriptionPlan = null, subscriptionStatus = null, subscriptionEndsAt = null, trialEndsAt = null) =>
        set({
          profileStatus: status,
          profileRole: role,
          subscriptionPlan,
          subscriptionStatus,
          subscriptionEndsAt,
          trialEndsAt,
        }),
    }),
    {
      name: 'auth-storage',
      // Persist Google auth state so we can preserve the latest access token and granted scopes.
      partialize: (state) => ({
        googleAccessToken: state.googleAccessToken,
        googleGrantedScopes: state.googleGrantedScopes,
      }),
    }
  )
);
