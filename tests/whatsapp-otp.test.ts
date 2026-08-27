import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  buildWhatsAppOtpTemplateComponents,
  digestWhatsAppOtp,
  generateWhatsAppOtpCode,
  getWhatsAppOtpConfigFromEnv,
  verifyWhatsAppOtpDigest,
  WhatsAppOtpError,
} from "../server/whatsapp/whatsappOtp.js";
import {
  isWhatsAppNumberUniqueViolation,
  WHATSAPP_ALREADY_IN_USE_MESSAGE,
  WhatsAppNumberAlreadyInUseError,
} from "../server/whatsapp/whatsappUniqueness.js";

const config = getWhatsAppOtpConfigFromEnv({
  WHATSAPP_APP_SECRET: "a".repeat(32),
} as NodeJS.ProcessEnv);
assert.equal(config.secret, "a".repeat(32));
assert.equal(config.templateName, "ativacao_whatsapp_profissional");
assert.equal(config.languageCode, "pt_BR");
assert.equal(getWhatsAppOtpConfigFromEnv({ WHATSAPP_ACCESS_TOKEN: "b".repeat(64) } as NodeJS.ProcessEnv).secret, "b".repeat(64));

for (let index = 0; index < 50; index += 1) {
  assert.match(generateWhatsAppOtpCode(), /^\d{6}$/);
}

const digestInput = {
  secret: "otp-secret-with-at-least-thirty-two-characters",
  challengeId: "49b45c15-8db5-4415-8c35-b7655adb2a49",
  userId: "user-123",
  phoneNumber: "5511999991234",
  code: "123456",
};
const digest = digestWhatsAppOtp(digestInput);
assert.match(digest, /^[0-9a-f]{64}$/);
assert.equal(verifyWhatsAppOtpDigest(digest, digestWhatsAppOtp(digestInput)), true);
assert.equal(verifyWhatsAppOtpDigest(digest, digestWhatsAppOtp({ ...digestInput, code: "654321" })), false);
assert.equal(verifyWhatsAppOtpDigest("invalid", digest), false);

assert.deepEqual(buildWhatsAppOtpTemplateComponents("123456"), [
  { type: "body", parameters: [{ type: "text", text: "123456" }] },
  { type: "button", sub_type: "url", index: "0", parameters: [{ type: "text", text: "123456" }] },
]);
assert.throws(() => buildWhatsAppOtpTemplateComponents("12345"), WhatsAppOtpError);
assert.equal(isWhatsAppNumberUniqueViolation({ code: "23505" }), true);
assert.equal(isWhatsAppNumberUniqueViolation({ code: "23514" }), false);
assert.equal(new WhatsAppNumberAlreadyInUseError().message, WHATSAPP_ALREADY_IN_USE_MESSAGE);

const serviceSource = readFileSync("server/whatsapp/whatsappOtp.ts", "utf8");
const serverSource = readFileSync("server.ts", "utf8");
const onboardingSource = readFileSync("src/pages/Onboarding.tsx", "utf8");
const migrationSource = readFileSync(
  "supabase/migrations/20260827153113_add_whatsapp_otp_verification.sql",
  "utf8",
);
const uniquenessMigrationSource = readFileSync(
  "supabase/migrations/20260827172723_ensure_unique_professional_whatsapp.sql",
  "utf8",
);

assert.match(serviceSource, /createHmac\("sha256"/);
assert.match(serviceSource, /OTP_TTL_MS = 5 \* 60 \* 1000/);
assert.match(serviceSource, /OTP_RESEND_COOLDOWN_MS = 60 \* 1000/);
assert.match(serviceSource, /OTP_MAX_REQUESTS_PER_WINDOW = 5/);
assert.match(serviceSource, /OTP_MAX_ATTEMPTS = 5/);
assert.match(serviceSource, /code_digest: codeDigest/);
assert.doesNotMatch(serviceSource, /code:\s*code,\s*attempt_count/);
assert.match(serviceSource, /templateName: deps\.config\.templateName/);
assert.match(serviceSource, /whatsapp_verified_number: row\.phone_number/);
assert.match(serviceSource, /\.neq\("user_id", userId\)/);
assert.match(serviceSource, /"whatsapp_already_in_use", 409/);

assert.match(serverSource, /\/api\/onboarding\/whatsapp-verification/);
assert.match(serverSource, /express\.json\(\{ limit: "2kb" \}\)/);
assert.match(serverSource, /registerWhatsAppOtpRoutes/);

assert.match(onboardingSource, /\/api\/onboarding\/whatsapp-verification\/request/);
assert.match(onboardingSource, /\/api\/onboarding\/whatsapp-verification\/verify/);
assert.match(onboardingSource, /autoComplete="one-time-code"/);
assert.match(onboardingSource, /Explorar o aplicativo/);
assert.match(onboardingSource, /Confirmar código/);

assert.match(migrationSource, /CREATE TABLE IF NOT EXISTS public\.whatsapp_otp_challenges/);
assert.match(migrationSource, /ALTER TABLE public\.whatsapp_otp_challenges ENABLE ROW LEVEL SECURITY/);
assert.match(migrationSource, /REVOKE ALL ON TABLE public\.whatsapp_otp_challenges FROM PUBLIC, anon, authenticated/);
assert.match(migrationSource, /GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public\.whatsapp_otp_challenges TO service_role/);
assert.match(migrationSource, /protect_whatsapp_verification_state_trigger/);
assert.match(migrationSource, /whatsapp_verified_number = whatsapp_number/);
assert.match(uniquenessMigrationSource, /communication_preferences_whatsapp_number_format_check/);
assert.match(uniquenessMigrationSource, /CREATE UNIQUE INDEX communication_preferences_whatsapp_number_unique_idx/);
assert.match(uniquenessMigrationSource, /WHERE whatsapp_number IS NOT NULL/);

console.log("WhatsApp OTP tests passed.");
