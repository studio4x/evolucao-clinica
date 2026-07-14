import React from 'react';

export const APP_VERSION = "v1.10.413";
export const PLAY_STORE_VERSION = "1.0.11";

interface AppVersionProps {
  collapsed?: boolean;
}

export const AppVersion = ({ collapsed }: AppVersionProps) => {
  if (collapsed) return null;

  const versionText = `Build ${APP_VERSION} (App v${PLAY_STORE_VERSION})`;

  return (
    <div className="text-center">
      <span className="text-[10px] text-brand-text-muted">
        {versionText}
      </span>
    </div>
  );
};
