import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync("supabase/migrations/20260806110000_add_journey_whatsapp_sent_reset.sql", "utf8");
const server = readFileSync("server.ts", "utf8");
const ui = readFileSync("src/components/admin/JourneyAdmin.tsx", "utf8");
assert.match(migration, /admin_audit_logs/);
assert.match(migration, /FOR UPDATE/);
assert.match(migration, /journey_whatsapp_sent_reset/);
assert.match(migration, /DELETE FROM public\.journey_whatsapp_publications WHERE id = v_publication\.id/);
assert.match(server, /action === "reset_sent"/);
assert.match(server, /requireAuth, requireAdmin/);
assert.match(server, /Somente publicações enviadas podem ter o envio resetado/);
assert.match(server, /reset_journey_whatsapp_sent_publication/);
assert.match(ui, /publication\.status === 'sent'/);
assert.match(ui, /Resetar envio/);
assert.match(ui, /showPrompt/);
assert.match(ui, /RESETAR DIA/);
console.log("journey-whatsapp-reset tests passed");
