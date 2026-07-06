import React from 'react';

export const APP_VERSION = "v1.10.283";

interface AppVersionProps {
  collapsed?: boolean;
}

export const AppVersion = ({ collapsed }: AppVersionProps) => {
  return (
    <div className="text-center pt-2">
      <span className="text-[10px] text-brand-text-muted">
        {collapsed ? APP_VERSION : `Build ${APP_VERSION}`}
      </span>
    </div>
  );
};
