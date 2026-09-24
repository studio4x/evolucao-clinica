import type { AnamnesisAnswers, AnamnesisField } from './anamnesis';
import type { AnamnesisPatientContext } from './anamnesisSchema';

export const isNativePatientField = (field: AnamnesisField) => Boolean(field.patientReference);

export const getAnamnesisFieldAnswerKey = (field: AnamnesisField) => field.id || field.key;

export function resolveAnamnesisFieldValue(field: AnamnesisField, answers: AnamnesisAnswers, patient?: Partial<AnamnesisPatientContext> | null): AnamnesisAnswers[string] {
  if (!field.patientReference) return answers[getAnamnesisFieldAnswerKey(field)] ?? answers[field.key];
  return patient?.[field.patientReference] ?? null;
}

export function buildPatientContextSnapshot(patient?: Partial<AnamnesisPatientContext> | null) {
  return {
    full_name: patient?.full_name ?? null,
    birth_date: patient?.birth_date ?? null,
    cpf: patient?.cpf ?? null,
    phone: patient?.phone ?? null,
    postal_code: patient?.postal_code ?? null,
    street: patient?.street ?? null,
    address_number: patient?.address_number ?? null,
    address_complement: patient?.address_complement ?? null,
    neighborhood: patient?.neighborhood ?? null,
    city: patient?.city ?? null,
    state: patient?.state ?? null,
  };
}
