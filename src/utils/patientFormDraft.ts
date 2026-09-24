export const PATIENT_FORM_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;

export type PatientFormDraft<TFormData> = {
  patientId?: string | null;
  formData: TFormData;
  ddi?: string;
  phoneCountry?: string;
  savedAt: string;
};

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const getBrowserStorage = (kind: 'local' | 'session'): StorageLike | null => {
  if (typeof window === 'undefined') return null;
  try {
    return kind === 'local' ? window.localStorage : window.sessionStorage;
  } catch {
    return null;
  }
};

export const getPatientFormDraftKey = (
  userId: string,
  patientId?: string,
  onboarding = false,
) => {
  const scope = patientId
    ? `edit:${patientId}`
    : `new:${onboarding ? 'onboarding' : 'standard'}`;
  return `evolucao-clinica:patient-form-draft:${userId}:${scope}`;
};

export const getLegacyPatientFormDraftKey = (userId: string, pathname: string) => (
  `evolucao-clinica:patient-form-draft:${userId}:${pathname}`
);

const parseDraft = <TFormData>(raw: string | null, now: number): PatientFormDraft<TFormData> | null => {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PatientFormDraft<TFormData>>;
    const savedAt = Date.parse(String(parsed.savedAt || ''));
    if (!parsed || typeof parsed !== 'object' || !parsed.formData || !Number.isFinite(savedAt)) return null;
    if (now - savedAt > PATIENT_FORM_DRAFT_TTL_MS || savedAt - now > 5 * 60 * 1000) return null;
    return parsed as PatientFormDraft<TFormData>;
  } catch {
    return null;
  }
};

export const readPatientFormDraft = <TFormData>(
  key: string,
  now = Date.now(),
  primaryStorage: StorageLike | null = getBrowserStorage('local'),
  fallbackStorage: StorageLike | null = getBrowserStorage('session'),
): PatientFormDraft<TFormData> | null => {
  const primaryDraft = parseDraft<TFormData>(primaryStorage?.getItem(key) || null, now);
  if (primaryDraft) return primaryDraft;

  const fallbackDraft = parseDraft<TFormData>(fallbackStorage?.getItem(key) || null, now);
  if (fallbackDraft && primaryStorage) {
    try {
      primaryStorage.setItem(key, JSON.stringify(fallbackDraft));
    } catch {
      // A read-only/private browsing storage must not block form recovery.
    }
  }
  return fallbackDraft;
};

export const writePatientFormDraft = <TFormData>(
  key: string,
  draft: PatientFormDraft<TFormData>,
  storage: StorageLike | null = getBrowserStorage('local'),
) => {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
};

export const clearPatientFormDraft = (
  key: string,
  primaryStorage: StorageLike | null = getBrowserStorage('local'),
  fallbackStorage: StorageLike | null = getBrowserStorage('session'),
) => {
  for (const storage of [primaryStorage, fallbackStorage]) {
    try {
      storage?.removeItem(key);
    } catch {
      // Best-effort cleanup only.
    }
  }
};
