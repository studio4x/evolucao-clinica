export interface BrandColors {
  primary: string;
  primary_hover: string;
  secondary: string;
  secondary_hover: string;
  accent: string;
  accent_hover: string;
  bg: string;
  surface: string;
  text: string;
  text_muted: string;
  border: string;
}

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
  pwa_push_notification_icon_url: string;
  pwa_install_logo_url: string;
  pwa_loading_logo_url: string;
  logo_light_url: string;
  logo_dark_url: string;
  favicon_url: string;
  version: string;
  colors: BrandColors;
}

export type BrandConfigLike = Partial<Omit<SiteConfig, "colors">> & {
  colors?: Partial<BrandColors>;
};

declare global {
  interface Window {
    __INITIAL_SITE_CONFIG__?: SiteConfig;
  }
}

export const defaultColors: BrandColors = {
  primary: "#076c9a",
  primary_hover: "#0DABA4",
  secondary: "#5C4716",
  secondary_hover: "#4a3912",
  accent: "#82b9cc",
  accent_hover: "#6ea3b4",
  bg: "#edf8fd",
  surface: "#ffffff",
  text: "#1c1917",
  text_muted: "#57534e",
  border: "#e7e5e4"
};

export const defaultSiteConfig: SiteConfig = {
  pwa_app_name: "Evolução Clínica",
  pwa_short_name: "Evolução Clínica",
  pwa_description: "Gerenciamento de Evoluções Clínicas com IA e Google Docs",
  pwa_theme_color: "#076c9a",
  pwa_background_color: "#ffffff",
  pwa_icon_192_url: "/icon-192x192.png",
  pwa_icon_512_url: "/icon-512x512.png",
  pwa_maskable_icon_url: "/icon-512x512-maskable.png",
  pwa_install_title: "Instale o app Evolução Clínica",
  pwa_install_description: "Acesse seus prontuários rapidamente pela tela inicial com o app oficial.",
  pwa_push_notification_icon_url: "",
  pwa_install_logo_url: "",
  pwa_loading_logo_url: "",
  logo_light_url: "",
  logo_dark_url: "",
  favicon_url: "/favicon.png",
  version: "1.0",
  colors: defaultColors
};

export const normalizeSiteConfig = (config?: BrandConfigLike | null): SiteConfig => {
  const safeConfig = config ?? {};

  return {
    ...defaultSiteConfig,
    ...safeConfig,
    colors: safeConfig.colors
      ? {
          ...defaultColors,
          ...safeConfig.colors
        }
      : defaultColors
  };
};
