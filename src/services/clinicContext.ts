export type ClinicOrganization = {
  id: string;
  name: string;
  tradeName: string | null;
  operationalStatus: string;
  membershipRole: string;
  clinicalAccessEnabled: boolean;
  planCode: string | null;
  planLabel: string | null;
  entitlementMode: string;
  accessSource: string;
  licenseActive: boolean;
};

export type ClinicContextsPayload = {
  personal: { available: boolean };
  accessMode: "personal" | "hybrid" | "clinic_only";
  organizations: ClinicOrganization[];
};

export class ClinicContextApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "ClinicContextApiError";
  }
}

export async function fetchClinicContexts(accessToken: string): Promise<ClinicContextsPayload> {
  const response = await fetch("/api/clinic/contexts", {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ClinicContextApiError(response.status, typeof body?.error === "string" ? body.error : "context_resolution_failed");
  }

  return {
    personal: { available: body?.personal?.available !== false },
    accessMode: body?.accessMode === "clinic_only" || body?.accessMode === "hybrid" ? body.accessMode : "personal",
    organizations: Array.isArray(body?.organizations) ? body.organizations.map((organization: any) => ({
      id: String(organization.id),
      name: String(organization.name || "Clínica"),
      tradeName: organization.tradeName == null ? null : String(organization.tradeName),
      operationalStatus: String(organization.operationalStatus || "active"),
      membershipRole: String(organization.membershipRole || "professional"),
      clinicalAccessEnabled: organization.clinicalAccessEnabled === true,
      planCode: organization.planCode == null ? null : String(organization.planCode),
      planLabel: organization.planLabel == null ? null : String(organization.planLabel),
      entitlementMode: String(organization.entitlementMode || "none"),
      accessSource: String(organization.accessSource || "organization_membership"),
      licenseActive: organization.licenseActive === true,
    })) : [],
  };
}

