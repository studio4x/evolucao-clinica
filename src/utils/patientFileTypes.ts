import {
  Activity,
  Briefcase,
  ClipboardCheck,
  ClipboardList,
  FileCheck2,
  FileText,
  Image,
  ListChecks,
  Send,
  ShieldCheck,
  Tag,
  type LucideIcon,
} from 'lucide-react';

export type PatientFileTypeKey =
  | 'anamnesis'
  | 'assessment'
  | 'report'
  | 'opinion'
  | 'exam'
  | 'referral'
  | 'care_plan'
  | 'consent'
  | 'image'
  | 'administrative'
  | 'other';

export type PatientFileTypeOption = {
  key: PatientFileTypeKey;
  label: string;
  icon: LucideIcon;
};

export const PATIENT_FILE_TYPES: PatientFileTypeOption[] = [
  { key: 'anamnesis', label: 'Anamnese', icon: ClipboardList },
  { key: 'assessment', label: 'Avaliação', icon: ClipboardCheck },
  { key: 'report', label: 'Relatório', icon: FileText },
  { key: 'opinion', label: 'Laudo / Parecer', icon: FileCheck2 },
  { key: 'exam', label: 'Exame / Resultado', icon: Activity },
  { key: 'referral', label: 'Encaminhamento', icon: Send },
  { key: 'care_plan', label: 'Plano de acompanhamento', icon: ListChecks },
  { key: 'consent', label: 'Termo / Consentimento', icon: ShieldCheck },
  { key: 'image', label: 'Imagem / Foto', icon: Image },
  { key: 'administrative', label: 'Documento administrativo', icon: Briefcase },
  { key: 'other', label: 'Outro', icon: Tag },
];

export const getPatientFileType = (key: string | null | undefined) =>
  PATIENT_FILE_TYPES.find((item) => item.key === key) || PATIENT_FILE_TYPES[PATIENT_FILE_TYPES.length - 1];

export const getPatientFileTypeLabel = (key: PatientFileTypeKey) =>
  getPatientFileType(key).label;
