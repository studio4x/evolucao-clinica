import React from 'react';

export const AppVersion = () => {
  // Versão definida conforme regra AGENTS.md
  // Incrementando de v1.0.6 para v1.0.7
  const version = "v1.1.5";
  
  return (
    <div className="text-center pt-2">
      <span className="text-[10px] text-brand-text-muted">Build {version}</span>
    </div>
  );
};
