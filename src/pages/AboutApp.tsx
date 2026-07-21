import React from 'react';
import { AboutAppCard } from '../components/profile/AboutAppCard';

export default function AboutApp() {
  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <header className="border-b border-brand-border/60 pb-5">
        <h1 className="text-3xl font-display font-bold text-brand-primary">Sobre o app</h1>
        <p className="text-sm text-brand-text-muted mt-1">
          Conheça o Evolução Clínica e consulte as informações da versão em uso neste dispositivo.
        </p>
      </header>

      <AboutAppCard />
    </div>
  );
}
