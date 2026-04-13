import { useEffect } from 'react';

export const PwaMetaManager = () => {
  useEffect(() => {
    // Dynamically manage manifest if needed
    // For now, we use the static manifest from /manifest.webmanifest
    
    // Update theme color based on page or config
    const themeColor = "#0f172a"; // Default based on spec
    let metaThemeColor = document.querySelector('meta[name="theme-color"]');
    if (!metaThemeColor) {
      metaThemeColor = document.createElement('meta');
      metaThemeColor.setAttribute('name', 'theme-color');
      document.head.appendChild(metaThemeColor);
    }
    metaThemeColor.setAttribute('content', themeColor);

  }, []);

  return null;
};
