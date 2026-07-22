import type { SiteConfig } from './brandConfig';

export type BrandAssetSource = Pick<
  SiteConfig,
  'logo_light_url' | 'logo_dark_url' | 'favicon_url' | 'pwa_icon_192_url' | 'pwa_icon_512_url' | 'pwa_maskable_icon_url' | 'pwa_push_notification_icon_url' | 'pwa_install_logo_url' | 'pwa_loading_logo_url' | 'social_share_url' | 'version'
>;

const hashString = (value: string) => {
  let hash = 0;

  for (let i = 0; i < value.length; i += 1) {
    hash = ((hash << 5) - hash) + value.charCodeAt(i);
    hash |= 0;
  }

  return Math.abs(hash).toString(36);
};

export const getBrandAssetSignature = (config: BrandAssetSource) => {
  return hashString([
    config.logo_light_url || '',
    config.logo_dark_url || '',
    config.favicon_url || '',
    config.pwa_icon_192_url || '',
    config.pwa_icon_512_url || '',
    config.pwa_maskable_icon_url || '',
    config.pwa_push_notification_icon_url || '',
    config.pwa_install_logo_url || '',
    config.pwa_loading_logo_url || '',
    config.social_share_url || '',
    config.version || ''
  ].join('|'));
};

export const appendBrandAssetVersion = (url: string, signature: string) => {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(signature)}`;
};

export const getBrandFaviconUrl = (config: BrandAssetSource) => {
  return config.favicon_url || config.logo_dark_url || config.logo_light_url || config.pwa_icon_192_url || '/favicon.png';
};

export const getBrandAppIconUrl = (config: BrandAssetSource) => {
  return config.pwa_icon_192_url || config.pwa_maskable_icon_url || config.pwa_icon_512_url || getBrandFaviconUrl(config);
};

export const getBrandIconUrl = (config: BrandAssetSource) => {
  return getBrandAppIconUrl(config);
};

export const getBrandSplashLogoUrl = (config: BrandAssetSource) => {
  return config.pwa_loading_logo_url || config.logo_dark_url || config.logo_light_url || config.pwa_icon_512_url || '';
};

export const getBrandInstallLogoUrl = (config: BrandAssetSource) => {
  return config.pwa_install_logo_url || config.pwa_icon_192_url || config.pwa_icon_512_url || config.pwa_maskable_icon_url || getBrandFaviconUrl(config);
};

export const getBrandPushNotificationIconUrl = (config: BrandAssetSource) => {
  return config.pwa_push_notification_icon_url || config.pwa_icon_192_url || config.pwa_maskable_icon_url || config.pwa_icon_512_url || getBrandFaviconUrl(config);
};

export const getBrandSocialShareUrl = (config: BrandAssetSource) => {
  return config.social_share_url || '/og-image-social.png';
};

