import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const adminSource = readFileSync("src/pages/AdminPanel.tsx", "utf8");
const emailHistorySource = readFileSync("src/pages/EmailHistory.tsx", "utf8");
const emailTemplatesSource = readFileSync("src/components/admin/EmailTransactionalTemplates.tsx", "utf8");
const serverSource = readFileSync("server.ts", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260806233000_classify_onboarding_notifications.sql",
  "utf8"
);
const editableEmailTemplatesMigrationSource = readFileSync(
  "supabase/migrations/20260807090000_create_editable_email_templates.sql",
  "utf8"
);

assert.match(adminSource, /Central de Notificações/);
assert.match(adminSource, /\/admin\/notifications\/email/);
assert.match(adminSource, /\/admin\/notifications\/whatsapp/);
assert.match(adminSource, /\/admin\/notifications\/push/);
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
assert.match(emailTemplatesSource, /Editar conteúdo/);
assert.match(emailTemplatesSource, /Edite visualmente como o conteúdo será exibido no e-mail/);
assert.match(emailTemplatesSource, /HtmlEmailRichEditor/);
assert.match(emailTemplatesSource, /agenciastudio4x@gmail\.com/);
assert.match(emailTemplatesSource, /Enviar teste/);
assert.match(emailTemplatesSource, /DOMPurify\.sanitize/);
assert.doesNotMatch(emailTemplatesSource, /\/api\/admin\/lifecycle/);
assert.match(serverSource, /getEditableEmailTemplate/);
assert.match(serverSource, /renderEditableEmailTemplateHtml/);
assert.match(serverSource, /platform-notification/);
assert.match(serverSource, /report-delivery/);
assert.match(serverSource, /\/api\/admin\/email-templates\/:key\/test/);
assert.match(serverSource, /EDITABLE_EMAIL_TEMPLATE_TEST_KEYS/);
assert.match(editableEmailTemplatesMigrationSource, /CREATE TABLE IF NOT EXISTS public\.email_templates/);
assert.match(editableEmailTemplatesMigrationSource, /email_templates_admin_manage/);

const deliveriesStart = serverSource.indexOf('app.get("/api/admin/whatsapp/deliveries"');
const deliveriesEnd = serverSource.indexOf('app.get("/api/admin/whatsapp/templates"', deliveriesStart);
const deliveriesSource = serverSource.slice(deliveriesStart, deliveriesEnd);
assert.ok(deliveriesStart >= 0);
assert.match(deliveriesSource, /\.is\("lifecycle_dispatch_id", null\)/);
assert.match(deliveriesSource, /account_access_granted/);
assert.match(serverSource, /source: record\.source \|\| "platform"/);
assert.match(serverSource, /"onboarding"/);
assert.match(migrationSource, /SET source = 'onboarding'/);

console.log("Notification center tests passed.");
