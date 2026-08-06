import assert from 'node:assert/strict';
import { resolveHtmlAudioPauseTarget } from '../src/utils/audioWebViewCompatibility';

const nativeControl = {
  hasAttribute: (name: string) => name === 'data-native-audio-control',
  closest: () => {
    throw new Error('O controle nativo não deve procurar um elemento de áudio HTML.');
  }
};

assert.equal(
  resolveHtmlAudioPauseTarget(nativeControl),
  null,
  'O interceptador global não pode bloquear o clique do player nativo.'
);

const htmlAudio = { pause: () => undefined } as unknown as HTMLMediaElement;
const htmlControl = {
  hasAttribute: () => false,
  closest: (selector: string) => selector === '.space-y-2'
    ? { querySelector: (childSelector: string) => childSelector === 'audio' ? htmlAudio : null }
    : null
};

assert.equal(
  resolveHtmlAudioPauseTarget(htmlControl),
  htmlAudio,
  'O interceptador deve continuar protegendo o player HTML com fallback.'
);

console.log('Audio WebView compatibility tests passed.');
