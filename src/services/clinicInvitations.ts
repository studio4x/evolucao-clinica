export type ClinicInvitation = {
  invitation_id: string; normalized_email: string; intended_role: "manager" | "professional";
  intended_clinical_access: boolean; status: string; expires_at: string; invited_by: string;
  delivery_status: "pending" | "sent" | "failed"; sent_at: string | null; delivery_attempt: number;
};
export class ClinicInvitationError extends Error {
  constructor(public code: string) { super(code); }
}
export async function invitationRequest(path = "", accessToken?: string, body?: unknown) {
  const response = await fetch(`/api/clinic/invitations${path}`, {
    method: body === undefined ? "GET" : "POST", credentials: "same-origin", cache: "no-store",
    headers: { ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ClinicInvitationError(typeof data.error === "string" ? data.error : "invitation_operation_failed");
  return data;
}
export function invitationErrorMessage(error: unknown) {
  const code = error instanceof ClinicInvitationError ? error.code : "invitation_operation_failed";
  const messages: Record<string, string> = {
    delivery_unavailable: "O envio de convites ainda não está habilitado neste ambiente.",
    pending_invitation_exists: "Já existe um convite pendente para este e-mail.",
    no_clinical_seats: "Não há licenças clínicas disponíveis.",
    rate_limited: "Aguarde antes de enviar outro convite ou reenviar esta mensagem.",
    email_mismatch: "Este convite foi enviado para outro endereço de e-mail. Entre com o endereço que recebeu o convite.",
    email_unconfirmed: "Confirme seu e-mail antes de aceitar o convite.",
    invitation_unavailable: "Convite inválido, expirado ou indisponível. Solicite um novo convite à clínica.",
    authentication_required: "Entre ou crie sua conta para continuar.",
  };
  return messages[code] || "Não foi possível concluir esta operação. Confira seu acesso à clínica e tente novamente.";
}
