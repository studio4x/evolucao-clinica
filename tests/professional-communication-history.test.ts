import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  normalizeEmailCommunication,
  normalizeNotificationCommunication,
  normalizeWhatsAppCommunication,
  paginateProfessionalCommunications,
  parseProfessionalCommunicationHistoryQuery
} from '../server/admin/professionalCommunicationHistory.js';

assert.deepEqual(parseProfessionalCommunicationHistoryQuery({}), {
  channel: 'all',
  page: 1,
  pageSize: 10
});
assert.deepEqual(parseProfessionalCommunicationHistoryQuery({ channel: 'email', page: '2', pageSize: '200' }), {
  channel: 'email',
  page: 2,
  pageSize: 50
});
assert.equal(parseProfessionalCommunicationHistoryQuery({ channel: 'unknown' }).channel, 'all');

const email = normalizeEmailCommunication({
  id: 'email-id',
  recipient_email: 'profissional@example.com',
  subject: 'Assunto',
  message: 'Conteúdo completo',
  provider: 'brevo',
  source: 'lifecycle',
  status: 'sent',
  created_at: '2026-08-20T12:00:00Z'
});
assert.equal(email.channel, 'email');
assert.equal(email.message, 'Conteúdo completo');
assert.equal(email.metadata.provider, 'brevo');

const notification = normalizeNotificationCommunication({
  id: 'notification-id',
  title: 'Alerta',
  message: 'Mensagem',
  source: 'platform',
  read_at: '2026-08-20T13:00:00Z',
  created_at: '2026-08-20T12:30:00Z'
});
assert.equal(notification.channel, 'notification');
assert.equal(notification.status, 'read');

const whatsapp = normalizeWhatsAppCommunication({
  id: 'whatsapp-id',
  recipient_phone: '5511999887766',
  message_type: 'template',
  template_name: 'ec_notificacao_plataforma',
  status: 'delivered',
  attempt_count: 1,
  created_at: '2026-08-20T14:00:00Z'
});
assert.equal(whatsapp.channel, 'whatsapp');
assert.equal(whatsapp.metadata.recipient?.endsWith('7766'), true);
assert.equal(whatsapp.metadata.recipient?.includes('5511999887766'), false);

assert.deepEqual(
  paginateProfessionalCommunications([email, notification, whatsapp], 1, 2).map(item => item.id),
  ['whatsapp:whatsapp-id', 'notification:notification-id']
);
assert.deepEqual(
  paginateProfessionalCommunications([email, notification, whatsapp], 2, 2).map(item => item.id),
  ['email:email-id']
);

const serverSource = readFileSync(resolve('server.ts'), 'utf8');
const modalSource = readFileSync(resolve('src/components/admin/ProfessionalDetailsModal.tsx'), 'utf8');
const migrationSource = readFileSync(resolve('supabase/migrations/20260820150000_add_professional_communication_history_indexes.sql'), 'utf8');

assert.match(serverSource, /\/api\/admin\/professionals\/:professionalId\/communications", requireAuth, requireAdmin/);
assert.match(modalSource, /Histórico de comunicação/);
assert.match(modalSource, /Todos os contatos registrados pela plataforma/i);
assert.match(modalSource, /useState\(false\).*communicationExpanded|communicationExpanded.*useState\(false\)/s);
assert.match(modalSource, /aria-expanded=\{communicationExpanded\}/);
assert.match(modalSource, /setCommunicationExpanded\(false\)/);
assert.match(modalSource, /\{communicationExpanded && \(/);
assert.match(modalSource, /channel: communicationChannel/);
assert.match(modalSource, /Página \{communicationHistory\.pagination\.page\}/);
assert.doesNotMatch(modalSource, /request_payload|response_payload|wamid/);
assert.match(migrationSource, /email_deliveries\(user_id, created_at DESC\)/);
assert.match(migrationSource, /notifications\(user_id, created_at DESC\)/);
assert.match(migrationSource, /whatsapp_message_deliveries\(user_id, created_at DESC\)/);

console.log('Professional communication history tests passed.');
