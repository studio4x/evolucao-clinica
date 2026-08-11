export const PROFESSIONAL_OPTIONS = [
  'Psicólogo(a)',
  'Neuropsicólogo(a)',
  'Psicoterapeuta',
  'Psicanalista',
  'Psiquiatra',
  'Fonoaudiólogo(a)',
  'Terapeuta Ocupacional',
  'Fisioterapeuta',
  'Fisioterapeuta Neurofuncional',
  'Psicopedagogo(a)',
  'Neuropsicopedagogo(a)',
  'Nutricionista',
  'Enfermeiro(a)',
  'Médico(a) Generalista',
  'Médico(a) Pediatra',
  'Médico(a) Neurologista',
  'Médico(a) Neuropediatra',
  'Médico(a) Fisiatra',
  'Médico(a) Geriatra',
  'Médico(a) Ortopedista',
  'Médico(a) Cardiologista',
  'Médico(a) Dermatologista',
  'Médico(a) Ginecologista e Obstetra',
  'Dentista / Odontólogo(a)',
  'Assistente Social',
  'Musicoterapeuta',
  'Arteterapeuta',
  'Equoterapeuta',
  'Educador(a) Físico(a)',
  'Psicomotricista',
  'Veterinário(a)',
] as const;

export const PROFESSIONAL_REGISTER_PREFIXES: Record<string, string> = {
  'Psicólogo(a)': 'CRP',
  'Neuropsicólogo(a)': 'CRP',
  Psicoterapeuta: 'CRP',
  Psicanalista: 'Registro',
  Psiquiatra: 'CRM',
  'Fonoaudiólogo(a)': 'CRFa',
  'Terapeuta Ocupacional': 'CREFITO',
  Fisioterapeuta: 'CREFITO',
  'Fisioterapeuta Neurofuncional': 'CREFITO',
  'Psicopedagogo(a)': 'CBO',
  'Neuropsicopedagogo(a)': 'CBO',
  Nutricionista: 'CRN',
  'Enfermeiro(a)': 'COREN',
  'Médico(a) Generalista': 'CRM',
  'Médico(a) Pediatra': 'CRM',
  'Médico(a) Neurologista': 'CRM',
  'Médico(a) Neuropediatra': 'CRM',
  'Médico(a) Fisiatra': 'CRM',
  'Médico(a) Geriatra': 'CRM',
  'Médico(a) Ortopedista': 'CRM',
  'Médico(a) Cardiologista': 'CRM',
  'Médico(a) Dermatologista': 'CRM',
  'Médico(a) Ginecologista e Obstetra': 'CRM',
  'Dentista / Odontólogo(a)': 'CRO',
  'Assistente Social': 'CRESS',
  Musicoterapeuta: 'AMT',
  Arteterapeuta: 'AATER',
  Equoterapeuta: 'ANDE',
  'Educador(a) Físico(a)': 'CREF',
  Psicomotricista: 'ABP',
  'Veterinário(a)': 'CRMV',
};

export const WORK_CONTEXT_VALUES = [
  'independent',
  'clinic_professional',
  'clinic_owner_manager',
  'other',
] as const;

export type WorkContext = (typeof WORK_CONTEXT_VALUES)[number];

export const WORK_CONTEXT_OPTIONS: ReadonlyArray<{ value: WorkContext; label: string }> = [
  { value: 'independent', label: 'Atendo por conta própria' },
  { value: 'clinic_professional', label: 'Atendo como profissional em uma clínica ou equipe' },
  { value: 'clinic_owner_manager', label: 'Sou proprietário(a), gestor(a) ou coordenador(a) de clínica' },
  { value: 'other', label: 'Outra situação' },
];

export const isValidWorkContext = (value: unknown): value is WorkContext => (
  typeof value === 'string' && (WORK_CONTEXT_VALUES as readonly string[]).includes(value)
);

export const isDeclaredProfessionalTitle = (value: unknown): value is string => (
  typeof value === 'string' && value.trim().length > 0 && value.trim().toLowerCase() !== 'terapeuta'
);
