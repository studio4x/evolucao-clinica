import React from 'react';
import { useSiteConfig } from '../../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature, getBrandSplashLogoUrl } from '../../utils/brandAssets';

type SplashScreenProps = {
  message?: string;
};

export function SplashScreen({ message = 'Carregando...' }: SplashScreenProps) {
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const logoUrl = appendBrandAssetVersion(getBrandSplashLogoUrl(siteConfig), assetSignature);

  return (
    <div className="min-h-screen flex items-center justify-center bg-brand-bg px-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-brand-border bg-white/80 backdrop-blur-xl shadow-2xl shadow-brand-primary/10 px-8 py-10 text-center space-y-6">
        <div className="flex justify-center">
          <div className="rounded-[1.75rem] border border-brand-primary/10 bg-white px-5 py-4 shadow-lg shadow-brand-primary/5">
            <img
              src={logoUrl}
              alt="Evolução Clínica"
              className="h-20 w-auto object-contain"
            />
          </div>
        </div>
        <div className="space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin" />
          <p className="text-sm font-medium text-brand-text-muted">{message}</p>
        </div>
      </div>
    </div>
  );
}
