export type EvolutionContext = { type:"personal"; patientId:string } | {
  type:"organization"; organizationId:string; organizationPatientId:string; patientId:string;
};

export function draftMatchesEvolutionContext(draft:{ patientId:string; contextKind?:string; organizationPatientId?:string; professionalId?:string; evolutionData?:any },context:EvolutionContext,professionalId:string) {
  if ((draft.professionalId || draft.evolutionData?.professional_id) !== professionalId || draft.patientId !== context.patientId) return false;
  return context.type === "personal" ? draft.contextKind !== "organization" && !draft.organizationPatientId && !draft.evolutionData?.organization_id
    : draft.contextKind === "organization" && draft.organizationPatientId === context.organizationPatientId
      && draft.evolutionData?.organization_id === context.organizationId
      && draft.evolutionData?.organization_patient_id === context.organizationPatientId
      && draft.evolutionData?.patient_id === context.patientId;
}
