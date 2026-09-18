export type ClinicDashboard = Record<string, any>;

export class ClinicOperationalApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "ClinicOperationalApiError";
  }
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ClinicOperationalApiError(response.status, typeof body?.error === "string" ? body.error : "clinic_operation_failed");
  return body;
}

function headers(accessToken: string, json = false) {
  return { Authorization: `Bearer ${accessToken}`, ...(json ? { "Content-Type": "application/json" } : {}) };
}

export async function fetchClinicDashboard(accessToken: string, organizationId: string) {
  const response = await fetch(`/api/clinic/dashboard?organizationId=${encodeURIComponent(organizationId)}`, { cache: "no-store", headers: headers(accessToken) });
  return (await readResponse(response)).dashboard as ClinicDashboard;
}

export type ClinicAuditEvent = Record<string, any>;
export type ClinicAuditCursor = { createdAt: string; id: string } | null;

export async function fetchClinicAudit(accessToken: string, organizationId: string, input: { limit?: number; cursor?: ClinicAuditCursor; eventType?: string } = {}) {
  const query = new URLSearchParams({ organizationId, limit: String(input.limit || 25) });
  if (input.cursor) { query.set("cursorCreatedAt", input.cursor.createdAt); query.set("cursorId", input.cursor.id); }
  if (input.eventType) query.set("eventType", input.eventType);
  const response = await fetch(`/api/clinic/audit?${query.toString()}`, { cache: "no-store", headers: headers(accessToken) });
  const body = await readResponse(response);
  return { events: (Array.isArray(body?.events) ? body.events : []) as ClinicAuditEvent[], nextCursor: (body?.nextCursor || null) as ClinicAuditCursor };
}

async function patientAction(accessToken: string, organizationPatientId: string, action: "archive" | "reactivate") {
  const response = await fetch(`/api/clinic/patients/${encodeURIComponent(organizationPatientId)}/${action}`, { method: "POST", cache: "no-store", headers: headers(accessToken, true), body: "{}" });
  return (await readResponse(response)).patient;
}

export const archiveClinicPatient = (accessToken: string, organizationPatientId: string) => patientAction(accessToken, organizationPatientId, "archive");
export const reactivateClinicPatient = (accessToken: string, organizationPatientId: string) => patientAction(accessToken, organizationPatientId, "reactivate");

export async function reassignClinicPrimary(accessToken: string, organizationPatientId: string, newPrimaryProfessionalId: string, keepPreviousAsSecondary: boolean) {
  const response = await fetch(`/api/clinic/patients/${encodeURIComponent(organizationPatientId)}/reassign-primary`, { method: "POST", cache: "no-store", headers: headers(accessToken, true), body: JSON.stringify({ newPrimaryProfessionalId, keepPreviousAsSecondary }) });
  return (await readResponse(response)).reassignment;
}
