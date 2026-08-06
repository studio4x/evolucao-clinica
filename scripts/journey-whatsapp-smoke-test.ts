import dotenv from "dotenv";
import { createClient } from "@supabase/supabase-js";
import { JOURNEY_WHATSAPP_DESTINATION_KEY, normalizePublicOrigin, verifyJourneyPublicationAuthorization } from "../server/whatsapp/journeyPublications.js";

const args = new Set(process.argv.slice(2));
dotenv.config();
dotenv.config({ path: ".env.local" });
const mode = args.has("--linked-read-only") ? "linked" : args.has("--production-read-only") ? "production" : "local";
const origin = normalizePublicOrigin(process.env.PUBLIC_APP_URL || "https://evolucaoclinica.app.br");
const required = ["WHATSAPP_JOURNEY_PUBLICATION_TOKEN", "CRON_SECRET", "SUPABASE_SERVICE_ROLE_KEY"];

console.log(`[journey-smoke] mode=${mode} origin=${origin}`);
console.log(`[journey-smoke] destinationKey=${JOURNEY_WHATSAPP_DESTINATION_KEY}`);
for (const name of required) console.log(`[journey-smoke] ${name}=${process.env[name] ? `present(length=${process.env[name]!.length})` : "absent"}`);
if (!verifyJourneyPublicationAuthorization("Bearer invalid", process.env.WHATSAPP_JOURNEY_PUBLICATION_TOKEN)) console.log("[journey-smoke] invalid bearer rejected locally");

if (mode === "local") {
  console.log("[journey-smoke] local mode is static/read-only; no claim executed");
  process.exit(0);
}

if (mode === "production") {
  for (const url of [`${origin}/jornada/jornada-15-dias`, `${origin}/api/integrations/whatsapp/journey-publications/claim`]) {
    const response = await fetch(url, { method: url.includes("claim") ? "POST" : "GET", headers: url.includes("claim") ? { "Content-Type": "application/json" } : undefined, body: url.includes("claim") ? JSON.stringify({}) : undefined });
    console.log(`[journey-smoke] ${response.status} ${url}`);
  }
  console.log("[journey-smoke] production mode never sends a valid claim token and never sends WhatsApp");
  process.exit(0);
}

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !serviceKey) {
  console.log("[journey-smoke] linked read-only blocked: Supabase server credentials are absent");
  process.exit(2);
}
const supabase = createClient(supabaseUrl, serviceKey);
const { data: journey, error: journeyError } = await supabase.from("journeys").select("id, slug, status").eq("slug", "jornada-15-dias").maybeSingle();
if (journeyError) throw journeyError;
const { data: publications, error: publicationError } = await supabase.from("journey_whatsapp_publications").select("id, journey_content_id, destination_key, status, attempts, max_attempts").eq("destination_key", JOURNEY_WHATSAPP_DESTINATION_KEY).neq("status", "sent");
if (publicationError) throw publicationError;
console.log(`[journey-smoke] journey=${journey?.id || "missing"} status=${journey?.status || "missing"}`);
console.log(`[journey-smoke] unsent publications=${publications?.length || 0}`);
console.log("[journey-smoke] linked mode is read-only; no claim/update executed");
