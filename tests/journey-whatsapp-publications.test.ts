import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JOURNEY_WHATSAPP_DESTINATION_KEY, JOURNEY_WHATSAPP_TIMEZONE,
  retryDelayMinutes, validateClaimPayload, validateCompletePayload, validateFailPayload,
  verifyJourneyPublicationAuthorization, publicJourneyUrls, normalizePublicOrigin, resolveProductionOrigin
} from "../server/whatsapp/journeyPublications.js";
import { isDueJourneyContent, publishDueJourneyContents } from "../server/journeys/journeyPublisher.js";
import { getNextJourneyPublicationCronRun, JOURNEY_PUBLICATION_CRON_JOB } from "../server/journeys/journeyPublicationCron.js";

const validClaim = { destinationKey: JOURNEY_WHATSAPP_DESTINATION_KEY, workerId: "n8n-publicacao-jornada", provider: "manual" };
assert.deepEqual(validateClaimPayload(validClaim), validClaim);
assert.throws(() => validateClaimPayload({ ...validClaim, provider: "cloud" }));
assert.throws(() => validateClaimPayload({ ...validClaim, destinationKey: "outro" }));
assert.equal(verifyJourneyPublicationAuthorization(undefined, "secret"), false);
assert.equal(verifyJourneyPublicationAuthorization("Bearer wrong", "secret"), false);
assert.equal(verifyJourneyPublicationAuthorization("Bearer secret", "secret"), true);
assert.deepEqual(validateCompletePayload({ publicationId: "id", provider: "manual", providerMessageId: null, publishedAt: "2026-08-10T11:05:00Z" }).provider, "manual");
assert.throws(() => validateCompletePayload({ publicationId: "id", provider: "invalid" }));
assert.deepEqual(validateFailPayload({ publicationId: "id", errorCode: "PROVIDER_UNAVAILABLE", errorMessage: "indisponível", retryable: true }).retryable, true);
assert.deepEqual([1, 2, 3, 4, 5].map(retryDelayMinutes), [5, 15, 30, 60, 60]);
assert.deepEqual(publicJourneyUrls("https://example.test", { slug: "jornada-15-dias" }, "boas-vindas"), { centralUrl: "https://example.test/jornada/jornada-15-dias", contentUrl: "https://example.test/jornada/jornada-15-dias/boas-vindas" });
assert.deepEqual(publicJourneyUrls("preview.vercel.app", { slug: "jornada-15-dias" }, "dia 1"), { centralUrl: "https://preview.vercel.app/jornada/jornada-15-dias", contentUrl: "https://preview.vercel.app/jornada/jornada-15-dias/dia%201" });
assert.deepEqual(publicJourneyUrls("https://example.test/", { slug: "jornada-15-dias", public_url: "https://example.test/jornada/jornada-15-dias/" }, "boas-vindas"), { centralUrl: "https://example.test/jornada/jornada-15-dias", contentUrl: "https://example.test/jornada/jornada-15-dias/boas-vindas" });
assert.equal(normalizePublicOrigin("https://example.test/"), "https://example.test");
assert.equal(normalizePublicOrigin("example.test"), "https://example.test");
assert.equal(resolveProductionOrigin("preview.vercel.app"), "https://evolucaoclinica.app.br");
assert.equal(JOURNEY_WHATSAPP_DESTINATION_KEY, "jornada-15-dias-operador-evolucao-clinica");
assert.equal(JOURNEY_WHATSAPP_TIMEZONE, "America/Sao_Paulo");
assert.equal(JOURNEY_PUBLICATION_CRON_JOB, "publish-journey-contents-job");
assert.equal(getNextJourneyPublicationCronRun("*/5 * * * *", new Date("2026-08-06T13:20:00.000Z")), "2026-08-06T13:25:00.000Z");
assert.equal(getNextJourneyPublicationCronRun("*/5 * * * *", new Date("2026-08-06T13:23:59.999Z")), "2026-08-06T13:25:00.000Z");
assert.equal(getNextJourneyPublicationCronRun("17 3 * * *", new Date("2026-08-06T13:23:59.999Z")), null);
const migration = readFileSync(new URL("../supabase/migrations/20260806100000_create_journey_whatsapp_publications.sql", import.meta.url), "utf8");
const cronMigration = readFileSync(new URL("../supabase/migrations/20260806150000_standardize_supabase_cron_jobs.sql", import.meta.url), "utf8");
const cronRpcMigration = readFileSync(new URL("../supabase/migrations/20260806170000_add_cron_status_and_vault_verification_rpcs.sql", import.meta.url), "utf8");
assert.match(migration, /UNIQUE \(journey_content_id, destination_key\)/);
assert.match(migration, /FOR UPDATE SKIP LOCKED/);
assert.match(migration, /America\/Sao_Paulo/);
assert.match(migration, /ALTER TABLE public\.journey_whatsapp_publications ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /CHECK \(status IN \('pending', 'claimed', 'sent', 'failed', 'cancelled'\)\)/);
assert.match(cronMigration, /publish-journey-contents-job/);
assert.match(cronMigration, /CREATE EXTENSION IF NOT EXISTS pg_cron/);
assert.match(cronMigration, /CREATE EXTENSION IF NOT EXISTS pg_net/);
assert.match(cronMigration, /vault\.decrypted_secrets/);
assert.match(cronMigration, /Authorization.*Bearer/s);
assert.match(cronMigration, /cron\.unschedule\(job_record\.jobid\)/);
assert.doesNotMatch(cronMigration, /REPLACE_WITH|jf4a1n|CRON_SECRET\s*=/i);
assert.match(cronRpcMigration, /get_journey_publication_cron_status/);
assert.match(cronRpcMigration, /cron\.job_run_details/);
assert.match(cronRpcMigration, /verify_supabase_cron_secret/);
assert.match(cronRpcMigration, /vault\.decrypted_secrets/);
assert.match(cronRpcMigration, /SECURITY DEFINER/);
assert.match(cronRpcMigration, /GRANT EXECUTE.*service_role/);
assert.doesNotMatch(readFileSync(new URL("../vercel.json", import.meta.url), "utf8"), /"crons"/);
assert.doesNotMatch(readFileSync(new URL("../server.ts", import.meta.url), "utf8"), /buildCronBootstrapSql|bootstrapSupabaseCronJobs/);
assert.match(readFileSync(new URL("../server.ts", import.meta.url), "utf8"), /\/api\/admin\/journey-publication-cron/);
assert.match(readFileSync(new URL("../server.ts", import.meta.url), "utf8"), /verify_supabase_cron_secret/);

const order: string[] = [];
let updatePayload: Record<string, unknown> | null = null;
const dueContent = { id: "due", title: "Dia 1", day_number: 1, journey_id: "journey", publication_date: "2026-08-10", publication_time: "08:00:00", journeys: { status: "active", timezone: "America/Sao_Paulo" } };
const dueContentTwo = { id: "due-two", title: "Dia 2", day_number: 2, journey_id: "journey", publication_date: "2026-08-09", publication_time: "08:00", journeys: { status: "active", timezone: "America/Sao_Paulo" } };
const futureContent = { id: "future", title: "Dia 2", day_number: 2, journey_id: "journey", publication_date: "2026-08-11", publication_time: "08:00:00", journeys: { status: "active", timezone: "America/Sao_Paulo" } };
let contentsCall = 0;
const controlledSupabase = {
  from(table: string) {
    if (table !== "journey_contents") throw new Error(`unexpected table ${table}`);
    contentsCall++;
    if (contentsCall === 1) {
      const query: any = { select: () => query, eq: () => query, not: () => query, then: (resolve: (value: unknown) => void) => resolve({ data: [dueContent, dueContentTwo, futureContent], error: null }) };
      return query;
    }
    const update: any = { update: (payload: Record<string, unknown>) => { order.push("publish"); updatePayload = payload; return update; }, eq: () => update, select: () => update, maybeSingle: async () => ({ data: { id: "due" }, error: null }) };
    return update;
  },
  rpc(name: string) { order.push(name); return Promise.resolve({ data: 0, error: null }); }
} as any;
assert.equal(isDueJourneyContent({ publication_date: "2026-08-10", publication_time: "08:59" }, new Date("2026-08-10T11:58:59.000Z"), "America/Sao_Paulo"), false);
assert.equal(isDueJourneyContent({ publication_date: "2026-08-10", publication_time: "09:00" }, new Date("2026-08-10T12:00:00.000Z"), "America/Sao_Paulo"), true);
assert.equal(isDueJourneyContent({ publication_date: "2026-08-10", publication_time: "09:01" }, new Date("2026-08-10T12:00:00.000Z"), "America/Sao_Paulo"), false);
assert.equal(isDueJourneyContent({ publication_date: "2026-08-09", publication_time: "23:59:59" }, new Date("2026-08-10T12:00:00.000Z"), "America/Sao_Paulo"), true);
assert.equal(isDueJourneyContent({ publication_date: "2026-08-10", publication_time: "09:00" }, new Date("2026-08-10T12:00:00.000Z"), "Invalid/Timezone"), true);
assert.equal(isDueJourneyContent({ publication_date: "2026-08-10", publication_time: "12:00" }, new Date("2026-08-10T12:00:00.000Z"), "UTC"), true);
const publishResult = await publishDueJourneyContents(controlledSupabase, new Date("2026-08-10T12:00:00.000Z"));
assert.deepEqual(publishResult, { publishedCount: 2 });
assert.deepEqual(order, ["publish", "publish", "sync_journey_whatsapp_publications"]);
assert.deepEqual(updatePayload, { publication_status: "published", published_at: "2026-08-10T12:00:00.000Z" });
assert.match(migration, /c\.publication_status = 'published' AND c\.published_at IS NOT NULL/);
assert.match(migration, /Allow public read access to published journey contents/);
console.log("journey-whatsapp-publications tests passed");
