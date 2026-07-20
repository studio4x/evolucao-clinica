const AUDIO_METADATA_TIMEOUT_MS = 5000;

/**
 * Lê a duração de uma URL de áudio, registrando os listeners antes de iniciar
 * o carregamento. Isso é importante no Android WebView, que pode disparar
 * `loadedmetadata` imediatamente para Blob URLs.
 */
export const getAudioDurationFromUrl = (url: string): Promise<number> => {
  return new Promise((resolve) => {
    const audio = document.createElement('audio');
    let settled = false;
    let seekRequested = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      audio.removeEventListener('loadedmetadata', handleMetadata);
      audio.removeEventListener('durationchange', handleMetadata);
      audio.removeEventListener('timeupdate', handleTimeUpdate);
      audio.removeEventListener('error', handleError);
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    };

    const finish = (duration: number) => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Number.isFinite(duration) && duration > 0 ? duration : 0);
    };

    const tryResolveDuration = () => {
      const duration = audio.duration;
      if (Number.isFinite(duration) && duration > 0) {
        finish(duration);
        return;
      }

      // Alguns WebViews reportam Infinity para WebM/Ogg até que o fim do
      // arquivo seja procurado.
      if (duration === Infinity && !seekRequested) {
        seekRequested = true;
        try {
          audio.currentTime = Number.MAX_SAFE_INTEGER;
        } catch {
          // O timeout/error handler finalizará com duração desconhecida.
        }
      }
    };

    const handleMetadata = () => tryResolveDuration();
    const handleTimeUpdate = () => tryResolveDuration();
    const handleError = () => finish(0);
    const timeoutId = window.setTimeout(() => finish(0), AUDIO_METADATA_TIMEOUT_MS);

    audio.preload = 'metadata';
    audio.addEventListener('loadedmetadata', handleMetadata);
    audio.addEventListener('durationchange', handleMetadata);
    audio.addEventListener('timeupdate', handleTimeUpdate);
    audio.addEventListener('error', handleError);
    audio.src = url;
    audio.load();
  });
};

export const getAudioDurationFromBlob = async (blob: Blob): Promise<number> => {
  const objectUrl = URL.createObjectURL(blob);
  try {
    return await getAudioDurationFromUrl(objectUrl);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
};
