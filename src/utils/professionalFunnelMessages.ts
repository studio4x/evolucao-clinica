export type ProfessionalFunnelMessageStage =
  | 'registered'
  | 'whatsapp_verified'
  | 'onboarding_choice'
  | 'first_patient'
  | 'linked_record'
  | 'first_evolution'
  | 'returned'
  | 'paid';

export type ProfessionalFunnelMessageCommercialStatus =
  | 'paid'
  | 'courtesy'
  | 'trial_active'
  | 'trial_expired'
  | 'no_plan';

export type ProfessionalFunnelMessage = {
  subject: string;
  preheader: string;
  paragraphs: string[];
  actionLabel: string;
  actionPath: string;
  whatsappText: string;
};

const APP_ORIGIN = 'https://www.evolucaoclinica.app.br';

const firstNameFrom = (fullName: string) => {
  const firstName = String(fullName || '').trim().split(/\s+/)[0];
  return firstName || 'profissional';
};

const joinWhatsAppMessage = (firstName: string, paragraphs: string[], actionLabel: string, actionPath: string) => [
  `Olá, ${firstName}! Tudo bem?`,
  '',
  ...paragraphs,
  '',
  `${actionLabel}: ${APP_ORIGIN}${actionPath}`,
  '',
  'Se precisar de ajuda, estou à disposição.',
].join('\n');

export function buildProfessionalFunnelMessage(input: {
  fullName: string;
  stage: ProfessionalFunnelMessageStage;
  commercialStatus: ProfessionalFunnelMessageCommercialStatus;
}): ProfessionalFunnelMessage {
  const firstName = firstNameFrom(input.fullName);
  let subject: string;
  let preheader: string;
  let paragraphs: string[];
  let actionLabel: string;
  let actionPath: string;

  switch (input.stage) {
    case 'registered':
      subject = 'Vamos concluir seu acesso à Evolução Clínica?';
      preheader = 'Falta apenas validar seu WhatsApp para avançar.';
      paragraphs = [
        'Seu cadastro na Evolução Clínica já foi criado.',
        'Falta apenas confirmar seu WhatsApp para liberar o próximo passo e começar a conhecer a plataforma. Essa confirmação leva menos de um minuto.',
      ];
      actionLabel = 'Continuar configuração';
      actionPath = '/onboarding';
      break;
    case 'whatsapp_verified':
      subject = 'Escolha como quer começar na Evolução Clínica';
      preheader = 'Seu WhatsApp já está verificado. Agora escolha o melhor caminho.';
      paragraphs = [
        'Seu WhatsApp já foi confirmado e o próximo passo está disponível.',
        'Você pode configurar a plataforma com ajuda, passo a passo, ou conhecer o aplicativo primeiro e concluir a configuração depois.',
      ];
      actionLabel = 'Escolher como começar';
      actionPath = '/onboarding';
      break;
    case 'onboarding_choice':
      subject = 'Cadastre seu primeiro paciente na Evolução Clínica';
      preheader = 'O primeiro cadastro deixa sua rotina pronta para evoluir.';
      paragraphs = [
        'Você já escolheu como quer conhecer a plataforma. Agora é hora de cadastrar seu primeiro paciente.',
        'Com esse cadastro, você poderá organizar o prontuário e preparar sua primeira evolução clínica com mais agilidade.',
      ];
      actionLabel = 'Cadastrar primeiro paciente';
      actionPath = '/painel/patients/new?onboarding=1';
      break;
    case 'first_patient':
      subject = 'Conecte o prontuário do seu primeiro paciente';
      preheader = 'Vincule o Google Docs para manter o prontuário organizado.';
      paragraphs = [
        'Seu primeiro paciente já está cadastrado. O próximo passo é vincular o prontuário ao Google Docs.',
        'Assim, as evoluções concluídas poderão ser organizadas automaticamente no documento do paciente.',
      ];
      actionLabel = 'Vincular prontuário';
      actionPath = '/painel/patients';
      break;
    case 'linked_record':
      subject = 'Sua primeira evolução está a um passo';
      preheader = 'O prontuário está conectado e pronto para receber a evolução.';
      paragraphs = [
        'Você já cadastrou um paciente e vinculou o prontuário. Agora falta experimentar o principal fluxo da Evolução Clínica.',
        'Abra o paciente, registre a evolução e deixe a plataforma organizar o texto no prontuário conectado.',
      ];
      actionLabel = 'Criar primeira evolução';
      actionPath = '/painel/patients';
      break;
    case 'first_evolution':
      subject = 'Sua primeira evolução foi concluída';
      preheader = 'Continue usando a plataforma em seus próximos atendimentos.';
      paragraphs = [
        'Parabéns: sua primeira evolução já foi concluída na Evolução Clínica.',
        'Volte no próximo atendimento para consolidar sua rotina e aproveitar melhor o histórico, os prontuários e a organização do dia a dia.',
      ];
      actionLabel = 'Voltar ao aplicativo';
      actionPath = '/painel/dashboard';
      break;
    case 'returned':
      if (input.commercialStatus === 'courtesy') {
        subject = 'Continue aproveitando a Evolução Clínica';
        preheader = 'Sua rotina já está em andamento na plataforma.';
        paragraphs = [
          'Você já utilizou a Evolução Clínica em diferentes dias e avançou pelos principais recursos.',
          'Continue registrando seus atendimentos para manter prontuários e evoluções organizados em um só lugar.',
        ];
        actionLabel = 'Continuar usando';
        actionPath = '/painel/dashboard';
      } else if (input.commercialStatus === 'trial_expired') {
        subject = 'Seu progresso continua salvo na Evolução Clínica';
        preheader = 'Escolha um plano para retomar o acesso completo.';
        paragraphs = [
          'Você já conheceu os principais recursos da Evolução Clínica e todo o seu progresso continua salvo.',
          'Para retomar o acesso completo e continuar organizando seus atendimentos, escolha o plano que melhor combina com sua rotina.',
        ];
        actionLabel = 'Conhecer os planos';
        actionPath = '/painel/subscription';
      } else {
        subject = 'Você já avançou na Evolução Clínica';
        preheader = 'Garanta a continuidade da sua rotina na plataforma.';
        paragraphs = [
          'Você já voltou à plataforma e conheceu os principais recursos na prática.',
          'Conheça os planos disponíveis para manter prontuários, evoluções e sua rotina profissional sempre organizados.',
        ];
        actionLabel = 'Conhecer os planos';
        actionPath = '/painel/subscription';
      }
      break;
    case 'paid':
      subject = 'Seu plano está ativo na Evolução Clínica';
      preheader = 'Continue aproveitando todos os recursos da plataforma.';
      paragraphs = [
        'Seu plano está ativo e sua conta está pronta para continuar acompanhando seus atendimentos.',
        'Conte com a Evolução Clínica para organizar pacientes, prontuários e evoluções. Se precisar, nosso suporte está disponível dentro do aplicativo.',
      ];
      actionLabel = 'Acessar a plataforma';
      actionPath = '/painel/dashboard';
      break;
    default: {
      const unreachable: never = input.stage;
      throw new Error(`Etapa de funil não suportada: ${unreachable}`);
    }
  }

  if (input.commercialStatus === 'trial_expired' && input.stage !== 'paid') {
    const nextGoal: Record<Exclude<ProfessionalFunnelMessageStage, 'paid'>, string> = {
      registered: 'concluir a configuração da conta',
      whatsapp_verified: 'escolher como começar',
      onboarding_choice: 'cadastrar seu primeiro paciente',
      first_patient: 'vincular seu primeiro prontuário',
      linked_record: 'concluir sua primeira evolução',
      first_evolution: 'continuar usando a plataforma nos próximos atendimentos',
      returned: 'continuar organizando sua rotina profissional',
    };
    preheader = 'Seu período de teste terminou, mas todo o progresso continua salvo.';
    paragraphs = [
      paragraphs[0],
      `Seu período de teste terminou, mas todo o seu progresso continua salvo. Para ${nextGoal[input.stage]}, escolha um plano e retome o acesso completo.`,
    ];
    actionLabel = 'Retomar acesso';
    actionPath = '/painel/subscription';
  }

  return {
    subject,
    preheader,
    paragraphs,
    actionLabel,
    actionPath,
    whatsappText: joinWhatsAppMessage(firstName, paragraphs, actionLabel, actionPath),
  };
}

export function buildProfessionalWhatsAppUrl(phoneNumber: string, message: string) {
  const normalizedPhone = String(phoneNumber || '').replace(/\D/g, '');
  if (normalizedPhone.length < 8 || normalizedPhone.length > 15) return null;
  return `https://wa.me/${normalizedPhone}?text=${encodeURIComponent(message)}`;
}
