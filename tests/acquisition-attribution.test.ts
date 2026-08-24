import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  calculateAcquisitionChannel,
  getAcquisitionChannelLabel,
  getAcquisitionDistribution,
  getAcquisitionPlatform,
  hasAttributableSignal,
  isGenericAppFallback,
  isLikelyOAuthReturn,
  normalizeAcquisitionCandidate,
  normalizeAcquisitionSource,
  resolveAcquisitionTouches,
  sanitizeTrackingUrl,
  shouldPersistFirstTouch,
  shouldPersistSignupTouch,
  type AcquisitionData,
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
assert.equal(calculateAcquisitionChannel({ utm_source: 'meta', utm_medium: 'paid_social' }), 'Meta Ads (Tráfego Pago)');
assert.equal(calculateAcquisitionChannel({ utm_source: 'ig', utm_medium: 'cpc' }), 'Meta Ads (Instagram)');
assert.equal(calculateAcquisitionChannel({ utm_source: 'google', utm_medium: 'cpc' }), 'Google Ads (Tráfego Pago)');
assert.equal(
  calculateAcquisitionChannel({ utm_source: 'google-play', utm_medium: 'organic', gclid: 'google-click' }),
  'Google Ads (Tráfego Pago)',
  'gclid deve prevalecer sobre o marcador técnico do Google Play'
);
assert.equal(calculateAcquisitionChannel({ fbclid: 'abc' }), 'Meta / Facebook (Origem não determinada)');
assert.equal(calculateAcquisitionChannel({ utm_source: 'pwa' }), 'Origem não informada');
assert.equal(getAcquisitionChannelLabel({ utm_source: 'android', channel: 'Aplicativo PWA / Android' }), 'Origem não informada');

const sanitized = sanitizeTrackingUrl(
  'https://www.evolucaoclinica.app.br/login?utm_source=instagram&utm_medium=paid_social&code=SECRET&access_token=TOKEN&fbclid=CLICK&gclid=GOOGLE#access_token=HASH'
);
assert.ok(sanitized);
assert.match(sanitized!, /utm_source=instagram/);
assert.match(sanitized!, /utm_medium=paid_social/);
assert.match(sanitized!, /fbclid=CLICK/);
assert.match(sanitized!, /gclid=GOOGLE/);
assert.doesNotMatch(sanitized!, /SECRET|TOKEN|access_token/);

assert.equal(isLikelyOAuthReturn('https://app.test/login?code=abc', ''), true);
assert.equal(isLikelyOAuthReturn('https://app.test/login', 'https://accounts.google.com/'), true);
assert.equal(isLikelyOAuthReturn('https://app.test/login?utm_source=instagram', ''), false);

assert.equal(hasAttributableSignal({ landing_page: 'https://app.test/' }), false);
assert.equal(hasAttributableSignal({ utm_source: 'instagram' }), true);
assert.equal(hasAttributableSignal({ utm_source: 'direct' }), false);
assert.equal(hasAttributableSignal({ utm_source: 'pwa' }), false);
assert.equal(isGenericAppFallback({ utm_source: 'pwa' }), true);
assert.equal(isGenericAppFallback({ utm_source: 'pwa', gclid: 'google-click' }), false);

const technicalPwa = normalizeAcquisitionCandidate({
  utm_source: 'pwa',
  landing_page: 'https://app.test/login?utm_source=pwa',
  platform: 'pwa',
});
assert.equal(technicalPwa.utm_source, undefined, 'pwa não pode sobreviver como origem de marketing');
assert.equal(technicalPwa.channel, 'Tráfego Direto');
assert.equal(technicalPwa.platform, 'pwa');

const technicalPlayWithAds = normalizeAcquisitionCandidate({
  utm_source: 'google-play',
  utm_medium: 'organic',
  gclid: 'google-click',
  platform: 'android',
  distribution: 'google_play',
});
assert.equal(technicalPlayWithAds.utm_source, undefined);
assert.equal(technicalPlayWithAds.utm_medium, undefined);
assert.equal(technicalPlayWithAds.channel, 'Google Ads (Tráfego Pago)');
assert.equal(calculateAcquisitionChannel({ utm_source: 'google-play', utm_medium: 'organic' }), 'Origem não informada');

const metaA: AcquisitionData = {
  utm_source: 'meta',
  utm_medium: 'paid_social',
  utm_campaign: 'meta_a',
  utm_content: 'reels2',
  fbclid: 'meta-click',
  channel: 'Meta Ads (Tráfego Pago)',
  platform: 'web',
};
const metaB: AcquisitionData = { ...metaA, utm_campaign: 'meta_b', utm_content: 'story_b', fbclid: 'meta-b-click' };
const googleA: AcquisitionData = {
  utm_source: 'google',
  utm_medium: 'cpc',
  utm_campaign: 'google_a',
  utm_term: 'prontuario',
  utm_content: 'ad1',
  gclid: 'google-click',
  channel: 'Google Ads (Tráfego Pago)',
  platform: 'web',
};
const googleB: AcquisitionData = { ...googleA, utm_campaign: 'google_b', utm_content: 'ad2', gclid: 'google-b-click' };
const pwaDirect: AcquisitionData = {
  channel: 'Tráfego Direto',
  landing_page: 'https://app.test/login',
  first_seen_at: '2026-08-24T12:00:00.000Z',
  attribution_method: 'url',
  platform: 'pwa',
};

const metaToPwa = resolveAcquisitionTouches({
  existingFirstTouch: metaA,
  existingCurrentTouch: metaA,
  candidate: pwaDirect,
  returningFromOAuth: false,
});
assert.deepEqual(metaToPwa.firstTouch, metaA);
assert.equal(metaToPwa.currentTouch.utm_source, 'meta');
assert.equal(metaToPwa.currentTouch.utm_campaign, 'meta_a');
assert.equal(metaToPwa.currentTouch.fbclid, 'meta-click');
assert.equal(metaToPwa.currentTouch.platform, 'pwa');

const googleToPwa = resolveAcquisitionTouches({
  existingFirstTouch: googleA,
  existingCurrentTouch: googleA,
  candidate: pwaDirect,
  returningFromOAuth: false,
});
assert.deepEqual(googleToPwa.firstTouch, googleA);
assert.equal(googleToPwa.currentTouch.utm_source, 'google');
assert.equal(googleToPwa.currentTouch.utm_term, 'prontuario');
assert.equal(googleToPwa.currentTouch.gclid, 'google-click');
assert.equal(googleToPwa.currentTouch.platform, 'pwa');

const metaToGoogle = resolveAcquisitionTouches({
  existingFirstTouch: metaA,
  existingCurrentTouch: metaA,
  candidate: googleA,
  returningFromOAuth: false,
});
assert.deepEqual(metaToGoogle.firstTouch, metaA);
assert.deepEqual(metaToGoogle.currentTouch, googleA);

const googleToMeta = resolveAcquisitionTouches({
  existingFirstTouch: googleA,
  existingCurrentTouch: googleA,
  candidate: metaA,
  returningFromOAuth: false,
});
assert.deepEqual(googleToMeta.firstTouch, googleA);
assert.deepEqual(googleToMeta.currentTouch, metaA);

assert.deepEqual(resolveAcquisitionTouches({
  existingFirstTouch: metaA,
  existingCurrentTouch: metaA,
  candidate: metaB,
  returningFromOAuth: false,
}).currentTouch, metaB);
assert.deepEqual(resolveAcquisitionTouches({
  existingFirstTouch: googleA,
  existingCurrentTouch: googleA,
  candidate: googleB,
  returningFromOAuth: false,
}).currentTouch, googleB);

const directPwaFirst = resolveAcquisitionTouches({ candidate: pwaDirect, returningFromOAuth: false });
assert.deepEqual(directPwaFirst.firstTouch, pwaDirect);
assert.deepEqual(directPwaFirst.currentTouch, pwaDirect);
assert.equal(directPwaFirst.currentTouch.utm_source, undefined);

const nativeDirect: AcquisitionData = { ...pwaDirect, platform: 'android' };
const nativeGoogleAds: AcquisitionData = {
  ...googleA,
  platform: 'android',
  distribution: 'google_play',
  attribution_method: 'google_play_install_referrer',
};
const resolvedNativeInstall = resolveAcquisitionTouches({
  existingFirstTouch: nativeDirect,
  existingCurrentTouch: nativeDirect,
  candidate: nativeGoogleAds,
  returningFromOAuth: false,
});
assert.deepEqual(resolvedNativeInstall.firstTouch, nativeGoogleAds, 'Install Referrer resolve o first touch provisório do Android');
assert.deepEqual(resolvedNativeInstall.currentTouch, nativeGoogleAds);

const oauthAndroid = resolveAcquisitionTouches({
  existingFirstTouch: metaA,
  existingCurrentTouch: metaA,
  candidate: { ...pwaDirect, platform: 'android' },
  returningFromOAuth: true,
});
assert.equal(oauthAndroid.currentTouch.utm_source, 'meta');
assert.equal(oauthAndroid.currentTouch.fbclid, 'meta-click');
assert.equal(oauthAndroid.currentTouch.platform, 'android');

const reload = resolveAcquisitionTouches({
  existingFirstTouch: googleA,
  existingCurrentTouch: googleA,
  candidate: { ...pwaDirect, platform: 'web' },
  returningFromOAuth: false,
});
assert.deepEqual(reload.firstTouch, googleA);
assert.deepEqual(reload.currentTouch, googleA, 'reload direto não deve alterar origem nem first_seen_at');

const historicalPwa: AcquisitionData = { utm_source: 'pwa', channel: 'Aplicativo PWA / Android' };
assert.equal(getAcquisitionPlatform(historicalPwa), 'pwa');
assert.equal(getAcquisitionDistribution({ attribution_method: 'google_play_install_referrer' }), 'google_play');
assert.equal(shouldPersistFirstTouch(historicalPwa, metaA), true);
assert.equal(shouldPersistFirstTouch(historicalPwa, pwaDirect), false, 'não há backfill histórico especulativo');
assert.equal(shouldPersistFirstTouch(metaA, googleA), false, 'first touch válido é imutável no banco');
assert.equal(shouldPersistFirstTouch(nativeDirect, nativeGoogleAds), true, 'atribuição oficial da instalação resolve o first touch Android');
assert.equal(shouldPersistSignupTouch(historicalPwa, googleA), true);
assert.equal(shouldPersistSignupTouch(metaA, googleA), false, 'signup touch já gravado não é reescrito após o cadastro');

const sourceFiles = [
  readFileSync('server.ts', 'utf8'),
  readFileSync('twa-manifest.json', 'utf8'),
  readFileSync('app/build.gradle', 'utf8'),
  readFileSync('app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java', 'utf8'),
  readFileSync('app/src/main/res/raw/web_app_manifest.json', 'utf8'),
];
for (const source of sourceFiles) {
  assert.doesNotMatch(source, /utm_source=pwa/, 'nenhuma URL inicial pode fabricar origem pwa');
}

const professionalDetailsSource = readFileSync('src/components/admin/ProfessionalDetailsModal.tsx', 'utf8');
const adminPanelSource = readFileSync('src/pages/AdminPanel.tsx', 'utf8');
for (const source of [professionalDetailsSource, adminPanelSource]) {
  assert.match(source, /Plataforma/);
  assert.match(source, /Distribuição/);
  assert.match(source, /FBCLID/);
  assert.match(source, /GCLID/);
}

assert.equal(isValidWorkContext('independent'), true);
assert.equal(isValidWorkContext('clinic_professional'), true);
assert.equal(isValidWorkContext('clinic_owner_manager'), true);
assert.equal(isValidWorkContext('other'), true);
assert.equal(isValidWorkContext('admin'), false);

console.log('acquisition-attribution.test.ts: OK');
