import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const consentSource = readFileSync(resolve('src/components/CookieConsent.tsx'), 'utf8');
const privacyPolicySource = readFileSync(resolve('src/pages/PrivacyPolicy.tsx'), 'utf8');

assert.match(consentSource, /if \(!ready\) return null/, 'o botão não deve piscar antes da leitura do consentimento');
assert.match(consentSource, /!visible && showFloatingPrivacyWidget && \(/, 'o botão flutuante exige escolha registrada e rota pública');
assert.match(consentSource, /aria-label="Abrir preferências de privacidade e cookies"/, 'o acionador possui nome acessível');
assert.match(consentSource, /className="[^"]*hidden[^"]*md:inline-flex"/, 'o botão flutuante fica oculto no mobile e visível somente no desktop');
assert.match(consentSource, /useLocation\(\)/, 'a visibilidade acompanha a navegação SPA');
assert.match(consentSource, /PUBLIC_PRIVACY_WIDGET_EXACT_PATHS/, 'as páginas públicas usam allowlist explícita');
assert.match(consentSource, /pathname\.startsWith\('\/jornada\/'\)/, 'conteúdos públicos da Jornada mantêm o widget');
for (const authenticatedOrSensitivePath of ['/painel', '/admin', '/onboarding', '/checkout', '/public/reports']) {
  assert.equal(consentSource.includes(`'${authenticatedOrSensitivePath}'`), false, `${authenticatedOrSensitivePath} não pode integrar a allowlist do widget`);
}
assert.match(consentSource, /new Event\('cookie-consent-open'\)/, 'o botão reutiliza o painel central de consentimento');
assert.match(consentSource, /to="\/privacy"/, 'o painel oferece acesso à política completa');
assert.match(consentSource, /role="dialog"[\s\S]*aria-modal="true"/, 'o painel mantém semântica de diálogo modal');
assert.match(privacyPolicySource, /botão flutuante <strong>Privacidade e cookies<\/strong> nas páginas públicas[\s\S]*dentro do painel[\s\S]*<strong>Sobre o app<\/strong>/, 'a política diferencia o acesso público do acesso dentro do painel');

console.log('Cookie consent floating control tests passed');
