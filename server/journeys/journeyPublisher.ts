import type { SupabaseClient } from "@supabase/supabase-js";
import { JOURNEY_WHATSAPP_DESTINATION_KEY } from "../whatsapp/journeyPublications.js";

export const JOURNEY_TIMEZONE = "America/Sao_Paulo";

type JourneyContentCandidate = {
  id: string;
  title: string;
  day_number: number;
  journey_id: string;
  publication_date: string | null;
  publication_time: string | null;
  journeys: { status: string; timezone: string | null } | { status: string; timezone: string | null }[];
};

function timezoneParts(now: Date, timezone: string) {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(now);
    const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    return { date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}:00` };
  } catch {
    return timezoneParts(now, JOURNEY_TIMEZONE);
  }
}

export function isDueJourneyContent(content: Pick<JourneyContentCandidate, "publication_date" | "publication_time">, now: Date, timezone = JOURNEY_TIMEZONE) {
  if (!content.publication_date || !content.publication_time) return false;
  const current = timezoneParts(now, timezone || JOURNEY_TIMEZONE);
  return content.publication_date < current.date || (content.publication_date === current.date && content.publication_time.slice(0, 8) <= current.time);
}

export async function publishDueJourneyContents(supabase: SupabaseClient, now = new Date()) {
  const { data, error } = await supabase
    .from("journey_contents")
    .select("id, title, day_number, journey_id, publication_date, publication_time, journeys!inner(status, timezone)")
    .eq("publication_status", "scheduled")
    .eq("journeys.status", "active")
    .not("publication_date", "is", null)
    .not("publication_time", "is", null);
  if (error) throw error;

  let publishedCount = 0;
  for (const candidate of (data || []) as unknown as JourneyContentCandidate[]) {
    const journey = Array.isArray(candidate.journeys) ? candidate.journeys[0] : candidate.journeys;
    if (!journey || !isDueJourneyContent(candidate, now, journey.timezone || JOURNEY_TIMEZONE)) continue;
    const { data: updated, error: updateError } = await supabase
      .from("journey_contents")
      .update({ publication_status: "published", published_at: now.toISOString() })
      .eq("id", candidate.id)
      .eq("publication_status", "scheduled")
      .select("id")
      .maybeSingle();
    if (updateError) throw updateError;
    if (!updated) continue;

    publishedCount++;
  }
  // The queue is synchronized once, only after all editorial updates committed.
  if (publishedCount > 0) {
    const { error: queueError } = await supabase.rpc("sync_journey_whatsapp_publications", { p_destination_key: JOURNEY_WHATSAPP_DESTINATION_KEY });
    if (queueError) throw queueError;
  }
  return { publishedCount };
}
