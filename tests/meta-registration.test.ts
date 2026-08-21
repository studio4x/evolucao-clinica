import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  completeMetaRegistrationEvent,
  prepareMetaRegistrationEvent,
  readPendingMetaRegistrationEvent
} from '../server/analytics/metaRegistration';

const eventId = 'registration-fedcba9876543210fedcba9876543210';
const userId = '550e8400-e29b-41d4-a716-446655440000';

function createAdmin(options: { marketingGranted: boolean; pendingEventIds: string[]; completedEventIds?: string[] }) {
  const rpcCalls: Array<{ name: string; params: Record<string, string> }> = [];
  const consentUpserts: Array<Record<string, unknown>> = [];
  let storedMarketingGranted = options.marketingGranted;
  return {
    get rpcCalls() { return rpcCalls; },
    get consentUpserts() { return consentUpserts; },
    from(table: string) {
      assert.equal(table, 'analytics_consents');
      const builder = {
        select() { return builder; },
        eq(column: string, value: string) {
          assert.equal(column, 'user_id');
          assert.equal(value, userId);
          return builder;
        },
        async maybeSingle() {
          return { data: { marketing_granted: storedMarketingGranted }, error: null };
        },
        async upsert(value: Record<string, unknown>, config: { onConflict: string }) {
          assert.equal(config.onConflict, 'user_id');
          consentUpserts.push(value);
          storedMarketingGranted = value.marketing_granted === true;
          return { error: null };
        }
      };
      return builder;
    },
    async rpc(name: string, params: Record<string, string>) {
      rpcCalls.push({ name, params });
      if (name === 'get_pending_meta_registration_event') {
        const next = options.pendingEventIds[0];
        return { data: next ? [{ event_id: next }] : [], error: null };
      }
      assert.equal(name, 'complete_meta_registration_event');
      const completed = options.completedEventIds?.shift();
      if (completed) options.pendingEventIds.shift();
      return { data: completed ? [{ event_id: completed }] : [], error: null };
    }
  };
}

const deniedAdmin = createAdmin({ marketingGranted: false, pendingEventIds: [eventId] });
assert.deepEqual(
  await prepareMetaRegistrationEvent(deniedAdmin, userId, { analyticsGranted: true, marketingGranted: false }),
  { eventId: null, status: 'consent_denied' },
  'consentimento de Marketing negado não lê nem consome o marcador'
);
assert.equal(deniedAdmin.rpcCalls.length, 0);
assert.equal(deniedAdmin.consentUpserts[0]?.marketing_granted, false);

const retryAdmin = createAdmin({ marketingGranted: true, pendingEventIds: [eventId], completedEventIds: [eventId] });
assert.deepEqual(
  await prepareMetaRegistrationEvent(retryAdmin, userId, { analyticsGranted: true, marketingGranted: true }),
  { eventId, status: 'pending' }
);
assert.deepEqual(
  await prepareMetaRegistrationEvent(retryAdmin, userId, { analyticsGranted: true, marketingGranted: true }),
  { eventId, status: 'pending' },
  'reload antes do acknowledgement recebe o mesmo eventID para retry/deduplicação Meta'
);
assert.deepEqual(await completeMetaRegistrationEvent(retryAdmin, userId, eventId), { eventId, status: 'delivered' });
assert.deepEqual(
  await prepareMetaRegistrationEvent(retryAdmin, userId, { analyticsGranted: true, marketingGranted: true }),
  { eventId: null, status: 'not_pending' },
  'depois do acknowledgement o cadastro não volta a ser emitido'
);

const cachedClientAdmin = createAdmin({ marketingGranted: true, pendingEventIds: [eventId] });
assert.deepEqual(
  await readPendingMetaRegistrationEvent(cachedClientAdmin, userId),
  { eventId, status: 'pending' },
  'bundle antigo pode ler o marcador sem consumi-lo antes do envio'
);
assert.deepEqual(
  await readPendingMetaRegistrationEvent(cachedClientAdmin, userId),
  { eventId, status: 'pending' },
  'a rota de compatibilidade também mantém retry com eventID estável'
);

const existingAccountAdmin = createAdmin({ marketingGranted: true, pendingEventIds: [] });
assert.deepEqual(
  await prepareMetaRegistrationEvent(existingAccountAdmin, userId, { analyticsGranted: true, marketingGranted: true }),
  { eventId: null, status: 'not_pending' },
  'conta anterior à migração não pode virar conversão em login comum'
);

const [originalMigration, retryMigration, appSource, serverSource] = await Promise.all([
  readFile(new URL('../supabase/migrations/20260821180000_create_meta_registration_events.sql', import.meta.url), 'utf8'),
  readFile(new URL('../supabase/migrations/20260821220000_make_meta_registration_delivery_retriable.sql', import.meta.url), 'utf8'),
  readFile(new URL('../src/App.tsx', import.meta.url), 'utf8'),
  readFile(new URL('../server.ts', import.meta.url), 'utf8')
]);

assert.match(originalMigration, /AFTER INSERT ON auth\.users/i, 'a criação real da conta Auth é a fonte transacional');
assert.match(originalMigration, /Existing auth users are intentionally not/i, 'a migração documenta explicitamente que não retroage contas');
assert.doesNotMatch(originalMigration, /INSERT INTO public\.meta_registration_events[\s\S]*SELECT[\s\S]*FROM auth\.users/i, 'não existe backfill de usuários antigos');
assert.match(originalMigration, /registration-' \|\| encode\(gen_random_bytes\(16\), 'hex'\)/i, 'eventID é opaco, estável e não contém UUID');
assert.match(retryMigration, /delivered_at IS NULL/i, 'o marcador permanece pendente até confirmação do navegador');
assert.match(retryMigration, /get_pending_meta_registration_event/i);
assert.match(retryMigration, /complete_meta_registration_event/i);
assert.match(retryMigration, /SET delivered_at = claimed_at/i, 'claims da versão anterior não são reenviados indevidamente');
const pendingFunctionSource = retryMigration.split('CREATE OR REPLACE FUNCTION public.complete_meta_registration_event')[0] || '';
assert.doesNotMatch(pendingFunctionSource, /SET claimed_at/i, 'a leitura pendente não consome o cadastro');

assert.match(appSource, /_event === 'SIGNED_IN' \|\| _event === 'INITIAL_SESSION'/, 'INITIAL_SESSION aguarda rastreamento antes do onboarding');
assert.match(appSource, /await trackMetaRegistrationBeforeAppAccess\(session\)[\s\S]*await handleAuthSession\(session\)/, 'o envio é aguardado antes de expor a sessão ao roteador');
assert.match(appSource, /metaRegistrationTrackingRef/, 'getSession e callback Auth compartilham a mesma tentativa em voo');
assert.match(serverSource, /meta-registration\/pending/);
assert.match(serverSource, /meta-registration\/complete/);
assert.match(serverSource, /meta-registration\/pending", requireAuth, express\.json\(\{ limit: "1kb" \}\)/, 'pending interpreta JSON antes de validar as preferências');
assert.match(serverSource, /meta-registration\/complete", requireAuth, express\.json\(\{ limit: "1kb" \}\)/, 'complete interpreta o eventID antes de concluir a entrega');

console.log('Meta registration tests passed');
