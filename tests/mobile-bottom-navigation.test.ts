import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');
const cssSource = readFileSync('src/index.css', 'utf8');
const launcherSource = readFileSync('app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java', 'utf8');
const appVersionSource = readFileSync('src/components/layout/AppVersion.tsx', 'utf8');
const gradleSource = readFileSync('app/build.gradle', 'utf8');
const twaManifestSource = readFileSync('twa-manifest.json', 'utf8');

assert.match(layoutSource, /app-mobile-bottom-nav[^\"]*fixed/, 'a navegação mobile deve continuar fixed');
assert.match(layoutSource, /app-mobile-bottom-nav[^\"]*md:hidden/, 'a navegação deve continuar exclusiva do mobile');
assert.match(layoutSource, /app-main-content/, 'o conteúdo deve reservar espaço para a bottom nav');
assert.match(layoutSource, /app-mobile-menu-content/, 'o drawer deve reservar espaço seguro para o último item');
assert.doesNotMatch(layoutSource, /pb-safe/, 'a navegação e o drawer não podem depender de pb-safe');
for (const label of ['Início', 'Pacientes', 'Histórico', 'Notif.', 'Mais']) {
  assert.match(layoutSource, new RegExp(`name: '${label.replace('.', '\\.')}'`), `item mobile ausente: ${label}`);
}

assert.match(cssSource, /--app-safe-area-bottom:\s*env\(safe-area-inset-bottom, 0px\)/, 'safe area web deve ser explícita');
assert.match(cssSource, /\.is-webview[\s\S]*--app-safe-area-bottom:\s*0px/, 'WebView nativo não pode reaplicar safe area CSS');
assert.match(cssSource, /\.app-mobile-bottom-nav\s*\{[\s\S]*bottom:\s*var\(--app-safe-area-bottom\)/, 'bottom nav deve subir pela safe area');
assert.match(cssSource, /\.app-main-content\s*\{[\s\S]*calc\(4rem \+ var\(--app-safe-area-bottom\)\)/, 'conteúdo deve reservar nav e safe area');

assert.match(launcherSource, /WindowCompat\.setDecorFitsSystemWindows\(getWindow\(\), false\)/, 'Android deve manter edge-to-edge');
assert.match(launcherSource, /ViewCompat\.setOnApplyWindowInsetsListener\(rootView/, 'insets devem ser tratados no container nativo');
assert.match(launcherSource, /Type\.systemBars\(\)[\s\S]*Type\.displayCutout\(\)/, 'system bars e cutout devem ser tratados');
assert.match(launcherSource, /setInsets\(handledTypes, Insets\.NONE\)/, 'tipos nativos tratados devem ser zerados antes do WebView');
assert.doesNotMatch(launcherSource, /Type\.ime\(\)/, 'IME não deve virar padding permanente');

assert.match(appVersionSource, /APP_VERSION = "v1\.10\.871"/);
assert.match(appVersionSource, /PLAY_STORE_VERSION = "1\.0\.89"/);
assert.match(gradleSource, /versionCode 89/);
assert.match(gradleSource, /versionName "89"/);
assert.match(twaManifestSource, /"appVersionCode": 89/);
assert.match(twaManifestSource, /"appVersionName": "89"/);
assert.match(twaManifestSource, /"appVersion": "89"/);

console.log('Mobile bottom navigation safe-area tests passed');
