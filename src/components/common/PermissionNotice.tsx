import React, { useEffect, useState } from 'react';
import { Mic, ShieldCheck, X } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { hasRememberedMicrophonePermission, rememberMicrophonePermission } from '../../utils/microphonePermission';

type MicrophonePermissionState = PermissionState | 'unavailable';

const getMicrophonePermission = async (): Promise<MicrophonePermissionState> => {
  if (!navigator.mediaDevices?.getUserMedia) return 'unavailable';

  try {
    const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    return permission.state;
  } catch {
    return 'prompt';
  }
};

export const PermissionNotice = () => {
  const { user, isAuthReady } = useAuthStore();
  const [permission, setPermission] = useState<MicrophonePermissionState>('prompt');
  const [isOpen, setIsOpen] = useState(false);
  const [isRequesting, setIsRequesting] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  useEffect(() => {
    if (!isAuthReady || !user) {
      setIsOpen(false);
      return;
    }

    if (hasRememberedMicrophonePermission()) {
      setPermission('granted');
      setIsOpen(false);
      return;
    }

    let isMounted = true;
    void getMicrophonePermission().then((nextPermission) => {
      if (!isMounted) return;
      setPermission(nextPermission);
      setIsOpen(nextPermission !== 'granted' && nextPermission !== 'unavailable');
      if (nextPermission === 'granted') rememberMicrophonePermission();
    });

    return () => {
      isMounted = false;
    };
  }, [isAuthReady, user]);

  const requestMicrophonePermission = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setErrorMessage('Este navegador não oferece suporte à gravação de áudio. Abra o app no Chrome ou Edge atualizado.');
      return;
    }

    setIsRequesting(true);
    setErrorMessage('');

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      rememberMicrophonePermission();
      setPermission('granted');
      setIsOpen(false);
    } catch (error) {
      console.error('Não foi possível solicitar a permissão do microfone:', error);
      setPermission('denied');
      setErrorMessage(
        'A permissão não foi liberada. Abra as configurações do navegador, permita o microfone para www.evolucaoclinica.app.br e tente novamente.'
      );
    } finally {
      setIsRequesting(false);
    }
  };

  if (!isOpen || permission === 'unavailable') return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 py-6" role="dialog" aria-modal="true" aria-labelledby="permission-notice-title">
      <div className="relative w-full max-w-md rounded-3xl bg-white p-6 shadow-2xl">
        <button type="button" onClick={() => setIsOpen(false)} className="absolute right-4 top-4 rounded-full p-2 text-brand-text-muted transition hover:bg-brand-surface hover:text-brand-text" aria-label="Fechar aviso">
          <X size={20} />
        </button>
        <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-primary/10 text-brand-primary"><Mic size={28} /></div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-brand-primary">Permissão necessária</p>
        <h2 id="permission-notice-title" className="pr-8 text-xl font-semibold text-brand-text">Libere o microfone para gravar evoluções</h2>
        <p className="mt-3 text-sm leading-6 text-brand-text-muted">A gravação é usada somente quando você cria uma evolução. Toque em “Permitir microfone” e autorize o acesso para este site no navegador.</p>
        <div className="mt-5 flex gap-3 rounded-2xl border border-brand-border bg-brand-surface/60 p-4 text-sm text-brand-text-muted"><ShieldCheck className="mt-0.5 shrink-0 text-brand-primary" size={19} /><span>O áudio só é capturado durante uma gravação iniciada por você.</span></div>
        {errorMessage && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm leading-5 text-red-700" role="alert">{errorMessage}</p>}
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <button type="button" onClick={() => setIsOpen(false)} className="rounded-xl px-4 py-3 text-sm font-medium text-brand-text-muted transition hover:bg-brand-surface">Agora não</button>
          <button type="button" onClick={() => void requestMicrophonePermission()} disabled={isRequesting} className="rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white transition hover:bg-brand-primary/90 disabled:cursor-wait disabled:opacity-60">{isRequesting ? 'Solicitando...' : 'Permitir microfone'}</button>
        </div>
      </div>
    </div>
  );
};
