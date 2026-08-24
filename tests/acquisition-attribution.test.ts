import assert from 'node:assert/strict';
import {
  calculateAcquisitionChannel,
  hasAttributableSignal,
  isGenericAppFallback,
  isLikelyOAuthReturn,
  normalizeAcquisitionSource,
  resolveAcquisitionTouches,
  sanitizeTrackingUrl,
} from '../src/utils/acquisitionAttribution';
import { isValidWorkContext } from '../src/constants/professionalProfile';

assert.equal(normalizeAcquisitionSource('ig'), 'instagram');
assert.equal(normalizeAcquisitionSource('instagram'), 'instagram');
assert.equal(normalizeAcquisitionSource('fb'), 'facebook');
assert.equal(normalizeAcquisitionSource('facebook_ads'), 'meta');
assert.equal(normalizeAcquisitionSource('meta_ads'), 'meta');
assert.equal(normalizeAcquisitionSource('google_ads'), 'google');

assert.equal(
  calculateAcquisitionChannel({ utm_source: 'instagram', utm_medium: 'organic_social', fbclid: 'abc' }),
  'Instagram (Orgânico/Social)',
  'fbclid não deve transformar Instagram orgânico em mídia paga'
);

assert.equal(
  calculateAcquisitionChannel({ utm_source: 'meta', utm_medium: 'paid_social' }),
  'Meta Ads (Tráfego Pago)'
);

assert.equal(
  calculateAcquisitionChannel({ utm_source: 'ig', utm_medium: 'cpc' }),
  'Meta Ads (Instagram)'
);

assert.equal(
  calculateAcquisitionChannel({ utm_source: 'google', utm_medium: 'cpc' }),
  'Google Ads (Tráfego Pago)'
);

assert.equal(
  calculateAcquisitionChannel({ utm_source: 'google-play', utm_medium: 'organic', gclid: 'google-click' }),
  'Google Ads (Tráfego Pago)',
  'gclid deve prevalecer sobre a fonte genérica devolvida pelo Google Play'
);

assert.equal(
  calculateAcquisitionChannel({ fbclid: 'abc' }),
  'Meta / Facebook (Origem não determinada)',
  'fbclid isolado não deve ser rotulado como tráfego pago'
);

const sanitized = sanitizeTrackingUrl(
  'https://www.evolucaoclinica.app.br/login?utm_source=instagram&utm_medium=paid_social&code=SECRET&access_token=TOKEN&fbclid=CLICK#access_token=HASH'
);
assert.ok(sanitized);
assert.match(sanitized!, /utm_source=instagram/);
assert.match(sanitized!, /utm_medium=paid_social/);
assert.match(sanitized!, /fbclid=CLICK/);
assert.doesNotMatch(sanitized!, /SECRET/);
assert.doesNotMatch(sanitized!, /TOKEN/);
assert.doesNotMatch(sanitized!, /access_token/);

assert.equal(isLikelyOAuthReturn('https://app.test/login?code=abc', ''), true);
assert.equal(isLikelyOAuthReturn('https://app.test/login', 'https://accounts.google.com/'), true);
assert.equal(isLikelyOAuthReturn('https://app.test/login?utm_source=instagram', ''), false);

assert.equal(hasAttributableSignal({ landing_page: 'https://app.test/' }), false);
assert.equal(hasAttributableSignal({ utm_source: 'instagram' }), true);
assert.equal(isGenericAppFallback({ utm_source: 'pwa' }), true);
assert.equal(isGenericAppFallback({ utm_source: 'pwa', gclid: 'google-click' }), false);

const firstTouch = { utm_source: 'google', channel: 'Google (Busca Orgânica)' };
const laterTouch = { utm_source: 'meta', utm_medium: 'paid_social', channel: 'Meta Ads (Tráfego Pago)' };
const resolvedLater = resolveAcquisitionTouches({
  existingFirstTouch: firstTouch,
  existingCurrentTouch: firstTouch,
  candidate: laterTouch,
  returningFromOAuth: false,
});
assert.deepEqual(resolvedLater.firstTouch, firstTouch, 'first touch não pode ser sobrescrito');
assert.deepEqual(resolvedLater.currentTouch, laterTouch, 'nova sessão deve atualizar o touch atual');

const oauthReturn = { landing_page: 'https://app.test/login', channel: 'Tráfego Direto' };
const resolvedOAuth = resolveAcquisitionTouches({
  existingFirstTouch: firstTouch,
  existingCurrentTouch: laterTouch,
  candidate: oauthReturn,
  returningFromOAuth: true,
});
assert.deepEqual(resolvedOAuth.currentTouch, laterTouch, 'retorno OAuth deve preservar a origem pré-login');

const pwaFallback = { utm_source: 'pwa', channel: 'Aplicativo PWA / Android' };
const installReferrerTouch = {
  utm_source: 'google',
  utm_medium: 'cpc',
  gclid: 'google-click',
  channel: 'Google Ads (Tráfego Pago)'
};
const resolvedInstallReferrer = resolveAcquisitionTouches({
  existingFirstTouch: pwaFallback,
  existingCurrentTouch: pwaFallback,
  candidate: installReferrerTouch,
  returningFromOAuth: false,
});
assert.deepEqual(
  resolvedInstallReferrer.firstTouch,
  installReferrerTouch,
  'Install Referrer deve substituir somente o fallback genérico pwa'
);

const resolvedPwaReopen = resolveAcquisitionTouches({
  existingFirstTouch: installReferrerTouch,
  existingCurrentTouch: installReferrerTouch,
  candidate: pwaFallback,
  returningFromOAuth: false,
});
assert.deepEqual(resolvedPwaReopen.firstTouch, installReferrerTouch, 'pwa não deve apagar o first touch atribuído');
assert.deepEqual(resolvedPwaReopen.currentTouch, installReferrerTouch, 'pwa não deve apagar o signup touch atribuído');

assert.equal(isValidWorkContext('independent'), true);
assert.equal(isValidWorkContext('clinic_professional'), true);
assert.equal(isValidWorkContext('clinic_owner_manager'), true);
assert.equal(isValidWorkContext('other'), true);
assert.equal(isValidWorkContext('admin'), false);

console.log('acquisition-attribution.test.ts: OK');
