import React from 'react';
import { useSiteConfig } from '../../hooks/useSiteConfig';
import { appendBrandAssetVersion, getBrandAssetSignature, getBrandSplashLogoUrl } from '../../utils/brandAssets';

type SplashScreenProps = {
  message?: string;
};

export function SplashScreen({ message = 'Carregando...' }: SplashScreenProps) {
  const siteConfig = useSiteConfig();
  const assetSignature = getBrandAssetSignature(siteConfig);
  const splashLogoUrl = appendBrandAssetVersion(getBrandSplashLogoUrl(siteConfig), assetSignature);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white px-6">
      <div className="w-full max-w-sm rounded-[2rem] border border-brand-border bg-white shadow-2xl shadow-brand-primary/10 px-8 py-10 text-center space-y-6">
        {splashLogoUrl ? (
          <div className="rounded-[1.75rem] border border-brand-border bg-white px-6 py-6 shadow-lg shadow-brand-primary/5">
            <div className="rounded-[1.25rem] bg-white px-5 py-4">
              <img
                src={splashLogoUrl}
                alt={siteConfig.pwa_short_name || "Evolução Clínica"}
                className="mx-auto h-24 w-auto max-w-full object-contain"
              />
            </div>
          </div>
        ) : (
          <div className="rounded-[1.75rem] border border-brand-primary/10 bg-white px-5 py-4 shadow-lg shadow-brand-primary/5">
            <span className="text-2xl font-bold text-brand-primary">
              {siteConfig.pwa_short_name || "Evolução Clínica"}
            </span>
          </div>
        )}
        <div className="space-y-3">
          <div className="mx-auto h-10 w-10 rounded-full border-2 border-brand-primary/20 border-t-brand-primary animate-spin" />
          <p className="text-sm font-medium text-brand-text-muted">{message}</p>
        </div>
      </div>
    </div>
  );
}
