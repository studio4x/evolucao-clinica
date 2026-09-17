import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  formatAvailablePlayStoreVersion,
  getUpdatePresentation,
  NATIVE_APP_UPDATE_EVENT,
  openGooglePlay,
  requestNativeAppUpdate
} from '../src/utils/androidAppUpdate';

const root = resolve(process.cwd());
const aboutCardSource = readFileSync(resolve(root, 'src/components/profile/AboutAppCard.tsx'), 'utf8');
const updateUtilitySource = readFileSync(resolve(root, 'src/utils/androidAppUpdate.ts'), 'utf8');
const bridgeSource = readFileSync(resolve(root, 'app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java'), 'utf8');
const gradleSource = readFileSync(resolve(root, 'app/build.gradle'), 'utf8');

assert.equal(getUpdatePresentation('checking').title, 'Verificando atualização...');
assert.equal(getUpdatePresentation('up_to_date').title, 'Seu aplicativo está atualizado');
assert.equal(getUpdatePresentation('update_available', 89).availableVersion, '1.0.89');
assert.match(getUpdatePresentation('unavailable').title, /Não foi possível verificar/);
assert.equal(NATIVE_APP_UPDATE_EVENT, 'native-app-update-status');
assert.equal(formatAvailablePlayStoreVersion(89), '1.0.89');

assert.match(updateUtilitySource, /Seu aplicativo está atualizado/);
assert.match(aboutCardSource, /Atualizar pela Google Play/);
assert.match(aboutCardSource, /Não foi possível verificar automaticamente/);
assert.match(aboutCardSource, /requestNativeAppUpdate/);
assert.match(bridgeSource, /public void checkForUpdate\(\)/);
assert.match(bridgeSource, /public void openPlayStore\(\)/);
assert.match(bridgeSource, /native-app-update-status/);
assert.match(bridgeSource, /UpdateAvailability\.UPDATE_AVAILABLE/);
assert.match(gradleSource, /com\.google\.android\.play:app-update:2\.1\.0/);
assert.doesNotMatch(gradleSource, /app-update-ktx/);

const originalWindow = globalThis.window;
let nativeCheckCalls = 0;
let nativeOpenCalls = 0;
Object.assign(globalThis, {
  window: {
    NativeAppInfoBridge: {
      checkForUpdate: () => { nativeCheckCalls += 1; },
      openPlayStore: () => { nativeOpenCalls += 1; }
    },
    matchMedia: () => ({ matches: false }),
    sessionStorage: { getItem: () => null },
    location: { assign: () => { throw new Error('web fallback must not run'); } }
  }
});
assert.equal(requestNativeAppUpdate(), true);
assert.equal(nativeCheckCalls, 1);
assert.equal(openGooglePlay(), 'native');
assert.equal(nativeOpenCalls, 1);

let fallbackUrl = '';
Object.assign(globalThis, {
  window: {
    NativeAppInfoBridge: {},
    matchMedia: () => ({ matches: false }),
    sessionStorage: { getItem: () => null },
    location: { assign: (url: string) => { fallbackUrl = url; } }
  }
});
assert.equal(requestNativeAppUpdate(), false);
assert.equal(openGooglePlay(), 'web');
assert.equal(fallbackUrl, 'https://play.google.com/store/apps/details?id=com.evolucaoclinica.app');
Object.assign(globalThis, { window: originalWindow });

console.log('android-app-update.test.ts: all assertions passed');
