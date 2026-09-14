import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  getNotificationRecipientCount,
  resolveFunnelStageRecipients,
  resolveNotificationTargets,
} from "../src/utils/notificationRecipients.js";

const adminSource = readFileSync("src/pages/AdminPanel.tsx", "utf8");
const emailHistorySource = readFileSync("src/pages/EmailHistory.tsx", "utf8");
const emailTemplatesSource = readFileSync("src/components/admin/EmailTransactionalTemplates.tsx", "utf8");
const pushCasesSource = readFileSync("src/components/admin/PushNotificationCasesManager.tsx", "utf8");
const serverSource = readFileSync("server.ts", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260806233000_classify_onboarding_notifications.sql",
  "utf8"
);
const editableEmailTemplatesMigrationSource = readFileSync(
  "supabase/migrations/20260807090000_create_editable_email_templates.sql",
  "utf8"
);
const notificationAudienceMigrationSource = readFileSync(
  "supabase/migrations/20260914175356_add_notification_audience_segment.sql",
  "utf8"
);

assert.match(adminSource, /Central de Notificações/);
assert.match(adminSource, /\/admin\/notifications\/email/);
assert.match(adminSource, /\/admin\/notifications\/whatsapp/);
assert.match(adminSource, /\/admin\/notifications\/push/);
assert.match(adminSource, /<PushNotificationCasesManager\s*\/>/);
assert.match(adminSource, /<NotificationRecipientSelector/);
assert.match(adminSource, /\/api\/admin\/professional-funnel/);
assert.match(adminSource, /Selecione uma etapa do funil para enviar a notificação\./);
assert.match(adminSource, /Não há profissionais nesta etapa do funil no momento\./);
assert.match(adminSource, /Confirmar envio/);
assert.match(adminSource, /Enviar esta notificação para todos os/);
assert.match(adminSource, /Enviar esta notificação para .* da etapa/);
assert.doesNotMatch(adminSource, /label: 'Histórico de E-mails'/);
assert.match(adminSource, /<EmailHistory[\s\S]*embedded/);
assert.doesNotMatch(adminSource, /<option value="account_access_granted"/);

for (const source of ["welcome", "lifecycle", "lifecycle-conditional", "lifecycle-test", "lifecycle-alert"]) {
  assert.match(emailHistorySource, new RegExp(`['\"]${source}['\"]`));
}
assert.match(emailHistorySource, /\.not\('source', 'in', EXCLUDED_EMAIL_SOURCES_FILTER\)/);
assert.match(emailHistorySource, /ITEMS_PER_PAGE = 20/);
assert.match(emailHistorySource, /Página anterior/);
assert.match(emailHistorySource, /Próxima página/);
assert.match(adminSource, /<EmailTransactionalTemplates\s*\/>/);
assert.match(emailTemplatesSource, /Modelos de E-mails Transacionais/);
assert.match(emailTemplatesSource, /from\('email_templates'\)/);
assert.match(emailTemplatesSource, /aria-expanded=\{isExpanded\}/);
assert.match(emailTemplatesSource, /Recolher/);
assert.match(emailTemplatesSource, /Editar conteúdo/);
assert.match(emailTemplatesSource, /Edite visualmente como o conteúdo será exibido no e-mail/);
assert.match(emailTemplatesSource, /HtmlEmailRichEditor/);
assert.match(emailTemplatesSource, /agenciastudio4x@gmail\.com/);
assert.match(emailTemplatesSource, /Enviar teste/);
assert.match(emailTemplatesSource, /DOMPurify\.sanitize/);
assert.doesNotMatch(emailTemplatesSource, /\/api\/admin\/lifecycle/);
assert.match(serverSource, /getEditableEmailTemplate/);
assert.match(serverSource, /renderEditableEmailTemplateHtml/);
assert.match(serverSource, /restoreEditableEmailParagraphs/);
assert.match(serverSource, /platform-notification/);
assert.match(serverSource, /report-delivery/);
assert.match(serverSource, /\/api\/admin\/email-templates\/:key\/test/);
assert.match(serverSource, /EDITABLE_EMAIL_TEMPLATE_TEST_KEYS/);
assert.match(pushCasesSource, /Casos de envio de notificações push/);
assert.match(pushCasesSource, /role="switch"/);
assert.match(serverSource, /\/api\/admin\/push-notification-cases/);
assert.match(editableEmailTemplatesMigrationSource, /CREATE TABLE IF NOT EXISTS public\.email_templates/);
assert.match(editableEmailTemplatesMigrationSource, /email_templates_admin_manage/);

const deliveriesStart = serverSource.indexOf('app.get("/api/admin/whatsapp/deliveries"');
const deliveriesEnd = serverSource.indexOf('app.get("/api/admin/whatsapp/templates"', deliveriesStart);
const deliveriesSource = serverSource.slice(deliveriesStart, deliveriesEnd);
assert.ok(deliveriesStart >= 0);
assert.match(deliveriesSource, /\.is\("lifecycle_dispatch_id", null\)/);
assert.match(deliveriesSource, /account_access_granted/);
assert.match(serverSource, /source: record\.source \|\| "platform"/);
assert.match(serverSource, /normalizeNotificationAudience/);
assert.match(serverSource, /audience_segment/);
assert.match(serverSource, /Etapa do funil =/);
assert.match(serverSource, /"onboarding"/);
assert.match(migrationSource, /SET source = 'onboarding'/);
assert.match(notificationAudienceMigrationSource, /ADD COLUMN IF NOT EXISTS audience_segment JSONB/);
assert.match(notificationAudienceMigrationSource, /NOT NULL DEFAULT '\{\}'::jsonb/);

const funnelProfessionals = [
  { id: "registered", stage: "registered" as const },
  { id: "first-patient", stage: "first_patient" as const },
  { id: "linked-record", stage: "linked_record" as const },
  { id: "first-evolution", stage: "first_evolution" as const },
  { id: "returned", stage: "returned" as const },
  { id: "paid", stage: "paid" as const },
];
const funnelBoard = {
  professionals: funnelProfessionals,
  stages: [
    { key: "registered" as const, label: "Cadastro criado", description: "Conta criada" },
    { key: "first_patient" as const, label: "Primeiro paciente", description: "Criou paciente" },
    { key: "linked_record" as const, label: "Prontuário vinculado", description: "Vinculou prontuário" },
    { key: "first_evolution" as const, label: "Primeira evolução", description: "Concluiu evolução" },
    { key: "returned" as const, label: "Retornou ao app", description: "Usou em dois dias" },
    { key: "paid" as const, label: "Plano assinado", description: "Assinatura ativa" },
  ],
  stageCounts: {
    registered: 1,
    first_patient: 1,
    linked_record: 1,
    first_evolution: 1,
    returned: 1,
    paid: 1,
  },
  total: 6,
};

for (const professional of funnelProfessionals) {
  const selected = resolveFunnelStageRecipients(funnelProfessionals, professional.stage);
  assert.deepEqual(selected.map((item) => item.id), [professional.id], `a etapa ${professional.stage} deve ser exclusiva`);
  assert.equal(
    resolveNotificationTargets({ target: "funnel_stage", professionals: [], selectedFunnelStage: professional.stage, funnelBoard }).join(","),
    professional.id,
    `a segmentação deve usar somente o stage final ${professional.stage}`,
  );
}

assert.deepEqual(resolveFunnelStageRecipients(funnelProfessionals, "registered"), [{ id: "registered", stage: "registered" }]);
assert.deepEqual(resolveFunnelStageRecipients([], "paid"), [], "etapa sem profissionais não pode gerar destinatários");
assert.deepEqual(resolveNotificationTargets({ target: "funnel_stage", professionals: [], selectedFunnelStage: "", funnelBoard }), []);
assert.equal(getNotificationRecipientCount({ target: "funnel_stage", professionals: [], selectedFunnelStage: "paid", funnelBoard }), 1);
assert.deepEqual(resolveNotificationTargets({ target: "specific", professionals: [{ id: "specific", full_name: "", google_email: "" }], specificProfessionalId: "specific" }), ["specific"]);
assert.deepEqual(resolveNotificationTargets({ target: "all", professionals: [{ id: "one", full_name: "", google_email: "" }, { id: "two", full_name: "", google_email: "" }] }), ["one", "two"]);

console.log("Notification center tests passed.");
