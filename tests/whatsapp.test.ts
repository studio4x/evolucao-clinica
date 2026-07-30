import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWhatsAppMessagesUrl,
  createWhatsAppClient,
  extractWhatsAppWamid,
  getWhatsAppConfigFromEnv,
  normalizeWhatsAppPhone,
  parseWhatsAppMetaError,
  verifyWhatsAppWebhookSignature,
  WhatsAppValidationError
} from "../server/whatsapp/whatsappClient.js";
import {
  createWhatsAppN8nEventsService,
  validateNormalizedWhatsAppN8nEvent,
  verifyWhatsAppN8nEventsAuthorization,
  WhatsAppN8nEventValidationError
} from "../server/whatsapp/whatsappN8nEvents.js";
import type {
  WhatsAppDeliveryRepository,
  WhatsAppFailedDelivery,
  WhatsAppN8nEventsRepository,
  WhatsAppPendingDelivery
} from "../server/whatsapp/whatsappTypes.js";
import { mergeNotificationSettings } from "../src/utils/notificationSettings.js";

const baseConfig = {
  accessToken: "test-token",
  phoneNumberId: "123456789",
  graphApiVersion: "v25.0",
  appSecret: "test-app-secret",
  webhookVerifyToken: "test-verify-token",
  n8nEventsToken: "n8n-events-test-token",
  allowUnsignedWebhooks: false
};

assert.equal(normalizeWhatsAppPhone("+55 (11) 99999-1234"), "5511999991234");
assert.throws(() => normalizeWhatsAppPhone(""), WhatsAppValidationError);
assert.throws(() => normalizeWhatsAppPhone("sem número"), /obrigatório/);
assert.equal(
  buildWhatsAppMessagesUrl(baseConfig),
  "https://graph.facebook.com/v25.0/123456789/messages"
);
assert.equal(getWhatsAppConfigFromEnv({} as NodeJS.ProcessEnv).graphApiVersion, "v25.0");

const successPayload = {
  messaging_product: "whatsapp",
  contacts: [{ input: "5511999991234", wa_id: "5511999991234" }],
  messages: [{ id: "wamid.success-123" }]
};
assert.equal(extractWhatsAppWamid(successPayload), "wamid.success-123");
assert.equal(extractWhatsAppWamid({ messages: [] }), null);

const parsedMetaError = parseWhatsAppMetaError({
  error: {
    code: 100,
    error_subcode: 33,
    type: "OAuthException",
    message: "Invalid parameter",
    error_user_title: "Número inválido",
    error_user_msg: "Revise o número",
    fbtrace_id: "trace-123"
  }
});
assert.deepEqual(parsedMetaError, {
  code: "100",
  subcode: "33",
  type: "OAuthException",
  message: "Invalid parameter",
  userTitle: "Número inválido",
  userMessage: "Revise o número",
  fbtraceId: "trace-123"
});

function createRepositoryDouble() {
  const events: string[] = [];
  const pendingInputs: WhatsAppPendingDelivery[] = [];
  const accepted: Array<{ id: string; wamid: string | null; payload: Record<string, unknown> }> = [];
  const failed: Array<{ id: string; failure: WhatsAppFailedDelivery }> = [];
  const repository: WhatsAppDeliveryRepository = {
    async createPending(input) {
      events.push("pending");
      pendingInputs.push(input);
      return { id: "delivery-123" };
    },
    async markAccepted(id, wamid, payload) {
      events.push("accepted");
      accepted.push({ id, wamid, payload });
    },
    async markFailed(id, failure) {
      events.push("failed");
      failed.push({ id, failure });
    }
  };
  return { repository, events, pendingInputs, accepted, failed };
}

const successRepo = createRepositoryDouble();
const successLogs: string[] = [];
const successClient = createWhatsAppClient({
  config: baseConfig,
  repository: successRepo.repository,
  logger: {
    info: (...args: unknown[]) => successLogs.push(args.join(" ")),
    warn: (...args: unknown[]) => successLogs.push(args.join(" ")),
    error: (...args: unknown[]) => successLogs.push(args.join(" "))
  },
  fetchImpl: (async (url: string | URL | Request, init?: RequestInit) => {
    successRepo.events.push("fetch");
    assert.equal(String(url), "https://graph.facebook.com/v25.0/123456789/messages");
    assert.equal((init?.headers as Record<string, string>).Authorization, "Bearer test-token");
    return {
      ok: true,
      status: 200,
      json: async () => successPayload
    } as Response;
  }) as typeof fetch
});
const successResult = await successClient.sendText({
  userId: "user-123",
  lifecycleDispatchId: "dispatch-123",
  recipientPhone: "+55 (11) 99999-1234",
  type: "text",
  text: "Mensagem de teste"
});
assert.deepEqual(successRepo.events, ["pending", "fetch", "accepted"]);
assert.equal(successRepo.pendingInputs[0]?.lifecycleDispatchId, "dispatch-123");
assert.equal(successRepo.pendingInputs[0]?.recipientPhone, "5511999991234");
assert.equal(successRepo.pendingInputs[0]?.requestPayload.text instanceof Object, true);
assert.equal(JSON.stringify(successRepo.pendingInputs[0]?.requestPayload).includes("Mensagem de teste"), false);
assert.equal(successRepo.accepted[0]?.wamid, "wamid.success-123");
assert.equal(successResult.status, "accepted");
assert.equal(successResult.deliveryId, "delivery-123");
assert.equal(successResult.wamid, "wamid.success-123");
assert.equal(successLogs.join(" ").includes("5511999991234"), false);
assert.equal(successLogs.join(" ").includes(baseConfig.accessToken), false);
assert.equal(JSON.stringify(successResult).includes(baseConfig.accessToken), false);

const failureRepo = createRepositoryDouble();
const failureClient = createWhatsAppClient({
  config: baseConfig,
  repository: failureRepo.repository,
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  fetchImpl: (async () => ({
    ok: false,
    status: 400,
    json: async () => ({
      error: {
        code: 100,
        error_subcode: 33,
        type: "OAuthException",
        message: "Invalid parameter",
        error_user_title: "Número inválido",
        error_user_msg: "Revise o número",
        fbtrace_id: "trace-123"
      }
    })
  }) as Response) as typeof fetch
});
const failureResult = await failureClient.sendText({
  recipientPhone: "5511999991234",
  type: "text",
  text: "Mensagem"
});
assert.deepEqual(failureRepo.events, ["pending", "failed"]);
assert.equal(failureRepo.failed[0]?.failure.errorCode, "100:33");
assert.equal(failureRepo.failed[0]?.failure.errorTitle, "Número inválido");
assert.equal(failureResult.status, "failed");
assert.equal(failureResult.httpStatus, 400);

const missingConfigRepo = createRepositoryDouble();
const missingConfigResult = await createWhatsAppClient({
  config: { ...baseConfig, accessToken: "", phoneNumberId: "" },
  repository: missingConfigRepo.repository,
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  fetchImpl: (async () => {
    throw new Error("fetch não deveria ser chamado");
  }) as typeof fetch
}).sendText({
  recipientPhone: "5511999991234",
  type: "text",
  text: "Mensagem"
});
assert.equal(missingConfigResult.status, "not_configured");
assert.equal(missingConfigResult.errorCode, "configuration_error");
assert.equal(missingConfigResult.deliveryId, null);
assert.deepEqual(missingConfigRepo.events, []);

const emptyPhoneRepo = createRepositoryDouble();
await assert.rejects(
  () => createWhatsAppClient({
    config: baseConfig,
    repository: emptyPhoneRepo.repository,
    logger: { info: () => {}, warn: () => {}, error: () => {} }
  }).sendText({
    recipientPhone: "",
    type: "text",
    text: "Mensagem"
  }),
  WhatsAppValidationError
);
assert.deepEqual(emptyPhoneRepo.events, []);

const networkRepo = createRepositoryDouble();
const networkResult = await createWhatsAppClient({
  config: baseConfig,
  repository: networkRepo.repository,
  logger: { info: () => {}, warn: () => {}, error: () => {} },
  fetchImpl: (async () => {
    throw new Error(`Falha contendo ${baseConfig.accessToken}`);
  }) as typeof fetch
}).sendText({
  recipientPhone: "5511999991234",
  type: "text",
  text: "Mensagem"
});
assert.equal(networkResult.errorMessage?.includes(baseConfig.accessToken), false);
assert.equal(networkRepo.failed[0]?.failure.errorMessage?.includes(baseConfig.accessToken), false);

assert.equal(
  verifyWhatsAppWebhookSignature({
    rawBody: Buffer.from("{}"),
    signature: "",
    appSecret: "",
    allowUnsigned: false
  }),
  false
);
assert.equal(
  verifyWhatsAppWebhookSignature({
    rawBody: Buffer.from("{}"),
    signature: "",
    appSecret: "",
    allowUnsigned: true
  }),
  true
);

assert.equal(verifyWhatsAppN8nEventsAuthorization(undefined, baseConfig.n8nEventsToken), false);
assert.equal(verifyWhatsAppN8nEventsAuthorization("Bearer wrong", baseConfig.n8nEventsToken), false);
assert.equal(verifyWhatsAppN8nEventsAuthorization(`Bearer ${baseConfig.n8nEventsToken}`, baseConfig.n8nEventsToken), true);

const normalizedStatusEvent = validateNormalizedWhatsAppN8nEvent({
  tenant: "production",
  eventType: "message_status",
  eventKey: "event-delivered-123",
  messageId: "wamid.delivery-123",
  status: "delivered",
  receivedAt: "2026-07-30T12:00:00.000Z",
  phoneNumberId: "phone-number-id",
  senderPhone: "5511999999999",
  recipientPhone: "5511888888888",
  rawValue: { status: "delivered", authorization: "must-not-persist", nested: { token: "also-not" } }
});
assert.equal(normalizedStatusEvent.receivedAt, "2026-07-30T12:00:00.000Z");
assert.equal(JSON.stringify(normalizedStatusEvent.rawValue).includes("must-not-persist"), false);
assert.equal(JSON.stringify(normalizedStatusEvent.rawValue).includes("also-not"), false);
assert.throws(
  () => validateNormalizedWhatsAppN8nEvent({ ...normalizedStatusEvent, status: "accepted" }),
  WhatsAppN8nEventValidationError
);
assert.throws(
  () => validateNormalizedWhatsAppN8nEvent({ ...normalizedStatusEvent, messageId: null }),
  WhatsAppN8nEventValidationError
);

function createN8nRepositoryDouble(options: { duplicate?: boolean; delivery?: boolean } = {}) {
  const calls: string[] = [];
  const updates: any[] = [];
  const completions: any[] = [];
  const repository: WhatsAppN8nEventsRepository = {
    async claimN8nEvent() {
      calls.push("claim");
      return options.duplicate
        ? { eventId: "event-123", shouldProcess: false, alreadyProcessed: true }
        : { eventId: "event-123", shouldProcess: true, alreadyProcessed: false };
    },
    async completeN8nEvent(input) { calls.push("complete"); completions.push(input); },
    async failN8nEvent() { calls.push("fail"); },
    async findDeliveryByWamid() {
      calls.push("find");
      return options.delivery === false ? null : { id: "delivery-123", responsePayload: { messages: [{ id: "wamid.delivery-123" }] } };
    },
    async updateDeliveryFromN8nEvent(_delivery, input) { calls.push("update"); updates.push(input); }
  };
  return { repository, calls, updates, completions };
}

const n8nRepo = createN8nRepositoryDouble();
const n8nService = createWhatsAppN8nEventsService({ repository: n8nRepo.repository, logger: { info: () => {}, warn: () => {}, error: () => {} } });
const n8nResult = await n8nService.process(normalizedStatusEvent);
assert.deepEqual(n8nResult, { processed: true, alreadyProcessed: false, result: "delivery_status_updated" });
assert.deepEqual(n8nRepo.calls, ["claim", "find", "update", "complete"]);
assert.equal(n8nRepo.updates[0]?.status, "delivered");
assert.equal(n8nRepo.updates[0]?.receivedAt, "2026-07-30T12:00:00.000Z");

const failureRepoForEvents = createN8nRepositoryDouble();
await createWhatsAppN8nEventsService({ repository: failureRepoForEvents.repository, logger: { info: () => {}, warn: () => {}, error: () => {} } }).process(
  validateNormalizedWhatsAppN8nEvent({
    ...normalizedStatusEvent,
    eventKey: "event-failed-123",
    status: "failed",
    rawValue: { error: { code: 131026, error_user_title: "Falha", error_user_msg: "Número indisponível" } }
  })
);
assert.equal(failureRepoForEvents.updates[0]?.errorCode, "131026");
assert.equal(failureRepoForEvents.updates[0]?.errorTitle, "Falha");
assert.equal(failureRepoForEvents.updates[0]?.errorMessage, "Número indisponível");

const duplicateRepo = createN8nRepositoryDouble({ duplicate: true });
const duplicateResult = await createWhatsAppN8nEventsService({ repository: duplicateRepo.repository, logger: { info: () => {}, warn: () => {}, error: () => {} } }).process(normalizedStatusEvent);
assert.deepEqual(duplicateResult, { processed: true, alreadyProcessed: true, result: "already_processed" });
assert.deepEqual(duplicateRepo.calls, ["claim"]);

const echoRepo = createN8nRepositoryDouble();
const echoResult = await createWhatsAppN8nEventsService({ repository: echoRepo.repository, logger: { info: () => {}, warn: () => {}, error: () => {} } }).process(
  validateNormalizedWhatsAppN8nEvent({ ...normalizedStatusEvent, eventKey: "event-echo-123", eventType: "business_app_echo", messageId: null, status: null })
);
assert.equal(echoResult.result, "recorded_without_processing");
assert.deepEqual(echoRepo.calls, ["claim", "complete"]);

const mergedSettings = mergeNotificationSettings(
  {
    smtp_host: "smtp.example.com",
    unknown_future_property: { enabled: true },
    whatsapp_access_token: "legacy-token",
    whatsapp_app_secret: "legacy-secret"
  },
  { smtp_port: "587" }
);
assert.equal(mergedSettings.smtp_host, "smtp.example.com");
assert.deepEqual(mergedSettings.unknown_future_property, { enabled: true });
assert.equal(mergedSettings.smtp_port, "587");
assert.equal(mergedSettings.whatsapp_access_token, undefined);
assert.equal(mergedSettings.whatsapp_app_secret, undefined);

const serverSource = readFileSync("server.ts", "utf8");
const endpointStart = serverSource.indexOf('app.post("/api/notifications/test-whatsapp"');
const endpointEnd = serverSource.indexOf("// 5.1.", endpointStart);
const endpointSource = serverSource.slice(endpointStart, endpointEnd);
assert.match(endpointSource, /whatsappClient\.sendText/);
assert.doesNotMatch(endpointSource, /graph\.facebook\.com|accessToken|phoneNumberId|Authorization:\s*`Bearer/);
assert.doesNotMatch(serverSource, /getFallbackServiceKey|v19\.0/);
assert.match(serverSource, /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
assert.doesNotMatch(
  serverSource,
  /SUPABASE_SERVICE_ROLE_KEY\s*\|\|\s*process\.env\.VITE_SUPABASE_ANON_KEY/
);
const n8nEndpointStart = serverSource.indexOf('app.post("/api/integrations/whatsapp/events"');
const n8nEndpointEnd = serverSource.indexOf('app.get("/api/debug-env"', n8nEndpointStart);
const n8nEndpointSource = serverSource.slice(n8nEndpointStart, n8nEndpointEnd);
assert.ok(n8nEndpointStart >= 0);
assert.match(n8nEndpointSource, /verifyWhatsAppN8nEventsAuthorization/);
assert.match(n8nEndpointSource, /whatsappConfig\.n8nEventsToken/);
assert.match(n8nEndpointSource, /validateNormalizedWhatsAppN8nEvent/);
assert.doesNotMatch(n8nEndpointSource, /x-hub-signature-256|appSecret|WHATSAPP_APP_SECRET|verifyWhatsAppWebhookSignature/);

const whatsappAdminSource = readFileSync("src/pages/AdminPanel.tsx", "utf8");
assert.match(whatsappAdminSource, /\/api\/integrations\/whatsapp\/events/);
assert.match(whatsappAdminSource, /WHATSAPP_N8N_EVENTS_TOKEN/);
assert.match(whatsappAdminSource, /message_status/);
assert.match(whatsappAdminSource, /alreadyProcessed/);

const whatsappMigration = readFileSync(
  "supabase/migrations/20260730190000_create_whatsapp_message_deliveries.sql",
  "utf8"
);
assert.match(whatsappMigration, /CREATE TABLE IF NOT EXISTS public\.whatsapp_message_deliveries/);
assert.match(whatsappMigration, /lifecycle_dispatch_id uuid REFERENCES public\.lifecycle_dispatches\(id\) ON DELETE SET NULL/);
assert.match(whatsappMigration, /user_id uuid REFERENCES auth\.users\(id\) ON DELETE SET NULL/);
assert.match(whatsappMigration, /ALTER TABLE public\.whatsapp_message_deliveries ENABLE ROW LEVEL SECURITY/);
assert.match(whatsappMigration, /REVOKE ALL ON TABLE public\.whatsapp_message_deliveries FROM anon, authenticated/);
assert.match(whatsappMigration, /status IN \('pending', 'accepted', 'sent', 'delivered', 'read', 'failed'\)/);

const n8nMigration = readFileSync(
  "supabase/migrations/20260730210000_create_whatsapp_integration_events.sql",
  "utf8"
);
assert.match(n8nMigration, /CREATE TABLE IF NOT EXISTS public\.whatsapp_integration_events/);
assert.match(n8nMigration, /event_key text NOT NULL UNIQUE/);
assert.match(n8nMigration, /REVOKE ALL ON TABLE public\.whatsapp_integration_events FROM anon, authenticated/);
assert.match(n8nMigration, /event_type IN \('message_status', 'business_app_echo', 'coexistence_sync'\)/);

console.log("WhatsApp unit tests passed.");
