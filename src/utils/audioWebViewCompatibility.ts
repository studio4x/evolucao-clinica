type AudioCompatibleWindow = Window & typeof globalThis & {
  __evolucaoAudioCompatibilityInstalled?: boolean;
};

type CompatibleMediaPrototype = typeof HTMLMediaElement.prototype & {
  __evolucaoNativePlay?: typeof HTMLMediaElement.prototype.play;
};

/**
 * Corrige particularidades do elemento de áudio no Android WebView.
 *
 * 1. Alguns WebViews podem carregar metadados de uma Blob URL antes de o
 *    chamador registrar o listener de `loadedmetadata`. Criamos o elemento sem
 *    `src` e iniciamos o carregamento na microtask seguinte, garantindo que os
 *    listeners já estejam ativos.
 * 2. Em determinadas versões do WebView, `play()` pode rejeitar a Promise mesmo
 *    depois de a reprodução ter começado. O fluxo de evolução interpreta essa
 *    rejeição como falha e aciona um fallback via AudioContext, produzindo som
 *    duplicado. Quando o elemento já está tocando, normalizamos essa rejeição.
 */
export const installWebViewAudioCompatibility = () => {
  const compatibleWindow = window as AudioCompatibleWindow;

  if (compatibleWindow.__evolucaoAudioCompatibilityInstalled) return;
  compatibleWindow.__evolucaoAudioCompatibilityInstalled = true;

  const NativeAudio = compatibleWindow.Audio;

  const CompatibleAudio = function (_this: HTMLAudioElement, src?: string): HTMLAudioElement {
    const audio = new NativeAudio();

    if (src) {
      queueMicrotask(() => {
        // Respeita qualquer URL definida manualmente logo após a construção.
        if (audio.getAttribute('src')) return;

        audio.preload = audio.preload || 'metadata';
        audio.src = src;

        try {
          audio.load();
        } catch (error) {
          console.warn('[Audio] Não foi possível forçar o carregamento dos metadados.', error);
        }
      });
    }

    return audio;
  } as unknown as typeof Audio;

  CompatibleAudio.prototype = NativeAudio.prototype;
  Object.setPrototypeOf(CompatibleAudio, NativeAudio);
  compatibleWindow.Audio = CompatibleAudio;

  const mediaPrototype = HTMLMediaElement.prototype as CompatibleMediaPrototype;
  if (mediaPrototype.__evolucaoNativePlay) return;

  const nativePlay = mediaPrototype.play;
  Object.defineProperty(mediaPrototype, '__evolucaoNativePlay', {
    configurable: false,
    enumerable: false,
    writable: false,
    value: nativePlay,
  });

  mediaPrototype.play = function (this: HTMLMediaElement): Promise<void> {
    let result: Promise<void>;

    try {
      result = nativePlay.call(this);
    } catch (error) {
      return Promise.reject(error);
    }

    if (!result || typeof result.catch !== 'function') {
      return Promise.resolve();
    }

    return result.catch((error) => {
      // readyState >= 2 equivale a HAVE_CURRENT_DATA. Se o elemento não está
      // pausado, o WebView já iniciou a reprodução e não devemos acionar outro
      // player como fallback.
      if (!this.paused && this.readyState >= 2) {
        return;
      }

      throw error;
    });
  };
};
