import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { groupLifecycleDeliveries, paginateLifecycleDeliveryGroups } from '../src/utils/lifecycleDeliveries.js';

const deliveries = [
  { id: 'a1', user_id: 'user-a', recipient_name: 'Ana', recipient_email: 'ana@example.com', sent_at: '2026-08-20T10:00:00Z' },
  { id: 'a2', user_id: 'user-a', recipient_name: 'Ana', recipient_email: 'ana@example.com', sent_at: '2026-08-19T10:00:00Z' },
  { id: 'b1', user_id: 'user-b', recipient_name: 'Bruna', recipient_email: 'bruna@example.com', sent_at: '2026-08-21T10:00:00Z' },
  { id: 'c1', user_id: 'user-c', recipient_name: 'Caio', recipient_email: 'caio@example.com', sent_at: '2026-08-18T10:00:00Z' }
];

const groups = groupLifecycleDeliveries(deliveries);
assert.deepEqual(groups.map((group) => group.professionalId), ['user-b', 'user-a', 'user-c']);
assert.equal(groups.find((group) => group.professionalId === 'user-a')?.deliveries.length, 2);
assert.equal(groups.find((group) => group.professionalId === 'user-a')?.latestAt, '2026-08-20T10:00:00Z');

const pagination = paginateLifecycleDeliveryGroups(groups, 2, 2);
assert.equal(pagination.page, 2);
assert.equal(pagination.total, 3);
assert.equal(pagination.totalPages, 2);
assert.deepEqual(pagination.groups.map((group) => group.professionalId), ['user-c']);

const source = readFileSync(resolve('src/components/admin/LifecycleAdmin.tsx'), 'utf8');
assert.match(source, /LifecycleDeliveryLogs/);
assert.match(source, /PROFESSIONALS_PER_DELIVERY_PAGE = 10/);
assert.match(source, /data-testid="lifecycle-delivery-groups"/);
assert.match(source, /Envios agrupados por profissional/);
assert.match(source, /Até \{PROFESSIONALS_PER_DELIVERY_PAGE\} profissionais por página/);
assert.match(source, /aria-label="Paginação dos profissionais com envios"/);

console.log('Lifecycle delivery grouping tests passed.');
