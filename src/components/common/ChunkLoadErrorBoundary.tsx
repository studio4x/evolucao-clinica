import React from 'react';
import { RefreshCw } from 'lucide-react';
import { forceChunkRecovery, isRetryableChunkError } from '../../utils/lazyWithRetry';

interface ChunkLoadErrorBoundaryState {
  error: unknown;
}

export class ChunkLoadErrorBoundary extends React.Component<React.PropsWithChildren, ChunkLoadErrorBoundaryState> {
  state: ChunkLoadErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: unknown): ChunkLoadErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: unknown) {
    console.error('[ChunkRecovery] Falha ao carregar a aplicação.', error);
  }

  render() {
    if (!this.state.error) return this.props.children;

    const isChunkError = isRetryableChunkError(this.state.error);

    return (
      <main className="flex min-h-screen items-center justify-center bg-brand-background px-6 text-brand-text">
        <section className="w-full max-w-md rounded-2xl border border-brand-border bg-brand-surface p-8 text-center shadow-lg">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full bg-brand-primary/10 text-brand-primary">
            <RefreshCw className="h-6 w-6" aria-hidden="true" />
          </div>
          <h1 className="text-xl font-semibold">
            {isChunkError ? 'Atualização necessária' : 'Não foi possível carregar esta página'}
          </h1>
          <p className="mt-3 text-sm leading-6 text-brand-text-muted">
            {isChunkError
              ? 'Uma nova versão está disponível. Atualize para continuar com a versão mais recente.'
              : 'Tente recarregar a aplicação. Seus dados permanecerão seguros.'}
          </p>
          <button
            type="button"
            onClick={() => void forceChunkRecovery()}
            className="mt-6 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-brand-primary px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-primary focus-visible:ring-offset-2"
          >
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Atualizar aplicação
          </button>
        </section>
      </main>
    );
  }
}
