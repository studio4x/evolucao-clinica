import type { SiteConfig } from '../hooks/useSiteConfig';

export type BrandAssetSource = Pick<
  SiteConfig,
  'logo_light_url' | 'logo_dark_url' | 'favicon_url' | 'pwa_icon_192_url' | 'pwa_icon_512_url' | 'pwa_maskable_icon_url' | 'version'
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
    config.version || ''
  ].join('|'));
};

export const appendBrandAssetVersion = (url: string, signature: string) => {
  if (!url) return '';
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(signature)}`;
};

export const getBrandIconUrl = (config: BrandAssetSource) => {
  return config.favicon_url || config.logo_dark_url || config.logo_light_url || '/favicon.png';
};

export const getBrandSplashLogoUrl = (config: BrandAssetSource) => {
  return config.logo_dark_url || config.logo_light_url || '';
};
