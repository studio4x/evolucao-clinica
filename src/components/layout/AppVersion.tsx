import React from 'react';

export const APP_VERSION = "v1.8.30";

export const AppVersion = () => {
  return (
    <div className="text-center pt-2">
      <span className="text-[10px] text-brand-text-muted">Build {APP_VERSION}</span>
    </div>
  );
};
