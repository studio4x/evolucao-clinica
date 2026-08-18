export type JourneyGroupMembershipStatus = "member" | "not_member";

export type JourneyGroupMembershipResult = {
  ok: true;
  status: JourneyGroupMembershipStatus;
  member: boolean;
  professionalId: string;
  checkedAt: string;
  participantCount: number | null;
};

export class JourneyGroupMembershipError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.name = "JourneyGroupMembershipError";
    this.statusCode = statusCode;
    this.code = code;
  }
}

type CheckJourneyGroupMembershipInput = {
  webhookUrl: string | undefined;
  webhookToken: string | undefined;
  professionalId: string;
  phoneNumber: string;
  requestId?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

const validateWebhookUrl = (value: string | undefined) => {
  const rawUrl = String(value || "").trim();
  if (!rawUrl) {
    throw new JourneyGroupMembershipError(503, "webhook_not_configured", "Webhook de verificação do grupo não configurado.");
  }

  try {
    const url = new URL(rawUrl);
    if (url.protocol !== "https:") throw new Error("HTTPS obrigatório.");
    return url.toString();
  } catch {
    throw new JourneyGroupMembershipError(503, "webhook_invalid_url", "URL do webhook de verificação do grupo inválida.");
  }
};

const validateWebhookToken = (value: string | undefined) => {
  const token = String(value || "").trim();
  if (!token) {
    throw new JourneyGroupMembershipError(503, "webhook_token_not_configured", "Token do webhook de verificação do grupo não configurado.");
  }
  return token;
};

export async function checkJourneyGroupMembership(input: CheckJourneyGroupMembershipInput): Promise<JourneyGroupMembershipResult> {
  const webhookUrl = validateWebhookUrl(input.webhookUrl);
  const webhookToken = validateWebhookToken(input.webhookToken);
  const timeoutMs = Math.max(1_000, Math.min(input.timeoutMs || 15_000, 30_000));
  const fetchImpl = input.fetchImpl || fetch;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${webhookToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        professionalId: input.professionalId,
        phoneNumber: input.phoneNumber,
        requestId: input.requestId
      }),
      signal: controller.signal
    });
  } catch (error) {
    const isTimeout = error instanceof Error && error.name === "AbortError";
    throw new JourneyGroupMembershipError(
      502,
      isTimeout ? "webhook_timeout" : "webhook_unavailable",
      isTimeout ? "A verificação no grupo excedeu o tempo limite." : "Não foi possível consultar o grupo da Jornada."
    );
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (!response.ok) {
    const upstreamCode = typeof payload?.error === "string" ? payload.error : "webhook_error";
    throw new JourneyGroupMembershipError(502, upstreamCode, "O n8n não conseguiu concluir a verificação no grupo.");
  }

  const status = payload?.status;
  const member = payload?.member;
  if (
    (status !== "member" && status !== "not_member") ||
    (status === "member" && member !== true) ||
    (status === "not_member" && member !== false)
  ) {
    throw new JourneyGroupMembershipError(502, "webhook_invalid_response", "O n8n retornou uma resposta inválida.");
  }

  const participantCount = Number(payload?.participantCount);
  return {
    ok: true,
    status,
    member,
    professionalId: input.professionalId,
    checkedAt: typeof payload?.checkedAt === "string" ? payload.checkedAt : new Date().toISOString(),
    participantCount: Number.isInteger(participantCount) && participantCount >= 0 ? participantCount : null
  };
}
