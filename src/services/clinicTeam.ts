export type ClinicTeamMember = {
  membership_id: string;
  professional_id: string;
  full_name: string | null;
  professional_title: string | null;
  membership_role: "owner" | "manager" | "professional";
  status: "active" | "suspended";
  clinical_access_enabled: boolean;
  joined_at: string;
  suspended_at: string | null;
};

export class ClinicTeamApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "ClinicTeamApiError";
  }
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new ClinicTeamApiError(
      response.status,
      typeof body?.error === "string" ? body.error : "team_operation_failed",
    );
  }
  return body;
}

export async function fetchClinicTeam(accessToken: string, organizationId: string): Promise<ClinicTeamMember[]> {
  const response = await fetch(`/api/clinic/team?organizationId=${encodeURIComponent(organizationId)}`, {
    method: "GET",
    cache: "no-store",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const body = await readResponse(response);
  return Array.isArray(body?.members) ? body.members : [];
}

type LifecycleAction = "suspend" | "reactivate" | "remove";

export async function mutateClinicTeamMember(
  accessToken: string,
  organizationId: string,
  professionalId: string,
  action: LifecycleAction,
  reason?: string,
) {
  const response = await fetch(`/api/clinic/team/${encodeURIComponent(professionalId)}/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ organizationId, ...(reason ? { reason } : {}) }),
  });
  return readResponse(response);
}

export async function changeClinicTeamRole(
  accessToken: string,
  organizationId: string,
  professionalId: string,
  newRole: "manager" | "professional",
  reason?: string,
) {
  const response = await fetch(`/api/clinic/team/${encodeURIComponent(professionalId)}/role`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ organizationId, newRole, ...(reason ? { reason } : {}) }),
  });
  return readResponse(response);
}

export async function transferClinicOwner(accessToken: string, organizationId: string, targetProfessionalId: string) {
  const response = await fetch("/api/clinic/team/transfer-owner", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ organizationId, targetProfessionalId }),
  });
  return readResponse(response);
}
