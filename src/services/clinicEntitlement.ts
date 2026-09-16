export type ClinicEntitlementMode = "full" | "restricted" | "none";

export type ClinicSeatSummary = {
  organization_id: string;
  plan_code: string;
  billing_interval: "monthly" | "annual";
  contracted_seats: number;
  active_seats: number;
  reserved_seats: number;
  available_seats: number;
  minimum_contracted_seats: number;
  financial_status: "active" | "past_due" | "canceled" | "unpaid";
  grace_period_ends_at: string | null;
  cancel_at_period_end: boolean;
  entitlement_mode: ClinicEntitlementMode;
};

export class ClinicEntitlementApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "ClinicEntitlementApiError";
  }
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ClinicEntitlementApiError(
      response.status,
      typeof body?.error === "string" ? body.error : "entitlement_operation_failed",
    );
  }
  return body;
}

export async function fetchClinicEntitlement(accessToken: string, organizationId: string): Promise<ClinicSeatSummary> {
  const response = await fetch(`/api/clinic/entitlement?organizationId=${encodeURIComponent(organizationId)}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const body = await readResponse(response);
  return body.entitlement as ClinicSeatSummary;
}

export async function setClinicMemberClinicalAccess(
  accessToken: string,
  organizationId: string,
  professionalId: string,
  enabled: boolean,
  reason?: string,
) {
  const response = await fetch(`/api/clinic/team/${encodeURIComponent(professionalId)}/clinical-access`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${accessToken}` },
    body: JSON.stringify({ organizationId, enabled, ...(reason ? { reason } : {}) }),
  });
  return readResponse(response);
}
