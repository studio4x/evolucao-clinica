export type ClinicOrganization = {
  id: string;
  name: string;
  tradeName: string | null;
  operationalStatus: string;
  membershipRole: string;
  clinicalAccessEnabled: boolean;
};

export type ClinicContextsPayload = {
  personal: { available: true };
  organizations: ClinicOrganization[];
};

export class ClinicContextApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "ClinicContextApiError";
  }
}

export async function fetchClinicContexts(accessToken: string): Promise<ClinicContextsPayload> {
  console.info("[Clinic2CDiag]", "F1", { fetch_started: true });
  const response = await fetch("/api/clinic/contexts", {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));
  console.info("[Clinic2CDiag]", "F2/F3/F4", { status: response.status, error: typeof body?.error === "string" ? body.error : null, organizations_count: Array.isArray(body?.organizations) ? body.organizations.length : null });

  if (!response.ok) {
    throw new ClinicContextApiError(response.status, typeof body?.error === "string" ? body.error : "context_resolution_failed");
  }

  return {
    personal: { available: true },
    organizations: Array.isArray(body?.organizations) ? body.organizations : [],
  };
}

