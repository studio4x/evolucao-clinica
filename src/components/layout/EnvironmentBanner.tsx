import React from "react";
import { publicAppEnvironment } from "../../config/publicEnvironment";

export function EnvironmentBanner() {
  if (publicAppEnvironment !== "staging") return null;
  return (
    <div
      className="sticky top-0 z-[10000] bg-amber-400 px-3 py-1.5 text-center text-xs font-extrabold tracking-[0.12em] text-amber-950 shadow-sm"
      role="status"
    >
      AMBIENTE DE HOMOLOGAÇÃO
    </div>
  );
}
