import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isOptionalSupabaseResourceMissing } from '../server/admin/optionalSupabaseResource.js';

const server = readFileSync('server.ts', 'utf8');
const overview = readFileSync('server/admin/professionalOverview.ts', 'utf8');
const history = readFileSync('server/admin/professionalCommunicationHistory.ts', 'utf8');
const modal = readFileSync('src/components/admin/ProfessionalDetailsModal.tsx', 'utf8');
const panel = readFileSync('src/pages/AdminPanel.tsx', 'utf8');

for (const error of [
  { code: '42P01', message: 'relation does not exist' },
  { code: 'PGRST205', message: 'Could not find the table in the schema cache' }
]) assert.equal(isOptionalSupabaseResourceMissing(error), true);
assert.equal(isOptionalSupabaseResourceMissing({ code: '42501', message: 'permission denied' }), false);
assert.equal(isOptionalSupabaseResourceMissing({ code: '57014', message: 'statement timeout' }), false);

assert.match(server, /core\.professional/);
assert.match(server, /communicationPreferences: \{ available:/);
assert.match(server, /lifecycle: \{ available:/);
assert.match(server, /usageMetrics: \{ available:/);
assert.match(server, /organization_memberships/);
assert.match(server, /clinicMemberships/);
assert.match(server, /logAdminSupabaseFailure/);
assert.doesNotMatch(server, /max\(m\.professional_id\)/);
assert.match(overview, /isOptionalSupabaseResourceMissing\(usageResult\.error\)/);
assert.match(overview, /usageMetricsAvailable/);
assert.match(history, /loadChannelSafely/);
assert.match(history, /availability:/);
assert.match(modal, /Vínculos com clínicas/);
assert.match(modal, /Building2/);
assert.match(modal, /Histórico deste canal não está disponível neste ambiente/);
assert.match(panel, /p\.clinics.*clinic\.name/);
assert.match(panel, /Individual/);
assert.match(panel, /\+\{\(prof\.clinics \|\| \[\]\)\.length - 1\}/);
console.log('admin professional details resilience, clinic affiliations and optional module contract: PASS');
