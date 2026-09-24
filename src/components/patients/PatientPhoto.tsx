import { useMemo } from 'react';
import { UserRound } from 'lucide-react';

type PatientPhotoProps = {
  photoPath?: string | null;
  patientName?: string | null;
  className?: string;
};

const getInitials = (name: string | null | undefined) => String(name || '')
  .trim()
  .split(/\s+/)
  .slice(0, 2)
  .map((part) => part.charAt(0).toUpperCase())
  .join('');

export function PatientPhoto({ photoPath, patientName, className = 'h-12 w-12' }: PatientPhotoProps) {
  const initials = useMemo(() => getInitials(patientName), [patientName]);
  const signedUrl = photoPath || '';

  return <div className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-border bg-brand-primary/10 text-brand-primary ${className}`} role={!signedUrl ? 'img' : undefined} aria-label={!signedUrl ? `Paciente ${patientName || 'sem foto'}` : undefined}>
    {signedUrl ? <img src={signedUrl} alt={`Foto de ${patientName || 'paciente'}`} className="h-full w-full object-cover" /> : initials ? <span className="text-sm font-bold" aria-hidden="true">{initials}</span> : <UserRound className="h-1/2 w-1/2" aria-hidden="true" />}
  </div>;
}
