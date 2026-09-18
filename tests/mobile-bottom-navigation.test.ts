import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const layoutSource = readFileSync('src/components/Layout.tsx', 'utf8');
const cssSource = readFileSync('src/index.css', 'utf8');
const launcherSource = readFileSync('app/src/main/java/com/evolucaoclinica/app/LauncherActivity.java', 'utf8');
const appVersionSource = readFileSync('src/components/layout/AppVersion.tsx', 'utf8');
const gradleSource = readFileSync('app/build.gradle', 'utf8');
const rootGradleSource = readFileSync('build.gradle', 'utf8');
const gradleWrapperSource = readFileSync('gradle/wrapper/gradle-wrapper.properties', 'utf8');
const androidManifestSource = readFileSync('app/src/main/AndroidManifest.xml', 'utf8');
const gradlePropertiesSource = readFileSync('gradle.properties', 'utf8');
const proguardSource = readFileSync('app/proguard-rules.pro', 'utf8');
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

assert.match(appVersionSource, /APP_VERSION = "v1\.10\.873"/);
assert.match(appVersionSource, /PLAY_STORE_VERSION = "1\.0\.91"/);
assert.match(gradleSource, /versionCode 91/);
assert.match(gradleSource, /versionName "91"/);
assert.match(twaManifestSource, /"appVersionCode": 91/);
assert.match(twaManifestSource, /"appVersionName": "91"/);
assert.match(twaManifestSource, /"appVersion": "91"/);

// A release Android deve permanecer compatível com os requisitos de otimização do Google Play.
assert.match(gradleSource, /minifyEnabled true/, 'R8 deve permanecer habilitado no release');
assert.match(gradleSource, /shrinkResources true/, 'resource shrinking deve permanecer habilitado no release');
assert.match(gradleSource, /getDefaultProguardFile\('proguard-android-optimize\.txt'\)/, 'release deve usar as regras otimizadas padrão do Android');
assert.match(gradleSource, /'proguard-rules\.pro'/, 'release deve incluir as regras específicas do app');
assert.match(rootGradleSource, /com\.android\.tools\.build:gradle:9\.0\.1/, 'AGP 9.0.1 deve permanecer configurado');
assert.match(gradleWrapperSource, /gradle-9\.1\.0-bin\.zip/, 'Gradle 9.1.0 deve permanecer configurado para AGP 9.0');
assert.match(gradlePropertiesSource, /android\.newDsl=false/, 'DSL legada deve permanecer habilitada durante a migração controlada para AGP 9');
assert.doesNotMatch(gradlePropertiesSource, /android\.r8\.optimizedResourceShrinking=true/, 'AGP 9 não deve depender do opt-in legado de resource shrinking otimizado');
assert.match(androidManifestSource, /com\.google\.android\.gms\.permission\.AD_ID/, 'manifesto deve declarar AD_ID para manter coerência com a declaração do Play Console');
assert.match(launcherSource, /public void setConsent\(boolean analyticsEnabled, boolean marketingEnabled\)/, 'ponte nativa deve receber consentimentos separados');
assert.match(launcherSource, /FirebaseAnalytics\.ConsentType\.AD_STORAGE/, 'Firebase deve aplicar consentimento de armazenamento de publicidade');
assert.match(launcherSource, /FirebaseAnalytics\.ConsentType\.AD_USER_DATA/, 'Firebase deve aplicar consentimento de dados de publicidade');
assert.match(launcherSource, /FirebaseAnalytics\.ConsentType\.AD_PERSONALIZATION/, 'Firebase deve aplicar consentimento de personalização de anúncios');
assert.match(proguardSource, /@android\.webkit\.JavascriptInterface <methods>;/, 'métodos expostos ao WebView devem ser preservados pelo R8');
assert.doesNotMatch(proguardSource, /-keep\s+class\s+com\.evolucaoclinica\.app\.\*\*/, 'não usar keep amplo que anule a otimização do app');

console.log('Mobile bottom navigation and Android release optimization tests passed');
