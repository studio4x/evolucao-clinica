import { formatPlayStoreVersion, getInstalledAppInfo } from './installedAppInfo';
import { GOOGLE_PLAY_APP_URL } from './googlePlay';

export type NativeAppUpdateStatus = 'up_to_date' | 'update_available' | 'unavailable';

export interface NativeAppUpdatePayload {
  status: NativeAppUpdateStatus;
  installedVersionCode: number | null;
  installedVersionName: string | null;
  availableVersionCode: number | null;
}

export type AndroidAppUpdateState = 'idle' | 'checking' | NativeAppUpdateStatus;

export const NATIVE_APP_UPDATE_EVENT = 'native-app-update-status';

export const isNativeAndroidApp = () => getInstalledAppInfo().platform === 'android';

export const requestNativeAppUpdate = (): boolean => {
  if (typeof window === 'undefined' || typeof window.NativeAppInfoBridge?.checkForUpdate !== 'function') {
    return false;
  }

  window.NativeAppInfoBridge.checkForUpdate();
  return true;
};

export const subscribeToNativeAppUpdate = (
  listener: (payload: NativeAppUpdatePayload) => void
) => {
  if (typeof window === 'undefined') return () => undefined;

  const handleEvent = (event: Event) => {
    const payload = (event as CustomEvent<Partial<NativeAppUpdatePayload>>).detail;
    if (!payload || !isNativeAppUpdatePayload(payload)) return;
    listener(payload);
  };

  window.addEventListener(NATIVE_APP_UPDATE_EVENT, handleEvent);
  return () => window.removeEventListener(NATIVE_APP_UPDATE_EVENT, handleEvent);
};

export const openGooglePlay = () => {
  if (typeof window !== 'undefined' && typeof window.NativeAppInfoBridge?.openPlayStore === 'function') {
    window.NativeAppInfoBridge.openPlayStore();
    return 'native' as const;
  }

  if (typeof window !== 'undefined') window.location.assign(GOOGLE_PLAY_APP_URL);
  return 'web' as const;
};

export const formatAvailablePlayStoreVersion = (versionCode: number | null) =>
  formatPlayStoreVersion(versionCode);

const isPositiveIntegerOrNull = (value: unknown): value is number | null =>
  value === null || (typeof value === 'number' && Number.isInteger(value) && value > 0);

const isNativeAppUpdatePayload = (
  payload: Partial<NativeAppUpdatePayload>
): payload is NativeAppUpdatePayload => (
  (payload.status === 'up_to_date'
    || payload.status === 'update_available'
    || payload.status === 'unavailable')
  && isPositiveIntegerOrNull(payload.installedVersionCode)
  && (payload.installedVersionName === null || typeof payload.installedVersionName === 'string')
  && isPositiveIntegerOrNull(payload.availableVersionCode)
  && (payload.status !== 'update_available' || payload.availableVersionCode !== null)
);

export const getUpdatePresentation = (
  state: AndroidAppUpdateState,
  availableVersionCode: number | null = null
) => ({
  title: state === 'checking'
    ? 'Verificando atualização...'
    : state === 'up_to_date'
      ? 'Seu aplicativo está atualizado'
      : state === 'update_available'
        ? 'Uma nova versão está disponível'
        : 'Não foi possível verificar automaticamente se há uma atualização disponível.',
  availableVersion: state === 'update_available'
    ? formatAvailablePlayStoreVersion(availableVersionCode)
    : null
});
