export type HistoryPatient = {
  organizationPatientId?: string | null;
};

export function getHistoryPatientPath(
  patientId: string,
  isClinicalProfessional: boolean,
  patientsMap: Record<string, HistoryPatient>,
) {
  if (!isClinicalProfessional) return `/painel/patients/${patientId}`;

  const organizationPatientId = patientsMap[patientId]?.organizationPatientId;
  return organizationPatientId
    ? `/painel/clinica/pacientes/${organizationPatientId}`
    : '/painel/clinica/pacientes';
}
