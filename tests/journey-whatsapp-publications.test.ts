import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JOURNEY_WHATSAPP_DESTINATION_KEY, JOURNEY_WHATSAPP_TIMEZONE,
  retryDelayMinutes, validateClaimPayload, validateCompletePayload, validateFailPayload,
  verifyJourneyPublicationAuthorization, publicJourneyUrls
} from "../server/whatsapp/journeyPublications.js";
import { publishDueJourneyContents } from "../server/journeys/journeyPublisher.js";

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
assert.equal(JOURNEY_WHATSAPP_DESTINATION_KEY, "jornada-15-dias-operador-evolucao-clinica");
assert.equal(JOURNEY_WHATSAPP_TIMEZONE, "America/Sao_Paulo");
const migration = readFileSync(new URL("../supabase/migrations/20260806100000_create_journey_whatsapp_publications.sql", import.meta.url), "utf8");
assert.match(migration, /UNIQUE \(journey_content_id, destination_key\)/);
assert.match(migration, /FOR UPDATE SKIP LOCKED/);
assert.match(migration, /America\/Sao_Paulo/);
assert.match(migration, /ALTER TABLE public\.journey_whatsapp_publications ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /CHECK \(status IN \('pending', 'claimed', 'sent', 'failed', 'cancelled'\)\)/);

const order: string[] = [];
let updatePayload: Record<string, unknown> | null = null;
const dueContent = { id: "due", title: "Dia 1", day_number: 1, journey_id: "journey", publication_date: "2026-08-10", publication_time: "08:00:00", journeys: { status: "active", timezone: "America/Sao_Paulo" } };
const futureContent = { id: "future", title: "Dia 2", day_number: 2, journey_id: "journey", publication_date: "2026-08-11", publication_time: "08:00:00", journeys: { status: "active", timezone: "America/Sao_Paulo" } };
let contentsCall = 0;
const controlledSupabase = {
  from(table: string) {
    if (table !== "journey_contents") throw new Error(`unexpected table ${table}`);
    contentsCall++;
    if (contentsCall === 1) {
      const query: any = { select: () => query, eq: () => query, not: () => query, then: (resolve: (value: unknown) => void) => resolve({ data: [dueContent, futureContent], error: null }) };
      return query;
    }
    const update: any = { update: (payload: Record<string, unknown>) => { order.push("publish"); updatePayload = payload; return update; }, eq: () => update, select: () => update, maybeSingle: async () => ({ data: { id: "due" }, error: null }) };
    return update;
  },
  rpc(name: string) { order.push(name); return Promise.resolve({ data: 0, error: null }); }
} as any;
const publishResult = await publishDueJourneyContents(controlledSupabase, new Date("2026-08-10T12:00:00.000Z"));
assert.deepEqual(publishResult, { publishedCount: 1 });
assert.deepEqual(order, ["publish", "sync_journey_whatsapp_publications"]);
assert.deepEqual(updatePayload, { publication_status: "published", published_at: "2026-08-10T12:00:00.000Z" });
assert.match(migration, /c\.publication_status = 'published' AND c\.published_at IS NOT NULL/);
assert.match(migration, /Allow public read access to published journey contents/);
console.log("journey-whatsapp-publications tests passed");
