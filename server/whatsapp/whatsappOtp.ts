import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { maskWhatsAppPhone, normalizeWhatsAppPhone } from "./whatsappClient.js";
import type { WhatsAppClient } from "./whatsappClient.js";

const OTP_LENGTH = 6;
const OTP_TTL_MS = 5 * 60 * 1000;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_RATE_LIMIT_WINDOW_MS = 60 * 60 * 1000;
const OTP_MAX_REQUESTS_PER_WINDOW = 5;
const OTP_MAX_ATTEMPTS = 5;

export type WhatsAppOtpConfig = {
  secret: string;
  templateName: string;
  languageCode: string;
};

export type WhatsAppOtpChallengeRow = {
  id: string;
  user_id: string;
  phone_number: string;
  code_digest: string;
  attempt_count: number;
  max_attempts: number;
  expires_at: string;
  resend_available_at: string;
  verified_at: string | null;
};

export class WhatsAppOtpError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly httpStatus: number,
    public readonly retryAfterSeconds: number | null = null,
  ) {
    super(message);
    this.name = "WhatsAppOtpError";
  }
}

type WhatsAppOtpDependencies = {
  supabaseAdmin: any;
  whatsappClient: WhatsAppClient;
  config: WhatsAppOtpConfig;
  now?: () => Date;
  generateCode?: () => string;
  generateId?: () => string;
  logger?: Pick<Console, "info" | "warn" | "error">;
};

export function getWhatsAppOtpConfigFromEnv(env: NodeJS.ProcessEnv = process.env): WhatsAppOtpConfig {
  return {
    secret: String(env.WHATSAPP_OTP_SECRET || env.WHATSAPP_APP_SECRET || env.WHATSAPP_ACCESS_TOKEN || "").trim(),
    templateName: String(env.WHATSAPP_AUTH_TEMPLATE || "ativacao_whatsapp_profissional").trim(),
    languageCode: String(env.WHATSAPP_AUTH_TEMPLATE_LANGUAGE || "pt_BR").trim(),
  };
}

export function generateWhatsAppOtpCode(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

export function digestWhatsAppOtp(input: {
  secret: string;
  challengeId: string;
  userId: string;
  phoneNumber: string;
  code: string;
}): string {
  return createHmac("sha256", input.secret)
    .update(`${input.challengeId}:${input.userId}:${input.phoneNumber}:${input.code}`)
    .digest("hex");
}

export function verifyWhatsAppOtpDigest(expectedDigest: string, actualDigest: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(expectedDigest) || !/^[0-9a-f]{64}$/.test(actualDigest)) return false;
  const expected = Buffer.from(expectedDigest, "hex");
  const actual = Buffer.from(actualDigest, "hex");
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

export function buildWhatsAppOtpTemplateComponents(code: string) {
  if (!/^\d{6}$/.test(code)) {
    throw new WhatsAppOtpError("Código de verificação inválido.", "invalid_generated_otp", 500);
  }
  return [
    { type: "body" as const, parameters: [{ type: "text" as const, text: code }] },
    { type: "button" as const, sub_type: "url" as const, index: "0", parameters: [{ type: "text" as const, text: code }] },
  ];
}

function assertOtpConfiguration(config: WhatsAppOtpConfig) {
  if (config.secret.length < 32) {
    throw new WhatsAppOtpError(
      "A verificação do WhatsApp ainda não está disponível.",
      "otp_not_configured",
      503,
    );
  }
  if (!/^[a-z0-9_]+$/.test(config.templateName) || !/^[a-z]{2}(?:_[A-Z]{2})?$/.test(config.languageCode)) {
    throw new WhatsAppOtpError(
      "O template de verificação do WhatsApp não está configurado corretamente.",
      "otp_template_not_configured",
      503,
    );
  }
}

function secondsUntil(timestamp: string, now: Date): number {
  return Math.max(1, Math.ceil((new Date(timestamp).getTime() - now.getTime()) / 1000));
}

export function createWhatsAppOtpService(deps: WhatsAppOtpDependencies) {
  const now = deps.now || (() => new Date());
  const generateCode = deps.generateCode || generateWhatsAppOtpCode;
  const generateId = deps.generateId || randomUUID;
  const logger = deps.logger || console;

  return {
    async requestCode(userId: string, rawPhoneNumber: string) {
      assertOtpConfiguration(deps.config);
      const phoneNumber = normalizeWhatsAppPhone(rawPhoneNumber);
      const requestedAt = now();

      const { data: preferences, error: preferencesError } = await deps.supabaseAdmin
        .from("communication_preferences")
        .select("whatsapp_number, whatsapp_verified_number, whatsapp_verified_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (preferencesError) throw new WhatsAppOtpError("Não foi possível consultar o WhatsApp cadastrado.", "preferences_lookup_failed", 500);
      if (
        preferences?.whatsapp_verified_at
        && preferences.whatsapp_number === phoneNumber
        && preferences.whatsapp_verified_number === phoneNumber
      ) {
        return {
          success: true,
          alreadyVerified: true,
          requestId: null,
          maskedPhone: maskWhatsAppPhone(phoneNumber),
          expiresInSeconds: 0,
          resendAfterSeconds: 0,
        };
      }

      const { data: latest, error: latestError } = await deps.supabaseAdmin
        .from("whatsapp_otp_challenges")
        .select("resend_available_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (latestError) throw new WhatsAppOtpError("Não foi possível iniciar a verificação.", "challenge_lookup_failed", 500);
      if (latest?.resend_available_at && new Date(latest.resend_available_at).getTime() > requestedAt.getTime()) {
        const retryAfter = secondsUntil(latest.resend_available_at, requestedAt);
        throw new WhatsAppOtpError(
          `Aguarde ${retryAfter} segundos para solicitar um novo código.`,
          "otp_resend_cooldown",
          429,
          retryAfter,
        );
      }

      const windowStart = new Date(requestedAt.getTime() - OTP_RATE_LIMIT_WINDOW_MS).toISOString();
      const { count, error: countError } = await deps.supabaseAdmin
        .from("whatsapp_otp_challenges")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .gte("created_at", windowStart);
      if (countError) throw new WhatsAppOtpError("Não foi possível validar o limite de envios.", "rate_limit_lookup_failed", 500);
      if ((count || 0) >= OTP_MAX_REQUESTS_PER_WINDOW) {
        throw new WhatsAppOtpError(
          "Muitas solicitações de código. Tente novamente em até uma hora.",
          "otp_hourly_limit",
          429,
          3600,
        );
      }

      const code = generateCode();
      if (!/^\d{6}$/.test(code)) throw new Error("O gerador de OTP retornou um código inválido.");
      const challengeId = generateId();
      const expiresAt = new Date(requestedAt.getTime() + OTP_TTL_MS);
      const resendAvailableAt = new Date(requestedAt.getTime() + OTP_RESEND_COOLDOWN_MS);
      const codeDigest = digestWhatsAppOtp({
        secret: deps.config.secret,
        challengeId,
        userId,
        phoneNumber,
        code,
      });

      const { error: insertError } = await deps.supabaseAdmin
        .from("whatsapp_otp_challenges")
        .insert({
          id: challengeId,
          user_id: userId,
          phone_number: phoneNumber,
          code_digest: codeDigest,
          attempt_count: 0,
          max_attempts: OTP_MAX_ATTEMPTS,
          expires_at: expiresAt.toISOString(),
          resend_available_at: resendAvailableAt.toISOString(),
          send_status: "pending",
          created_at: requestedAt.toISOString(),
          updated_at: requestedAt.toISOString(),
        });
      if (insertError) throw new WhatsAppOtpError("Não foi possível registrar a solicitação do código.", "challenge_create_failed", 500);

      const sendResult = await deps.whatsappClient.sendTemplate({
        userId,
        lifecycleDispatchId: null,
        recipientPhone: phoneNumber,
        type: "template",
        templateName: deps.config.templateName,
        languageCode: deps.config.languageCode,
        components: buildWhatsAppOtpTemplateComponents(code),
      });

      const challengeUpdate = sendResult.success
        ? {
            delivery_id: sendResult.deliveryId,
            send_status: "accepted",
            updated_at: now().toISOString(),
          }
        : {
            delivery_id: sendResult.deliveryId,
            send_status: "failed",
            expires_at: now().toISOString(),
            resend_available_at: now().toISOString(),
            updated_at: now().toISOString(),
          };
      const { error: updateError } = await deps.supabaseAdmin
        .from("whatsapp_otp_challenges")
        .update(challengeUpdate)
        .eq("id", challengeId)
        .eq("user_id", userId);
      if (updateError) logger.warn(`[WhatsApp OTP] Não foi possível atualizar o desafio ${challengeId}.`);

      if (!sendResult.success) {
        logger.warn(`[WhatsApp OTP] Envio rejeitado. userId=${userId} code=${sendResult.errorCode || "unknown"}`);
        throw new WhatsAppOtpError(
          "Não foi possível enviar o código pelo WhatsApp agora. Confira o número e tente novamente.",
          "otp_delivery_failed",
          sendResult.status === "not_configured" ? 503 : 502,
        );
      }

      logger.info(`[WhatsApp OTP] Código solicitado. userId=${userId} challengeId=${challengeId}`);
      return {
        success: true,
        alreadyVerified: false,
        requestId: challengeId,
        maskedPhone: maskWhatsAppPhone(phoneNumber),
        expiresInSeconds: Math.floor(OTP_TTL_MS / 1000),
        resendAfterSeconds: Math.floor(OTP_RESEND_COOLDOWN_MS / 1000),
      };
    },

    async verifyCode(userId: string, requestId: string, rawCode: string) {
      assertOtpConfiguration(deps.config);
      const code = String(rawCode || "").trim();
      if (!/^[0-9]{6}$/.test(code)) {
        throw new WhatsAppOtpError("Informe o código de 6 dígitos.", "invalid_otp_format", 400);
      }
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(requestId)) {
        throw new WhatsAppOtpError("Solicitação de verificação inválida.", "invalid_request_id", 400);
      }

      const { data: challenge, error } = await deps.supabaseAdmin
        .from("whatsapp_otp_challenges")
        .select("id, user_id, phone_number, code_digest, attempt_count, max_attempts, expires_at, resend_available_at, verified_at")
        .eq("id", requestId)
        .eq("user_id", userId)
        .maybeSingle();
      if (error) throw new WhatsAppOtpError("Não foi possível validar o código.", "challenge_lookup_failed", 500);
      if (!challenge) throw new WhatsAppOtpError("Código inválido ou expirado.", "otp_invalid_or_expired", 400);

      const row = challenge as WhatsAppOtpChallengeRow;
      const verifiedAt = now();
      if (row.verified_at) {
        return { success: true, phoneNumber: row.phone_number, verifiedAt: row.verified_at };
      }
      if (new Date(row.expires_at).getTime() <= verifiedAt.getTime()) {
        throw new WhatsAppOtpError("Este código expirou. Solicite um novo.", "otp_expired", 410);
      }
      if (row.attempt_count >= row.max_attempts) {
        throw new WhatsAppOtpError("Limite de tentativas atingido. Solicite um novo código.", "otp_attempts_exhausted", 429);
      }

      const actualDigest = digestWhatsAppOtp({
        secret: deps.config.secret,
        challengeId: row.id,
        userId,
        phoneNumber: row.phone_number,
        code,
      });
      if (!verifyWhatsAppOtpDigest(row.code_digest, actualDigest)) {
        const nextAttemptCount = row.attempt_count + 1;
        const { error: attemptError } = await deps.supabaseAdmin
          .from("whatsapp_otp_challenges")
          .update({ attempt_count: nextAttemptCount, updated_at: verifiedAt.toISOString() })
          .eq("id", row.id)
          .eq("user_id", userId)
          .eq("attempt_count", row.attempt_count);
        if (attemptError) throw new WhatsAppOtpError("Não foi possível registrar a tentativa.", "attempt_update_failed", 500);
        const remaining = Math.max(0, row.max_attempts - nextAttemptCount);
        throw new WhatsAppOtpError(
          remaining > 0
            ? `Código incorreto. Você ainda tem ${remaining} tentativa${remaining === 1 ? "" : "s"}.`
            : "Limite de tentativas atingido. Solicite um novo código.",
          remaining > 0 ? "otp_incorrect" : "otp_attempts_exhausted",
          remaining > 0 ? 400 : 429,
        );
      }

      const verifiedIso = verifiedAt.toISOString();
      const { error: preferencesUpdateError } = await deps.supabaseAdmin
        .from("communication_preferences")
        .upsert({
          user_id: userId,
          whatsapp_number: row.phone_number,
          whatsapp_verified_number: row.phone_number,
          whatsapp_verified_at: verifiedIso,
        }, { onConflict: "user_id" });
      if (preferencesUpdateError) {
        throw new WhatsAppOtpError("Não foi possível salvar o WhatsApp verificado.", "preferences_update_failed", 500);
      }

      const { error: verificationError } = await deps.supabaseAdmin
        .from("whatsapp_otp_challenges")
        .update({ verified_at: verifiedIso, updated_at: verifiedIso })
        .eq("id", row.id)
        .eq("user_id", userId)
        .is("verified_at", null);
      if (verificationError) throw new WhatsAppOtpError("Não foi possível concluir a verificação.", "verification_update_failed", 500);

      logger.info(`[WhatsApp OTP] Número verificado. userId=${userId} challengeId=${row.id}`);
      return { success: true, phoneNumber: row.phone_number, verifiedAt: verifiedIso };
    },
  };
}

export type WhatsAppOtpService = ReturnType<typeof createWhatsAppOtpService>;

export function registerWhatsAppOtpRoutes(
  app: any,
  input: { requireAuth: any; service: WhatsAppOtpService },
) {
  const handleError = (error: unknown, res: any) => {
    if (error instanceof WhatsAppOtpError) {
      if (error.retryAfterSeconds) res.setHeader("Retry-After", String(error.retryAfterSeconds));
      return res.status(error.httpStatus).json({
        success: false,
        error: error.message,
        code: error.code,
        retryAfterSeconds: error.retryAfterSeconds,
      });
    }
    console.error("[WhatsApp OTP] Erro inesperado:", error instanceof Error ? error.message : error);
    return res.status(500).json({ success: false, error: "Não foi possível concluir a verificação do WhatsApp.", code: "otp_internal_error" });
  };

  app.post("/api/onboarding/whatsapp-verification/request", input.requireAuth, async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const phoneNumber = String(req.body?.phoneNumber || "");
      return res.json(await input.service.requestCode(req.user.id, phoneNumber));
    } catch (error) {
      return handleError(error, res);
    }
  });

  app.post("/api/onboarding/whatsapp-verification/verify", input.requireAuth, async (req: any, res: any) => {
    res.setHeader("Cache-Control", "no-store");
    try {
      const requestId = String(req.body?.requestId || "");
      const code = String(req.body?.code || "");
      return res.json(await input.service.verifyCode(req.user.id, requestId, code));
    } catch (error) {
      return handleError(error, res);
    }
  });
}
