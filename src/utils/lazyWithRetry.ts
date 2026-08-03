import React, { lazy } from 'react';

const LAZY_RETRY_PREFIX = 'evolucao-clinica:lazy-retry';
const RETRY_QUERY_PARAM = '__lazy_retry';
const APP_CACHE_PREFIX = 'evolucao-clinica-pwa-';

const RETRYABLE_CHUNK_PATTERNS = [
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i,
  /Failed to load module script/i,
  /Expected a JavaScript(?:-or-Wasm)? module script/i,
  /MIME type.*text\/html/i,
  /ChunkLoadError/i,
];

export const isRetryableChunkError = (error: unknown) => {
  const message = error instanceof Error
    ? `${error.name} ${error.message}`
    : String(error || '');

  return RETRYABLE_CHUNK_PATTERNS.some((pattern) => pattern.test(message));
};

const clearAppCaches = async () => {
  if (typeof window === 'undefined' || !('caches' in window)) return;

  const cacheNames = await window.caches.keys();
  await Promise.all(
    cacheNames
      .filter((cacheName) => cacheName.startsWith(APP_CACHE_PREFIX))
      .map((cacheName) => window.caches.delete(cacheName))
  );
};

const buildRetryUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.set(RETRY_QUERY_PARAM, Date.now().toString());
  return url.toString();
};

const reloadWithCurrentBuild = async () => {
  try {
    await clearAppCaches();
  } catch (error) {
    console.warn('[ChunkRecovery] Não foi possível limpar o cache PWA.', error);
  }

  window.location.replace(buildRetryUrl());
};

export const attemptChunkRecovery = async (error: unknown, chunkName: string) => {
  if (typeof window === 'undefined' || !isRetryableChunkError(error)) return false;

  const retryKey = `${LAZY_RETRY_PREFIX}:${chunkName}`;
  if (window.sessionStorage.getItem(retryKey) === '1') return false;

  window.sessionStorage.setItem(retryKey, '1');
  await reloadWithCurrentBuild();
  return true;
};

export const forceChunkRecovery = async () => {
  if (typeof window === 'undefined') return;

  for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
    const key = window.sessionStorage.key(index);
    if (key?.startsWith(LAZY_RETRY_PREFIX)) {
      window.sessionStorage.removeItem(key);
    }
  }

  await reloadWithCurrentBuild();
};

export const installGlobalChunkRecovery = () => {
  if (typeof window === 'undefined') return () => undefined;

  const handleWindowError = (event: ErrorEvent) => {
    const error = event.error || event.message;
    if (!isRetryableChunkError(error)) return;

    event.preventDefault();
    void attemptChunkRecovery(error, 'global');
  };

  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    if (!isRetryableChunkError(event.reason)) return;

    event.preventDefault();
    void attemptChunkRecovery(event.reason, 'global');
  };

  window.addEventListener('error', handleWindowError);
  window.addEventListener('unhandledrejection', handleUnhandledRejection);

  return () => {
    window.removeEventListener('error', handleWindowError);
    window.removeEventListener('unhandledrejection', handleUnhandledRejection);
  };
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

  try {
    const module = await importer();

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(retryKey);
    }

    return module;
  } catch (error) {
    if (await attemptChunkRecovery(error, chunkName)) {
      return new Promise<never>(() => {});
    }

    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(retryKey);
    }

    throw error;
  }
});
