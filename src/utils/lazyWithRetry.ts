import React, { lazy } from 'react';

const LAZY_RETRY_PREFIX = 'evolucao-clinica:lazy-retry';
const RETRY_QUERY_PARAM = '__lazy_retry';

const RETRYABLE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /ChunkLoadError/i,
];

const isRetryableChunkError = (error: unknown) => {
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error || '');

  return RETRYABLE_CHUNK_PATTERNS.some((pattern) => pattern.test(message));
};

export const clearLazyRetryQueryParam = () => {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  if (!url.searchParams.has(RETRY_QUERY_PARAM)) return;

  url.searchParams.delete(RETRY_QUERY_PARAM);
  window.history.replaceState({}, '', url.toString());
};

export const lazyWithRetry = <T extends React.ComponentType<any>>(
  importer: () => Promise<{ default: T }>,
  chunkName: string
) => lazy(async () => {
  const retryKey = `${LAZY_RETRY_PREFIX}:${chunkName}`;
  const hasRetried = typeof window !== 'undefined' && sessionStorage.getItem(retryKey) === '1';

  try {
    const module = await importer();

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(retryKey);
    }

    return module;
  } catch (error) {
    if (typeof window !== 'undefined' && isRetryableChunkError(error) && !hasRetried) {
      sessionStorage.setItem(retryKey, '1');

      const url = new URL(window.location.href);
      url.searchParams.set(RETRY_QUERY_PARAM, Date.now().toString());
      window.location.replace(url.toString());

      return new Promise<never>(() => {});
    }

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(retryKey);
    }

    throw error;
  }
});
