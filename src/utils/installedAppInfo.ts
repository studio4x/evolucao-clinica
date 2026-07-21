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

const formatPlayStoreVersion = (versionCode: number | null, versionName?: string | null) => {
  if (versionCode) return `1.0.${versionCode}`;
  const normalizedName = String(versionName ?? '').trim();
  return normalizedName ? normalizedName.replace(/^v/i, '') : null;
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
  const nativeInfo = readNativeBridge() || readNativeUserAgent();
  if (nativeInfo) return nativeInfo;

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
