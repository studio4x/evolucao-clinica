export const JOURNEY_GROUP_BATCH_CONCURRENCY = 3;

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
