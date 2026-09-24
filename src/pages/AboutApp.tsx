import React, { useState } from 'react';
import { Info, Settings2, ShieldCheck, Smartphone, Sparkles } from 'lucide-react';
import { AboutAppCard } from '../components/profile/AboutAppCard';
import { PanelPageHeader } from '../components/layout/PanelPageHeader';
import { FeatureGuideButton } from '../components/common/FeatureGuideButton';
import { FeatureGuideModal, type FeatureGuideStep } from '../components/common/FeatureGuideModal';

const ABOUT_APP_GUIDE_STEPS: FeatureGuideStep[] = [
  {
    title: 'Conheça a plataforma',
    description: 'O Evolução Clínica ajuda a organizar pacientes, sessões, evoluções e documentos clínicos em um só lugar, apoiando a rotina do profissional.',
    icon: Info,
  },
  {
    title: 'Confira a versão em uso',
    description: 'Consulte o ambiente atual, a versão do aplicativo instalado e a build web. Essas informações ajudam a confirmar qual versão está sendo utilizada.',
    icon: Smartphone,
  },
  {
    title: 'Verifique atualizações do aplicativo',
    description: 'Quando estiver usando o aplicativo Android, você pode consultar a Google Play e atualizar o Evolução Clínica sempre que uma nova versão estiver disponível.',
    icon: Sparkles,
  },
  {
    title: 'Revise privacidade e segurança',
    description: 'Acesse as preferências de privacidade, a Política de Privacidade e os Termos de Serviço para revisar como a plataforma trata seus dados.',
    icon: ShieldCheck,
  },
  {
    title: 'Mantenha o controle das suas preferências',
    description: 'Use esta página como referência para confirmar a versão instalada e revisar as configurações importantes do aplicativo quando precisar.',
    icon: Settings2,
  },
];

const ABOUT_APP_SUPPORT_HREF = `/painel/support?${new URLSearchParams({
  new: '1',
  subject: 'Dúvida sobre a página Sobre o app',
  category: 'general',
  description: 'Olá! Estou com uma dúvida sobre as informações e configurações disponíveis na página Sobre o app.\n\nMinha dúvida:\n\n',
}).toString()}`;

export default function AboutApp() {
  const [guideOpen, setGuideOpen] = useState(false);

  return (
    <div className="w-full space-y-6">
      <PanelPageHeader
        icon={Info}
        title="Sobre o app"
        description="Conheça o Evolução Clínica e consulte as informações da versão em uso neste dispositivo."
        titleActions={<FeatureGuideButton label="Sobre o app" expanded={guideOpen} onOpen={() => setGuideOpen(true)} />}
        actions={<span className="sm:hidden"><FeatureGuideButton label="Sobre o app" compact expanded={guideOpen} onOpen={() => setGuideOpen(true)} /></span>}
      />

      <AboutAppCard />

      <FeatureGuideModal
        open={guideOpen}
        onClose={() => setGuideOpen(false)}
        title="Como funciona a página Sobre o app"
        description="Use esta página para entender a plataforma, conferir a versão em uso e acessar informações importantes de atualização, privacidade e segurança."
        steps={ABOUT_APP_GUIDE_STEPS}
        note="A versão e o código exibidos aqui são úteis ao falar com o suporte, especialmente quando você precisa relatar um comportamento específico do aplicativo."
        supportHref={ABOUT_APP_SUPPORT_HREF}
      />
    </div>
  );
}
