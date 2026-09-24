export type PatientGoogleSetupValues = {
  target_folder_id?: string | null;
  google_doc_id?: string | null;
};

export type PatientGoogleSetupState =
  | 'complete'
  | 'missing-folder'
  | 'missing-document'
  | 'missing-both';

const hasValue = (value: string | null | undefined) => Boolean(String(value || '').trim());

export const getPatientGoogleSetupState = (
  values: PatientGoogleSetupValues,
): PatientGoogleSetupState => {
  const hasFolder = hasValue(values.target_folder_id);
  const hasDocument = hasValue(values.google_doc_id);

  if (hasFolder && hasDocument) return 'complete';
  if (!hasFolder && !hasDocument) return 'missing-both';
  if (!hasFolder) return 'missing-folder';
  return 'missing-document';
};

export const getPatientGoogleSetupAlert = (state: Exclude<PatientGoogleSetupState, 'complete'>) => {
  if (state === 'missing-document') {
    return {
      title: 'Vincule o prontuário do paciente',
      message: 'A pasta do Google Drive já está definida. Antes de salvar, crie um novo prontuário ou selecione um documento existente.',
    };
  }

  if (state === 'missing-both') {
    return {
      title: 'Configure o prontuário do paciente',
      message: 'Antes de salvar o paciente, selecione ou crie uma pasta no Google Drive e, em seguida, crie um novo prontuário ou selecione um documento existente.',
    };
  }

  return {
    title: 'Configure o prontuário do paciente',
    message: 'Antes de salvar o paciente, selecione ou crie uma pasta no Google Drive para organizar o prontuário. Depois, crie um novo prontuário ou selecione um documento existente.',
  };
};
