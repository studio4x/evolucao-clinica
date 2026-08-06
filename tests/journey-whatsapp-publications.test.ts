import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JOURNEY_WHATSAPP_DESTINATION_KEY, JOURNEY_WHATSAPP_TIMEZONE,
  retryDelayMinutes, validateClaimPayload, validateCompletePayload, validateFailPayload,
  verifyJourneyPublicationAuthorization, publicJourneyUrl
} from "../server/whatsapp/journeyPublications.js";

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
assert.equal(publicJourneyUrl("https://example.test", { slug: "jornada-15-dias" }), "https://example.test/jornada/jornada-15-dias");
assert.equal(JOURNEY_WHATSAPP_TIMEZONE, "America/Sao_Paulo");
const migration = readFileSync(new URL("../supabase/migrations/20260806100000_create_journey_whatsapp_publications.sql", import.meta.url), "utf8");
assert.match(migration, /UNIQUE \(journey_content_id, destination_key\)/);
assert.match(migration, /FOR UPDATE SKIP LOCKED/);
assert.match(migration, /America\/Sao_Paulo/);
assert.match(migration, /ALTER TABLE public\.journey_whatsapp_publications ENABLE ROW LEVEL SECURITY/);
assert.match(migration, /CHECK \(status IN \('pending', 'claimed', 'sent', 'failed', 'cancelled'\)\)/);
console.log("journey-whatsapp-publications tests passed");
