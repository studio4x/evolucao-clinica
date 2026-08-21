import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const consentSource = readFileSync(resolve('src/components/CookieConsent.tsx'), 'utf8');
const privacyPolicySource = readFileSync(resolve('src/pages/PrivacyPolicy.tsx'), 'utf8');

assert.match(consentSource, /if \(!ready\) return null/, 'o botão não deve piscar antes da leitura do consentimento');
assert.match(consentSource, /!visible && \(/, 'o botão flutuante aparece somente depois de uma escolha registrada');
assert.match(consentSource, /aria-label="Abrir preferências de privacidade e cookies"/, 'o acionador possui nome acessível');
assert.match(consentSource, /className="[^"]*hidden[^"]*md:inline-flex"/, 'o botão flutuante fica oculto no mobile e visível somente no desktop');
assert.match(consentSource, /new Event\('cookie-consent-open'\)/, 'o botão reutiliza o painel central de consentimento');
assert.match(consentSource, /to="\/privacy"/, 'o painel oferece acesso à política completa');
assert.match(consentSource, /role="dialog"[\s\S]*aria-modal="true"/, 'o painel mantém semântica de diálogo modal');
assert.match(privacyPolicySource, /botão flutuante <strong>Privacidade e cookies<\/strong>/, 'a política documenta o novo caminho de acesso');

console.log('Cookie consent floating control tests passed');
