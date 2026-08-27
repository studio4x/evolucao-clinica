import { createClient } from '@supabase/supabase-js';

const getFallbackAnonKey = (): string => {
  const b64 = 'ZXlKaGJHY2lPaUpJVXpJMU5pSXNJblI1Y0NJNklrcFhWQ0o5LmV5SnBjM01pT2lKemRYQmhZbUZ6WlNJc0luSmxaaUk2SW10MmVHSnZiM1puY25Kb2FIUjBZWEZwYm14a0lpd2ljbTlzWlNJNkltRnViMjRpTENKcFlYUWlPakUzT0RFM05qWXlNREVzSW1WNGNDSTZNakE1TnpNMDBNakF4ZDAuUmxjY1htM2FDZWZhZERQaXZPQTV3dzV5SHl1ck8zVEFMTGZrbFZ3alN2Yw==';
  try {
    if (typeof window !== 'undefined' && typeof window.atob === 'function') {
      return window.atob(b64);
    }
    return typeof Buffer !== 'undefined' ? Buffer.from(b64, 'base64').toString('utf-8') : '';
  } catch {
    return '';
  }
};

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://kvxboovgrrhhttaqinld.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || getFallbackAnonKey();

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // Mantém a sessão e permite sua renovação automática entre aberturas do app.
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
});

const AUTH_REFRESH_LEEWAY_SECONDS = 90;

type AuthFetchGlobal = typeof globalThis & {
  __evolucaoClinicaAuthenticatedFetchInstalled?: boolean;
};

let refreshInFlight: Promise<string | null> | null = null;

const refreshAccessToken = async (): Promise<string | null> => {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    try {
      const { data, error } = await supabase.auth.refreshSession();
      if (error) {
        console.warn('[Auth] Não foi possível renovar a sessão automaticamente:', error.message);
        return null;
      }
      return data.session?.access_token || null;
    } catch (error) {
      console.warn('[Auth] Falha inesperada ao renovar a sessão automaticamente:', error);
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
};

const getFreshAccessToken = async (forceRefresh = false): Promise<string | null> => {
  try {
    if (forceRefresh) {
      return await refreshAccessToken();
    }

    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn('[Auth] Não foi possível ler a sessão atual:', error.message);
      return null;
    }

    const session = data.session;
    if (!session?.access_token) return null;

    const expiresAt = Number(session.expires_at || 0);
    const nowSeconds = Math.floor(Date.now() / 1000);
    const closeToExpiry = expiresAt > 0 && expiresAt <= nowSeconds + AUTH_REFRESH_LEEWAY_SECONDS;

    if (closeToExpiry) {
      return (await refreshAccessToken()) || session.access_token;
    }

    return session.access_token;
  } catch (error) {
    console.warn('[Auth] Falha inesperada ao obter token autenticado:', error);
    return null;
  }
};

const installAuthenticatedApiFetch = () => {
  if (typeof window === 'undefined' || typeof globalThis.fetch !== 'function') return;

  const authGlobal = globalThis as AuthFetchGlobal;
  if (authGlobal.__evolucaoClinicaAuthenticatedFetchInstalled) return;
  authGlobal.__evolucaoClinicaAuthenticatedFetchInstalled = true;

  const nativeFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    let baseRequest: Request;

    try {
      baseRequest = new Request(input, init);
    } catch {
      return nativeFetch(input, init);
    }

    let requestUrl: URL;
    try {
      requestUrl = new URL(baseRequest.url, window.location.href);
    } catch {
      return nativeFetch(input, init);
    }

    const authorization = baseRequest.headers.get('Authorization') || '';
    const hasBearer = /^Bearer\s+.+$/i.test(authorization);
    const isOwnApi =
      requestUrl.origin === window.location.origin &&
      requestUrl.pathname.startsWith('/api/');

    // Só interfere nas chamadas autenticadas da própria plataforma.
    // Requisições públicas e chamadas externas continuam usando fetch nativo.
    if (!isOwnApi || !hasBearer) {
      return nativeFetch(input, init);
    }

    const capturedToken = authorization.replace(/^Bearer\s+/i, '').trim();

    const buildRequest = (token: string) => {
      const headers = new Headers(baseRequest.headers);
      headers.set('Authorization', `Bearer ${token}`);
      return new Request(baseRequest.clone(), { headers });
    };

    try {
      // Mesmo que a tela tenha guardado um token antigo em estado React,
      // substitui pelo token atual da sessão antes de enviar a requisição.
      const currentToken = await getFreshAccessToken(false);
      const firstToken = currentToken || capturedToken;
      const response = await nativeFetch(buildRequest(firstToken));

      if (response.status !== 401) {
        return response;
      }

      // Uma única tentativa de recuperação: renova a sessão e repete a chamada.
      // Se o refresh realmente falhar, devolve o 401 original e o fluxo normal
      // pode redirecionar o usuário ao login.
      const refreshedToken = await getFreshAccessToken(true);
      if (!refreshedToken) {
        return response;
      }

      return await nativeFetch(buildRequest(refreshedToken));
    } catch (error) {
      console.warn('[Auth] Falha no retry autenticado; usando requisição original:', error);
      return nativeFetch(input, init);
    }
  };
};

installAuthenticatedApiFetch();

export default supabase;
