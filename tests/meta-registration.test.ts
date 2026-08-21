import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { claimMetaRegistrationEvent } from '../server/analytics/metaRegistration';

const eventId = 'registration-fedcba9876543210fedcba9876543210';
const userId = '550e8400-e29b-41d4-a716-446655440000';

function createAdmin(marketingGranted: boolean, pendingEventIds: string[]) {
  let rpcCalls = 0;
  return {
    get rpcCalls() { return rpcCalls; },
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
          return { data: { marketing_granted: marketingGranted }, error: null };
        }
      };
      return builder;
    },
    async rpc(name: string, params: { p_user_id: string }) {
      rpcCalls += 1;
      assert.equal(name, 'claim_meta_registration_event');
      assert.deepEqual(params, { p_user_id: userId });
      const next = pendingEventIds.shift();
      return { data: next ? [{ event_id: next }] : [], error: null };
    }
  };
}

const deniedAdmin = createAdmin(false, [eventId]);
assert.deepEqual(
  await claimMetaRegistrationEvent(deniedAdmin, userId),
  { eventId: null, status: 'consent_denied' },
  'consentimento de Marketing negado não consome o marcador'
);
assert.equal(deniedAdmin.rpcCalls, 0);

const newAccountAdmin = createAdmin(true, [eventId]);
assert.deepEqual(await claimMetaRegistrationEvent(newAccountAdmin, userId), { eventId, status: 'claimed' });
assert.deepEqual(
  await claimMetaRegistrationEvent(newAccountAdmin, userId),
  { eventId: null, status: 'not_pending' },
  'reload, nova aba ou novo login não reivindicam o mesmo cadastro novamente'
);

const existingAccountAdmin = createAdmin(true, []);
assert.deepEqual(
  await claimMetaRegistrationEvent(existingAccountAdmin, userId),
  { eventId: null, status: 'not_pending' },
  'conta anterior à migração não pode virar conversão em um login comum'
);

const migration = await readFile(new URL('../supabase/migrations/20260821180000_create_meta_registration_events.sql', import.meta.url), 'utf8');
assert.match(migration, /AFTER INSERT ON auth\.users/i, 'a criação real da conta Auth é a fonte transacional');
assert.match(migration, /claimed_at IS NULL/i, 'a reivindicação é atômica e ocorre no máximo uma vez');
assert.match(migration, /Existing auth users are intentionally not/i, 'a migração documenta explicitamente que não retroage contas');
assert.doesNotMatch(migration, /INSERT INTO public\.meta_registration_events[\s\S]*SELECT[\s\S]*FROM auth\.users/i, 'não existe backfill de usuários antigos');
assert.match(migration, /registration-' \|\| encode\(gen_random_bytes\(16\), 'hex'\)/i, 'eventID é opaco, estável e não contém o UUID do usuário');

const appSource = await readFile(new URL('../src/App.tsx', import.meta.url), 'utf8');
assert.match(appSource, /trackConfirmedMetaRegistrationOnce/, 'a confirmação Auth chama o rastreamento dedicado');
assert.match(appSource, /A Meta[\s\S]*não usa esta heurística/, 'a heurística de cinco minutos fica restrita ao Analytics legado');

const loginSource = await readFile(new URL('../src/pages/Login.tsx', import.meta.url), 'utf8');
assert.match(loginSource, /redirectTo: window\.location\.origin \+ '\/login'/, 'OAuth retorna a uma rota comercial sanitizável');

console.log('Meta registration tests passed');
