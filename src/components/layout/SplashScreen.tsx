import React from 'react';
import { useSiteConfig } from '../../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature, getBrandSplashLogoUrl } from '../../utils/brandAssets';

type SplashScreenProps = {
  message?: string;
};

export function SplashScreen({ message = 'Carregando...' }: SplashScreenProps) {
  const siteConfig = useSiteConfig();
  const splashLogoUrl = appendBrandAssetVersion(getBrandSplashLogoUrl(siteConfig), getBrandAssetSignature(siteConfig));

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm text-center space-y-4">
        <div className="space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin" />
          <p className="text-sm font-medium text-brand-text-muted">{message}</p>
        </div>
      </div>
    </div>
  );
}
