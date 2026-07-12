type FunctionErrorContext = {
  json?: () => Promise<unknown>;
  text?: () => Promise<string>;
};

function getFallbackMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string' && error.trim()) {
    return error;
  }

  return fallback;
}

export async function resolveSupabaseFunctionErrorMessage(error: unknown, fallback: string) {
  const context = (error as { context?: FunctionErrorContext } | null)?.context;

  if (!context) {
    return getFallbackMessage(error, fallback);
  }

  try {
    const payload = await context.json?.();
    if (payload && typeof payload === 'object') {
      const data = payload as { error?: unknown; message?: unknown };
      if (typeof data.error === 'string' && data.error.trim()) {
        return data.error;
      }
      if (typeof data.message === 'string' && data.message.trim()) {
        return data.message;
      }
    }
  } catch {
    // Ignore JSON parsing failures and try text fallback.
  }

  try {
    const rawText = await context.text?.();
    if (rawText?.trim()) {
      try {
        const parsed = JSON.parse(rawText) as { error?: unknown; message?: unknown };
        if (typeof parsed.error === 'string' && parsed.error.trim()) {
          return parsed.error;
        }
        if (typeof parsed.message === 'string' && parsed.message.trim()) {
          return parsed.message;
        }
      } catch {
        return rawText;
      }
    }
  } catch {
    // Ignore text parsing failures and return the original error message.
  }

  return getFallbackMessage(error, fallback);
}
