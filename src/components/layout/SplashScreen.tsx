import React from 'react';
import { useSiteConfig } from '../../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature, getBrandSplashLogoUrl } from '../../utils/brandAssets';

type SplashScreenProps = {
  message?: string;
};

export function SplashScreen({ message = 'Carregando...' }: SplashScreenProps) {
  const siteConfig = useSiteConfig();
  const splashLogoUrl = appendBrandAssetVersion(getBrandSplashLogoUrl(siteConfig), getBrandAssetSignature(siteConfig));
  const appName = siteConfig.pwa_app_name || 'Evolução Clínica';

  return (
    <div
      className="min-h-screen flex items-center justify-center px-6"
      style={{ backgroundColor: siteConfig.pwa_background_color || '#ffffff' }}
    >
      <div className="w-full max-w-sm text-center space-y-4">
        {splashLogoUrl ? (
          <img
            src={splashLogoUrl}
            alt={appName}
            className="mx-auto max-h-28 w-auto max-w-[220px] object-contain"
          />
        ) : null}
        <div className="space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin" />
          <p className="text-sm font-medium text-brand-text-muted">{message}</p>
        </div>
      </div>
    </div>
  );
}
