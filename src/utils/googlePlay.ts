export const GOOGLE_PLAY_APP_URL = 'https://play.google.com/store/apps/details?id=com.evolucaoclinica.app';

export const isAndroidDevice = () =>
  typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent);

export const redirectToGooglePlay = () => {
  window.location.assign(GOOGLE_PLAY_APP_URL);
};
