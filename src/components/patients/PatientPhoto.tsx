import { useEffect, useMemo, useState } from 'react';
import { UserRound } from 'lucide-react';
import { createPatientPhotoSignedUrl } from '../../services/patientPhoto';

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
  const [signedUrl, setSignedUrl] = useState('');
  const initials = useMemo(() => getInitials(patientName), [patientName]);

  useEffect(() => {
    let active = true;
    setSignedUrl('');
    if (!photoPath) return () => { active = false; };

    void createPatientPhotoSignedUrl(photoPath)
      .then((url) => {
        if (active) setSignedUrl(url);
      })
      .catch((error) => {
        console.warn('[PatientPhoto] Não foi possível carregar a foto privada:', error);
      });

    return () => { active = false; };
  }, [photoPath]);

  return (
    <div
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full border border-brand-border bg-brand-primary/10 text-brand-primary ${className}`}
      role={!signedUrl ? 'img' : undefined}
      aria-label={!signedUrl ? `Paciente ${patientName || 'sem foto'}` : undefined}
    >
      {signedUrl ? (
        <img src={signedUrl} alt={`Foto de ${patientName || 'paciente'}`} className="h-full w-full object-cover" />
      ) : initials ? (
        <span className="text-sm font-bold" aria-hidden="true">{initials}</span>
      ) : (
        <UserRound className="h-1/2 w-1/2" aria-hidden="true" />
      )}
    </div>
  );
}
