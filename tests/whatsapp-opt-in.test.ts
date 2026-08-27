import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const profileSource = readFileSync('src/pages/Profile.tsx', 'utf8');
const repositorySource = readFileSync('server/lifecycle/lifecycleRepository.ts', 'utf8');
const queueSource = readFileSync('server/lifecycle/lifecycleQueue.ts', 'utf8');
const migrationSource = readFileSync('supabase/migrations/20260803120000_add_whatsapp_opt_in_audit.sql', 'utf8');
const serviceWorkerSource = readFileSync('public/sw.js', 'utf8');
const routesSource = readFileSync('server/lifecycle/lifecycleRoutes.ts', 'utf8');

assert.match(profileSource, /checked=\{whatsappOptIn\}/);
assert.match(profileSource, /useState\(false\)/);
assert.match(profileSource, /Quero receber pelo WhatsApp notificações operacionais relacionadas à minha conta e ao uso do Evolução Clínica\. Posso cancelar essa autorização a qualquer momento\./);
assert.match(profileSource, /whatsapp_opt_in_source: 'configurações'/);
assert.match(profileSource, /WHATSAPP_OPT_IN_TEXT_VERSION = 'v1'/);
assert.match(repositorySource, /whatsapp_opt_in_at = new Date\(\)\.toISOString\(\)/);
assert.match(repositorySource, /whatsapp_opt_out_at = new Date\(\)\.toISOString\(\)/);
assert.match(repositorySource, /cadastro.*configurações.*checkout/);
assert.match(queueSource, /const whatsappEnabled = false/);
assert.doesNotMatch(queueSource, /preferences\.whatsapp_opt_in === true/);
assert.match(migrationSource, /whatsapp_opt_in boolean NOT NULL DEFAULT false/);
assert.match(migrationSource, /whatsapp_opt_out_at timestamptz/);
assert.match(serviceWorkerSource, /pathname\.startsWith\("\/api\/communication\/"\)/);
assert.match(routesSource, /Cache-Control.*no-store/);
assert.match(routesSource, /WhatsAppNumberAlreadyInUseError/);
assert.match(routesSource, /res\.status\(error\.httpStatus\)\.json/);

console.log('WhatsApp opt-in tests passed.');
