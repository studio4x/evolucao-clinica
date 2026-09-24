import { formatPlayStoreVersion, getInstalledAppInfo } from './installedAppInfo';
import { GOOGLE_PLAY_APP_URL } from './googlePlay';

export type NativeAppUpdateStatus = 'up_to_date' | 'update_available' | 'unavailable';
export type AndroidAppUpdateState = 'idle' | 'checking' | NativeAppUpdateStatus;

export interface NativeAppUpdatePayload {
  status: NativeAppUpdateStatus;
  installedVersionCode: number | null;
  installedVersionName: string | null;
  availableVersionCode: number | null;
  availableVersionName?: string | null;
}

export interface AndroidAppUpdateSnapshot extends NativeAppUpdatePayload {
  state: AndroidAppUpdateState;
  source: 'google_play_in_app_updates' | null;
}

export const NATIVE_APP_UPDATE_EVENT = 'native-app-update-status';

const initialSnapshot: AndroidAppUpdateSnapshot = {
  state: 'idle',
  status: 'unavailable',
  installedVersionCode: null,
  installedVersionName: null,
  availableVersionCode: null,
  availableVersionName: null,
  source: null
};

let snapshot = initialSnapshot;
let initialized = false;
let nativeEventBound = false;
let requestInFlight = false;
const listeners = new Set<() => void>();

export const isNativeAndroidApp = () => getInstalledAppInfo().platform === 'android';

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
  && (payload.availableVersionName === undefined
    || payload.availableVersionName === null
    || typeof payload.availableVersionName === 'string')
  && (payload.status !== 'update_available' || payload.availableVersionCode !== null)
);

const emitSnapshot = (nextSnapshot: AndroidAppUpdateSnapshot) => {
  snapshot = nextSnapshot;
  listeners.forEach((listener) => listener());
};

const normalizePayload = (payload: NativeAppUpdatePayload): AndroidAppUpdateSnapshot => {
  const installed = payload.installedVersionCode;
  const available = payload.availableVersionCode;
  const hasHigherVersion = installed !== null && available !== null && available > installed;
  const updateAvailable = payload.status === 'update_available' && hasHigherVersion;
  const status = payload.status === 'unavailable'
    ? 'unavailable'
    : updateAvailable
      ? 'update_available'
      : 'up_to_date';

  return { ...payload, state: status, status, source: 'google_play_in_app_updates' };
};

const handleNativeUpdateEvent = (event: Event) => {
  const payload = (event as CustomEvent<Partial<NativeAppUpdatePayload>>).detail;
  if (!payload || !isNativeAppUpdatePayload(payload)) return;
  requestInFlight = false;
  emitSnapshot(normalizePayload(payload));
};

const bindNativeEvent = () => {
  if (nativeEventBound || typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;
  window.addEventListener(NATIVE_APP_UPDATE_EVENT, handleNativeUpdateEvent);
  nativeEventBound = true;
};

export const getNativeAppUpdateSnapshot = () => snapshot;

export const subscribeToNativeAppUpdate = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const requestNativeAppUpdate = (options: { force?: boolean } = {}): boolean => {
  if (!isNativeAndroidApp() || typeof window === 'undefined' || typeof window.NativeAppInfoBridge?.checkForUpdate !== 'function') {
    return false;
  }
  if (requestInFlight && !options.force) return true;

  bindNativeEvent();
  requestInFlight = true;
  const installed = getInstalledAppInfo();
  emitSnapshot({
    ...snapshot,
    state: 'checking',
    status: 'unavailable',
    installedVersionCode: installed.versionCode,
    installedVersionName: installed.versionName,
    availableVersionCode: null,
    availableVersionName: null,
    source: 'google_play_in_app_updates'
  });

  try {
    window.NativeAppInfoBridge.checkForUpdate();
    return true;
  } catch {
    requestInFlight = false;
    emitSnapshot({ ...snapshot, state: 'unavailable', status: 'unavailable', availableVersionCode: null });
    return false;
  }
};

export const initializeNativeAppUpdateCheck = () => {
  if (initialized) return;
  initialized = true;
  if (isNativeAndroidApp()) requestNativeAppUpdate();
};

export const openGooglePlay = () => {
  if (typeof window !== 'undefined' && typeof window.NativeAppInfoBridge?.openPlayStore === 'function') {
    window.NativeAppInfoBridge.openPlayStore();
    return 'native' as const;
  }

  if (typeof window !== 'undefined') window.location.assign(GOOGLE_PLAY_APP_URL);
  return 'web' as const;
};

export const formatAvailablePlayStoreVersion = (versionCode: number | null, versionName?: string | null) =>
  formatPlayStoreVersion(versionCode, versionName);

export const getUpdatePresentation = (
  state: AndroidAppUpdateState,
  availableVersionCode: number | null = null,
  availableVersionName: string | null = null
) => ({
  title: state === 'checking'
    ? 'Verificando atualização...'
    : state === 'up_to_date'
      ? 'Seu aplicativo está atualizado'
      : state === 'update_available'
        ? 'Nova versão disponível'
        : 'Não foi possível verificar automaticamente se há uma atualização disponível.',
  availableVersion: state === 'update_available'
    ? formatAvailablePlayStoreVersion(availableVersionCode, availableVersionName)
    : null
});
