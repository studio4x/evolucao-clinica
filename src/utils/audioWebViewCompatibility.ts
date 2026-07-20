type AudioCompatibleWindow = Window & typeof globalThis & {
  __evolucaoAudioCompatibilityInstalled?: boolean;
  __evolucaoActiveFallbackSources?: Set<AudioBufferSourceNode>;
};

type CompatibleMediaPrototype = typeof HTMLMediaElement.prototype & {
  __evolucaoNativePlay?: typeof HTMLMediaElement.prototype.play;
};

type CompatibleAudioContextPrototype = typeof AudioContext.prototype & {
  __evolucaoNativeCreateBufferSource?: typeof AudioContext.prototype.createBufferSource;
};

const pauseRequestedMedia = new WeakSet<HTMLMediaElement>();

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
 *    duplicado. A rejeição só é propagada depois de um pequeno período de
 *    confirmação.
 * 3. Quando o fallback via AudioContext está ativo, o elemento `<audio>` pode
 *    continuar com `paused = true`. O botão de pausa então tentava reproduzir
 *    novamente e criava várias fontes simultâneas. Todas as fontes alternativas
 *    são rastreadas e interrompidas antes que esse clique chegue ao React.
 */
export const installWebViewAudioCompatibility = () => {
  const compatibleWindow = window as AudioCompatibleWindow;

  if (compatibleWindow.__evolucaoAudioCompatibilityInstalled) return;
  compatibleWindow.__evolucaoAudioCompatibilityInstalled = true;

  const NativeAudio = compatibleWindow.Audio;

  const CompatibleAudio = function (this: HTMLAudioElement, src?: string): HTMLAudioElement {
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

  const activeFallbackSources = compatibleWindow.__evolucaoActiveFallbackSources
    || new Set<AudioBufferSourceNode>();
  compatibleWindow.__evolucaoActiveFallbackSources = activeFallbackSources;

  const stopFallbackSources = () => {
    for (const source of Array.from(activeFallbackSources)) {
      try {
        source.stop();
      } catch {
        // A fonte pode já ter terminado ou sido interrompida anteriormente.
      }
      activeFallbackSources.delete(source);
    }
  };

  const AudioContextConstructor = compatibleWindow.AudioContext
    || (compatibleWindow as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

  if (AudioContextConstructor) {
    const contextPrototype = AudioContextConstructor.prototype as CompatibleAudioContextPrototype;

    if (!contextPrototype.__evolucaoNativeCreateBufferSource) {
      const nativeCreateBufferSource = contextPrototype.createBufferSource;
      Object.defineProperty(contextPrototype, '__evolucaoNativeCreateBufferSource', {
        configurable: false,
        enumerable: false,
        writable: false,
        value: nativeCreateBufferSource,
      });

      contextPrototype.createBufferSource = function (this: AudioContext): AudioBufferSourceNode {
        const source = nativeCreateBufferSource.call(this);
        activeFallbackSources.add(source);
        source.addEventListener('ended', () => activeFallbackSources.delete(source), { once: true });
        return source;
      };
    }
  }

  const mediaPrototype = HTMLMediaElement.prototype as CompatibleMediaPrototype;
  if (!mediaPrototype.__evolucaoNativePlay) {
    const nativePlay = mediaPrototype.play;
    Object.defineProperty(mediaPrototype, '__evolucaoNativePlay', {
      configurable: false,
      enumerable: false,
      writable: false,
      value: nativePlay,
    });

    mediaPrototype.play = function (this: HTMLMediaElement): Promise<void> {
      pauseRequestedMedia.delete(this);

      let result: Promise<void>;

      try {
        result = nativePlay.call(this);
      } catch (error) {
        return Promise.reject(error);
      }

      if (!result || typeof result.catch !== 'function') {
        return Promise.resolve();
      }

      return result.catch(async (error) => {
        // O Android WebView às vezes rejeita antes de atualizar `paused` e
        // `readyState`. Damos uma breve janela para confirmar o estado real.
        await new Promise((resolve) => window.setTimeout(resolve, 250));

        if (pauseRequestedMedia.has(this)) return;
        if (!this.paused || this.currentTime > 0 || this.readyState >= 2) return;

        throw error;
      });
    };
  }

  document.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const pauseButton = target?.closest('button[aria-label="Pausar áudio"]');
    if (!pauseButton) return;

    // Interrompe o handler React antes que ele consulte `audio.paused` e conclua
    // incorretamente que deve iniciar uma nova reprodução.
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    const audioContainer = pauseButton.closest('.space-y-2');
    const audio = audioContainer?.querySelector('audio');

    if (audio) {
      pauseRequestedMedia.add(audio);
      audio.pause();
      audio.dispatchEvent(new Event('ended'));

      // Evita que uma Promise de play ainda pendente restaure o estado visual.
      window.setTimeout(() => audio.dispatchEvent(new Event('ended')), 350);
    }

    stopFallbackSources();
  }, true);
};
