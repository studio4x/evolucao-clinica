import { useState, useEffect } from 'react';

export interface SiteConfig {
  pwa_app_name: string;
  pwa_short_name: string;
  pwa_description: string;
  pwa_theme_color: string;
  pwa_background_color: string;
  pwa_icon_192_url: string;
  pwa_icon_512_url: string;
  pwa_maskable_icon_url: string;
  pwa_install_title: string;
  pwa_install_description: string;
}

const defaultConfig: SiteConfig = {
  pwa_app_name: "HomeCare Match",
  pwa_short_name: "HomeCare",
  pwa_description: "Conectando profissionais de saúde às melhores oportunidades em Home Care.",
  pwa_theme_color: "#0f172a",
  pwa_background_color: "#ffffff",
  pwa_icon_192_url: "logo.svg",
  pwa_icon_512_url: "logo.svg",
  pwa_maskable_icon_url: "logo.svg",
  pwa_install_title: "Instale o app HomeCare Match",
  pwa_install_description: "Acesse mais rápido pelo seu celular, direto da tela inicial."
};

export const useSiteConfig = () => {
  // Em uma implementação real, isso buscaria do Supabase (tabela site_config)
  // Por enquanto, retornamos os valores padrão da especificação
  const [config, setConfig] = useState<SiteConfig>(defaultConfig);

  return config;
};
