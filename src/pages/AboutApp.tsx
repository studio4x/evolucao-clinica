import React from 'react';
import { Info } from 'lucide-react';
import { AboutAppCard } from '../components/profile/AboutAppCard';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';

export default function AboutApp() {
  return (
    <div className="w-full space-y-6">
      <PanelPageHeader
        icon={Info}
        title="Sobre o app"
        description="Conheça o Evolução Clínica e consulte as informações da versão em uso neste dispositivo."
      />

      <AboutAppCard />
    </div>
  );
}
