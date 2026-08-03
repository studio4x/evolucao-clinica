import { timingSafeEqual } from "node:crypto";
import { normalizeWhatsAppPhone, WhatsAppValidationError } from "./whatsappClient.js";

export type WhatsAppUserLookupMatchStatus = "found" | "not_found" | "conflict";

export type WhatsAppUserLookupResponse = {
  registered: boolean;
  matchStatus: WhatsAppUserLookupMatchStatus;
  user: { id: string; name: string | null; email: string | null } | null;
};

export class WhatsAppUserLookupValidationError extends Error {
  constructor(message: string) { super(message); this.name = "WhatsAppUserLookupValidationError"; }
}

export function verifyWhatsAppUserLookupAuthorization(authorization: string | undefined, expectedToken: string | undefined): boolean {
  const receivedToken = /^Bearer\s+(.+)$/i.exec(String(authorization || ""))?.[1]?.trim() || "";
  const configuredToken = String(expectedToken || "").trim();
  if (!receivedToken || !configuredToken) return false;
  const received = Buffer.from(receivedToken);
  const expected = Buffer.from(configuredToken);
  return received.length === expected.length && timingSafeEqual(received, expected);
}

export function validateWhatsAppUserLookupPayload(payload: unknown) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) throw new WhatsAppUserLookupValidationError("Payload JSON deve ser um objeto.");
  const input = payload as Record<string, unknown>;
  if (Object.keys(input).some((key) => key !== "phoneNumber")) throw new WhatsAppUserLookupValidationError("Payload contém campos não permitidos.");
  try {
    return { phoneNumber: normalizeWhatsAppPhone(String(input.phoneNumber || "")) };
  } catch (error) {
    throw new WhatsAppUserLookupValidationError(error instanceof WhatsAppValidationError ? error.message : "phoneNumber inválido.");
  }
}

type LookupProfile = { fullName: string | null; email: string | null } | null;
type LookupAuthUser = { id: string; email: string | null; userMetadata: Record<string, unknown> | null } | null;

export type WhatsAppUserLookupDependencies = {
  findUserIdsByPhone(phoneNumber: string): Promise<string[]>;
  findProfileByUserId(userId: string): Promise<LookupProfile>;
  getAuthUserById(userId: string): Promise<LookupAuthUser>;
};

const notFound = (): WhatsAppUserLookupResponse => ({ registered: false, matchStatus: "not_found", user: null });

export async function lookupWhatsAppUser(phoneNumber: string, dependencies: WhatsAppUserLookupDependencies): Promise<WhatsAppUserLookupResponse> {
  const userIds = await dependencies.findUserIdsByPhone(phoneNumber);
  if (userIds.length === 0) return notFound();
  if (userIds.length > 1) return { registered: false, matchStatus: "conflict", user: null };

  const userId = userIds[0]!;
  const [profile, authUser] = await Promise.all([
    dependencies.findProfileByUserId(userId),
    dependencies.getAuthUserById(userId)
  ]);
  if (!authUser) return notFound();

  const metadata = authUser.userMetadata || {};
  const metadataName = [metadata.full_name, metadata.name, metadata.display_name]
    .find((value) => typeof value === "string" && value.trim());
  const name = profile?.fullName?.trim() || (typeof metadataName === "string" ? metadataName.trim() : null);
  const email = profile?.email?.trim() || authUser.email?.trim() || null;
  return { registered: true, matchStatus: "found", user: { id: authUser.id, name, email } };
}

export function safeWhatsAppUserLookupLog(status: WhatsAppUserLookupMatchStatus): string {
  return `[WhatsApp user lookup] status=${status}`;
}
