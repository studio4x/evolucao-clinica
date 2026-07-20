import React, { useEffect, useState } from 'react';

interface UserAvatarProps {
  name?: string | null;
  email?: string | null;
  src?: string | null;
  className?: string;
  title?: string;
}

const getInitials = (name?: string | null, email?: string | null) => {
  const value = (name || email || 'Profissional').trim();
  const parts = value.split(/\s+/).filter(Boolean);
  return parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
    : value.slice(0, 2).toUpperCase();
};

export const UserAvatar = ({ name, email, src, className = 'h-10 w-10', title }: UserAvatarProps) => {
  const [failedSource, setFailedSource] = useState<string | null>(null);
  const displayName = name || email || 'Profissional';
  const hasValidSource = Boolean(src && failedSource !== src);

  useEffect(() => {
    setFailedSource(null);
  }, [src]);

  if (hasValidSource) {
    return (
      <img
        src={src || undefined}
        alt={displayName}
        title={title}
        className={`${className} flex-shrink-0 rounded-full object-cover`}
        referrerPolicy="no-referrer"
        onError={() => setFailedSource(src || null)}
      />
    );
  }

  return (
    <div
      title={title}
      aria-label={displayName}
      className={`${className} flex flex-shrink-0 items-center justify-center rounded-full bg-brand-primary/10 font-semibold text-brand-primary`}
    >
      {getInitials(name, email)}
    </div>
  );
};
