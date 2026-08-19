export const JOURNEY_GROUP_BATCH_CONCURRENCY = 3;

export type ProfessionalSortKey = 'name' | 'created_at' | 'expiration';
export type SortDirection = 'asc' | 'desc';

interface SortableProfessional {
  id: string;
  full_name: string;
  created_at?: string;
  subscription_ends_at?: string;
}

const parseSortableDate = (value?: string) => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isNaN(timestamp) ? null : timestamp;
};

export const sortProfessionals = <T extends SortableProfessional>(
  professionals: readonly T[],
  sortKey: ProfessionalSortKey,
  direction: SortDirection
) => {
  const directionMultiplier = direction === 'asc' ? 1 : -1;

  return [...professionals].sort((a, b) => {
    if (sortKey === 'name') {
      const nameComparison = a.full_name.localeCompare(b.full_name, 'pt-BR', {
        sensitivity: 'base',
        numeric: true
      });
      if (nameComparison !== 0) return nameComparison * directionMultiplier;
    } else {
      const aTimestamp = parseSortableDate(sortKey === 'created_at' ? a.created_at : a.subscription_ends_at);
      const bTimestamp = parseSortableDate(sortKey === 'created_at' ? b.created_at : b.subscription_ends_at);

      // Datas ausentes ou inválidas permanecem no final em ambas as direções.
      if (aTimestamp === null && bTimestamp !== null) return 1;
      if (aTimestamp !== null && bTimestamp === null) return -1;
      if (aTimestamp !== null && bTimestamp !== null && aTimestamp !== bTimestamp) {
        return (aTimestamp - bTimestamp) * directionMultiplier;
      }
    }

    const fallbackNameComparison = a.full_name.localeCompare(b.full_name, 'pt-BR', {
      sensitivity: 'base',
      numeric: true
    });
    if (fallbackNameComparison !== 0) return fallbackNameComparison;
    return a.id.localeCompare(b.id);
  });
};

export const getProfessionalInitials = (fullName: string) => {
  const parts = String(fullName || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('pt-BR');

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toLocaleUpperCase('pt-BR');
};

export const addAvatarCacheBuster = (photoUrl: string, cacheKey: string | number) => {
  const normalizedUrl = String(photoUrl || '').trim();
  if (!normalizedUrl) return '';

  try {
    const url = new URL(normalizedUrl);
    url.searchParams.set('ec_avatar_refresh', String(cacheKey));
    return url.toString();
  } catch {
    const separator = normalizedUrl.includes('?') ? '&' : '?';
    return `${normalizedUrl}${separator}ec_avatar_refresh=${encodeURIComponent(String(cacheKey))}`;
  }
};

export async function runWithConcurrency<T>(
  items: readonly T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>
) {
  if (items.length === 0) return;

  const workerCount = Math.min(
    items.length,
    Math.max(1, Math.floor(Number.isFinite(concurrency) ? concurrency : 1))
  );
  let nextIndex = 0;

  const runWorker = async () => {
    while (nextIndex < items.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      await worker(items[currentIndex], currentIndex);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
}
