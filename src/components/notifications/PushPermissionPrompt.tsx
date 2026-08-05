import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { BellRing, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { useAuthStore } from '../../store/authStore';

interface NativePushBridge {
  isAvailable?: () => boolean;
  isPermissionGranted?: () => boolean;
  requestToken?: () => void;
  deleteToken?: () => void;
}

declare global {
  interface Window {
    NativePushBridge?: NativePushBridge;
  }
}

const NATIVE_PUSH_ENABLED_KEY = 'evolucao-clinica:native-push-enabled';
const PROMPT_DELAY_MS = 30_000;

const dismissedKey = (userId: string) => `evolucao-clinica:push-prompt-dismissed:${userId}`;

const urlBase64ToUint8Array = (base64String: string) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let index = 0; index < rawData.length; index += 1) {
    outputArray[index] = rawData.charCodeAt(index);
  }
  return outputArray;
};

export const PushPermissionPrompt = () => {
  const user = useAuthStore((state) => state.user);
  const location = useLocation();
  const [isOpen, setIsOpen] = useState(false);
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const isAuthenticatedArea = location.pathname.startsWith('/painel') || location.pathname.startsWith('/admin');

  useEffect(() => {
    if (!user || !isAuthenticatedArea) return;

    let cancelled = false;
    let promptTimer: number | undefined;

    const shouldPromptForPush = async () => {
      if (window.localStorage.getItem(dismissedKey(user.id)) === 'true') return false;

      const nativePush = window.NativePushBridge;
      if (nativePush?.isAvailable?.()) {
        return !(
          nativePush.isPermissionGranted?.() === true
          && window.localStorage.getItem(NATIVE_PUSH_ENABLED_KEY) === 'true'
        );
      }

      if (!('serviceWorker' in navigator) || !('PushManager' in window) || Notification.permission === 'denied') {
        return false;
      }

      try {
        const registration = await navigator.serviceWorker.ready;
        return !(await registration.pushManager.getSubscription());
      } catch (error) {
        console.warn('[PushPrompt] Não foi possível consultar a inscrição push.', error);
        return false;
      }
    };

    void shouldPromptForPush().then((shouldPrompt) => {
      if (!shouldPrompt || cancelled) return;
      promptTimer = window.setTimeout(() => {
        if (!cancelled) setIsOpen(true);
      }, PROMPT_DELAY_MS);
    });

    return () => {
      cancelled = true;
      if (promptTimer !== undefined) window.clearTimeout(promptTimer);
    };
  }, [user, isAuthenticatedArea]);

  useEffect(() => {
    if (!isOpen) return;

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  const registerNativeToken = async (token: string) => {
    const session = await supabase.auth.getSession();
    const accessToken = session.data.session?.access_token;
    const response = await fetch('/api/notifications/subscribe', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ provider: 'fcm', token })
    });
    if (!response.ok) throw new Error('Não foi possível registrar este dispositivo para notificações.');
    window.localStorage.setItem(NATIVE_PUSH_ENABLED_KEY, 'true');
  };

  const activatePush = async () => {
    if (!user) return;

    setIsActivating(true);
    setActivationError(null);
    try {
      const nativePush = window.NativePushBridge;
      if (nativePush?.isAvailable?.()) {
        if (!nativePush.isPermissionGranted?.()) {
          throw new Error('Permita as notificações nas configurações do aplicativo e tente novamente.');
        }

        await new Promise<void>((resolve, reject) => {
          const timeout = window.setTimeout(() => {
            window.removeEventListener('native-push-token', onToken);
            reject(new Error('Tempo excedido ao registrar o dispositivo para notificações.'));
          }, 15_000);
          const onToken = (event: Event) => {
            const token = (event as CustomEvent<{ token?: string }>).detail?.token;
            if (!token) return;
            window.clearTimeout(timeout);
            window.removeEventListener('native-push-token', onToken);
            void registerNativeToken(token).then(resolve).catch(reject);
          };
          window.addEventListener('native-push-token', onToken);
          nativePush.requestToken?.();
        });
      } else {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') throw new Error('Permissão de notificações não concedida.');

        const keyResponse = await fetch('/api/notifications/vapid-public-key', { cache: 'no-store' });
        const { publicKey } = await keyResponse.json();
        if (!publicKey) throw new Error('Não foi possível preparar as notificações deste navegador.');

        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(String(publicKey).trim())
        });
        const session = await supabase.auth.getSession();
        const accessToken = session.data.session?.access_token;
        const response = await fetch('/api/notifications/subscribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`
          },
          body: JSON.stringify({ subscription })
        });
        if (!response.ok) throw new Error('Não foi possível registrar este navegador para notificações.');
      }

      setIsOpen(false);
    } catch (error: any) {
      console.error('[PushPrompt] Falha ao ativar notificações.', error);
      setActivationError(error?.message || 'Não foi possível ativar as notificações agora.');
    } finally {
      setIsActivating(false);
    }
  };

  const dismissPermanently = () => {
    if (user) window.localStorage.setItem(dismissedKey(user.id), 'true');
    setIsOpen(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-950/55 p-4 backdrop-blur-sm" onClick={() => setIsOpen(false)}>
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-permission-title"
        className="w-full max-w-md overflow-hidden rounded-3xl border border-brand-border bg-white shadow-2xl"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start gap-4 border-b border-brand-border bg-brand-bg/40 px-5 py-5 sm:px-6">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary">
            <BellRing size={25} />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-1 text-[10px] font-bold uppercase tracking-[0.16em] text-brand-primary">Fique por dentro</p>
            <h2 id="push-permission-title" className="text-xl font-display font-bold leading-tight text-brand-text">Ative as notificações</h2>
          </div>
          <button type="button" onClick={() => setIsOpen(false)} className="rounded-xl p-2 text-brand-text-muted transition-colors hover:bg-white hover:text-brand-text" aria-label="Fechar convite de notificações">
            <X size={20} />
          </button>
        </div>

        <div className="space-y-4 px-5 py-6 sm:px-6">
          <p className="text-sm leading-relaxed text-brand-text-muted">
            Receba avisos importantes, atualizações e lembretes mesmo quando o aplicativo estiver fechado.
          </p>
          <div className="flex gap-3 rounded-2xl border border-brand-primary/15 bg-brand-primary/5 p-3.5 text-xs leading-relaxed text-brand-text-muted">
            <ShieldCheck size={18} className="mt-0.5 shrink-0 text-brand-primary" />
            <span>Você pode desativar as notificações a qualquer momento na página de notificações.</span>
          </div>
          {activationError && (
            <p role="alert" className="rounded-xl border border-red-100 bg-red-50 px-3 py-2.5 text-xs leading-relaxed text-red-700">
              {activationError}
            </p>
          )}
        </div>

        <div className="space-y-3 border-t border-brand-border bg-brand-bg/25 px-5 py-4 sm:px-6">
          <button
            type="button"
            onClick={() => void activatePush()}
            disabled={isActivating}
            className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-brand-primary-hover disabled:cursor-not-allowed disabled:opacity-70"
          >
            {isActivating ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
            <span>{isActivating ? 'Ativando notificações...' : 'Ativar notificações'}</span>
          </button>
          <button type="button" onClick={dismissPermanently} className="w-full px-4 py-1 text-xs font-medium text-brand-text-muted underline-offset-2 transition-colors hover:text-brand-text hover:underline">
            Não ativar e não mostrar novamente
          </button>
        </div>
      </section>
    </div>
  );
};
