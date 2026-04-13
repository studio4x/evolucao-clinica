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
  pwa_app_name: "Evolução Clínica",
  pwa_short_name: "Evolução",
  pwa_description: "Gerenciamento de Evoluções Clínicas com IA e Google Docs - Conexão Seres",
  pwa_theme_color: "#1e3a8a",
  pwa_background_color: "#ffffff",
  pwa_icon_192_url: "logo.svg",
  pwa_icon_512_url: "logo.svg",
  pwa_maskable_icon_url: "logo.svg",
  pwa_install_title: "Instale o app Evolução Clínica",
  pwa_install_description: "Acesse seus prontuários rapidamente pela tela inicial com o app oficial."
};

export const useSiteConfig = () => {
  // Em uma implementação real, isso buscaria do Supabase (tabela site_config)
  // Por enquanto, retornamos os valores padrão da especificação
  const [config, setConfig] = useState<SiteConfig>(defaultConfig);

  return config;
};
