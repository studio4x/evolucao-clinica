export interface InstalledAppInfo {
  platform: 'android' | 'pwa' | 'web';
  versionCode: number | null;
  versionName: string | null;
  displayVersion: string | null;
}

declare global {
  interface Window {
    NativeAppInfoBridge?: {
      getAppInfo?: () => string;
    };
  }
}

const parsePositiveInteger = (value: unknown): number | null => {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

const NATIVE_VERSION_STORAGE_KEY = 'evolucao-clinica:native-version-code';

const readLaunchVersionCode = (): number | null => {
  if (typeof window === 'undefined') return null;

  try {
    const queryVersion = new URLSearchParams(window.location.search).get('native_version');
    return parsePositiveInteger(queryVersion);
  } catch {
    return null;
  }
};

const readStoredLaunchVersionCode = (): number | null => {
  if (typeof window === 'undefined') return null;

  try {
    return parsePositiveInteger(window.sessionStorage.getItem(NATIVE_VERSION_STORAGE_KEY));
  } catch {
    return null;
  }
};

const formatPlayStoreVersion = (versionCode: number | null, versionName?: string | null) => {
  const normalizedName = String(versionName ?? '').trim();
  const cleanName = normalizedName.replace(/^v/i, '');

  // O Android pode expor o versionName como "55" ou como "1.0.55".
  // O nome é a versão que o usuário reconhece; o versionCode permanece
  // disponível separadamente para conferir divergências no Play Console.
  if (/^\d+$/.test(cleanName)) return `1.0.${cleanName}`;
  if (/^\d+(?:\.\d+){1,3}$/.test(cleanName)) return cleanName;
  if (versionCode) return `1.0.${versionCode}`;
  return cleanName || null;
};

const readNativeBridge = (): InstalledAppInfo | null => {
  if (typeof window === 'undefined' || !window.NativeAppInfoBridge?.getAppInfo) return null;

  try {
    const payload = JSON.parse(window.NativeAppInfoBridge.getAppInfo()) as {
      versionCode?: unknown;
      versionName?: unknown;
    };
    const versionCode = parsePositiveInteger(payload.versionCode);
    const versionName = String(payload.versionName ?? '').trim() || null;

    return {
      platform: 'android',
      versionCode,
      versionName,
      displayVersion: formatPlayStoreVersion(versionCode, versionName)
    };
  } catch (error) {
    console.warn('[AppInfo] Não foi possível ler a versão pelo bridge nativo.', error);
    return null;
  }
};

const readNativeUserAgent = (): InstalledAppInfo | null => {
  if (typeof navigator === 'undefined') return null;

  const match = navigator.userAgent.match(/EvolucaoClinicaApp\/([^\s;]+)/i);
  if (!match) return null;

  const versionName = match[1];
  const numericParts = versionName.match(/\d+/g);
  const versionCode = parsePositiveInteger(numericParts?.at(-1));

  return {
    platform: 'android',
    versionCode,
    versionName,
    displayVersion: formatPlayStoreVersion(versionCode, versionName)
  };
};

export const getInstalledAppInfo = (): InstalledAppInfo => {
  // A ponte consulta o PackageManager em tempo real e, por isso, é a fonte
  // mais confiável após uma atualização feita pela Play Store. Um parâmetro
  // ou dado de sessão pode pertencer à execução anterior do WebView.
  const nativeBridgeInfo = readNativeBridge();
  if (nativeBridgeInfo) return nativeBridgeInfo;

  const launchVersionCode = readLaunchVersionCode();
  const storedLaunchVersionCode = readStoredLaunchVersionCode();
  const nativeUserAgentInfo = readNativeUserAgent();

  if (launchVersionCode || storedLaunchVersionCode || nativeUserAgentInfo) {
    // A URL atual identifica o lançamento do app. O valor persistido serve
    // apenas de contingência para navegações SPA, quando a ponte nativa não
    // está disponível (por exemplo, em instalações antigas).
    const versionCode = launchVersionCode || storedLaunchVersionCode || nativeUserAgentInfo?.versionCode || null;
    const versionName = launchVersionCode || storedLaunchVersionCode
      ? String(versionCode)
      : nativeUserAgentInfo?.versionName || null;

    return {
      platform: 'android',
      versionCode,
      versionName,
      displayVersion: formatPlayStoreVersion(versionCode, versionName)
    };
  }

  const isPwa = typeof window !== 'undefined' && (
    window.matchMedia('(display-mode: standalone)').matches ||
    Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
  );

  return {
    platform: isPwa ? 'pwa' : 'web',
    versionCode: null,
    versionName: null,
    displayVersion: null
  };
};
