export type ClinicPatientAssignmentRole = "primary" | "secondary" | "consultant";

export type ClinicPatientAssignment = {
  id: string;
  professionalId: string;
  fullName: string | null;
  professionalTitle: string | null;
  assignmentRole: ClinicPatientAssignmentRole;
  status: "active" | "revoked";
  canEdit: boolean;
  canViewSharedSummary: boolean;
  assignedAt: string;
};

export type ClinicPatientSummary = {
  organization_patient_id: string;
  patient_id: string;
  full_name: string;
  birth_date: string | null;
  phone: string | null;
  status: "active" | "archived";
  primary_professional_id: string;
  primary_professional_name: string | null;
  current_assignment_role: ClinicPatientAssignmentRole | null;
  assignment_count: number;
  created_at: string;
  updated_at: string;
};

export type ClinicPatientDetail = {
  organizationPatientId: string;
  organizationId: string;
  patientId: string;
  status: "active" | "archived";
  fullName: string;
  birthDate: string | null;
  phone: string | null;
  patientStatus: string;
  createdAt: string;
  updatedAt: string;
  currentAssignmentRole: ClinicPatientAssignmentRole | null;
  assignments: ClinicPatientAssignment[];
};

export class ClinicPatientsApiError extends Error {
  constructor(public readonly status: number, public readonly code: string) {
    super(code);
    this.name = "ClinicPatientsApiError";
  }
}

async function readResponse(response: Response) {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new ClinicPatientsApiError(response.status, typeof body?.error === "string" ? body.error : "patient_operation_failed");
  return body;
}

function authHeaders(accessToken: string, json = false) {
  return { ...(json ? { "Content-Type": "application/json" } : {}), Authorization: `Bearer ${accessToken}` };
}

export async function fetchClinicPatients(accessToken: string, organizationId: string, search = "") {
  const query = new URLSearchParams({ organizationId });
  if (search.trim()) query.set("search", search.trim());
  const body = await readResponse(await fetch(`/api/clinic/patients?${query.toString()}`, { cache: "no-store", headers: authHeaders(accessToken) }));
  return (Array.isArray(body?.patients) ? body.patients : []) as ClinicPatientSummary[];
}

export async function fetchClinicPatient(accessToken: string, organizationPatientId: string) {
  const body = await readResponse(await fetch(`/api/clinic/patients/${encodeURIComponent(organizationPatientId)}`, { cache: "no-store", headers: authHeaders(accessToken) }));
  return body.patient as ClinicPatientDetail;
}

export async function createClinicPatient(accessToken: string, input: {
  organizationId: string;
  fullName: string;
  birthDate: string | null;
  phone: string | null;
  primaryProfessionalId: string;
  secondaryProfessionalIds: string[];
  consultantProfessionalIds: string[];
}) {
  const body = await readResponse(await fetch("/api/clinic/patients", { method: "POST", headers: authHeaders(accessToken, true), body: JSON.stringify(input) }));
  return body.patient as { organization_patient_id: string; patient_id: string };
}

export async function updateClinicPatient(accessToken: string, organizationPatientId: string, input: { fullName: string; birthDate: string | null; phone: string | null; status?: "active" | "archived" }) {
  const body = await readResponse(await fetch(`/api/clinic/patients/${encodeURIComponent(organizationPatientId)}`, { method: "PATCH", headers: authHeaders(accessToken, true), body: JSON.stringify(input) }));
  return body.patient as ClinicPatientDetail;
}

export async function addClinicPatientAssignment(accessToken: string, organizationPatientId: string, professionalId: string, assignmentRole: "secondary" | "consultant") {
  const body = await readResponse(await fetch(`/api/clinic/patients/${encodeURIComponent(organizationPatientId)}/assignments`, { method: "POST", headers: authHeaders(accessToken, true), body: JSON.stringify({ professionalId, assignmentRole }) }));
  return body.assignment as ClinicPatientAssignment;
}

export async function revokeClinicPatientAssignment(accessToken: string, organizationPatientId: string, assignmentId: string) {
  const body = await readResponse(await fetch(`/api/clinic/patients/${encodeURIComponent(organizationPatientId)}/assignments/${encodeURIComponent(assignmentId)}`, { method: "DELETE", headers: authHeaders(accessToken) }));
  return body.assignment as ClinicPatientAssignment;
}
